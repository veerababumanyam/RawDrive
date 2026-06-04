package ai

import "testing"

// These tests pin the F-2 contract: the face worker's job-progress writes must
// NOT scale linearly with the number of assets. The worker previously wrote
// progress once per asset (an N+1 on large galleries, on top of a per-asset
// GetFacesByAsset count query); it now batches via shouldReportFaceProgress.

// TestShouldReportFaceProgress_BoundedWrites asserts the number of progress
// writes for a job is bounded by ceil(total/batch)+1, not total.
func TestShouldReportFaceProgress_BoundedWrites(t *testing.T) {
	for _, total := range []int{1, 7, 10, 100, 1000} {
		writes := 0
		for i := 0; i < total; i++ {
			if shouldReportFaceProgress(i, total) {
				writes++
			}
		}
		maxWrites := total/faceProgressBatchSize + 1
		if writes > maxWrites {
			t.Fatalf("total=%d: %d progress writes exceeds bounded max %d", total, writes, maxWrites)
		}
		// The final asset must always report so MarkDone sees accurate progress.
		if !shouldReportFaceProgress(total-1, total) {
			t.Fatalf("total=%d: the final asset must always report progress", total)
		}
		// Large jobs must beat the per-asset (N+1) baseline by a wide margin.
		if total >= 100 && writes >= total {
			t.Fatalf("total=%d: %d writes did not beat the per-asset baseline", total, writes)
		}
	}
}

// TestShouldReportFaceProgress_BatchCadence confirms the exact cadence and the
// headline reduction: 100 assets yield 10 progress writes, not 100.
func TestShouldReportFaceProgress_BatchCadence(t *testing.T) {
	const total = 100
	writes := 0
	for i := 0; i < total; i++ {
		want := (i+1)%faceProgressBatchSize == 0 || i == total-1
		got := shouldReportFaceProgress(i, total)
		if got != want {
			t.Fatalf("index=%d: got %v want %v", i, got, want)
		}
		if got {
			writes++
		}
	}
	if writes != total/faceProgressBatchSize {
		t.Fatalf("100 assets should yield %d batched writes, got %d", total/faceProgressBatchSize, writes)
	}
}
