package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/service"
)

type planCatalogService interface {
	List(ctx context.Context, includeInactive bool) ([]service.PlanCatalogEntry, error)
	Update(ctx context.Context, tier string, input service.PlanCatalogUpdate) (service.PlanCatalogEntry, error)
}

// adminPlan is the wire shape for one row in the plan catalog response.
type adminPlan struct {
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

type adminPlansResponse struct {
	Plans []adminPlan `json:"plans"`
}

type updateAdminPlanRequest struct {
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

// AdminPlansHandler serves and updates the canonical plan catalog. When the
// DB-backed service is nil (common in older unit tests), List falls back to the
// static package catalog while mutation returns 503.
type AdminPlansHandler struct {
	catalog planCatalogService
}

func NewAdminPlansHandler(catalog planCatalogService) *AdminPlansHandler {
	return &AdminPlansHandler{catalog: catalog}
}

func (h *AdminPlansHandler) List(w http.ResponseWriter, r *http.Request) {
	plans, err := h.list(r, true)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "list plans failed"})
		return
	}
	respondJSON(w, http.StatusOK, adminPlansResponse{Plans: projectAdminPlans(plans)})
}

func (h *AdminPlansHandler) Update(w http.ResponseWriter, r *http.Request) {
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	if role, _ := claims["platform_role"].(string); role != "super_admin" {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "super_admin required"})
		return
	}
	if h.catalog == nil {
		respondJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "plan catalog unavailable"})
		return
	}
	tier := strings.TrimSpace(chi.URLParam(r, "tier"))
	var req updateAdminPlanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	input, err := req.toServiceUpdate()
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	plan, err := h.catalog.Update(r.Context(), tier, input)
	if errors.Is(err, service.ErrPlanNotFound) {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "plan not found"})
		return
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		respondJSON(w, http.StatusConflict, map[string]string{"error": "plan rank already in use"})
		return
	}
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "update plan failed"})
		return
	}
	respondJSON(w, http.StatusOK, map[string]adminPlan{"plan": projectAdminPlan(plan)})
}

func (h *AdminPlansHandler) list(r *http.Request, includeInactive bool) ([]service.PlanCatalogEntry, error) {
	if h.catalog == nil {
		return service.PlanCatalog(), nil
	}
	return h.catalog.List(r.Context(), includeInactive)
}

func (req updateAdminPlanRequest) toServiceUpdate() (service.PlanCatalogUpdate, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return service.PlanCatalogUpdate{}, errors.New("name required")
	}
	currency := strings.ToUpper(strings.TrimSpace(req.Currency))
	if currency == "" {
		currency = "INR"
	}
	if req.MonthlyPricePaise < 0 || req.AnnualPricePaise < 0 {
		return service.PlanCatalogUpdate{}, errors.New("prices must be non-negative")
	}
	if req.QuotaBytes < 0 {
		return service.PlanCatalogUpdate{}, errors.New("quota_bytes must be non-negative")
	}
	if req.GalleryLimit < -1 || req.ClientLimit < -1 {
		return service.PlanCatalogUpdate{}, errors.New("limits must be -1 or greater")
	}
	if req.Rank < 0 {
		return service.PlanCatalogUpdate{}, errors.New("rank must be non-negative")
	}
	if req.TrialDays < 0 {
		return service.PlanCatalogUpdate{}, errors.New("trial_days must be non-negative")
	}
	return service.PlanCatalogUpdate{
		Name:              name,
		Description:       req.Description,
		Currency:          currency,
		MonthlyPricePaise: req.MonthlyPricePaise,
		AnnualPricePaise:  req.AnnualPricePaise,
		QuotaBytes:        req.QuotaBytes,
		GalleryLimit:      req.GalleryLimit,
		ClientLimit:       req.ClientLimit,
		Features:          req.Features,
		Popular:           req.Popular,
		Paid:              req.Paid,
		Active:            req.Active,
		SelfServe:         req.SelfServe,
		TrialDays:         req.TrialDays,
		Rank:              req.Rank,
	}, nil
}

func projectAdminPlans(plans []service.PlanCatalogEntry) []adminPlan {
	out := make([]adminPlan, 0, len(plans))
	for _, p := range plans {
		out = append(out, projectAdminPlan(p))
	}
	return out
}

func projectAdminPlan(p service.PlanCatalogEntry) adminPlan {
	return adminPlan{
		Tier:              p.Tier,
		Name:              p.Name,
		Description:       p.Description,
		Currency:          p.Currency,
		MonthlyPricePaise: p.MonthlyPricePaise,
		AnnualPricePaise:  p.AnnualPricePaise,
		QuotaBytes:        p.QuotaBytes,
		GalleryLimit:      p.GalleryLimit,
		ClientLimit:       p.ClientLimit,
		Features:          append([]string(nil), p.Features...),
		Popular:           p.Popular,
		Rank:              p.Rank,
		Paid:              p.Paid,
		Active:            p.Active,
		SelfServe:         p.SelfServe,
		TrialDays:         p.TrialDays,
	}
}

type PublicPlansHandler struct {
	catalog planCatalogService
}

func NewPublicPlansHandler(catalog planCatalogService) *PublicPlansHandler {
	return &PublicPlansHandler{catalog: catalog}
}

func (h *PublicPlansHandler) List(w http.ResponseWriter, r *http.Request) {
	var (
		plans []service.PlanCatalogEntry
		err   error
	)
	if h.catalog == nil {
		plans = service.PlanCatalog()
	} else {
		plans, err = h.catalog.List(r.Context(), false)
	}
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "list plans failed"})
		return
	}
	respondJSON(w, http.StatusOK, adminPlansResponse{Plans: projectAdminPlans(plans)})
}

func RegisterPlanCatalogRoutes(r chi.Router, catalog planCatalogService) {
	h := NewPublicPlansHandler(catalog)
	r.Get("/api/v1/plans", h.List)
}
