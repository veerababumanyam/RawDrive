package cf

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"
)

// ---- fake repo --------------------------------------------------------------

type fakeReplayRepo struct {
	mu         sync.Mutex
	byUID      map[string]*ReplayStream
	readyCalls []struct {
		streamID, replayURL, videoID string
		expiresAt                    time.Time
	}
	expiredCalls []string
	listResult   []ReplayStream
	getErr       error
	readyErr     error
}

func newFakeReplayRepo() *fakeReplayRepo {
	return &fakeReplayRepo{byUID: map[string]*ReplayStream{}}
}

func (r *fakeReplayRepo) GetByCFUID(ctx context.Context, uid string) (*ReplayStream, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.getErr != nil {
		return nil, r.getErr
	}
	return r.byUID[uid], nil
}

func (r *fakeReplayRepo) UpdateReplayReady(ctx context.Context, id, url, videoID string, exp time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.readyErr != nil {
		return r.readyErr
	}
	r.readyCalls = append(r.readyCalls, struct {
		streamID, replayURL, videoID string
		expiresAt                    time.Time
	}{id, url, videoID, exp})
	// Reflect into byUID for idempotency tests
	for _, st := range r.byUID {
		if st.ID == id {
			st.ReplayState = "available"
			e := exp
			st.ReplayExpiresAt = &e
		}
	}
	return nil
}

func (r *fakeReplayRepo) UpdateReplayExpired(ctx context.Context, id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.expiredCalls = append(r.expiredCalls, id)
	return nil
}

func (r *fakeReplayRepo) ListExpired(ctx context.Context, now time.Time, limit int) ([]ReplayStream, error) {
	return r.listResult, nil
}

// ---- tests: OnRecordingReady -----------------------------------------------

func newReplayService(t *testing.T, now time.Time, repo *fakeReplayRepo) *ReplayService {
	t.Helper()
	s := NewReplayService(repo, DefaultPlanResolver{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	s.clock = func() time.Time { return now }
	return s
}

// T-S6-01 — Standard plan → 30-day retention
func TestOnRecordingReady_Standard_30dExpiry(t *testing.T) {
	now := time.Date(2026, 5, 1, 12, 0, 0, 0, time.UTC)
	repo := newFakeReplayRepo()
	repo.byUID["u"] = &ReplayStream{ID: "s1", CFUID: "u", PlanTier: "standard"}
	s := newReplayService(t, now, repo)

	if err := s.OnRecordingReady(context.Background(), "u", "vid-1", "https://rp"); err != nil {
		t.Fatal(err)
	}
	if len(repo.readyCalls) != 1 {
		t.Fatalf("ready calls = %d", len(repo.readyCalls))
	}
	want := now.Add(30 * 24 * time.Hour)
	if !repo.readyCalls[0].expiresAt.Equal(want) {
		t.Errorf("exp = %v, want %v", repo.readyCalls[0].expiresAt, want)
	}
}

// T-S6-02 — Professional → 90 days
func TestOnRecordingReady_Professional_90dExpiry(t *testing.T) {
	now := time.Date(2026, 5, 1, 12, 0, 0, 0, time.UTC)
	repo := newFakeReplayRepo()
	repo.byUID["u"] = &ReplayStream{ID: "s1", CFUID: "u", PlanTier: "professional"}
	s := newReplayService(t, now, repo)
	_ = s.OnRecordingReady(context.Background(), "u", "v", "r")
	want := now.Add(90 * 24 * time.Hour)
	if !repo.readyCalls[0].expiresAt.Equal(want) {
		t.Errorf("exp = %v, want %v", repo.readyCalls[0].expiresAt, want)
	}
}

// T-S6-03 — Enterprise → 365 days
func TestOnRecordingReady_Enterprise_365dExpiry(t *testing.T) {
	now := time.Date(2026, 5, 1, 12, 0, 0, 0, time.UTC)
	repo := newFakeReplayRepo()
	repo.byUID["u"] = &ReplayStream{ID: "s1", CFUID: "u", PlanTier: "enterprise"}
	s := newReplayService(t, now, repo)
	_ = s.OnRecordingReady(context.Background(), "u", "v", "r")
	want := now.Add(365 * 24 * time.Hour)
	if !repo.readyCalls[0].expiresAt.Equal(want) {
		t.Errorf("exp = %v", repo.readyCalls[0].expiresAt)
	}
}

// T-S6-04 — Unknown plan → defaults to standard
func TestOnRecordingReady_UnknownPlan_DefaultsStandard_Logs(t *testing.T) {
	now := time.Date(2026, 5, 1, 12, 0, 0, 0, time.UTC)
	repo := newFakeReplayRepo()
	repo.byUID["u"] = &ReplayStream{ID: "s1", CFUID: "u", PlanTier: "mystery"}
	s := newReplayService(t, now, repo)
	_ = s.OnRecordingReady(context.Background(), "u", "v", "r")
	want := now.Add(30 * 24 * time.Hour)
	if !repo.readyCalls[0].expiresAt.Equal(want) {
		t.Errorf("exp = %v, want %v (standard default)", repo.readyCalls[0].expiresAt, want)
	}
}

// T-S6-05 — Idempotent: second call no-op
func TestOnRecordingReady_Idempotent(t *testing.T) {
	now := time.Date(2026, 5, 1, 12, 0, 0, 0, time.UTC)
	repo := newFakeReplayRepo()
	repo.byUID["u"] = &ReplayStream{ID: "s1", CFUID: "u", PlanTier: "standard"}
	s := newReplayService(t, now, repo)

	_ = s.OnRecordingReady(context.Background(), "u", "v", "r")
	_ = s.OnRecordingReady(context.Background(), "u", "v", "r")
	if len(repo.readyCalls) != 1 {
		t.Errorf("ready calls = %d, want 1 (idempotent)", len(repo.readyCalls))
	}
}

// T-S6-06 — Unknown stream wraps error
func TestOnRecordingReady_UnknownStream_WrapsError(t *testing.T) {
	now := time.Date(2026, 5, 1, 12, 0, 0, 0, time.UTC)
	repo := newFakeReplayRepo()
	s := newReplayService(t, now, repo)
	err := s.OnRecordingReady(context.Background(), "ghost", "v", "r")
	if err == nil {
		t.Fatal("expected error")
	}
}

// IsExpired helper tests
func TestIsExpired_Behavior(t *testing.T) {
	now := time.Date(2026, 5, 1, 12, 0, 0, 0, time.UTC)
	repo := newFakeReplayRepo()
	s := newReplayService(t, now, repo)

	past := now.Add(-time.Hour)
	future := now.Add(time.Hour)
	if !s.IsExpired(&ReplayStream{ReplayExpiresAt: &past}) {
		t.Error("past should be expired")
	}
	if s.IsExpired(&ReplayStream{ReplayExpiresAt: &future}) {
		t.Error("future should not be expired")
	}
	if s.IsExpired(&ReplayStream{ReplayExpiresAt: nil}) {
		t.Error("nil expiry should not be expired (no replay yet)")
	}
}

// Repo get error propagates
func TestOnRecordingReady_RepoError(t *testing.T) {
	now := time.Date(2026, 5, 1, 12, 0, 0, 0, time.UTC)
	repo := newFakeReplayRepo()
	repo.getErr = errors.New("db down")
	s := newReplayService(t, now, repo)
	if err := s.OnRecordingReady(context.Background(), "u", "v", "r"); err == nil {
		t.Fatal("expected error")
	}
}
