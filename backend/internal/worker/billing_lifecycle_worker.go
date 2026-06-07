package worker

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/publicurl"
	"github.com/rawdrive/backend/internal/storage"
)

type billingNotificationSender interface {
	Send(ctx context.Context, to, subject, body, actionURL string) error
}

// BillingLifecycleWorker processes subscription/event expiry jobs, billing
// notices, and proof records. It uses atomic SKIP LOCKED claims so multiple API
// nodes can run it without duplicate emails or double deletion actions.
type BillingLifecycleWorker struct {
	pool          *pgxpool.Pool
	sender        billingNotificationSender
	store         storage.Provider
	publicBaseURL string
	pollInterval  time.Duration
	stopCh        chan struct{}
}

func (w *BillingLifecycleWorker) WithStorageProvider(store storage.Provider) *BillingLifecycleWorker {
	w.store = store
	return w
}

func NewBillingLifecycleWorker(pool *pgxpool.Pool, sender billingNotificationSender, publicBaseURL string) *BillingLifecycleWorker {
	return &BillingLifecycleWorker{
		pool:          pool,
		sender:        sender,
		publicBaseURL: strings.TrimRight(strings.TrimSpace(publicBaseURL), "/"),
		pollInterval:  15 * time.Minute,
		stopCh:        make(chan struct{}),
	}
}

func (w *BillingLifecycleWorker) Start(ctx context.Context) {
	log.Println("billing lifecycle worker: started")
	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()

	w.tick(ctx)
	for {
		select {
		case <-ctx.Done():
			log.Println("billing lifecycle worker: stopped (context cancelled)")
			return
		case <-w.stopCh:
			log.Println("billing lifecycle worker: stopped")
			return
		case <-ticker.C:
			w.tick(ctx)
		}
	}
}

func (w *BillingLifecycleWorker) Stop() { close(w.stopCh) }

const billingLifecycleClaimLease = 15 * time.Minute

type billingLifecycleJob struct {
	id            uuid.UUID
	policyCode    string
	jobType       string
	targetType    string
	targetID      uuid.UUID
	workspaceID   *uuid.UUID
	userID        *uuid.UUID
	dueAt         time.Time
	proofSnapshot []byte
	metadata      []byte
}

func (w *BillingLifecycleWorker) tick(ctx context.Context) {
	if w.pool == nil {
		return
	}
	jobs, err := w.claimDue(ctx, 50)
	if err != nil {
		log.Printf("billing lifecycle worker: claim due: %v", err)
		return
	}
	for _, job := range jobs {
		if err := w.processJob(ctx, job); err != nil {
			log.Printf("billing lifecycle worker: process %s %s: %v", job.jobType, job.id, err)
		}
	}
}

func (w *BillingLifecycleWorker) claimDue(ctx context.Context, limit int) ([]billingLifecycleJob, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := w.pool.Query(ctx, `
		UPDATE billing_lifecycle_jobs
		SET status = 'processing',
		    claimed_at = now(),
		    attempts = attempts + 1,
		    updated_at = now()
		WHERE id IN (
		    SELECT id FROM billing_lifecycle_jobs
		    WHERE status = 'pending'
		      AND due_at <= now()
		      AND (claimed_at IS NULL OR claimed_at < now() - make_interval(secs => $1))
		    ORDER BY due_at ASC, id ASC
		    LIMIT $2
		    FOR UPDATE SKIP LOCKED
		)
		RETURNING id, COALESCE(policy_code, ''), job_type, target_type, target_id,
		          workspace_id, user_id, due_at, proof_snapshot, metadata`,
		billingLifecycleClaimLease.Seconds(), limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []billingLifecycleJob
	for rows.Next() {
		var job billingLifecycleJob
		var workspaceID, userID pgtype.UUID
		if err := rows.Scan(
			&job.id,
			&job.policyCode,
			&job.jobType,
			&job.targetType,
			&job.targetID,
			&workspaceID,
			&userID,
			&job.dueAt,
			&job.proofSnapshot,
			&job.metadata,
		); err != nil {
			return nil, err
		}
		job.workspaceID = uuidPtrFromPgUUID(workspaceID)
		job.userID = uuidPtrFromPgUUID(userID)
		jobs = append(jobs, job)
	}
	return jobs, rows.Err()
}

func (w *BillingLifecycleWorker) processJob(ctx context.Context, job billingLifecycleJob) error {
	switch job.jobType {
	case "renewal_reminder", "payment_success", "payment_failed", "expiry_warning", "deletion_warning", "conversion_prompt", "pricing_change_notice":
		return w.sendBillingNotice(ctx, job)
	case "gallery_delete":
		return w.deleteGalleryTarget(ctx, job)
	case "account_delete":
		return w.deleteAccountTarget(ctx, job)
	case "storage_booster_expire":
		return w.expireStorageBooster(ctx, job)
	default:
		err := fmt.Errorf("unsupported lifecycle job type %q", job.jobType)
		w.markFailed(ctx, job.id, err)
		return err
	}
}

type billingRecipientContext struct {
	email         string
	displayName   string
	workspaceName string
	planTier      string
	galleryTitle  string
	gallerySlug   string
	expiresAt     *time.Time
}

func (w *BillingLifecycleWorker) recipientContext(ctx context.Context, job billingLifecycleJob) (billingRecipientContext, error) {
	var data billingRecipientContext
	err := w.pool.QueryRow(ctx, `
		WITH job_context AS (
		    SELECT $1::uuid AS workspace_id,
		           $2::uuid AS user_id,
		           $3::text AS target_type,
		           $4::uuid AS target_id
		)
		SELECT COALESCE(u.email, ''),
		       COALESCE(NULLIF(u.display_name, ''), 'RawDrive user'),
		       COALESCE(ws.name, ''),
		       COALESCE(ws.plan_tier, ''),
		       COALESCE(g.title, ''),
		       COALESCE(g.slug, ''),
		       g.expires_at
		FROM job_context j
		LEFT JOIN workspaces ws ON ws.id = j.workspace_id
		LEFT JOIN users u ON u.id = COALESCE(j.user_id, ws.owner_id)
		LEFT JOIN galleries g ON j.target_type = 'gallery' AND g.id = j.target_id`,
		uuidArg(job.workspaceID), uuidArg(job.userID), job.targetType, job.targetID,
	).Scan(
		&data.email,
		&data.displayName,
		&data.workspaceName,
		&data.planTier,
		&data.galleryTitle,
		&data.gallerySlug,
		&data.expiresAt,
	)
	return data, err
}

func (w *BillingLifecycleWorker) sendBillingNotice(ctx context.Context, job billingLifecycleJob) error {
	data, err := w.recipientContext(ctx, job)
	if err != nil {
		w.markFailed(ctx, job.id, err)
		return err
	}

	subject, body := billingNoticeMessage(job, data)
	actionURL := w.actionURL(job, data)
	templateKey := job.jobType
	templateVersion := "2026-06-06"

	status := "sent"
	var sentAt *time.Time
	var sendErr error
	if strings.TrimSpace(data.email) == "" {
		status = "suppressed"
		sendErr = fmt.Errorf("recipient email missing")
	} else if w.sender == nil {
		status = "failed"
		sendErr = fmt.Errorf("notification sender is not configured")
	} else if err := w.sender.Send(ctx, data.email, subject, body, actionURL); err != nil {
		status = "failed"
		sendErr = err
	} else {
		now := time.Now().UTC()
		sentAt = &now
	}

	if err := w.insertNotificationProof(ctx, notificationProofInput{
		job:             job,
		emailTo:         data.email,
		templateKey:     templateKey,
		templateVersion: templateVersion,
		subject:         subject,
		body:            body,
		actionURL:       actionURL,
		status:          status,
		sentAt:          sentAt,
		sendErr:         sendErr,
	}); err != nil {
		w.markFailed(ctx, job.id, err)
		return err
	}

	if sendErr != nil {
		w.markFailed(ctx, job.id, sendErr)
		return sendErr
	}
	return w.markCompleted(ctx, job.id, map[string]any{
		"email_to":     data.email,
		"template_key": templateKey,
		"status":       status,
	})
}

func billingNoticeMessage(job billingLifecycleJob, data billingRecipientContext) (string, string) {
	name := strings.TrimSpace(data.displayName)
	if name == "" {
		name = "RawDrive user"
	}
	workspace := strings.TrimSpace(data.workspaceName)
	if workspace == "" {
		workspace = "your RawDrive workspace"
	}
	gallery := strings.TrimSpace(data.galleryTitle)
	if gallery == "" {
		gallery = "your gallery"
	}
	expiry := "the configured expiry date"
	if data.expiresAt != nil {
		expiry = data.expiresAt.Format("January 2, 2006")
	}

	switch job.jobType {
	case "payment_success":
		return "RawDrive payment received",
			fmt.Sprintf("Hi %s,\n\nWe received your payment for %s. Your catalog snapshot and entitlement history have been recorded for billing proof.", name, workspace)
	case "payment_failed":
		return "RawDrive payment failed",
			fmt.Sprintf("Hi %s,\n\nWe could not complete the payment for %s. Please retry the payment to avoid expiry actions on your galleries and account.", name, workspace)
	case "renewal_reminder":
		return "Your RawDrive renewal is coming up",
			fmt.Sprintf("Hi %s,\n\nYour RawDrive plan for %s is coming up for renewal. Renew before expiry to keep galleries, storage, and client access uninterrupted.", name, workspace)
	case "expiry_warning":
		return "Your RawDrive access expires soon",
			fmt.Sprintf("Hi %s,\n\n%s is scheduled to expire on %s. Renew or extend before that date to keep access uninterrupted.", name, gallery, expiry)
	case "deletion_warning":
		return "RawDrive deletion notice",
			fmt.Sprintf("Hi %s,\n\n%s is scheduled for deletion under your current lifecycle policy. This notice has been recorded with timestamped proof for account and billing history.", name, gallery)
	case "conversion_prompt":
		return "Keep this event gallery active",
			fmt.Sprintf("Hi %s,\n\n%s can be extended or converted to a regular RawDrive subscription so your gallery and storage continue beyond the pay-per-event window.", name, gallery)
	case "pricing_change_notice":
		return "RawDrive pricing update",
			fmt.Sprintf("Hi %s,\n\nA pricing or entitlement update has been approved for %s. The update is recorded in your account history and will follow the published notice period before any price increase or entitlement reduction applies.", name, workspace)
	default:
		return "RawDrive billing notice",
			fmt.Sprintf("Hi %s,\n\nThere is an update for %s.", name, workspace)
	}
}

func (w *BillingLifecycleWorker) actionURL(job billingLifecycleJob, data billingRecipientContext) string {
	if w.publicBaseURL == "" {
		return ""
	}
	switch job.jobType {
	case "conversion_prompt":
		return w.publicBaseURL + "/pricing?convert=event"
	case "expiry_warning", "deletion_warning":
		if data.gallerySlug != "" {
			return publicurl.Gallery(w.publicBaseURL, data.gallerySlug)
		}
		return w.publicBaseURL + "/settings/plans"
	default:
		return w.publicBaseURL + "/settings/plans"
	}
}

type notificationProofInput struct {
	job             billingLifecycleJob
	emailTo         string
	templateKey     string
	templateVersion string
	subject         string
	body            string
	actionURL       string
	status          string
	sentAt          *time.Time
	sendErr         error
}

func (w *BillingLifecycleWorker) insertNotificationProof(ctx context.Context, input notificationProofInput) error {
	metadata := map[string]any{
		"action_url":  input.actionURL,
		"policy_code": input.job.policyCode,
		"job_type":    input.job.jobType,
	}
	if input.sendErr != nil {
		metadata["error"] = input.sendErr.Error()
	}
	metaJSON, err := json.Marshal(metadata)
	if err != nil {
		return err
	}
	hash := sha256.Sum256([]byte(input.body))
	_, err = w.pool.Exec(ctx, `
		INSERT INTO billing_notification_proofs (
		    lifecycle_job_id, workspace_id, user_id, target_type, target_id,
		    email_to, template_key, template_version, subject, body_sha256,
		    status, sent_at, metadata
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)`,
		input.job.id,
		uuidArg(input.job.workspaceID),
		uuidArg(input.job.userID),
		input.job.targetType,
		input.job.targetID,
		strings.TrimSpace(input.emailTo),
		input.templateKey,
		input.templateVersion,
		input.subject,
		hex.EncodeToString(hash[:]),
		input.status,
		input.sentAt,
		string(metaJSON),
	)
	return err
}

func (w *BillingLifecycleWorker) deleteGalleryTarget(ctx context.Context, job billingLifecycleJob) error {
	if !w.hasDeletionNoticeProof(ctx, job) {
		err := fmt.Errorf("deletion notice proof is missing")
		w.markFailed(ctx, job.id, err)
		return err
	}
	if skipped, err := w.skipConvertedPayPerEventCleanup(ctx, job); err != nil {
		w.markFailed(ctx, job.id, err)
		return err
	} else if skipped {
		return w.markCompleted(ctx, job.id, map[string]any{
			"skipped": "converted_to_paid_subscription",
		})
	}
	keys, err := w.storageKeysForLifecycleTarget(ctx, job)
	if err != nil {
		w.markFailed(ctx, job.id, err)
		return err
	}
	if err := w.deleteStorageKeys(ctx, keys); err != nil {
		w.markFailed(ctx, job.id, err)
		return err
	}

	var galleryCount, assetCount int64
	tx, err := w.pool.Begin(ctx)
	if err != nil {
		w.markFailed(ctx, job.id, err)
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	switch job.targetType {
	case "gallery":
		if err := clearGalleryAssetRestrictRefs(ctx, tx, job.targetID); err != nil {
			w.markFailed(ctx, job.id, err)
			return err
		}
		if _, err := tx.Exec(ctx, `
			WITH target_gallery AS (
			    SELECT id, workspace_id
			    FROM galleries
			    WHERE id = $1 AND deleted_at IS NULL
			),
			deletable_assets AS (
			    SELECT DISTINCT ga.asset_id
			    FROM gallery_assets ga
			    JOIN target_gallery tg ON tg.id = ga.gallery_id
			    WHERE NOT EXISTS (
			        SELECT 1
			        FROM gallery_assets other_ga
			        JOIN galleries other_g ON other_g.id = other_ga.gallery_id
			        WHERE other_ga.asset_id = ga.asset_id
			          AND other_ga.gallery_id <> ga.gallery_id
			          AND other_g.deleted_at IS NULL
			    )
			)
			DELETE FROM asset_derivatives
			WHERE asset_id IN (SELECT asset_id FROM deletable_assets)`,
			job.targetID,
		); err != nil {
			w.markFailed(ctx, job.id, err)
			return err
		}
		assetTag, err := tx.Exec(ctx, `
			WITH target_gallery AS (
			    SELECT id, workspace_id
			    FROM galleries
			    WHERE id = $1 AND deleted_at IS NULL
			),
			deletable_assets AS (
			    SELECT DISTINCT ga.asset_id
			    FROM gallery_assets ga
			    JOIN target_gallery tg ON tg.id = ga.gallery_id
			    WHERE NOT EXISTS (
			        SELECT 1
			        FROM gallery_assets other_ga
			        JOIN galleries other_g ON other_g.id = other_ga.gallery_id
			        WHERE other_ga.asset_id = ga.asset_id
			          AND other_ga.gallery_id <> ga.gallery_id
			          AND other_g.deleted_at IS NULL
			    )
			)
			DELETE FROM assets
			WHERE id IN (SELECT asset_id FROM deletable_assets)`,
			job.targetID,
		)
		if err != nil {
			w.markFailed(ctx, job.id, err)
			return err
		}
		assetCount = assetTag.RowsAffected()

		tag, err := tx.Exec(ctx, `
			UPDATE galleries
			SET deleted_at = now(), status = 'deleted', updated_at = now()
			WHERE id = $1 AND deleted_at IS NULL`,
			job.targetID,
		)
		if err != nil {
			w.markFailed(ctx, job.id, err)
			return err
		}
		galleryCount = tag.RowsAffected()
		if job.workspaceID != nil {
			if err := refreshWorkspaceStorageUsage(ctx, tx, *job.workspaceID); err != nil {
				w.markFailed(ctx, job.id, err)
				return err
			}
		}
	case "workspace":
		if job.workspaceID == nil {
			err := fmt.Errorf("workspace id is required for workspace gallery deletion")
			w.markFailed(ctx, job.id, err)
			return err
		}
		if err := clearWorkspaceAssetRestrictRefs(ctx, tx, *job.workspaceID); err != nil {
			w.markFailed(ctx, job.id, err)
			return err
		}
		if _, err := tx.Exec(ctx, `
			WITH target_galleries AS (
			    SELECT id
			    FROM galleries
			    WHERE workspace_id = $1 AND deleted_at IS NULL
			),
			deletable_assets AS (
			    SELECT DISTINCT ga.asset_id
			    FROM gallery_assets ga
			    JOIN target_galleries tg ON tg.id = ga.gallery_id
			    WHERE NOT EXISTS (
			        SELECT 1
			        FROM gallery_assets other_ga
			        JOIN galleries other_g ON other_g.id = other_ga.gallery_id
			        WHERE other_ga.asset_id = ga.asset_id
			          AND other_g.id NOT IN (SELECT id FROM target_galleries)
			          AND other_g.deleted_at IS NULL
			    )
			)
			DELETE FROM asset_derivatives
			WHERE asset_id IN (SELECT asset_id FROM deletable_assets)`,
			*job.workspaceID,
		); err != nil {
			w.markFailed(ctx, job.id, err)
			return err
		}
		assetTag, err := tx.Exec(ctx, `
			WITH target_galleries AS (
			    SELECT id
			    FROM galleries
			    WHERE workspace_id = $1 AND deleted_at IS NULL
			),
			deletable_assets AS (
			    SELECT DISTINCT ga.asset_id
			    FROM gallery_assets ga
			    JOIN target_galleries tg ON tg.id = ga.gallery_id
			    WHERE NOT EXISTS (
			        SELECT 1
			        FROM gallery_assets other_ga
			        JOIN galleries other_g ON other_g.id = other_ga.gallery_id
			        WHERE other_ga.asset_id = ga.asset_id
			          AND other_g.id NOT IN (SELECT id FROM target_galleries)
			          AND other_g.deleted_at IS NULL
			    )
			)
			DELETE FROM assets
			WHERE id IN (SELECT asset_id FROM deletable_assets)`,
			*job.workspaceID,
		)
		if err != nil {
			w.markFailed(ctx, job.id, err)
			return err
		}
		assetCount = assetTag.RowsAffected()

		tag, err := tx.Exec(ctx, `
			UPDATE galleries
			SET deleted_at = now(), status = 'deleted', updated_at = now()
			WHERE workspace_id = $1 AND deleted_at IS NULL`,
			*job.workspaceID,
		)
		if err != nil {
			w.markFailed(ctx, job.id, err)
			return err
		}
		galleryCount = tag.RowsAffected()
		if err := refreshWorkspaceStorageUsage(ctx, tx, *job.workspaceID); err != nil {
			w.markFailed(ctx, job.id, err)
			return err
		}
	default:
		err := fmt.Errorf("gallery_delete cannot target %s", job.targetType)
		w.markFailed(ctx, job.id, err)
		return err
	}
	if job.policyCode == "pay_per_event_default" {
		if _, err := tx.Exec(ctx, `
			UPDATE gallery_event_entitlements
			   SET status = 'cleaned',
			       cleanup_completed_at = COALESCE(cleanup_completed_at, now()),
			       updated_at = now()
			 WHERE gallery_id = $1
			   AND cleanup_completed_at IS NULL`,
			job.targetID,
		); err != nil {
			w.markFailed(ctx, job.id, err)
			return err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		w.markFailed(ctx, job.id, err)
		return err
	}
	return w.markCompleted(ctx, job.id, map[string]any{
		"galleries_deleted": galleryCount,
		"assets_deleted":    assetCount,
	})
}

func (w *BillingLifecycleWorker) deleteAccountTarget(ctx context.Context, job billingLifecycleJob) error {
	if !w.hasDeletionNoticeProof(ctx, job) {
		err := fmt.Errorf("deletion notice proof is missing")
		w.markFailed(ctx, job.id, err)
		return err
	}
	if job.workspaceID == nil {
		err := fmt.Errorf("workspace id is required for account deletion")
		w.markFailed(ctx, job.id, err)
		return err
	}
	if skipped, err := w.skipConvertedPayPerEventCleanup(ctx, job); err != nil {
		w.markFailed(ctx, job.id, err)
		return err
	} else if skipped {
		return w.markCompleted(ctx, job.id, map[string]any{
			"skipped": "converted_to_paid_subscription",
		})
	}
	keys, err := w.storageKeysForLifecycleTarget(ctx, job)
	if err != nil {
		w.markFailed(ctx, job.id, err)
		return err
	}
	if err := w.deleteStorageKeys(ctx, keys); err != nil {
		w.markFailed(ctx, job.id, err)
		return err
	}

	tx, err := w.pool.Begin(ctx)
	if err != nil {
		w.markFailed(ctx, job.id, err)
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var ownerID uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT owner_id FROM workspaces WHERE id = $1`, *job.workspaceID).Scan(&ownerID); err != nil {
		w.markFailed(ctx, job.id, err)
		return err
	}

	if err := clearWorkspaceAssetRestrictRefs(ctx, tx, *job.workspaceID); err != nil {
		w.markFailed(ctx, job.id, err)
		return err
	}

	if _, err := tx.Exec(ctx, `
		DELETE FROM asset_derivatives
		WHERE asset_id IN (
			SELECT id FROM assets WHERE workspace_id = $1
		)`,
		*job.workspaceID,
	); err != nil {
		w.markFailed(ctx, job.id, err)
		return err
	}
	assetTag, err := tx.Exec(ctx, `
		DELETE FROM assets
		WHERE workspace_id = $1`,
		*job.workspaceID,
	)
	if err != nil {
		w.markFailed(ctx, job.id, err)
		return err
	}

	galleryTag, err := tx.Exec(ctx, `
		UPDATE galleries
		SET deleted_at = now(), status = 'deleted', updated_at = now()
		WHERE workspace_id = $1 AND deleted_at IS NULL`,
		*job.workspaceID,
	)
	if err != nil {
		w.markFailed(ctx, job.id, err)
		return err
	}

	workspaceTag, err := tx.Exec(ctx, `
		UPDATE workspaces
		SET status = 'deleted', deleted_at = COALESCE(deleted_at, now()), updated_at = now()
		WHERE id = $1 AND status <> 'deleted'`,
		*job.workspaceID,
	)
	if err != nil {
		w.markFailed(ctx, job.id, err)
		return err
	}

	userTag, err := tx.Exec(ctx, `
		UPDATE users u
		SET status = 'deleted', updated_at = now()
		WHERE u.id = $1
		  AND NOT EXISTS (
		      SELECT 1 FROM workspaces w
		      WHERE w.owner_id = u.id
		        AND w.id <> $2
		        AND w.status <> 'deleted'
		        AND w.deleted_at IS NULL
		  )`,
		ownerID, *job.workspaceID,
	)
	if err != nil {
		w.markFailed(ctx, job.id, err)
		return err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE workspace_storage
		   SET used_bytes = 0,
		       derivative_bytes = 0,
		       reserved_bytes = 0,
		       updated_at = now()
		 WHERE workspace_id = $1`,
		*job.workspaceID,
	); err != nil {
		w.markFailed(ctx, job.id, err)
		return err
	}
	if job.policyCode == "pay_per_event_default" {
		if _, err := tx.Exec(ctx, `
			UPDATE gallery_event_entitlements
			   SET status = 'cleaned',
			       cleanup_completed_at = COALESCE(cleanup_completed_at, now()),
			       updated_at = now()
			 WHERE workspace_id = $1
			   AND cleanup_completed_at IS NULL`,
			*job.workspaceID,
		); err != nil {
			w.markFailed(ctx, job.id, err)
			return err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		w.markFailed(ctx, job.id, err)
		return err
	}
	return w.markCompleted(ctx, job.id, map[string]any{
		"galleries_deleted":  galleryTag.RowsAffected(),
		"assets_deleted":     assetTag.RowsAffected(),
		"workspaces_deleted": workspaceTag.RowsAffected(),
		"users_deleted":      userTag.RowsAffected(),
	})
}

func (w *BillingLifecycleWorker) expireStorageBooster(ctx context.Context, job billingLifecycleJob) error {
	tx, err := w.pool.Begin(ctx)
	if err != nil {
		w.markFailed(ctx, job.id, err)
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var workspaceID uuid.UUID
	var quotaBytes int64
	err = tx.QueryRow(ctx, `
		UPDATE workspace_storage_boosters
		SET status = 'expired', expires_at = COALESCE(expires_at, now()), updated_at = now()
		WHERE id = $1 AND status = 'active'
		RETURNING workspace_id, quota_bytes`,
		job.targetID,
	).Scan(&workspaceID, &quotaBytes)
	if err != nil {
		w.markFailed(ctx, job.id, err)
		return err
	}

	if _, err := tx.Exec(ctx, `
		UPDATE workspace_storage
		SET quota_bytes = GREATEST(0, quota_bytes - $2), updated_at = now()
		WHERE workspace_id = $1`,
		workspaceID, quotaBytes,
	); err != nil {
		w.markFailed(ctx, job.id, err)
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		w.markFailed(ctx, job.id, err)
		return err
	}
	return w.markCompleted(ctx, job.id, map[string]any{
		"workspace_id":        workspaceID.String(),
		"storage_booster_id":  job.targetID.String(),
		"quota_bytes_removed": quotaBytes,
		"safe_reduction":      true,
	})
}

func (w *BillingLifecycleWorker) skipConvertedPayPerEventCleanup(ctx context.Context, job billingLifecycleJob) (bool, error) {
	if job.policyCode != "pay_per_event_default" || job.workspaceID == nil {
		return false, nil
	}
	var converted bool
	if err := w.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			  FROM workspaces w
			 WHERE w.id = $1
			   AND COALESCE(w.status, 'active') = 'active'
			   AND COALESCE(w.plan_tier, 'free') NOT IN ('free', 'pay_per_event')
		) OR EXISTS (
			SELECT 1
			  FROM subscriptions s
			 WHERE s.workspace_id = $1
			   AND s.status = 'active'
			   AND COALESCE(s.tier_slug, '') NOT IN ('free', 'pay_per_event')
			   AND (s.expires_at IS NULL OR s.expires_at > now())
		)`,
		*job.workspaceID,
	).Scan(&converted); err != nil {
		return false, err
	}
	if !converted {
		return false, nil
	}
	if _, err := w.pool.Exec(ctx, `
		UPDATE gallery_event_entitlements
		   SET status = 'converted',
		       converted_at = COALESCE(converted_at, now()),
		       updated_at = now()
		 WHERE workspace_id = $1
		   AND converted_at IS NULL
		   AND cancelled_at IS NULL
		   AND cleanup_completed_at IS NULL`,
		*job.workspaceID,
	); err != nil {
		return false, err
	}
	_, err := w.pool.Exec(ctx, `
		UPDATE billing_lifecycle_jobs
		   SET status = 'cancelled', updated_at = now()
		 WHERE workspace_id = $1
		   AND id <> $2
		   AND status IN ('pending', 'failed')
		   AND job_type IN ('expiry_warning', 'deletion_warning', 'gallery_delete', 'account_delete', 'conversion_prompt')`,
		*job.workspaceID, job.id,
	)
	return true, err
}

func (w *BillingLifecycleWorker) storageKeysForLifecycleTarget(ctx context.Context, job billingLifecycleJob) ([]string, error) {
	switch job.targetType {
	case "gallery":
		rows, err := w.pool.Query(ctx, `
			WITH target_gallery AS (
			    SELECT id
			      FROM galleries
			     WHERE id = $1 AND deleted_at IS NULL
			),
			target_assets AS (
			    SELECT DISTINCT ga.asset_id
			      FROM gallery_assets ga
			      JOIN target_gallery tg ON tg.id = ga.gallery_id
			     WHERE NOT EXISTS (
			        SELECT 1
			          FROM gallery_assets other_ga
			          JOIN galleries other_g ON other_g.id = other_ga.gallery_id
			         WHERE other_ga.asset_id = ga.asset_id
			           AND other_ga.gallery_id <> ga.gallery_id
			           AND other_g.deleted_at IS NULL
			     )
			),
			keys AS (
			    SELECT NULLIF(a.storage_key, '') AS storage_key
			      FROM assets a
			     WHERE a.id IN (SELECT asset_id FROM target_assets)
			    UNION
			    SELECT NULLIF(ad.storage_key, '') AS storage_key
			      FROM asset_derivatives ad
			     WHERE ad.asset_id IN (SELECT asset_id FROM target_assets)
			)
			SELECT storage_key FROM keys WHERE storage_key IS NOT NULL`,
			job.targetID,
		)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		return scanStorageKeys(rows)
	case "workspace":
		if job.workspaceID == nil {
			return nil, fmt.Errorf("workspace id is required for storage cleanup")
		}
		rows, err := w.pool.Query(ctx, `
			WITH target_assets AS (
			    SELECT id
			      FROM assets
			     WHERE workspace_id = $1
			),
			keys AS (
			    SELECT NULLIF(a.storage_key, '') AS storage_key
			      FROM assets a
			     WHERE a.id IN (SELECT id FROM target_assets)
			    UNION
			    SELECT NULLIF(ad.storage_key, '') AS storage_key
			      FROM asset_derivatives ad
			     WHERE ad.asset_id IN (SELECT id FROM target_assets)
			)
			SELECT storage_key FROM keys WHERE storage_key IS NOT NULL`,
			*job.workspaceID,
		)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		return scanStorageKeys(rows)
	default:
		return nil, nil
	}
}

type storageKeyRows interface {
	Next() bool
	Scan(dest ...any) error
	Err() error
}

func scanStorageKeys(rows storageKeyRows) ([]string, error) {
	var keys []string
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, err
		}
		keys = append(keys, key)
	}
	return keys, rows.Err()
}

func (w *BillingLifecycleWorker) deleteStorageKeys(ctx context.Context, keys []string) error {
	seen := make(map[string]struct{}, len(keys))
	var unique []string
	for _, key := range keys {
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		unique = append(unique, key)
	}
	if len(unique) == 0 {
		return nil
	}
	if w.store == nil {
		return fmt.Errorf("storage provider is required for lifecycle cleanup")
	}
	for _, key := range unique {
		if err := w.store.Delete(ctx, key); err != nil {
			return fmt.Errorf("delete storage key %s: %w", key, err)
		}
	}
	return nil
}

func clearGalleryAssetRestrictRefs(ctx context.Context, tx pgx.Tx, galleryID uuid.UUID) error {
	if _, err := tx.Exec(ctx, `
		WITH target_gallery AS (
		    SELECT id
		      FROM galleries
		     WHERE id = $1 AND deleted_at IS NULL
		),
		deletable_assets AS (
		    SELECT DISTINCT ga.asset_id
		      FROM gallery_assets ga
		      JOIN target_gallery tg ON tg.id = ga.gallery_id
		     WHERE NOT EXISTS (
		        SELECT 1
		          FROM gallery_assets other_ga
		          JOIN galleries other_g ON other_g.id = other_ga.gallery_id
		         WHERE other_ga.asset_id = ga.asset_id
		           AND other_ga.gallery_id <> ga.gallery_id
		           AND other_g.deleted_at IS NULL
		    )
		)
		UPDATE gallery_products
		   SET asset_id = NULL, updated_at = now()
		 WHERE asset_id IN (SELECT asset_id FROM deletable_assets)`,
		galleryID,
	); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `
		WITH target_gallery AS (
		    SELECT id
		      FROM galleries
		     WHERE id = $1 AND deleted_at IS NULL
		),
		deletable_assets AS (
		    SELECT DISTINCT ga.asset_id
		      FROM gallery_assets ga
		      JOIN target_gallery tg ON tg.id = ga.gallery_id
		     WHERE NOT EXISTS (
		        SELECT 1
		          FROM gallery_assets other_ga
		          JOIN galleries other_g ON other_g.id = other_ga.gallery_id
		         WHERE other_ga.asset_id = ga.asset_id
		           AND other_ga.gallery_id <> ga.gallery_id
		           AND other_g.deleted_at IS NULL
		    )
		)
		UPDATE burst_groups
		   SET best_pick_id = NULL
		 WHERE best_pick_id IN (SELECT asset_id FROM deletable_assets)`,
		galleryID,
	)
	return err
}

func clearWorkspaceAssetRestrictRefs(ctx context.Context, tx pgx.Tx, workspaceID uuid.UUID) error {
	if _, err := tx.Exec(ctx, `
		UPDATE gallery_products
		   SET asset_id = NULL, updated_at = now()
		 WHERE workspace_id = $1
		   AND asset_id IN (
		       SELECT id FROM assets WHERE workspace_id = $1
		   )`,
		workspaceID,
	); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `
		UPDATE burst_groups
		   SET best_pick_id = NULL
		 WHERE gallery_id IN (
		       SELECT id FROM galleries WHERE workspace_id = $1
		   )
		   AND best_pick_id IN (
		       SELECT id FROM assets WHERE workspace_id = $1
		   )`,
		workspaceID,
	)
	return err
}

func refreshWorkspaceStorageUsage(ctx context.Context, tx pgx.Tx, workspaceID uuid.UUID) error {
	_, err := tx.Exec(ctx, `
		UPDATE workspace_storage ws
		   SET used_bytes = COALESCE((
		           SELECT SUM(a.size_bytes)
		             FROM assets a
		            WHERE a.workspace_id = $1
		              AND a.deleted_at IS NULL
		       ), 0),
		       derivative_bytes = COALESCE((
		           SELECT SUM(ad.size_bytes)
		             FROM asset_derivatives ad
		             JOIN assets a ON a.id = ad.asset_id
		            WHERE a.workspace_id = $1
		              AND a.deleted_at IS NULL
		       ), 0),
		       reserved_bytes = 0,
		       updated_at = now()
		 WHERE ws.workspace_id = $1`,
		workspaceID,
	)
	return err
}

func (w *BillingLifecycleWorker) hasDeletionNoticeProof(ctx context.Context, job billingLifecycleJob) bool {
	var exists bool
	if err := w.pool.QueryRow(ctx, `
		SELECT EXISTS (
		    SELECT 1
		    FROM billing_notification_proofs
		    WHERE template_key = 'deletion_warning'
		      AND status = 'sent'
		      AND (
		          (target_type = $1 AND target_id = $2)
		          OR ($3::uuid IS NOT NULL AND workspace_id = $3)
		      )
		)`,
		job.targetType, job.targetID, uuidArg(job.workspaceID),
	).Scan(&exists); err != nil {
		return false
	}
	return exists
}

func (w *BillingLifecycleWorker) markCompleted(ctx context.Context, id uuid.UUID, snapshot map[string]any) error {
	body, err := json.Marshal(snapshot)
	if err != nil {
		return err
	}
	_, err = w.pool.Exec(ctx, `
		UPDATE billing_lifecycle_jobs
		SET status = 'completed',
		    completed_at = now(),
		    last_error = NULL,
		    proof_snapshot = $2::jsonb,
		    updated_at = now()
		WHERE id = $1`,
		id, string(body),
	)
	return err
}

func (w *BillingLifecycleWorker) markFailed(ctx context.Context, id uuid.UUID, failure error) {
	if w.pool == nil || failure == nil {
		return
	}
	if _, err := w.pool.Exec(ctx, `
		UPDATE billing_lifecycle_jobs
		SET status = 'failed',
		    last_error = $2,
		    updated_at = now()
		WHERE id = $1`,
		id, failure.Error(),
	); err != nil {
		log.Printf("billing lifecycle worker: mark failed %s: %v", id, err)
	}
}

func uuidPtrFromPgUUID(value pgtype.UUID) *uuid.UUID {
	if !value.Valid {
		return nil
	}
	id, err := uuid.FromBytes(value.Bytes[:])
	if err != nil {
		return nil
	}
	return &id
}

func uuidArg(value *uuid.UUID) any {
	if value == nil {
		return nil
	}
	return *value
}
