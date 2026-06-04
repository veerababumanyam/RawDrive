package ai

import (
	"context"
	"strconv"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

// TestDetectDuplicates_GroupsNearIdenticalViaHNSW verifies the ANN self-join
// rewrite: near-identical embeddings (cosine >= 0.92) are grouped into one
// duplicate group, and dissimilar (orthogonal) embeddings are not. This is the
// correctness guard replacing the previous O(n²) Go scan; the same grouping must
// fall out of the HNSW LATERAL nearest-neighbour query.
func TestDetectDuplicates_GroupsNearIdenticalViaHNSW(t *testing.T) {
	pool := getAITestPool(t)
	ctx := context.Background()

	// DetectDuplicates + createDuplicateGroup only need the pool.
	svc := &DuplicateService{pool: pool}
	wsID := seedDupWorkspace(t, ctx, pool)

	// Cluster of 3 near-identical vectors (all dominated by dim 0). Tiny jitter
	// keeps them distinct while well above the 0.92 cosine threshold.
	a1 := seedAssetWithEmbedding(t, ctx, pool, wsID, vec768(0, 0.0))
	a2 := seedAssetWithEmbedding(t, ctx, pool, wsID, vec768(0, 0.03))
	a3 := seedAssetWithEmbedding(t, ctx, pool, wsID, vec768(0, 0.05))
	// Two dissimilar vectors (orthogonal directions → cosine 0).
	b := seedAssetWithEmbedding(t, ctx, pool, wsID, vec768(100, 0.0))
	c := seedAssetWithEmbedding(t, ctx, pool, wsID, vec768(300, 0.0))

	groups, err := svc.DetectDuplicates(ctx, wsID, nil)
	require.NoError(t, err)

	require.Lenf(t, groups, 1, "the 3 near-identical assets must form exactly one duplicate group, got %d", len(groups))
	members := map[uuid.UUID]bool{}
	for _, m := range groups[0].Members {
		members[m.AssetID] = true
	}
	require.Truef(t, members[a1] && members[a2] && members[a3],
		"all 3 near-identical assets must be grouped (a1=%v a2=%v a3=%v)", members[a1], members[a2], members[a3])
	require.Falsef(t, members[b] || members[c], "dissimilar assets must not be in the duplicate group")
	require.Lenf(t, groups[0].Members, 3, "group must contain exactly the 3 cluster members, got %d", len(groups[0].Members))
}

// vec768 builds a 768-dim pgvector literal dominated by index `hot` (value 1.0),
// with a small jitter at the next index so cluster members are distinct but still
// cosine-similar. Two vectors with different `hot` indices are orthogonal.
func vec768(hot int, jitter float64) string {
	const dim = 768
	parts := make([]string, dim)
	for i := 0; i < dim; i++ {
		v := 0.0
		if i == hot {
			v = 1.0
		} else if jitter > 0 && i == (hot+1)%dim {
			v = jitter
		}
		parts[i] = strconv.FormatFloat(v, 'f', 4, 64)
	}
	return "[" + strings.Join(parts, ",") + "]"
}

func seedDupWorkspace(t *testing.T, ctx context.Context, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	var stateID int
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM states LIMIT 1`).Scan(&stateID))
	var ownerID, wsID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO users (display_name, state_id, created_at, updated_at)
		 VALUES ('Dup Owner', $1, NOW(), NOW()) RETURNING id`, stateID).Scan(&ownerID))
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO workspaces (name, state_id, owner_id, created_at)
		 VALUES ('Dup WS', $1, $2, NOW()) RETURNING id`, stateID, ownerID).Scan(&wsID))
	t.Cleanup(func() {
		c := context.Background()
		_, _ = pool.Exec(c, `DELETE FROM duplicate_group_members WHERE asset_id IN (SELECT id FROM assets WHERE workspace_id = $1)`, wsID)
		_, _ = pool.Exec(c, `DELETE FROM duplicate_groups WHERE workspace_id = $1`, wsID)
		_, _ = pool.Exec(c, `DELETE FROM assets WHERE workspace_id = $1`, wsID)
		_, _ = pool.Exec(c, `DELETE FROM workspaces WHERE id = $1`, wsID)
		_, _ = pool.Exec(c, `DELETE FROM users WHERE id = $1`, ownerID)
	})
	return wsID
}

func seedAssetWithEmbedding(t *testing.T, ctx context.Context, pool *pgxpool.Pool, wsID uuid.UUID, embeddingLiteral string) uuid.UUID {
	t.Helper()
	id := uuid.New()
	_, err := pool.Exec(ctx,
		`INSERT INTO assets (id, workspace_id, filename, content_type, size_bytes, storage_key,
		   status, embedding, created_at, updated_at)
		 VALUES ($1, $2, $3, 'image/jpeg', 1024, $4, 'ready', $5::vector, NOW(), NOW())`,
		id, wsID, "dup_"+uuid.NewString()+".jpg", "ws/"+wsID.String()+"/"+uuid.NewString(), embeddingLiteral)
	require.NoError(t, err)
	return id
}
