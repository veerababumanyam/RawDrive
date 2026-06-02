package handler

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

type EdgeDeliveryHandler struct {
	assetRepo    *repository.AssetRepo
	thumbnailSvc *service.ThumbnailService
	watermarkSvc *service.WatermarkService
}

func NewEdgeDeliveryHandler(assetRepo *repository.AssetRepo, thumbnailSvc *service.ThumbnailService, watermarkSvc *service.WatermarkService) *EdgeDeliveryHandler {
	return &EdgeDeliveryHandler{assetRepo: assetRepo, thumbnailSvc: thumbnailSvc, watermarkSvc: watermarkSvc}
}

func (h *EdgeDeliveryHandler) ServeDerivative(w http.ResponseWriter, r *http.Request) {
	assetIDStr := chi.URLParam(r, "assetId")
	variant := chi.URLParam(r, "variant")
	assetID, err := uuid.Parse(assetIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid asset_id"}`, http.StatusBadRequest)
		return
	}
	// tenant-ownership guard (integration audit 2026-05-31)
	if _, _, ok := guardAssetWorkspace(w, r, h.assetRepo, assetID); !ok {
		return
	}
	if variant == "" {
		variant = "display_webp"
	}

	var storageKey string
	err = h.assetRepo.Pool().QueryRow(r.Context(),
		`SELECT storage_key FROM asset_derivatives WHERE asset_id = $1 AND variant = $2`, assetID, variant).Scan(&storageKey)
	if err != nil {
		// Fallback when asset_derivatives doesn't have the row yet (legacy
		// assets predating the table, or a race with the worker). The path
		// prefix must mirror service.webpStorageKey: thumb-sized WebPs live
		// under thumbnails/<id>/ (public path), full-res display_webp + any
		// other variants live under derivatives/<id>/.
		switch variant {
		case "thumb_sm_webp", "thumb_md_webp", "thumb_lg_webp":
			storageKey = fmt.Sprintf("thumbnails/%s/%s.webp", assetID, variant)
		default:
			storageKey = fmt.Sprintf("derivatives/%s/%s.webp", assetID, variant)
		}
	}

	reader, err := h.thumbnailSvc.GetStore().Get(r.Context(), storageKey)
	if err != nil {
		http.Error(w, `{"error":"derivative not found"}`, http.StatusNotFound)
		return
	}
	defer reader.Close()

	w.Header().Set("Cache-Control", "public, max-age=86400, immutable")
	w.Header().Set("X-Content-Type-Options", "nosniff")

	applyWatermark := r.URL.Query().Get("watermark") == "true"
	if applyWatermark && h.watermarkSvc != nil {
		text := r.URL.Query().Get("watermark_text")
		if text == "" {
			text = "PROOF"
		}
		position := r.URL.Query().Get("watermark_position")
		if position == "" {
			position = "tiled"
		}
		opacity := 0.3
		if o := r.URL.Query().Get("watermark_opacity"); o != "" {
			if parsed, err := strconv.ParseFloat(o, 64); err == nil && parsed > 0 && parsed <= 1 {
				opacity = parsed
			}
		}
		cfg := service.WatermarkConfig{Text: text, Position: position, Opacity: opacity, FontSize: 48}
		watermarked, err := h.watermarkSvc.Apply(r.Context(), reader, cfg)
		if err == nil {
			w.Header().Set("Content-Type", "image/jpeg")
			w.Header().Set("X-Watermarked", "true")
			w.WriteHeader(http.StatusOK)
			buf := make([]byte, 32*1024)
			for {
				n, err := watermarked.Read(buf)
				if n > 0 {
					w.Write(buf[:n])
				}
				if err != nil {
					break
				}
			}
			return
		}
	}

	contentType := "image/jpeg"
	if len(variant) > 4 && variant[len(variant)-4:] == "webp" {
		contentType = "image/webp"
	}
	w.Header().Set("Content-Type", contentType)
	w.WriteHeader(http.StatusOK)
	buf := make([]byte, 32*1024)
	for {
		n, err := reader.Read(buf)
		if n > 0 {
			w.Write(buf[:n])
		}
		if err != nil {
			break
		}
	}
}
