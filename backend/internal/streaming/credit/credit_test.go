package credit_test

// M31 / E102-S4 — credit package unit tests that don't require a live DB.
// DB-level idempotency, RLS, and arithmetic tests are in credit_integration_test.go
// (build tag `integration`).

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	"github.com/rawdrive/backend/internal/streaming/credit"
)

func TestEntryType_Constants(t *testing.T) {
	assert.Equal(t, "purchase", string(credit.EntryPurchase))
	assert.Equal(t, "reserve", string(credit.EntryReserve))
	assert.Equal(t, "consume", string(credit.EntryConsume))
	assert.Equal(t, "refund", string(credit.EntryRefund))
	assert.Equal(t, "overage", string(credit.EntryOverage))
}

func TestReservationState_Constants(t *testing.T) {
	assert.Equal(t, "pending", string(credit.ReservationPending))
	assert.Equal(t, "active", string(credit.ReservationActive))
	assert.Equal(t, "consumed", string(credit.ReservationConsumed))
	assert.Equal(t, "overrun", string(credit.ReservationOverrun))
	assert.Equal(t, "refunded", string(credit.ReservationRefunded))
	assert.Equal(t, "expired", string(credit.ReservationExpired))
}

func TestPurchase_RejectsEmptyIdempotencyKey(t *testing.T) {
	svc := credit.NewService(nil) // pool unused — we fail before touching it.
	_, err := svc.Purchase(context.Background(), credit.PurchaseInput{
		WorkspaceID:    uuid.New(),
		PackageID:      uuid.New(),
		IdempotencyKey: "",
	})
	assert.ErrorIs(t, err, credit.ErrEmptyIdempotencyKey)
}

func TestReserveCredits_RejectsEmptyIdempotencyKey(t *testing.T) {
	svc := credit.NewService(nil)
	_, err := svc.ReserveCredits(context.Background(), credit.ReserveInput{
		WorkspaceID:    uuid.New(),
		StreamID:       uuid.New(),
		PackageID:      uuid.New(),
		Minutes:        30,
		IdempotencyKey: "",
	})
	assert.ErrorIs(t, err, credit.ErrEmptyIdempotencyKey)
}

func TestReserveCredits_RejectsNonPositiveMinutes(t *testing.T) {
	svc := credit.NewService(nil)
	for _, minutes := range []int{0, -1, -60} {
		_, err := svc.ReserveCredits(context.Background(), credit.ReserveInput{
			WorkspaceID:    uuid.New(),
			StreamID:       uuid.New(),
			PackageID:      uuid.New(),
			Minutes:        minutes,
			IdempotencyKey: "k",
		})
		assert.ErrorIs(t, err, credit.ErrNonPositiveMinutes, "minutes=%d", minutes)
	}
}

func TestConsumeCredits_RejectsEmptyIdempotencyKey(t *testing.T) {
	svc := credit.NewService(nil)
	_, err := svc.ConsumeCredits(context.Background(), credit.ConsumeInput{
		ReservationID:   uuid.New(),
		ConsumedMinutes: 30,
		IdempotencyKey:  "",
	})
	assert.ErrorIs(t, err, credit.ErrEmptyIdempotencyKey)
}

func TestRefundReservation_RejectsEmptyIdempotencyKey(t *testing.T) {
	svc := credit.NewService(nil)
	_, err := svc.RefundReservation(context.Background(), credit.RefundInput{
		ReservationID:  uuid.New(),
		IdempotencyKey: "",
	})
	assert.ErrorIs(t, err, credit.ErrEmptyIdempotencyKey)
}

func TestPostOverage_RejectsEmptyIdempotencyKey(t *testing.T) {
	svc := credit.NewService(nil)
	_, err := svc.PostOverage(context.Background(), credit.OverageInput{
		ReservationID:  uuid.New(),
		OverageMinutes: 5,
		IdempotencyKey: "",
	})
	assert.ErrorIs(t, err, credit.ErrEmptyIdempotencyKey)
}

func TestPostOverage_RejectsNonPositiveMinutes(t *testing.T) {
	svc := credit.NewService(nil)
	_, err := svc.PostOverage(context.Background(), credit.OverageInput{
		ReservationID:  uuid.New(),
		OverageMinutes: 0,
		IdempotencyKey: "k",
	})
	assert.ErrorIs(t, err, credit.ErrNonPositiveMinutes)
}
