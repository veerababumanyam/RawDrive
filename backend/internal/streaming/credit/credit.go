// Package credit implements the F-014 prepaid credit ledger.
//
// M31 / E102-S4 — Ledger arithmetic and reservation lifecycle.
//
// All operations are idempotent on (workspace_id, idempotency_key). A retry
// with the same key returns the existing ledger row without double-posting.
// Amounts are paise (signed BIGINT); minutes are signed integers. Every
// mutating operation appends exactly one row to streaming_ledger_entries,
// which is an append-only table (update/delete blocked by trigger).
//
// Contract with callers: the DB session must have app.current_workspace_id
// set to the operating workspace BEFORE calling any Service method —
// RLS policies on streaming_ledger_entries, streaming_purchases, and
// streaming_reservations depend on it.
package credit

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// EntryType enumerates the allowed streaming_ledger_entries.entry_type values.
type EntryType string

const (
	EntryPurchase   EntryType = "purchase"
	EntryReserve    EntryType = "reserve"
	EntryConsume    EntryType = "consume"
	EntryRefund     EntryType = "refund"
	EntryOverage    EntryType = "overage"
	EntryAdjustment EntryType = "adjustment"
)

// ReservationState mirrors streaming_reservations.state.
type ReservationState string

const (
	ReservationPending  ReservationState = "pending"
	ReservationActive   ReservationState = "active"
	ReservationConsumed ReservationState = "consumed"
	ReservationOverrun  ReservationState = "overrun"
	ReservationRefunded ReservationState = "refunded"
	ReservationExpired  ReservationState = "expired"
)

// Balance is a derived view row from streaming_credit_balances.
type Balance struct {
	WorkspaceID    uuid.UUID  `json:"workspace_id"`
	BalancePaise   int64      `json:"balance_paise"`
	BalanceMinutes int        `json:"balance_minutes"`
	LastEntryAt    *time.Time `json:"last_entry_at,omitempty"`
}

// LedgerEntry is one row from streaming_ledger_entries.
type LedgerEntry struct {
	ID             uuid.UUID  `json:"id"`
	WorkspaceID    uuid.UUID  `json:"workspace_id"`
	EntryType      EntryType  `json:"entry_type"`
	AmountPaise    int64      `json:"amount_paise"`
	MinutesDelta   int        `json:"minutes_delta"`
	PurchaseID     *uuid.UUID `json:"purchase_id,omitempty"`
	ReservationID  *uuid.UUID `json:"reservation_id,omitempty"`
	StreamID       *uuid.UUID `json:"stream_id,omitempty"`
	IdempotencyKey string     `json:"idempotency_key"`
	Memo           *string    `json:"memo,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
}

// Reservation is one row from streaming_reservations.
type Reservation struct {
	ID                  uuid.UUID        `json:"id"`
	WorkspaceID         uuid.UUID        `json:"workspace_id"`
	StreamID            uuid.UUID        `json:"stream_id"`
	PackageID           uuid.UUID        `json:"package_id"`
	RateCardID          uuid.UUID        `json:"rate_card_id"`
	ReservedMinutes     int              `json:"reserved_minutes"`
	ReservedAmountPaise int64            `json:"reserved_amount_paise"`
	ConsumedMinutes     int              `json:"consumed_minutes"`
	OverageMinutes      int              `json:"overage_minutes"`
	State               ReservationState `json:"state"`
	IdempotencyKey      string           `json:"idempotency_key"`
	ExpiresAt           *time.Time       `json:"expires_at,omitempty"`
	CreatedAt           time.Time        `json:"created_at"`
	UpdatedAt           time.Time        `json:"updated_at"`
}

// Errors.
var (
	ErrEmptyIdempotencyKey = errors.New("credit: idempotency_key required")
	ErrNonPositiveMinutes  = errors.New("credit: minutes must be > 0")
	ErrNonPositivePrice    = errors.New("credit: amount must be > 0")
	ErrInsufficient        = errors.New("credit: insufficient balance")
	ErrReservationState    = errors.New("credit: reservation not in a state that permits this op")
	ErrReservationNotFound = errors.New("credit: reservation not found")
	ErrRateCardNotFound    = errors.New("credit: active rate card not found for package")
)

// PurchaseInput parameters for Purchase.
type PurchaseInput struct {
	WorkspaceID    uuid.UUID
	PackageID      uuid.UUID
	Provider       string // "phonepe" | "razorpay" | "" for platform grant
	ProviderTxnID  string
	IdempotencyKey string
	PurchasedBy    *uuid.UUID
}

// ReserveInput parameters for ReserveCredits.
type ReserveInput struct {
	WorkspaceID    uuid.UUID
	StreamID       uuid.UUID
	PackageID      uuid.UUID
	Minutes        int
	IdempotencyKey string
	ExpiresAt      *time.Time
	CreatedBy      *uuid.UUID
}

// ConsumeInput parameters for ConsumeCredits — finalising a completed stream.
type ConsumeInput struct {
	ReservationID   uuid.UUID
	ConsumedMinutes int
	IdempotencyKey  string
}

// RefundInput parameters for RefundReservation.
type RefundInput struct {
	ReservationID  uuid.UUID
	IdempotencyKey string
	Reason         string
}

// OverageInput parameters for PostOverage.
type OverageInput struct {
	ReservationID  uuid.UUID
	OverageMinutes int
	IdempotencyKey string
}

// Service is the credit ledger service.
type Service struct {
	pool *pgxpool.Pool
}

// NewService constructs a Service.
func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

// GetBalance returns the running balance for a workspace.
func (s *Service) GetBalance(ctx context.Context, workspaceID uuid.UUID) (Balance, error) {
	b := Balance{WorkspaceID: workspaceID}
	err := s.pool.QueryRow(ctx,
		`SELECT balance_paise, balance_minutes, last_entry_at
		   FROM streaming_credit_balances
		  WHERE workspace_id = $1`,
		workspaceID,
	).Scan(&b.BalancePaise, &b.BalanceMinutes, &b.LastEntryAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return b, nil // zero balance, no entries yet
	}
	if err != nil {
		return b, fmt.Errorf("credit: get balance: %w", err)
	}
	return b, nil
}

// Purchase credits a workspace with a package's minutes at the currently-active
// rate card. Idempotent: same idempotency_key returns the existing purchase.
// Posts a positive 'purchase' ledger entry.
func (s *Service) Purchase(ctx context.Context, in PurchaseInput) (*LedgerEntry, error) {
	if in.IdempotencyKey == "" {
		return nil, ErrEmptyIdempotencyKey
	}

	// Idempotency short-circuit: if an entry with this key already exists, return it.
	if existing, err := s.findEntryByKey(ctx, in.WorkspaceID, in.IdempotencyKey); err == nil {
		return existing, nil
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("credit: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Resolve active rate card for this package: newest row where
	// effective_from <= now().
	var rateCardID uuid.UUID
	var pricePaise int64
	var minutes int
	err = tx.QueryRow(ctx,
		`SELECT r.id, r.price_paise, p.minutes
		   FROM streaming_rate_cards r
		   JOIN streaming_packages  p ON p.id = r.package_id
		  WHERE r.package_id = $1 AND r.effective_from <= now()
		  ORDER BY r.effective_from DESC
		  LIMIT 1`,
		in.PackageID,
	).Scan(&rateCardID, &pricePaise, &minutes)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrRateCardNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("credit: resolve rate card: %w", err)
	}

	// Insert purchase row.
	purchaseID := uuid.New()
	var provider any
	if in.Provider != "" {
		provider = in.Provider
	}
	var providerTxn any
	if in.ProviderTxnID != "" {
		providerTxn = in.ProviderTxnID
	}
	_, err = tx.Exec(ctx,
		`INSERT INTO streaming_purchases (
			id, workspace_id, package_id, rate_card_id, amount_paise,
			minutes_credited, provider, provider_txn_id, idempotency_key, purchased_by
		 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		purchaseID, in.WorkspaceID, in.PackageID, rateCardID, pricePaise,
		minutes, provider, providerTxn, in.IdempotencyKey, in.PurchasedBy,
	)
	if err != nil {
		return nil, fmt.Errorf("credit: insert purchase: %w", err)
	}

	entry, err := insertLedgerTx(ctx, tx, LedgerEntry{
		WorkspaceID:    in.WorkspaceID,
		EntryType:      EntryPurchase,
		AmountPaise:    pricePaise,
		MinutesDelta:   minutes,
		PurchaseID:     &purchaseID,
		IdempotencyKey: in.IdempotencyKey,
	})
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("credit: commit purchase: %w", err)
	}
	return entry, nil
}

// ReserveCredits creates a pending reservation and posts a negative 'reserve'
// ledger entry. Fails with ErrInsufficient if the post-reserve balance would
// go negative. Idempotent on IdempotencyKey.
func (s *Service) ReserveCredits(ctx context.Context, in ReserveInput) (*Reservation, error) {
	if in.IdempotencyKey == "" {
		return nil, ErrEmptyIdempotencyKey
	}
	if in.Minutes <= 0 {
		return nil, ErrNonPositiveMinutes
	}

	if existing, err := s.findReservationByKey(ctx, in.WorkspaceID, in.IdempotencyKey); err == nil {
		return existing, nil
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("credit: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Resolve active rate card for cost projection.
	var rateCardID uuid.UUID
	var basePerMin int64
	err = tx.QueryRow(ctx,
		`SELECT id, base_rate_paise_per_min
		   FROM streaming_rate_cards
		  WHERE package_id = $1 AND effective_from <= now()
		  ORDER BY effective_from DESC
		  LIMIT 1`,
		in.PackageID,
	).Scan(&rateCardID, &basePerMin)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrRateCardNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("credit: resolve rate card for reserve: %w", err)
	}

	reserveCost := basePerMin * int64(in.Minutes)

	// Balance check — reject if post-reserve would go negative.
	var currentPaise int64
	var currentMinutes int
	err = tx.QueryRow(ctx,
		`SELECT COALESCE(SUM(amount_paise), 0), COALESCE(SUM(minutes_delta), 0)
		   FROM streaming_ledger_entries WHERE workspace_id = $1`,
		in.WorkspaceID,
	).Scan(&currentPaise, &currentMinutes)
	if err != nil {
		return nil, fmt.Errorf("credit: balance check: %w", err)
	}
	if currentPaise-reserveCost < 0 || currentMinutes-in.Minutes < 0 {
		return nil, ErrInsufficient
	}

	// Insert reservation row.
	resID := uuid.New()
	_, err = tx.Exec(ctx,
		`INSERT INTO streaming_reservations (
			id, workspace_id, stream_id, package_id, rate_card_id,
			reserved_minutes, reserved_amount_paise, state,
			idempotency_key, expires_at, created_by
		 ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9,$10)`,
		resID, in.WorkspaceID, in.StreamID, in.PackageID, rateCardID,
		in.Minutes, reserveCost, in.IdempotencyKey, in.ExpiresAt, in.CreatedBy,
	)
	if err != nil {
		return nil, fmt.Errorf("credit: insert reservation: %w", err)
	}

	_, err = insertLedgerTx(ctx, tx, LedgerEntry{
		WorkspaceID:    in.WorkspaceID,
		EntryType:      EntryReserve,
		AmountPaise:    -reserveCost,
		MinutesDelta:   -in.Minutes,
		ReservationID:  &resID,
		StreamID:       &in.StreamID,
		IdempotencyKey: in.IdempotencyKey,
	})
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("credit: commit reservation: %w", err)
	}

	return s.findReservationByID(ctx, resID)
}

// ConsumeCredits finalises a completed stream. Moves the reservation from
// pending/active to consumed and posts a 'consume' ledger entry with
// amount_paise = 0 (the reserve already debited). Records consumed_minutes
// on the reservation for later analytics. Idempotent on IdempotencyKey.
func (s *Service) ConsumeCredits(ctx context.Context, in ConsumeInput) (*LedgerEntry, error) {
	if in.IdempotencyKey == "" {
		return nil, ErrEmptyIdempotencyKey
	}
	if in.ConsumedMinutes < 0 {
		return nil, ErrNonPositiveMinutes
	}

	res, err := s.findReservationByID(ctx, in.ReservationID)
	if err != nil {
		return nil, err
	}
	if existing, err := s.findEntryByKey(ctx, res.WorkspaceID, in.IdempotencyKey); err == nil {
		return existing, nil
	}
	if res.State != ReservationPending && res.State != ReservationActive {
		return nil, fmt.Errorf("%w: state=%s", ErrReservationState, res.State)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("credit: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	_, err = tx.Exec(ctx,
		`UPDATE streaming_reservations
		    SET state = 'consumed',
		        consumed_minutes = $2,
		        updated_at = now()
		  WHERE id = $1`,
		res.ID, in.ConsumedMinutes,
	)
	if err != nil {
		return nil, fmt.Errorf("credit: update reservation on consume: %w", err)
	}

	entry, err := insertLedgerTx(ctx, tx, LedgerEntry{
		WorkspaceID:    res.WorkspaceID,
		EntryType:      EntryConsume,
		AmountPaise:    0,
		MinutesDelta:   0,
		ReservationID:  &res.ID,
		StreamID:       &res.StreamID,
		IdempotencyKey: in.IdempotencyKey,
	})
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("credit: commit consume: %w", err)
	}
	return entry, nil
}

// RefundReservation releases a pending reservation and posts a positive 'refund'
// ledger entry that reverses the original reserve. Idempotent on IdempotencyKey.
func (s *Service) RefundReservation(ctx context.Context, in RefundInput) (*LedgerEntry, error) {
	if in.IdempotencyKey == "" {
		return nil, ErrEmptyIdempotencyKey
	}

	res, err := s.findReservationByID(ctx, in.ReservationID)
	if err != nil {
		return nil, err
	}
	if existing, err := s.findEntryByKey(ctx, res.WorkspaceID, in.IdempotencyKey); err == nil {
		return existing, nil
	}
	if res.State != ReservationPending && res.State != ReservationActive {
		return nil, fmt.Errorf("%w: state=%s", ErrReservationState, res.State)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("credit: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	_, err = tx.Exec(ctx,
		`UPDATE streaming_reservations
		    SET state = 'refunded', updated_at = now()
		  WHERE id = $1`,
		res.ID,
	)
	if err != nil {
		return nil, fmt.Errorf("credit: update reservation on refund: %w", err)
	}

	memo := in.Reason
	entry, err := insertLedgerTx(ctx, tx, LedgerEntry{
		WorkspaceID:    res.WorkspaceID,
		EntryType:      EntryRefund,
		AmountPaise:    res.ReservedAmountPaise,
		MinutesDelta:   res.ReservedMinutes,
		ReservationID:  &res.ID,
		StreamID:       &res.StreamID,
		IdempotencyKey: in.IdempotencyKey,
		Memo:           &memo,
	})
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("credit: commit refund: %w", err)
	}
	return entry, nil
}

// PostOverage posts a negative 'overage' ledger entry at the rate-card's
// overage_rate_paise_per_min. Marks reservation state = 'overrun'. Idempotent.
func (s *Service) PostOverage(ctx context.Context, in OverageInput) (*LedgerEntry, error) {
	if in.IdempotencyKey == "" {
		return nil, ErrEmptyIdempotencyKey
	}
	if in.OverageMinutes <= 0 {
		return nil, ErrNonPositiveMinutes
	}

	res, err := s.findReservationByID(ctx, in.ReservationID)
	if err != nil {
		return nil, err
	}
	if existing, err := s.findEntryByKey(ctx, res.WorkspaceID, in.IdempotencyKey); err == nil {
		return existing, nil
	}

	var overagePerMin int64
	err = s.pool.QueryRow(ctx,
		`SELECT overage_rate_paise_per_min FROM streaming_rate_cards WHERE id = $1`,
		res.RateCardID,
	).Scan(&overagePerMin)
	if err != nil {
		return nil, fmt.Errorf("credit: lookup overage rate: %w", err)
	}
	overageCost := overagePerMin * int64(in.OverageMinutes)

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("credit: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	_, err = tx.Exec(ctx,
		`UPDATE streaming_reservations
		    SET state = 'overrun',
		        overage_minutes = overage_minutes + $2,
		        updated_at = now()
		  WHERE id = $1`,
		res.ID, in.OverageMinutes,
	)
	if err != nil {
		return nil, fmt.Errorf("credit: update reservation on overage: %w", err)
	}

	entry, err := insertLedgerTx(ctx, tx, LedgerEntry{
		WorkspaceID:    res.WorkspaceID,
		EntryType:      EntryOverage,
		AmountPaise:    -overageCost,
		MinutesDelta:   -in.OverageMinutes,
		ReservationID:  &res.ID,
		StreamID:       &res.StreamID,
		IdempotencyKey: in.IdempotencyKey,
	})
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("credit: commit overage: %w", err)
	}
	return entry, nil
}

// ----- helpers -----

func (s *Service) findEntryByKey(ctx context.Context, workspaceID uuid.UUID, key string) (*LedgerEntry, error) {
	var e LedgerEntry
	err := s.pool.QueryRow(ctx,
		`SELECT id, workspace_id, entry_type, amount_paise, minutes_delta,
		        purchase_id, reservation_id, stream_id, idempotency_key, memo, created_at
		   FROM streaming_ledger_entries
		  WHERE workspace_id = $1 AND idempotency_key = $2`,
		workspaceID, key,
	).Scan(&e.ID, &e.WorkspaceID, &e.EntryType, &e.AmountPaise, &e.MinutesDelta,
		&e.PurchaseID, &e.ReservationID, &e.StreamID, &e.IdempotencyKey, &e.Memo, &e.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &e, nil
}

func (s *Service) findReservationByKey(ctx context.Context, workspaceID uuid.UUID, key string) (*Reservation, error) {
	var r Reservation
	err := s.pool.QueryRow(ctx,
		`SELECT id, workspace_id, stream_id, package_id, rate_card_id,
		        reserved_minutes, reserved_amount_paise, consumed_minutes, overage_minutes,
		        state, idempotency_key, expires_at, created_at, updated_at
		   FROM streaming_reservations
		  WHERE workspace_id = $1 AND idempotency_key = $2`,
		workspaceID, key,
	).Scan(&r.ID, &r.WorkspaceID, &r.StreamID, &r.PackageID, &r.RateCardID,
		&r.ReservedMinutes, &r.ReservedAmountPaise, &r.ConsumedMinutes, &r.OverageMinutes,
		&r.State, &r.IdempotencyKey, &r.ExpiresAt, &r.CreatedAt, &r.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &r, nil
}

func (s *Service) findReservationByID(ctx context.Context, id uuid.UUID) (*Reservation, error) {
	var r Reservation
	err := s.pool.QueryRow(ctx,
		`SELECT id, workspace_id, stream_id, package_id, rate_card_id,
		        reserved_minutes, reserved_amount_paise, consumed_minutes, overage_minutes,
		        state, idempotency_key, expires_at, created_at, updated_at
		   FROM streaming_reservations
		  WHERE id = $1`,
		id,
	).Scan(&r.ID, &r.WorkspaceID, &r.StreamID, &r.PackageID, &r.RateCardID,
		&r.ReservedMinutes, &r.ReservedAmountPaise, &r.ConsumedMinutes, &r.OverageMinutes,
		&r.State, &r.IdempotencyKey, &r.ExpiresAt, &r.CreatedAt, &r.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrReservationNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("credit: find reservation: %w", err)
	}
	return &r, nil
}

func insertLedgerTx(ctx context.Context, tx pgx.Tx, e LedgerEntry) (*LedgerEntry, error) {
	if e.ID == uuid.Nil {
		e.ID = uuid.New()
	}
	var memo any
	if e.Memo != nil {
		memo = *e.Memo
	}
	err := tx.QueryRow(ctx,
		`INSERT INTO streaming_ledger_entries (
			id, workspace_id, entry_type, amount_paise, minutes_delta,
			purchase_id, reservation_id, stream_id, idempotency_key, memo
		 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		 RETURNING created_at`,
		e.ID, e.WorkspaceID, string(e.EntryType), e.AmountPaise, e.MinutesDelta,
		e.PurchaseID, e.ReservationID, e.StreamID, e.IdempotencyKey, memo,
	).Scan(&e.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("credit: insert ledger entry: %w", err)
	}
	return &e, nil
}
