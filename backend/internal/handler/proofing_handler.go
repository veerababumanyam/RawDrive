package handler

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/service"
)

// ProofingHandler handles proofing HTTP requests.
type ProofingHandler struct {
	proofingSvc *service.ProofingService
	gallerySvc  *service.GalleryService // optional, for selection limit checks
	accessSvc   *service.GalleryAccessService
}

func NewProofingHandler(svc *service.ProofingService) *ProofingHandler {
	return &ProofingHandler{proofingSvc: svc}
}

// WithGalleryService injects the gallery service for selection limit enforcement.
func (h *ProofingHandler) WithGalleryService(gs *service.GalleryService) *ProofingHandler {
	h.gallerySvc = gs
	return h
}

func (h *ProofingHandler) WithGalleryAccessService(accessSvc *service.GalleryAccessService) *ProofingHandler {
	h.accessSvc = accessSvc
	return h
}

func (h *ProofingHandler) ListByGallery(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	selections, err := h.proofingSvc.ListByGallery(r.Context(), galleryID)
	if err != nil {
		http.Error(w, `{"error":"list failed"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, selections)
}

// ExportCSV handles GET /api/v1/galleries/{id}/proofing/export.csv (GAL-FR-130).
// Streams all proofing selections for a gallery as CSV with stable columns.
// Studios use this to import picks into Lightroom / Photo Mechanic via their
// Session Importers. encoding/csv handles commas/quotes in note text; the
// response is streamed so large galleries do not buffer in memory.
func (h *ProofingHandler) ExportCSV(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}
	selections, err := h.proofingSvc.ListByGallery(r.Context(), galleryID)
	if err != nil {
		http.Error(w, `{"error":"list failed"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition",
		fmt.Sprintf(`attachment; filename="proofing-%s.csv"`, galleryID.String()))
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)

	cw := csv.NewWriter(w)
	defer cw.Flush()
	_ = cw.Write([]string{
		"selection_id", "asset_id", "client_name", "client_email",
		"status", "note", "created_at",
	})
	for _, sel := range selections {
		_ = cw.Write([]string{
			sel.ID.String(),
			sel.AssetID.String(),
			sel.ClientName,
			sel.ClientEmail,
			sel.Status,
			sel.Note,
			sel.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
		})
	}
}

func (h *ProofingHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	selectionID, err := uuid.Parse(chi.URLParam(r, "selectionId"))
	if err != nil {
		http.Error(w, `{"error":"invalid selection id"}`, http.StatusBadRequest)
		return
	}

	var input struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	if err := h.proofingSvc.UpdateStatus(r.Context(), selectionID, input.Status); err != nil {
		http.Error(w, `{"error":"update failed"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (h *ProofingHandler) SubmitPublic(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		http.Error(w, `{"error":"missing slug"}`, http.StatusBadRequest)
		return
	}

	var input struct {
		AssetIDs    []string `json:"asset_ids"`
		ClientName  string   `json:"client_name"`
		ClientEmail string   `json:"client_email"`
		Note        string   `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	if input.ClientName == "" || input.ClientEmail == "" {
		http.Error(w, `{"error":"client_name and client_email are required"}`, http.StatusBadRequest)
		return
	}
	if len(input.AssetIDs) == 0 {
		http.Error(w, `{"error":"at least one asset_id is required"}`, http.StatusBadRequest)
		return
	}

	var galleryID uuid.UUID
	var maxSelections int
	var passwordHash *string
	if h.gallerySvc != nil {
		gallery, err := h.gallerySvc.GetBySlug(r.Context(), slug)
		if err == nil && gallery != nil {
			galleryID = gallery.ID
			maxSelections = gallery.MaxSelections
			passwordHash = gallery.PasswordHash
		}
	}
	if passwordHash != nil && *passwordHash != "" {
		token := r.Header.Get("X-Gallery-Session")
		if token == "" {
			if c, err := r.Cookie("gallery_session"); err == nil {
				token = c.Value
			}
		}
		if h.accessSvc == nil || !h.accessSvc.ValidateSession(r.Context(), galleryID, token) {
			http.Error(w, `{"error":"gallery password required"}`, http.StatusUnauthorized)
			return
		}
	}

	// M22 E74-S1: Selection limit enforcement
	if h.gallerySvc != nil {
		if galleryID != uuid.Nil && maxSelections > 0 {
			existing, _ := h.proofingSvc.CountByGallery(r.Context(), galleryID)
			if existing+len(input.AssetIDs) > maxSelections {
				respondJSON(w, http.StatusTooManyRequests, map[string]interface{}{
					"error":   "selection_limit_reached",
					"limit":   maxSelections,
					"current": existing,
				})
				return
			}
		}
	}

	if err := h.proofingSvc.SubmitPublicBySlug(r.Context(), slug, input.AssetIDs, input.ClientName, input.ClientEmail, input.Note); err != nil {
		if err.Error() == "gallery not found" || err.Error() == "gallery is not published" {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"submission failed"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	w.Write([]byte(`{"status":"submitted"}`))
}
