package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PricingCatalogService struct {
	db *pgxpool.Pool
}

func NewPricingCatalogService(db *pgxpool.Pool) *PricingCatalogService {
	return &PricingCatalogService{db: db}
}

type PricingCatalog struct {
	GeneratedAt       time.Time               `json:"generated_at"`
	Plans             []PlanCatalogEntry      `json:"plans"`
	EventPacks        []BillingProductCatalog `json:"event_packs"`
	GalleryExtensions []BillingProductCatalog `json:"gallery_extensions"`
	StorageBoosters   []BillingProductCatalog `json:"storage_boosters"`
}

type BillingProductCatalog struct {
	Code            string         `json:"code"`
	ProductType     string         `json:"product_type"`
	VersionID       string         `json:"version_id"`
	Version         int            `json:"version"`
	Name            string         `json:"name"`
	Description     string         `json:"description"`
	Currency        string         `json:"currency"`
	PricePaise      int64          `json:"price_paise"`
	BillingInterval string         `json:"billing_interval"`
	Metadata        map[string]any `json:"metadata"`
	Rank            int            `json:"rank"`
	Active          bool           `json:"active"`
	EffectiveFrom   time.Time      `json:"effective_from"`
}

func (s *PricingCatalogService) PublicCatalog(ctx context.Context) (PricingCatalog, error) {
	if s == nil || s.db == nil {
		return PricingCatalog{}, errors.New("pricing catalog database not configured")
	}
	plans, err := s.currentApprovedPlans(ctx)
	if err != nil {
		return PricingCatalog{}, err
	}
	products, err := s.currentApprovedProducts(ctx)
	if err != nil {
		return PricingCatalog{}, err
	}
	catalog := PricingCatalog{
		GeneratedAt: time.Now().UTC(),
		Plans:       plans,
	}
	for _, product := range products {
		switch product.ProductType {
		case "event_upload":
			catalog.EventPacks = append(catalog.EventPacks, product)
		case "gallery_extension":
			catalog.GalleryExtensions = append(catalog.GalleryExtensions, product)
		case "storage_booster":
			catalog.StorageBoosters = append(catalog.StorageBoosters, product)
		}
	}
	return catalog, nil
}

func (s *PricingCatalogService) AdminCatalog(ctx context.Context) (PricingCatalog, error) {
	if s == nil || s.db == nil {
		return PricingCatalog{}, errors.New("pricing catalog database not configured")
	}
	plans, err := NewPlanCatalogService(s.db).List(ctx, true)
	if err != nil {
		return PricingCatalog{}, err
	}
	products, err := s.currentManageableProducts(ctx)
	if err != nil {
		return PricingCatalog{}, err
	}
	return buildPricingCatalog(plans, products), nil
}

func buildPricingCatalog(plans []PlanCatalogEntry, products []BillingProductCatalog) PricingCatalog {
	catalog := PricingCatalog{
		GeneratedAt: time.Now().UTC(),
		Plans:       plans,
	}
	for _, product := range products {
		switch product.ProductType {
		case "event_upload":
			catalog.EventPacks = append(catalog.EventPacks, product)
		case "gallery_extension":
			catalog.GalleryExtensions = append(catalog.GalleryExtensions, product)
		case "storage_booster":
			catalog.StorageBoosters = append(catalog.StorageBoosters, product)
		}
	}
	return catalog
}

func (s *PricingCatalogService) currentApprovedPlans(ctx context.Context) ([]PlanCatalogEntry, error) {
	rows, err := s.db.Query(ctx, `
		WITH ranked AS (
			SELECT spv.*,
			       ROW_NUMBER() OVER (
			           PARTITION BY spv.tier
			           ORDER BY spv.effective_from DESC, spv.version DESC
			       ) AS rn
			  FROM subscription_plan_versions spv
			 WHERE spv.status IN ('approved', 'published')
			   AND spv.active = TRUE
			   AND spv.archived_at IS NULL
			   AND spv.effective_from <= NOW()
			   AND (spv.effective_to IS NULL OR spv.effective_to > NOW())
		)
		SELECT tier, name, description, currency, monthly_price_paise,
		       annual_price_paise, quota_bytes, gallery_limit, client_limit,
		       features, popular, rank, paid, active, self_serve, trial_days
		  FROM ranked
		 WHERE rn = 1
		 ORDER BY rank ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("pricing catalog: load plan versions: %w", err)
	}
	defer rows.Close()
	var plans []PlanCatalogEntry
	for rows.Next() {
		plan, err := scanPlanCatalogEntry(rows)
		if err != nil {
			return nil, err
		}
		plans = append(plans, plan)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(plans) == 0 {
		fallback := NewPlanCatalogService(s.db)
		return fallback.List(ctx, false)
	}
	return plans, nil
}

func (s *PricingCatalogService) currentApprovedProducts(ctx context.Context) ([]BillingProductCatalog, error) {
	rows, err := s.db.Query(ctx, `
		WITH ranked AS (
			SELECT bp.code, bp.product_type,
			       bpv.id, bpv.version, bpv.name, bpv.description,
			       bpv.currency, bpv.price_paise, bpv.billing_interval,
			       bpv.metadata, bpv.rank, bpv.active, bpv.effective_from,
			       ROW_NUMBER() OVER (
			           PARTITION BY bpv.product_code
			           ORDER BY bpv.effective_from DESC, bpv.version DESC
			       ) AS rn
			  FROM billing_product_versions bpv
			  JOIN billing_products bp ON bp.code = bpv.product_code
			 WHERE bp.active = TRUE
			   AND bp.archived_at IS NULL
			   AND bpv.status IN ('approved', 'published')
			   AND bpv.active = TRUE
			   AND bpv.archived_at IS NULL
			   AND bpv.effective_from <= NOW()
			   AND (bpv.effective_to IS NULL OR bpv.effective_to > NOW())
		)
		SELECT code, product_type, id, version, name, description, currency,
		       price_paise, billing_interval, metadata, rank, active, effective_from
		  FROM ranked
		 WHERE rn = 1
		 ORDER BY rank ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("pricing catalog: load product versions: %w", err)
	}
	defer rows.Close()
	var products []BillingProductCatalog
	for rows.Next() {
		product, err := scanBillingProductCatalog(rows)
		if err != nil {
			return nil, err
		}
		products = append(products, product)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return products, nil
}

func (s *PricingCatalogService) currentManageableProducts(ctx context.Context) ([]BillingProductCatalog, error) {
	rows, err := s.db.Query(ctx, `
		WITH ranked AS (
			SELECT bp.code, bp.product_type,
			       bpv.id, bpv.version, bpv.name, bpv.description,
			       bpv.currency, bpv.price_paise, bpv.billing_interval,
			       bpv.metadata, bpv.rank, (bp.active AND bpv.active) AS active,
			       bpv.effective_from,
			       ROW_NUMBER() OVER (
			           PARTITION BY bpv.product_code
			           ORDER BY bpv.effective_from DESC, bpv.version DESC
			       ) AS rn
			  FROM billing_products bp
			  JOIN billing_product_versions bpv ON bpv.product_code = bp.code
			 WHERE bp.archived_at IS NULL
			   AND bpv.status IN ('approved', 'published')
			   AND bpv.archived_at IS NULL
			   AND bpv.effective_from <= NOW()
			   AND (bpv.effective_to IS NULL OR bpv.effective_to > NOW())
		)
		SELECT code, product_type, id, version, name, description, currency,
		       price_paise, billing_interval, metadata, rank, active, effective_from
		  FROM ranked
		 WHERE rn = 1
		 ORDER BY rank ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("pricing catalog: load manageable product versions: %w", err)
	}
	defer rows.Close()
	var products []BillingProductCatalog
	for rows.Next() {
		product, err := scanBillingProductCatalog(rows)
		if err != nil {
			return nil, err
		}
		products = append(products, product)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return products, nil
}

func scanBillingProductCatalog(row pgx.Row) (BillingProductCatalog, error) {
	var product BillingProductCatalog
	var id uuid.UUID
	var metadata map[string]any
	if err := row.Scan(
		&product.Code,
		&product.ProductType,
		&id,
		&product.Version,
		&product.Name,
		&product.Description,
		&product.Currency,
		&product.PricePaise,
		&product.BillingInterval,
		&metadata,
		&product.Rank,
		&product.Active,
		&product.EffectiveFrom,
	); err != nil {
		return BillingProductCatalog{}, err
	}
	product.VersionID = id.String()
	if metadata == nil {
		metadata = map[string]any{}
	}
	product.Metadata = metadata
	return product, nil
}

func (s *PricingCatalogService) CurrentPlanVersion(ctx context.Context, tier string, at time.Time) (uuid.UUID, PlanCatalogEntry, bool, error) {
	if s == nil || s.db == nil {
		return uuid.Nil, PlanCatalogEntry{}, false, errors.New("pricing catalog database not configured")
	}
	if at.IsZero() {
		at = time.Now().UTC()
	}
	row := s.db.QueryRow(ctx, `
		SELECT id, tier, name, description, currency, monthly_price_paise,
		       annual_price_paise, quota_bytes, gallery_limit, client_limit,
		       features, popular, rank, paid, active, self_serve, trial_days
		  FROM subscription_plan_versions
		 WHERE tier = $1
		   AND status IN ('approved', 'published')
		   AND archived_at IS NULL
		   AND effective_from <= $2
		   AND (effective_to IS NULL OR effective_to > $2)
		 ORDER BY effective_from DESC, version DESC
		 LIMIT 1
	`, NormalizePlanTierSlug(tier), at)

	var id uuid.UUID
	var p PlanCatalogEntry
	err := row.Scan(
		&id,
		&p.Tier,
		&p.Name,
		&p.Description,
		&p.Currency,
		&p.MonthlyPricePaise,
		&p.AnnualPricePaise,
		&p.QuotaBytes,
		&p.GalleryLimit,
		&p.ClientLimit,
		&p.Features,
		&p.Popular,
		&p.Rank,
		&p.Paid,
		&p.Active,
		&p.SelfServe,
		&p.TrialDays,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, PlanCatalogEntry{}, false, nil
	}
	if err != nil {
		return uuid.Nil, PlanCatalogEntry{}, false, err
	}
	return id, clonePlanCatalogEntry(p), true, nil
}

func timestamptzValue(value pgtype.Timestamptz) *time.Time {
	if !value.Valid {
		return nil
	}
	t := value.Time
	return &t
}
