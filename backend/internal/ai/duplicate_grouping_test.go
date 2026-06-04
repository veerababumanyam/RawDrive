package ai

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// TestGroupDuplicatePairs_MergesBridgedGroups is the #53 regression guard. A pair
// that bridges two already-distinct groups must MERGE them. The pairs arrive in an
// adversarial order — the two sub-groups {a,b} and {c,d} form BEFORE the bridging
// pair (b,c) — which is exactly the order that the old code (both-grouped branch =
// no-op) over-split into two groups. With the union-find merge it is one group of 4.
func TestGroupDuplicatePairs_MergesBridgedGroups(t *testing.T) {
	a, b, c, d := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	pairs := []dupPair{
		{a: a, b: b, sim: 0.98}, // forms group {a,b}
		{a: c, b: d, sim: 0.98}, // forms a SEPARATE group {c,d}
		{a: b, b: c, sim: 0.95}, // bridges them → must merge into one group of 4
	}

	groups := groupDuplicatePairs(uuid.New(), nil, pairs)

	require.Lenf(t, groups, 1, "a pair bridging two distinct groups must merge them into one, got %d", len(groups))

	var g *DuplicateGroup
	for _, grp := range groups {
		g = grp
	}
	got := map[uuid.UUID]bool{}
	reps := 0
	for _, m := range g.Members {
		got[m.AssetID] = true
		if m.IsRepresentative {
			reps++
		}
		require.Equalf(t, g.ID, m.GroupID, "merged member %s must repoint its GroupID to the surviving group", m.AssetID)
	}
	require.Truef(t, got[a] && got[b] && got[c] && got[d], "all 4 chained assets must be in the merged group: %v", got)
	require.Lenf(t, g.Members, 4, "merged group must have exactly 4 members (no duplicates), got %d", len(g.Members))
	require.Equalf(t, 1, reps, "merged group must keep exactly one representative, got %d", reps)
}

// TestGroupDuplicatePairs_DisjointClustersStaySeparate is the control: without a
// bridging pair, two clusters remain two groups (proves the merge test's setup is
// meaningful — the merge isn't just collapsing everything).
func TestGroupDuplicatePairs_DisjointClustersStaySeparate(t *testing.T) {
	a, b, c, d := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	pairs := []dupPair{
		{a: a, b: b, sim: 0.98},
		{a: c, b: d, sim: 0.98},
	}
	groups := groupDuplicatePairs(uuid.New(), nil, pairs)
	require.Lenf(t, groups, 2, "two unbridged clusters must remain separate groups, got %d", len(groups))
}

// TestGroupDuplicatePairs_SymmetricRowIsNoOp guards that the self-join's symmetric
// (b,a) row never double-adds a member.
func TestGroupDuplicatePairs_SymmetricRowIsNoOp(t *testing.T) {
	a, b := uuid.New(), uuid.New()
	pairs := []dupPair{
		{a: a, b: b, sim: 0.98},
		{a: b, b: a, sim: 0.98}, // symmetric duplicate
	}
	groups := groupDuplicatePairs(uuid.New(), nil, pairs)
	require.Len(t, groups, 1)
	for _, g := range groups {
		require.Lenf(t, g.Members, 2, "a symmetric duplicate row must not double-add a member, got %d", len(g.Members))
	}
}
