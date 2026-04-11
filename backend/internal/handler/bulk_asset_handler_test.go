package handler

// ISSUE-007 (brownfield P2, tenant isolation): BulkMoveToGallery was
// previously called without workspace scoping, allowing a caller in
// workspace A to delete/insert gallery_assets rows referencing assets
// that belonged to workspace B. The fix threads workspace_id from the
// handler through the repository signature and filters the SQL by
// workspace_id.
//
// These tests pin the handler-layer contract so the wiring cannot
// regress. They use a fake bulkAssetRepo to avoid a database
// dependency — the SQL-layer filter is verified separately by code
// review and the integration suite.

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeBulkAssetRepo captures the arguments of the last call to each
// BulkXxx method so tests can assert on them. It implements the
// handler-package bulkAssetRepo interface.
type fakeBulkAssetRepo struct {
	moveCall struct {
		called      bool
		ids         []uuid.UUID
		fromGallery uuid.UUID
		toGallery   uuid.UUID
		workspaceID uuid.UUID
	}
	moveAffected int64
	moveErr      error

	statusCall struct {
		called      bool
		ids         []uuid.UUID
		newStatus   string
		workspaceID uuid.UUID
	}
	statusAffected int64
	statusErr      error
}

func (f *fakeBulkAssetRepo) BulkUpdateStatus(ctx context.Context, ids []uuid.UUID, status string, workspaceID uuid.UUID) (int64, error) {
	f.statusCall.called = true
	f.statusCall.ids = ids
	f.statusCall.newStatus = status
	f.statusCall.workspaceID = workspaceID
	return f.statusAffected, f.statusErr
}

func (f *fakeBulkAssetRepo) BulkMoveToGallery(ctx context.Context, ids []uuid.UUID, fromGalleryID, toGalleryID, workspaceID uuid.UUID) (int64, error) {
	f.moveCall.called = true
	f.moveCall.ids = ids
	f.moveCall.fromGallery = fromGalleryID
	f.moveCall.toGallery = toGalleryID
	f.moveCall.workspaceID = workspaceID
	return f.moveAffected, f.moveErr
}

func (f *fakeBulkAssetRepo) BulkSetRating(ctx context.Context, ids []uuid.UUID, rating int, workspaceID uuid.UUID) (int64, error) {
	return 0, nil
}
func (f *fakeBulkAssetRepo) BulkSetColorLabel(ctx context.Context, ids []uuid.UUID, label string, workspaceID uuid.UUID) (int64, error) {
	return 0, nil
}
func (f *fakeBulkAssetRepo) BulkAddTags(ctx context.Context, ids []uuid.UUID, tags []string, workspaceID uuid.UUID) (int64, error) {
	return 0, nil
}
func (f *fakeBulkAssetRepo) BulkRemoveTags(ctx context.Context, ids []uuid.UUID, tags []string, workspaceID uuid.UUID) (int64, error) {
	return 0, nil
}

// newBulkRequest constructs a POST /api/v1/assets/bulk request with
// the workspace_id injected into the context the way the tenant
// middleware would.
func newBulkRequest(t *testing.T, workspaceID uuid.UUID, query string, body map[string]interface{}) *http.Request {
	t.Helper()
	raw, err := json.Marshal(body)
	require.NoError(t, err)
	url := "/api/v1/assets/bulk"
	if query != "" {
		url += "?" + query
	}
	req := httptest.NewRequest(http.MethodPost, url, bytes.NewReader(raw))
	ctx := middleware.WithWorkspaceID(req.Context(), workspaceID.String())
	return req.WithContext(ctx)
}

// TestBulkAction_MovePassesWorkspaceIDToRepo is the ISSUE-007
// regression gate. Before the fix, bulk_asset_handler.go line 87 had
// `_ = workspaceID` and called BulkMoveToGallery with no workspace
// scoping, meaning a caller in workspace A could move assets that
// belonged to workspace B into their own gallery. This test pins the
// post-fix contract: the workspace_id read from the tenant context
// MUST be passed through to the repository layer.
func TestBulkAction_MovePassesWorkspaceIDToRepo(t *testing.T) {
	wsID := uuid.New()
	fromGallery := uuid.New()
	toGallery := uuid.New()
	asset1 := uuid.New()
	asset2 := uuid.New()

	fake := &fakeBulkAssetRepo{moveAffected: 2}
	h := NewBulkAssetHandler(fake)

	req := newBulkRequest(t, wsID,
		"from_gallery_id="+fromGallery.String(),
		map[string]interface{}{
			"action":    "move",
			"asset_ids": []string{asset1.String(), asset2.String()},
			"target_id": toGallery.String(),
		})
	rr := httptest.NewRecorder()

	h.BulkAction(rr, req)

	require.Equal(t, http.StatusOK, rr.Code, "handler should return 200 on successful bulk move, got body: %s", rr.Body.String())
	require.True(t, fake.moveCall.called, "BulkMoveToGallery must be called")
	assert.Equal(t, wsID, fake.moveCall.workspaceID, "workspace_id from tenant context MUST be threaded to BulkMoveToGallery — ISSUE-007 regression gate")
	assert.Equal(t, fromGallery, fake.moveCall.fromGallery)
	assert.Equal(t, toGallery, fake.moveCall.toGallery)
	assert.ElementsMatch(t, []uuid.UUID{asset1, asset2}, fake.moveCall.ids)
}

// TestBulkAction_MoveReportsRepoAffectedCount pins the second half of
// the fix: the handler previously hardcoded affected = len(ids) on
// success, which was wrong for any case where the repo filters rows.
// After the fix the handler must report the real RowsAffected from
// the repo so cross-workspace move attempts surface as affected=0.
func TestBulkAction_MoveReportsRepoAffectedCount(t *testing.T) {
	wsID := uuid.New()
	fromGallery := uuid.New()
	toGallery := uuid.New()
	asset1 := uuid.New()
	asset2 := uuid.New()
	asset3 := uuid.New()

	// Simulate the repo silently dropping 2 of 3 assets because they
	// belong to a different workspace — the realistic attack scenario
	// ISSUE-007 describes.
	fake := &fakeBulkAssetRepo{moveAffected: 1}
	h := NewBulkAssetHandler(fake)

	req := newBulkRequest(t, wsID,
		"from_gallery_id="+fromGallery.String(),
		map[string]interface{}{
			"action":    "move",
			"asset_ids": []string{asset1.String(), asset2.String(), asset3.String()},
			"target_id": toGallery.String(),
		})
	rr := httptest.NewRecorder()

	h.BulkAction(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)

	var resp struct {
		Data struct {
			Action   string `json:"action"`
			Affected int64  `json:"affected"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	assert.Equal(t, "move", resp.Data.Action)
	assert.Equal(t, int64(1), resp.Data.Affected, "handler must report the repo's real RowsAffected, not len(ids) — cross-workspace filtered rows must surface as dropped")
}

// TestBulkAction_StatusPassesWorkspaceIDToRepo is a smoke test for
// the existing workspace scoping on BulkUpdateStatus. Not part of
// ISSUE-007 but lives in the same fake-backed harness so a regression
// in that path is caught by the same test suite.
func TestBulkAction_StatusPassesWorkspaceIDToRepo(t *testing.T) {
	wsID := uuid.New()
	asset1 := uuid.New()

	fake := &fakeBulkAssetRepo{statusAffected: 1}
	h := NewBulkAssetHandler(fake)

	req := newBulkRequest(t, wsID, "",
		map[string]interface{}{
			"action":     "update_status",
			"asset_ids":  []string{asset1.String()},
			"new_status": "archived",
		})
	rr := httptest.NewRecorder()

	h.BulkAction(rr, req)

	require.Equal(t, http.StatusOK, rr.Code, "body=%s", rr.Body.String())
	assert.Equal(t, wsID, fake.statusCall.workspaceID)
	assert.Equal(t, "archived", fake.statusCall.newStatus)
}
