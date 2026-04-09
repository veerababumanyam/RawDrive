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

// WithdrawConsent handles POST /public/consent/withdraw
func (h *ConsentHandler) WithdrawConsent(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Email       string `json:"email"`
		ConsentType string `json:"consent_type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	if err := h.consentSvc.WithdrawConsent(r.Context(), input.Email, input.ConsentType); err != nil {
		http.Error(w, `{"error":"withdrawal failed"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}
