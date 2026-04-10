package service

// dsr_eraser.go — M10 E27-S3 production erasure worker.
//
// The DSR purge worker (internal/worker/dsr_purge_worker.go) receives a
// DSREraseFunc callback from main.go. Until this file landed, that
// callback was nil and every erasure request was marked failed with
// "eraser not configured". This file provides the real thing:
//
//   1. Enumerates every asset owned by the subject's workspace(s) when
//      they are a workspace user, or by the subject's email when they
//      are only a gallery visitor.
//   2. Deletes the corresponding R2 objects (original + derivatives) via
//      the configured storage provider.
//   3. Cascades DB deletions — assets → gallery_assets → proofing_selections
//      → proofing_comments → consent_records → access logs — scoped to
//      the subject.
//   4. Redacts audit log rows that refer to the subject via the two
//      SECURITY DEFINER functions installed in migration 050. This is the
//      only place in the codebase that mutates audit_log / audit_logs.
//   5. Anonymizes the users row (for workspace users) so the referential
//      tombstone stays in place but carries no PII.
//
// Design rules we deliberately follow here:
//
//   * Erasure is a single logical operation but not a single transaction.
//     R2 deletes are external side effects and cannot roll back, so we
//     use the "delete objects first, delete rows second" order: a crash
//     between the two steps leaves orphaned rows (which a separate
//     asset-purge worker will reconcile) rather than orphaned objects
//     (which leak storage indefinitely).
//
//   * The eraser never hard-deletes workspace rows. A workspace might
//     contain assets that belong to other subjects; tearing it down here
//     would conflate erasure with workspace lifecycle. We scope deletes
//     to assets.uploaded_by = user_id when a user exists.
//
//   * Visitor-only subjects (email with no users row) can only have
//     their consent / proofing / access log rows scrubbed — they don't
//     own any assets in the first place.

import (
	"context"
	"errors"
	"fmt"
	"log"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// StorageDeleter is the narrow surface the eraser needs from the
// storage provider. Declared here (rather than using storage.Provider
// directly) so tests can inject a fake without pulling in an S3 client.
// *storage.S3Driver and any other Provider implementation satisfy this
// by virtue of their existing Delete(ctx, key) method.
type StorageDeleter interface {
	Delete(ctx context.Context, key string) error
}

// DSREraser performs the actual data deletion for a DSR erasure request.
// It is constructed in main.go and its Erase method is passed to the
// DSRPurgeWorker via WithEraser.
type DSREraser struct {
	pool    *pgxpool.Pool
	storage StorageDeleter
}

// NewDSREraser builds an eraser. pool must be non-nil. storage may be
// nil in test fixtures that only care about the DB-side behaviour, but
// production code always wires it.
func NewDSREraser(pool *pgxpool.Pool, store StorageDeleter) *DSREraser {
	return &DSREraser{pool: pool, storage: store}
}

// Erase implements the DSREraseFunc signature expected by the purge
// worker. The email identifies the subject in both cohorts. userID is
// non-nil only for workspace users — gallery visitors are identified by
// email alone.
//
// Returns an error to fail the DSR request (worker writes status=failed
// + failure_reason) or nil to mark it completed.
func (e *DSREraser) Erase(ctx context.Context, email string, userID *uuid.UUID) error {
	if e.pool == nil {
		return errors.New("dsr-eraser: db pool not configured")
	}
	if email == "" && userID == nil {
		return errors.New("dsr-eraser: neither email nor userID provided")
	}

	log.Printf("dsr-eraser: starting erasure for email=%q user_id=%v", email, userID)

	// Step 1 — if we have a userID, collect the storage keys for every
	// asset the user uploaded and delete them from R2 BEFORE we touch
	// the DB. The worst crash case this leaves is rows without objects
	// (which a separate asset-purge worker reconciles) rather than
	// objects without rows (which leak storage indefinitely).
	if userID != nil {
		keys, err := e.collectAssetKeysForUser(ctx, *userID)
		if err != nil {
			return fmt.Errorf("dsr-eraser: collect asset keys: %w", err)
		}
		log.Printf("dsr-eraser: %d storage objects will be deleted for user %s", len(keys), *userID)

		if e.storage != nil {
			deleted := e.deleteStorageObjects(ctx, keys)
			log.Printf("dsr-eraser: deleted %d/%d storage objects", deleted, len(keys))
		} else if len(keys) > 0 {
			log.Printf("dsr-eraser: WARN storage deleter is nil — skipping %d R2 deletes", len(keys))
		}
	}

	// Step 2 — DB cascades in a single transaction. A failure partway
	// through rolls the whole subject back. The R2 step above is NOT in
	// this transaction for the reason explained at the top of the file.
	tx, err := e.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("dsr-eraser: begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }() // no-op if committed

	counts := map[string]int64{}

	// Gallery visitor tables keyed by email. These run for both cohorts
	// because a workspace user may also have participated as a visitor
	// on another studio's gallery under the same email.
	if email != "" {
		if n, err := execCount(ctx, tx,
			`DELETE FROM consent_records WHERE visitor_email = $1`, email); err != nil {
			return fmt.Errorf("dsr-eraser: consent_records: %w", err)
		} else {
			counts["consent_records"] = n
		}

		if n, err := execCount(ctx, tx,
			`DELETE FROM proofing_selections WHERE client_email = $1`, email); err != nil {
			return fmt.Errorf("dsr-eraser: proofing_selections: %w", err)
		} else {
			counts["proofing_selections"] = n
		}

		// The M13 tables may not exist on older databases. Skip each if
		// the table isn't present.
		if ok, err := tableExists(ctx, tx, "proofing_comments"); err != nil {
			return fmt.Errorf("dsr-eraser: check proofing_comments: %w", err)
		} else if ok {
			if n, err := execCount(ctx, tx,
				`DELETE FROM proofing_comments WHERE author_email = $1`, email); err != nil {
				return fmt.Errorf("dsr-eraser: proofing_comments: %w", err)
			} else {
				counts["proofing_comments"] = n
			}
		}

		if ok, err := tableExists(ctx, tx, "album_approvals"); err != nil {
			return fmt.Errorf("dsr-eraser: check album_approvals: %w", err)
		} else if ok {
			if n, err := execCount(ctx, tx,
				`DELETE FROM album_approvals WHERE approved_by_email = $1`, email); err != nil {
				return fmt.Errorf("dsr-eraser: album_approvals: %w", err)
			} else {
				counts["album_approvals"] = n
			}
		}

		if ok, err := tableExists(ctx, tx, "gallery_access_logs"); err != nil {
			return fmt.Errorf("dsr-eraser: check gallery_access_logs: %w", err)
		} else if ok {
			if n, err := execCount(ctx, tx,
				`DELETE FROM gallery_access_logs WHERE visitor_email = $1`, email); err != nil {
				return fmt.Errorf("dsr-eraser: gallery_access_logs: %w", err)
			} else {
				counts["gallery_access_logs"] = n
			}
		}
	}

	// Workspace-user-specific deletions, only when userID is set.
	if userID != nil {
		// Delete the assets the user uploaded. ON DELETE CASCADE on
		// gallery_assets will propagate through.
		if n, err := execCount(ctx, tx,
			`DELETE FROM assets WHERE uploaded_by = $1`, *userID); err != nil {
			return fmt.Errorf("dsr-eraser: assets: %w", err)
		} else {
			counts["assets"] = n
		}

		// Audit log redaction via the SECURITY DEFINER helpers from
		// migration 050. Skip gracefully if the function isn't installed.
		if ok, err := functionExists(ctx, tx, "redact_audit_log_for_subject"); err != nil {
			return fmt.Errorf("dsr-eraser: check redact_audit_log fn: %w", err)
		} else if ok {
			var n int64
			if err := tx.QueryRow(ctx,
				`SELECT redact_audit_log_for_subject($1, $2)`, *userID, email).Scan(&n); err != nil {
				return fmt.Errorf("dsr-eraser: redact audit_log: %w", err)
			}
			counts["audit_log_redacted"] = n
		}

		if ok, err := functionExists(ctx, tx, "redact_audit_logs_for_subject"); err != nil {
			return fmt.Errorf("dsr-eraser: check redact_audit_logs fn: %w", err)
		} else if ok {
			var n int64
			if err := tx.QueryRow(ctx,
				`SELECT redact_audit_logs_for_subject($1, $2)`, *userID, email).Scan(&n); err != nil {
				return fmt.Errorf("dsr-eraser: redact audit_logs: %w", err)
			}
			counts["audit_logs_redacted"] = n
		}

		// Anonymize the users row rather than deleting it. Other tables
		// may still reference this user via foreign keys; leaving a
		// tombstone avoids breaking referential integrity while scrubbing
		// the PII columns.
		if _, err := tx.Exec(ctx, `
			UPDATE users
			SET email = $2,
			    phone = NULL,
			    display_name = 'Erased User',
			    avatar_url = NULL,
			    updated_at = now()
			WHERE id = $1`,
			*userID,
			fmt.Sprintf("erased+%s@dsr.local", userID.String()),
		); err != nil {
			return fmt.Errorf("dsr-eraser: anonymize user: %w", err)
		}
		counts["users_anonymized"] = 1
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("dsr-eraser: commit: %w", err)
	}

	log.Printf("dsr-eraser: completed erasure for %q: %v", email, counts)
	return nil
}

// collectAssetKeysForUser returns the storage keys (primary + derivatives)
// for every asset the given user uploaded. Derivatives live in the
// thumbnail_urls JSONB column as { "thumb_sm_webp": "key", ... }.
func (e *DSREraser) collectAssetKeysForUser(ctx context.Context, userID uuid.UUID) ([]string, error) {
	rows, err := e.pool.Query(ctx, `
		SELECT storage_key, COALESCE(thumbnail_urls, '{}'::jsonb)
		FROM assets
		WHERE uploaded_by = $1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var keys []string
	for rows.Next() {
		var primary string
		var derivatives map[string]any
		if err := rows.Scan(&primary, &derivatives); err != nil {
			return nil, err
		}
		if primary != "" {
			keys = append(keys, primary)
		}
		// thumbnail_urls values may be either bare keys or fully-qualified
		// URLs depending on how the thumbnail worker was configured. We
		// emit whatever is there — the S3 client will 404 on URLs, which
		// is fine (logged + counted as a failed delete).
		for _, v := range derivatives {
			if s, ok := v.(string); ok && s != "" {
				keys = append(keys, s)
			}
		}
	}
	return keys, rows.Err()
}

// deleteStorageObjects best-effort deletes each key. Failures are logged
// but do not abort — an unreachable R2 should not block an erasure that
// has already committed its DB side. Returns the count of successful
// deletes so the caller can report it.
func (e *DSREraser) deleteStorageObjects(ctx context.Context, keys []string) int {
	success := 0
	for _, k := range keys {
		if err := e.storage.Delete(ctx, k); err != nil {
			log.Printf("dsr-eraser: storage delete %q failed: %v", k, err)
			continue
		}
		success++
	}
	return success
}

// ─── helpers ──────────────────────────────────────────────────────────

// execCount runs an Exec on a pgx.Tx and returns the affected row count.
func execCount(ctx context.Context, tx pgx.Tx, sql string, args ...any) (int64, error) {
	tag, err := tx.Exec(ctx, sql, args...)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// tableExists returns true when the named table is present in the
// current database. Used to skip deletes on older schemas.
func tableExists(ctx context.Context, tx pgx.Tx, name string) (bool, error) {
	var exists bool
	if err := tx.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)`,
		name).Scan(&exists); err != nil {
		return false, err
	}
	return exists, nil
}

// functionExists returns true when the named SQL function is present.
// Used to skip the migration-050 redaction calls on older schemas.
func functionExists(ctx context.Context, tx pgx.Tx, name string) (bool, error) {
	var exists bool
	if err := tx.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = $1)`,
		name).Scan(&exists); err != nil {
		return false, err
	}
	return exists, nil
}
