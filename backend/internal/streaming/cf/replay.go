package cf

import (
	"context"
	"errors"
	"log/slog"
	"time"
)

// ReplayRepo is the persistence surface for replay readiness.
type ReplayRepo interface {
	GetByCFUID(ctx context.Context, uid string) (*ReplayStream, error)
	UpdateReplayReady(ctx context.Context, streamID string, replayURL, videoID string, expiresAt time.Time) error
	UpdateReplayExpired(ctx context.Context, streamID string) error
	ListExpired(ctx context.Context, now time.Time, limit int) ([]ReplayStream, error)
}

// ReplayStream is the minimal record the service needs.
type ReplayStream struct {
	ID               string
	CFUID            string
	PlanTier         string // "standard" | "professional" | "enterprise"
	ReplayVideoID    string
	ReplayExpiresAt  *time.Time
	ReplayState      string
}

// PlanResolver maps plan tier to retention window.
type PlanResolver interface {
	RetentionFor(plan string) time.Duration
}

// DefaultPlanResolver returns 30d/90d/365d/standard-by-default retention.
type DefaultPlanResolver struct{}

var defaultRetention = map[string]time.Duration{
	"standard":     30 * 24 * time.Hour,
	"professional": 90 * 24 * time.Hour,
	"enterprise":   365 * 24 * time.Hour,
}

func (DefaultPlanResolver) RetentionFor(plan string) time.Duration {
	if d, ok := defaultRetention[plan]; ok {
		return d
	}
	return defaultRetention["standard"]
}

// ReplayService implements the webhook.ReplayReconciler contract for
// recording.ready and provides the IsExpired helper used by the playback
// handler to return 410 Gone ahead of the purge job.
type ReplayService struct {
	repo   ReplayRepo
	plans  PlanResolver
	clock  func() time.Time
	logger *slog.Logger
}

func NewReplayService(repo ReplayRepo, plans PlanResolver, logger *slog.Logger) *ReplayService {
	if plans == nil {
		plans = DefaultPlanResolver{}
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &ReplayService{repo: repo, plans: plans, clock: time.Now, logger: logger}
}

// OnRecordingReady is called from the webhook handler. It is idempotent —
// if the stream is already in replay_state=available with an expiry set,
// no update is made.
func (s *ReplayService) OnRecordingReady(ctx context.Context, uid, videoID, replayURL string) error {
	st, err := s.repo.GetByCFUID(ctx, uid)
	if err != nil {
		return err
	}
	if st == nil {
		return errors.New("replay: stream not found for cf uid")
	}
	if st.ReplayState == "available" && st.ReplayExpiresAt != nil {
		// Already reconciled — idempotent no-op.
		return nil
	}
	retention := s.plans.RetentionFor(st.PlanTier)
	if _, known := defaultRetention[st.PlanTier]; !known {
		s.logger.Warn("replay: unknown plan tier", "stream", st.ID, "plan", st.PlanTier)
	}
	expiresAt := s.clock().Add(retention)
	return s.repo.UpdateReplayReady(ctx, st.ID, replayURL, videoID, expiresAt)
}

// IsExpired reports whether the stream's replay has passed its retention.
// Used by the playback handler to serve 410 Gone even before the purge
// job runs.
func (s *ReplayService) IsExpired(st *ReplayStream) bool {
	if st == nil || st.ReplayExpiresAt == nil {
		return false
	}
	return s.clock().After(*st.ReplayExpiresAt)
}
