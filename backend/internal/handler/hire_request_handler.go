package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// HireRequestHandler exposes the hire-request and freelancer-review endpoints
// that were missing from M5 prior to the gap-audit fixes. It delegates all
// validation and state-machine enforcement to MarketplaceService.
type HireRequestHandler struct {
	svc            *service.MarketplaceService
	freelancerRepo *repository.FreelancerRepo
}

// NewHireRequestHandler constructs a HireRequestHandler. The freelancer repo
// is retained so handlers can resolve listing → user_id for ownership checks
// without round-tripping through the service.
func NewHireRequestHandler(svc *service.MarketplaceService, freelancerRepo *repository.FreelancerRepo) *HireRequestHandler {
	return &HireRequestHandler{svc: svc, freelancerRepo: freelancerRepo}
}

// ──────────────────────── Hire Requests ────────────────────────

type createHireRequestBody struct {
	EventDetails      *string `json:"event_details"`
	EventDate         *string `json:"event_date"` // YYYY-MM-DD
	CompensationPaisa *int64  `json:"compensation_paisa"`
	Requirements      *string `json:"requirements"`
	Message           *string `json:"message"`
}

// CreateHireRequest handles POST /api/v1/marketplace/freelancers/{id}/hire.
// The {id} path parameter is the freelancer LISTING id, not the user id —
// the freelancer user is resolved from the listing.
func (h *HireRequestHandler) CreateHireRequest(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	listingID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid listing id"}`, http.StatusBadRequest)
		return
	}
	var body createHireRequestBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Resolve freelancer user from the listing so the service can enforce
	// the "no self-hire" rule without an extra round-trip.
	if h.freelancerRepo == nil {
		http.Error(w, `{"error":"service unavailable"}`, http.StatusServiceUnavailable)
		return
	}
	listing, err := h.freelancerRepo.GetByID(r.Context(), listingID)
	if err != nil {
		http.Error(w, `{"error":"listing not found"}`, http.StatusNotFound)
		return
	}

	var eventDate *time.Time
	if body.EventDate != nil && *body.EventDate != "" {
		parsed, err := time.Parse("2006-01-02", *body.EventDate)
		if err != nil {
			http.Error(w, `{"error":"invalid event_date format, use YYYY-MM-DD"}`, http.StatusBadRequest)
			return
		}
		eventDate = &parsed
	}

	hr, err := h.svc.SubmitHireRequest(r.Context(), service.HireRequestInput{
		ListingID:         listingID,
		RequesterID:       userID,
		FreelancerID:      listing.UserID,
		EventDetails:      body.EventDetails,
		EventDate:         eventDate,
		CompensationPaisa: body.CompensationPaisa,
		Requirements:      body.Requirements,
		Message:           body.Message,
	})
	if err != nil {
		if errors.Is(err, service.ErrHireRequestInvalidInput) {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
			return
		}
		if errors.Is(err, service.ErrMarketplaceRepoNotWired) {
			http.Error(w, `{"error":"service unavailable"}`, http.StatusServiceUnavailable)
			return
		}
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusCreated, map[string]any{"data": hr})
}

// UpdateHireRequestStatus handles PATCH /api/v1/marketplace/hire-requests/{id}/status.
// Only the freelancer (listing owner) may accept/decline/confirm/complete;
// the requester may cancel.
func (h *HireRequestHandler) UpdateHireRequestStatus(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	hireID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid hire id"}`, http.StatusBadRequest)
		return
	}
	var body struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if body.Status == "" {
		http.Error(w, `{"error":"status is required"}`, http.StatusBadRequest)
		return
	}

	// Load current record to check participant authorization.
	if h.freelancerRepo == nil {
		http.Error(w, `{"error":"service unavailable"}`, http.StatusServiceUnavailable)
		return
	}
	current, err := h.freelancerRepo.GetHireRequest(r.Context(), hireID)
	if err != nil {
		http.Error(w, `{"error":"hire request not found"}`, http.StatusNotFound)
		return
	}
	isFreelancer := current.FreelancerID == userID
	isRequester := current.RequesterID == userID
	if !isFreelancer && !isRequester {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}
	// Only the requester may cancel; only the freelancer may move
	// sent → accepted/declined or accepted → confirmed or confirmed → completed.
	if body.Status == "cancelled" && !isRequester {
		http.Error(w, `{"error":"only requester may cancel"}`, http.StatusForbidden)
		return
	}
	if body.Status != "cancelled" && !isFreelancer {
		http.Error(w, `{"error":"only freelancer may change this status"}`, http.StatusForbidden)
		return
	}

	updated, err := h.svc.UpdateHireStatus(r.Context(), hireID, body.Status)
	if err != nil {
		if errors.Is(err, service.ErrHireStatusTransitionDenied) {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusConflict)
			return
		}
		if errors.Is(err, service.ErrHireRequestNotFound) {
			http.Error(w, `{"error":"hire request not found"}`, http.StatusNotFound)
			return
		}
		if errors.Is(err, service.ErrHireRequestInvalidInput) {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
			return
		}
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"data": updated})
}

// ListHireRequests handles GET /api/v1/marketplace/hire-requests.
// The `role` query parameter selects between "freelancer" (received by me)
// and "requester" (sent by me). Defaults to "freelancer".
func (h *HireRequestHandler) ListHireRequests(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	role := r.URL.Query().Get("role")
	if role == "" {
		role = "freelancer"
	}

	var (
		results []repository.HireRequest
		err     error
	)
	switch role {
	case "freelancer":
		results, err = h.svc.ListHireRequestsByFreelancer(r.Context(), userID)
	case "requester":
		results, err = h.svc.ListHireRequestsByRequester(r.Context(), userID)
	default:
		http.Error(w, `{"error":"role must be freelancer or requester"}`, http.StatusBadRequest)
		return
	}
	if err != nil {
		if errors.Is(err, service.ErrMarketplaceRepoNotWired) {
			http.Error(w, `{"error":"service unavailable"}`, http.StatusServiceUnavailable)
			return
		}
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	if results == nil {
		results = []repository.HireRequest{}
	}
	respondJSON(w, http.StatusOK, map[string]any{"data": results})
}

// ──────────────────────── Freelancer Reviews ────────────────────────

type createReviewBody struct {
	BookingID  *string `json:"booking_id"`
	Rating     int     `json:"rating"`
	ReviewText *string `json:"review_text"`
}

// CreateFreelancerReview handles POST /api/v1/marketplace/freelancers/{id}/reviews.
// {id} is the listing id. The reviewer may not be the listing owner.
func (h *HireRequestHandler) CreateFreelancerReview(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	listingID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid listing id"}`, http.StatusBadRequest)
		return
	}
	var body createReviewBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	var bookingID *uuid.UUID
	if body.BookingID != nil && *body.BookingID != "" {
		parsed, perr := uuid.Parse(*body.BookingID)
		if perr != nil {
			http.Error(w, `{"error":"invalid booking_id"}`, http.StatusBadRequest)
			return
		}
		bookingID = &parsed
	}

	rev, err := h.svc.CreateFreelancerReview(r.Context(), service.ReviewInput{
		ListingID:  listingID,
		ReviewerID: userID,
		BookingID:  bookingID,
		Rating:     body.Rating,
		ReviewText: body.ReviewText,
	})
	if err != nil {
		if errors.Is(err, service.ErrReviewInvalidRating) || errors.Is(err, service.ErrReviewInvalidInput) {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
			return
		}
		if errors.Is(err, service.ErrMarketplaceRepoNotWired) {
			http.Error(w, `{"error":"service unavailable"}`, http.StatusServiceUnavailable)
			return
		}
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusCreated, map[string]any{"data": rev})
}
