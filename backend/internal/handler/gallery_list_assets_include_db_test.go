package handler

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/database"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
	"github.com/rawdrive/backend/tests/testsupport"
)

// TestGalleryListAssets_IncludeAssets_RealDB_Returns200WithEnrichedAssets is the
// DB-backed regression for the dashboard gallery-detail load
// (GET /api/v1/galleries/{id}/assets?include_assets=true).
//
// WHY THIS EXISTS (UAT 2026-06-04, dashboard BUG 1):
//
//	A "Failed to list gallery assets: 500" was reported opening any gallery.
//	Root-cause analysis proved the failure was NOT in main's source — every
//	layer (ListByGallery, poolAssetBatchSource.GetByIDs, enrich, respondJSON)
//	returns 200 against real data; the running dev binary was simply stale.
//	But the investigation surfaced a real COVERAGE GAP: the only test of the
//	?include_assets=true enrichment (TestGalleryListAssets_EnrichUsesSingleBulkQuery)
//	drives an in-memory fake (countingAssetBatchSource). NOTHING exercised the
//	production poolAssetBatchSource bulk SELECT + pgx scan against a real,
//	migrated schema — so a genuine column/scan drift (e.g. ThumbnailURLs is a
//	strict map[string]string, assets.width/height are nullable) could 500 the
//	whole dashboard with no failing test.
//
//	This test closes that gap: it seeds a workspace + gallery + two assets with
//	the same shape real uploads produce (NULL width/height, a jsonb
//	thumbnail_urls object of strings) and asserts the REAL handler returns 200
//	with each junction row enriched by its asset, in gallery sort order.
//
// It is a characterization/regression guard (main is already correct), and it
// SKIPS — never fails — when no database is reachable (no Docker + no
// DATABASE_URL), matching the repository package's graceful-skip convention so
// hermetic CI stays green.
func TestGalleryListAssets_IncludeAssets_RealDB_Returns200WithEnrichedAssets(t *testing.T) {
	ctx := context.Background()
	pool := includeAssetsTestPool(t)

	// ---- seed: state -> owner -> workspace ----
	var stateID int
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM states LIMIT 1`).Scan(&stateID))
	var ownerID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO users (display_name, state_id, created_at, updated_at)
		 VALUES ('IncludeAssets Owner', $1, NOW(), NOW()) RETURNING id`, stateID).Scan(&ownerID))
	var workspaceID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO workspaces (name, state_id, owner_id, created_at)
		 VALUES ('IncludeAssets Workspace', $1, $2, NOW()) RETURNING id`, stateID, ownerID).Scan(&workspaceID))

	t.Cleanup(func() {
		c := context.Background()
		_, _ = pool.Exec(c, `DELETE FROM gallery_assets WHERE workspace_id = $1`, workspaceID)
		_, _ = pool.Exec(c, `DELETE FROM galleries WHERE workspace_id = $1`, workspaceID)
		_, _ = pool.Exec(c, `DELETE FROM assets WHERE workspace_id = $1`, workspaceID)
		_, _ = pool.Exec(c, `DELETE FROM workspaces WHERE id = $1`, workspaceID)
		_, _ = pool.Exec(c, `DELETE FROM users WHERE id = $1`, ownerID)
	})

	// ---- seed: two assets shaped like real uploads ----
	// NULL width/height (scanned into *int) and a jsonb thumbnail_urls object of
	// strings (scanned into the strict map[string]string) are the exact column
	// shapes that a naive bulk scan would mishandle — pin them down here.
	thumbs := `{"thumb_sm_webp":"ws/x/sm.webp","thumb_md_webp":"ws/x/md.webp","thumb_lg_webp":"ws/x/lg.webp","display_webp":"ws/x/display.webp"}`
	asset1 := seedIncludeAsset(t, ctx, pool, workspaceID, "DSC_0001.JPG", thumbs)
	asset2 := seedIncludeAsset(t, ctx, pool, workspaceID, "Wedding (42).jpg", thumbs)

	// ---- seed: gallery + ordered junctions via real repo code ----
	galleryRepo := repository.NewGalleryRepo(pool)
	gaRepo := repository.NewGalleryAssetRepo(pool)
	g := &repository.Gallery{
		WorkspaceID: workspaceID,
		Title:       "Include Assets Regression",
		GalleryType: "proofing",
		Status:      "draft",
		CreatedBy:   &ownerID,
	}
	require.NoError(t, galleryRepo.Create(ctx, g))
	require.NoError(t, gaRepo.Add(ctx, g.ID, asset1, workspaceID, 0))
	require.NoError(t, gaRepo.Add(ctx, g.ID, asset2, workspaceID, 1))

	// ---- production wiring: handler with the real pool-backed batch source ----
	h := NewGalleryHandler(service.NewGalleryService(galleryRepo, gaRepo, nil)).WithPool(pool)

	req := httptest.NewRequest("GET", "/api/v1/galleries/"+g.ID.String()+"/assets?include_assets=true", nil)
	routeCtx := chi.NewRouteContext()
	routeCtx.URLParams.Add("id", g.ID.String())
	rctx := context.WithValue(req.Context(), chi.RouteCtxKey, routeCtx)
	rctx = middleware.WithWorkspaceID(rctx, workspaceID.String())
	req = req.WithContext(rctx)

	rec := httptest.NewRecorder()
	h.ListAssets(rec, req)

	// The bug symptom was HTTP 500. Assert the real path returns 200.
	require.Equal(t, 200, rec.Code, "include_assets=true must return 200, not 500; body=%s", rec.Body.String())

	var out []galleryAssetWithAsset
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
	require.Len(t, out, 2, "both junction rows returned")

	// Ordered by sort_order, each junction enriched with its (scanned) asset.
	require.Equal(t, asset1, out[0].AssetID)
	require.NotNil(t, out[0].Asset, "asset must be embedded, not nil")
	require.Equal(t, "DSC_0001.JPG", out[0].Asset.Filename)
	require.Equal(t, "ws/x/md.webp", out[0].Asset.ThumbnailURLs["thumb_md_webp"])
	require.Nil(t, out[0].Asset.Width, "nullable width scans as nil without erroring")

	require.Equal(t, asset2, out[1].AssetID)
	require.NotNil(t, out[1].Asset)
	require.Equal(t, "Wedding (42).jpg", out[1].Asset.Filename)
}

// seedIncludeAsset inserts a 'ready' asset with NULL width/height and the given
// jsonb thumbnail_urls, returning its id.
func seedIncludeAsset(t *testing.T, ctx context.Context, pool *pgxpool.Pool, workspaceID uuid.UUID, filename, thumbnailURLsJSON string) uuid.UUID {
	t.Helper()
	id := uuid.New()
	_, err := pool.Exec(ctx,
		`INSERT INTO assets (id, workspace_id, filename, content_type, size_bytes, storage_key,
		   status, thumbnail_urls, created_at, updated_at)
		 VALUES ($1, $2, $3, 'image/jpeg', 2048, $4, 'ready', $5::jsonb, NOW(), NOW())`,
		id, workspaceID, filename,
		"ws/"+workspaceID.String()+"/"+uuid.NewString(),
		thumbnailURLsJSON)
	require.NoError(t, err)
	return id
}

// includeAssetsTestPool resolves a DB pool for this test, preferring DATABASE_URL
// and falling back to the shared testsupport pgvector container. When neither is
// available it SKIPS (never fails) so hermetic CI without a live DB still passes.
func includeAssetsTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		resolved, err := testsupport.EnsureDSN()
		if err != nil {
			t.Skipf("gallery include_assets DB test: no database available: %v", err)
		}
		dsn = resolved
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Skipf("gallery include_assets DB test: invalid DSN: %v", err)
	}
	// Mirror the PRODUCTION pool exactly (cmd/api/main.go): pgbouncer-safe exec
	// mode + the google/uuid type registration. Exec mode is what made the
	// `ANY($1::uuid[])` bulk-asset bind 500 in prod ("cannot find encode plan,
	// OID 0") while the old cache_statement test pool masked it. With exec mode
	// AND RegisterUUIDTypes this test now reproduces prod and guards the fix.
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeExec
	cfg.AfterConnect = database.RegisterUUIDTypes
	cfg.ConnConfig.ConnectTimeout = 3 * time.Second
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Skipf("gallery include_assets DB test: opening pool: %v", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		t.Skipf("gallery include_assets DB test: postgres ping failed: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}
