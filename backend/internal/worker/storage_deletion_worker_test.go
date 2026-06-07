package worker

import (
	"context"
	"errors"
	"io"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/storage"
)

type recordingDeletionStore struct {
	mu       sync.Mutex
	failKeys map[string]error
	deleted  []string
}

func (s *recordingDeletionStore) Put(context.Context, string, io.Reader, int64, string) error {
	return nil
}

func (s *recordingDeletionStore) Get(context.Context, string) (io.ReadCloser, error) {
	return io.NopCloser(&emptyReader{}), nil
}

func (s *recordingDeletionStore) Delete(_ context.Context, key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.failKeys[key]; err != nil {
		return err
	}
	s.deleted = append(s.deleted, key)
	return nil
}

func (s *recordingDeletionStore) PresignURL(context.Context, string, storage.PresignOptions) (string, error) {
	return "", nil
}

func (s *recordingDeletionStore) HealthCheck() storage.HealthStatus {
	return storage.HealthStatus{Status: "ok", Driver: "recording"}
}

type emptyReader struct{}

func (*emptyReader) Read([]byte) (int, error) { return 0, io.EOF }

func TestStorageDeletionWorker_StopIsIdempotent(t *testing.T) {
	w := NewStorageDeletionWorker(nil, nil)

	require.NotPanics(t, func() {
		w.Stop()
		w.Stop()
	})
}

func TestStorageReconciliationWorker_StopIsIdempotent(t *testing.T) {
	w := NewStorageReconciliationWorker(nil)

	require.NotPanics(t, func() {
		w.Stop()
		w.Stop()
	})
}

func TestStorageDeletionBackoff(t *testing.T) {
	assert.Equal(t, time.Minute, storageDeletionBackoff(-1))
	assert.Equal(t, time.Minute, storageDeletionBackoff(0))
	assert.Equal(t, 2*time.Minute, storageDeletionBackoff(1))
	assert.Equal(t, time.Hour, storageDeletionBackoff(10))
}

func TestStorageDeletionWorker_ProcessBatchMarksDeletedAndFailed(t *testing.T) {
	pool := getWorkerTestPool(t)
	ctx := context.Background()
	wsID := seedStorageDeletionWorkspace(t, ctx, pool)
	okID := seedStorageDeletionJob(t, ctx, pool, wsID, "delete/ok.jpg")
	failID := seedStorageDeletionJob(t, ctx, pool, wsID, "delete/fail.jpg")

	store := &recordingDeletionStore{
		failKeys: map[string]error{"delete/fail.jpg": errors.New("b2 temporarily unavailable")},
	}
	w := NewStorageDeletionWorker(pool, store)

	w.processBatch(ctx)

	var okStatus string
	var okDeletedAt *time.Time
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT status, deleted_at FROM storage_deletion_jobs WHERE id = $1`,
		okID).Scan(&okStatus, &okDeletedAt))
	assert.Equal(t, "deleted", okStatus)
	assert.NotNil(t, okDeletedAt)

	var failStatus, lastError string
	var attempts int
	var nextAttemptAt time.Time
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT status, attempts, next_attempt_at, last_error
		   FROM storage_deletion_jobs
		  WHERE id = $1`,
		failID).Scan(&failStatus, &attempts, &nextAttemptAt, &lastError))
	assert.Equal(t, "failed", failStatus)
	assert.Equal(t, 1, attempts)
	assert.Contains(t, lastError, "b2 temporarily unavailable")
	assert.True(t, nextAttemptAt.After(time.Now()), "failed jobs must be scheduled for retry")
}

func seedStorageDeletionWorkspace(t *testing.T, ctx context.Context, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	stateID := seedStateID(t, ctx, pool)

	var ownerID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO users (display_name, state_id, created_at, updated_at)
		 VALUES ('Storage Deletion Owner', $1, NOW(), NOW()) RETURNING id`, stateID).Scan(&ownerID))

	var wsID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO workspaces (name, state_id, owner_id, created_at)
		 VALUES ('Storage Deletion WS', $1, $2, NOW()) RETURNING id`, stateID, ownerID).Scan(&wsID))

	t.Cleanup(func() {
		c := context.Background()
		_, _ = pool.Exec(c, `DELETE FROM workspaces WHERE id = $1`, wsID)
		_, _ = pool.Exec(c, `DELETE FROM users WHERE id = $1`, ownerID)
	})
	return wsID
}

func seedStorageDeletionJob(t *testing.T, ctx context.Context, pool *pgxpool.Pool, workspaceID uuid.UUID, key string) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO storage_deletion_jobs (workspace_id, storage_key, status, next_attempt_at)
		 VALUES ($1, $2, 'pending', now() - interval '1 minute')
		 RETURNING id`,
		workspaceID, key).Scan(&id))
	return id
}
