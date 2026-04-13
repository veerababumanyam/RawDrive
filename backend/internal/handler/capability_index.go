package handler

import (
	"encoding/json"
	"net/http"
)

// capabilityIndex returns an http.HandlerFunc that responds with a small
// JSON descriptor for a route group's bare mount path. Added to fix the
// PROD-UAT-2026-04-13 P3 cosmetic finding where bare GETs on group mount
// paths returned 404 because no index was registered. Sub-routes were
// (and remain) the canonical surface; this index just makes smoke-test
// scripts and discovery tools quieter.
func capabilityIndex(name string, capabilities []string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"resource":     name,
			"capabilities": capabilities,
		})
	}
}
