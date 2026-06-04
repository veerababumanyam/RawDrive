package worker

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// TestWebhookBackoff_ExponentialCapped pins the backoff schedule (hermetic, no DB).
func TestWebhookBackoff_ExponentialCapped(t *testing.T) {
	require.Equal(t, 1*time.Minute, webhookBackoff(1), "1 attempt → base 1m")
	require.Equal(t, 2*time.Minute, webhookBackoff(2), "2 → 2m")
	require.Equal(t, 4*time.Minute, webhookBackoff(3), "3 → 4m")
	require.Equal(t, 8*time.Minute, webhookBackoff(4), "4 → 8m")
	require.Equal(t, 16*time.Minute, webhookBackoff(5), "5 → 16m")
	require.Equal(t, 1*time.Minute, webhookBackoff(0), "attempt<1 clamps to base")
	require.Equal(t, 1*time.Minute, webhookBackoff(-5), "negative clamps to base")
	require.Equal(t, 1*time.Hour, webhookBackoff(20), "shift-guard saturates at the 1h cap")
	require.Equal(t, 1*time.Hour, webhookBackoff(100), "huge attempt saturates at cap, no overflow")
}

// TestWebhookDeliveryWorker_RecordFailure_SchedulesExponentialBackoff is the
// DB-backed feature test for #43. A failed delivery must get next_attempt_at =
// now()+backoff and have its claim lease (claimed_at) cleared, and claimBatch must
// NOT re-claim it until next_attempt_at elapses — then it becomes claimable again.
func TestWebhookDeliveryWorker_RecordFailure_SchedulesExponentialBackoff(t *testing.T) {
	pool := getWorkerTestPool(t)
	ctx := context.Background()
	w := NewWebhookDeliveryWorker(pool)

	deliveryID := seedPendingWebhookDeliveries(t, ctx, pool, 1)[0]

	// Atomic claim stamps claimed_at.
	batch, err := w.claimBatch(ctx, 10)
	require.NoError(t, err)
	var claimed *WebhookDelivery
	for i := range batch {
		if batch[i].ID == deliveryID {
			claimed = &batch[i]
		}
	}
	require.NotNil(t, claimed, "the seeded delivery must be claimed")

	// Record a retryable failure → schedules an exponential retry, releases the lease.
	before := time.Now()
	w.recordFailure(ctx, *claimed, "status 500", 500)

	var status string
	var attempt int
	var nextAt, claimedAt *time.Time
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT status, attempt, next_attempt_at, claimed_at FROM webhook_deliveries WHERE id = $1`, deliveryID).
		Scan(&status, &attempt, &nextAt, &claimedAt))
	require.Equal(t, "failed", status)
	require.Equalf(t, claimed.Attempt+1, attempt, "failure increments attempt")
	require.Nil(t, claimedAt, "recordFailure clears the crash lease so next_attempt_at governs the retry")
	require.NotNil(t, nextAt, "a retryable failure schedules next_attempt_at")
	require.Truef(t, nextAt.After(before.Add(50*time.Second)),
		"next_attempt_at must be ~1m out (exponential backoff), got %s", nextAt)

	// Still inside the backoff window → must NOT be re-claimed.
	batch2, err := w.claimBatch(ctx, 10)
	require.NoError(t, err)
	for _, d := range batch2 {
		require.NotEqualf(t, deliveryID, d.ID, "a failed delivery must not be re-claimed before its backoff elapses")
	}

	// Fast-forward the schedule into the past → claimable again.
	_, err = pool.Exec(ctx,
		`UPDATE webhook_deliveries SET next_attempt_at = now() - interval '1 second' WHERE id = $1`, deliveryID)
	require.NoError(t, err)
	batch3, err := w.claimBatch(ctx, 10)
	require.NoError(t, err)
	found := false
	for _, d := range batch3 {
		if d.ID == deliveryID {
			found = true
		}
	}
	require.True(t, found, "once next_attempt_at has passed, the delivery is claimable again")
}
