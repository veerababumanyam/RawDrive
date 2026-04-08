package ai

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func newTestGeminiServer(t *testing.T, handler http.HandlerFunc) (*httptest.Server, *GeminiClient) {
	t.Helper()
	srv := httptest.NewServer(handler)
	client := NewGeminiClient("gemini-2.0-flash")
	client.baseURL = srv.URL
	return srv, client
}

func TestDetectFaces_Success(t *testing.T) {
	faces := []DetectedFace{
		{Index: 0, BoundingBox: BoundingBox{X: 0.1, Y: 0.2, W: 0.15, H: 0.15}, Confidence: 0.97},
		{Index: 1, BoundingBox: BoundingBox{X: 0.5, Y: 0.3, W: 0.12, H: 0.12}, Confidence: 0.89},
	}
	facesJSON, _ := json.Marshal(faces)

	srv, client := newTestGeminiServer(t, func(w http.ResponseWriter, r *http.Request) {
		resp := geminiResponse{
			Candidates: []struct {
				Content struct {
					Parts []struct {
						Text string `json:"text"`
					} `json:"parts"`
				} `json:"content"`
			}{
				{Content: struct {
					Parts []struct {
						Text string `json:"text"`
					} `json:"parts"`
				}{Parts: []struct {
					Text string `json:"text"`
				}{{Text: string(facesJSON)}}}},
			},
			UsageMetadata: struct {
				PromptTokenCount     int `json:"promptTokenCount"`
				CandidatesTokenCount int `json:"candidatesTokenCount"`
			}{PromptTokenCount: 100, CandidatesTokenCount: 50},
		}
		json.NewEncoder(w).Encode(resp)
	})
	defer srv.Close()

	result, inTok, outTok, err := client.DetectFaces(context.Background(), "test-key", []byte("fake-image"), "image/jpeg")
	if err != nil {
		t.Fatalf("DetectFaces: %v", err)
	}
	if len(result) != 2 {
		t.Fatalf("expected 2 faces, got %d", len(result))
	}
	if result[0].Confidence != 0.97 {
		t.Errorf("face[0].Confidence = %f, want 0.97", result[0].Confidence)
	}
	if inTok != 100 || outTok != 50 {
		t.Errorf("tokens: in=%d out=%d, want 100/50", inTok, outTok)
	}
}

func TestDetectFaces_429RateLimit(t *testing.T) {
	srv, client := newTestGeminiServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(429)
		w.Write([]byte(`{"error":"rate limited"}`))
	})
	defer srv.Close()

	_, _, _, err := client.DetectFaces(context.Background(), "test-key", []byte("img"), "image/jpeg")
	if err != ErrQuotaExceeded {
		t.Fatalf("expected ErrQuotaExceeded, got %v", err)
	}
}

func TestDetectFaces_InvalidJSON(t *testing.T) {
	srv, client := newTestGeminiServer(t, func(w http.ResponseWriter, r *http.Request) {
		resp := geminiResponse{
			Candidates: []struct {
				Content struct {
					Parts []struct {
						Text string `json:"text"`
					} `json:"parts"`
				} `json:"content"`
			}{
				{Content: struct {
					Parts []struct {
						Text string `json:"text"`
					} `json:"parts"`
				}{Parts: []struct {
					Text string `json:"text"`
				}{{Text: "not valid json at all"}}}},
			},
		}
		json.NewEncoder(w).Encode(resp)
	})
	defer srv.Close()

	_, _, _, err := client.DetectFaces(context.Background(), "test-key", []byte("img"), "image/jpeg")
	if err == nil {
		t.Fatal("expected parse error for invalid JSON response")
	}
}

func TestGenerateTags_Success(t *testing.T) {
	tagResp := `{"tags":[{"tag":"sunset","category":"scene","confidence":0.95},{"tag":"warm","category":"mood","confidence":0.88}],"caption":"A beautiful sunset over the ocean"}`

	srv, client := newTestGeminiServer(t, func(w http.ResponseWriter, r *http.Request) {
		resp := geminiResponse{
			Candidates: []struct {
				Content struct {
					Parts []struct {
						Text string `json:"text"`
					} `json:"parts"`
				} `json:"content"`
			}{
				{Content: struct {
					Parts []struct {
						Text string `json:"text"`
					} `json:"parts"`
				}{Parts: []struct {
					Text string `json:"text"`
				}{{Text: tagResp}}}},
			},
			UsageMetadata: struct {
				PromptTokenCount     int `json:"promptTokenCount"`
				CandidatesTokenCount int `json:"candidatesTokenCount"`
			}{PromptTokenCount: 200, CandidatesTokenCount: 80},
		}
		json.NewEncoder(w).Encode(resp)
	})
	defer srv.Close()

	tags, caption, _, _, err := client.GenerateTags(context.Background(), "key", []byte("img"), "image/jpeg")
	if err != nil {
		t.Fatalf("GenerateTags: %v", err)
	}
	if len(tags) != 2 {
		t.Fatalf("expected 2 tags, got %d", len(tags))
	}
	if tags[0].Tag != "sunset" {
		t.Errorf("tags[0].Tag = %q, want sunset", tags[0].Tag)
	}
	if caption != "A beautiful sunset over the ocean" {
		t.Errorf("caption = %q", caption)
	}
}

func TestValidateKey_Valid(t *testing.T) {
	srv, client := newTestGeminiServer(t, func(w http.ResponseWriter, r *http.Request) {
		resp := geminiResponse{
			Candidates: []struct {
				Content struct {
					Parts []struct {
						Text string `json:"text"`
					} `json:"parts"`
				} `json:"content"`
			}{
				{Content: struct {
					Parts []struct {
						Text string `json:"text"`
					} `json:"parts"`
				}{Parts: []struct {
					Text string `json:"text"`
				}{{Text: "ok"}}}},
			},
		}
		json.NewEncoder(w).Encode(resp)
	})
	defer srv.Close()

	err := client.ValidateKey(context.Background(), "valid-key")
	if err != nil {
		t.Fatalf("ValidateKey: %v", err)
	}
}

func TestValidateKey_Invalid(t *testing.T) {
	srv, client := newTestGeminiServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(400)
		w.Write([]byte(`{"error":"API key not valid"}`))
	})
	defer srv.Close()

	err := client.ValidateKey(context.Background(), "bad-key")
	if err == nil {
		t.Fatal("expected error for invalid key")
	}
}

func TestStripCodeFences(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{`{"key":"value"}`, `{"key":"value"}`},
		{"```json\n{\"key\":\"value\"}\n```", `{"key":"value"}`},
		{"```\n[1,2,3]\n```", `[1,2,3]`},
	}
	for _, tt := range tests {
		got := stripCodeFences(tt.input)
		if got != tt.want {
			t.Errorf("stripCodeFences(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}
