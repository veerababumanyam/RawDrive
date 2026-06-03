// Package rate provides the super-admin CRUD surface for streaming packages
// and their versioned rate cards.
//
// M31 / E103-S1 — Rate-card CRUD backend.
//
// Contract: new rates are insert-only. Editing a rate = inserting a new row
// with effective_from > now(). Past purchases reference the rate_card row
// active at purchase time, so future rates never retro-price old purchases.
package rate

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Package is a streaming_packages row.
type Package struct {
	ID                   uuid.UUID  `json:"id"`
	WorkspaceID          *uuid.UUID `json:"workspace_id,omitempty"`
	Code                 string     `json:"code"`
	Name                 string     `json:"name"`
	Tier                 string     `json:"tier"`
	Minutes              int        `json:"minutes"`
	MaxConcurrentViewers int        `json:"max_concurrent_viewers"`
	ReplayTTLDays        int        `json:"replay_ttl_days"`
	IsActive             bool       `json:"is_active"`
	CreatedAt            time.Time  `json:"created_at"`
	UpdatedAt            time.Time  `json:"updated_at"`
}

// RateCard is a streaming_rate_cards row.
type RateCard struct {
	ID                     uuid.UUID  `json:"id"`
	PackageID              uuid.UUID  `json:"package_id"`
	PricePaise             int64      `json:"price_paise"`
	BaseRatePaisePerMin    int64      `json:"base_rate_paise_per_min"`
	OverageRatePaisePerMin int64      `json:"overage_rate_paise_per_min"`
	EffectiveFrom          time.Time  `json:"effective_from"`
	CreatedBy              *uuid.UUID `json:"created_by,omitempty"`
	CreatedAt              time.Time  `json:"created_at"`
}

// CreatePackageInput is the POST body for creating a package.
type CreatePackageInput struct {
	Code                 string `json:"code"`
	Name                 string `json:"name"`
	Tier                 string `json:"tier"`
	Minutes              int    `json:"minutes"`
	MaxConcurrentViewers int    `json:"max_concurrent_viewers"`
	ReplayTTLDays        int    `json:"replay_ttl_days"`
}

// PatchPackageInput is the PATCH body — pointer fields for partial updates.
type PatchPackageInput struct {
	Name                 *string `json:"name,omitempty"`
	Minutes              *int    `json:"minutes,omitempty"`
	MaxConcurrentViewers *int    `json:"max_concurrent_viewers,omitempty"`
	ReplayTTLDays        *int    `json:"replay_ttl_days,omitempty"`
	IsActive             *bool   `json:"is_active,omitempty"`
}

// CreateRateCardInput is the POST body for a new rate-card version.
type CreateRateCardInput struct {
	PricePaise             int64     `json:"price_paise"`
	BaseRatePaisePerMin    int64     `json:"base_rate_paise_per_min"`
	OverageRatePaisePerMin int64     `json:"overage_rate_paise_per_min"`
	EffectiveFrom          time.Time `json:"effective_from"`
}

// Errors.
var (
	ErrInvalidTier            = errors.New("rate: tier must be basic, pro, or enterprise")
	ErrNonPositiveMinutes     = errors.New("rate: minutes must be > 0")
	ErrNonPositiveViewers     = errors.New("rate: max_concurrent_viewers must be > 0")
	ErrNonPositiveTTL         = errors.New("rate: replay_ttl_days must be > 0")
	ErrNonPositivePrice       = errors.New("rate: price_paise must be >= 0")
	ErrNonPositiveRate        = errors.New("rate: base/overage rate must be > 0")
	ErrEffectiveFromPast      = errors.New("rate: effective_from must be in the future")
	ErrPackageNotFound        = errors.New("rate: package not found")
	ErrDuplicateEffectiveFrom = errors.New("rate: a rate card already exists at this effective_from")
)

// Service is the rate-card CRUD service.
type Service struct {
	pool *pgxpool.Pool
	now  func() time.Time // override in tests
}

// NewService constructs a Service.
func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, now: time.Now}
}

// ListPackages returns all packages visible to the caller (platform-global +
// workspace-custom, subject to RLS).
func (s *Service) ListPackages(ctx context.Context) ([]Package, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, workspace_id, code, name, tier, minutes, max_concurrent_viewers,
		        replay_ttl_days, is_active, created_at, updated_at
		   FROM streaming_packages
		  ORDER BY tier, minutes`,
	)
	if err != nil {
		return nil, fmt.Errorf("rate: list packages: %w", err)
	}
	defer rows.Close()

	var out []Package
	for rows.Next() {
		var p Package
		if err := rows.Scan(
			&p.ID, &p.WorkspaceID, &p.Code, &p.Name, &p.Tier,
			&p.Minutes, &p.MaxConcurrentViewers, &p.ReplayTTLDays,
			&p.IsActive, &p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("rate: scan package: %w", err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// GetPackage fetches one package by ID.
func (s *Service) GetPackage(ctx context.Context, id uuid.UUID) (*Package, error) {
	var p Package
	err := s.pool.QueryRow(ctx,
		`SELECT id, workspace_id, code, name, tier, minutes, max_concurrent_viewers,
		        replay_ttl_days, is_active, created_at, updated_at
		   FROM streaming_packages WHERE id = $1`,
		id,
	).Scan(&p.ID, &p.WorkspaceID, &p.Code, &p.Name, &p.Tier,
		&p.Minutes, &p.MaxConcurrentViewers, &p.ReplayTTLDays,
		&p.IsActive, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrPackageNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("rate: get package: %w", err)
	}
	return &p, nil
}

// CreatePackage inserts a new (platform-global) package. Returns ErrInvalidTier
// etc. on validation failure.
func (s *Service) CreatePackage(ctx context.Context, in CreatePackageInput) (*Package, error) {
	if err := validatePackageInput(in); err != nil {
		return nil, err
	}
	id := uuid.New()
	_, err := s.pool.Exec(ctx,
		`INSERT INTO streaming_packages (id, code, name, tier, minutes,
		                                 max_concurrent_viewers, replay_ttl_days)
		 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		id, in.Code, in.Name, in.Tier, in.Minutes, in.MaxConcurrentViewers, in.ReplayTTLDays,
	)
	if err != nil {
		return nil, fmt.Errorf("rate: insert package: %w", err)
	}
	return s.GetPackage(ctx, id)
}

// PatchPackage applies a partial update.
func (s *Service) PatchPackage(ctx context.Context, id uuid.UUID, in PatchPackageInput) (*Package, error) {
	if in.Minutes != nil && *in.Minutes <= 0 {
		return nil, ErrNonPositiveMinutes
	}
	if in.MaxConcurrentViewers != nil && *in.MaxConcurrentViewers <= 0 {
		return nil, ErrNonPositiveViewers
	}
	if in.ReplayTTLDays != nil && *in.ReplayTTLDays <= 0 {
		return nil, ErrNonPositiveTTL
	}

	_, err := s.pool.Exec(ctx,
		`UPDATE streaming_packages
		    SET name                   = COALESCE($2, name),
		        minutes                = COALESCE($3, minutes),
		        max_concurrent_viewers = COALESCE($4, max_concurrent_viewers),
		        replay_ttl_days        = COALESCE($5, replay_ttl_days),
		        is_active              = COALESCE($6, is_active),
		        updated_at             = now()
		  WHERE id = $1`,
		id, in.Name, in.Minutes, in.MaxConcurrentViewers, in.ReplayTTLDays, in.IsActive,
	)
	if err != nil {
		return nil, fmt.Errorf("rate: patch package: %w", err)
	}
	return s.GetPackage(ctx, id)
}

// ListRateCards returns all rate-card versions for a package, newest first.
func (s *Service) ListRateCards(ctx context.Context, packageID uuid.UUID) ([]RateCard, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, package_id, price_paise, base_rate_paise_per_min,
		        overage_rate_paise_per_min, effective_from, created_by, created_at
		   FROM streaming_rate_cards
		  WHERE package_id = $1
		  ORDER BY effective_from DESC`,
		packageID,
	)
	if err != nil {
		return nil, fmt.Errorf("rate: list rate cards: %w", err)
	}
	defer rows.Close()

	var out []RateCard
	for rows.Next() {
		var r RateCard
		if err := rows.Scan(&r.ID, &r.PackageID, &r.PricePaise,
			&r.BaseRatePaisePerMin, &r.OverageRatePaisePerMin,
			&r.EffectiveFrom, &r.CreatedBy, &r.CreatedAt); err != nil {
			return nil, fmt.Errorf("rate: scan rate card: %w", err)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// CreateRateCard appends a new immutable rate-card version. effective_from
// MUST be in the future (F-014 D1 guarantee: no retro-pricing).
func (s *Service) CreateRateCard(ctx context.Context, packageID uuid.UUID, createdBy *uuid.UUID, in CreateRateCardInput) (*RateCard, error) {
	if in.PricePaise < 0 {
		return nil, ErrNonPositivePrice
	}
	if in.BaseRatePaisePerMin <= 0 || in.OverageRatePaisePerMin <= 0 {
		return nil, ErrNonPositiveRate
	}
	if !in.EffectiveFrom.After(s.now()) {
		return nil, ErrEffectiveFromPast
	}

	// Confirm package exists.
	if _, err := s.GetPackage(ctx, packageID); err != nil {
		return nil, err
	}

	id := uuid.New()
	_, err := s.pool.Exec(ctx,
		`INSERT INTO streaming_rate_cards (
			id, package_id, price_paise, base_rate_paise_per_min,
			overage_rate_paise_per_min, effective_from, created_by
		 ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		id, packageID, in.PricePaise, in.BaseRatePaisePerMin,
		in.OverageRatePaisePerMin, in.EffectiveFrom, createdBy,
	)
	if err != nil {
		// UNIQUE (package_id, effective_from) violation surfaces as 23505.
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrDuplicateEffectiveFrom
		}
		return nil, fmt.Errorf("rate: insert rate card: %w", err)
	}

	var r RateCard
	err = s.pool.QueryRow(ctx,
		`SELECT id, package_id, price_paise, base_rate_paise_per_min,
		        overage_rate_paise_per_min, effective_from, created_by, created_at
		   FROM streaming_rate_cards WHERE id = $1`,
		id,
	).Scan(&r.ID, &r.PackageID, &r.PricePaise,
		&r.BaseRatePaisePerMin, &r.OverageRatePaisePerMin,
		&r.EffectiveFrom, &r.CreatedBy, &r.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("rate: reload rate card: %w", err)
	}
	return &r, nil
}

func validatePackageInput(in CreatePackageInput) error {
	switch in.Tier {
	case "basic", "pro", "enterprise":
	default:
		return ErrInvalidTier
	}
	if in.Minutes <= 0 {
		return ErrNonPositiveMinutes
	}
	if in.MaxConcurrentViewers <= 0 {
		return ErrNonPositiveViewers
	}
	if in.ReplayTTLDays <= 0 {
		return ErrNonPositiveTTL
	}
	return nil
}
