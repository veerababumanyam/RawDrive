package worker

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

// TestWebhookDeliveryWorker_ClaimBatch_NoDoubleClaimUnderConcurrency is the
// regression guard for the webhook double-delivery race. Before the atomic
// claim, processBatch() ran a standalone SELECT ... FOR UPDATE SKIP LOCKED whose
// locks released the instant the result set drained, then marked the row only
// AFTER the HTTP POST — so a second worker (or the next tick during a slow POST)
// could re-claim and re-POST the same delivery, an externally-observable
// duplicate webhook. The atomic claimBatch() stamps claimed_at in a single
// UPDATE ... FOR UPDATE OF d SKIP LOCKED, so every delivery is claimed once.
func TestWebhookDeliveryWorker_ClaimBatch_NoDoubleClaimUnderConcurrency(t *testing.T) {
	pool := getWorkerTestPool(t)
	ctx := context.Background()

	const numDeliveries = 24
	wantIDs := seedPendingWebhookDeliveries(t, ctx, pool, numDeliveries)

	w := NewWebhookDeliveryWorker(pool)

	counts := drainConcurrently(t, 4, func() ([]uuid.UUID, error) {
		batch, err := w.claimBatch(ctx, 5)
		if err != nil {
			return nil, err
		}
		ids := make([]uuid.UUID, len(batch))
		for i, d := range batch {
			ids[i] = d.ID
		}
		return ids, nil
	})

	assertClaimedExactlyOnce(t, counts, wantIDs)
}

// seedPendingWebhookDeliveries creates a workspace + active webhook and `n`
// pending deliveries, returning the delivery ids. Deleting the workspace
// cascades to webhooks and webhook_deliveries.
func seedPendingWebhookDeliveries(t *testing.T, ctx context.Context, pool *pgxpool.Pool, n int) []uuid.UUID {
	t.Helper()
	stateID := seedStateID(t, ctx, pool)

	var ownerID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO users (display_name, state_id, created_at, updated_at)
		 VALUES ('Webhook Claim Owner', $1, NOW(), NOW()) RETURNING id`, stateID).Scan(&ownerID))

	var wsID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO workspaces (name, state_id, owner_id, created_at)
		 VALUES ('Webhook Claim WS', $1, $2, NOW()) RETURNING id`, stateID, ownerID).Scan(&wsID))

	var webhookID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO webhooks (workspace_id, url, secret, is_active)
		 VALUES ($1, 'https://subscriber.example.test/hook', 'shhh-secret', true) RETURNING id`,
		wsID).Scan(&webhookID))

	ids := make([]uuid.UUID, 0, n)
	for i := 0; i < n; i++ {
		var id uuid.UUID
		require.NoError(t, pool.QueryRow(ctx,
			`INSERT INTO webhook_deliveries (webhook_id, event_type, payload, status, attempt)
			 VALUES ($1, 'asset.ready', '{}'::jsonb, 'pending', 0) RETURNING id`,
			webhookID).Scan(&id))
		ids = append(ids, id)
	}

	t.Cleanup(func() {
		c := context.Background()
		// ON DELETE CASCADE: webhooks → webhook_deliveries, workspace → webhooks.
		_, _ = pool.Exec(c, `DELETE FROM workspaces WHERE id = $1`, wsID)
		_, _ = pool.Exec(c, `DELETE FROM users WHERE id = $1`, ownerID)
	})

	return ids
}
