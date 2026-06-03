package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
)

// KycHandler exposes dealer KYC document endpoints. Files are uploaded to
// the configured S3-compatible object store (Backblaze B2 by default) by
// the frontend; this handler only tracks metadata + review state.
type KycHandler struct {
	repo       *repository.KycDocumentRepo
	dealerRepo *repository.DealerRepo
}

func NewKycHandler(repo *repository.KycDocumentRepo, dealerRepo *repository.DealerRepo) *KycHandler {
	return &KycHandler{repo: repo, dealerRepo: dealerRepo}
}

type createKycDocumentRequest struct {
	DocumentType string `json:"document_type"`
	StorageKey   string `json:"storage_key"`
	Filename     string `json:"filename"`
}

// Create handles POST /api/v1/dealer/kyc-documents.
// Auth: the caller must be a registered dealer (we resolve dealer_id via user_id).
func (h *KycHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	var req createKycDocumentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.StorageKey == "" || req.Filename == "" {
		http.Error(w, `{"error":"storage_key and filename required"}`, http.StatusBadRequest)
		return
	}
	if err := repository.ValidateKycDocumentType(req.DocumentType); err != nil {
		http.Error(w, `{"error":"invalid document_type"}`, http.StatusBadRequest)
		return
	}

	dealer, err := h.dealerRepo.GetByUserID(r.Context(), userID)
	if err != nil {
		http.Error(w, `{"error":"not a registered dealer"}`, http.StatusForbidden)
		return
	}

	doc := &repository.KycDocument{
		DealerID:     dealer.ID,
		DocumentType: req.DocumentType,
		StorageKey:   req.StorageKey,
		Filename:     req.Filename,
		Status:       "pending",
	}
	if err := h.repo.Create(r.Context(), doc); err != nil {
		if errors.Is(err, repository.ErrInvalidKycDocumentType) {
			http.Error(w, `{"error":"invalid document_type"}`, http.StatusBadRequest)
			return
		}
		http.Error(w, `{"error":"failed to save document"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusCreated, doc)
}

// List handles GET /api/v1/dealer/kyc-documents.
// Returns all KYC documents belonging to the authenticated dealer.
func (h *KycHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	dealer, err := h.dealerRepo.GetByUserID(r.Context(), userID)
	if err != nil {
		http.Error(w, `{"error":"not a registered dealer"}`, http.StatusForbidden)
		return
	}
	docs, err := h.repo.ListByDealer(r.Context(), dealer.ID)
	if err != nil {
		http.Error(w, `{"error":"failed to list documents"}`, http.StatusInternalServerError)
		return
	}
	if docs == nil {
		docs = []repository.KycDocument{}
	}
	respondJSON(w, http.StatusOK, docs)
}

type reviewKycDocumentRequest struct {
	Status          string  `json:"status"`
	RejectionReason *string `json:"rejection_reason,omitempty"`
}

// AdminReview handles PATCH /api/v1/admin/kyc-documents/{id}.
// Admin-only (wired under requireAdmin). Transitions status to approved or rejected.
func (h *KycHandler) AdminReview(w http.ResponseWriter, r *http.Request) {
	reviewerID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	docID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid document id"}`, http.StatusBadRequest)
		return
	}
	var req reviewKycDocumentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.Status != "approved" && req.Status != "rejected" {
		http.Error(w, `{"error":"status must be 'approved' or 'rejected'"}`, http.StatusBadRequest)
		return
	}
	if req.Status == "rejected" && (req.RejectionReason == nil || *req.RejectionReason == "") {
		http.Error(w, `{"error":"rejection_reason required when rejecting"}`, http.StatusBadRequest)
		return
	}
	if err := h.repo.UpdateStatus(r.Context(), docID, req.Status, req.RejectionReason, reviewerID); err != nil {
		http.Error(w, `{"error":"failed to update status"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": req.Status})
}
