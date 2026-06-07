package worker

import (
	"context"
	"fmt"
	"io"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/storage"
)

func TestBillingLifecycleWorker_ClaimDue_NoDoubleClaimUnderConcurrency(t *testing.T) {
	pool := getWorkerTestPool(t)
	ctx := context.Background()

	wsID, ownerID := seedBillingLifecycleWorkspace(t, ctx, pool, "claim")
	wantIDs := make([]uuid.UUID, 0, 24)
	for i := 0; i < 24; i++ {
		var id uuid.UUID
		require.NoError(t, pool.QueryRow(ctx, `
			INSERT INTO billing_lifecycle_jobs (
			    job_type, target_type, target_id, workspace_id, user_id, due_at, status
			)
			VALUES ('renewal_reminder', 'workspace', $1, $1, $2, now() - interval '1 minute', 'pending')
			RETURNING id`,
			wsID, ownerID,
		).Scan(&id))
		wantIDs = append(wantIDs, id)
	}

	w := NewBillingLifecycleWorker(pool, nil, "https://app.rawdrive.test")
	counts := drainConcurrently(t, 4, func() ([]uuid.UUID, error) {
		jobs, err := w.claimDue(ctx, 5)
		if err != nil {
			return nil, err
		}
		ids := make([]uuid.UUID, len(jobs))
		for i, job := range jobs {
			ids[i] = job.id
		}
		return ids, nil
	})

	assertClaimedExactlyOnce(t, counts, wantIDs)
}

func TestBillingLifecycleWorker_SendNoticeCreatesLegalProof(t *testing.T) {
	pool := getWorkerTestPool(t)
	ctx := context.Background()

	wsID, ownerID := seedBillingLifecycleWorkspace(t, ctx, pool, "notice")
	var jobID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO billing_lifecycle_jobs (
		    job_type, target_type, target_id, workspace_id, user_id, due_at, status
		)
		VALUES ('payment_success', 'workspace', $1, $1, $2, now() - interval '1 minute', 'pending')
		RETURNING id`,
		wsID, ownerID,
	).Scan(&jobID))

	sender := &recordingBillingSender{}
	w := NewBillingLifecycleWorker(pool, sender, "https://app.rawdrive.test")
	jobs, err := w.claimDue(ctx, 1)
	require.NoError(t, err)
	require.Len(t, jobs, 1)
	require.NoError(t, w.processJob(ctx, jobs[0]))

	require.Equal(t, 1, sender.calls)
	require.Contains(t, sender.to, "billing-notice-")
	require.Contains(t, sender.to, "@example.test")
	require.Contains(t, sender.body, "catalog snapshot")

	var status, proofStatus, bodyHash string
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT j.status, p.status, p.body_sha256
		FROM billing_lifecycle_jobs j
		JOIN billing_notification_proofs p ON p.lifecycle_job_id = j.id
		WHERE j.id = $1`,
		jobID,
	).Scan(&status, &proofStatus, &bodyHash))
	require.Equal(t, "completed", status)
	require.Equal(t, "sent", proofStatus)
	require.NotEmpty(t, bodyHash)
}

func TestBillingLifecycleWorker_GalleryDeleteRequiresStoredNoticeProof(t *testing.T) {
	pool := getWorkerTestPool(t)
	ctx := context.Background()

	wsID, ownerID := seedBillingLifecycleWorkspace(t, ctx, pool, "delete")
	var galleryID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO galleries (workspace_id, title, slug, is_published, status, created_at, updated_at)
		VALUES ($1, 'Lifecycle Delete Gallery', $2, true, 'shared', now(), now())
		RETURNING id`,
		wsID, "lifecycle-delete-"+uuid.NewString(),
	).Scan(&galleryID))
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM galleries WHERE id = $1`, galleryID)
	})

	require.NoError(t, seedDeletionWarningProof(ctx, pool, wsID, ownerID, "gallery", galleryID))

	var jobID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO billing_lifecycle_jobs (
		    job_type, target_type, target_id, workspace_id, user_id, due_at, status
		)
		VALUES ('gallery_delete', 'gallery', $1, $2, $3, now() - interval '1 minute', 'pending')
		RETURNING id`,
		galleryID, wsID, ownerID,
	).Scan(&jobID))

	w := NewBillingLifecycleWorker(pool, nil, "https://app.rawdrive.test")
	jobs, err := w.claimDue(ctx, 1)
	require.NoError(t, err)
	require.Len(t, jobs, 1)
	require.NoError(t, w.processJob(ctx, jobs[0]))

	var jobStatus, galleryStatus string
	var deleted bool
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT j.status, g.status, g.deleted_at IS NOT NULL
		FROM billing_lifecycle_jobs j, galleries g
		WHERE j.id = $1 AND g.id = $2`,
		jobID, galleryID,
	).Scan(&jobStatus, &galleryStatus, &deleted))
	require.Equal(t, "completed", jobStatus)
	require.Equal(t, "deleted", galleryStatus)
	require.True(t, deleted)
}

func TestBillingLifecycleWorker_GalleryDeleteRemovesOriginalAndDerivativeStorage(t *testing.T) {
	pool := getWorkerTestPool(t)
	ctx := context.Background()

	wsID, ownerID := seedBillingLifecycleWorkspace(t, ctx, pool, "storage-delete")
	var galleryID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO galleries (workspace_id, title, slug, is_published, status, created_at, updated_at)
		VALUES ($1, 'Lifecycle Storage Gallery', $2, true, 'shared', now(), now())
		RETURNING id`,
		wsID, "lifecycle-storage-"+uuid.NewString(),
	).Scan(&galleryID))
	var assetID uuid.UUID
	originalKey := "originals/" + uuid.NewString() + ".jpg"
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO assets (workspace_id, filename, content_type, size_bytes, storage_key, status, created_at, updated_at)
		VALUES ($1, 'event.jpg', 'image/jpeg', 1024, $2, 'ready', now(), now())
		RETURNING id`,
		wsID, originalKey,
	).Scan(&assetID))
	derivativeKey := "derivatives/" + uuid.NewString() + ".webp"
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO asset_derivatives (asset_id, variant, storage_key, width, height, size_bytes, format)
		VALUES ($1, 'display_webp', $2, 1200, 800, 256, 'webp')
		RETURNING id`,
		assetID, derivativeKey,
	).Scan(new(uuid.UUID)))
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO gallery_assets (gallery_id, asset_id, sort_order)
		VALUES ($1, $2, 1)
		RETURNING id`,
		galleryID, assetID,
	).Scan(new(uuid.UUID)))
	productID := uuid.New()
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO gallery_products (id, gallery_id, workspace_id, name, asset_id)
		VALUES ($1, $2, $3, 'Featured print', $4)
		RETURNING id`,
		productID, galleryID, wsID, assetID,
	).Scan(new(uuid.UUID)))
	burstID := uuid.New()
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO burst_groups (id, gallery_id, name, best_pick_id)
		VALUES ($1, $2, 'Event burst', $3)
		RETURNING id`,
		burstID, galleryID, assetID,
	).Scan(new(uuid.UUID)))
	require.NoError(t, seedDeletionWarningProof(ctx, pool, wsID, ownerID, "gallery", galleryID))

	var jobID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO billing_lifecycle_jobs (
		    job_type, target_type, target_id, workspace_id, user_id, due_at, status
		)
		VALUES ('gallery_delete', 'gallery', $1, $2, $3, now() - interval '1 minute', 'pending')
		RETURNING id`,
		galleryID, wsID, ownerID,
	).Scan(&jobID))

	store := &recordingStorageProvider{}
	w := NewBillingLifecycleWorker(pool, nil, "https://app.rawdrive.test").WithStorageProvider(store)
	jobs, err := w.claimDue(ctx, 1)
	require.NoError(t, err)
	require.Len(t, jobs, 1)
	require.NoError(t, w.processJob(ctx, jobs[0]))

	require.ElementsMatch(t, []string{originalKey, derivativeKey}, store.deleted)
	var assetExists bool
	require.NoError(t, pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM assets WHERE id = $1)`, assetID).Scan(&assetExists))
	require.False(t, assetExists)
	var derivativeExists bool
	require.NoError(t, pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM asset_derivatives WHERE asset_id = $1)`, assetID).Scan(&derivativeExists))
	require.False(t, derivativeExists)
	var productAssetID *uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `SELECT asset_id FROM gallery_products WHERE id = $1`, productID).Scan(&productAssetID))
	require.Nil(t, productAssetID)
	var burstPickID *uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `SELECT best_pick_id FROM burst_groups WHERE id = $1`, burstID).Scan(&burstPickID))
	require.Nil(t, burstPickID)
	var status string
	require.NoError(t, pool.QueryRow(ctx, `SELECT status FROM billing_lifecycle_jobs WHERE id = $1`, jobID).Scan(&status))
	require.Equal(t, "completed", status)
}

func TestBillingLifecycleWorker_PayPerEventCleanupSkipsConvertedWorkspace(t *testing.T) {
	pool := getWorkerTestPool(t)
	ctx := context.Background()

	wsID, ownerID := seedBillingLifecycleWorkspace(t, ctx, pool, "converted")
	var galleryID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO galleries (workspace_id, title, slug, is_published, status, created_at, updated_at)
		VALUES ($1, 'Converted Event Gallery', $2, true, 'shared', now(), now())
		RETURNING id`,
		wsID, "converted-event-"+uuid.NewString(),
	).Scan(&galleryID))
	var productVersionID uuid.UUID
	var productCode string
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT bpv.id, bpv.product_code
		  FROM billing_product_versions bpv
		  JOIN billing_products bp ON bp.code = bpv.product_code
		 WHERE bp.product_type = 'event_upload'
		 LIMIT 1`,
	).Scan(&productVersionID, &productCode))
	var orderID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO billing_orders (
		    workspace_id, user_id, order_type, target_type, target_id,
		    amount_paise, currency, provider, status, catalog_snapshot
		)
		VALUES ($1, $2, 'event_upload', 'gallery', $3, 19900, 'INR', 'manual', 'paid', '{}'::jsonb)
		RETURNING id`,
		wsID, ownerID, galleryID,
	).Scan(&orderID))
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO gallery_event_entitlements (
		    workspace_id, gallery_id, billing_order_id, billing_product_version_id,
		    product_code, quota_bytes, upload_credits, upload_window_ends_at,
		    active_ends_at, cleanup_due_at
		)
		VALUES ($1, $2, $3, $4, $5, 10737418240, 500,
		        now() - interval '1 day', now() - interval '1 day', now() - interval '1 minute')
		RETURNING id`,
		wsID, galleryID, orderID, productVersionID, productCode,
	).Scan(new(uuid.UUID)))
	require.NoError(t, seedDeletionWarningProof(ctx, pool, wsID, ownerID, "gallery", galleryID))

	var jobID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO billing_lifecycle_jobs (
		    policy_code, job_type, target_type, target_id, workspace_id, user_id, due_at, status
		)
		VALUES ('pay_per_event_default', 'gallery_delete', 'gallery', $1, $2, $3, now() - interval '1 minute', 'pending')
		RETURNING id`,
		galleryID, wsID, ownerID,
	).Scan(&jobID))

	w := NewBillingLifecycleWorker(pool, nil, "https://app.rawdrive.test")
	jobs, err := w.claimDue(ctx, 1)
	require.NoError(t, err)
	require.Len(t, jobs, 1)
	require.NoError(t, w.processJob(ctx, jobs[0]))

	var jobStatus, entitlementStatus, galleryStatus string
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT j.status, gee.status, g.status
		  FROM billing_lifecycle_jobs j
		  JOIN gallery_event_entitlements gee ON gee.gallery_id = $2
		  JOIN galleries g ON g.id = $2
		 WHERE j.id = $1`,
		jobID, galleryID,
	).Scan(&jobStatus, &entitlementStatus, &galleryStatus))
	require.Equal(t, "completed", jobStatus)
	require.Equal(t, "converted", entitlementStatus)
	require.Equal(t, "shared", galleryStatus)
}

type recordingBillingSender struct {
	mu      sync.Mutex
	calls   int
	to      string
	subject string
	body    string
	action  string
}

type recordingStorageProvider struct {
	deleted []string
}

func (s *recordingStorageProvider) Put(context.Context, string, io.Reader, int64, string) error {
	return nil
}

func (s *recordingStorageProvider) Get(context.Context, string) (io.ReadCloser, error) {
	return io.NopCloser(strings.NewReader("")), nil
}

func (s *recordingStorageProvider) Delete(_ context.Context, key string) error {
	s.deleted = append(s.deleted, key)
	return nil
}

func (s *recordingStorageProvider) PresignURL(context.Context, string, storage.PresignOptions) (string, error) {
	return "", nil
}

func (s *recordingStorageProvider) HealthCheck() storage.HealthStatus {
	return storage.HealthStatus{Status: "ok", Driver: "recording"}
}

func (s *recordingBillingSender) Send(_ context.Context, to, subject, body, actionURL string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.calls++
	s.to = to
	s.subject = subject
	s.body = body
	s.action = actionURL
	return nil
}

func seedBillingLifecycleWorkspace(t *testing.T, ctx context.Context, pool *pgxpool.Pool, label string) (uuid.UUID, uuid.UUID) {
	t.Helper()
	stateID := seedStateID(t, ctx, pool)
	suffix := uuid.NewString()

	var ownerID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO users (email, display_name, state_id, status, created_at, updated_at)
		VALUES ($1, $2, $3, 'active', now(), now())
		RETURNING id`,
		fmt.Sprintf("billing-%s-%s@example.test", label, suffix),
		"Billing "+label,
		stateID,
	).Scan(&ownerID))

	var wsID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO workspaces (name, state_id, owner_id, plan_tier, created_at, updated_at)
		VALUES ($1, $2, $3, 'creator', now(), now())
		RETURNING id`,
		"Billing Lifecycle "+label,
		stateID,
		ownerID,
	).Scan(&wsID))

	t.Cleanup(func() {
		c := context.Background()
		_, _ = pool.Exec(c, `DELETE FROM billing_notification_proofs WHERE workspace_id = $1 OR user_id = $2`, wsID, ownerID)
		_, _ = pool.Exec(c, `DELETE FROM billing_lifecycle_jobs WHERE workspace_id = $1 OR user_id = $2`, wsID, ownerID)
		_, _ = pool.Exec(c, `DELETE FROM galleries WHERE workspace_id = $1`, wsID)
		_, _ = pool.Exec(c, `DELETE FROM workspaces WHERE id = $1`, wsID)
		_, _ = pool.Exec(c, `DELETE FROM users WHERE id = $1`, ownerID)
	})

	return wsID, ownerID
}

func seedDeletionWarningProof(ctx context.Context, pool *pgxpool.Pool, wsID, userID uuid.UUID, targetType string, targetID uuid.UUID) error {
	_, err := pool.Exec(ctx, `
		INSERT INTO billing_notification_proofs (
		    workspace_id, user_id, target_type, target_id, email_to, template_key,
		    template_version, subject, body_sha256, status, sent_at
		)
		VALUES ($1, $2, $3, $4, 'client@example.test', 'deletion_warning',
		        'test', 'Deletion warning', 'abc123', 'sent', now())`,
		wsID, userID, targetType, targetID,
	)
	return err
}
