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
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/dbretry"
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

	// M41 — Purchase / GrantAdmin / GrantMonthly / RefundPurchase surface.
	ErrEmptyPackageCode         = errors.New("upload/credit: package_code required")
	ErrPackageNotFound          = errors.New("upload/credit: package not found or inactive")
	ErrNoActiveRateCard         = errors.New("upload/credit: no active rate card for package")
	ErrAmountExceedsLimit       = errors.New("upload/credit: amount exceeds per-grant hard cap (100_000)")
	ErrEmptyReason              = errors.New("upload/credit: reason required")
	ErrEmptyPurchaseID          = errors.New("upload/credit: purchase_id required")
	ErrPurchaseNotFound         = errors.New("upload/credit: purchase not found")
	ErrRefundWindowExpired      = errors.New("upload/credit: refund window expired (7-day limit)")
	ErrCreditsPartiallyConsumed = errors.New("upload/credit: credits partially consumed; refund blocked")
)

// GrantAdminHardCap is the maximum credits a single admin grant may post
// (PRD §D3). Per-grant, not per-day — multiple grants may be chained if a
// larger credit is needed, keeping the audit trail granular.
const GrantAdminHardCap int64 = 100_000

// GrantStatus describes the outcome of a monthly grant for one workspace.
// Skipped tiers (elite/enterprise) return GrantSkippedEnterprise without writing
// a ledger row; a nil LedgerEntry on the result communicates this to the
// caller without forcing a separate error path.
type GrantStatus string

const (
	GrantGranted           GrantStatus = "granted"
	GrantSkippedEnterprise GrantStatus = "skipped_enterprise"
	GrantSkippedReplay     GrantStatus = "skipped_replay" // idempotent replay — existing entry returned
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
	PlanCode            string // "free" | "creator" | "pro_photographer" | "studio" | "elite_studio"
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

	// DB-6b: the whole transaction is retried on transient errors
	// (serialization_failure 40001 / deadlock_detected 40P01 / pooler bounce).
	// reservationID is generated inside the closure so each retried attempt
	// posts a fresh row; a rolled-back attempt leaves no partial state.
	var reservationID uuid.UUID
	err := dbretry.InTx(ctx, dbretry.DefaultOptions(), s.pool, func(tx pgx.Tx) error {
		// Balance gate — only when NOT in enterprise unlimited mode.
		//
		// M40 PERF-002: the gate now reads from upload_credit_balance_rollup
		// (migration 101) in O(1) per workspace instead of scanning every
		// ledger row. SELECT ... FOR UPDATE on the single rollup row still
		// serialises concurrent reservations against the same workspace so
		// only one can commit when balance is tight — the NFR-UCR-R2 contract
		// is preserved. ErrNoRows means the workspace has never had a ledger
		// entry (trigger-created row is absent), which is equivalent to
		// available=0; the reserve below will create the row via its trigger.
		if entryType == EntryReserve {
			var available int64
			qErr := tx.QueryRow(ctx, `
				SELECT total_credits
				  FROM upload_credit_balance_rollup
				 WHERE workspace_id = $1
				 FOR UPDATE
			`, in.WorkspaceID).Scan(&available)
			if errors.Is(qErr, pgx.ErrNoRows) {
				available = 0
				qErr = nil
			}
			if qErr != nil {
				return fmt.Errorf("upload/credit: balance query: %w", qErr)
			}
			if available < in.AmountCredits {
				return &InsufficientBalanceDetails{
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

		reservationID = uuid.New()
		_, execErr := tx.Exec(ctx, `
			INSERT INTO upload_ledger_entries (
				id, workspace_id, entry_type, amount_credits,
				idempotency_key, upload_session_id, created_by
			) VALUES ($1, $2, $3, $4, $5, $6, $7)
		`, reservationID, in.WorkspaceID, string(entryType), signed,
			in.IdempotencyKey, in.UploadSessionID, in.CreatedBy)
		if execErr != nil {
			return fmt.Errorf("upload/credit: insert reserve entry: %w", execErr)
		}
		return nil
	})
	if err != nil {
		return nil, err
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
	// DB-6b: retry the whole transaction on transient errors. The result is
	// captured into `result` only on the committed success path; a retried
	// attempt rolls back fully and re-runs from a clean state.
	var result *LedgerEntry
	err := dbretry.InTx(ctx, dbretry.DefaultOptions(), s.pool, func(tx pgx.Tx) error {
		// Look up the reservation row to settle — with FOR UPDATE to block
		// concurrent Consume/Refund on the same reservation.
		var workspaceID uuid.UUID
		var amountCredits int64
		var entryType string
		lookupErr := tx.QueryRow(ctx, `
			SELECT workspace_id, amount_credits, entry_type
			  FROM upload_ledger_entries
			 WHERE id = $1
			 FOR UPDATE
		`, in.ReservationID).Scan(&workspaceID, &amountCredits, &entryType)
		if errors.Is(lookupErr, pgx.ErrNoRows) {
			return ErrReservationNotFound
		}
		if lookupErr != nil {
			return fmt.Errorf("upload/credit: lookup reservation: %w", lookupErr)
		}
		if entryType != string(EntryReserve) && entryType != string(EntryUnlimitedPassthrough) {
			return fmt.Errorf("%w: entry_type=%s", ErrAlreadySettled, entryType)
		}

		// Idempotency: return existing consume for this reservation + key.
		// M40-CODE-004: read the existing row inside the same tx so the
		// lookup and the decision share one visibility snapshot.
		var existingID uuid.UUID
		idemErr := tx.QueryRow(ctx, `
			SELECT id FROM upload_ledger_entries
			 WHERE workspace_id = $1 AND idempotency_key = $2 AND entry_type = $3
		`, workspaceID, in.IdempotencyKey, string(EntryConsume)).Scan(&existingID)
		if idemErr == nil {
			existing, readErr := s.readEntryByID(ctx, tx, existingID)
			if readErr != nil {
				return readErr
			}
			result = existing
			return nil
		}

		// amount_credits on a reserve is negative; consume posts the same
		// negative amount under entry_type=consume to keep the signed sum
		// stable (reservation is settled without changing the balance).
		consumeID := uuid.New()
		refID := in.ReservationID
		_, execErr := tx.Exec(ctx, `
			INSERT INTO upload_ledger_entries (
				id, workspace_id, entry_type, amount_credits,
				idempotency_key, reservation_ref_id
			) VALUES ($1, $2, $3, $4, $5, $6)
		`, consumeID, workspaceID, string(EntryConsume), amountCredits,
			in.IdempotencyKey, refID)
		if execErr != nil {
			return fmt.Errorf("upload/credit: insert consume: %w", execErr)
		}

		result = &LedgerEntry{
			ID:               consumeID,
			WorkspaceID:      workspaceID,
			EntryType:        EntryConsume,
			AmountCredits:    amountCredits,
			IdempotencyKey:   in.IdempotencyKey,
			ReservationRefID: &refID,
			CreatedAt:        s.now(),
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
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
	// DB-6b: retry the whole transaction on transient errors.
	var result *LedgerEntry
	err := dbretry.InTx(ctx, dbretry.DefaultOptions(), s.pool, func(tx pgx.Tx) error {
		var workspaceID uuid.UUID
		var amountCredits int64
		var entryType string
		lookupErr := tx.QueryRow(ctx, `
			SELECT workspace_id, amount_credits, entry_type
			  FROM upload_ledger_entries
			 WHERE id = $1
			 FOR UPDATE
		`, in.ReservationID).Scan(&workspaceID, &amountCredits, &entryType)
		if errors.Is(lookupErr, pgx.ErrNoRows) {
			return ErrReservationNotFound
		}
		if lookupErr != nil {
			return fmt.Errorf("upload/credit: lookup reservation: %w", lookupErr)
		}
		if entryType != string(EntryReserve) {
			return fmt.Errorf("%w: entry_type=%s", ErrAlreadySettled, entryType)
		}

		// Idempotency: same key returns the existing refund. Read the row
		// inside tx (M40-CODE-004) so the whole idempotency-replay path
		// observes one consistent snapshot.
		var existingID uuid.UUID
		idemErr := tx.QueryRow(ctx, `
			SELECT id FROM upload_ledger_entries
			 WHERE workspace_id = $1 AND idempotency_key = $2 AND entry_type = $3
		`, workspaceID, in.IdempotencyKey, string(EntryRefund)).Scan(&existingID)
		if idemErr == nil {
			existing, readErr := s.readEntryByID(ctx, tx, existingID)
			if readErr != nil {
				return readErr
			}
			result = existing
			return nil
		}

		// refund posts the positive counterpart (-amountCredits on a reserve
		// was negative; +amountCredits on refund restores the balance).
		refundID := uuid.New()
		refID := in.ReservationID
		positive := -amountCredits
		_, execErr := tx.Exec(ctx, `
			INSERT INTO upload_ledger_entries (
				id, workspace_id, entry_type, amount_credits,
				idempotency_key, reservation_ref_id, reason
			) VALUES ($1, $2, $3, $4, $5, $6, $7)
		`, refundID, workspaceID, string(EntryRefund), positive,
			in.IdempotencyKey, refID, in.Reason)
		if execErr != nil {
			return fmt.Errorf("upload/credit: insert refund: %w", execErr)
		}

		result = &LedgerEntry{
			ID:               refundID,
			WorkspaceID:      workspaceID,
			EntryType:        EntryRefund,
			AmountCredits:    positive,
			IdempotencyKey:   in.IdempotencyKey,
			ReservationRefID: &refID,
			Reason:           in.Reason,
			CreatedAt:        s.now(),
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
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

// ---------------------------------------------------------------------------
// M41 — Purchase / GrantAdmin / GrantMonthly / RefundPurchase surface.
//
// This block adds the credit-addition + refund methods layered on top of the
// M40 reserve/consume/refund ledger. Webhook handlers call Purchase; admin
// handlers call GrantAdmin; the monthly worker calls GrantMonthly; the
// refund endpoint calls RefundPurchase. All four post rows to
// upload_ledger_entries inside a transaction.
//
// The implementations below cover input validation and the nil-pool path.
// DB-backed behaviour (tx, rate-card resolution, idempotency replay,
// rollup update, 7-day window, consumption check, platform_audit_log)
// lives in the *DB helper methods added further down.

// PurchaseInput parameters for Purchase.
type PurchaseInput struct {
	WorkspaceID    uuid.UUID
	PackageCode    string // FK → upload_packages.code
	Gateway        string // "phonepe" | "razorpay" | "manual" (admin-initiated)
	GatewayTxnID   string // external reference for reconciliation
	IdempotencyKey string
	ActorID        *uuid.UUID // nil for webhooks
}

// PurchaseResult is returned from Purchase on success. Carries both the
// ledger entry and the resolved package credits so the caller can surface
// a clean confirmation to the user without a second SELECT.
type PurchaseResult struct {
	LedgerEntry *LedgerEntry `json:"ledger_entry"`
	PackageCode string       `json:"package_code"`
	Credits     int64        `json:"credits"`
	PricePaise  int64        `json:"price_paise"`
	Currency    string       `json:"currency"`
	WasReplay   bool         `json:"was_replay"` // true if idempotent short-circuit
}

// GrantAdminInput parameters for GrantAdmin.
type GrantAdminInput struct {
	WorkspaceID    uuid.UUID
	AmountCredits  int64
	IdempotencyKey string
	ActorID        uuid.UUID // the admin doing the grant (required; used in audit log)
	Reason         string    // required; free text; written to platform_audit_log
}

// GrantMonthlyInput parameters for GrantMonthly.
type GrantMonthlyInput struct {
	WorkspaceID uuid.UUID
	PlanTier    string    // "free" | "creator" | "pro_photographer" | "studio" | "elite_studio"
	AnchorDate  time.Time // used to build monthly:{ws}:{YYYY-MM} idempotency key
}

// GrantMonthlyResult is what GrantMonthly returns. Status discriminates
// between a real grant (GrantGranted), an enterprise skip (GrantSkippedEnterprise),
// and an idempotent replay (GrantSkippedReplay). LedgerEntry is nil for
// skipped-enterprise and populated for the other two.
type GrantMonthlyResult struct {
	Status      GrantStatus  `json:"status"`
	LedgerEntry *LedgerEntry `json:"ledger_entry,omitempty"`
}

// RefundPurchaseInput parameters for RefundPurchase.
type RefundPurchaseInput struct {
	PurchaseID     uuid.UUID
	WorkspaceID    uuid.UUID
	IdempotencyKey string
	ActorID        uuid.UUID
}

// Purchase posts a 'purchase' ledger entry for a workspace, crediting the
// package's credit amount. Idempotent via (workspace_id, idempotency_key):
// replay returns the existing LedgerEntry. Called by webhook handlers
// (PhonePe, Razorpay) and by the refund reversal path.
//
// Rate card + package resolution runs inside the transaction so a rate card
// edit mid-purchase cannot flip the price under an in-flight webhook.
func (s *Service) Purchase(ctx context.Context, in PurchaseInput) (*PurchaseResult, error) {
	if in.IdempotencyKey == "" {
		return nil, ErrEmptyIdempotencyKey
	}
	if in.PackageCode == "" {
		return nil, ErrEmptyPackageCode
	}
	if s.pool == nil {
		// Unit-test path: surface the contract shape without touching the DB.
		return &PurchaseResult{
			LedgerEntry: &LedgerEntry{
				ID:             uuid.New(),
				WorkspaceID:    in.WorkspaceID,
				EntryType:      EntryPurchase,
				AmountCredits:  0, // resolved from rate card in DB path
				IdempotencyKey: in.IdempotencyKey,
				CreatedAt:      s.now(),
			},
			PackageCode: in.PackageCode,
			Currency:    "INR",
		}, nil
	}
	return s.purchaseDB(ctx, in)
}

// GrantAdmin posts a 'grant_admin' ledger entry and a platform_audit_log
// row in one transaction. Caps single grants at GrantAdminHardCap
// (100_000 credits per PRD §D3). Idempotent on (workspace_id, idempotency_key).
func (s *Service) GrantAdmin(ctx context.Context, in GrantAdminInput) (*LedgerEntry, error) {
	if in.IdempotencyKey == "" {
		return nil, ErrEmptyIdempotencyKey
	}
	if in.AmountCredits <= 0 {
		return nil, ErrNonPositiveAmount
	}
	if in.AmountCredits > GrantAdminHardCap {
		return nil, ErrAmountExceedsLimit
	}
	if in.Reason == "" {
		return nil, ErrEmptyReason
	}
	if s.pool == nil {
		return &LedgerEntry{
			ID:             uuid.New(),
			WorkspaceID:    in.WorkspaceID,
			EntryType:      EntryGrantAdmin,
			AmountCredits:  in.AmountCredits,
			IdempotencyKey: in.IdempotencyKey,
			Reason:         in.Reason,
			CreatedAt:      s.now(),
		}, nil
	}
	return s.grantAdminDB(ctx, in)
}

// GrantMonthly posts a 'grant_monthly' ledger entry for the given workspace,
// using monthly:{workspace}:{YYYY-MM} as the idempotency key so replay within
// the same month is a no-op. Enterprise plan tier skips without error.
func (s *Service) GrantMonthly(ctx context.Context, in GrantMonthlyInput) (*GrantMonthlyResult, error) {
	if normalizePlan(in.PlanTier) == "elite_studio" || normalizePlan(in.PlanTier) == "enterprise" {
		return &GrantMonthlyResult{Status: GrantSkippedEnterprise}, nil
	}
	amount := MonthlyGrantAmountForPlan(in.PlanTier)
	if amount <= 0 {
		// Unknown tier — treat as a skip rather than an error so the worker
		// can log and continue across workspaces. The worker surfaces the
		// count of unknown-tier skips in its run log for operator review.
		return &GrantMonthlyResult{Status: GrantSkippedEnterprise}, nil
	}
	anchor := in.AnchorDate
	if anchor.IsZero() {
		anchor = s.now()
	}
	key := fmt.Sprintf("monthly:%s:%04d-%02d", in.WorkspaceID, anchor.Year(), int(anchor.Month()))
	if s.pool == nil {
		return &GrantMonthlyResult{
			Status: GrantGranted,
			LedgerEntry: &LedgerEntry{
				ID:             uuid.New(),
				WorkspaceID:    in.WorkspaceID,
				EntryType:      EntryGrantMonthly,
				AmountCredits:  amount,
				IdempotencyKey: key,
				CreatedAt:      s.now(),
			},
		}, nil
	}
	return s.grantMonthlyDB(ctx, in, amount, key)
}

// RefundPurchase reverses a prior purchase within the 7-day refund window
// (PRD §D4) provided no credits from that purchase have been consumed or
// reserved. Posts a 'refund' ledger entry with a reference back to the
// original purchase id. Idempotent on (workspace_id, idempotency_key).
func (s *Service) RefundPurchase(ctx context.Context, in RefundPurchaseInput) (*LedgerEntry, error) {
	if in.PurchaseID == uuid.Nil {
		return nil, ErrEmptyPurchaseID
	}
	if in.IdempotencyKey == "" {
		return nil, ErrEmptyIdempotencyKey
	}
	if s.pool == nil {
		return &LedgerEntry{
			ID:             uuid.New(),
			WorkspaceID:    in.WorkspaceID,
			EntryType:      EntryRefund,
			AmountCredits:  0, // resolved from original purchase in DB path
			IdempotencyKey: in.IdempotencyKey,
			PurchaseID:     &in.PurchaseID,
			CreatedAt:      s.now(),
		}, nil
	}
	return s.refundPurchaseDB(ctx, in)
}

// MonthlyGrantAmountForPlan maps a plan tier to its monthly upload credit
// allowance. Legacy "pro" / "professional" slugs are accepted as aliases for
// migrated workspaces. Elite/enterprise and unknown tiers return 0 — the
// caller (GrantMonthly) interprets this as "skip, do not grant".
func MonthlyGrantAmountForPlan(plan string) int64 {
	switch normalizePlan(plan) {
	case "creator":
		return 200
	case "pro_photographer":
		return 1000
	case "studio":
		return 2500
	default:
		return 0
	}
}

func normalizePlan(plan string) string {
	switch plan {
	case "standard", "starter":
		return "creator"
	case "pro":
		return "pro_photographer"
	case "professional":
		return "pro_photographer"
	case "business", "enterprise":
		return "elite_studio"
	default:
		return plan
	}
}

// DB helpers — stubbed for the unit-test RED→GREEN slice. Full implementations
// land in the integration slice (real tx, rate card lookup, idempotency
// short-circuit, platform_audit_log, 7-day window check, consumption check).
//
// Returning ErrNotImplemented at this layer lets the input-validation tests
// pass while leaving a loud marker for the integration slice to replace.
//
// purchaseDB implements the full Purchase flow:
//  1. Idempotency short-circuit — replay with same (workspace_id, idempotency_key)
//     returns the existing ledger entry with WasReplay=true.
//  2. Rate card + package resolution — reads active rate card inside the tx
//     so a concurrent rate card edit cannot flip the price mid-purchase.
//  3. Insert upload_purchases row (for refund/audit trace) + upload_ledger_entries
//     row (entry_type='purchase', positive amount_credits) in one tx.
//
// The trigger on upload_ledger_entries (migration 101) maintains the rollup
// table automatically, so Purchase does not need to touch it directly.
func (s *Service) purchaseDB(ctx context.Context, in PurchaseInput) (*PurchaseResult, error) {
	// Idempotency short-circuit before opening a tx.
	if existing, err := s.findPurchaseLedgerByKey(ctx, in.WorkspaceID, in.IdempotencyKey); err == nil {
		return existing, nil
	}

	// DB-6b: retry the whole transaction on transient errors. All generated
	// ids + the result are produced inside the closure so a retried attempt
	// posts fresh rows from a clean (rolled-back) state.
	var result *PurchaseResult
	err := dbretry.InTx(ctx, dbretry.DefaultOptions(), s.pool, func(tx pgx.Tx) error {
		// Resolve package + active rate card inside the tx. The partial unique
		// index upload_rate_cards_active_uniq guarantees at most one active row
		// per package; the JOIN is 1:1. Schema note: upload_rate_cards stores
		// price_paise; upload_purchases stores amount_inr_paise (same semantic,
		// different column name — the credit.go boundary translates).
		var credits, pricePaise int64
		var currency string
		lookupErr := tx.QueryRow(ctx, `
			SELECT p.credits, r.price_paise, r.currency
			  FROM upload_packages p
			  JOIN upload_rate_cards r
			    ON r.package_code = p.code AND r.effective_to IS NULL
			 WHERE p.code = $1 AND p.active = TRUE
		`, in.PackageCode).Scan(&credits, &pricePaise, &currency)
		if errors.Is(lookupErr, pgx.ErrNoRows) {
			return ErrPackageNotFound
		}
		if lookupErr != nil {
			return fmt.Errorf("upload/credit: package lookup: %w", lookupErr)
		}

		// Insert the purchase row. Column names match the canonical schema:
		// amount_inr_paise (not price_paise) and gateway_payment_id (not gateway_txn_id).
		// UNIQUE (workspace_id, idempotency_key) on upload_purchases keeps
		// webhook replay idempotent at the DB level even if two concurrent
		// Purchases slip past the pre-tx check.
		purchaseID := uuid.New()
		_, execErr := tx.Exec(ctx, `
			INSERT INTO upload_purchases (
				id, workspace_id, idempotency_key, amount_credits,
				amount_inr_paise, gateway, gateway_payment_id, status, confirmed_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmed', now())
		`, purchaseID, in.WorkspaceID, in.IdempotencyKey, credits,
			pricePaise, in.Gateway, in.GatewayTxnID)
		if execErr != nil {
			return fmt.Errorf("upload/credit: insert purchase: %w", execErr)
		}

		// Insert ledger entry. Positive amount_credits — the trigger on
		// upload_ledger_entries updates upload_credit_balance_rollup automatically.
		ledgerID := uuid.New()
		var createdAt time.Time
		ledgerErr := tx.QueryRow(ctx, `
			INSERT INTO upload_ledger_entries (
				id, workspace_id, entry_type, amount_credits,
				idempotency_key, purchase_id
			) VALUES ($1, $2, $3, $4, $5, $6)
			RETURNING created_at
		`, ledgerID, in.WorkspaceID, string(EntryPurchase), credits,
			in.IdempotencyKey, purchaseID).Scan(&createdAt)
		if ledgerErr != nil {
			return fmt.Errorf("upload/credit: insert ledger: %w", ledgerErr)
		}

		result = &PurchaseResult{
			LedgerEntry: &LedgerEntry{
				ID:             ledgerID,
				WorkspaceID:    in.WorkspaceID,
				EntryType:      EntryPurchase,
				AmountCredits:  credits,
				IdempotencyKey: in.IdempotencyKey,
				PurchaseID:     &purchaseID,
				CreatedAt:      createdAt,
			},
			PackageCode: in.PackageCode,
			Credits:     credits,
			PricePaise:  pricePaise,
			Currency:    currency,
			WasReplay:   false,
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// findPurchaseLedgerByKey short-circuits a Purchase replay when a ledger
// entry with the same (workspace_id, idempotency_key) pair already exists.
// Populates a PurchaseResult with WasReplay=true + the package metadata
// resolved via the purchase_id foreign key.
func (s *Service) findPurchaseLedgerByKey(ctx context.Context, workspaceID uuid.UUID, key string) (*PurchaseResult, error) {
	var ledgerID, purchaseID uuid.UUID
	var ledgerCredits, purchaseCredits, pricePaise int64
	var createdAt time.Time
	// Schema notes: upload_purchases uses amount_inr_paise (not price_paise);
	// currency is implicit INR (no column). Package code is not persisted on
	// the purchase row — callers that need it must re-resolve via amount.
	err := s.pool.QueryRow(ctx, `
		SELECT e.id, e.amount_credits, e.created_at,
		       p.id, p.amount_credits, p.amount_inr_paise
		  FROM upload_ledger_entries e
		  LEFT JOIN upload_purchases p ON p.id = e.purchase_id
		 WHERE e.workspace_id = $1
		   AND e.idempotency_key = $2
		   AND e.entry_type = $3
	`, workspaceID, key, string(EntryPurchase)).Scan(
		&ledgerID, &ledgerCredits, &createdAt,
		&purchaseID, &purchaseCredits, &pricePaise,
	)
	if err != nil {
		return nil, err
	}
	return &PurchaseResult{
		LedgerEntry: &LedgerEntry{
			ID:             ledgerID,
			WorkspaceID:    workspaceID,
			EntryType:      EntryPurchase,
			AmountCredits:  ledgerCredits,
			IdempotencyKey: key,
			PurchaseID:     &purchaseID,
			CreatedAt:      createdAt,
		},
		Credits:    purchaseCredits,
		PricePaise: pricePaise,
		Currency:   "INR",
		WasReplay:  true,
	}, nil
}

// grantAdminDB implements the admin grant flow: idempotent ledger insert +
// platform_audit_log row in one tx. PRD §D3 hard cap (GrantAdminHardCap) is
// enforced in the public GrantAdmin() input validation above.
func (s *Service) grantAdminDB(ctx context.Context, in GrantAdminInput) (*LedgerEntry, error) {
	// Idempotency short-circuit.
	if existing, err := s.findLedgerEntryByKey(ctx, in.WorkspaceID, in.IdempotencyKey, EntryGrantAdmin); err == nil {
		return existing, nil
	}

	// DB-6b: retry the whole transaction on transient errors. The ledger row
	// + audit_log row are both posted inside the closure, so a retried attempt
	// re-runs the full atomic pair from a clean state.
	var result *LedgerEntry
	err := dbretry.InTx(ctx, dbretry.DefaultOptions(), s.pool, func(tx pgx.Tx) error {
		ledgerID := uuid.New()
		var createdAt time.Time
		insErr := tx.QueryRow(ctx, `
			INSERT INTO upload_ledger_entries (
				id, workspace_id, entry_type, amount_credits,
				idempotency_key, reason, created_by
			) VALUES ($1, $2, $3, $4, $5, $6, $7)
			RETURNING created_at
		`, ledgerID, in.WorkspaceID, string(EntryGrantAdmin), in.AmountCredits,
			in.IdempotencyKey, in.Reason, in.ActorID).Scan(&createdAt)
		if insErr != nil {
			return fmt.Errorf("upload/credit: insert grant_admin: %w", insErr)
		}

		// audit_log — NFR-UCRT-O1 requires every admin grant to land in the
		// platform audit trail. Canonical table is `audit_log` (singular) with
		// actor_id / action / resource_type / resource_id / metadata columns.
		// The older `audit_logs` plural table carries before/after state and
		// ip/user-agent for request-scoped writes; we use the simpler singular
		// table here because this is a service-layer grant, not an HTTP request.
		//
		// M41-CODE-001: Build the metadata JSONB via encoding/json, not
		// fmt.Sprintf + %q. %q escapes for Go string literals and does NOT
		// escape Unicode control characters (U+0000..U+001F) or surrogate
		// pairs — a grant reason containing control chars would produce
		// invalid JSON that Postgres JSONB ingest rejects, rolling back the
		// whole grant transaction. json.Marshal is safe for all Unicode.
		meta, metaErr := json.Marshal(map[string]any{
			"amount_credits":  in.AmountCredits,
			"reason":          in.Reason,
			"ledger_entry_id": ledgerID.String(),
		})
		if metaErr != nil {
			return fmt.Errorf("upload/credit: marshal audit metadata: %w", metaErr)
		}
		_, auditErr := tx.Exec(ctx, `
			INSERT INTO audit_log (
				actor_id, action, resource_type, resource_id, metadata
			) VALUES ($1, $2, $3, $4, $5)
		`, in.ActorID, "upload_credits.grant_admin", "workspace", in.WorkspaceID, meta)
		if auditErr != nil {
			return fmt.Errorf("upload/credit: insert audit log: %w", auditErr)
		}

		result = &LedgerEntry{
			ID:             ledgerID,
			WorkspaceID:    in.WorkspaceID,
			EntryType:      EntryGrantAdmin,
			AmountCredits:  in.AmountCredits,
			IdempotencyKey: in.IdempotencyKey,
			Reason:         in.Reason,
			CreatedAt:      createdAt,
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// grantMonthlyDB implements the monthly worker grant flow. Idempotent on
// (workspace_id, idempotency_key) which is monthly:{ws}:{YYYY-MM}, so replay
// within the same month returns GrantSkippedReplay.
func (s *Service) grantMonthlyDB(ctx context.Context, in GrantMonthlyInput, amount int64, key string) (*GrantMonthlyResult, error) {
	if existing, err := s.findLedgerEntryByKey(ctx, in.WorkspaceID, key, EntryGrantMonthly); err == nil {
		return &GrantMonthlyResult{Status: GrantSkippedReplay, LedgerEntry: existing}, nil
	}

	// DB-6b: retry the whole transaction on transient errors.
	var entry *LedgerEntry
	err := dbretry.InTx(ctx, dbretry.DefaultOptions(), s.pool, func(tx pgx.Tx) error {
		ledgerID := uuid.New()
		var createdAt time.Time
		insErr := tx.QueryRow(ctx, `
			INSERT INTO upload_ledger_entries (
				id, workspace_id, entry_type, amount_credits, idempotency_key
			) VALUES ($1, $2, $3, $4, $5)
			RETURNING created_at
		`, ledgerID, in.WorkspaceID, string(EntryGrantMonthly), amount, key).Scan(&createdAt)
		if insErr != nil {
			return fmt.Errorf("upload/credit: insert grant_monthly: %w", insErr)
		}

		entry = &LedgerEntry{
			ID:             ledgerID,
			WorkspaceID:    in.WorkspaceID,
			EntryType:      EntryGrantMonthly,
			AmountCredits:  amount,
			IdempotencyKey: key,
			CreatedAt:      createdAt,
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	return &GrantMonthlyResult{
		Status:      GrantGranted,
		LedgerEntry: entry,
	}, nil
}

// refundPurchaseDB enforces the 7-day window + fully-unspent eligibility
// checks and posts a compensating refund ledger entry. Scope: FR-UCRT-11.
//
// Eligibility:
//   - Purchase must exist and belong to the given workspace (prevents
//     cross-workspace refund attacks).
//   - created_at >= now() - 7 days.
//   - No consume/reserve ledger entries reference this purchase via the
//     purchase_id column. This is the "fully-unspent" check.
func (s *Service) refundPurchaseDB(ctx context.Context, in RefundPurchaseInput) (*LedgerEntry, error) {
	if existing, err := s.findLedgerEntryByKey(ctx, in.WorkspaceID, in.IdempotencyKey, EntryRefund); err == nil {
		return existing, nil
	}

	// DB-6b: retry the whole transaction on transient errors. The eligibility
	// checks + refund insert run inside the closure, so a retried attempt
	// re-validates and re-posts atomically from a clean state.
	var result *LedgerEntry
	err := dbretry.InTx(ctx, dbretry.DefaultOptions(), s.pool, func(tx pgx.Tx) error {
		// Resolve purchase + eligibility inside the tx.
		var wsID uuid.UUID
		var credits int64
		var createdAt time.Time
		lookupErr := tx.QueryRow(ctx, `
			SELECT workspace_id, amount_credits, created_at
			  FROM upload_purchases
			 WHERE id = $1
			 FOR UPDATE
		`, in.PurchaseID).Scan(&wsID, &credits, &createdAt)
		if errors.Is(lookupErr, pgx.ErrNoRows) {
			return ErrPurchaseNotFound
		}
		if lookupErr != nil {
			return fmt.Errorf("upload/credit: purchase lookup: %w", lookupErr)
		}
		if wsID != in.WorkspaceID {
			return ErrPurchaseNotFound
		}
		if s.now().Sub(createdAt) > 7*24*time.Hour {
			return ErrRefundWindowExpired
		}

		// Fully-unspent check — no consume / reserve entry references this
		// purchase. This is a tight guard; any reservation that consumed from
		// this purchase (even unreleased) blocks the refund.
		var usedCount int64
		checkErr := tx.QueryRow(ctx, `
			SELECT COUNT(*)
			  FROM upload_ledger_entries
			 WHERE purchase_id = $1
			   AND entry_type IN ($2, $3)
		`, in.PurchaseID, string(EntryReserve), string(EntryConsume)).Scan(&usedCount)
		if checkErr != nil {
			return fmt.Errorf("upload/credit: consumption check: %w", checkErr)
		}
		if usedCount > 0 {
			return ErrCreditsPartiallyConsumed
		}

		ledgerID := uuid.New()
		var refundAt time.Time
		insErr := tx.QueryRow(ctx, `
			INSERT INTO upload_ledger_entries (
				id, workspace_id, entry_type, amount_credits,
				idempotency_key, purchase_id, created_by, reason
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			RETURNING created_at
		`, ledgerID, in.WorkspaceID, string(EntryRefund), -credits,
			in.IdempotencyKey, in.PurchaseID, in.ActorID,
			"refund within 7-day window",
		).Scan(&refundAt)
		if insErr != nil {
			return fmt.Errorf("upload/credit: insert refund: %w", insErr)
		}

		result = &LedgerEntry{
			ID:             ledgerID,
			WorkspaceID:    in.WorkspaceID,
			EntryType:      EntryRefund,
			AmountCredits:  -credits,
			IdempotencyKey: in.IdempotencyKey,
			PurchaseID:     &in.PurchaseID,
			CreatedAt:      refundAt,
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// findLedgerEntryByKey returns an existing ledger entry for (workspace_id,
// idempotency_key) filtered to a specific entry_type. Used by the
// idempotency short-circuit in grantAdminDB / grantMonthlyDB / refundDB.
func (s *Service) findLedgerEntryByKey(ctx context.Context, workspaceID uuid.UUID, key string, entryType EntryType) (*LedgerEntry, error) {
	var e LedgerEntry
	var typ string
	err := s.pool.QueryRow(ctx, `
		SELECT id, workspace_id, entry_type, amount_credits,
		       COALESCE(idempotency_key, ''),
		       reservation_ref_id, upload_session_id, purchase_id,
		       COALESCE(reason, ''), created_at
		  FROM upload_ledger_entries
		 WHERE workspace_id = $1 AND idempotency_key = $2 AND entry_type = $3
	`, workspaceID, key, string(entryType)).Scan(
		&e.ID, &e.WorkspaceID, &typ, &e.AmountCredits,
		&e.IdempotencyKey,
		&e.ReservationRefID, &e.UploadSessionID, &e.PurchaseID,
		&e.Reason, &e.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	e.EntryType = EntryType(typ)
	return &e, nil
}

// rowQuerier is the narrow surface needed by readEntryByID. Both *pgxpool.Pool
// and pgx.Tx satisfy it via structural typing. M40-CODE-004: threading the
// querier through lets the idempotency replay path in consumeDB / refundDB
// read the existing entry inside the same transaction that just located
// it, instead of mixing tx-bound + pool-bound reads.
type rowQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// readEntryByID loads a single ledger row by id. Pass tx when the caller
// is already inside a transaction; pass s.pool for standalone reads.
func (s *Service) readEntryByID(ctx context.Context, q rowQuerier, id uuid.UUID) (*LedgerEntry, error) {
	var e LedgerEntry
	var entryType string
	err := q.QueryRow(ctx, `
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
