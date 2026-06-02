package handler

// 2026-05-19 — GET /api/v1/admin/plans
//
// Returns the canonical plan catalog so admin surfaces (the New User
// dialog at /admin/users) can render a dropdown without bundling the
// tier list into the frontend bundle. The frontend used to import
// pricingPlans from src/lib/tokens.ts directly; that worked but
// hardcoded the catalog into every deploy artifact, so flipping a tier
// price or adding a new tier required a coordinated FE+BE deploy.
// Reading from this endpoint keeps the catalog server-driven and lets
// the admin dialog reflect the truth without a frontend re-bundle.
//
// Auth: super_admin / admin only (mounted under /api/v1/admin which
// already enforces RequirePlatformRole upstream).
//
// Response shape:
//
//   {
//     "plans": [
//       { "tier": "free",         "name": "Free",         "monthly_price_paise": 0 },
//       { "tier": "starter",      "name": "Starter",      "monthly_price_paise": 9900 },
//       { "tier": "professional", "name": "Professional", "monthly_price_paise": 29900 },
//       { "tier": "business",     "name": "Business",     "monthly_price_paise": 299900 },
//       { "tier": "enterprise",   "name": "Enterprise",   "monthly_price_paise": 599900 }
//     ]
//   }
//
// Prices are in paise (INR × 100) to match the existing
// planPricePaise convention in subscription_upgrade_handler.go. The
// admin dropdown doesn't currently render the price — but exposing it
// here means a future "show price next to tier name" iteration doesn't
// need a backend change.

import (
	"net/http"

	"github.com/rawdrive/backend/internal/service"
)

// adminPlan is the wire shape for one row in the plan catalog response.
type adminPlan struct {
	Tier              string `json:"tier"`
	Name              string `json:"name"`
	MonthlyPricePaise int64  `json:"monthly_price_paise"`
}

// adminPlansResponse wraps the catalog array. A top-level object (not a
// bare array) leaves room to add fields later (catalog version, last
// updated, currency code) without breaking clients.
type adminPlansResponse struct {
	Plans []adminPlan `json:"plans"`
}

// adminPlanCatalog projects the shared backend service catalog into the
// admin wire shape. The free tier is included because the admin grant flow
// allows comping a user onto the free tier.
func adminPlanCatalog() []adminPlan {
	catalog := service.PlanCatalog()
	out := make([]adminPlan, 0, len(catalog))
	for _, p := range catalog {
		out = append(out, adminPlan{
			Tier:              p.Tier,
			Name:              p.Name,
			MonthlyPricePaise: p.MonthlyPricePaise,
		})
	}
	return out
}

// AdminPlansHandler serves the canonical plan catalog. Stateless — no
// dependencies, since the catalog lives in the package variable above.
// Wired into admin_routes.go alongside the other admin handlers.
type AdminPlansHandler struct{}

func NewAdminPlansHandler() *AdminPlansHandler {
	return &AdminPlansHandler{}
}

// List handles GET /api/v1/admin/plans.
func (h *AdminPlansHandler) List(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, adminPlansResponse{Plans: adminPlanCatalog()})
}
