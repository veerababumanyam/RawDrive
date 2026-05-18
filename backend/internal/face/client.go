// Package face is the Go-side client for the face-svc Python sidecar
// (services/face-svc). It POSTs image bytes and gets back face bounding
// boxes + 512-d L2-normalized embeddings ready to write into pgvector.
//
// Why a sidecar and not in-process: see services/face-svc/README.md.
// Short version: the Go API builds with CGO_ENABLED=0 (static alpine
// binary, ~30 MB image). Wiring dlib/ONNX directly would force CGo +
// ~200 MB of system libs. The sidecar keeps the Go image untouched and
// makes the ML stack swappable.
//
// Wiring:
//
//	client := face.NewClient(face.Config{
//	    BaseURL: os.Getenv("FACE_SVC_URL"), // http://face-svc:8000 in compose
//	    Timeout: 30 * time.Second,
//	})
//	faces, err := client.DetectAndEmbed(ctx, imageBytes)
//
// The ingest worker (PR-2) gates this call on the workspace's
// face_recognition_enabled flag — see migration 110.
package face

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"time"
)

const (
	// defaultTimeout — face-svc cold start can be slow (model download
	// runs on first request after a container restart). Warm requests
	// are sub-second on CPU for 2400px JPEGs. 30s gives us headroom for
	// the cold case without leaving requests hanging indefinitely.
	defaultTimeout = 30 * time.Second

	// EmbeddingDim is the dimension of buffalo_l's ArcFace r100 output.
	// pgvector face_clusters.embedding is vector(512); the Go callsite
	// should assert len(emb)==EmbeddingDim before insert to surface model
	// mismatches as a clear error instead of an opaque pgvector reject.
	EmbeddingDim = 512
)

// ErrServiceUnavailable is returned when face-svc is reachable but
// reports it isn't ready (HTTP 503 — usually mid-cold-start, retry with
// backoff). Distinct from network errors so the caller can choose
// retry-vs-fail policy.
var ErrServiceUnavailable = errors.New("face-svc not ready")

// Config holds the wiring for a Client.
type Config struct {
	// BaseURL of face-svc. In compose this is http://face-svc:8000. In
	// the unit test this points at a local face-svc on http://localhost:8085.
	BaseURL string
	// HTTPClient overrides the default if you want connection pooling
	// or different transport tuning. Nil → a fresh client with Timeout.
	HTTPClient *http.Client
	// Timeout for individual /detect calls. 0 → defaultTimeout.
	Timeout time.Duration
}

// Client talks to face-svc over HTTP. Cheap to construct; safe for
// concurrent use (the underlying http.Client is the standard library's,
// which is goroutine-safe).
type Client struct {
	baseURL string
	http    *http.Client
}

// NewClient returns a Client wired against cfg. BaseURL must be non-empty
// or NewClient returns an error so the caller can fall back to a
// disabled-face-recognition codepath rather than panic at first request.
func NewClient(cfg Config) (*Client, error) {
	base := strings.TrimRight(cfg.BaseURL, "/")
	if base == "" {
		return nil, errors.New("face: BaseURL is required (set FACE_SVC_URL)")
	}
	hc := cfg.HTTPClient
	if hc == nil {
		t := cfg.Timeout
		if t <= 0 {
			t = defaultTimeout
		}
		hc = &http.Client{Timeout: t}
	}
	return &Client{baseURL: base, http: hc}, nil
}

// Bbox is the top-left + width/height of a detected face, in pixels of
// the source image. Pre-clamped server-side so x,y are ≥0 and the box
// fits inside the image canvas.
type Bbox struct {
	X int `json:"x"`
	Y int `json:"y"`
	W int `json:"w"`
	H int `json:"h"`
}

// Face is one detected face from face-svc. Embedding is L2-normalized,
// so the cosine similarity between two Faces equals their dot product —
// matches pgvector's vector_cosine_ops index.
type Face struct {
	Bbox      Bbox      `json:"bbox"`
	Embedding []float32 `json:"embedding"`
	DetScore  float32   `json:"det_score"`
}

// DetectResponse mirrors face-svc's response. ImageWidth/ImageHeight
// echo the decoded source dimensions — useful when the caller wants to
// store relative bboxes or crop the source for a person cover tile.
type DetectResponse struct {
	Faces       []Face `json:"faces"`
	ImageWidth  int    `json:"image_width"`
	ImageHeight int    `json:"image_height"`
	Model       string `json:"model"`
}

// HealthResponse mirrors face-svc's /healthz.
type HealthResponse struct {
	Status string `json:"status"`
	Model  string `json:"model"`
	Ready  bool   `json:"ready"`
}

// Health probes face-svc's /healthz. Returns the response or an error.
// The caller treats Ready=false as ErrServiceUnavailable.
func (c *Client) Health(ctx context.Context) (*HealthResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/healthz", nil)
	if err != nil {
		return nil, fmt.Errorf("face: build request: %w", err)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("face: request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<10))
		return nil, fmt.Errorf("face: healthz HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var out HealthResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("face: decode healthz: %w", err)
	}
	return &out, nil
}

// DetectAndEmbed POSTs image bytes to face-svc /detect and returns the
// detected faces. Returns an empty slice when the image has no faces
// (not an error). Returns ErrServiceUnavailable on 503 so the caller
// can retry.
//
// filename is included in the multipart form mainly as a debugging
// breadcrumb in face-svc logs — pick the asset's original filename if
// you have it, else "image.jpg" is fine.
func (c *Client) DetectAndEmbed(ctx context.Context, imageBytes []byte, filename string) (*DetectResponse, error) {
	if len(imageBytes) == 0 {
		return nil, errors.New("face: empty image bytes")
	}
	if filename == "" {
		filename = "image.jpg"
	}

	// Build a multipart body in memory. For typical wedding photos
	// (3-6 MB JPEG) this is fine; if we ever need to stream very large
	// originals we can swap to io.Pipe + goroutine, but face-svc caps
	// requests at 20 MB anyway.
	buf := &bytes.Buffer{}
	mw := multipart.NewWriter(buf)
	part, err := mw.CreateFormFile("image", filename)
	if err != nil {
		return nil, fmt.Errorf("face: build multipart: %w", err)
	}
	if _, err := part.Write(imageBytes); err != nil {
		return nil, fmt.Errorf("face: write multipart part: %w", err)
	}
	if err := mw.Close(); err != nil {
		return nil, fmt.Errorf("face: close multipart: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/detect", buf)
	if err != nil {
		return nil, fmt.Errorf("face: build request: %w", err)
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("face: request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusServiceUnavailable {
		return nil, ErrServiceUnavailable
	}
	if resp.StatusCode != http.StatusOK {
		// Cap the error body so a misconfigured upstream returning a
		// 1 MB HTML error page can't blow up logs.
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<10))
		return nil, fmt.Errorf("face: detect HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var out DetectResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("face: decode detect: %w", err)
	}

	// Defensive dimension check — if face-svc is ever swapped to a
	// model that returns a different vector size we want to fail loudly
	// here, not silently corrupt pgvector inserts downstream.
	for i, f := range out.Faces {
		if len(f.Embedding) != EmbeddingDim {
			return nil, fmt.Errorf("face: face[%d] embedding dim=%d, want %d (model=%s)", i, len(f.Embedding), EmbeddingDim, out.Model)
		}
	}

	return &out, nil
}
