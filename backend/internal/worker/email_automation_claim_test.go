package worker

import (
	"context"
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

// TestEmailAutomationWorker_ClaimDue_NoDoubleClaimUnderConcurrency is the
// regression guard for the email double-send race. Before the atomic claim,
// sendDue() listed pending+due rows with a plain SELECT and only marked them
// sent AFTER the SMTP send, so two workers could read the same row and email the
// client twice. The atomic claimDue() stamps claimed_at inside a single
// UPDATE ... FOR UPDATE SKIP LOCKED, so every due event is claimed by exactly
// one worker. Four workers drain the queue concurrently; each row must be
// claimed exactly once.
func TestEmailAutomationWorker_ClaimDue_NoDoubleClaimUnderConcurrency(t *testing.T) {
	pool := getWorkerTestPool(t)
	ctx := context.Background()

	const numEvents = 24
	galleryID, wantIDs := seedDueEmailEvents(t, ctx, pool, numEvents)
	_ = galleryID

	w := NewEmailAutomationWorker(pool, nil, "https://studio.example.test")

	counts := drainConcurrently(t, 4, func() ([]uuid.UUID, error) {
		items, err := w.claimDue(ctx, 5)
		if err != nil {
			return nil, err
		}
		ids := make([]uuid.UUID, len(items))
		for i, it := range items {
			ids[i] = it.id
		}
		return ids, nil
	})

	assertClaimedExactlyOnce(t, counts, wantIDs)
}

// seedDueEmailEvents creates a workspace + published gallery and `n` pending,
// due email events, returning the gallery id and the event ids. Everything is
// cleaned up via t.Cleanup.
func seedDueEmailEvents(t *testing.T, ctx context.Context, pool *pgxpool.Pool, n int) (uuid.UUID, []uuid.UUID) {
	t.Helper()
	stateID := seedStateID(t, ctx, pool)

	var ownerID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO users (display_name, state_id, created_at, updated_at)
		 VALUES ('Email Claim Owner', $1, NOW(), NOW()) RETURNING id`, stateID).Scan(&ownerID))

	var wsID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO workspaces (name, state_id, owner_id, created_at)
		 VALUES ('Email Claim WS', $1, $2, NOW()) RETURNING id`, stateID, ownerID).Scan(&wsID))

	var galleryID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO galleries (workspace_id, title, is_published, created_at)
		 VALUES ($1, 'Email Claim Gallery', true, NOW()) RETURNING id`, wsID).Scan(&galleryID))

	ids := make([]uuid.UUID, 0, n)
	for i := 0; i < n; i++ {
		var id uuid.UUID
		require.NoError(t, pool.QueryRow(ctx,
			`INSERT INTO gallery_email_events (gallery_id, event_type, recipient, scheduled_for, status)
			 VALUES ($1, 'ready', $2, now() - interval '1 hour', 'pending') RETURNING id`,
			galleryID, fmt.Sprintf("client%d@example.test", i)).Scan(&id))
		ids = append(ids, id)
	}

	t.Cleanup(func() {
		c := context.Background()
		_, _ = pool.Exec(c, `DELETE FROM gallery_email_events WHERE gallery_id = $1`, galleryID)
		_, _ = pool.Exec(c, `DELETE FROM galleries WHERE id = $1`, galleryID)
		_, _ = pool.Exec(c, `DELETE FROM workspaces WHERE id = $1`, wsID)
		_, _ = pool.Exec(c, `DELETE FROM users WHERE id = $1`, ownerID)
	})

	return galleryID, ids
}
