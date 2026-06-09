package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

func TestGalleryAccountShare_TargetOwnerWorkspaceWithoutMemberRow(t *testing.T) {
	ctx := context.Background()
	pool := includeAssetsTestPool(t)

	var stateID int
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM states LIMIT 1`).Scan(&stateID))

	var ownerID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO users (email, display_name, state_id, created_at, updated_at)
		 VALUES ($1, 'Share Owner', $2, NOW(), NOW()) RETURNING id`,
		"share-owner-"+uuid.NewString()+"@rawdrive.test", stateID,
	).Scan(&ownerID))

	var ownerWorkspaceID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO workspaces (name, state_id, owner_id, created_at)
		 VALUES ('Share Owner Workspace', $1, $2, NOW()) RETURNING id`,
		stateID, ownerID,
	).Scan(&ownerWorkspaceID))

	targetEmail := "share-target-" + uuid.NewString() + "@rawdrive.test"
	var targetUserID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO users (email, display_name, state_id, created_at, updated_at)
		 VALUES ($1, 'Share Target', $2, NOW(), NOW()) RETURNING id`,
		targetEmail, stateID,
	).Scan(&targetUserID))

	var targetWorkspaceID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO workspaces (name, state_id, owner_id, created_at)
		 VALUES ('Share Target Workspace', $1, $2, NOW()) RETURNING id`,
		stateID, targetUserID,
	).Scan(&targetWorkspaceID))

	t.Cleanup(func() {
		c := context.Background()
		_, _ = pool.Exec(c, `DELETE FROM gallery_workspace_shares WHERE owner_workspace_id = $1 OR shared_workspace_id = $2`, ownerWorkspaceID, targetWorkspaceID)
		_, _ = pool.Exec(c, `DELETE FROM galleries WHERE workspace_id = $1`, ownerWorkspaceID)
		_, _ = pool.Exec(c, `DELETE FROM workspaces WHERE id IN ($1, $2)`, ownerWorkspaceID, targetWorkspaceID)
		_, _ = pool.Exec(c, `DELETE FROM users WHERE id IN ($1, $2)`, ownerID, targetUserID)
	})

	galleryRepo := repository.NewGalleryRepo(pool)
	galleryAssetRepo := repository.NewGalleryAssetRepo(pool)
	gallery := &repository.Gallery{
		WorkspaceID: ownerWorkspaceID,
		Title:       "Account Share Regression",
		GalleryType: "proofing",
		Status:      "draft",
		CreatedBy:   &ownerID,
	}
	require.NoError(t, galleryRepo.Create(ctx, gallery))

	handler := NewGalleryHandler(service.NewGalleryService(galleryRepo, galleryAssetRepo, nil)).WithPool(pool)
	body, err := json.Marshal(map[string]any{
		"email":                 targetEmail,
		"storage_billed_to":     "shared",
		"migrate_storage_usage": false,
	})
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/galleries/"+gallery.ID.String()+"/account-shares", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	routeCtx := chi.NewRouteContext()
	routeCtx.URLParams.Add("id", gallery.ID.String())
	rctx := context.WithValue(req.Context(), chi.RouteCtxKey, routeCtx)
	rctx = middleware.WithWorkspaceID(rctx, ownerWorkspaceID.String())
	rctx = middleware.WithJWTClaims(rctx, map[string]interface{}{
		"sub":          ownerID.String(),
		"workspace_id": ownerWorkspaceID.String(),
	})
	req = req.WithContext(rctx)

	rec := httptest.NewRecorder()
	handler.CreateAccountShare(rec, req)

	require.Equal(t, http.StatusOK, rec.Code, "owner workspace should be shareable without requiring a workspace_members row; body=%s", rec.Body.String())
	var out galleryAccountShareResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
	require.Equal(t, gallery.ID, out.GalleryID)
	require.Equal(t, ownerWorkspaceID, out.OwnerWorkspaceID)
	require.Equal(t, targetWorkspaceID, out.SharedWorkspaceID)
	require.Equal(t, "shared", out.StorageBilledTo)
	require.Equal(t, targetEmail, out.SharedUserEmail)
}

func TestGalleryAccountShare_UnregisteredEmailCreatesPendingInvite(t *testing.T) {
	ctx := context.Background()
	pool := includeAssetsTestPool(t)

	var stateID int
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM states LIMIT 1`).Scan(&stateID))

	var ownerID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO users (email, display_name, state_id, created_at, updated_at)
		 VALUES ($1, 'Pending Share Owner', $2, NOW(), NOW()) RETURNING id`,
		"pending-share-owner-"+uuid.NewString()+"@rawdrive.test", stateID,
	).Scan(&ownerID))

	var ownerWorkspaceID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO workspaces (name, state_id, owner_id, created_at)
		 VALUES ('Pending Share Owner Workspace', $1, $2, NOW()) RETURNING id`,
		stateID, ownerID,
	).Scan(&ownerWorkspaceID))

	t.Cleanup(func() {
		c := context.Background()
		_, _ = pool.Exec(c, `DELETE FROM share_links WHERE permissions->>'account_share_invite' = 'true' AND gallery_id IN (SELECT id FROM galleries WHERE workspace_id = $1)`, ownerWorkspaceID)
		_, _ = pool.Exec(c, `DELETE FROM galleries WHERE workspace_id = $1`, ownerWorkspaceID)
		_, _ = pool.Exec(c, `DELETE FROM workspaces WHERE id = $1`, ownerWorkspaceID)
		_, _ = pool.Exec(c, `DELETE FROM users WHERE id = $1`, ownerID)
	})

	galleryRepo := repository.NewGalleryRepo(pool)
	galleryAssetRepo := repository.NewGalleryAssetRepo(pool)
	gallery := &repository.Gallery{
		WorkspaceID: ownerWorkspaceID,
		Title:       "Pending Invite Regression",
		GalleryType: "proofing",
		Status:      "draft",
		CreatedBy:   &ownerID,
	}
	require.NoError(t, galleryRepo.Create(ctx, gallery))

	handler := NewGalleryHandler(service.NewGalleryService(galleryRepo, galleryAssetRepo, nil)).WithPool(pool)
	targetEmail := "unregistered-share-" + uuid.NewString() + "@rawdrive.test"
	body, err := json.Marshal(map[string]any{
		"email":                 targetEmail,
		"storage_billed_to":     "shared",
		"migrate_storage_usage": true,
	})
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/galleries/"+gallery.ID.String()+"/account-shares", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	routeCtx := chi.NewRouteContext()
	routeCtx.URLParams.Add("id", gallery.ID.String())
	rctx := context.WithValue(req.Context(), chi.RouteCtxKey, routeCtx)
	rctx = middleware.WithWorkspaceID(rctx, ownerWorkspaceID.String())
	rctx = middleware.WithJWTClaims(rctx, map[string]interface{}{
		"sub":          ownerID.String(),
		"workspace_id": ownerWorkspaceID.String(),
	})
	req = req.WithContext(rctx)

	rec := httptest.NewRecorder()
	handler.CreateAccountShare(rec, req)

	require.Equal(t, http.StatusAccepted, rec.Code, "unregistered emails should create pending invites; body=%s", rec.Body.String())
	var out galleryAccountShareResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
	require.Equal(t, "pending_invite", out.Status)
	require.Equal(t, targetEmail, out.PendingEmail)
	require.Equal(t, targetEmail, out.SharedUserEmail)
	require.Equal(t, "shared", out.StorageBilledTo)
	require.NotEmpty(t, out.ShareLinkToken)

	var activeShareCount int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM gallery_workspace_shares WHERE gallery_id = $1`,
		gallery.ID,
	).Scan(&activeShareCount))
	require.Zero(t, activeShareCount)

	var pendingInviteCount int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT COUNT(*)
		   FROM share_links
		  WHERE gallery_id = $1
		    AND revoked_at IS NULL
		    AND permissions->>'account_share_invite' = 'true'
		    AND lower(permissions->>'pending_email') = lower($2)`,
		gallery.ID,
		targetEmail,
	).Scan(&pendingInviteCount))
	require.Equal(t, 1, pendingInviteCount)
}
