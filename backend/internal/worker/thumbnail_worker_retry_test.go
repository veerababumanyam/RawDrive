package worker

// thumbnail_worker_retry_test.go — covers the decode-retry classify loop added
// in task H4. These are pure-logic tests: no DB, no B2, no external CLIs. A fake
// repo satisfies the additive retryableAssetRepository surface so the worker
// opts into the retry path, and a fake format-aware generator returns scripted
// transient/terminal decode errors.

import (
	"context"
	"errors"
	"io"
	"testing"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// fakeRetryRepo satisfies BOTH assetRepository and retryableAssetRepository so
// NewThumbnailWorker's type assertion wires the retry path. It records which
// failure-marker was invoked.
type fakeRetryRepo struct {
	assets []repository.Asset

	retryCount   int // returned by GetRetryCount
	transientHit bool
	terminalHit  bool
	transientMsg string
	terminalMsg  string

	// legacy path bookkeeping (must stay UNUSED on the decode-error path)
	status        map[uuid.UUID]string
	processingErr map[uuid.UUID]string
}

func (f *fakeRetryRepo) ListByStatus(context.Context, string, int) ([]repository.Asset, error) {
	return f.assets, nil
}
func (f *fakeRetryRepo) ListRetryable(context.Context, int) ([]repository.Asset, error) {
	return f.assets, nil
}
func (f *fakeRetryRepo) GetRetryCount(context.Context, uuid.UUID) (int, error) {
	return f.retryCount, nil
}
func (f *fakeRetryRepo) MarkTransientFailure(_ context.Context, _ uuid.UUID, reason string) error {
	f.transientHit = true
	f.transientMsg = reason
	return nil
}
func (f *fakeRetryRepo) MarkTerminalFailure(_ context.Context, _ uuid.UUID, reason string) error {
	f.terminalHit = true
	f.terminalMsg = reason
	return nil
}
func (f *fakeRetryRepo) UpdateStatus(_ context.Context, id uuid.UUID, status string) error {
	if f.status == nil {
		f.status = map[uuid.UUID]string{}
	}
	f.status[id] = status
	return nil
}
func (f *fakeRetryRepo) UpdateProcessingError(_ context.Context, id uuid.UUID, msg string) error {
	if f.processingErr == nil {
		f.processingErr = map[uuid.UUID]string{}
	}
	f.processingErr[id] = msg
	return nil
}
func (f *fakeRetryRepo) UpdateThumbnails(context.Context, uuid.UUID, map[string]string, string) error {
	return nil
}
func (f *fakeRetryRepo) UpdateDimensions(context.Context, uuid.UUID, int, int) error { return nil }

// fakeFormatGenerator satisfies formatAwareGenerator (and thumbnailGenerator) and
// returns a scripted decode error.
type fakeFormatGenerator struct {
	err       error
	gotFormat string
}

func (g *fakeFormatGenerator) GenerateAll(context.Context, string, io.Reader) (*service.ThumbnailResult, error) {
	return nil, g.err
}
func (g *fakeFormatGenerator) GenerateAllWithFormat(_ context.Context, _ string, format string, _ io.Reader) (*service.ThumbnailResult, error) {
	g.gotFormat = format
	return nil, g.err
}

func heicAsset() *repository.Asset {
	fmtTok := "heic"
	return &repository.Asset{
		ID:           uuid.New(),
		WorkspaceID:  uuid.New(),
		StorageKey:   "originals/photo.heic",
		ContentType:  "image/heic",
		Status:       "processing",
		DecodeFormat: &fmtTok,
	}
}

// TestThumbnailWorker_TransientDecodeErrorMarksTransient: a transient decode
// error within the retry budget reschedules with backoff (stays retryable) and
// does NOT dead-letter.
func TestThumbnailWorker_TransientDecodeErrorMarksTransient(t *testing.T) {
	asset := heicAsset()
	repo := &fakeRetryRepo{assets: []repository.Asset{*asset}, retryCount: 1}
	gen := &fakeFormatGenerator{err: &service.DecodeError{
		Err:       errors.New("signal: killed"),
		Transient: true,
	}}
	w := NewThumbnailWorker(repo, gen, fakeThumbStore{})

	w.processNextBatch(context.Background())

	if !repo.transientHit {
		t.Fatal("transient decode error must call MarkTransientFailure")
	}
	if repo.terminalHit {
		t.Fatal("transient decode error must NOT dead-letter")
	}
	// Decode format token was threaded through to the generator.
	if gen.gotFormat != "heic" {
		t.Fatalf("generator got format %q, want heic", gen.gotFormat)
	}
}

// TestThumbnailWorker_TerminalDecodeErrorMarksTerminal: a terminal (poison)
// decode error dead-letters immediately, regardless of remaining budget.
func TestThumbnailWorker_TerminalDecodeErrorMarksTerminal(t *testing.T) {
	asset := heicAsset()
	repo := &fakeRetryRepo{assets: []repository.Asset{*asset}, retryCount: 0}
	gen := &fakeFormatGenerator{err: &service.DecodeError{
		Err:       errors.New("unsupported image format \"xyz\""),
		Transient: false,
	}}
	w := NewThumbnailWorker(repo, gen, fakeThumbStore{})

	w.processNextBatch(context.Background())

	if !repo.terminalHit {
		t.Fatal("terminal decode error must call MarkTerminalFailure")
	}
	if repo.transientHit {
		t.Fatal("terminal decode error must NOT be rescheduled as transient")
	}
}

// TestThumbnailWorker_ExhaustedBudgetForcesTerminal: a transient error that has
// reached MaxDecodeRetries dead-letters rather than looping forever.
func TestThumbnailWorker_ExhaustedBudgetForcesTerminal(t *testing.T) {
	asset := heicAsset()
	repo := &fakeRetryRepo{assets: []repository.Asset{*asset}, retryCount: repository.MaxDecodeRetries}
	gen := &fakeFormatGenerator{err: &service.DecodeError{
		Err:       errors.New("i/o timeout"),
		Transient: true,
	}}
	w := NewThumbnailWorker(repo, gen, fakeThumbStore{})

	w.processNextBatch(context.Background())

	if !repo.terminalHit {
		t.Fatal("exhausted retry budget must force MarkTerminalFailure even for a transient error")
	}
	if repo.transientHit {
		t.Fatal("exhausted budget must NOT reschedule transiently")
	}
}

// TestThumbnailWorker_NonDecodeErrorKeepsLegacyPath: a storage download failure
// (NOT a decode error) keeps main's UpdateProcessingError + status='error' path
// and never touches the transient/terminal retry markers, even with the retry
// surface wired.
func TestThumbnailWorker_NonDecodeErrorKeepsLegacyPath(t *testing.T) {
	asset := heicAsset()
	repo := &fakeRetryRepo{assets: []repository.Asset{*asset}}
	gen := &fakeFormatGenerator{} // never reached — store.Get fails first
	w := NewThumbnailWorker(repo, gen, fakeThumbStore{getErr: errors.New("b2 object missing")})

	w.processNextBatch(context.Background())

	if repo.transientHit || repo.terminalHit {
		t.Fatal("a non-decode (storage) failure must not flow through the decode-retry loop")
	}
	if repo.status[asset.ID] != "error" {
		t.Fatalf("non-decode failure status = %q, want error", repo.status[asset.ID])
	}
	if repo.processingErr[asset.ID] == "" {
		t.Fatal("non-decode failure must persist a processing error reason (legacy path)")
	}
}

// TestThumbnailWorker_RetrySurfaceWiredOnlyForCapableRepo confirms the type
// assertion: a fake repo that does NOT implement retryableAssetRepository keeps
// retryRepo nil (legacy ListByStatus path). Uses the bytes import to keep the
// generator's reader realistic where needed.
func TestThumbnailWorker_RetrySurfaceWiredOnlyForCapableRepo(t *testing.T) {
	// fakeThumbAssetRepo (from thumbnail_worker_test.go) implements only
	// assetRepository, so retryRepo must stay nil.
	legacy := NewThumbnailWorker(&fakeThumbAssetRepo{}, fakeThumbnailGenerator{}, fakeThumbStore{})
	if legacy.retryRepo != nil {
		t.Fatal("a repo without the retry surface must leave retryRepo nil")
	}

	// fakeRetryRepo implements both, so retryRepo must be wired.
	capable := NewThumbnailWorker(&fakeRetryRepo{}, fakeThumbnailGenerator{}, fakeThumbStore{})
	if capable.retryRepo == nil {
		t.Fatal("a repo with the retry surface must wire retryRepo")
	}
}
