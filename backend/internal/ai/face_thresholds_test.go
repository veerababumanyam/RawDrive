package ai

import "testing"

// TestDefaultFaceThresholds_MatchesHistoricalConstants is the behavior-
// preservation guard: the defaults must equal the values that were hardcoded
// before Unit 5, so making thresholds configurable changes nothing on its own.
func TestDefaultFaceThresholds_MatchesHistoricalConstants(t *testing.T) {
	d := DefaultFaceThresholds()
	if d.ClusterMerge != 0.55 || d.RetrievalFloor != 0.30 ||
		d.RetrievalLimit != 20 || d.MinBest != 0.40 || d.MinAggregate != 0.80 {
		t.Fatalf("defaults drifted from the historical hardcoded values: %+v", d)
	}
}

func TestResolveFaceThresholds_EmptyKeepsDefaults(t *testing.T) {
	if got := ResolveFaceThresholds("", "", "", "", ""); got != DefaultFaceThresholds() {
		t.Fatalf("empty overrides must yield defaults, got %+v", got)
	}
}

func TestResolveFaceThresholds_ValidOverrides(t *testing.T) {
	got := ResolveFaceThresholds("0.6", "0.35", "0.45", "1.2", "30")
	want := FaceThresholds{
		ClusterMerge: 0.6, RetrievalFloor: 0.35, MinBest: 0.45,
		MinAggregate: 1.2, RetrievalLimit: 30,
	}
	if got != want {
		t.Fatalf("valid overrides: got %+v want %+v", got, want)
	}
}

// TestResolveFaceThresholds_InvalidKeepsDefault proves a bad override can never
// silently disable a gate (a 0 similarity matching everything, or a 0 limit
// returning nothing).
func TestResolveFaceThresholds_InvalidKeepsDefault(t *testing.T) {
	d := DefaultFaceThresholds()
	cases := map[string]FaceThresholds{
		"cluster zero":    ResolveFaceThresholds("0", "", "", "", ""),
		"cluster above 1": ResolveFaceThresholds("1.5", "", "", "", ""),
		"floor negative":  ResolveFaceThresholds("", "-0.2", "", "", ""),
		"nonnumeric":      ResolveFaceThresholds("abc", "x", "", "", ""),
		"limit zero":      ResolveFaceThresholds("", "", "", "", "0"),
		"limit negative":  ResolveFaceThresholds("", "", "", "", "-5"),
	}
	for name, got := range cases {
		if got != d {
			t.Fatalf("%s: a bad override leaked through: got %+v want defaults %+v", name, got, d)
		}
	}
}
