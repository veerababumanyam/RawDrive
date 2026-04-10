package handler

// print_preflight_handler.go — M14 GAL-FR-160.
//
// Thin HTTP wrapper around service.EvaluatePrintPreflight. Clients POST
// their source dimensions plus desired print size and receive a
// quality classification and required-pixels hint.

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/rawdrive/backend/internal/service"
)

// PrintPreflightHandler handles POST /commerce/print-preflight.
type PrintPreflightHandler struct{}

// NewPrintPreflightHandler constructs a PrintPreflightHandler.
func NewPrintPreflightHandler() *PrintPreflightHandler {
	return &PrintPreflightHandler{}
}

// Evaluate handles POST /commerce/print-preflight
func (h *PrintPreflightHandler) Evaluate(w http.ResponseWriter, r *http.Request) {
	var req service.PrintPreflightRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid_json", "invalid json body")
		return
	}
	targetDPI := 0
	if raw := r.URL.Query().Get("target_dpi"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			targetDPI = n
		}
	}
	result := service.EvaluatePrintPreflight(req, targetDPI)
	respondJSON(w, http.StatusOK, result)
}
