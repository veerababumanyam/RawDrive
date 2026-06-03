package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/service"
)

// ConsentHandler handles consent HTTP requests.
type ConsentHandler struct {
	consentSvc *service.ConsentService
}

// NewConsentHandler creates a new ConsentHandler.
func NewConsentHandler(svc *service.ConsentService) *ConsentHandler {
	return &ConsentHandler{consentSvc: svc}
}

// RecordConsent handles POST /public/galleries/{slug}/consent
// Legacy single-toggle path — kept for backwards compatibility.
func (h *ConsentHandler) RecordConsent(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")

	var input struct {
		Email       string `json:"email"`
		ConsentType string `json:"consent_type"`
		Granted     bool   `json:"granted"`
		Language    string `json:"language"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	galleryID, _ := uuid.Parse(slug)
	var gid *uuid.UUID
	if galleryID != uuid.Nil {
		gid = &galleryID
	}

	if err := h.consentSvc.RecordConsent(r.Context(), gid, input.Email, r.RemoteAddr, input.ConsentType, input.Language, input.Granted); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

// RecordBundle handles POST /public/galleries/{slug}/consent/bundle
// Enterprise path for the 8-toggle consent banner — writes all purposes atomically
// with a shared consent_version_hash for audit proof (DPDP § 5(e)).
func (h *ConsentHandler) RecordBundle(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")

	var input struct {
		Email       string          `json:"email"`
		Language    string          `json:"language"`
		ConsentText string          `json:"consent_text"`
		Grants      map[string]bool `json:"grants"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}
	if len(input.Grants) == 0 {
		http.Error(w, `{"error":"grants map required"}`, http.StatusBadRequest)
		return
	}

	galleryID, _ := uuid.Parse(slug)
	var gid *uuid.UUID
	if galleryID != uuid.Nil {
		gid = &galleryID
	}

	bundle := service.ConsentBundle{
		GalleryID:    gid,
		VisitorEmail: input.Email,
		VisitorIP:    r.RemoteAddr,
		UserAgent:    r.UserAgent(),
		Language:     input.Language,
		ConsentText:  input.ConsentText,
		Grants:       input.Grants,
	}
	if err := h.consentSvc.RecordBundle(r.Context(), bundle); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	versionHash := h.consentSvc.HashConsentVersion(input.ConsentText)
	resp := map[string]any{
		"recorded":     len(input.Grants),
		"version_hash": versionHash,
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(resp)
}

// WithdrawConsent handles POST /public/consent/withdraw
// Writes an immutable withdrawal record and dispatches a cascade purge event.
func (h *ConsentHandler) WithdrawConsent(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	var input struct {
		Email       string `json:"email"`
		ConsentType string `json:"consent_type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	var gid *uuid.UUID
	if slug != "" {
		if parsed, err := uuid.Parse(slug); err == nil {
			gid = &parsed
		}
	}

	if err := h.consentSvc.WithdrawConsent(r.Context(), gid, input.Email, input.ConsentType, r.RemoteAddr, r.UserAgent()); err != nil {
		http.Error(w, `{"error":"withdrawal failed: `+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// GetStatusBySlug handles GET /public/galleries/{slug}/consent/status?email=...
// Returns the latest consent state per purpose for a visitor WITHIN this gallery.
//
// Security audit 2026-05-30 V11: this replaces the former global
// GET /public/consent/status?email=, which was an unauthenticated, platform-wide
// PII / membership oracle (probe any email, learn whether it is a visitor
// anywhere and its consent choices). The lookup is now bound to
// (gallery_id, email): the {slug} path segment is the gallery UUID the visitor
// already holds — the same value the consent POST endpoints parse — so a caller
// can only read consent state for a gallery they can already address. A
// missing/invalid gallery id or a missing email is a 400; there is no global
// fallback.
func (h *ConsentHandler) GetStatusBySlug(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "slug"))
	if err != nil || galleryID == uuid.Nil {
		http.Error(w, `{"error":"invalid gallery"}`, http.StatusBadRequest)
		return
	}
	email := r.URL.Query().Get("email")
	if email == "" {
		http.Error(w, `{"error":"email required"}`, http.StatusBadRequest)
		return
	}
	status, err := h.consentSvc.GetConsentStatusForGallery(r.Context(), galleryID, email)
	if err != nil {
		http.Error(w, `{"error":"status lookup failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(status)
}
