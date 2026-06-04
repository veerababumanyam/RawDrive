package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

// PERF-GZIP regression: the global middleware stack must gzip-compress large
// JSON list payloads (public gallery ListAssets, owner ?include_assets
// hydration, admin analytics) while NEVER double-compressing the /storage
// byte-stream proxy or encrypted-derivative image/octet-stream responses.
//
// compressionMiddleware() is the single source of truth for that wiring so the
// scoping invariant is exercised here against the real chi compressor, not a
// reimplementation.

// largeJSON is comfortably bigger than chi's minimum-compressible threshold and
// highly repetitive, so gzip should shrink it dramatically.
func largeJSONBody() string {
	row := `{"id":"00000000-0000-0000-0000-000000000001","filename":"Wedding (42).jpg","sort_order":1,"content_type":"image/webp"},`
	var b strings.Builder
	b.WriteString(`{"assets":[`)
	for i := 0; i < 200; i++ {
		b.WriteString(row)
	}
	b.WriteString(`{"id":"end"}]}`)
	return b.String()
}

func newCompressionTestRouter() *chi.Mux {
	r := chi.NewRouter()
	r.Use(compressionMiddleware())

	// JSON list endpoint — must be compressed.
	r.Get("/api/v1/galleries/x/assets", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, largeJSONBody())
	})

	// /storage byte-stream proxy — image/webp must NOT be compressed.
	r.Get("/storage/thumbnails/img.webp", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "image/webp")
		_, _ = w.Write(make([]byte, 64*1024)) // sizable so a missing skip would be obvious
	})

	// encrypted-derivative / generic byte-stream — octet-stream must NOT be compressed.
	r.Get("/storage/encrypted/blob", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/octet-stream")
		_, _ = w.Write(make([]byte, 64*1024))
	})

	return r
}

func TestPerfGzip_JSONListResponsesAreCompressed(t *testing.T) {
	srv := httptest.NewServer(newCompressionTestRouter())
	t.Cleanup(srv.Close)

	uncompressedLen := len(largeJSONBody())

	req, err := http.NewRequest(http.MethodGet, srv.URL+"/api/v1/galleries/x/assets", nil)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	req.Header.Set("Accept-Encoding", "gzip")

	// Disable the transport's transparent gzip so we observe the wire bytes.
	resp, err := (&http.Client{Transport: &http.Transport{DisableCompression: true}}).Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	defer resp.Body.Close()

	if got := resp.Header.Get("Content-Encoding"); got != "gzip" {
		t.Fatalf("JSON list response Content-Encoding = %q, want \"gzip\"", got)
	}

	wire, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	// Acceptance: payload is >=60% smaller on the wire for a 200-row list.
	if len(wire) >= uncompressedLen*40/100 {
		t.Fatalf("gzip wire size %d not >=60%% smaller than uncompressed %d", len(wire), uncompressedLen)
	}
	if !strings.Contains(resp.Header.Get("Vary"), "Accept-Encoding") {
		t.Errorf("compressed response should set Vary: Accept-Encoding, got %q", resp.Header.Get("Vary"))
	}
}

func TestPerfGzip_StorageByteStreamsAreNotDoubleCompressed(t *testing.T) {
	srv := httptest.NewServer(newCompressionTestRouter())
	t.Cleanup(srv.Close)

	for _, path := range []string{"/storage/thumbnails/img.webp", "/storage/encrypted/blob"} {
		req, err := http.NewRequest(http.MethodGet, srv.URL+path, nil)
		if err != nil {
			t.Fatalf("build request %s: %v", path, err)
		}
		req.Header.Set("Accept-Encoding", "gzip")

		resp, err := (&http.Client{Transport: &http.Transport{DisableCompression: true}}).Do(req)
		if err != nil {
			t.Fatalf("do request %s: %v", path, err)
		}

		if got := resp.Header.Get("Content-Encoding"); got != "" {
			resp.Body.Close()
			t.Fatalf("storage byte-stream %s was compressed (Content-Encoding=%q); image/octet-stream must stream raw", path, got)
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			t.Fatalf("read body %s: %v", path, err)
		}
		if len(body) != 64*1024 {
			t.Fatalf("storage byte-stream %s returned %d bytes, want exactly 65536 (uncompressed, byte-exact)", path, len(body))
		}
	}
}
