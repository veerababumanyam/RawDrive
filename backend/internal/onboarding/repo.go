package onboarding

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// StatusRecord is the persistence-layer representation of an onboarding
// row. Unlike OnboardingStatus (which is the JSON wire shape), StateID
// here is a pointer to int so we can distinguish "not yet selected"
// (nil) from "state 0" (which should never happen but is
// grammatically distinct).
//
// BusinessName / DisplayName / GSTIN are stored as plain strings; the
// Upsert implementation translates the empty string into SQL NULL via
// NULLIF so the COALESCE-on-conflict dance preserves prior values.
type StatusRecord struct {
	UserID       string
	CurrentStep  Step
	StateID      *int
	BusinessName string
	DisplayName  string
	GSTIN        string
}

// Repository is the persistence boundary for onboarding status. The
// service layer goes through this interface, not direct SQL, so tests
// can substitute an in-memory stub without needing a live Postgres.
//
// ResolveStateID lives on this interface because (a) it is a read
// against the same database connection pool, (b) it keeps the 5-way
// state lookup in one place instead of duplicated between the service
// and the main.go workspace-creator adapter, and (c) the service needs
// to call it before upserting, so coupling them is natural.
type Repository interface {
	// Get returns the current row for a user, or nil if none exists.
	// A nil-nil return is "user has never started onboarding" — callers
	// should treat that as StepStateSelection with no other fields set.
	Get(ctx context.Context, userID string) (*StatusRecord, error)

	// Upsert creates or updates the row. On conflict, nil/empty fields
	// on the input do NOT overwrite the existing row — this makes the
	// individual steps idempotent and safely replayable.
	Upsert(ctx context.Context, rec *StatusRecord) error

	// ResolveStateID accepts any human-supplied identifier — numeric id,
	// 2-letter code, "IN-XX" code, or full state name (case-insensitive)
	// — and returns the canonical integer id from the states table.
	// Returns ErrInvalidState if no match. Callers do NOT need to
	// pre-sanitize the input; the 5-way OR lookup handles everything.
	ResolveStateID(ctx context.Context, raw string) (int, error)
}

// PgRepo is the production implementation backed by pgx.
type PgRepo struct {
	pool *pgxpool.Pool
}

// NewPgRepo constructs the pgx-backed repo. The pool must already be
// connected; we do not lazily connect here.
func NewPgRepo(pool *pgxpool.Pool) *PgRepo {
	return &PgRepo{pool: pool}
}

func (r *PgRepo) Get(ctx context.Context, userID string) (*StatusRecord, error) {
	var (
		step         string
		stateID      *int
		businessName *string
		displayName  *string
		gstin        *string
	)
	err := r.pool.QueryRow(ctx,
		`SELECT current_step, state_id, business_name, display_name, gstin
		 FROM onboarding_statuses WHERE user_id = $1`, userID,
	).Scan(&step, &stateID, &businessName, &displayName, &gstin)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("onboarding repo get: %w", err)
	}

	rec := &StatusRecord{
		UserID:      userID,
		CurrentStep: Step(step),
		StateID:     stateID,
	}
	if businessName != nil {
		rec.BusinessName = *businessName
	}
	if displayName != nil {
		rec.DisplayName = *displayName
	}
	if gstin != nil {
		rec.GSTIN = *gstin
	}
	return rec, nil
}

func (r *PgRepo) Upsert(ctx context.Context, rec *StatusRecord) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO onboarding_statuses
		     (user_id, current_step, state_id, business_name, display_name, gstin)
		 VALUES ($1, $2, $3, NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''))
		 ON CONFLICT (user_id) DO UPDATE SET
		     current_step  = EXCLUDED.current_step,
		     state_id      = COALESCE(EXCLUDED.state_id, onboarding_statuses.state_id),
		     business_name = COALESCE(EXCLUDED.business_name, onboarding_statuses.business_name),
		     display_name  = COALESCE(EXCLUDED.display_name, onboarding_statuses.display_name),
		     gstin         = COALESCE(EXCLUDED.gstin, onboarding_statuses.gstin),
		     updated_at    = NOW()`,
		rec.UserID,
		string(rec.CurrentStep),
		rec.StateID,
		rec.BusinessName,
		rec.DisplayName,
		rec.GSTIN,
	)
	if err != nil {
		return fmt.Errorf("onboarding repo upsert: %w", err)
	}
	return nil
}

func (r *PgRepo) ResolveStateID(ctx context.Context, raw string) (int, error) {
	if raw == "" {
		return 0, ErrInvalidState
	}
	var id int
	err := r.pool.QueryRow(ctx,
		// The 5-way OR lookup is copied verbatim from the legacy
		// onboardingWorkspaceCreator adapter in cmd/api/main.go — we
		// keep it here (not there) so the service layer validates at
		// the earliest point and main.go's adapter can become a thin
		// pass-through.
		`SELECT id FROM states
		 WHERE code = $1
		    OR code = 'IN-' || $1
		    OR REPLACE(code, 'IN-', '') = $1
		    OR UPPER(name) = UPPER($1)
		    OR id::text = $1
		 LIMIT 1`, raw,
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrInvalidState
	}
	if err != nil {
		return 0, fmt.Errorf("onboarding repo resolve state: %w", err)
	}
	return id, nil
}
