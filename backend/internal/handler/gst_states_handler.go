package handler

import (
	"net/http"
	"sort"

	"github.com/rawdrive/backend/internal/service"
)

// GSTStatesHandler provides Indian state code lookups for Place of Supply.
type GSTStatesHandler struct {
	gst *service.GSTService
}

func NewGSTStatesHandler() *GSTStatesHandler {
	return &GSTStatesHandler{gst: service.NewGSTService()}
}

// ListStates returns all Indian states/UTs with their 2-digit GSTIN codes.
// GET /api/v1/gst/states
func (h *GSTStatesHandler) ListStates(w http.ResponseWriter, r *http.Request) {
	states := h.gst.AllStates()
	type stateEntry struct {
		Code string `json:"code"`
		Name string `json:"name"`
	}
	result := make([]stateEntry, 0, len(states))
	for code, name := range states {
		result = append(result, stateEntry{Code: code, Name: name})
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Code < result[j].Code })
	respondJSON(w, http.StatusOK, result)
}

// DetermineGSTType returns whether CGST+SGST or IGST applies.
// GET /api/v1/gst/determine?supplier_code=36&supply_code=29
func (h *GSTStatesHandler) DetermineGSTType(w http.ResponseWriter, r *http.Request) {
	supplierCode := r.URL.Query().Get("supplier_code")
	supplyCode := r.URL.Query().Get("supply_code")
	if supplierCode == "" || supplyCode == "" {
		http.Error(w, `{"error":"supplier_code and supply_code query params required"}`, http.StatusBadRequest)
		return
	}
	gstType := h.gst.DetermineGSTType(supplierCode, supplyCode)
	respondJSON(w, http.StatusOK, map[string]string{
		"gst_type":      gstType,
		"supplier_code": supplierCode,
		"supply_code":   supplyCode,
	})
}
