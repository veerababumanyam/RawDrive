package jobs

import (
	"context"
	"testing"
	"time"

	"github.com/rawdrive/backend/internal/streaming/cf"
)

// TestReplayPurge_WritesRetentionAuditRow — after Tick, exactly one
// BatchAudit row with Job="replays" is written, counting purged streams.
func TestReplayPurge_WritesRetentionAuditRow(t *testing.T) {
	repo := &fakeRepo{expired: []cf.ReplayStream{mkExpired("s1", "v1"), mkExpired("s2", "v2")}}
	audit := &fakeAuditWriter{}
	j := newJob(t, repo, &fakeDeleter{}, time.Now())
	j.audit = audit
	if err := j.Tick(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(audit.batches) != 1 {
		t.Fatalf("audit rows = %d, want 1", len(audit.batches))
	}
	b := audit.batches[0]
	if b.Job != "replays" {
		t.Errorf("Job = %q, want replays", b.Job)
	}
	if b.Count != 2 {
		t.Errorf("Count = %d, want 2", b.Count)
	}
}

// TestReplayPurge_HonorsPlanTier_Professional30d — repo returns only rows
// whose replay_expires_at has passed; we model this by giving the repo a
// professional-tier stream stamped 31 days in the past. Since replay_expires_at
// is materialized at stream-end from plan_tier (migration 083), the repo's
// ListExpired returns it and the job must purge it.
func TestReplayPurge_HonorsPlanTier_Professional30d(t *testing.T) {
	now := time.Now()
	past := now.Add(-31 * 24 * time.Hour)
	stream := cf.ReplayStream{
		ID:              "s-pro",
		ReplayVideoID:   "v-pro",
		ReplayState:     "available",
		PlanTier:        "professional",
		ReplayExpiresAt: &past,
	}
	repo := &fakeRepo{expired: []cf.ReplayStream{stream}}
	j := newJob(t, repo, &fakeDeleter{}, now)
	j.audit = &fakeAuditWriter{}
	if err := j.Tick(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(repo.expiredCalls) != 1 || repo.expiredCalls[0] != "s-pro" {
		t.Errorf("professional-tier 31d-old row should be purged; got %v", repo.expiredCalls)
	}
}

// TestReplayPurge_HonorsPlanTier_Business90d — business-tier streams only
// expire after 90 days; a 91d-old row from repo is purged.
func TestReplayPurge_HonorsPlanTier_Business90d(t *testing.T) {
	now := time.Now()
	past := now.Add(-91 * 24 * time.Hour)
	stream := cf.ReplayStream{
		ID:              "s-biz",
		ReplayVideoID:   "v-biz",
		ReplayState:     "available",
		PlanTier:        "business",
		ReplayExpiresAt: &past,
	}
	repo := &fakeRepo{expired: []cf.ReplayStream{stream}}
	audit := &fakeAuditWriter{}
	j := newJob(t, repo, &fakeDeleter{}, now)
	j.audit = audit
	if err := j.Tick(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(repo.expiredCalls) != 1 {
		t.Errorf("business-tier 91d-old row should be purged; got %d calls", len(repo.expiredCalls))
	}
	if len(audit.batches) != 1 || audit.batches[0].Count != 1 {
		t.Errorf("expected audit row count=1; got %+v", audit.batches)
	}
}
