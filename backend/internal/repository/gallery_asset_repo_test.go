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
