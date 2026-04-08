package ai

import "testing"

func TestEstimateCost_KnownModel(t *testing.T) {
	// gemini-2.0-flash: 6 paisa/1K input, 25 paisa/1K output
	cost := EstimateCost("gemini-2.0-flash", 1000, 500)
	// input: (1000 * 6 + 999) / 1000 = 6
	// output: (500 * 25 + 999) / 1000 = 13
	expected := int64(6 + 13)
	if cost != expected {
		t.Errorf("EstimateCost(gemini-2.0-flash, 1000, 500) = %d, want %d", cost, expected)
	}
}

func TestEstimateCost_UnknownModel(t *testing.T) {
	// Unknown model should use default: 25 input, 100 output per 1K
	cost := EstimateCost("unknown-model", 1000, 1000)
	// input: (1000*25+999)/1000 = 25
	// output: (1000*100+999)/1000 = 100
	expected := int64(25 + 100)
	if cost != expected {
		t.Errorf("EstimateCost(unknown, 1000, 1000) = %d, want %d", cost, expected)
	}
}

func TestEstimateCost_ZeroTokens(t *testing.T) {
	cost := EstimateCost("gemini-2.0-flash", 0, 0)
	if cost != 0 {
		t.Errorf("EstimateCost(0, 0) = %d, want 0", cost)
	}
}

func TestEstimateCost_OneToken(t *testing.T) {
	// 1 token should still produce a non-zero cost (ceiling)
	cost := EstimateCost("gemini-2.0-flash", 1, 0)
	// (1 * 6 + 999) / 1000 = 1 (ceiling)
	if cost != 1 {
		t.Errorf("EstimateCost(1, 0) = %d, want 1", cost)
	}
}

func TestEstimateCost_EmbeddingModel(t *testing.T) {
	// text-embedding-004: 1 paisa/1K input, 0 output
	cost := EstimateCost("text-embedding-004", 5000, 0)
	// (5000 * 1 + 999) / 1000 = 5
	expected := int64(5)
	if cost != expected {
		t.Errorf("EstimateCost(embedding, 5000, 0) = %d, want %d", cost, expected)
	}
}

func TestEstimateCost_LargeTokenCount(t *testing.T) {
	cost := EstimateCost("gemini-1.5-pro", 100000, 50000)
	// input: (100000*105+999)/1000 = 10500
	// output: (50000*420+999)/1000 = 21000
	expected := int64(10500 + 21000)
	if cost != expected {
		t.Errorf("EstimateCost(pro, 100K, 50K) = %d, want %d", cost, expected)
	}
}
