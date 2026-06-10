package handler

import (
	"context"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/repository"
)

// gallery_authz.go — shared tenant-ownership guards for gallery-scoped routes.
//
// Integration audit (2026-05-31) found that ~12 gallery-adjacent handlers took
// an object id straight from the URL and never verified it belonged to the
// caller's workspace, yielding systemic cross-tenant IDOR. The owner-facing
// GalleryHandler/AlbumHandler already had a `requireGalleryInWorkspace` method;
// these package-level guards generalize that pattern so EVERY handler in the
// package can enforce the same check without each one re-implementing it (and
// without each one inventing a different DI shape).
//
// Both *service.GalleryService and *repository.GalleryRepo satisfy
// galleryWorkspaceResolver, so a handler can pass whichever it already holds.
// On any failure the guard writes the canonical response and returns ok=false;
// callers must simply `return` when ok is false. Mismatches return 404 (not
// 403) so a foreign object's existence is never disclosed.

// galleryWorkspaceResolver resolves a gallery by id. Satisfied by both
// *service.GalleryService.GetByID and *repository.GalleryRepo.GetByID.
type galleryWorkspaceResolver interface {
	GetByID(ctx context.Context, id uuid.UUID) (*repository.Gallery, error)
}

// guardGalleryWorkspace resolves galleryID via the resolver and enforces that
// the gallery belongs to the caller's JWT workspace. It writes the appropriate
// HTTP error and returns ok=false on any failure (missing workspace claim,
// lookup error, not-found, or cross-tenant mismatch). On success it returns the
// resolved gallery and the caller's workspace id.
func guardGalleryWorkspace(w http.ResponseWriter, r *http.Request, resolver galleryWorkspaceResolver, galleryID uuid.UUID) (*repository.Gallery, uuid.UUID, bool) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return nil, uuid.Nil, false
	}
	if resolver == nil {
		// A handler that opted into a gallery-scoped route without a resolver
		// wired is a deployment bug, not a client error — fail closed.
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return nil, uuid.Nil, false
	}
	gallery, err := resolver.GetByID(r.Context(), galleryID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return nil, uuid.Nil, false
	}
	if gallery == nil || gallery.WorkspaceID != workspaceID {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return nil, uuid.Nil, false
	}
	return gallery, workspaceID, true
}

func galleryReadableByWorkspace(ctx context.Context, pool *pgxpool.Pool, galleryID, workspaceID uuid.UUID) (bool, error) {
	if pool == nil {
		return false, nil
	}
	var readable bool
	err := pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			  FROM galleries g
			 WHERE g.id = $1
			   AND g.deleted_at IS NULL
			   AND (
			     g.workspace_id = $2
			     OR EXISTS (
			       SELECT 1
			         FROM gallery_workspace_shares s
			        WHERE s.gallery_id = g.id
			          AND s.shared_workspace_id = $2
			          AND s.revoked_at IS NULL
			     )
			   )
		)`,
		galleryID, workspaceID,
	).Scan(&readable)
	return readable, err
}

func guardGalleryReadableWorkspace(w http.ResponseWriter, r *http.Request, resolver galleryWorkspaceResolver, pool *pgxpool.Pool, galleryID uuid.UUID) (*repository.Gallery, uuid.UUID, bool) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return nil, uuid.Nil, false
	}
	if resolver == nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return nil, uuid.Nil, false
	}
	gallery, err := resolver.GetByID(r.Context(), galleryID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return nil, uuid.Nil, false
	}
	if gallery == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return nil, uuid.Nil, false
	}
	if gallery.WorkspaceID == workspaceID {
		return gallery, workspaceID, true
	}
	readable, err := galleryReadableByWorkspace(r.Context(), pool, galleryID, workspaceID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return nil, uuid.Nil, false
	}
	if !readable {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return nil, uuid.Nil, false
	}
	return gallery, workspaceID, true
}

// assetWorkspaceResolver resolves an asset scoped to a workspace. Satisfied by
// *repository.AssetRepo.GetByIDAndWorkspace.
type assetWorkspaceResolver interface {
	GetByIDAndWorkspace(ctx context.Context, id, workspaceID uuid.UUID) (*repository.Asset, error)
}

// guardAssetWorkspace resolves assetID scoped to the caller's JWT workspace.
// It writes the appropriate HTTP error and returns ok=false on any failure
// (missing workspace claim, lookup error, or asset not owned by the workspace),
// returning 404 on mismatch so cross-tenant asset existence is not disclosed.
func guardAssetWorkspace(w http.ResponseWriter, r *http.Request, resolver assetWorkspaceResolver, assetID uuid.UUID) (*repository.Asset, uuid.UUID, bool) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return nil, uuid.Nil, false
	}
	if resolver == nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return nil, uuid.Nil, false
	}
	asset, err := resolver.GetByIDAndWorkspace(r.Context(), assetID, workspaceID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return nil, uuid.Nil, false
	}
	if asset == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return nil, uuid.Nil, false
	}
	return asset, workspaceID, true
}
