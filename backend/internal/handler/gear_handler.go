package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// GearHandler handles gear marketplace endpoints.
type GearHandler struct {
	repo    *repository.GearRepo
	modRepo *repository.ModerationRepo
	// bookingConflictCheck is an optional hook (wired via WithBookingConflictCheck)
	// that reports true when a prospective booking overlaps an existing reservation.
	// Added as part of the M5 gap-audit fix so CreateBooking can return 409 Conflict.
	bookingConflictCheck func(ctx context.Context, gearID uuid.UUID, start, end time.Time) (bool, error)
}

func NewGearHandler(repo *repository.GearRepo, modRepo ...* repository.ModerationRepo) *GearHandler {
	h := &GearHandler{repo: repo}
	if len(modRepo) > 0 {
		h.modRepo = modRepo[0]
	}
	return h
}

// WithBookingConflictCheck wires a conflict-detection function that is
// invoked during CreateBooking. When the function reports true the handler
// returns 409 Conflict. Pass nil (or don't call this) to disable.
func (h *GearHandler) WithBookingConflictCheck(fn func(ctx context.Context, gearID uuid.UUID, start, end time.Time) (bool, error)) *GearHandler {
	h.bookingConflictCheck = fn
	return h
}

func (h *GearHandler) ListGear(w http.ResponseWriter, r *http.Request) {
	filter := repository.GearFilter{PublishedOnly: true, Limit: 50}

	if s := r.URL.Query().Get("state_id"); s != "" {
		if sid, err := strconv.Atoi(s); err == nil {
			filter.StateID = &sid
		}
	}
	if c := r.URL.Query().Get("category"); c != "" {
		filter.Category = c
	}
	if b := r.URL.Query().Get("brand"); b != "" {
		filter.Brand = b
	}
	if s := r.URL.Query().Get("sort"); s != "" {
		filter.Sort = s
	}

	listings, err := h.repo.List(r.Context(), filter)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"data": listings})
}

func (h *GearHandler) GetGear(w http.ResponseWriter, r *http.Request) {
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
	respondJSON(w, http.StatusOK, map[string]interface{}{"data": listing})
}

type createGearRequest struct {
	ListingType string          `json:"listing_type"`
	Title       string          `json:"title"`
	Category    string          `json:"category"`
	Brand       *string         `json:"brand"`
	Model       *string         `json:"model"`
	Condition   *string         `json:"condition"`
	PricePaisa  int64           `json:"price_paisa"`
	Description *string         `json:"description"`
	Images      json.RawMessage `json:"images"`
	City        *string         `json:"city"`
	IsPublished bool            `json:"is_published"`
}

func (h *GearHandler) CreateGearListing(w http.ResponseWriter, r *http.Request) {
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
	var req createGearRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.Title == "" || req.Category == "" {
		http.Error(w, `{"error":"title and category are required"}`, http.StatusBadRequest)
		return
	}
	validCategories := map[string]bool{"camera_body": true, "lens": true, "lighting": true, "audio": true, "accessory": true}
	if !validCategories[req.Category] {
		http.Error(w, `{"error":"invalid category"}`, http.StatusBadRequest)
		return
	}

	listing := &repository.GearListing{
		UserID:      userID,
		WorkspaceID: wsID,
		StateID:     1,
		ListingType: req.ListingType,
		Title:       req.Title,
		Category:    req.Category,
		Brand:       req.Brand,
		Model:       req.Model,
		Condition:   req.Condition,
		PricePaisa:  req.PricePaisa,
		Description: req.Description,
		Images:      req.Images,
		City:        req.City,
		IsPublished: req.IsPublished,
		IsAvailable: true,
	}
	if listing.ListingType == "" {
		listing.ListingType = "rental"
	}

	// GAP-004 fix: Screen content before publishing
	if h.modRepo != nil && listing.IsPublished {
		flagged, err := h.modRepo.ScreenContent(r.Context(), "gear_listing", listing.Title+" "+func() string {
			if listing.Description != nil { return *listing.Description }; return ""
		}())
		if err == nil && flagged {
			listing.IsPublished = false // force unpublished for review
		}
	}

	if err := h.repo.Create(r.Context(), listing); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// Create moderation queue entry if flagged
	if h.modRepo != nil && !listing.IsPublished && req.IsPublished {
		_ = h.modRepo.CreateItem(r.Context(), &repository.ModerationItem{
			ContentType: "gear_listing",
			ContentID:   listing.ID,
			WorkspaceID: wsID,
			Reason:      "auto_flagged",
		})
	}

	respondJSON(w, http.StatusCreated, map[string]interface{}{"data": listing})
}

func (h *GearHandler) UpdateGearListing(w http.ResponseWriter, r *http.Request) {
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
	var req createGearRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	listing.Title = req.Title
	listing.Category = req.Category
	listing.Brand = req.Brand
	listing.Model = req.Model
	listing.Condition = req.Condition
	listing.PricePaisa = req.PricePaisa
	listing.Description = req.Description
	if req.Images != nil {
		listing.Images = req.Images
	}
	listing.City = req.City
	listing.IsPublished = req.IsPublished

	if err := h.repo.Update(r.Context(), &listing); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"data": listing})
}

func (h *GearHandler) DeleteGearListing(w http.ResponseWriter, r *http.Request) {
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
	if err := h.repo.Delete(r.Context(), id, userID); err != nil {
		if err.Error() == "not found or not owner" {
			http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		} else {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		}
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GAP-002 fix: Gear booking endpoints

func (h *GearHandler) CreateBooking(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	gearID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gear id"}`, http.StatusBadRequest)
		return
	}
	gear, err := h.repo.GetByID(r.Context(), gearID)
	if err != nil {
		http.Error(w, `{"error":"gear not found"}`, http.StatusNotFound)
		return
	}
	var req struct {
		StartDate    string  `json:"start_date"`
		EndDate      string  `json:"end_date"`
		TotalPaisa   int64   `json:"total_paisa"`
		DepositPaisa int64   `json:"deposit_paisa"`
		Message      *string `json:"message"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	startDate, err1 := time.Parse("2006-01-02", req.StartDate)
	endDate, err2 := time.Parse("2006-01-02", req.EndDate)
	if err1 != nil || err2 != nil {
		http.Error(w, `{"error":"invalid date format, use YYYY-MM-DD"}`, http.StatusBadRequest)
		return
	}
	if endDate.Before(startDate) {
		http.Error(w, `{"error":"end_date must be on or after start_date"}`, http.StatusBadRequest)
		return
	}

	// M5 gap-audit fix: reject overlapping bookings on the same gear item.
	if h.bookingConflictCheck != nil {
		conflict, cErr := h.bookingConflictCheck(r.Context(), gearID, startDate, endDate)
		if cErr != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}
		if conflict {
			http.Error(w, `{"error":"requested dates conflict with an existing booking"}`, http.StatusConflict)
			return
		}
	}

	booking := &repository.GearBooking{
		GearListingID: gearID,
		RenterID:      userID,
		OwnerID:       gear.UserID,
		StartDate:     startDate,
		EndDate:       endDate,
		TotalPaisa:    req.TotalPaisa,
		DepositPaisa:  req.DepositPaisa,
		RenterMessage: req.Message,
	}
	if err := h.repo.CreateBooking(r.Context(), booking); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusCreated, map[string]any{"data": booking})
}

func (h *GearHandler) UpdateBookingStatus(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	bookingID, err := uuid.Parse(chi.URLParam(r, "bookingId"))
	if err != nil {
		http.Error(w, `{"error":"invalid booking id"}`, http.StatusBadRequest)
		return
	}
	// Verify caller is booking participant
	existingBooking, err := h.repo.GetBooking(r.Context(), bookingID)
	if err != nil {
		http.Error(w, `{"error":"booking not found"}`, http.StatusNotFound)
		return
	}
	if existingBooking.OwnerID != userID && existingBooking.RenterID != userID {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}
	var req struct {
		Status  string  `json:"status"`
		Message *string `json:"message"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	validStatuses := map[string]bool{
		"approved": true, "declined": true, "active": true,
		"returned": true, "disputed": true, "completed": true,
	}
	if !validStatuses[req.Status] {
		http.Error(w, `{"error":"invalid status"}`, http.StatusBadRequest)
		return
	}
	if err := h.repo.UpdateBookingStatus(r.Context(), bookingID, req.Status); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// GAP-007 fix: Update gear availability on booking status change
	booking, bErr := h.repo.GetBooking(r.Context(), bookingID)
	if bErr == nil && (req.Status == "approved" || req.Status == "returned" || req.Status == "completed") {
		gear, gErr := h.repo.GetByID(r.Context(), booking.GearListingID)
		if gErr == nil {
			if req.Status == "approved" {
				gear.IsAvailable = false
			} else {
				gear.IsAvailable = true
			}
			_ = h.repo.Update(r.Context(), &gear)
		}
	}

	respondJSON(w, http.StatusOK, map[string]any{"status": "updated"})
}

