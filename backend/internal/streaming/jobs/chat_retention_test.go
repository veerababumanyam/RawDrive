package jobs

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"
)

// ---- fakes ------------------------------------------------------------------

type fakeChatRepo struct {
	mu        sync.Mutex
	remaining int // rows that match the cutoff
	lastCut   time.Time
	calls     int
	err       error
}

func (r *fakeChatRepo) PurgeChatBefore(_ context.Context, cutoff time.Time, batch int, dryRun bool) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.calls++
	r.lastCut = cutoff
	if r.err != nil {
		return 0, r.err
	}
	if dryRun {
		// Mirror SQL repo: return count of matching rows, no deletion.
		return r.remaining, nil
	}
	n := r.remaining
	if n > batch {
		n = batch
	}
	r.remaining -= n
	return n, nil
}

type fakeAuditWriter struct {
	mu      sync.Mutex
	batches []BatchAudit
	err     error
}

func (a *fakeAuditWriter) WriteBatch(_ context.Context, b BatchAudit) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.err != nil {
		return a.err
	}
	a.batches = append(a.batches, b)
	return nil
}

func silentLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func fixedClock(t time.Time) func() time.Time { return func() time.Time { return t } }

// ---- tests ------------------------------------------------------------------

func TestChatRetention_DeletesOldMessages_90dPostStreamEnd(t *testing.T) {
	repo := &fakeChatRepo{remaining: 10}
	audit := &fakeAuditWriter{}
	now := time.Date(2026, 4, 14, 2, 15, 0, 0, time.UTC)
	j := NewChatRetentionJob(repo, audit, silentLogger())
	j.clock = fixedClock(now)

	if err := j.Run(context.Background()); err != nil {
		t.Fatalf("Run err: %v", err)
	}
	wantCutoff := now.Add(-90 * 24 * time.Hour)
	if !repo.lastCut.Equal(wantCutoff) {
		t.Errorf("cutoff = %v, want %v", repo.lastCut, wantCutoff)
	}
	if repo.remaining != 0 {
		t.Errorf("remaining = %d, want 0", repo.remaining)
	}
}

func TestChatRetention_Idempotent_RerunZeroRows(t *testing.T) {
	repo := &fakeChatRepo{remaining: 3}
	audit := &fakeAuditWriter{}
	j := NewChatRetentionJob(repo, audit, silentLogger())
	j.clock = fixedClock(time.Now())

	if err := j.Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := j.Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(audit.batches) != 2 {
		t.Fatalf("audit rows = %d, want 2", len(audit.batches))
	}
	if audit.batches[1].Count != 0 {
		t.Errorf("second run count = %d, want 0", audit.batches[1].Count)
	}
}

func TestChatRetention_WritesAuditRow_WithRowCount(t *testing.T) {
	repo := &fakeChatRepo{remaining: 7}
	audit := &fakeAuditWriter{}
	j := NewChatRetentionJob(repo, audit, silentLogger())
	j.clock = fixedClock(time.Now())

	if err := j.Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(audit.batches) != 1 {
		t.Fatalf("audit rows = %d, want 1", len(audit.batches))
	}
	b := audit.batches[0]
	if b.Job != "chat" {
		t.Errorf("Job = %q, want chat", b.Job)
	}
	if b.Count != 7 {
		t.Errorf("Count = %d, want 7", b.Count)
	}
	if b.DryRun {
		t.Error("DryRun should be false")
	}
}

func TestChatRetention_DryRun_DoesNotDelete(t *testing.T) {
	repo := &fakeChatRepo{remaining: 5}
	audit := &fakeAuditWriter{}
	j := NewChatRetentionJob(repo, audit, silentLogger())
	j.clock = fixedClock(time.Now())
	j.DryRun = true

	if err := j.Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	if repo.remaining != 5 {
		t.Errorf("remaining = %d, want 5 (no delete in dry-run)", repo.remaining)
	}
	if len(audit.batches) != 1 || !audit.batches[0].DryRun {
		t.Errorf("audit should record dry_run=true: %+v", audit.batches)
	}
}

func TestChatRetention_DryRun_CountReflectsRowsThatWouldBeDeleted(t *testing.T) {
	repo := &fakeChatRepo{remaining: 5}
	audit := &fakeAuditWriter{}
	j := NewChatRetentionJob(repo, audit, silentLogger())
	j.clock = fixedClock(time.Now())
	j.DryRun = true

	if err := j.Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	if repo.remaining != 5 {
		t.Errorf("remaining = %d, want 5 (no delete in dry-run)", repo.remaining)
	}
	if len(audit.batches) != 1 {
		t.Fatalf("audit rows = %d, want 1", len(audit.batches))
	}
	b := audit.batches[0]
	if !b.DryRun {
		t.Error("DryRun should be true")
	}
	if b.Count != 5 {
		t.Errorf("Count = %d, want 5 (rows that WOULD be deleted)", b.Count)
	}
}

func TestChatRetention_RepoError_Propagates(t *testing.T) {
	repo := &fakeChatRepo{err: errors.New("db down")}
	audit := &fakeAuditWriter{}
	j := NewChatRetentionJob(repo, audit, silentLogger())
	j.clock = fixedClock(time.Now())
	if err := j.Run(context.Background()); err == nil {
		t.Error("expected error")
	}
	// audit row still written with failure flag
	if len(audit.batches) != 1 {
		t.Errorf("audit rows = %d, want 1 (observability on failure)", len(audit.batches))
	}
}
