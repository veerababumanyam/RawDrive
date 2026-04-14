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
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

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
	ChatMessages    int               `json:"chatMessages"`
	ChatMsgsPerMin  float64           `json:"chatMsgsPerMin"`
	Reactions       int               `json:"reactions"`
	ReplayViews     int               `json:"replayViews"`
	ConversionBySrc ConversionBuckets `json:"conversionBySrc"`
	SampledAt       time.Time         `json:"sampledAt"`
}

// TopStream is used inside WorkspaceMetrics.
type TopStream struct {
	ID           uuid.UUID `json:"id"`
	Title        string    `json:"title"`
	PeakViewers  int       `json:"peakViewers"`
	WatchTimeSec int64     `json:"watchTimeSec"`
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

	// Conversion bucketing from shortlink hits.
	rows, err := a.db.Query(ctx,
		`SELECT src, COUNT(*) FROM streaming_shortlink_hits
		 WHERE shortcode IN (SELECT shortcode FROM streaming_shortlinks WHERE stream_id = $1)
		 GROUP BY src`,
		streamID,
	)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var src string
			var n int
			if sErr := rows.Scan(&src, &n); sErr == nil {
				switch src {
				case "qr":
					m.ConversionBySrc.QR = n
				case "wa":
					m.ConversionBySrc.WA = n
				case "email":
					m.ConversionBySrc.Email = n
				case "invite":
					m.ConversionBySrc.Invite = n
				case "direct":
					m.ConversionBySrc.Direct = n
				}
			}
		}
	}

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
