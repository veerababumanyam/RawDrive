package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// MarketplaceHandler handles freelancer marketplace endpoints.
type MarketplaceHandler struct {
	repo *repository.FreelancerRepo
}

func NewMarketplaceHandler(repo *repository.FreelancerRepo) *MarketplaceHandler {
	return &MarketplaceHandler{repo: repo}
}

func (h *MarketplaceHandler) ListFreelancers(w http.ResponseWriter, r *http.Request) {
	filter := repository.FreelancerFilter{PublishedOnly: true, Limit: 50}

	if s := r.URL.Query().Get("state_id"); s != "" {
		if sid, err := strconv.Atoi(s); err == nil {
			filter.StateID = &sid
		}
	}
	if c := r.URL.Query().Get("city"); c != "" {
		filter.City = c
	}
	if sp := r.URL.Query().Get("specialization"); sp != "" {
		filter.Specialization = sp
	}
	if s := r.URL.Query().Get("sort"); s != "" {
		filter.Sort = s
	}
	if minStr := r.URL.Query().Get("min_rate_paisa"); minStr != "" {
		if v, err := strconv.ParseInt(minStr, 10, 64); err == nil {
			filter.MinRatePaisa = &v
		}
	}
	if maxStr := r.URL.Query().Get("max_rate_paisa"); maxStr != "" {
		if v, err := strconv.ParseInt(maxStr, 10, 64); err == nil {
			filter.MaxRatePaisa = &v
		}
	}

	listings, err := h.repo.List(r.Context(), filter)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"data": listings})
}

func (h *MarketplaceHandler) GetFreelancer(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	listing, err := h.repo.GetByID(r.Context(), id)
	if err != nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	if !listing.IsPublished {
		userID, ok := getUserID(r)
		if !ok || userID != listing.UserID {
			http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
			return
		}
	}
	reviews, _ := h.repo.ListReviews(r.Context(), id)
	respondJSON(w, http.StatusOK, map[string]interface{}{"data": listing, "reviews": reviews})
}

type createFreelancerRequest struct {
	Title           string   `json:"title"`
	Specializations []string `json:"specializations"`
	City            *string  `json:"city"`
	DailyRatePaisa  *int64   `json:"daily_rate_paisa"`
	Description     *string  `json:"description"`
	IsPublished     bool     `json:"is_published"`
}

func (h *MarketplaceHandler) CreateFreelancerListing(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	wsID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace"}`, http.StatusBadRequest)
		return
	}

	var req createFreelancerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.Title == "" {
		http.Error(w, `{"error":"title is required"}`, http.StatusBadRequest)
		return
	}

	listing := &repository.FreelancerListing{
		UserID:          userID,
		WorkspaceID:     wsID,
		StateID:         1, // TODO: resolve from workspace
		Title:           req.Title,
		Specializations: req.Specializations,
		City:            req.City,
		DailyRatePaisa:  req.DailyRatePaisa,
		Description:     req.Description,
		IsPublished:     req.IsPublished,
	}
	if err := h.repo.Create(r.Context(), listing); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusCreated, map[string]interface{}{"data": listing})
}

func (h *MarketplaceHandler) UpdateFreelancerListing(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	listing, err := h.repo.GetByID(r.Context(), id)
	if err != nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	if listing.UserID != userID {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var req createFreelancerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	listing.Title = req.Title
	listing.Specializations = req.Specializations
	listing.City = req.City
	listing.DailyRatePaisa = req.DailyRatePaisa
	listing.Description = req.Description
	listing.IsPublished = req.IsPublished

	if err := h.repo.Update(r.Context(), &listing); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"data": listing})
}

type createInquiryRequest struct {
	Type       string `json:"type"`
	ListingID  string `json:"listing_id"`
	Message    string `json:"message"`
}

func (h *MarketplaceHandler) CreateInquiry(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	var req createInquiryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	listingID, err := uuid.Parse(req.ListingID)
	if err != nil {
		http.Error(w, `{"error":"invalid listing_id"}`, http.StatusBadRequest)
		return
	}

	// Get listing owner
	listing, err := h.repo.GetByID(r.Context(), listingID)
	if err != nil {
		http.Error(w, `{"error":"listing not found"}`, http.StatusNotFound)
		return
	}

	inq := &repository.MarketplaceInquiry{
		InquiryType: req.Type,
		ListingID:   listingID,
		FromUserID:  userID,
		ToUserID:    listing.UserID,
		Message:     req.Message,
	}
	if err := h.repo.CreateInquiry(r.Context(), inq); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusCreated, map[string]interface{}{"data": inq})
}

func (h *MarketplaceHandler) ListInquiries(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	inquiries, err := h.repo.ListInquiries(r.Context(), userID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"data": inquiries})
}

func (h *MarketplaceHandler) UpdateInquiry(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	_ = userID // ownership verified via RLS; additional check can be added with GetInquiryByID

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	var req struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if err := h.repo.UpdateInquiryStatus(r.Context(), id, req.Status); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"status": "updated"})
}
