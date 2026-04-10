package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/service"
)

// ─────────────────────────────────────────────────────────────────────────────
// M16 E49-S1 — Upload policy versions public endpoint tests.
//
// Covers FR-UPS-020 / FR-UPS-021: the browser worker and (future) desktop
// agent need to know which policy_version strings the backend currently
// accepts so they can stamp their manifests with one of them. This endpoint
// is public (no auth) because the browser worker runs before the user is
// even signed in — it is the first thing that loads on the upload page.
//
// Round 3 RED → GREEN:
//   TestUploadPolicyVersions_ReturnsActiveVersions → verifies a 200 with the
//     list of active (non-revoked) policy versions.
//   TestUploadPolicyVersions_EmptyCatalog_ReturnsEmptyArray → returns [] not null.
// ─────────────────────────────────────────────────────────────────────────────

// stubPolicyCatalogLister implements UploadPolicyLister for unit tests.
type stubPolicyCatalogLister struct {
	versions []service.UploadPolicyVersion
	err      error
}

func (s *stubPolicyCatalogLister) ListActive(_ context.Context) ([]service.UploadPolicyVersion, error) {
	return s.versions, s.err
}

func TestUploadPolicyVersions_ReturnsActiveVersions(t *testing.T) {
	stub := &stubPolicyCatalogLister{
		versions: []service.UploadPolicyVersion{
			{
				PolicyVersion: "upload-screening/2026-04-10",
				PolicyJSON:    []byte(`{"version":"2026-04-10"}`),
				PublishedAt:   time.Date(2026, 4, 10, 0, 0, 0, 0, time.UTC),
				MaxAgeDays:    90,
				Notes:         "initial",
			},
		},
	}

	h := NewUploadPolicyHandler(stub)
	r := chi.NewRouter()
	h.RegisterRoutes(r)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/upload-policy/versions", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code, "body: %s", rr.Body.String())

	var resp struct {
		Versions []struct {
			PolicyVersion string `json:"policy_version"`
			MaxAgeDays    int    `json:"max_age_days"`
		} `json:"versions"`
	}
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	require.Len(t, resp.Versions, 1)
	assert.Equal(t, "upload-screening/2026-04-10", resp.Versions[0].PolicyVersion)
	assert.Equal(t, 90, resp.Versions[0].MaxAgeDays)
}

func TestUploadPolicyVersions_EmptyCatalog_ReturnsEmptyArray(t *testing.T) {
	stub := &stubPolicyCatalogLister{versions: nil}
	h := NewUploadPolicyHandler(stub)
	r := chi.NewRouter()
	h.RegisterRoutes(r)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/upload-policy/versions", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)
	// The response must serialize an empty array, never `null`. Client code
	// that iterates versions.length would crash on null otherwise.
	assert.Contains(t, rr.Body.String(), `"versions":[]`)
}
