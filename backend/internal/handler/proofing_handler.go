package handler

import (
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/service"
)

// ProofingHandler handles proofing HTTP requests.
type ProofingHandler struct {
	proofingSvc *service.ProofingService
	gallerySvc  *service.GalleryService // optional, for selection limit checks
	accessSvc   *service.GalleryAccessService
	shareSvc    *service.ShareLinkService
	readPool    *pgxpool.Pool
}

func NewProofingHandler(svc *service.ProofingService) *ProofingHandler {
	return &ProofingHandler{proofingSvc: svc}
}

// WithGalleryService injects the gallery service for selection limit enforcement.
func (h *ProofingHandler) WithGalleryService(gs *service.GalleryService) *ProofingHandler {
	h.gallerySvc = gs
	return h
}

func (h *ProofingHandler) WithGalleryReadAccessPool(pool *pgxpool.Pool) *ProofingHandler {
	h.readPool = pool
	return h
}

func (h *ProofingHandler) WithGalleryAccessService(accessSvc *service.GalleryAccessService) *ProofingHandler {
	h.accessSvc = accessSvc
	return h
}

func (h *ProofingHandler) WithShareLinkService(shareSvc *service.ShareLinkService) *ProofingHandler {
	h.shareSvc = shareSvc
	return h
}

func (h *ProofingHandler) ListByGallery(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	if _, _, ok := guardGalleryReadableWorkspace(w, r, h.gallerySvc, h.readPool, galleryID); !ok {
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
	if _, _, ok := guardGalleryReadableWorkspace(w, r, h.gallerySvc, h.readPool, galleryID); !ok {
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

	// tenant-ownership guard (integration audit 2026-05-31). The URL carries a
	// selection id, not a gallery id, so guardGalleryWorkspace cannot be called
	// directly. Instead the update is scoped to the caller's workspace via the
	// selection's owning gallery in a single atomic statement: 0 rows affected
	// means the selection does not exist or belongs to another tenant -> 404.
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}

	rows, err := h.proofingSvc.UpdateStatusInWorkspace(r.Context(), selectionID, input.Status, workspaceID)
	if err != nil {
		if errors.Is(err, service.ErrProofingInvalidStatus) {
			http.Error(w, `{"error":"invalid status"}`, http.StatusBadRequest)
			return
		}
		http.Error(w, `{"error":"update failed"}`, http.StatusInternalServerError)
		return
	}
	if rows == 0 {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
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

	if h.gallerySvc == nil {
		http.Error(w, `{"error":"proofing unavailable"}`, http.StatusInternalServerError)
		return
	}

	publicGate := NewPublicGalleryHandler(h.gallerySvc, nil, h.shareSvc).
		WithGalleryAccessService(h.accessSvc)

	gallery, err := publicGate.resolveGalleryForRequest(r, slug)
	if err != nil {
		http.Error(w, `{"error":"gallery lookup failed"}`, http.StatusInternalServerError)
		return
	}
	if gallery == nil {
		http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
		return
	}

	if !publicGate.gateGalleryAccess(w, r, gallery) {
		return
	}

	if err := h.proofingSvc.SubmitPublicForGallery(r.Context(), gallery, input.AssetIDs, input.ClientName, input.ClientEmail, input.Note); err != nil {
		if err.Error() == "gallery not found" || err.Error() == "gallery is not published" {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusNotFound)
			return
		}
		if err.Error() == "gallery has expired" {
			http.Error(w, `{"error":"gallery expired"}`, http.StatusGone)
			return
		}
		if errors.Is(err, service.ErrProofingSelectionLimitExceeded) {
			respondJSON(w, http.StatusTooManyRequests, map[string]interface{}{
				"error": "selection_limit_reached",
				"limit": gallery.MaxSelections,
			})
			return
		}
		if errors.Is(err, service.ErrProofingAssetNotInGallery) {
			http.Error(w, `{"error":"asset not in gallery"}`, http.StatusBadRequest)
			return
		}
		http.Error(w, `{"error":"submission failed"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	w.Write([]byte(`{"status":"submitted"}`))
}
