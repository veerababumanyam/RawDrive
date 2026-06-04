package ai

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestResolveEmbeddingModel covers item 13c Part A: the resolver returns the
// default when unset and the override when set, so an empty config preserves
// backward compatibility (exactly "text-embedding-004").
func TestResolveEmbeddingModel(t *testing.T) {
	tests := []struct {
		name       string
		configured string
		want       string
	}{
		{"empty -> default", "", DefaultEmbeddingModel},
		{"whitespace -> default", "   ", DefaultEmbeddingModel},
		{"override", "gemini-embedding-001", "gemini-embedding-001"},
		{"override trimmed", "  gemini-embedding-001 ", "gemini-embedding-001"},
		{"explicit default", "text-embedding-004", "text-embedding-004"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ResolveEmbeddingModel(tt.configured); got != tt.want {
				t.Fatalf("ResolveEmbeddingModel(%q) = %q, want %q", tt.configured, got, tt.want)
			}
		})
	}
}

// TestNewGeminiClient_DefaultEmbeddingModel verifies a freshly constructed
// client (no WithEmbeddingModel call — the existing call path) embeds with the
// default model, so existing deployments see no behaviour change.
func TestNewGeminiClient_DefaultEmbeddingModel(t *testing.T) {
	c := NewGeminiClient("gemini-2.0-flash")
	if got := c.EmbeddingModel(); got != DefaultEmbeddingModel {
		t.Fatalf("default EmbeddingModel() = %q, want %q", got, DefaultEmbeddingModel)
	}
}

// TestWithEmbeddingModel_Override verifies the builder sets the override and
// that an empty override keeps the default.
func TestWithEmbeddingModel_Override(t *testing.T) {
	if got := NewGeminiClient("").WithEmbeddingModel("gemini-embedding-001").EmbeddingModel(); got != "gemini-embedding-001" {
		t.Fatalf("override EmbeddingModel() = %q, want gemini-embedding-001", got)
	}
	if got := NewGeminiClient("").WithEmbeddingModel("").EmbeddingModel(); got != DefaultEmbeddingModel {
		t.Fatalf("empty override EmbeddingModel() = %q, want %q", got, DefaultEmbeddingModel)
	}
}

// TestGenerateEmbedding_UsesConfiguredModel asserts that GenerateEmbedding
// issues the request against the configured model — both in the URL path
// (.../models/<model>:embedContent) and the JSON body ("model":"models/<model>")
// — using a stubbed server so the real Gemini API is never called.
func TestGenerateEmbedding_UsesConfiguredModel(t *testing.T) {
	for _, model := range []string{DefaultEmbeddingModel, "gemini-embedding-001"} {
		t.Run(model, func(t *testing.T) {
			var gotPath string
			var gotBodyModel string
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				gotPath = r.URL.Path
				var body struct {
					Model string `json:"model"`
				}
				_ = json.NewDecoder(r.Body).Decode(&body)
				gotBodyModel = body.Model
				_ = json.NewEncoder(w).Encode(map[string]any{
					"embedding": map[string]any{"values": []float32{0.1, 0.2, 0.3}},
				})
			}))
			defer srv.Close()

			client := NewGeminiClient("gemini-2.0-flash").WithEmbeddingModel(model)
			client.baseURL = srv.URL

			vals, _, err := client.GenerateEmbedding(context.Background(), "test-key", "a photograph")
			if err != nil {
				t.Fatalf("GenerateEmbedding: %v", err)
			}
			if len(vals) != 3 {
				t.Fatalf("expected 3-dim stub vector, got %d", len(vals))
			}
			wantPath := "/models/" + model + ":embedContent"
			if gotPath != wantPath {
				t.Errorf("request path = %q, want %q", gotPath, wantPath)
			}
			if wantBody := "models/" + model; gotBodyModel != wantBody {
				t.Errorf("request body model = %q, want %q", gotBodyModel, wantBody)
			}
			if strings.Contains(gotPath, "text-embedding-004") && model != "text-embedding-004" {
				t.Errorf("override model leaked default literal in path %q", gotPath)
			}
		})
	}
}
