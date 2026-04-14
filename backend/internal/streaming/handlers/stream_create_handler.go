// Package handlers — M34 story 34-2.
//
// StreamCreateHandler serves POST /api/v1/streaming/streams — the photographer
// stream-creation endpoint invoked from /streams/new.
//
// The flow is ordering-sensitive (packet invariant): ReserveCredits MUST
// succeed before Cloudflare provisioning, and if CF fails AFTER reservation
// the handler MUST release the reservation before returning 502. Otherwise we
// leak paid minutes on CF errors.
package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/streaming/cf"
	"github.com/rawdrive/backend/internal/streaming/credit"
)

// CreditReserver is the credit-service slice the handler needs.
type CreditReserver interface {
	ReserveCredits(ctx context.Context, in credit.ReserveInput) (*credit.Reservation, error)
	RefundReservation(ctx context.Context, in credit.RefundInput) (*credit.LedgerEntry, error)
}

// CFProvisioner is the CF live-input slice the handler needs.
type CFProvisioner interface {
	Create(ctx context.Context, meta map[string]string) (*cf.LiveInput, error)
}

// StreamCreateInput is what the handler persists via the writer. Matches the
// superset of migration-091 columns + the existing M31 stream columns.
type StreamCreateInput struct {
	WorkspaceID             uuid.UUID
	Title                   string
	PackageID               uuid.UUID
	ExpectedDurationMinutes int
	AccessPolicy            string
	ChatPolicy              string
	CalendarEventURL        string
	ClientProfileID         *uuid.UUID
	DealLink                string
	Timezone                string
	BrandingOverrides       json.RawMessage
	ReservationID           uuid.UUID
	CFLiveInputID           string
}

// StreamWriter persists new stream rows. Handler-local interface; real impl
// in repository layer is wired at route-mount time.
type StreamWriter interface {
	CreateStream(ctx context.Context, in StreamCreateInput) (uuid.UUID, error)
}

// Shortlinker is the slice of shortlink.Service the handler needs.
type Shortlinker interface {
	Generate(ctx context.Context, streamID, workspaceID uuid.UUID) (string, error)
}

// StreamCreateDeps bundles the handler's collaborators.
type StreamCreateDeps struct {
	Credit    CreditReserver
	CF        CFProvisioner
	Writer    StreamWriter
	Shortlink Shortlinker
	Flag      ConsoleFeatureFlag
	Clock     func() time.Time
}

// StreamCreateHandler serves POST /streams.
type StreamCreateHandler struct {
	deps StreamCreateDeps
}

// NewStreamCreateHandler wires the handler.
func NewStreamCreateHandler(deps StreamCreateDeps) *StreamCreateHandler {
	if deps.Clock == nil {
		deps.Clock = time.Now
	}
	return &StreamCreateHandler{deps: deps}
}

// createStreamRequest is the wire payload. Mirrors CreateStreamRequest in
// impl-spec 34-2 §Function Signatures.
type createStreamRequest struct {
	Title                   string          `json:"title"`
	PackageID               string          `json:"package_id"`
	ExpectedDurationMinutes int             `json:"expected_duration_minutes"`
	AccessPolicy            string          `json:"access_policy"`
	ChatPolicy              string          `json:"chat_policy"`
	CalendarEventURL        string          `json:"calendar_event_url,omitempty"`
	ClientProfileID         string          `json:"client_profile_id,omitempty"`
	DealLink                string          `json:"deal_link,omitempty"`
	Timezone                string          `json:"timezone"`
	BrandingOverrides       json.RawMessage `json:"branding_overrides,omitempty"`
	IdempotencyKey          string          `json:"idempotency_key"`
}

// Create handles POST /api/v1/streaming/streams.
func (h *StreamCreateHandler) Create(w http.ResponseWriter, r *http.Request) {
	claims := middleware.JWTClaimsFromContext(r.Context())
	wsStr, _ := claims["workspace_id"].(string)
	if wsStr == "" {
		http.Error(w, `{"error":"unauthenticated"}`, http.StatusUnauthorized)
		return
	}
	workspaceID, err := uuid.Parse(wsStr)
	if err != nil {
		http.Error(w, `{"error":"unauthenticated"}`, http.StatusUnauthorized)
		return
	}
	userStr, _ := claims["sub"].(string)
	userUUID, _ := uuid.Parse(userStr)

	// Feature-flag gate (404 on off per packet anti-enum rule).
	if h.deps.Flag != nil {
		if enabled, _ := h.deps.Flag.IsEnabled(r.Context(), workspaceID); !enabled {
			http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
			return
		}
	}

	var req createStreamRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeValidationError(w, "body", "invalid_json")
		return
	}

	pkgID, verr := validateCreate(&req)
	if verr != nil {
		writeValidationError(w, verr.field, verr.msg)
		return
	}

	// Idempotency key fallback — header or body. Body-less retries from the
	// frontend always use the body field (impl-spec §Data Flow step 3).
	idemKey := req.IdempotencyKey
	if hk := r.Header.Get("Idempotency-Key"); hk != "" {
		idemKey = hk
	}

	// Step 1: ReserveCredits. On insufficient balance return 402 and DO NOT
	// touch Cloudflare.
	streamID := uuid.New()
	reservation, err := h.deps.Credit.ReserveCredits(r.Context(), credit.ReserveInput{
		WorkspaceID:    workspaceID,
		StreamID:       streamID,
		PackageID:      pkgID,
		Minutes:        req.ExpectedDurationMinutes,
		IdempotencyKey: idemKey,
		CreatedBy:      uuidPtrOrNil(userUUID),
	})
	if err != nil {
		if errors.Is(err, credit.ErrInsufficient) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusPaymentRequired)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"error":             "insufficient_credits",
				"required_minutes":  req.ExpectedDurationMinutes,
				"available_minutes": 0,
			})
			return
		}
		http.Error(w, `{"error":"reserve_failed"}`, http.StatusInternalServerError)
		return
	}

	// Step 2: Provision Cloudflare live input. On failure release reservation
	// and return 502.
	liveInput, err := h.deps.CF.Create(r.Context(), map[string]string{
		"stream_id":    streamID.String(),
		"workspace_id": workspaceID.String(),
	})
	if err != nil {
		// Release reservation — best-effort; log on failure but don't double-write.
		if reservation != nil {
			_, _ = h.deps.Credit.RefundReservation(r.Context(), credit.RefundInput{
				ReservationID:  reservation.ID,
				IdempotencyKey: idemKey + "-release",
				Reason:         "cf_provision_failed",
			})
		}
		http.Error(w, `{"error":"cf_provision_failed"}`, http.StatusBadGateway)
		return
	}

	// Step 3: Persist stream row.
	insertInput := StreamCreateInput{
		WorkspaceID:             workspaceID,
		Title:                   strings.TrimSpace(req.Title),
		PackageID:               pkgID,
		ExpectedDurationMinutes: req.ExpectedDurationMinutes,
		AccessPolicy:            req.AccessPolicy,
		ChatPolicy:              req.ChatPolicy,
		CalendarEventURL:        req.CalendarEventURL,
		ClientProfileID:         parseUUIDPtr(req.ClientProfileID),
		DealLink:                req.DealLink,
		Timezone:                req.Timezone,
		BrandingOverrides:       req.BrandingOverrides,
		ReservationID:           reservationID(reservation),
		CFLiveInputID:           liveInput.UID,
	}
	persistedID, err := h.deps.Writer.CreateStream(r.Context(), insertInput)
	if err != nil {
		http.Error(w, `{"error":"persist_failed"}`, http.StatusInternalServerError)
		return
	}

	// Step 4: Generate shortlink.
	var shortCode string
	if h.deps.Shortlink != nil {
		shortCode, _ = h.deps.Shortlink.Generate(r.Context(), persistedID, workspaceID)
	}

	resp := map[string]any{
		"stream_id":        persistedID,
		"shortlink_code":   shortCode,
		"reservation_id":   reservationID(reservation),
		"reserved_minutes": req.ExpectedDurationMinutes,
		"cf_live_input_id": liveInput.UID,
		"access_policy":    req.AccessPolicy,
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(resp)
}

// --- validation ---

type validationErr struct{ field, msg string }

func validateCreate(req *createStreamRequest) (uuid.UUID, *validationErr) {
	title := strings.TrimSpace(req.Title)
	if len(title) < 3 || len(title) > 120 {
		return uuid.Nil, &validationErr{"title", "length_3_120"}
	}
	pkgID, err := uuid.Parse(req.PackageID)
	if err != nil || pkgID == uuid.Nil {
		return uuid.Nil, &validationErr{"package_id", "invalid_uuid"}
	}
	if req.ExpectedDurationMinutes < 5 || req.ExpectedDurationMinutes > 720 {
		return uuid.Nil, &validationErr{"expected_duration_minutes", "range_5_720"}
	}
	switch req.AccessPolicy {
	case "pin", "link", "sso":
	default:
		return uuid.Nil, &validationErr{"access_policy", "enum_violation"}
	}
	switch req.ChatPolicy {
	case "off", "authenticated", "open":
	default:
		return uuid.Nil, &validationErr{"chat_policy", "enum_violation"}
	}
	if req.Timezone == "" {
		return uuid.Nil, &validationErr{"timezone", "required"}
	}
	if _, err := time.LoadLocation(req.Timezone); err != nil {
		return uuid.Nil, &validationErr{"timezone", "invalid_iana"}
	}
	if req.CalendarEventURL != "" && !strings.HasPrefix(req.CalendarEventURL, "https://") {
		return uuid.Nil, &validationErr{"calendar_event_url", "https_required"}
	}
	if req.DealLink != "" && !strings.HasPrefix(req.DealLink, "https://") {
		return uuid.Nil, &validationErr{"deal_link", "https_required"}
	}
	if req.IdempotencyKey == "" {
		return uuid.Nil, &validationErr{"idempotency_key", "required"}
	}
	return pkgID, nil
}

func writeValidationError(w http.ResponseWriter, field, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadRequest)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error":   "validation",
		"details": []map[string]string{{"field": field, "msg": msg}},
	})
}

func parseUUIDPtr(s string) *uuid.UUID {
	if s == "" {
		return nil
	}
	id, err := uuid.Parse(s)
	if err != nil {
		return nil
	}
	return &id
}

func uuidPtrOrNil(id uuid.UUID) *uuid.UUID {
	if id == uuid.Nil {
		return nil
	}
	return &id
}

func reservationID(r *credit.Reservation) uuid.UUID {
	if r == nil {
		return uuid.Nil
	}
	return r.ID
}
