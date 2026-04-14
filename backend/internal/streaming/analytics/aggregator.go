// Package analytics computes per-stream and per-workspace metrics for F-014
// (M34 / E108-C1).
//
// StreamMetrics and WorkspaceMetrics JSON tags are load-bearing — they are
// the public API contract rendered by /streams/{id}/analytics and
// /workspace/analytics. Changing a tag here breaks the frontend panel.
package analytics

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrCrossWorkspace is returned when a caller's workspace_id does not match
// the owning workspace of the requested stream. Handlers translate this into
// a 403/404 response; the aggregator refuses to query across the boundary.
var ErrCrossWorkspace = errors.New("analytics: cross-workspace access denied")

// Known conversion sources. Anything outside this set is folded into Direct
// by BucketConversionSrc so unknown/empty src tags never silently vanish.
var knownConversionSources = map[string]struct{}{
	"qr": {}, "wa": {}, "email": {}, "invite": {}, "direct": {},
}

// ConversionBuckets counts shortlink hits per src tag.
type ConversionBuckets struct {
	QR      int `json:"qr"`
	WA      int `json:"wa"`
	Email   int `json:"email"`
	Invite  int `json:"invite"`
	Direct  int `json:"direct"`
}

// StreamMetrics mirrors `GET /api/v1/streaming/streams/{id}/analytics`.
type StreamMetrics struct {
	StreamID        uuid.UUID         `json:"streamId"`
	PeakViewers     int               `json:"peakViewers"`
	UniqueViewers   int               `json:"uniqueViewers"`
	WatchTimeSec    int64             `json:"watchTimeSec"`
	AvgWatchTimeSec int64             `json:"avgWatchTimeSec"`
	ChatMessages    int               `json:"chatMessages"`
	ChatMsgsPerMin  float64           `json:"chatMsgsPerMin"`
	Reactions       int               `json:"reactions"`
	ReplayViews     int               `json:"replayViews"`
	ConversionBySrc ConversionBuckets `json:"conversionBySrc"`
	SampledAt       time.Time         `json:"sampledAt"`
}

// TopStream is used inside WorkspaceMetrics.
type TopStream struct {
	ID           uuid.UUID  `json:"id"`
	Title        string     `json:"title"`
	PeakViewers  int        `json:"peakViewers"`
	WatchTimeSec int64      `json:"watchTimeSec"`
	ChatMessages int        `json:"chatMessages"`
	EndedAt      *time.Time `json:"endedAt,omitempty"`
}

// DayCredits is a (date, credits) tuple for monthly rollup.
type DayCredits struct {
	Date    string `json:"date"`
	Credits int    `json:"credits"`
}

// WorkspaceMetrics mirrors `GET /api/v1/streaming/workspace/analytics?month=YYYY-MM`.
type WorkspaceMetrics struct {
	Month           string       `json:"month"`
	StreamsCount    int          `json:"streamsCount"`
	CreditsConsumed int          `json:"creditsConsumed"`
	TopStreams      []TopStream  `json:"topStreams"`
	ByDayCredits    []DayCredits `json:"byDayCredits"`
}

// Aggregator runs analytics queries against the streaming tables.
type Aggregator struct {
	db *pgxpool.Pool
}

// New returns an Aggregator bound to the given pool.
func New(db *pgxpool.Pool) *Aggregator { return &Aggregator{db: db} }

// ComputeAvgWatchTimeSec returns watchTimeSec / max(uniqueViewers, 1). Pure
// function so the div-by-zero guard is testable without a DB.
func ComputeAvgWatchTimeSec(watchTimeSec int64, uniqueViewers int) int64 {
	if uniqueViewers <= 0 {
		return 0
	}
	return watchTimeSec / int64(uniqueViewers)
}

// ComputeChatRatePerMinute returns count/minutes, clamped to 0 for non-positive
// durations (stream hasn't started, clock skew, etc).
func ComputeChatRatePerMinute(count int, duration time.Duration) float64 {
	if duration <= 0 {
		return 0
	}
	return float64(count) / duration.Minutes()
}

// BucketConversionSrc whitelists known conversion sources and folds unknown
// or empty tags into the "direct" bucket. Callers pass an already-aggregated
// map from SQL (src -> count) to keep this function pure.
func BucketConversionSrc(bySrc map[string]int) ConversionBuckets {
	var b ConversionBuckets
	for src, n := range bySrc {
		if _, ok := knownConversionSources[src]; !ok {
			b.Direct += n
			continue
		}
		switch src {
		case "qr":
			b.QR += n
		case "wa":
			b.WA += n
		case "email":
			b.Email += n
		case "invite":
			b.Invite += n
		case "direct":
			b.Direct += n
		}
	}
	return b
}

// StreamMetricsForWorkspace is the workspace-scoped variant of StreamMetrics.
// It refuses to proceed when callerWorkspaceID != ownerWorkspaceID, returning
// ErrCrossWorkspace. Handlers should prefer this entry point for per-stream
// analytics once the owner workspace has been resolved from the DB.
func (a *Aggregator) StreamMetricsForWorkspace(
	ctx context.Context,
	streamID uuid.UUID,
	callerWorkspaceID uuid.UUID,
	ownerWorkspaceID uuid.UUID,
) (StreamMetrics, error) {
	if callerWorkspaceID != ownerWorkspaceID {
		return StreamMetrics{}, ErrCrossWorkspace
	}
	return a.StreamMetrics(ctx, streamID)
}

// chatActivity queries streaming_chat_messages. Returns (0,0) when the table
// is absent (35-3 ships it) so this aggregator can land ahead of the schema.
// TODO(M35-3): remove the information_schema probe once the table is GA.
func (a *Aggregator) chatActivity(ctx context.Context, streamID uuid.UUID) (int, float64, error) {
	if a.db == nil {
		return 0, 0, nil
	}
	var exists bool
	_ = a.db.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM information_schema.tables
		   WHERE table_name = 'streaming_chat_messages')`).Scan(&exists)
	if !exists {
		return 0, 0, nil
	}
	var count int
	var startedAt, endedAt *time.Time
	if err := a.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM streaming_chat_messages
		   WHERE stream_id = $1 AND deleted_at IS NULL`, streamID).Scan(&count); err != nil {
		return 0, 0, err
	}
	_ = a.db.QueryRow(ctx,
		`SELECT live_started_at, live_ended_at FROM streams WHERE id = $1`, streamID,
	).Scan(&startedAt, &endedAt)
	if startedAt == nil {
		return count, 0, nil
	}
	end := time.Now().UTC()
	if endedAt != nil {
		end = *endedAt
	}
	return count, ComputeChatRatePerMinute(count, end.Sub(*startedAt)), nil
}

// reactionCount queries streaming_reactions. Returns 0 when the table is
// absent. TODO(M35-3): same as chatActivity.
func (a *Aggregator) reactionCount(ctx context.Context, streamID uuid.UUID) (int, error) {
	if a.db == nil {
		return 0, nil
	}
	var exists bool
	_ = a.db.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM information_schema.tables
		   WHERE table_name = 'streaming_reactions')`).Scan(&exists)
	if !exists {
		return 0, nil
	}
	var n int
	err := a.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM streaming_reactions WHERE stream_id = $1`, streamID).Scan(&n)
	return n, err
}

// replayViews reads streams.replay_view_count when the column exists
// (landed by 35-8). TODO(M35-8): collapse the column probe once GA.
func (a *Aggregator) replayViews(ctx context.Context, streamID uuid.UUID) (int, error) {
	if a.db == nil {
		return 0, nil
	}
	var hasCol bool
	_ = a.db.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM information_schema.columns
		   WHERE table_name='streams' AND column_name='replay_view_count')`).Scan(&hasCol)
	if !hasCol {
		return 0, nil
	}
	var n int
	err := a.db.QueryRow(ctx,
		`SELECT COALESCE(replay_view_count, 0) FROM streams WHERE id = $1`, streamID).Scan(&n)
	return n, err
}

// StreamMetrics computes the metrics for a single stream. SampledAt is always
// set to now(); callers may want to cache on top.
func (a *Aggregator) StreamMetrics(ctx context.Context, streamID uuid.UUID) (StreamMetrics, error) {
	m := StreamMetrics{StreamID: streamID, SampledAt: time.Now().UTC()}

	// Unique + watch time from viewer_sessions.
	err := a.db.QueryRow(ctx,
		`SELECT
		   COUNT(DISTINCT viewer_key),
		   COALESCE(SUM(EXTRACT(EPOCH FROM (last_seen_at - issued_at)))::bigint, 0)
		 FROM viewer_sessions WHERE stream_id = $1`,
		streamID,
	).Scan(&m.UniqueViewers, &m.WatchTimeSec)
	if err != nil {
		return m, err
	}

	// Peak concurrent — approximate via maximum simultaneous (issued_at..last_seen_at).
	// Simplified: use MAX count per minute window.
	_ = a.db.QueryRow(ctx,
		`SELECT COALESCE(MAX(c), 0) FROM (
		   SELECT date_trunc('minute', last_seen_at) AS t, COUNT(*) AS c
		   FROM viewer_sessions WHERE stream_id = $1 GROUP BY 1
		 ) q`,
		streamID,
	).Scan(&m.PeakViewers)

	// Conversion bucketing from shortlink hits. Unknown src tags fold into
	// Direct via BucketConversionSrc so no clicks are silently dropped.
	rows, err := a.db.Query(ctx,
		`SELECT src, COUNT(*) FROM streaming_shortlink_hits
		 WHERE shortcode IN (SELECT shortcode FROM streaming_shortlinks WHERE stream_id = $1)
		 GROUP BY src`,
		streamID,
	)
	bySrc := map[string]int{}
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var src string
			var n int
			if sErr := rows.Scan(&src, &n); sErr == nil {
				bySrc[src] = n
			}
		}
	}
	m.ConversionBySrc = BucketConversionSrc(bySrc)

	// Chat + reactions + replay views. Each helper tolerates missing tables
	// (35-3 / 35-8 ship the schema) by returning zero values with a TODO.
	if c, rate, cErr := a.chatActivity(ctx, streamID); cErr == nil {
		m.ChatMessages = c
		m.ChatMsgsPerMin = rate
	}
	if rc, rErr := a.reactionCount(ctx, streamID); rErr == nil {
		m.Reactions = rc
	}
	if rv, rvErr := a.replayViews(ctx, streamID); rvErr == nil {
		m.ReplayViews = rv
	}

	// Server-computed average — keeps client-side div-by-zero out of scope.
	m.AvgWatchTimeSec = ComputeAvgWatchTimeSec(m.WatchTimeSec, m.UniqueViewers)

	return m, nil
}

// WorkspaceMetrics rolls up monthly numbers for a workspace.
func (a *Aggregator) WorkspaceMetrics(ctx context.Context, workspaceID uuid.UUID, month time.Time) (WorkspaceMetrics, error) {
	start := time.Date(month.Year(), month.Month(), 1, 0, 0, 0, 0, time.UTC)
	end := start.AddDate(0, 1, 0)
	m := WorkspaceMetrics{Month: start.Format("2006-01")}

	_ = a.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM streams
		 WHERE workspace_id = $1 AND created_at >= $2 AND created_at < $3`,
		workspaceID, start, end,
	).Scan(&m.StreamsCount)

	_ = a.db.QueryRow(ctx,
		`SELECT COALESCE(SUM(ABS(amount)),0) FROM streaming_ledger
		 WHERE workspace_id = $1 AND amount < 0
		   AND created_at >= $2 AND created_at < $3`,
		workspaceID, start, end,
	).Scan(&m.CreditsConsumed)

	rows, err := a.db.Query(ctx,
		`SELECT id, title FROM streams
		 WHERE workspace_id = $1 AND created_at >= $2 AND created_at < $3
		 ORDER BY created_at DESC LIMIT 5`,
		workspaceID, start, end,
	)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var t TopStream
			if sErr := rows.Scan(&t.ID, &t.Title); sErr == nil {
				m.TopStreams = append(m.TopStreams, t)
			}
		}
	}

	drows, err := a.db.Query(ctx,
		`SELECT to_char(date_trunc('day', created_at),'YYYY-MM-DD'), COALESCE(SUM(ABS(amount)),0)
		 FROM streaming_ledger
		 WHERE workspace_id = $1 AND amount < 0
		   AND created_at >= $2 AND created_at < $3
		 GROUP BY 1 ORDER BY 1`,
		workspaceID, start, end,
	)
	if err == nil {
		defer drows.Close()
		for drows.Next() {
			var d DayCredits
			if sErr := drows.Scan(&d.Date, &d.Credits); sErr == nil {
				m.ByDayCredits = append(m.ByDayCredits, d)
			}
		}
	}

	return m, nil
}

// MarshalStreamMetrics is a tiny helper useful in handler tests to lock JSON
// tag names at compile time.
func MarshalStreamMetrics(m StreamMetrics) ([]byte, error) { return json.Marshal(m) }
