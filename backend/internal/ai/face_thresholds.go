package ai

import (
	"strconv"
	"strings"
)

// FaceThresholds holds the tunable acceptance gates for face clustering and
// search. These were hardcoded in Go — tuning them required a code change and a
// redeploy — and were duplicated across the dashboard (SearchByFace) and public
// (PhotoSearch) paths, so the two could silently drift. They are now resolved
// once from platform_settings(ai.face_*) → env → these defaults and injected
// into both FaceService and the public gallery handler from a single source.
type FaceThresholds struct {
	// ClusterMerge is the cosine similarity at or above which a freshly detected
	// face joins an existing cluster (below it, the face starts a new cluster).
	ClusterMerge float64
	// RetrievalFloor is the minimum cosine similarity for an indexed face to be
	// retrieved as a search candidate.
	RetrievalFloor float64
	// RetrievalLimit caps how many candidates are pulled from the index per query.
	RetrievalLimit int
	// MinBest: a search accepts a winning cluster if its best candidate
	// similarity is ≥ MinBest …
	MinBest float64
	// MinAggregate: … OR its aggregate (summed) candidate score is ≥ MinAggregate.
	MinAggregate float64
}

// DefaultFaceThresholds returns the values that were previously compiled in.
// They are the behavior-preserving fallbacks: with no platform_settings/env
// override, clustering and search behave exactly as before this was made
// configurable. Keep these in sync with the historical hardcoded constants.
func DefaultFaceThresholds() FaceThresholds {
	return FaceThresholds{
		ClusterMerge:   0.55,
		RetrievalFloor: 0.30,
		RetrievalLimit: 20,
		MinBest:        0.40,
		MinAggregate:   0.80,
	}
}

// ResolveFaceThresholds layers string overrides (resolved platform_settings →
// env upstream) on top of DefaultFaceThresholds. An empty or invalid value
// leaves that field at its default, so a bad override can never silently
// disable a gate — e.g. a "0" similarity that would match every face, or a
// non-positive retrieval limit that would return nothing.
func ResolveFaceThresholds(clusterMerge, retrievalFloor, minBest, minAggregate, retrievalLimit string) FaceThresholds {
	t := DefaultFaceThresholds()
	t.ClusterMerge = parseSimilarity(clusterMerge, t.ClusterMerge)
	t.RetrievalFloor = parseSimilarity(retrievalFloor, t.RetrievalFloor)
	t.MinBest = parseSimilarity(minBest, t.MinBest)
	t.MinAggregate = parsePositive(minAggregate, t.MinAggregate)
	if v, err := strconv.Atoi(strings.TrimSpace(retrievalLimit)); err == nil && v > 0 {
		t.RetrievalLimit = v
	}
	return t
}

// parseSimilarity accepts a cosine similarity in the half-open range (0,1];
// anything else (empty, NaN, ≤0, >1) keeps def.
func parseSimilarity(s string, def float64) float64 {
	v, err := strconv.ParseFloat(strings.TrimSpace(s), 64)
	if err != nil || v <= 0 || v > 1 {
		return def
	}
	return v
}

// parsePositive accepts any value > 0 (the aggregate score sums several
// candidate similarities, so it can legitimately exceed 1); else keeps def.
func parsePositive(s string, def float64) float64 {
	v, err := strconv.ParseFloat(strings.TrimSpace(s), 64)
	if err != nil || v <= 0 {
		return def
	}
	return v
}
