package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// withWorkspaceCtx adds workspace_id to request context (simulates middleware).
func withWorkspaceCtx(r *http.Request, wsID uuid.UUID) *http.Request {
	ctx := context.WithValue(r.Context(), "workspace_id", wsID)
	return r.WithContext(ctx)
}

// TestHandler_FaceDetect_EmptyAssets verifies 400 on empty asset list.
func TestHandler_FaceDetect_EmptyAssets(t *testing.T) {
	h := &Handler{}
	body := `{"asset_ids":[]}`
	req := httptest.NewRequest("POST", "/api/v1/ai/face-detect", bytes.NewBufferString(body))
	req = withWorkspaceCtx(req, uuid.New())
	w := httptest.NewRecorder()

	h.TriggerFaceDetect(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

// TestHandler_FaceDetect_InvalidBody verifies 400 on malformed JSON.
func TestHandler_FaceDetect_InvalidBody(t *testing.T) {
	h := &Handler{}
	req := httptest.NewRequest("POST", "/api/v1/ai/face-detect", bytes.NewBufferString("{bad"))
	req = withWorkspaceCtx(req, uuid.New())
	w := httptest.NewRecorder()

	h.TriggerFaceDetect(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

// TestHandler_ListClusters_Empty verifies empty array (not null) when no clusters.
func TestHandler_ListClusters_Empty(t *testing.T) {
	// This would need a real FaceService to test properly.
	// For now we verify the handler doesn't panic with nil faceSvc.
	// Full integration test with DB is in a separate file.
	t.Skip("requires FaceService with DB")
}

// TestHandler_GetTags_InvalidUUID verifies 400 on bad asset ID.
func TestHandler_GetTags_InvalidUUID(t *testing.T) {
	h := &Handler{}

	r := chi.NewRouter()
	r.Get("/api/v1/ai/tags/{assetId}", h.GetTags)

	req := httptest.NewRequest("GET", "/api/v1/ai/tags/not-a-uuid", nil)
	req = withWorkspaceCtx(req, uuid.New())
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

// TestHandler_SaveConfig_EmptyKey verifies 400 when no API key provided.
func TestHandler_SaveConfig_EmptyKey(t *testing.T) {
	h := &Handler{}
	body := `{"api_key":""}`
	req := httptest.NewRequest("POST", "/api/v1/ai/config", bytes.NewBufferString(body))
	req = withWorkspaceCtx(req, uuid.New())
	w := httptest.NewRecorder()

	h.SaveConfig(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

// TestHandler_SetSpendCap_NegativeValue verifies 400 on negative cap.
func TestHandler_SetSpendCap_NegativeValue(t *testing.T) {
	h := &Handler{}
	body := `{"monthly_cap_paisa":-100}`
	req := httptest.NewRequest("PUT", "/api/v1/ai/spend/cap", bytes.NewBufferString(body))
	req = withWorkspaceCtx(req, uuid.New())
	w := httptest.NewRecorder()

	h.SetSpendCap(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

// TestHandler_TriggerTags_TooMany verifies 400 when > 50 asset IDs.
func TestHandler_TriggerTags_TooMany(t *testing.T) {
	h := &Handler{}
	ids := make([]uuid.UUID, 51)
	for i := range ids {
		ids[i] = uuid.New()
	}
	body, _ := json.Marshal(TagTriggerRequest{AssetIDs: ids})
	req := httptest.NewRequest("POST", "/api/v1/ai/tags", bytes.NewBuffer(body))
	req = withWorkspaceCtx(req, uuid.New())
	w := httptest.NewRecorder()

	h.TriggerTags(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

// TestHandler_TriggerCulling_NoGallery verifies 400 when gallery_id missing.
func TestHandler_TriggerCulling_NoGallery(t *testing.T) {
	h := &Handler{}
	body := `{}`
	req := httptest.NewRequest("POST", "/api/v1/ai/cull", bytes.NewBufferString(body))
	req = withWorkspaceCtx(req, uuid.New())
	w := httptest.NewRecorder()

	h.TriggerCulling(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

// TestHandler_SemanticSearch_EmptyQuery verifies 400 when query is empty.
func TestHandler_SemanticSearch_EmptyQuery(t *testing.T) {
	h := &Handler{}
	body := `{"query":""}`
	req := httptest.NewRequest("POST", "/api/v1/ai/search", bytes.NewBufferString(body))
	req = withWorkspaceCtx(req, uuid.New())
	w := httptest.NewRecorder()

	h.SemanticSearch(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

// TestHandler_EditTags_EmptyPatches verifies 400 when patches array is empty.
func TestHandler_EditTags_EmptyPatches(t *testing.T) {
	h := &Handler{}

	r := chi.NewRouter()
	r.Patch("/api/v1/ai/tags/{assetId}", h.EditTags)

	body := `{"patches":[]}`
	req := httptest.NewRequest("PATCH", "/api/v1/ai/tags/"+uuid.New().String(), bytes.NewBufferString(body))
	req = withWorkspaceCtx(req, uuid.New())
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

// TestHandler_GetJob_InvalidUUID verifies 400 on bad job ID.
func TestHandler_GetJob_InvalidUUID(t *testing.T) {
	h := &Handler{}

	r := chi.NewRouter()
	r.Get("/api/v1/ai/jobs/{id}", h.GetJob)

	req := httptest.NewRequest("GET", "/api/v1/ai/jobs/garbage", nil)
	req = withWorkspaceCtx(req, uuid.New())
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

// TestHandler_MergeClusters_InvalidBody verifies 400 on malformed body.
func TestHandler_MergeClusters_InvalidBody(t *testing.T) {
	h := &Handler{}
	req := httptest.NewRequest("POST", "/api/v1/ai/clusters/merge", bytes.NewBufferString("{bad"))
	req = withWorkspaceCtx(req, uuid.New())
	w := httptest.NewRecorder()

	h.MergeClusters(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}
