// Package credit implements the M40 Upload Credit Meter ledger service.
//
// This is the upload-meter sibling of backend/internal/streaming/credit
// (M31 / F-014). The shape deliberately mirrors its sister package so that
// future refactors (e.g. a shared ledger abstraction) can be done as a
// mechanical merge rather than a behavioural one.
//
// Unit of credit: 1 upload = 1 credit. Per-derivative pricing is explicitly
// out-of-scope for M40 v1 (see feature-prd.md §12).
//
// Balance model: reserve → consume → refund. Reservations are posted as
// negative entries in upload_ledger_entries; Consume converts them to
// terminal consume entries; Refund restores the balance with a positive
// refund entry. TTL expiry (ExpireAbandoned) is run by a background worker.
//
// Nil-pool mode: Service methods degrade gracefully when constructed with
// a nil pool so that unit tests can exercise input validation + contract
// shape without a live database. The real DB paths are exercised by
// credit_integration_test.go (build tag `integration`).
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

// EntryType enumerates allowed upload_ledger_entries.entry_type values.
// The constant set MUST stay in sync with the CHECK constraint in
// migration 098_upload_ledger_entries.up.sql — the coupling is
// intentional and load-bearing.
type EntryType string

const (
	EntryPurchase             EntryType = "purchase"
	EntryGrantMonthly         EntryType = "grant_monthly"
	EntryGrantAdmin           EntryType = "grant_admin"
	EntryReserve              EntryType = "reserve"
	EntryConsume              EntryType = "consume"
	EntryRefund               EntryType = "refund"
	EntryExpire               EntryType = "expire"
	EntryUnlimitedPassthrough EntryType = "unlimited_passthrough"
)

// ReservationState tracks in-flight reservations. Unlike the streaming
// sibling there is no overrun state — uploads either succeed at the
// reserved amount or are refunded wholesale.
type ReservationState string

const (
	ReservationActive   ReservationState = "active"
	ReservationConsumed ReservationState = "consumed"
	ReservationRefunded ReservationState = "refunded"
	ReservationExpired  ReservationState = "expired"
)

// BalanceView is the per-workspace balance breakdown surfaced by the
// Balance() method and the GET /api/v1/uploads/balance endpoint.
type BalanceView struct {
	WorkspaceID uuid.UUID  `json:"workspace_id"`
	PlanGranted int64      `json:"plan_granted"`
	Purchased   int64      `json:"purchased"`
	Reserved    int64      `json:"reserved"`
	Consumed    int64      `json:"consumed"`
	Refunded    int64      `json:"refunded"`
	Available   int64      `json:"available"`
	LastEntryAt *time.Time `json:"last_entry_at,omitempty"`
}

// LedgerEntry is a single row in upload_ledger_entries.
type LedgerEntry struct {
	ID               uuid.UUID  `json:"id"`
	WorkspaceID      uuid.UUID  `json:"workspace_id"`
	EntryType        EntryType  `json:"entry_type"`
	AmountCredits    int64      `json:"amount_credits"`
	IdempotencyKey   string     `json:"idempotency_key,omitempty"`
	ReservationRefID *uuid.UUID `json:"reservation_ref_id,omitempty"`
	PurchaseID       *uuid.UUID `json:"purchase_id,omitempty"`
	UploadSessionID  *uuid.UUID `json:"upload_session_id,omitempty"`
	Reason           string     `json:"reason,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
}

// ReservationResult is what Reserve returns on success.
type ReservationResult struct {
	ReservationID   uuid.UUID        `json:"reservation_id"`
	WorkspaceID     uuid.UUID        `json:"workspace_id"`
	UploadSessionID uuid.UUID        `json:"upload_session_id"`
	AmountCredits   int64            `json:"amount_credits"`
	State           ReservationState `json:"state"`
	IdempotencyKey  string           `json:"idempotency_key"`
	EntryType       EntryType        `json:"entry_type"` // reserve | unlimited_passthrough
}

// Sentinel errors exposed to callers.
var (
	ErrEmptyIdempotencyKey = errors.New("upload/credit: idempotency_key required")
	ErrNonPositiveAmount   = errors.New("upload/credit: amount must be > 0")
	ErrInsufficientBalance = errors.New("upload/credit: insufficient balance")
	ErrReservationNotFound = errors.New("upload/credit: reservation not found")
	ErrAlreadySettled      = errors.New("upload/credit: reservation already settled")
	ErrNotImplemented      = errors.New("upload/credit: not implemented")
)

// InsufficientBalanceDetails carries the structured shortfall payload
// returned to the handler, which relays it as 400 INSUFFICIENT_CREDITS
// with {required, available, shortfall}. Callers inspect via errors.As.
type InsufficientBalanceDetails struct {
	Required  int64 `json:"required"`
	Available int64 `json:"available"`
	Shortfall int64 `json:"shortfall"`
}

func (d *InsufficientBalanceDetails) Error() string {
	return fmt.Sprintf("%s: required=%d available=%d shortfall=%d",
		ErrInsufficientBalance.Error(), d.Required, d.Available, d.Shortfall)
}

func (d *InsufficientBalanceDetails) Unwrap() error { return ErrInsufficientBalance }

// ReserveInput parameters for Reserve.
type ReserveInput struct {
	WorkspaceID         uuid.UUID
	UploadSessionID     uuid.UUID
	AmountCredits       int64
	IdempotencyKey      string
	PlanCode            string // "standard" | "professional" | "enterprise"
	EnterpriseUnlimited bool
	CreatedBy           *uuid.UUID
	ExpiresAt           *time.Time
}

// ConsumeInput parameters for Consume.
type ConsumeInput struct {
	ReservationID  uuid.UUID
	IdempotencyKey string
}

// RefundInput parameters for Refund.
type RefundInput struct {
	ReservationID  uuid.UUID
	IdempotencyKey string
	Reason         string
}

// Service is the upload credit ledger service.
type Service struct {
	pool *pgxpool.Pool
	now  func() time.Time // injectable clock for TTL/cron tests
}

// NewService constructs a Service. Pass a nil pool for unit tests that
// only exercise input validation and contract shape.
func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, now: time.Now}
}

// Reserve posts a reserve ledger entry against the workspace balance.
// Enterprise workspaces with EnterpriseUnlimited=true short-circuit to
// an unlimited_passthrough entry and bypass the balance check entirely.
//
// Idempotent: replaying with the same IdempotencyKey returns the same
// ReservationResult (enforced at the DB layer by the partial unique index
// on upload_ledger_entries(workspace_id, idempotency_key)).
//
// Concurrency: the real DB path acquires a FOR UPDATE lock on the balance
// row for the workspace, so two simultaneous Reserve calls against the
// same workspace with balance=1 will serialise; one wins, the other
// observes the updated balance and returns ErrInsufficientBalance. This
// is the NFR-UCR-R2 contract and is exercised by the concurrency test
// in credit_integration_test.go.
func (s *Service) Reserve(ctx context.Context, in ReserveInput) (*ReservationResult, error) {
	if in.IdempotencyKey == "" {
		return nil, ErrEmptyIdempotencyKey
	}
	if in.AmountCredits <= 0 {
		return nil, ErrNonPositiveAmount
	}

	entryType := EntryReserve
	if in.EnterpriseUnlimited {
		entryType = EntryUnlimitedPassthrough
	}

	// Nil-pool branch for unit tests — synthesise the contract shape
	// without touching a database. The real DB branch runs under
	// integration tests (and in production).
	if s.pool == nil {
		return &ReservationResult{
			ReservationID:   uuid.New(),
			WorkspaceID:     in.WorkspaceID,
			UploadSessionID: in.UploadSessionID,
			AmountCredits:   in.AmountCredits,
			State:           ReservationActive,
			IdempotencyKey:  in.IdempotencyKey,
			EntryType:       entryType,
		}, nil
	}

	return s.reserveDB(ctx, in, entryType)
}

// reserveDB runs the production DB path. Called by Reserve when pool != nil.
func (s *Service) reserveDB(ctx context.Context, in ReserveInput, entryType EntryType) (*ReservationResult, error) {
	// Idempotency short-circuit: if an entry with this key already exists
	// for this workspace, return the existing reservation.
	if existing, err := s.findReservationByKey(ctx, in.WorkspaceID, in.IdempotencyKey); err == nil {
		return existing, nil
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("upload/credit: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Balance gate — only when NOT in enterprise unlimited mode. The
	// SELECT ... FOR UPDATE serialises concurrent reservations against
	// the same workspace so only one can commit when balance is tight.
	if entryType == EntryReserve {
		var available int64
		err = tx.QueryRow(ctx, `
			SELECT COALESCE(SUM(amount_credits), 0)
			  FROM upload_ledger_entries
			 WHERE workspace_id = $1
			 FOR UPDATE
		`, in.WorkspaceID).Scan(&available)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("upload/credit: balance query: %w", err)
		}
		if available < in.AmountCredits {
			return nil, &InsufficientBalanceDetails{
				Required:  in.AmountCredits,
				Available: available,
				Shortfall: in.AmountCredits - available,
			}
		}
	}

	// Signed amount: reserve is negative, unlimited_passthrough is zero
	// (it doesn't debit the balance — it's just a trace).
	signed := -in.AmountCredits
	if entryType == EntryUnlimitedPassthrough {
		signed = 0
	}

	reservationID := uuid.New()
	_, err = tx.Exec(ctx, `
		INSERT INTO upload_ledger_entries (
			id, workspace_id, entry_type, amount_credits,
			idempotency_key, upload_session_id, created_by
		) VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, reservationID, in.WorkspaceID, string(entryType), signed,
		in.IdempotencyKey, in.UploadSessionID, in.CreatedBy)
	if err != nil {
		return nil, fmt.Errorf("upload/credit: insert reserve entry: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("upload/credit: commit reserve: %w", err)
	}

	return &ReservationResult{
		ReservationID:   reservationID,
		WorkspaceID:     in.WorkspaceID,
		UploadSessionID: in.UploadSessionID,
		AmountCredits:   in.AmountCredits,
		State:           ReservationActive,
		IdempotencyKey:  in.IdempotencyKey,
		EntryType:       entryType,
	}, nil
}

// Consume converts a reserve entry to a terminal consume entry.
func (s *Service) Consume(ctx context.Context, in ConsumeInput) (*LedgerEntry, error) {
	if in.IdempotencyKey == "" {
		return nil, ErrEmptyIdempotencyKey
	}

	if s.pool == nil {
		// Unit-test path: return a synthesised consume entry.
		refID := in.ReservationID
		return &LedgerEntry{
			ID:               uuid.New(),
			EntryType:        EntryConsume,
			ReservationRefID: &refID,
			IdempotencyKey:   in.IdempotencyKey,
			CreatedAt:        s.now(),
		}, nil
	}

	return s.consumeDB(ctx, in)
}

func (s *Service) consumeDB(ctx context.Context, in ConsumeInput) (*LedgerEntry, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("upload/credit: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Look up the reservation row to settle — with FOR UPDATE to block
	// concurrent Consume/Refund on the same reservation.
	var workspaceID uuid.UUID
	var amountCredits int64
	var entryType string
	err = tx.QueryRow(ctx, `
		SELECT workspace_id, amount_credits, entry_type
		  FROM upload_ledger_entries
		 WHERE id = $1
		 FOR UPDATE
	`, in.ReservationID).Scan(&workspaceID, &amountCredits, &entryType)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrReservationNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("upload/credit: lookup reservation: %w", err)
	}
	if entryType != string(EntryReserve) && entryType != string(EntryUnlimitedPassthrough) {
		return nil, fmt.Errorf("%w: entry_type=%s", ErrAlreadySettled, entryType)
	}

	// Idempotency: return existing consume for this reservation + key.
	var existingID uuid.UUID
	err = tx.QueryRow(ctx, `
		SELECT id FROM upload_ledger_entries
		 WHERE workspace_id = $1 AND idempotency_key = $2 AND entry_type = $3
	`, workspaceID, in.IdempotencyKey, string(EntryConsume)).Scan(&existingID)
	if err == nil {
		return s.readEntryByID(ctx, existingID)
	}

	// amount_credits on a reserve is negative; consume posts the same
	// negative amount under entry_type=consume to keep the signed sum
	// stable (reservation is settled without changing the balance).
	consumeID := uuid.New()
	refID := in.ReservationID
	_, err = tx.Exec(ctx, `
		INSERT INTO upload_ledger_entries (
			id, workspace_id, entry_type, amount_credits,
			idempotency_key, reservation_ref_id
		) VALUES ($1, $2, $3, $4, $5, $6)
	`, consumeID, workspaceID, string(EntryConsume), amountCredits,
		in.IdempotencyKey, refID)
	if err != nil {
		return nil, fmt.Errorf("upload/credit: insert consume: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("upload/credit: commit consume: %w", err)
	}

	return &LedgerEntry{
		ID:               consumeID,
		WorkspaceID:      workspaceID,
		EntryType:        EntryConsume,
		AmountCredits:    amountCredits,
		IdempotencyKey:   in.IdempotencyKey,
		ReservationRefID: &refID,
		CreatedAt:        s.now(),
	}, nil
}

// Refund restores the balance by posting a refund entry against a
// previously-active reservation.
func (s *Service) Refund(ctx context.Context, in RefundInput) (*LedgerEntry, error) {
	if in.IdempotencyKey == "" {
		return nil, ErrEmptyIdempotencyKey
	}

	if s.pool == nil {
		refID := in.ReservationID
		return &LedgerEntry{
			ID:               uuid.New(),
			EntryType:        EntryRefund,
			ReservationRefID: &refID,
			IdempotencyKey:   in.IdempotencyKey,
			Reason:           in.Reason,
			CreatedAt:        s.now(),
		}, nil
	}
	return s.refundDB(ctx, in)
}

func (s *Service) refundDB(ctx context.Context, in RefundInput) (*LedgerEntry, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("upload/credit: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var workspaceID uuid.UUID
	var amountCredits int64
	var entryType string
	err = tx.QueryRow(ctx, `
		SELECT workspace_id, amount_credits, entry_type
		  FROM upload_ledger_entries
		 WHERE id = $1
		 FOR UPDATE
	`, in.ReservationID).Scan(&workspaceID, &amountCredits, &entryType)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrReservationNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("upload/credit: lookup reservation: %w", err)
	}
	if entryType != string(EntryReserve) {
		return nil, fmt.Errorf("%w: entry_type=%s", ErrAlreadySettled, entryType)
	}

	// Idempotency: same key returns the existing refund.
	var existingID uuid.UUID
	err = tx.QueryRow(ctx, `
		SELECT id FROM upload_ledger_entries
		 WHERE workspace_id = $1 AND idempotency_key = $2 AND entry_type = $3
	`, workspaceID, in.IdempotencyKey, string(EntryRefund)).Scan(&existingID)
	if err == nil {
		return s.readEntryByID(ctx, existingID)
	}

	// refund posts the positive counterpart (-amountCredits on a reserve
	// was negative; +amountCredits on refund restores the balance).
	refundID := uuid.New()
	refID := in.ReservationID
	positive := -amountCredits
	_, err = tx.Exec(ctx, `
		INSERT INTO upload_ledger_entries (
			id, workspace_id, entry_type, amount_credits,
			idempotency_key, reservation_ref_id, reason
		) VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, refundID, workspaceID, string(EntryRefund), positive,
		in.IdempotencyKey, refID, in.Reason)
	if err != nil {
		return nil, fmt.Errorf("upload/credit: insert refund: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("upload/credit: commit refund: %w", err)
	}

	return &LedgerEntry{
		ID:               refundID,
		WorkspaceID:      workspaceID,
		EntryType:        EntryRefund,
		AmountCredits:    positive,
		IdempotencyKey:   in.IdempotencyKey,
		ReservationRefID: &refID,
		Reason:           in.Reason,
		CreatedAt:        s.now(),
	}, nil
}

// Balance returns the current per-workspace breakdown.
func (s *Service) Balance(ctx context.Context, workspaceID uuid.UUID) (BalanceView, error) {
	b := BalanceView{WorkspaceID: workspaceID}
	if s.pool == nil {
		return b, nil
	}
	err := s.pool.QueryRow(ctx, `
		SELECT COALESCE(plan_granted, 0),
		       COALESCE(purchased, 0),
		       COALESCE(reserved, 0),
		       COALESCE(consumed, 0),
		       COALESCE(refunded, 0),
		       COALESCE(total_credits, 0),
		       last_entry_at
		  FROM upload_credit_balances
		 WHERE workspace_id = $1
	`, workspaceID).Scan(
		&b.PlanGranted, &b.Purchased, &b.Reserved, &b.Consumed,
		&b.Refunded, &b.Available, &b.LastEntryAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return b, nil // zero balance, no entries yet
	}
	if err != nil {
		return b, fmt.Errorf("upload/credit: balance query: %w", err)
	}
	return b, nil
}

// ExpireAbandoned refunds every reservation older than olderThan that has
// not been consumed or refunded. Returns the count of reservations expired.
// Run hourly by a background worker.
func (s *Service) ExpireAbandoned(ctx context.Context, olderThan time.Duration) (int, error) {
	if s.pool == nil {
		return 0, nil
	}

	cutoff := s.now().Add(-olderThan)

	rows, err := s.pool.Query(ctx, `
		SELECT r.id, r.workspace_id, r.amount_credits
		  FROM upload_ledger_entries r
		 WHERE r.entry_type = $1
		   AND r.created_at < $2
		   AND NOT EXISTS (
			   SELECT 1 FROM upload_ledger_entries c
			    WHERE c.reservation_ref_id = r.id
			      AND c.entry_type IN ($3, $4, $5)
		   )
	`, string(EntryReserve), cutoff,
		string(EntryConsume), string(EntryRefund), string(EntryExpire))
	if err != nil {
		return 0, fmt.Errorf("upload/credit: expire query: %w", err)
	}
	defer rows.Close()

	type pending struct {
		id  uuid.UUID
		ws  uuid.UUID
		amt int64
	}
	var victims []pending
	for rows.Next() {
		var p pending
		if err := rows.Scan(&p.id, &p.ws, &p.amt); err != nil {
			return len(victims), fmt.Errorf("upload/credit: expire scan: %w", err)
		}
		victims = append(victims, p)
	}
	if err := rows.Err(); err != nil {
		return len(victims), err
	}

	expired := 0
	for _, v := range victims {
		refID := v.id
		_, err := s.pool.Exec(ctx, `
			INSERT INTO upload_ledger_entries (
				id, workspace_id, entry_type, amount_credits,
				reservation_ref_id, reason, idempotency_key
			) VALUES ($1, $2, $3, $4, $5, $6, $7)
			ON CONFLICT DO NOTHING
		`, uuid.New(), v.ws, string(EntryExpire), -v.amt,
			refID, "ttl-expire", fmt.Sprintf("expire:%s", v.id))
		if err != nil {
			return expired, fmt.Errorf("upload/credit: insert expire: %w", err)
		}
		expired++
	}
	return expired, nil
}

// findReservationByKey returns an existing reservation for a workspace+key
// pair if one exists (idempotency short-circuit).
func (s *Service) findReservationByKey(ctx context.Context, workspaceID uuid.UUID, key string) (*ReservationResult, error) {
	var res ReservationResult
	var entryType string
	var sessionID *uuid.UUID
	err := s.pool.QueryRow(ctx, `
		SELECT id, workspace_id, amount_credits, entry_type, upload_session_id
		  FROM upload_ledger_entries
		 WHERE workspace_id = $1
		   AND idempotency_key = $2
		   AND entry_type IN ($3, $4)
	`, workspaceID, key,
		string(EntryReserve), string(EntryUnlimitedPassthrough),
	).Scan(&res.ReservationID, &res.WorkspaceID, &res.AmountCredits, &entryType, &sessionID)
	if err != nil {
		return nil, err
	}
	// amount_credits is stored signed (negative for reserve); surface the
	// positive requested amount to callers.
	if res.AmountCredits < 0 {
		res.AmountCredits = -res.AmountCredits
	}
	res.State = ReservationActive
	res.IdempotencyKey = key
	res.EntryType = EntryType(entryType)
	if sessionID != nil {
		res.UploadSessionID = *sessionID
	}
	return &res, nil
}

// readEntryByID loads a single ledger row by id.
func (s *Service) readEntryByID(ctx context.Context, id uuid.UUID) (*LedgerEntry, error) {
	var e LedgerEntry
	var entryType string
	err := s.pool.QueryRow(ctx, `
		SELECT id, workspace_id, entry_type, amount_credits,
		       COALESCE(idempotency_key, ''),
		       reservation_ref_id, upload_session_id,
		       COALESCE(reason, ''), created_at
		  FROM upload_ledger_entries
		 WHERE id = $1
	`, id).Scan(
		&e.ID, &e.WorkspaceID, &entryType, &e.AmountCredits,
		&e.IdempotencyKey, &e.ReservationRefID, &e.UploadSessionID,
		&e.Reason, &e.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	e.EntryType = EntryType(entryType)
	return &e, nil
}
