package handler

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/rawdrive/backend/internal/service"
)

// ─────────────────────────────────────────────────────────────────────────────
// M16 E49-S1 — Public upload policy versions endpoint.
//
// GET /api/v1/upload-policy/versions
//
// Purpose: the browser screening worker (Round 4) and the desktop companion
// (M17) need to know which policy_version strings the backend currently
// accepts. Without this endpoint the client would have to hard-code a
// version, which would break every time super-admin publishes a new one.
//
// Public (no auth) by design: the browser worker runs on the login page
// before the user authenticates. Rate-limiting is handled by the outer
// middleware.RateLimit stack.
//
// Implementation is a thin adapter over UploadPolicyLister (a narrow
// interface the concrete UploadPolicyCatalog satisfies via its ListActive
// method added in the same M16 round).
// ─────────────────────────────────────────────────────────────────────────────

// UploadPolicyLister is the minimal interface the handler needs over the
// policy catalog. Implemented by *service.UploadPolicyCatalog.
type UploadPolicyLister interface {
	ListActive(ctx context.Context) ([]service.UploadPolicyVersion, error)
}

// UploadPolicyHandler exposes the public policy versions endpoint.
type UploadPolicyHandler struct {
	catalog UploadPolicyLister
}

// NewUploadPolicyHandler constructs the handler. Pass nil to disable the
// endpoint (rare — primarily for tests that only verify route registration
// on the surrounding router).
func NewUploadPolicyHandler(catalog UploadPolicyLister) *UploadPolicyHandler {
	return &UploadPolicyHandler{catalog: catalog}
}

// RegisterRoutes mounts the handler at /api/v1/upload-policy/versions.
func (h *UploadPolicyHandler) RegisterRoutes(r chi.Router) {
	r.Get("/api/v1/upload-policy/versions", h.List)
}

// policyVersionDTO is the wire shape for one policy version. We do NOT
// serialize the raw policy_json blob — clients read it indirectly via the
// version identifier so we can tweak the JSON shape without bumping the API.
type policyVersionDTO struct {
	PolicyVersion string `json:"policy_version"`
	PublishedAt   string `json:"published_at"`
	MaxAgeDays    int    `json:"max_age_days"`
	Notes         string `json:"notes,omitempty"`
}

// List handles GET /api/v1/upload-policy/versions.
func (h *UploadPolicyHandler) List(w http.ResponseWriter, r *http.Request) {
	if h.catalog == nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"versions": []policyVersionDTO{},
		})
		return
	}

	versions, err := h.catalog.ListActive(r.Context())
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError,
			"POLICY_CATALOG_UNAVAILABLE", err.Error())
		return
	}

	// Always emit an empty array (not null) when the catalog is empty, so
	// clients can safely iterate without a nil check.
	dto := make([]policyVersionDTO, 0, len(versions))
	for _, v := range versions {
		dto = append(dto, policyVersionDTO{
			PolicyVersion: v.PolicyVersion,
			PublishedAt:   v.PublishedAt.UTC().Format("2006-01-02T15:04:05Z"),
			MaxAgeDays:    v.MaxAgeDays,
			Notes:         v.Notes,
		})
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"versions": dto,
	})
}
