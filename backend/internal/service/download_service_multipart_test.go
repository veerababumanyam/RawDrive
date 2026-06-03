package service

import (
	"archive/zip"
	"bytes"
	"context"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/storage"
)

// multipartFakeStore is an in-memory storage.Provider that ALSO implements
// storage.MultipartCapable, so ProcessJob takes the production streaming path
// (F-076) instead of buffering the ZIP to a local temp file. It records the
// multipart calls and reassembles the uploaded parts so the test can verify
// the streamed object is a valid ZIP.
type multipartFakeStore struct {
	fakeStore // embeds Get/Put/Delete/PresignURL/HealthCheck

	createCalls   int
	completeCalls int
	abortCalls    int

	uploadID  string
	parts     map[int32][]byte // partNumber -> bytes
	completed bool
	finalKey  string
}

func newMultipartFakeStore(objects map[string][]byte) *multipartFakeStore {
	return &multipartFakeStore{
		fakeStore: fakeStore{objects: objects},
		parts:     map[int32][]byte{},
	}
}

func (m *multipartFakeStore) CreateMultipartUpload(_ context.Context, key, _ string) (string, error) {
	m.createCalls++
	m.finalKey = key
	m.uploadID = "upload-" + key
	return m.uploadID, nil
}

func (m *multipartFakeStore) UploadPart(_ context.Context, _ string, _ string, partNumber int32, body io.Reader, _ int64) (string, error) {
	b, err := io.ReadAll(body)
	if err != nil {
		return "", err
	}
	m.parts[partNumber] = b
	return "etag-" + string(rune('0'+partNumber)), nil
}

func (m *multipartFakeStore) CompleteMultipartUpload(_ context.Context, key, _ string, parts []storage.CompletedPart) error {
	m.completeCalls++
	m.completed = true
	// Reassemble in part order and stash under the final key so the test can
	// read the streamed object back.
	var buf bytes.Buffer
	for _, p := range parts {
		buf.Write(m.parts[p.PartNumber])
	}
	if m.objects == nil {
		m.objects = map[string][]byte{}
	}
	m.objects[key] = buf.Bytes()
	return nil
}

func (m *multipartFakeStore) AbortMultipartUpload(_ context.Context, _ string, _ string) error {
	m.abortCalls++
	return nil
}

var _ storage.MultipartCapable = (*multipartFakeStore)(nil)
var _ storage.Provider = (*multipartFakeStore)(nil)

// tempZipCount counts leftover ProcessJob temp files in os.TempDir so the test
// can assert the streaming path never materializes the ZIP on local disk.
func tempZipCount(t *testing.T) int {
	t.Helper()
	matches, err := filepath.Glob(filepath.Join(os.TempDir(), "rawdrive-dl-*"))
	if err != nil {
		t.Fatalf("glob temp dir: %v", err)
	}
	return len(matches)
}

// TestF076_ProcessJobStreamsToMultipartWithoutTempFile is the regression test
// for F-076. Before the fix, ProcessJob ALWAYS wrote the full ZIP to an OS
// temp file (os.CreateTemp) before a single store.Put — risking /tmp ENOSPC
// on constrained pods under large/concurrent downloads. After the fix, when
// the provider is MultipartCapable (the production B2/S3 driver), the ZIP is
// streamed straight to object storage via CreateMultipartUpload/UploadPart/
// CompleteMultipartUpload through an io.Pipe and never touches local disk.
func TestF076_ProcessJobStreamsToMultipartWithoutTempFile(t *testing.T) {
	// Filenames with spaces/parens are intentional (repo rule): the ZIP path
	// must handle them just like tests/photos/ assets.
	a1 := newAsset("Wedding (42).jpg", "k1")
	a2 := newAsset("veera.jpg", "k2")

	src := &countingAssetSource{byID: map[uuid.UUID]*repository.Asset{a1.ID: a1, a2.ID: a2}}
	store := newMultipartFakeStore(map[string][]byte{
		"k1": bytes.Repeat([]byte("a"), 1024),
		"k2": bytes.Repeat([]byte("b"), 2048),
	})
	svc := &DownloadService{assets: src, store: store}

	job := &repository.DownloadJob{
		ID:        uuid.New(),
		GalleryID: uuid.New(),
		AssetIDs:  []uuid.UUID{a1.ID, a2.ID},
	}

	before := tempZipCount(t)

	key, size, err := svc.ProcessJob(context.Background(), job, nil)
	if err != nil {
		t.Fatalf("ProcessJob: %v", err)
	}

	// No temp file may be left behind, and (more importantly) the streaming
	// path must have been taken — proven by the multipart calls below.
	if after := tempZipCount(t); after != before {
		t.Errorf("ProcessJob leaked a temp ZIP file: before=%d after=%d", before, after)
	}

	// The streaming path must have driven the multipart lifecycle.
	if store.createCalls != 1 {
		t.Errorf("expected exactly 1 CreateMultipartUpload, got %d", store.createCalls)
	}
	if len(store.parts) < 1 {
		t.Errorf("expected at least 1 UploadPart, got %d", len(store.parts))
	}
	if store.completeCalls != 1 {
		t.Errorf("expected exactly 1 CompleteMultipartUpload, got %d", store.completeCalls)
	}
	if store.abortCalls != 0 {
		t.Errorf("expected 0 AbortMultipartUpload on the happy path, got %d", store.abortCalls)
	}

	// Returned key + size must match the streamed object.
	wantKey := "downloads/" + job.GalleryID.String() + "/" + job.ID.String() + ".zip"
	if key != wantKey {
		t.Errorf("storage key = %q, want %q", key, wantKey)
	}

	assembled := store.objects[key]
	if int64(len(assembled)) != size {
		t.Errorf("returned size %d != assembled bytes %d", size, len(assembled))
	}

	// The streamed object must be a valid ZIP containing both entries.
	zr, err := zip.NewReader(bytes.NewReader(assembled), int64(len(assembled)))
	if err != nil {
		t.Fatalf("streamed object is not a valid zip: %v", err)
	}
	got := map[string]bool{}
	for _, f := range zr.File {
		got[f.Name] = true
	}
	for _, name := range []string{"Wedding (42).jpg", "veera.jpg"} {
		if !got[name] {
			t.Errorf("streamed zip missing entry %q (have %v)", name, got)
		}
	}
}

// TestF076_ProcessJobFallsBackToTempFileWithoutMultipart proves backward
// compatibility: a provider that does NOT implement MultipartCapable still
// works via the single-PUT temp-file path. This guards against the fix
// breaking non-multipart providers (and documents that the fallback exists).
func TestF076_ProcessJobFallsBackToTempFileWithoutMultipart(t *testing.T) {
	a1 := newAsset("one.png", "k1")
	src := &countingAssetSource{byID: map[uuid.UUID]*repository.Asset{a1.ID: a1}}
	// Plain fakeStore is a Provider but NOT MultipartCapable.
	store := &fakeStore{objects: map[string][]byte{"k1": []byte("hello")}}
	svc := &DownloadService{assets: src, store: store}

	job := &repository.DownloadJob{
		ID:        uuid.New(),
		GalleryID: uuid.New(),
		AssetIDs:  []uuid.UUID{a1.ID},
	}

	key, size, err := svc.ProcessJob(context.Background(), job, nil)
	if err != nil {
		t.Fatalf("ProcessJob (fallback): %v", err)
	}
	if !strings.HasSuffix(key, ".zip") {
		t.Errorf("storage key %q should end in .zip", key)
	}

	// The single-PUT fallback must have written the object via Put.
	stored, ok := store.objects[key]
	if !ok {
		t.Fatalf("fallback path did not Put the object under %q", key)
	}
	if int64(len(stored)) != size {
		t.Errorf("returned size %d != stored bytes %d", size, len(stored))
	}
	zr, err := zip.NewReader(bytes.NewReader(stored), int64(len(stored)))
	if err != nil {
		t.Fatalf("fallback object is not a valid zip: %v", err)
	}
	if len(zr.File) != 1 || zr.File[0].Name != "one.png" {
		t.Errorf("fallback zip contents unexpected: %+v", zr.File)
	}
}
