package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/middleware"
)

func TestDashboardHandler_GetGalleryActivity_Unauthorized(t *testing.T) {
	h := NewDashboardHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/dashboard/gallery-activity?days=7", nil)
	rr := httptest.NewRecorder()

	h.GetGalleryActivity(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestDashboardHandler_GetGalleryActivity_InvalidWorkspace(t *testing.T) {
	h := NewDashboardHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/dashboard/gallery-activity?days=7", nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), map[string]interface{}{
		"workspace_id": "not-a-uuid",
	}))
	rr := httptest.NewRecorder()

	h.GetGalleryActivity(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDashboardHandler_GetGalleryActivity_NoPoolReturnsZeroedStats(t *testing.T) {
	h := NewDashboardHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/dashboard/gallery-activity?days=7", nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), map[string]interface{}{
		"workspace_id": uuid.NewString(),
	}))
	rr := httptest.NewRecorder()

	h.GetGalleryActivity(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var payload struct {
		Data struct {
			Views           int64 `json:"views"`
			Downloads       int64 `json:"downloads"`
			Selections      int64 `json:"selections"`
			ActiveGalleries int64 `json:"activeGalleries"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &payload))
	assert.Equal(t, int64(0), payload.Data.Views)
	assert.Equal(t, int64(0), payload.Data.Downloads)
	assert.Equal(t, int64(0), payload.Data.Selections)
	assert.Equal(t, int64(0), payload.Data.ActiveGalleries)
}
