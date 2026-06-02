package repository

import (
	"strings"
	"testing"
)

// Cross-tenant asset linkage guard (S2-G6 / S3-G1 / S3-G2 / AREA-UPLOADER-4).
//
// GalleryAssetRepo.Add and AlbumRepo.AddAsset must only link an asset into a
// gallery/album when the asset shares the gallery's workspace. The guard lives
// in SQL — an INSERT ... SELECT that joins galleries (and albums->galleries)
// to assets on workspace_id — so it can never be skipped by a caller. These
// tests pin that SQL contract so a regression back to an unconditional
// INSERT ... VALUES (which silently linked foreign assets) cannot land
// unnoticed, even without a live database in the unit harness.

// TestGalleryAssetAddSQL_EnforcesWorkspaceJoin asserts the gallery-asset link
// statement joins galleries to assets on workspace_id and constrains both the
// gallery id and the caller's workspace id, returning a row so the repo can
// reject a non-matching (cross-workspace / missing) asset.
func TestGalleryAssetAddSQL_EnforcesWorkspaceJoin(t *testing.T) {
	sql := sqlGalleryAssetAdd

	if c := strings.Count(strings.ToUpper(sql), "INSERT"); c != 1 {
		t.Fatalf("expected exactly one INSERT in gallery asset add SQL, got %d", c)
	}
	// Must be an INSERT ... SELECT (the workspace guard), NOT INSERT ... VALUES
	// (the old unconditional path that allowed cross-tenant linkage).
	if !strings.Contains(strings.ToUpper(sql), "SELECT") {
		t.Fatalf("gallery asset add must be INSERT ... SELECT with a workspace join; got:\n%s", sql)
	}
	if strings.Contains(strings.ToUpper(sql), "VALUES") {
		t.Fatalf("gallery asset add must NOT use unconditional VALUES (skips tenant guard); got:\n%s", sql)
	}
	for _, frag := range []string{
		"FROM galleries g",
		"JOIN assets a ON a.workspace_id = g.workspace_id",
		"a.deleted_at IS NULL",
		"g.workspace_id = $6",
		"RETURNING id",
	} {
		if !strings.Contains(sql, frag) {
			t.Fatalf("gallery asset add SQL missing %q; got:\n%s", frag, sql)
		}
	}
}

// TestAlbumAssetAddSQL_EnforcesWorkspaceJoin asserts the album-asset link
// statement flows ownership through the parent gallery (albums -> galleries)
// and joins to assets on workspace_id, constraining the caller's workspace id
// and returning a row so the repo can reject a non-matching asset.
func TestAlbumAssetAddSQL_EnforcesWorkspaceJoin(t *testing.T) {
	sql := sqlAlbumAssetAdd

	if c := strings.Count(strings.ToUpper(sql), "INSERT"); c != 1 {
		t.Fatalf("expected exactly one INSERT in album asset add SQL, got %d", c)
	}
	if !strings.Contains(strings.ToUpper(sql), "SELECT") {
		t.Fatalf("album asset add must be INSERT ... SELECT with a workspace join; got:\n%s", sql)
	}
	if strings.Contains(strings.ToUpper(sql), "VALUES") {
		t.Fatalf("album asset add must NOT use unconditional VALUES (skips tenant guard); got:\n%s", sql)
	}
	for _, frag := range []string{
		"FROM albums al",
		"JOIN galleries g ON g.id = al.gallery_id",
		"JOIN assets a ON a.workspace_id = g.workspace_id",
		"a.deleted_at IS NULL",
		"g.workspace_id = $4",
		"RETURNING album_id",
	} {
		if !strings.Contains(sql, frag) {
			t.Fatalf("album asset add SQL missing %q; got:\n%s", frag, sql)
		}
	}
}

// TestAssetLinkageRejectionErrorsAreDefined pins the sentinel errors handlers
// match on (via errors.Is) to map a cross-tenant rejection to 404/skip rather
// than a 500. Both repos export ErrAssetNotInWorkspace.
func TestAssetLinkageRejectionErrorsAreDefined(t *testing.T) {
	if ErrAssetNotInWorkspace == nil {
		t.Fatal("ErrAssetNotInWorkspace must be a non-nil sentinel error")
	}
	if msg := ErrAssetNotInWorkspace.Error(); msg == "" {
		t.Fatal("ErrAssetNotInWorkspace must carry a non-empty message")
	}
}
