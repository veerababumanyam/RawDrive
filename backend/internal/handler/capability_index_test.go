package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestCapabilityIndex confirms the helper writes a JSON descriptor that
// includes the resource name and the supplied capability list. This is the
// PROD-UAT-2026-04-13 P3 fix: bare GETs on group mount paths used to 404,
// they now return a small index document.
func TestCapabilityIndex(t *testing.T) {
	h := capabilityIndex("billing", []string{"invoices", "packages", "reports"})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/billing", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "application/json", rr.Header().Get("Content-Type"))

	var body struct {
		Resource     string   `json:"resource"`
		Capabilities []string `json:"capabilities"`
	}
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &body))
	assert.Equal(t, "billing", body.Resource)
	assert.Equal(t, []string{"invoices", "packages", "reports"}, body.Capabilities)
}
