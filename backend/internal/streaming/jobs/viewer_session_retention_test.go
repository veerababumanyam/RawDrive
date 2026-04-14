package jobs

import (
	"context"
	"sync"
	"testing"
	"time"
)

type fakeViewerRepo struct {
	mu        sync.Mutex
	remaining int
	lastCut   time.Time
	calls     int
}

func (r *fakeViewerRepo) PurgeSessionsExpiredBefore(_ context.Context, cutoff time.Time, batch int, dryRun bool) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.calls++
	r.lastCut = cutoff
	if dryRun {
		// Mirror SQL repo: return matching-row count, no deletion.
		return r.remaining, nil
	}
	n := r.remaining
	if n > batch {
		n = batch
	}
	r.remaining -= n
	return n, nil
}

func TestViewerSessionRetention_Deletes_30dPostExpiry(t *testing.T) {
	repo := &fakeViewerRepo{remaining: 12}
	audit := &fakeAuditWriter{}
	now := time.Date(2026, 4, 14, 2, 30, 0, 0, time.UTC)
	j := NewViewerSessionRetentionJob(repo, audit, silentLogger())
	j.clock = fixedClock(now)

	if err := j.Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	wantCutoff := now.Add(-30 * 24 * time.Hour)
	if !repo.lastCut.Equal(wantCutoff) {
		t.Errorf("cutoff = %v, want %v", repo.lastCut, wantCutoff)
	}
	if repo.remaining != 0 {
		t.Errorf("remaining = %d, want 0", repo.remaining)
	}
}

func TestViewerSessionRetention_Idempotent(t *testing.T) {
	repo := &fakeViewerRepo{remaining: 4}
	audit := &fakeAuditWriter{}
	j := NewViewerSessionRetentionJob(repo, audit, silentLogger())
	j.clock = fixedClock(time.Now())

	if err := j.Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := j.Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(audit.batches) != 2 || audit.batches[1].Count != 0 {
		t.Errorf("second run should be zero-delete; batches=%+v", audit.batches)
	}
}

func TestViewerSessionRetention_DryRun_CountReflectsRowsThatWouldBeDeleted(t *testing.T) {
	repo := &fakeViewerRepo{remaining: 8}
	audit := &fakeAuditWriter{}
	j := NewViewerSessionRetentionJob(repo, audit, silentLogger())
	j.clock = fixedClock(time.Now())
	j.DryRun = true

	if err := j.Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	if repo.remaining != 8 {
		t.Errorf("remaining = %d, want 8 (no delete in dry-run)", repo.remaining)
	}
	if len(audit.batches) != 1 {
		t.Fatalf("audit rows = %d, want 1", len(audit.batches))
	}
	b := audit.batches[0]
	if !b.DryRun {
		t.Error("DryRun should be true")
	}
	if b.Count != 8 {
		t.Errorf("Count = %d, want 8 (rows that WOULD be deleted)", b.Count)
	}
}

func TestViewerSessionRetention_WritesAuditRow(t *testing.T) {
	repo := &fakeViewerRepo{remaining: 2}
	audit := &fakeAuditWriter{}
	j := NewViewerSessionRetentionJob(repo, audit, silentLogger())
	j.clock = fixedClock(time.Now())
	if err := j.Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(audit.batches) != 1 {
		t.Fatalf("audit rows = %d, want 1", len(audit.batches))
	}
	if audit.batches[0].Job != "viewer_sessions" {
		t.Errorf("Job = %q, want viewer_sessions", audit.batches[0].Job)
	}
	if audit.batches[0].Count != 2 {
		t.Errorf("Count = %d, want 2", audit.batches[0].Count)
	}
}
