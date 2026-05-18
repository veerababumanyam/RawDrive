package face

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// TestNewClient_RejectsEmptyBaseURL — guards the runtime config check
// so a misconfigured deploy fails at startup with a clear error instead
// of attempting to POST to "/detect" and getting an opaque DNS failure.
func TestNewClient_RejectsEmptyBaseURL(t *testing.T) {
	if _, err := NewClient(Config{BaseURL: ""}); err == nil {
		t.Fatal("expected error for empty BaseURL")
	}
}

// TestDetectAndEmbed_HappyPath — runs against a httptest.Server that
// mimics face-svc's response shape. Covers JSON decode + multipart
// upload + dimension assertion without needing the real Python service.
func TestDetectAndEmbed_HappyPath(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/detect" || r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		if !strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
			t.Errorf("unexpected Content-Type: %s", r.Header.Get("Content-Type"))
		}
		// Echo a plausible response — one face, 512-d zeros suffice for the
		// shape check the client performs.
		emb := make([]float32, EmbeddingDim)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(DetectResponse{
			Faces:       []Face{{Bbox: Bbox{X: 10, Y: 10, W: 100, H: 100}, Embedding: emb, DetScore: 0.95}},
			ImageWidth:  640,
			ImageHeight: 480,
			Model:       "buffalo_l",
		})
	}))
	defer srv.Close()

	c, err := NewClient(Config{BaseURL: srv.URL, Timeout: 5 * time.Second})
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp, err := c.DetectAndEmbed(ctx, []byte("fake-jpeg-bytes"), "test.jpg")
	if err != nil {
		t.Fatalf("DetectAndEmbed: %v", err)
	}
	if len(resp.Faces) != 1 {
		t.Fatalf("got %d faces, want 1", len(resp.Faces))
	}
	if len(resp.Faces[0].Embedding) != EmbeddingDim {
		t.Fatalf("embedding dim %d, want %d", len(resp.Faces[0].Embedding), EmbeddingDim)
	}
	if resp.Model != "buffalo_l" {
		t.Errorf("model %q, want buffalo_l", resp.Model)
	}
}

// TestDetectAndEmbed_BadDim — face-svc could be misconfigured to a
// different model; we want the client to reject before it tries to
// stuff the wrong-shape vector into pgvector. This test simulates that
// upstream regression.
func TestDetectAndEmbed_BadDim(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(DetectResponse{
			Faces: []Face{{
				Bbox:      Bbox{X: 0, Y: 0, W: 10, H: 10},
				Embedding: make([]float32, 128), // wrong dim
				DetScore:  0.9,
			}},
			Model: "some-other-model",
		})
	}))
	defer srv.Close()

	c, _ := NewClient(Config{BaseURL: srv.URL, Timeout: 5 * time.Second})
	_, err := c.DetectAndEmbed(context.Background(), []byte("x"), "")
	if err == nil {
		t.Fatal("expected error for wrong embedding dim, got nil")
	}
	if !strings.Contains(err.Error(), "embedding dim") {
		t.Errorf("unexpected error: %v", err)
	}
}

// TestDetectAndEmbed_ServiceUnavailable — face-svc returns 503 during
// cold start while the buffalo_l model is loading. Caller should be
// able to retry without parsing strings.
func TestDetectAndEmbed_ServiceUnavailable(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`{"detail":"model not ready"}`))
	}))
	defer srv.Close()
	c, _ := NewClient(Config{BaseURL: srv.URL, Timeout: 5 * time.Second})
	_, err := c.DetectAndEmbed(context.Background(), []byte("x"), "")
	if err != ErrServiceUnavailable {
		t.Fatalf("got %v, want ErrServiceUnavailable", err)
	}
}

// TestDetectAndEmbed_LiveService — integration test against a real
// running face-svc. Skipped unless FACE_SVC_URL is set, so CI doesn't
// have to stand up the Python container for every test run.
//
// Run locally:
//
//	docker compose -f docker-compose.dev.yml up -d face-svc
//	FACE_SVC_URL=http://localhost:8085 go test ./internal/face/... -run Live -v
//
// Uses tests/photos/Wedding (42).jpg — a real wedding shot with multiple
// people, chosen because the filename has a space + parens (per
// AGENTS.md "tests MUST handle them correctly").
func TestDetectAndEmbed_LiveService(t *testing.T) {
	url := os.Getenv("FACE_SVC_URL")
	if url == "" {
		t.Skip("FACE_SVC_URL not set — start face-svc and re-run to exercise this test")
	}

	// Walk up from this file to the repo root and find tests/photos.
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	// From backend/internal/face → ../../../tests/photos
	photoPath := filepath.Join(wd, "..", "..", "..", "tests", "photos", "Wedding (42).jpg")
	bytes, err := os.ReadFile(photoPath)
	if err != nil {
		t.Fatalf("read test photo %s: %v", photoPath, err)
	}

	c, err := NewClient(Config{BaseURL: url, Timeout: 60 * time.Second})
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}

	// Wait for /healthz to report ready — cold start can be slow on
	// first run while the buffalo_l model downloads.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	deadline := time.Now().Add(5 * time.Minute)
	for time.Now().Before(deadline) {
		h, err := c.Health(ctx)
		if err == nil && h.Ready {
			break
		}
		t.Logf("waiting for face-svc... err=%v", err)
		time.Sleep(3 * time.Second)
	}

	resp, err := c.DetectAndEmbed(ctx, bytes, "Wedding (42).jpg")
	if err != nil {
		t.Fatalf("DetectAndEmbed: %v", err)
	}
	if len(resp.Faces) < 1 {
		t.Fatalf("expected ≥1 face in wedding photo, got 0")
	}
	for i, f := range resp.Faces {
		if len(f.Embedding) != EmbeddingDim {
			t.Fatalf("face[%d] embedding dim %d, want %d", i, len(f.Embedding), EmbeddingDim)
		}
		if f.DetScore < 0.5 {
			t.Errorf("face[%d] det_score %f below MIN_DET_SCORE filter — server config issue?", i, f.DetScore)
		}
	}
	t.Logf("detected %d faces in Wedding (42).jpg (%dx%d, model=%s)",
		len(resp.Faces), resp.ImageWidth, resp.ImageHeight, resp.Model)
}
