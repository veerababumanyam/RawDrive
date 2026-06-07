package ai

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/face"
)

// fakeDetector is an in-memory faceDetector for the outage/empty-batch tests.
// It returns a per-asset (count, err) pair so a test can simulate a whole-batch
// sidecar outage (every call → ErrServiceUnavailable), a healthy-but-empty batch
// (every call → 0, nil), or a mixed batch (one real decode error among healthy
// calls).
type fakeDetector struct {
	// resultFor returns the (count, err) for a given asset index (0-based call
	// order). Lets a test shape per-asset outcomes deterministically.
	resultFor func(idx int) (int, error)
	calls     int
}

func (f *fakeDetector) DetectAndStore(_ context.Context, _, _ uuid.UUID, _ *uuid.UUID) (int, error) {
	idx := f.calls
	f.calls++
	if f.resultFor == nil {
		return 0, nil
	}
	return f.resultFor(idx)
}

// fakeJobWriter records the terminal disposition (done/failed) and result/error
// of a processed job without touching a database, so the worker decision logic
// is unit-testable hermetically.
type fakeJobWriter struct {
	mu         sync.Mutex
	doneResult map[string]any
	failedMsg  string
	done       bool
	failed     bool
}

func (w *fakeJobWriter) UpdateProgress(_ context.Context, _ uuid.UUID, _ string, _ int) error {
	return nil
}

func (w *fakeJobWriter) MarkDone(_ context.Context, _ uuid.UUID, result map[string]any) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.done = true
	w.doneResult = result
	return nil
}

func (w *fakeJobWriter) MarkFailed(_ context.Context, _ uuid.UUID, errMsg string) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.failed = true
	w.failedMsg = errMsg
	return nil
}

func newOutageTestJob(assetCount int) *AIJob {
	ids := make([]string, assetCount)
	for i := range ids {
		ids[i] = uuid.New().String()
	}
	return &AIJob{
		ID:          uuid.New(),
		WorkspaceID: uuid.New(),
		Type:        "face_detection",
		Status:      "running",
		Result:      map[string]any{"asset_ids": ids},
	}
}

// TestFaceWorker_WholeBatchSidecarOutage_MarksFailed is the headline guard:
// when EVERY asset call returns ErrServiceUnavailable (the sidecar is down for
// the whole batch), the job must NOT be marked done with faces_found:0 — it must
// be marked failed/retryable so transient downtime does not permanently complete
// an empty scan.
func TestFaceWorker_WholeBatchSidecarOutage_MarksFailed(t *testing.T) {
	det := &fakeDetector{
		resultFor: func(int) (int, error) {
			// Mirror how FaceService wraps the sidecar error.
			return 0, fmt.Errorf("face service: face-svc detect: %w", face.ErrServiceUnavailable)
		},
	}
	sink := &fakeJobWriter{}
	w := &FaceWorker{faceSvc: det, jobSink: sink}

	job := newOutageTestJob(5)
	err := w.processJob(context.Background(), job)

	if err == nil {
		t.Fatalf("whole-batch outage must return a non-nil error so the job is marked failed/retryable")
	}
	if !errors.Is(err, face.ErrServiceUnavailable) {
		t.Fatalf("outage error must wrap ErrServiceUnavailable, got: %v", err)
	}
	if sink.done {
		t.Fatalf("a whole-batch sidecar outage must NOT mark the job done")
	}
	// processNextBatch is responsible for the MarkFailed on a returned error.
	if _, ok := sink.doneResult["faces_found"]; ok {
		t.Fatalf("outage must not record a faces_found result")
	}
}

// TestFaceWorker_HealthyEmptyBatch_MarksDone proves we do NOT over-fire: a
// reachable sidecar that simply finds no faces (every call → 0, nil) must still
// complete done with faces_found:0.
func TestFaceWorker_HealthyEmptyBatch_MarksDone(t *testing.T) {
	det := &fakeDetector{
		resultFor: func(int) (int, error) { return 0, nil },
	}
	sink := &fakeJobWriter{}
	w := &FaceWorker{faceSvc: det, jobSink: sink}

	job := newOutageTestJob(4)
	if err := w.processJob(context.Background(), job); err != nil {
		t.Fatalf("healthy empty batch must not error, got: %v", err)
	}
	if sink.failed {
		t.Fatalf("a healthy empty batch must NOT be marked failed")
	}
	if !sink.done {
		t.Fatalf("a healthy empty batch must be marked done")
	}
	if got := sink.doneResult["faces_found"]; got != 0 {
		t.Fatalf("healthy empty batch faces_found = %v, want 0", got)
	}
	if got := sink.doneResult["processed"]; got != 4 {
		t.Fatalf("healthy empty batch processed = %v, want 4", got)
	}
}

// TestFaceWorker_SingleAssetDecodeError_StillDone proves the outage detector
// distinguishes a real per-asset error (e.g. a decode failure on ONE asset) from
// a whole-batch outage: a mostly-healthy batch with one non-outage error still
// completes done and tallies the healthy faces.
func TestFaceWorker_SingleAssetDecodeError_StillDone(t *testing.T) {
	det := &fakeDetector{
		resultFor: func(idx int) (int, error) {
			if idx == 2 {
				return 0, errors.New("face service: decode image: corrupt JPEG")
			}
			return 1, nil
		},
	}
	sink := &fakeJobWriter{}
	w := &FaceWorker{faceSvc: det, jobSink: sink}

	job := newOutageTestJob(5)
	if err := w.processJob(context.Background(), job); err != nil {
		t.Fatalf("a single non-outage asset error must not fail the whole job, got: %v", err)
	}
	if sink.failed {
		t.Fatalf("one bad asset must NOT mark the whole job failed")
	}
	if !sink.done {
		t.Fatalf("a mostly-healthy batch must be marked done")
	}
	if got := sink.doneResult["faces_found"]; got != 4 {
		t.Fatalf("faces_found = %v, want 4 (4 healthy assets × 1 face)", got)
	}
}

// TestFaceWorker_PartialOutageBelowThreshold_StillDone proves a single asset
// outage among healthy calls is treated as a per-asset blip, not a batch outage.
func TestFaceWorker_PartialOutageBelowThreshold_StillDone(t *testing.T) {
	det := &fakeDetector{
		resultFor: func(idx int) (int, error) {
			if idx == 0 {
				return 0, fmt.Errorf("face service: face-svc detect: %w", face.ErrServiceUnavailable)
			}
			return 2, nil
		},
	}
	sink := &fakeJobWriter{}
	w := &FaceWorker{faceSvc: det, jobSink: sink}

	job := newOutageTestJob(10)
	if err := w.processJob(context.Background(), job); err != nil {
		t.Fatalf("a single-asset outage blip must not fail a healthy batch, got: %v", err)
	}
	if !sink.done {
		t.Fatalf("batch with one outage blip and 9 healthy assets must be marked done")
	}
}
