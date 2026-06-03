package repository

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/tests/testsupport"
)

// Retry/failure state machine, repository layer.
//
// Migration 152 added assets.retry_count / next_retry_at / decode_format. These
// tests cover the new repo methods that drive the decode retry loop:
//
//   - ListRetryable        : never-attempted 'processing' rows + due-for-retry rows
//   - MarkTransientFailure : retry_count++, next_retry_at = now()+backoff, still 'processing'
//   - MarkTerminalFailure  : status='failed', processing_error set, next_retry_at cleared
//
// DB-backed. The pool is resolved once per package via TestMain, preferring a
// DATABASE_URL env var and falling back to the shared testsupport pgvector
// testcontainer. When neither is available (no Docker, no DATABASE_URL) the
// tests SKIP rather than fail — matching the graceful-skip convention used by
// the brownfield integration tests, so a hermetic CI run without a live DB
// still passes.

var (
	retryTestDSN     string
	retryDSNInitErr  error
	retryMainStarted bool
)

// TestMain resolves the DSN once for the repository test package. DATABASE_URL
// wins so local dev can point at the compose postgres without booting a
// testcontainer; otherwise fall back to the shared testsupport container. Any
// failure is captured into retryDSNInitErr and DB-backed tests skip rather than
// fail. Pure (no-DB) repository tests are unaffected.
func TestMain(m *testing.M) {
	retryMainStarted = true
	if envDSN := os.Getenv("DATABASE_URL"); envDSN != "" {
		retryTestDSN = envDSN
	} else {
		dsn, err := testsupport.EnsureDSN()
		if err != nil {
			retryDSNInitErr = err
			fmt.Fprintf(os.Stderr, "repository_test: no DB available: %v (db-backed tests will skip)\n", err)
		} else {
			retryTestDSN = dsn
		}
	}

	code := m.Run()
	testsupport.Shutdown()
	os.Exit(code)
}

// getRetryTestPool opens a pool to the resolved DSN. If DATABASE_URL is
// unreachable or testcontainers failed (no Docker daemon, port not accepting,
// handshake stuck), the test is skipped with a clear reason instead of failing.
func getRetryTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	if !retryMainStarted {
		t.Skip("repository_test: TestMain did not run; DSN unresolved")
	}
	if retryDSNInitErr != nil {
		t.Skipf("repository_test: no database available: %v", retryDSNInitErr)
	}
	if retryTestDSN == "" {
		t.Skip("repository_test: DATABASE_URL unset and testcontainers unavailable")
	}
	// Tight connect timeout so a hung postgres handshake surfaces as a skip in
	// ~5s rather than a 120s test-binary hang.
	cfg, err := pgxpool.ParseConfig(retryTestDSN)
	if err != nil {
		t.Skipf("repository_test: invalid DSN: %v", err)
	}
	cfg.ConnConfig.ConnectTimeout = 3 * time.Second
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Skipf("repository_test: opening pool: %v", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		t.Skipf("repository_test: postgres ping failed (container may be hung): %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

// seedRetryAsset inserts an asset directly (no gallery membership) and returns its id.
func seedRetryAsset(t *testing.T, ctx context.Context, repo *AssetRepo, workspaceID uuid.UUID, status string, retryCount int, nextRetryAt *time.Time) uuid.UUID {
	t.Helper()
	assetID := uuid.New()
	_, err := repo.Pool().Exec(ctx,
		`INSERT INTO assets (id, workspace_id, filename, content_type, size_bytes, storage_key,
		   status, retry_count, next_retry_at, created_at, updated_at)
		 VALUES ($1, $2, $3, 'image/jpeg', 1024, $4, $5, $6, $7, NOW(), NOW())`,
		assetID, workspaceID,
		"retry_"+status+"_"+uuid.NewString()+".jpg",
		"ws/"+workspaceID.String()+"/retry_"+uuid.NewString(),
		status, retryCount, nextRetryAt)
	require.NoError(t, err)
	return assetID
}

// newRetryWorkspace creates a workspace (with owner) for retry tests and cleans it up.
func newRetryWorkspace(t *testing.T, ctx context.Context, repo *AssetRepo, label string) uuid.UUID {
	t.Helper()
	pool := repo.Pool()
	var stateID int
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM states LIMIT 1`).Scan(&stateID))
	var ownerID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO users (display_name, state_id, created_at, updated_at)
		 VALUES ($1, $2, NOW(), NOW()) RETURNING id`, label+" Owner", stateID).Scan(&ownerID))
	var workspaceID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO workspaces (name, state_id, owner_id, created_at)
		 VALUES ($1, $2, $3, NOW()) RETURNING id`, label+" Workspace", stateID, ownerID).Scan(&workspaceID))
	t.Cleanup(func() {
		c := context.Background()
		_, _ = pool.Exec(c, `DELETE FROM assets WHERE workspace_id = $1`, workspaceID)
		_, _ = pool.Exec(c, `DELETE FROM workspaces WHERE id = $1`, workspaceID)
		_, _ = pool.Exec(c, `DELETE FROM users WHERE id = $1`, ownerID)
	})
	return workspaceID
}

func TestListRetryable_IncludesNeverAttemptedAndDue_ExcludesFutureFailedExhausted(t *testing.T) {
	pool := getRetryTestPool(t)
	repo := NewAssetRepo(pool)
	ctx := context.Background()
	ws := newRetryWorkspace(t, ctx, repo, "Retry ListRetryable")

	now := time.Now()
	past := now.Add(-1 * time.Minute)
	future := now.Add(10 * time.Minute)

	// (a) never-attempted: processing, retry_count 0, next_retry_at NULL → eligible.
	neverAttempted := seedRetryAsset(t, ctx, repo, ws, "processing", 0, nil)
	// (b) due-for-retry: processing, retry_count 1, next_retry_at in the past → eligible.
	due := seedRetryAsset(t, ctx, repo, ws, "processing", 1, &past)
	// (c) backing off: processing, next_retry_at in the future → NOT yet eligible.
	backingOff := seedRetryAsset(t, ctx, repo, ws, "processing", 2, &future)
	// (d) exhausted: processing, retry_count at the cap, due → NOT eligible (cap reached).
	exhausted := seedRetryAsset(t, ctx, repo, ws, "processing", MaxDecodeRetries, &past)
	// (e) terminal failed: status='failed' → never eligible regardless of timing.
	failed := seedRetryAsset(t, ctx, repo, ws, "failed", 1, &past)

	rows, err := repo.ListRetryable(ctx, 50)
	require.NoError(t, err)

	got := map[uuid.UUID]bool{}
	for _, a := range rows {
		got[a.ID] = true
	}

	assert.True(t, got[neverAttempted], "never-attempted processing row must be retryable")
	assert.True(t, got[due], "due-for-retry processing row must be retryable")
	assert.False(t, got[backingOff], "row still in its backoff window must NOT be retryable")
	assert.False(t, got[exhausted], "row at the retry cap must NOT be retryable")
	assert.False(t, got[failed], "terminal failed row must NOT be retryable")
}

func TestListRetryable_RespectsLimit(t *testing.T) {
	pool := getRetryTestPool(t)
	repo := NewAssetRepo(pool)
	ctx := context.Background()
	ws := newRetryWorkspace(t, ctx, repo, "Retry Limit")

	for i := 0; i < 5; i++ {
		seedRetryAsset(t, ctx, repo, ws, "processing", 0, nil)
	}
	rows, err := repo.ListRetryable(ctx, 3)
	require.NoError(t, err)
	assert.LessOrEqual(t, len(rows), 3, "ListRetryable must honor the limit")
}

func TestGetRetryCount_ReturnsCurrentCount(t *testing.T) {
	pool := getRetryTestPool(t)
	repo := NewAssetRepo(pool)
	ctx := context.Background()
	ws := newRetryWorkspace(t, ctx, repo, "Retry GetCount")

	id := seedRetryAsset(t, ctx, repo, ws, "processing", 3, nil)
	count, err := repo.GetRetryCount(ctx, id)
	require.NoError(t, err)
	assert.Equal(t, 3, count, "GetRetryCount must return the persisted retry_count")

	_, err = repo.GetRetryCount(ctx, uuid.New())
	assert.Error(t, err, "GetRetryCount must error for a missing asset")
}

func TestMarkTransientFailure_IncrementsRetryAndSchedulesBackoff(t *testing.T) {
	pool := getRetryTestPool(t)
	repo := NewAssetRepo(pool)
	ctx := context.Background()
	ws := newRetryWorkspace(t, ctx, repo, "Retry Transient")

	id := seedRetryAsset(t, ctx, repo, ws, "processing", 0, nil)

	before := time.Now()
	require.NoError(t, repo.MarkTransientFailure(ctx, id, "object store timeout"))

	var status string
	var retryCount int
	var nextRetryAt *time.Time
	var procErr *string
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT status, retry_count, next_retry_at, processing_error FROM assets WHERE id = $1`, id).
		Scan(&status, &retryCount, &nextRetryAt, &procErr))

	assert.Equal(t, "processing", status, "transient failure keeps the asset in processing for re-pickup")
	assert.Equal(t, 1, retryCount, "transient failure increments retry_count")
	require.NotNil(t, nextRetryAt, "transient failure must schedule next_retry_at")
	assert.True(t, nextRetryAt.After(before), "next_retry_at must be scheduled in the future (backoff)")
	require.NotNil(t, procErr)
	assert.Equal(t, "object store timeout", *procErr, "transient failure records the reason")
}

func TestMarkTransientFailure_BackoffGrowsWithRetryCount(t *testing.T) {
	pool := getRetryTestPool(t)
	repo := NewAssetRepo(pool)
	ctx := context.Background()
	ws := newRetryWorkspace(t, ctx, repo, "Retry Backoff")

	// First failure from retry_count 0 → schedules a short delay.
	idEarly := seedRetryAsset(t, ctx, repo, ws, "processing", 0, nil)
	require.NoError(t, repo.MarkTransientFailure(ctx, idEarly, "boom"))
	var earlyNext time.Time
	require.NoError(t, pool.QueryRow(ctx, `SELECT next_retry_at FROM assets WHERE id = $1`, idEarly).Scan(&earlyNext))

	// A later failure (retry_count already 3) → schedules a longer delay.
	idLate := seedRetryAsset(t, ctx, repo, ws, "processing", 3, nil)
	require.NoError(t, repo.MarkTransientFailure(ctx, idLate, "boom"))
	var lateNext time.Time
	require.NoError(t, pool.QueryRow(ctx, `SELECT next_retry_at FROM assets WHERE id = $1`, idLate).Scan(&lateNext))

	assert.True(t, lateNext.After(earlyNext),
		"exponential backoff: a higher retry_count must schedule a later next_retry_at (early=%s late=%s)",
		earlyNext, lateNext)
}

func TestMarkTerminalFailure_SetsFailedAndClearsSchedule(t *testing.T) {
	pool := getRetryTestPool(t)
	repo := NewAssetRepo(pool)
	ctx := context.Background()
	ws := newRetryWorkspace(t, ctx, repo, "Retry Terminal")

	future := time.Now().Add(5 * time.Minute)
	id := seedRetryAsset(t, ctx, repo, ws, "processing", 2, &future)

	require.NoError(t, repo.MarkTerminalFailure(ctx, id, "unsupported image format \"xyz\""))

	var status string
	var nextRetryAt *time.Time
	var procErr *string
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT status, next_retry_at, processing_error FROM assets WHERE id = $1`, id).
		Scan(&status, &nextRetryAt, &procErr))

	assert.Equal(t, "failed", status, "terminal failure marks the asset failed")
	assert.Nil(t, nextRetryAt, "terminal failure clears next_retry_at — no more retries")
	require.NotNil(t, procErr)
	assert.Equal(t, "unsupported image format \"xyz\"", *procErr, "terminal failure records the reason")
}

// TestCreate_PersistsDecodeFormat is the FMT-1 / H5 repo-layer contract: the
// server-sniffed decode_format threaded onto the asset at upload finalize must
// survive the Create INSERT and be read back by ListRetryable (the worker's
// retry source, which SELECTs decode_format so the decoder dispatches without a
// re-sniff). Before H5 the Create statement omitted the column entirely, so the
// finalize-side value was silently dropped to NULL.
func TestCreate_PersistsDecodeFormat(t *testing.T) {
	pool := getRetryTestPool(t)
	repo := NewAssetRepo(pool)
	ctx := context.Background()
	ws := newRetryWorkspace(t, ctx, repo, "Create DecodeFormat")

	heic := "heic"
	asset := &Asset{
		ID:            uuid.New(),
		WorkspaceID:   ws,
		Filename:      "shot_" + uuid.NewString() + ".heic",
		ContentType:   "image/heic",
		SizeBytes:     2048,
		StorageKey:    "ws/" + ws.String() + "/" + uuid.NewString(),
		StorageDriver: "s3",
		Status:        "processing",
		ExifData:      map[string]interface{}{},
		ThumbnailURLs: map[string]string{},
		DecodeFormat:  &heic,
	}
	require.NoError(t, repo.Create(ctx, asset), "Create must persist a HEIC asset row")

	rows, err := repo.ListRetryable(ctx, 100)
	require.NoError(t, err)
	var found *Asset
	for i := range rows {
		if rows[i].ID == asset.ID {
			found = &rows[i]
			break
		}
	}
	require.NotNil(t, found, "the just-created processing asset must be retryable")
	require.NotNil(t, found.DecodeFormat, "decode_format must round-trip through Create + ListRetryable")
	assert.Equal(t, "heic", *found.DecodeFormat)
}

// TestCreate_NilDecodeFormatStaysNull guards the negative path: a Create with no
// decode_format (legacy / encrypted-media uploads) must persist NULL so the
// worker falls back to its own sniff rather than mis-dispatching.
func TestCreate_NilDecodeFormatStaysNull(t *testing.T) {
	pool := getRetryTestPool(t)
	repo := NewAssetRepo(pool)
	ctx := context.Background()
	ws := newRetryWorkspace(t, ctx, repo, "Create NilDecodeFormat")

	asset := &Asset{
		ID:            uuid.New(),
		WorkspaceID:   ws,
		Filename:      "legacy_" + uuid.NewString() + ".jpg",
		ContentType:   "image/jpeg",
		SizeBytes:     1024,
		StorageKey:    "ws/" + ws.String() + "/" + uuid.NewString(),
		StorageDriver: "s3",
		Status:        "processing",
		ExifData:      map[string]interface{}{},
		ThumbnailURLs: map[string]string{},
		// DecodeFormat intentionally nil.
	}
	require.NoError(t, repo.Create(ctx, asset))

	var decodeFormat *string
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT decode_format FROM assets WHERE id = $1`, asset.ID).Scan(&decodeFormat))
	assert.Nil(t, decodeFormat, "a nil DecodeFormat must persist as SQL NULL")
}

// TestRetryBackoff_PureExponentialAndCapped exercises retryBackoff without a DB.
// This always runs (no skip) so the backoff math has hermetic coverage even when
// no Postgres is available.
func TestRetryBackoff_PureExponentialAndCapped(t *testing.T) {
	assert.Equal(t, 1*time.Second, retryBackoff(0), "attempt 0 → base 1s")
	assert.Equal(t, 2*time.Second, retryBackoff(1), "attempt 1 → 2s")
	assert.Equal(t, 4*time.Second, retryBackoff(2), "attempt 2 → 4s")
	assert.Equal(t, 8*time.Second, retryBackoff(3), "attempt 3 → 8s")
	assert.Equal(t, 16*time.Second, retryBackoff(4), "attempt 4 → 16s")
	// Negative clamps to base.
	assert.Equal(t, 1*time.Second, retryBackoff(-5), "negative retry count clamps to base")
	// Large values cap at the 5-minute ceiling rather than overflowing.
	assert.Equal(t, 5*time.Minute, retryBackoff(30), "huge retry count caps at 5m, no overflow")
	assert.Equal(t, 5*time.Minute, retryBackoff(100), "shift-guard caps at 5m")
}
