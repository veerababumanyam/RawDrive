package handler

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// These tests verify the HTTP-layer guards on the new M7 admin endpoints
// (workspace suspend/unsuspend/delete, user delete, user activity).
// Service-layer logic that needs a database is exercised by the existing
// admin_*_service_test.go files, which use the same DB fixture pattern.

// TestAdminWorkspaces_Suspend_InvalidID verifies 400 on malformed UUID.
func TestAdminWorkspaces_Suspend_InvalidID(t *testing.T) {
	h := &AdminWorkspacesHandler{} // no service — invalid id short-circuits
	r := chi.NewRouter()
	r.Post("/api/v1/admin/workspaces/{id}/suspend", h.Suspend)

	req := httptest.NewRequest("POST", "/api/v1/admin/workspaces/not-a-uuid/suspend",
		bytes.NewBufferString(`{"reason":"abuse"}`))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid workspace id, got %d", w.Code)
	}
}

// TestAdminWorkspaces_Suspend_MissingReason verifies 400 when reason is
// absent. Reason is mandatory per M7 E20-S3 audit trail requirements.
func TestAdminWorkspaces_Suspend_MissingReason(t *testing.T) {
	h := &AdminWorkspacesHandler{}
	r := chi.NewRouter()
	r.Post("/api/v1/admin/workspaces/{id}/suspend", h.Suspend)

	req := httptest.NewRequest("POST", "/api/v1/admin/workspaces/"+uuid.New().String()+"/suspend",
		bytes.NewBufferString(`{}`))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing reason, got %d", w.Code)
	}
}

// TestAdminWorkspaces_Delete_InvalidID verifies 400 on malformed UUID.
func TestAdminWorkspaces_Delete_InvalidID(t *testing.T) {
	h := &AdminWorkspacesHandler{}
	r := chi.NewRouter()
	r.Delete("/api/v1/admin/workspaces/{id}", h.Delete)

	req := httptest.NewRequest("DELETE", "/api/v1/admin/workspaces/nope", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

// TestAdminWorkspaces_Unsuspend_InvalidID verifies 400 on malformed UUID.
func TestAdminWorkspaces_Unsuspend_InvalidID(t *testing.T) {
	h := &AdminWorkspacesHandler{}
	r := chi.NewRouter()
	r.Post("/api/v1/admin/workspaces/{id}/unsuspend", h.Unsuspend)

	req := httptest.NewRequest("POST", "/api/v1/admin/workspaces/nope/unsuspend", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

// TestAdminUsers_Delete_InvalidID verifies 400 on malformed UUID.
func TestAdminUsers_Delete_InvalidID(t *testing.T) {
	h := &AdminUsersHandler{}
	r := chi.NewRouter()
	r.Delete("/api/v1/admin/users/{id}", h.Delete)

	req := httptest.NewRequest("DELETE", "/api/v1/admin/users/not-a-uuid", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

// TestAdminUsers_Activity_InvalidID verifies 400 on malformed UUID.
func TestAdminUsers_Activity_InvalidID(t *testing.T) {
	h := &AdminUsersHandler{}
	r := chi.NewRouter()
	r.Get("/api/v1/admin/users/{id}/activity", h.Activity)

	req := httptest.NewRequest("GET", "/api/v1/admin/users/not-a-uuid/activity", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}
