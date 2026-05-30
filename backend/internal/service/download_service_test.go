package service

import (
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"io"
	"testing"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/download"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/storage"
)

// fakeStore is an in-memory storage.Provider for the download ZIP tests. Only
// Get is exercised by the download paths; the rest satisfy the interface.
type fakeStore struct {
	objects map[string][]byte
}

func (f *fakeStore) Put(ctx context.Context, key string, body io.Reader, size int64, contentType string) error {
	b, err := io.ReadAll(body)
	if err != nil {
		return err
	}
	if f.objects == nil {
		f.objects = map[string][]byte{}
	}
	f.objects[key] = b
	return nil
}

func (f *fakeStore) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	b, ok := f.objects[key]
	if !ok {
		return nil, errors.New("fakeStore: object not found: " + key)
	}
	return io.NopCloser(bytes.NewReader(b)), nil
}

func (f *fakeStore) Delete(ctx context.Context, key string) error { return nil }

func (f *fakeStore) PresignURL(ctx context.Context, key string, opts storage.PresignOptions) (string, error) {
	return "", nil
}

func (f *fakeStore) HealthCheck() storage.HealthStatus { return storage.HealthStatus{Status: "ok"} }

var _ storage.Provider = (*fakeStore)(nil)

// ── F-022: isJPEGFilename must never panic on short / non-.jpg names ──

// TestF022_IsJPEGFilenameNoPanic locks in the panic fix. Before the fix the
// guard `len(s) >= 4` did not protect the `s[len(s)-5:]` slice, so any 4-char
// name that is not ".jpg" (e.g. "test", "a.jp") panicked with
// "slice bounds out of range [-1:]". strings.HasSuffix is length-safe.
func TestF022_IsJPEGFilenameNoPanic(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want bool
	}{
		// Regression triggers from the finding — these used to panic.
		{"four char not jpg", "test", false},
		{"four char dot jp", "a.jp", false},
		{"four char digit jp", "1.jp", false},
		// Boundary lengths.
		{"empty", "", false},
		{"one char", "x", false},
		{"three char", "jpg", false},
		// Valid JPEG names of various cases/lengths.
		{"exact dot jpg", ".jpg", true},
		{"short jpg", "a.jpg", true},
		{"upper jpg", "PHOTO.JPG", true},
		{"mixed jpeg", "Wedding (42).JPEG", true},
		{"five char jpeg suffix", ".jpeg", true},
		// Non-JPEG real extensions must stay false.
		{"png", "image.png", false},
		{"raw", "shot.cr2", false},
		{"name containing jpg not suffix", "jpground.txt", false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// The call itself must not panic; t.Run recovers panics as failures
			// but we assert the boolean result too.
			if got := isJPEGFilename(tc.in); got != tc.want {
				t.Fatalf("isJPEGFilename(%q) = %v, want %v", tc.in, got, tc.want)
			}
		})
	}
}

// ── Test doubles for the asset read seam ──

// countingAssetSource records how the download path reads assets so we can
// prove the N+1 (per-asset GetByID) was replaced by a single GetByIDs.
type countingAssetSource struct {
	byID         map[uuid.UUID]*repository.Asset
	getByIDCalls int
	bulkCalls    int
}

func (c *countingAssetSource) GetByID(ctx context.Context, id uuid.UUID) (*repository.Asset, error) {
	c.getByIDCalls++
	return c.byID[id], nil
}

func (c *countingAssetSource) GetByIDs(ctx context.Context, ids []uuid.UUID) ([]*repository.Asset, error) {
	c.bulkCalls++
	out := make([]*repository.Asset, 0, len(ids))
	for _, id := range ids {
		if a := c.byID[id]; a != nil {
			out = append(out, a)
		}
	}
	return out, nil
}

// errWriter fails after acceptAfter bytes so we can force zip.Writer.Close()
// (the central-directory flush) to error.
type errWriter struct {
	written     int
	acceptAfter int
}

func (e *errWriter) Write(p []byte) (int, error) {
	e.written += len(p)
	if e.written > e.acceptAfter {
		return 0, errors.New("simulated downstream write failure")
	}
	return len(p), nil
}

func newAsset(filename, key string) *repository.Asset {
	return &repository.Asset{ID: uuid.New(), Filename: filename, StorageKey: key}
}

// ── F-030: download loop must bulk-fetch, not GetByID per asset ──

func TestF030_WriteSelectedZIPBulkFetchesAssets(t *testing.T) {
	a1 := newAsset("one.png", "k1")
	a2 := newAsset("two.png", "k2")
	a3 := newAsset("three.png", "k3")

	src := &countingAssetSource{byID: map[uuid.UUID]*repository.Asset{
		a1.ID: a1, a2.ID: a2, a3.ID: a3,
	}}
	store := &fakeStore{objects: map[string][]byte{
		"k1": []byte("aaa"), "k2": []byte("bbb"), "k3": []byte("ccc"),
	}}
	svc := &DownloadService{assets: src, store: store}

	var buf bytes.Buffer
	if err := svc.WriteSelectedZIP(context.Background(), []uuid.UUID{a1.ID, a2.ID, a3.ID}, &buf); err != nil {
		t.Fatalf("WriteSelectedZIP: %v", err)
	}

	if src.bulkCalls != 1 {
		t.Errorf("expected exactly 1 bulk GetByIDs call, got %d", src.bulkCalls)
	}
	if src.getByIDCalls != 0 {
		t.Errorf("expected 0 per-asset GetByID calls in the download loop, got %d (N+1 regression)", src.getByIDCalls)
	}

	// The archive must still contain all three files.
	assertZipNames(t, buf.Bytes(), []string{"one.png", "two.png", "three.png"})
}

func TestF030_WriteZipWithProgressBulkFetchesAssets(t *testing.T) {
	a1 := newAsset("a.png", "k1")
	a2 := newAsset("b.png", "k2")

	src := &countingAssetSource{byID: map[uuid.UUID]*repository.Asset{a1.ID: a1, a2.ID: a2}}
	store := &fakeStore{objects: map[string][]byte{"k1": []byte("x"), "k2": []byte("y")}}
	svc := &DownloadService{assets: src, store: store}

	var buf bytes.Buffer
	var lastProgress int
	err := svc.writeZipWithProgress(context.Background(), []uuid.UUID{a1.ID, a2.ID}, &buf,
		func(p int) { lastProgress = p })
	if err != nil {
		t.Fatalf("writeZipWithProgress: %v", err)
	}

	if src.bulkCalls != 1 {
		t.Errorf("expected exactly 1 bulk GetByIDs call, got %d", src.bulkCalls)
	}
	if src.getByIDCalls != 0 {
		t.Errorf("expected 0 per-asset GetByID calls, got %d (N+1 regression)", src.getByIDCalls)
	}
	if lastProgress != 100 {
		t.Errorf("expected final progress 100, got %d", lastProgress)
	}
	assertZipNames(t, buf.Bytes(), []string{"a.png", "b.png"})
}

// ── F-028: zip.Writer.Close() error must reach the caller ──

func TestF028_WriteSelectedZIPSurfacesCloseError(t *testing.T) {
	a1 := newAsset("photo.png", "k1")
	src := &countingAssetSource{byID: map[uuid.UUID]*repository.Asset{a1.ID: a1}}
	store := &fakeStore{objects: map[string][]byte{"k1": bytes.Repeat([]byte("z"), 64)}}
	svc := &DownloadService{assets: src, store: store}

	// Accept the per-entry payload but fail when Close() flushes the central
	// directory record — exactly the truncated-ZIP scenario F-028 describes.
	w := &errWriter{acceptAfter: 0}
	err := svc.WriteSelectedZIP(context.Background(), []uuid.UUID{a1.ID}, w)
	if err == nil {
		t.Fatal("expected WriteSelectedZIP to surface the zip Close() error, got nil (truncated-ZIP bug)")
	}
}

func TestF028_WriteZipWithProgressSurfacesCloseError(t *testing.T) {
	a1 := newAsset("photo.png", "k1")
	src := &countingAssetSource{byID: map[uuid.UUID]*repository.Asset{a1.ID: a1}}
	store := &fakeStore{objects: map[string][]byte{"k1": bytes.Repeat([]byte("z"), 64)}}
	svc := &DownloadService{assets: src, store: store}

	w := &errWriter{acceptAfter: 0}
	err := svc.writeZipWithProgress(context.Background(), []uuid.UUID{a1.ID}, w, nil)
	if err == nil {
		t.Fatal("expected writeZipWithProgress to surface the zip Close() error, got nil (truncated-ZIP bug)")
	}
}

// ── helpers ──

func assertZipNames(t *testing.T, raw []byte, want []string) {
	t.Helper()
	zr, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		t.Fatalf("open produced zip: %v", err)
	}
	got := map[string]bool{}
	for _, f := range zr.File {
		got[f.Name] = true
	}
	for _, name := range want {
		if !got[name] {
			t.Errorf("zip missing entry %q (have %v)", name, got)
		}
	}
}

// Compile-time guard: ensure the JPEG-strip path used by WriteZIPWithPolicy
// keeps referencing the download policy package (so this test file fails to
// build if that integration is removed).
var _ = download.PolicyPrintSafe
var _ io.Writer = (*errWriter)(nil)
