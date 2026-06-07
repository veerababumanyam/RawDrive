package handler

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
	"github.com/rawdrive/backend/internal/storage"
)

// derivativeDeliveryURL is the single mapping from a derivative storage key to
// the URL the client should fetch for it. When CDN delivery is enabled it
// returns a short-lived signed cdn.rawdrive.in URL for derivative keys
// (thumbnails/*, derivatives/*); otherwise — or for any non-derivative key, or
// a nil signer — it returns the key UNCHANGED so the frontend serves it through
// the JWT-gated /storage proxy exactly as before.
//
// Both the public gallery serializers and this edge path route their derivative
// URLs through here so the "sign or /storage" policy (and its hard
// derivatives-only scope guard) lives in exactly one place. Callers MUST only
// use it after their own access/PIN/gallery-session check — a signed URL is a
// 1-hour bearer capability. Originals/masters never carry a derivative prefix
// and so are never signed.
func derivativeDeliveryURL(cdn *storage.CDNSigner, key string) string {
	return cdn.DerivativeDeliveryURL(key)
}

type EdgeDeliveryHandler struct {
	assetRepo    *repository.AssetRepo
	thumbnailSvc *service.ThumbnailService
	watermarkSvc *service.WatermarkService
}

func NewEdgeDeliveryHandler(assetRepo *repository.AssetRepo, thumbnailSvc *service.ThumbnailService, watermarkSvc *service.WatermarkService) *EdgeDeliveryHandler {
	return &EdgeDeliveryHandler{assetRepo: assetRepo, thumbnailSvc: thumbnailSvc, watermarkSvc: watermarkSvc}
}

// derivativeFallbackStorageKey reconstructs a derivative's storage key when the
// asset_derivatives row is absent (legacy assets predating the table, or a race
// with the worker). It MUST agree with the keys the upload paths actually write:
//   - thumb-sized WebPs live under thumbnails/<id>/<variant>.webp
//   - full-res display_webp + any other variant lives under derivatives/<id>/
//
// For E2EE assets the encrypted-derivative handler stores the full-res display
// variant as ciphertext under …/display_webp.webp.enc (see
// encryptedDerivativeStorageKey). The previous fallback always emitted the plain
// .webp key, so for encrypted assets it pointed at a key that never exists →
// guaranteed 404 even though the object was present at the .enc key. Honor the
// asset's encryption state so the fallback resolves the real object. Thumbnails
// are stored without the .enc suffix in both modes, so they are unaffected.
func derivativeFallbackStorageKey(assetID uuid.UUID, variant string, encrypted bool) string {
	switch variant {
	case "thumb_sm_webp", "thumb_md_webp", "thumb_lg_webp":
		return fmt.Sprintf("thumbnails/%s/%s.webp", assetID, variant)
	default:
		if encrypted {
			return fmt.Sprintf("derivatives/%s/%s.webp.enc", assetID, variant)
		}
		return fmt.Sprintf("derivatives/%s/%s.webp", assetID, variant)
	}
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
	asset, _, ok := guardAssetWorkspace(w, r, h.assetRepo, assetID)
	if !ok {
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
		// assets predating the table, or a race with the worker).
		storageKey = derivativeFallbackStorageKey(assetID, variant, asset.IsEncrypted)
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
