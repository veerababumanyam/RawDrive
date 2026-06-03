package repository

import (
	"strings"
	"testing"

	"github.com/google/uuid"
)

// TestF073_BuildReorderArrays_ParallelAndLengthInvariant verifies that the
// reorder payload collapses into two parallel arrays whose length always equals
// the number of items — independent of item count. This is the unit the
// set-based, single-round-trip UPDATE relies on. The old implementation looped
// and issued one UPDATE per item; there were no arrays to build, so this test
// fails to compile/pass against that version and passes against the fix.
func TestF073_BuildReorderArrays_ParallelAndLengthInvariant(t *testing.T) {
	cases := []int{0, 1, 2, 500}
	for _, n := range cases {
		items := make([]ReorderItem, n)
		for i := 0; i < n; i++ {
			items[i] = ReorderItem{AssetID: uuid.New(), SortOrder: i}
		}

		assetIDs, sortOrders := buildReorderArrays(items)

		if len(assetIDs) != n {
			t.Fatalf("n=%d: expected %d asset ids, got %d", n, n, len(assetIDs))
		}
		if len(sortOrders) != n {
			t.Fatalf("n=%d: expected %d sort orders, got %d", n, n, len(sortOrders))
		}

		for i := range items {
			if assetIDs[i] != items[i].AssetID {
				t.Fatalf("n=%d: asset id at %d not preserved", n, i)
			}
			if int(sortOrders[i]) != items[i].SortOrder {
				t.Fatalf("n=%d: sort order at %d = %d, want %d", n, i, sortOrders[i], items[i].SortOrder)
			}
		}
	}
}

// TestS3G4_LinkServerSQL_AssignsMaxPlusOneAndIsIdempotent pins the SQL contract
// for the server-side finalize-time gallery link (S3-G4 / AREA-UPLOADER-3 +
// S3-G5). The statement must:
//   - assign sort_order = COALESCE(MAX(sort_order),0)+1 within the gallery so
//     newly finalized assets append deterministically (S3-G5), not collide on 0;
//   - use ON CONFLICT DO NOTHING (not DO UPDATE) so a pre-existing link from the
//     legacy client call is a harmless no-op rather than a clobber;
//   - retain the workspace-join tenant guard so a cross-workspace asset is
//     pruned to zero rows and never linked.
func TestS3G4_LinkServerSQL_AssignsMaxPlusOneAndIsIdempotent(t *testing.T) {
	sql := sqlGalleryAssetLinkServer

	if !strings.Contains(sql, "MAX(ga.sort_order)") || !strings.Contains(sql, ") + 1") {
		t.Fatalf("server link SQL must assign sort_order = MAX+1 within the gallery; got:\n%s", sql)
	}
	if !strings.Contains(strings.ToUpper(sql), "ON CONFLICT (GALLERY_ID, ASSET_ID) DO NOTHING") {
		t.Fatalf("server link SQL must be idempotent via ON CONFLICT DO NOTHING (not DO UPDATE); got:\n%s", sql)
	}
	if strings.Contains(strings.ToUpper(sql), "DO UPDATE") {
		t.Fatalf("server link SQL must NOT clobber an existing link with DO UPDATE; got:\n%s", sql)
	}
	// Tenant guard: the asset must join to the gallery on a shared workspace_id
	// AND the gallery's workspace must equal the caller's workspace param.
	for _, frag := range []string{
		"JOIN assets a ON a.workspace_id = g.workspace_id",
		"a.deleted_at IS NULL",
		"g.workspace_id = $5",
	} {
		if !strings.Contains(sql, frag) {
			t.Fatalf("server link SQL missing tenant-guard fragment %q; got:\n%s", frag, sql)
		}
	}
}

// TestF073_ReorderSQL_IsSingleSetBasedStatement pins the SQL contract: a single
// UPDATE driven by unnest of two arrays, so any reorder is one round-trip. A
// regression back to a per-item loop (which had no shared SQL constant and used
// `WHERE ... AND asset_id=$3` keyed on a single id) would not satisfy these
// assertions.
func TestF073_ReorderSQL_IsSingleSetBasedStatement(t *testing.T) {
	if c := strings.Count(strings.ToUpper(reorderSQL), "UPDATE"); c != 1 {
		t.Fatalf("expected exactly one UPDATE in reorder SQL, got %d", c)
	}
	if !strings.Contains(reorderSQL, "unnest($1::uuid[], $2::int[])") {
		t.Fatalf("reorder SQL must use unnest of parallel uuid/int arrays; got:\n%s", reorderSQL)
	}
	for _, frag := range []string{"v(asset_id, sort_order)", "v.sort_order", "v.asset_id", "$3"} {
		if !strings.Contains(reorderSQL, frag) {
			t.Fatalf("reorder SQL missing %q; got:\n%s", frag, reorderSQL)
		}
	}
}

func TestGalleryAssetListSQL_HidesSoftDeletedAssets(t *testing.T) {
	sql := sqlGalleryAssetListByGallery

	for _, frag := range []string{
		"FROM gallery_assets ga",
		"JOIN assets a ON a.id = ga.asset_id",
		"ga.gallery_id = $1",
		"a.deleted_at IS NULL",
		"ORDER BY ga.sort_order ASC",
	} {
		if !strings.Contains(sql, frag) {
			t.Fatalf("gallery asset list SQL missing %q; got:\n%s", frag, sql)
		}
	}
	if strings.Contains(sql, "FROM gallery_assets WHERE") {
		t.Fatalf("gallery asset list must not return stale junction rows without joining assets; got:\n%s", sql)
	}
}

func TestGalleryAssetDeletableIDsSQL_PreservesSharedLiveAssets(t *testing.T) {
	sql := sqlGalleryAssetDeletableIDsForGallery

	for _, frag := range []string{
		"SELECT DISTINCT ga.asset_id",
		"JOIN assets a ON a.id = ga.asset_id",
		"a.deleted_at IS NULL",
		"NOT EXISTS",
		"JOIN galleries other_g ON other_g.id = other_ga.gallery_id",
		"other_ga.asset_id = ga.asset_id",
		"other_ga.gallery_id <> ga.gallery_id",
		"other_g.deleted_at IS NULL",
	} {
		if !strings.Contains(sql, frag) {
			t.Fatalf("gallery delete cascade SQL missing %q; got:\n%s", frag, sql)
		}
	}
}
