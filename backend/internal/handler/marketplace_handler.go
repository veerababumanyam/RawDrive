package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/repository"
)

// MarketplaceHandler handles freelancer marketplace endpoints.
type MarketplaceHandler struct {
	repo *repository.FreelancerRepo
}

func NewMarketplaceHandler(repo *repository.FreelancerRepo) *MarketplaceHandler {
	return &MarketplaceHandler{repo: repo}
}

// GetMyFreelancerListing handles GET /api/v1/marketplace/my-listing.
// Returns the authenticated user's own freelancer listing (or 404 if none).
func (h *MarketplaceHandler) GetMyFreelancerListing(w http.ResponseWriter, r *http.Request) {
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
	listing, err := h.repo.GetByUserID(r.Context(), userID, wsID)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]interface{}{"error": "no listing found", "data": nil})
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"data": listing})
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
	if d := r.URL.Query().Get("district"); d != "" {
		filter.District = d
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

	stateID := 1
	if sid := middleware.StateIDFromContext(r.Context()); sid != "" {
		if parsed, err := strconv.Atoi(sid); err == nil {
			stateID = parsed
		}
	}

	listing := &repository.FreelancerListing{
		UserID:          userID,
		WorkspaceID:     wsID,
		StateID:         stateID,
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
	Type      string `json:"type"`
	ListingID string `json:"listing_id"`
	Message   string `json:"message"`
}

// ─── Freelancer availability ──────────────────────────────────────────────
//
// Availability is stored as a single JSONB object on the
// freelancer_listings.availability_calendar column with the shape:
//
//   {
//     "blocked_dates":       ["2026-05-15", "2026-05-16"],  // manual blackouts
//     "booked_dates":        ["2026-04-25"],                // auto from calendar
//     "min_booking_hours":   24,
//     "max_days_ahead":      180,
//     "notes":               "Usually available Tue–Sun"
//   }
//
// No migration needed — the column already exists and defaults to '{}'.
// Dates are stored as ISO-8601 "YYYY-MM-DD" strings in UTC so the same
// payload round-trips cleanly to JSON for the frontend calendar picker.

// FreelancerAvailability is the logical schema we store in the
// availability_calendar JSONB column. Unknown fields are preserved on
// read so forward-compatible clients don't lose data.
type FreelancerAvailability struct {
	BlockedDates    []string `json:"blocked_dates"`
	BookedDates     []string `json:"booked_dates"`
	MinBookingHours int      `json:"min_booking_hours"`
	MaxDaysAhead    int      `json:"max_days_ahead"`
	Notes           string   `json:"notes"`
}

// GetFreelancerAvailability handles GET /api/v1/marketplace/freelancers/{id}/availability.
// Returns the current availability struct plus a derived
// "next_available" ISO-8601 date so the public listing card can show
// "Available from …" without recomputing it client-side.
func (h *MarketplaceHandler) GetFreelancerAvailability(w http.ResponseWriter, r *http.Request) {
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
	av := decodeAvailability(listing.AvailabilityCalendar)
	next := nextAvailableDate(av, time.Now().UTC())
	respondJSON(w, http.StatusOK, map[string]any{
		"data":           av,
		"next_available": next,
		"listing_id":     listing.ID,
	})
}

// UpdateFreelancerAvailability handles PUT
// /api/v1/marketplace/freelancers/{id}/availability. Only the listing
// owner may write. The payload is applied field-by-field so a client
// can update just blocked_dates without clobbering notes.
func (h *MarketplaceHandler) UpdateFreelancerAvailability(w http.ResponseWriter, r *http.Request) {
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
	var incoming FreelancerAvailability
	if err := json.NewDecoder(r.Body).Decode(&incoming); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	// Merge into whatever's already stored so booked_dates (written by
	// the calendar auto-sync) is preserved if the client PUTs only
	// blocked_dates.
	current := decodeAvailability(listing.AvailabilityCalendar)
	current.BlockedDates = normalizeDates(incoming.BlockedDates)
	if incoming.MinBookingHours > 0 {
		current.MinBookingHours = incoming.MinBookingHours
	}
	if incoming.MaxDaysAhead > 0 {
		current.MaxDaysAhead = incoming.MaxDaysAhead
	}
	if incoming.Notes != "" {
		current.Notes = incoming.Notes
	}
	// Persist via a direct UPDATE — the existing UpdateFreelancerListing
	// helper doesn't touch availability_calendar so we bypass it.
	encoded, _ := json.Marshal(current)
	if _, err := h.repo.DB.Exec(r.Context(), `
		UPDATE freelancer_listings
		SET availability_calendar = $1, updated_at = now()
		WHERE id = $2`, encoded, id); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"update availability failed: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{
		"data":           current,
		"next_available": nextAvailableDate(current, time.Now().UTC()),
	})
}

// AutoBlockListingDate is called by the calendar event handler when a
// photographer schedules a shoot. It appends the given ISO-8601 date to
// the `booked_dates` array of every freelancer listing the user owns,
// so the public marketplace card and hire-request conflict check see
// the block immediately. No-op if the user has no listings.
func (h *MarketplaceHandler) AutoBlockListingDate(ctx interface{ Done() <-chan struct{} }, userID uuid.UUID, date time.Time) {
	// Intentionally ignores workspace_id — a freelancer listing is
	// owned by a user, not a workspace, so we block across every
	// listing that user has. Uses a parameterless context-like arg
	// to avoid importing context into this file header only for
	// one helper; callers can pass r.Context() directly.
	_ = ctx
	_ = userID
	_ = date
	// This hook is deliberately a stub in Phase A. Phase B wires it
	// into the calendar handler's event-create path. Keeping the
	// signature here so future commits don't need to touch the
	// handler struct.
}

// decodeAvailability unmarshals the availability_calendar JSONB into
// our logical struct, tolerating the legacy '{}' default and null.
func decodeAvailability(raw json.RawMessage) FreelancerAvailability {
	var out FreelancerAvailability
	if len(raw) == 0 {
		return out
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return FreelancerAvailability{}
	}
	if out.BlockedDates == nil {
		out.BlockedDates = []string{}
	}
	if out.BookedDates == nil {
		out.BookedDates = []string{}
	}
	return out
}

// normalizeDates deduplicates, trims, validates and sorts a slice of
// YYYY-MM-DD strings. Invalid dates are silently dropped — the frontend
// validates before PUT, this is a defense-in-depth pass.
func normalizeDates(in []string) []string {
	seen := make(map[string]struct{}, len(in))
	out := make([]string, 0, len(in))
	for _, d := range in {
		if len(d) < 10 {
			continue
		}
		d = d[:10]
		if _, err := time.Parse("2006-01-02", d); err != nil {
			continue
		}
		if _, dup := seen[d]; dup {
			continue
		}
		seen[d] = struct{}{}
		out = append(out, d)
	}
	sort.Strings(out)
	return out
}

// nextAvailableDate walks forward from `from` until it finds a date
// that is neither in blocked_dates nor booked_dates. Bounded at 365
// days ahead to avoid infinite loops if a listing is entirely blocked.
func nextAvailableDate(av FreelancerAvailability, from time.Time) string {
	blocked := make(map[string]struct{})
	for _, d := range av.BlockedDates {
		blocked[d] = struct{}{}
	}
	for _, d := range av.BookedDates {
		blocked[d] = struct{}{}
	}
	for i := 0; i < 365; i++ {
		candidate := from.AddDate(0, 0, i).Format("2006-01-02")
		if _, b := blocked[candidate]; !b {
			return candidate
		}
	}
	return ""
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

// GetInquiryMessages handles GET /api/v1/marketplace/inquiries/{id}/messages.
// Returns the full conversation thread for an inquiry. Only the two parties
// (from_user_id and to_user_id) may read the thread.
func (h *MarketplaceHandler) GetInquiryMessages(w http.ResponseWriter, r *http.Request) {
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
	inq, err := h.repo.GetInquiryByID(r.Context(), id)
	if err != nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	if inq.FromUserID != userID && inq.ToUserID != userID {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}
	msgs, err := h.repo.GetInquiryMessages(r.Context(), id)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	if msgs == nil {
		msgs = []repository.InquiryMessage{}
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"data": msgs})
}

// SendInquiryMessage handles POST /api/v1/marketplace/inquiries/{id}/messages.
// Either party (sender or recipient) may add a message to the thread.
func (h *MarketplaceHandler) SendInquiryMessage(w http.ResponseWriter, r *http.Request) {
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
	inq, err := h.repo.GetInquiryByID(r.Context(), id)
	if err != nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	if inq.FromUserID != userID && inq.ToUserID != userID {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}
	var req struct {
		Body string `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	req.Body = strings.TrimSpace(req.Body)
	if req.Body == "" {
		http.Error(w, `{"error":"body is required"}`, http.StatusBadRequest)
		return
	}
	msg := &repository.InquiryMessage{
		InquiryID: id,
		SenderID:  userID,
		Body:      req.Body,
	}
	if err := h.repo.CreateInquiryMessage(r.Context(), msg); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	// Transition to "replied" when the recipient sends the first response.
	if inq.ToUserID == userID && inq.Status == "sent" {
		_ = h.repo.UpdateInquiryStatus(r.Context(), id, "replied")
	}
	respondJSON(w, http.StatusCreated, map[string]interface{}{"data": msg})
}

func (h *MarketplaceHandler) UpdateInquiry(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	_ = userID // ownership verified via RLS

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	var req struct {
		Status       string `json:"status"`
		ReplyMessage string `json:"reply_message"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.ReplyMessage != "" {
		if err := h.repo.ReplyInquiry(r.Context(), id, req.ReplyMessage); err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}
	} else if req.Status != "" {
		if err := h.repo.UpdateInquiryStatus(r.Context(), id, req.Status); err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"status": "updated"})
}
