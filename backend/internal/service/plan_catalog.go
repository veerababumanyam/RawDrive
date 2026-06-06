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
		Name:              "Free",
		Description:       "Explore RawDrive with managed storage and gallery delivery.",
		Currency:          "INR",
		MonthlyPricePaise: 0,
		AnnualPricePaise:  0,
		QuotaBytes:        1 << 30,
		GalleryLimit:      3,
		ClientLimit:       5,
		Features:          []string{"1GB Storage", "3 Galleries", "5 Client Profiles", "Basic Gallery Delivery", "Email Support"},
		Rank:              0,
		Paid:              false,
		Active:            true,
		SelfServe:         true,
		TrialDays:         30,
	},
	{
		Tier:              "starter",
		Name:              "Starter",
		Description:       "For solo photographers starting client delivery.",
		Currency:          "INR",
		MonthlyPricePaise: 9900,
		AnnualPricePaise:  99000,
		QuotaBytes:        30 * (1 << 30),
		GalleryLimit:      10,
		ClientLimit:       20,
		Features:          []string{"30GB Storage", "10 Galleries", "20 Client Profiles", "Client Proofing", "Basic CRM", "Priority Email Support"},
		Rank:              1,
		Paid:              true,
		Active:            true,
		SelfServe:         true,
	},
	{
		Tier:              "professional",
		Name:              "Professional",
		Description:       "For growing studios that need AI, CRM, and streaming.",
		Currency:          "INR",
		MonthlyPricePaise: 29900,
		AnnualPricePaise:  299000,
		QuotaBytes:        300 * (1 << 30),
		GalleryLimit:      50,
		ClientLimit:       100,
		Features:          []string{"300GB Storage", "50 Galleries", "100 Client Profiles", "AI Culling", "Client Proofing", "Full CRM & Bookings", "Live Streaming (5 sessions/mo)", "Marketplace Listing", "Phone Support"},
		Popular:           true,
		Rank:              2,
		Paid:              true,
		Active:            true,
		SelfServe:         true,
	},
	{
		Tier:              "business",
		Name:              "Business",
		Description:       "For larger wedding teams running high-volume delivery.",
		Currency:          "INR",
		MonthlyPricePaise: 299900,
		AnnualPricePaise:  2999000,
		QuotaBytes:        3 * (1 << 40),
		GalleryLimit:      200,
		ClientLimit:       500,
		Features:          []string{"3TB Storage", "200 Galleries", "500 Client Profiles", "AI Culling (Unlimited)", "Advanced Client Proofing", "Full CRM & Bookings", "Live Streaming (20 sessions/mo)", "Premium Marketplace Listing", "Dedicated Account Manager", "API Access"},
		Rank:              3,
		Paid:              true,
		Active:            true,
		SelfServe:         true,
	},
	{
		Tier:              "enterprise",
		Name:              "Enterprise",
		Description:       "For full-scale studios that need white-label control and BYOS.",
		Currency:          "INR",
		MonthlyPricePaise: 599900,
		AnnualPricePaise:  5999000,
		QuotaBytes:        6 * (1 << 40),
		GalleryLimit:      -1,
		ClientLimit:       -1,
		Features:          []string{"6TB Storage", "Unlimited Galleries", "Unlimited Clients", "Bring Your Own Storage (BYOS)", "White-label Options", "Custom Integrations", "SLA Guarantee", "Dedicated Account Manager", "24/7 Dedicated Support"},
		Rank:              4,
		Paid:              true,
		Active:            true,
		SelfServe:         true,
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
	return strings.ToLower(strings.TrimSpace(tier))
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
