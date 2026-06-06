package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PlanCatalogEntry is the backend source of truth for subscription pricing,
// storage quota, and display metadata. Prices are paise (INR x 100); quota is
// bytes. The package-level helpers below intentionally keep a static fallback
// so billing/storage paths remain safe before migration 168 is applied.
type PlanCatalogEntry struct {
	Tier              string
	Name              string
	Description       string
	Currency          string
	MonthlyPricePaise int64
	AnnualPricePaise  int64
	QuotaBytes        int64
	GalleryLimit      int
	ClientLimit       int
	Features          []string
	Popular           bool
	Rank              int
	Paid              bool
	Active            bool
	SelfServe         bool
	TrialDays         int
}

var planCatalog = []PlanCatalogEntry{
	{
		Tier:              "free",
		Name:              "Starter",
		Description:       "Free forever for beginners trying galleries before a paid event.",
		Currency:          "INR",
		MonthlyPricePaise: 0,
		AnnualPricePaise:  0,
		QuotaBytes:        5 * (1 << 30),
		GalleryLimit:      1,
		ClientLimit:       0,
		Features:          []string{"5GB Storage", "1 Event", "AI Face Search (Limited)", "Watermarked Galleries", "No Photo Selling"},
		Rank:              0,
		Paid:              false,
		Active:            true,
		SelfServe:         true,
	},
	{
		Tier:              "pay_per_event",
		Name:              "Pay Per Event",
		Description:       "No subscription. Rs.199 events include a 30-day active phase; Rs.499 wedding uploads include 60 active days.",
		Currency:          "INR",
		MonthlyPricePaise: 19900,
		AnnualPricePaise:  0,
		QuotaBytes:        0,
		GalleryLimit:      1,
		ClientLimit:       0,
		Features:          []string{"Rs.199 Event Upload", "30-day Active Phase", "View-only After Active Phase", "No New Uploads After Expiry", "Auto-archive After 90 Days", "Rs.499 Wedding Upload (60-day Active Phase)", "Extension Packs Available"},
		Rank:              1,
		Paid:              true,
		Active:            true,
		SelfServe:         false,
	},
	{
		Tier:              "creator",
		Name:              "Creator",
		Description:       "Side and weekend photographers getting started.",
		Currency:          "INR",
		MonthlyPricePaise: 49900,
		AnnualPricePaise:  499000,
		QuotaBytes:        100 * (1 << 30),
		GalleryLimit:      10,
		ClientLimit:       -1,
		Features:          []string{"100GB Storage", "10 Events / Month", "AI Face Search", "Reel & Shorts Gallery", "Basic Branding", "Photo Selling (10% Commission)"},
		Rank:              2,
		Paid:              true,
		Active:            true,
		SelfServe:         true,
	},
	{
		Tier:              "pro_photographer",
		Name:              "Pro Photographer",
		Description:       "The main money plan for working pros.",
		Currency:          "INR",
		MonthlyPricePaise: 99900,
		AnnualPricePaise:  999000,
		QuotaBytes:        300 * (1 << 30),
		GalleryLimit:      -1,
		ClientLimit:       -1,
		Features:          []string{"300GB Storage", "Unlimited Events", "Fast AI Face Search", "Client Album Selection", "WhatsApp Delivery", "Branding & Watermark Control", "Photo Selling (5% Commission)"},
		Popular:           true,
		Rank:              3,
		Paid:              true,
		Active:            true,
		SelfServe:         true,
	},
	{
		Tier:              "studio",
		Name:              "Studio",
		Description:       "Studios with a team and a brand to protect.",
		Currency:          "INR",
		MonthlyPricePaise: 199900,
		AnnualPricePaise:  1999000,
		QuotaBytes:        1 * (1 << 40),
		GalleryLimit:      -1,
		ClientLimit:       -1,
		Features:          []string{"1TB Storage", "Unlimited Everything", "Priority AI Face Search", "Team Access (Editors)", "Custom Domain", "Advanced Analytics", "Photo Selling (0% Commission)"},
		Rank:              4,
		Paid:              true,
		Active:            true,
		SelfServe:         true,
	},
	{
		Tier:              "elite_studio",
		Name:              "Elite Studio",
		Description:       "High-end and multi-branch studios with custom limits.",
		Currency:          "INR",
		MonthlyPricePaise: 399900,
		AnnualPricePaise:  3999000,
		QuotaBytes:        6 * (1 << 40),
		GalleryLimit:      -1,
		ClientLimit:       -1,
		Features:          []string{"3TB+ Storage", "Multi-branch Support", "API Access", "White-label App", "Dedicated Support", "0% Selling Commission"},
		Rank:              5,
		Paid:              true,
		Active:            true,
		SelfServe:         false,
	},
}

// PlanCatalog returns a stable copy of the plan catalog in display order.
func PlanCatalog() []PlanCatalogEntry {
	out := make([]PlanCatalogEntry, len(planCatalog))
	for i, p := range planCatalog {
		out[i] = clonePlanCatalogEntry(p)
	}
	return out
}

func planByTier(tier string) (PlanCatalogEntry, bool) {
	tier = normalizePlanTierSlug(tier)
	for _, p := range planCatalog {
		if p.Tier == tier {
			return clonePlanCatalogEntry(p), true
		}
	}
	return PlanCatalogEntry{}, false
}

// PlanDefaultQuotaBytes returns the storage quota in bytes for a given plan.
func PlanDefaultQuotaBytes(tier string) int64 {
	if p, ok := planByTier(tier); ok {
		return p.QuotaBytes
	}
	return planCatalog[0].QuotaBytes
}

// PlanPricePaise returns the monthly/annual price for a paid tier.
func PlanPricePaise(tier, billingInterval string) (int64, bool) {
	p, ok := planByTier(tier)
	if !ok || !p.Paid {
		return 0, false
	}
	if billingInterval == "annual" {
		return p.AnnualPricePaise, true
	}
	return p.MonthlyPricePaise, true
}

func PlanTierRank(tier string) (int, bool) {
	p, ok := planByTier(tier)
	return p.Rank, ok
}

func IsPaidPlanTier(tier string) bool {
	p, ok := planByTier(tier)
	return ok && p.Paid
}

func IsSelfServePaidPlanTier(tier string) bool {
	p, ok := planByTier(tier)
	return ok && p.Paid && p.Active && p.SelfServe
}

var ErrPlanNotFound = errors.New("plan not found")

type PlanCatalogUpdate struct {
	Name              string
	Description       string
	Currency          string
	MonthlyPricePaise int64
	AnnualPricePaise  int64
	QuotaBytes        int64
	GalleryLimit      int
	ClientLimit       int
	Features          []string
	Popular           bool
	Paid              bool
	Active            bool
	SelfServe         bool
	TrialDays         int
	Rank              int
}

type PlanCatalogService struct {
	db *pgxpool.Pool
}

func NewPlanCatalogService(db *pgxpool.Pool) *PlanCatalogService {
	return &PlanCatalogService{db: db}
}

func (s *PlanCatalogService) List(ctx context.Context, includeInactive bool) ([]PlanCatalogEntry, error) {
	if s == nil || s.db == nil {
		return filterStaticPlanCatalog(includeInactive), nil
	}
	query := `
		SELECT tier, name, description, currency, monthly_price_paise,
		       annual_price_paise, quota_bytes, gallery_limit, client_limit,
		       features, popular, rank, paid, active, self_serve, trial_days
		  FROM subscription_plans`
	if !includeInactive {
		query += ` WHERE active = TRUE`
	}
	query += ` ORDER BY rank ASC`
	rows, err := s.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var plans []PlanCatalogEntry
	for rows.Next() {
		p, err := scanPlanCatalogEntry(rows)
		if err != nil {
			return nil, err
		}
		plans = append(plans, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return plans, nil
}

func (s *PlanCatalogService) Get(ctx context.Context, tier string) (PlanCatalogEntry, bool, error) {
	tier = normalizePlanTierSlug(tier)
	if tier == "" {
		return PlanCatalogEntry{}, false, nil
	}
	if s == nil || s.db == nil {
		p, ok := planByTier(tier)
		return p, ok, nil
	}
	row := s.db.QueryRow(ctx, `
		SELECT tier, name, description, currency, monthly_price_paise,
		       annual_price_paise, quota_bytes, gallery_limit, client_limit,
		       features, popular, rank, paid, active, self_serve, trial_days
		  FROM subscription_plans
		 WHERE tier = $1`, tier)
	p, err := scanPlanCatalogEntry(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return PlanCatalogEntry{}, false, nil
	}
	if err != nil {
		return PlanCatalogEntry{}, false, err
	}
	return p, true, nil
}

func (s *PlanCatalogService) Update(ctx context.Context, tier string, input PlanCatalogUpdate) (PlanCatalogEntry, error) {
	if s == nil || s.db == nil {
		return PlanCatalogEntry{}, fmt.Errorf("plan catalog database not configured")
	}
	tier = normalizePlanTierSlug(tier)
	if tier == "" {
		return PlanCatalogEntry{}, ErrPlanNotFound
	}
	input.Features = cleanPlanFeatures(input.Features)
	row := s.db.QueryRow(ctx, `
		UPDATE subscription_plans
		   SET name = $2,
		       description = $3,
		       currency = $4,
		       monthly_price_paise = $5,
		       annual_price_paise = $6,
		       quota_bytes = $7,
		       gallery_limit = $8,
		       client_limit = $9,
		       features = $10,
		       popular = $11,
		       paid = $12,
		       active = $13,
		       self_serve = $14,
		       trial_days = $15,
		       rank = $16,
		       updated_at = NOW()
		 WHERE tier = $1
		RETURNING tier, name, description, currency, monthly_price_paise,
		          annual_price_paise, quota_bytes, gallery_limit, client_limit,
		          features, popular, rank, paid, active, self_serve, trial_days`,
		tier, strings.TrimSpace(input.Name), strings.TrimSpace(input.Description),
		strings.ToUpper(strings.TrimSpace(input.Currency)), input.MonthlyPricePaise,
		input.AnnualPricePaise, input.QuotaBytes, input.GalleryLimit, input.ClientLimit,
		input.Features, input.Popular, input.Paid, input.Active, input.SelfServe,
		input.TrialDays, input.Rank,
	)
	p, err := scanPlanCatalogEntry(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return PlanCatalogEntry{}, ErrPlanNotFound
	}
	if err != nil {
		return PlanCatalogEntry{}, err
	}
	return p, nil
}

func (s *PlanCatalogService) PricePaise(ctx context.Context, tier, billingInterval string) (int64, bool, error) {
	p, ok, err := s.Get(ctx, tier)
	if err != nil {
		return 0, false, err
	}
	if !ok || !p.Paid || !p.Active {
		return 0, false, nil
	}
	if billingInterval == "annual" {
		return p.AnnualPricePaise, true, nil
	}
	return p.MonthlyPricePaise, true, nil
}

func (s *PlanCatalogService) TierRank(ctx context.Context, tier string) (int, bool, error) {
	p, ok, err := s.Get(ctx, tier)
	if err != nil {
		return 0, false, err
	}
	return p.Rank, ok, nil
}

func (s *PlanCatalogService) QuotaBytes(ctx context.Context, tier string) (int64, error) {
	p, ok, err := s.Get(ctx, tier)
	if err != nil {
		return 0, err
	}
	if !ok {
		return PlanDefaultQuotaBytes(tier), nil
	}
	return p.QuotaBytes, nil
}

type planRow interface {
	Scan(dest ...any) error
}

func scanPlanCatalogEntry(row planRow) (PlanCatalogEntry, error) {
	var p PlanCatalogEntry
	if err := row.Scan(
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
	); err != nil {
		return PlanCatalogEntry{}, err
	}
	return clonePlanCatalogEntry(p), nil
}

func clonePlanCatalogEntry(p PlanCatalogEntry) PlanCatalogEntry {
	p.Features = append([]string(nil), p.Features...)
	return p
}

func filterStaticPlanCatalog(includeInactive bool) []PlanCatalogEntry {
	catalog := PlanCatalog()
	if includeInactive {
		return catalog
	}
	out := make([]PlanCatalogEntry, 0, len(catalog))
	for _, p := range catalog {
		if p.Active {
			out = append(out, p)
		}
	}
	return out
}

func normalizePlanTierSlug(tier string) string {
	switch strings.ToLower(strings.TrimSpace(tier)) {
	case "standard":
		return "free"
	case "starter":
		return "creator"
	case "pro", "professional":
		return "pro_photographer"
	case "business", "enterprise":
		return "elite_studio"
	default:
		return strings.ToLower(strings.TrimSpace(tier))
	}
}

func cleanPlanFeatures(features []string) []string {
	out := make([]string, 0, len(features))
	for _, feature := range features {
		feature = strings.TrimSpace(feature)
		if feature != "" {
			out = append(out, feature)
		}
	}
	return out
}
