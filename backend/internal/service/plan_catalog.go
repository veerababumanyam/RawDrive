package service

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var planTierSlugPattern = regexp.MustCompile(`^[a-z][a-z0-9_]{0,19}$`)

// IsValidPlanTierSlug mirrors the database CHECK constraint for plan-tier
// slugs. Keep it strict because workspaces.plan_tier is VARCHAR(20).
func IsValidPlanTierSlug(tier string) bool {
	return planTierSlugPattern.MatchString(strings.ToLower(strings.TrimSpace(tier)))
}

func isReservedLegacyPlanTierAlias(tier string) bool {
	switch strings.ToLower(strings.TrimSpace(tier)) {
	case "standard", "starter", "pro", "professional", "business", "enterprise":
		return true
	default:
		return false
	}
}

// PlanCatalogEntry is the backend source of truth for subscription pricing,
// storage quota, and display metadata. Prices are paise (INR x 100); quota is
// bytes. The package-level helpers below intentionally keep a static fallback
// so billing/storage paths remain safe before migration 168 is applied.
//
// The snake_case json tags are load-bearing: this struct is marshaled verbatim
// as the plans[] of the public /api/v1/pricing-catalog response (see
// PricingCatalogResponse.Plans). The frontend (frontend/src/lib/plans.ts
// normalizeApiPlan + ApiPlan) reads snake_case keys (tier, paid,
// monthly_price_paise, ...). Without these tags Go marshals PascalCase
// (Tier, Paid, ...), every field reads back undefined, normalizeApiPlan
// produces id:"" + paid:false, and PricingContent's `plan.paid` /
// `id==="free"|"pay_per_event"` filters drop EVERY plan — the live pricing
// page silently loses all tier cards after client hydration overwrites the
// SSR fallback. Do not remove the tags.
type PlanCatalogEntry struct {
	Tier              string   `json:"tier"`
	Name              string   `json:"name"`
	Description       string   `json:"description"`
	Currency          string   `json:"currency"`
	MonthlyPricePaise int64    `json:"monthly_price_paise"`
	AnnualPricePaise  int64    `json:"annual_price_paise"`
	QuotaBytes        int64    `json:"quota_bytes"`
	GalleryLimit      int      `json:"gallery_limit"`
	ClientLimit       int      `json:"client_limit"`
	Features          []string `json:"features"`
	Popular           bool     `json:"popular"`
	Rank              int      `json:"rank"`
	Paid              bool     `json:"paid"`
	Active            bool     `json:"active"`
	SelfServe         bool     `json:"self_serve"`
	TrialDays         int      `json:"trial_days"`
}

var planCatalog = []PlanCatalogEntry{
	{
		Tier:              "free",
		Name:              "Starter",
		Description:       "Hook beginners with a free starter gallery. Goal: get users to upgrade later.",
		Currency:          "INR",
		MonthlyPricePaise: 0,
		AnnualPricePaise:  0,
		QuotaBytes:        1 * (1 << 30),
		GalleryLimit:      1,
		ClientLimit:       0,
		Features:          []string{"1GB storage", "1 event", "AI face search (limited)", "Watermarked galleries", "No selling"},
		Rank:              0,
		Paid:              false,
		Active:            true,
		SelfServe:         true,
	},
	{
		Tier:              "pay_per_event",
		Name:              "Pay Per Event",
		Description:       "No subscription. Event products use admin-approved storage quotas and a strict 30-day lifecycle.",
		Currency:          "INR",
		MonthlyPricePaise: 19900,
		AnnualPricePaise:  0,
		QuotaBytes:        0,
		GalleryLimit:      1,
		ClientLimit:       0,
		Features:          []string{"Admin-approved Event Uploads", "Admin-configured Storage Quota", "30-day Active Phase", "View-only After Active Phase", "No New Uploads After Expiry", "Clean Sweep After 30 Days", "Extension Packs Available"},
		Rank:              1,
		Paid:              true,
		Active:            true,
		SelfServe:         false,
	},
	{
		Tier:              "creator",
		Name:              "Creator",
		Description:       "Side & weekend photographers getting started.",
		Currency:          "INR",
		MonthlyPricePaise: 49900,
		AnnualPricePaise:  499000,
		QuotaBytes:        100 * (1 << 30),
		GalleryLimit:      10,
		ClientLimit:       -1,
		Features:          []string{"100 GB storage", "10 events / month", "AI face search", "Reel/shorts gallery", "Basic branding", "Photo selling · 10% commission"},
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
		Features:          []string{"300 GB storage", "Unlimited events", "AI face search (fast)", "Client album selection", "WhatsApp delivery", "Branding & watermark control", "Photo selling · 5% commission"},
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
		Features:          []string{"1 TB storage", "Unlimited everything", "AI face search (priority)", "Team access (editors)", "Custom domain", "Advanced analytics", "Photo selling · 0% commission"},
		Popular:           true,
		Rank:              4,
		Paid:              true,
		Active:            true,
		SelfServe:         true,
	},
	{
		Tier:              "elite_studio",
		Name:              "Elite Studio",
		Description:       "High-end & multi-branch studios.",
		Currency:          "INR",
		MonthlyPricePaise: 399900,
		AnnualPricePaise:  3999000,
		QuotaBytes:        3 * (1 << 40),
		GalleryLimit:      -1,
		ClientLimit:       -1,
		Features:          []string{"3 TB+ storage", "Multi-branch studio support", "API access", "White-label app", "Dedicated support", "0% selling commission", "Premium positioning · custom limits"},
		Rank:              5,
		Paid:              true,
		Active:            true,
		SelfServe:         true,
	},
}

// PlanCatalog returns a stable copy of the visible plan catalog in display order.
func PlanCatalog() []PlanCatalogEntry {
	out := make([]PlanCatalogEntry, 0, len(planCatalog))
	for _, p := range planCatalog {
		if isCatalogHiddenPlanTier(p.Tier) {
			continue
		}
		out = append(out, clonePlanCatalogEntry(p))
	}
	return out
}

func planByTier(tier string) (PlanCatalogEntry, bool) {
	tier = NormalizePlanTierSlug(tier)
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
	return ok && p.Paid && p.Active && p.SelfServe && !isCatalogSalesAssistedTier(p.Tier)
}

func (s *PlanCatalogService) IsSelfServeSignupPlan(ctx context.Context, tier string) (bool, error) {
	p, ok, err := s.Get(ctx, tier)
	if err != nil {
		return false, err
	}
	return ok && p.Active && p.SelfServe && !isCatalogSalesAssistedTier(p.Tier), nil
}

func isCatalogSalesAssistedTier(tier string) bool {
	switch NormalizePlanTierSlug(tier) {
	case "pay_per_event":
		return true
	default:
		return false
	}
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
		if isCatalogHiddenPlanTier(p.Tier) {
			continue
		}
		if !includeInactive && !p.Active {
			continue
		}
		plans = append(plans, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return plans, nil
}

func (s *PlanCatalogService) Get(ctx context.Context, tier string) (PlanCatalogEntry, bool, error) {
	tier = NormalizePlanTierSlug(tier)
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
	tier = NormalizePlanTierSlug(tier)
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
	out := make([]PlanCatalogEntry, 0, len(planCatalog))
	for _, p := range planCatalog {
		if isCatalogHiddenPlanTier(p.Tier) {
			continue
		}
		if includeInactive || p.Active {
			out = append(out, clonePlanCatalogEntry(p))
		}
	}
	return out
}

func isCatalogHiddenPlanTier(tier string) bool {
	switch NormalizePlanTierSlug(tier) {
	case "pay_per_event":
		return true
	default:
		return false
	}
}

// NormalizePlanTierSlug maps historical plan slugs onto the current catalog
// slugs. Keep this as the shared normalizer for billing and backfills so legacy
// records do not drift from the runtime plan catalog.
func NormalizePlanTierSlug(tier string) string {
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
