package worker

// download_worker_test.go — pure-logic tests for the download worker.
// Repo-backed paths are covered by integration tests.

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
)

// fakeProcessor lets us drive processOne without real storage.
type fakeProcessor struct {
	callCount   int
	shouldFail  bool
	returnedURL string
	returnedN   int64
	lastJob     *repository.DownloadJob
}

func (f *fakeProcessor) ProcessJob(ctx context.Context, job *repository.DownloadJob, onProgress func(int)) (string, int64, error) {
	f.callCount++
	f.lastJob = job
	if f.shouldFail {
		return "", 0, errors.New("simulated failure")
	}
	if onProgress != nil {
		onProgress(50)
		onProgress(100)
	}
	return f.returnedURL, f.returnedN, nil
}

func TestDownloadWorker_StopIsIdempotent(t *testing.T) {
	w := &DownloadWorker{stopCh: make(chan struct{})}
	w.Stop()
	w.Stop() // second call must not panic on already-closed channel
}

func TestDownloadWorker_NilProcessorExitsFast(t *testing.T) {
	w := &DownloadWorker{stopCh: make(chan struct{})}
	// Start should return immediately because processor is nil.
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	w.Start(ctx) // would hang forever on a nil processor without the guard
}

func TestFakeProcessor_ReceivesProgress(t *testing.T) {
	fp := &fakeProcessor{returnedURL: "downloads/abc.zip", returnedN: 1234}
	var progressCalls []int
	job := &repository.DownloadJob{
		ID:       uuid.New(),
		AssetIDs: []uuid.UUID{uuid.New(), uuid.New()},
	}
	url, n, err := fp.ProcessJob(context.Background(), job, func(p int) {
		progressCalls = append(progressCalls, p)
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if url != "downloads/abc.zip" || n != 1234 {
		t.Errorf("unexpected return values: %q %d", url, n)
	}
	if len(progressCalls) != 2 {
		t.Errorf("want 2 progress calls, got %d", len(progressCalls))
	}
	if progressCalls[0] != 50 || progressCalls[1] != 100 {
		t.Errorf("progress values: want [50 100], got %v", progressCalls)
	}
}
