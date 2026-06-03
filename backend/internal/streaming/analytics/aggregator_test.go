package analytics_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/streaming/analytics"
)

// M34-R2-T005 (contract shape) — StreamMetrics JSON tags match the PRD API
// contract. This locks the public surface at compile+serialize time so the
// integration SQL tests can focus on numeric correctness.
func TestStreamMetrics_JSONContract(t *testing.T) {
	m := analytics.StreamMetrics{
		StreamID:        uuid.MustParse("11111111-1111-1111-1111-111111111111"),
		PeakViewers:     142,
		UniqueViewers:   389,
		WatchTimeSec:    68432,
		AvgWatchTimeSec: 176,
		ChatMessages:    512,
		ChatMsgsPerMin:  4.8,
		Reactions:       1023,
		ReplayViews:     87,
		ConversionBySrc: analytics.ConversionBuckets{
			QR: 120, WA: 45, Email: 12, Invite: 67, Direct: 145,
		},
		SampledAt: time.Date(2026, 4, 14, 0, 0, 0, 0, time.UTC),
	}
	b, err := analytics.MarshalStreamMetrics(m)
	require.NoError(t, err)

	var raw map[string]any
	require.NoError(t, json.Unmarshal(b, &raw))

	for _, key := range []string{
		"streamId", "peakViewers", "uniqueViewers", "watchTimeSec",
		"avgWatchTimeSec",
		"chatMessages", "chatMsgsPerMin", "reactions", "replayViews",
		"conversionBySrc", "sampledAt",
	} {
		_, ok := raw[key]
		assert.True(t, ok, "StreamMetrics JSON must include %q", key)
	}

	conv := raw["conversionBySrc"].(map[string]any)
	for _, key := range []string{"qr", "wa", "email", "invite", "direct"} {
		_, ok := conv[key]
		assert.True(t, ok, "conversionBySrc must include %q", key)
	}
}

// M34-R2-T007 (contract shape) — WorkspaceMetrics JSON tags.
func TestWorkspaceMetrics_JSONContract(t *testing.T) {
	m := analytics.WorkspaceMetrics{
		Month:           "2026-04",
		StreamsCount:    12,
		CreditsConsumed: 4350,
		TopStreams: []analytics.TopStream{
			{ID: uuid.New(), Title: "S1", PeakViewers: 200, WatchTimeSec: 3600},
		},
		ByDayCredits: []analytics.DayCredits{
			{Date: "2026-04-01", Credits: 100},
		},
	}
	b, err := json.Marshal(m)
	require.NoError(t, err)
	var raw map[string]any
	require.NoError(t, json.Unmarshal(b, &raw))
	for _, key := range []string{"month", "streamsCount", "creditsConsumed", "topStreams", "byDayCredits"} {
		_, ok := raw[key]
		assert.True(t, ok, "WorkspaceMetrics JSON must include %q", key)
	}

	top := raw["topStreams"].([]any)[0].(map[string]any)
	for _, key := range []string{"id", "title", "peakViewers", "watchTimeSec"} {
		_, ok := top[key]
		assert.True(t, ok, "topStream must include %q", key)
	}
}

// M34-R2-T007b — month window resolution.
func TestWorkspaceMetrics_MonthFormat(t *testing.T) {
	m := analytics.WorkspaceMetrics{Month: "2026-04"}
	assert.Equal(t, "2026-04", m.Month)
	// Ensure month parses via standard Go layout used by the handler.
	ts, err := time.Parse("2006-01", m.Month)
	require.NoError(t, err)
	assert.Equal(t, 2026, ts.Year())
	assert.Equal(t, time.April, ts.Month())
}

// --- M35-6 (Round 2) — extended analytics fields -----------------------------

// M35-6-T001 — AvgWatchTimeSec is server-computed = watchTime / max(unique, 1).
func TestComputeAvgWatchTimeSec_Normal(t *testing.T) {
	got := analytics.ComputeAvgWatchTimeSec(68432, 389)
	assert.Equal(t, int64(175), got)
}

// M35-6-T002 — Div-by-zero guard: uniqueViewers=0 → 0, no panic.
func TestComputeAvgWatchTimeSec_ZeroUnique(t *testing.T) {
	got := analytics.ComputeAvgWatchTimeSec(12345, 0)
	assert.Equal(t, int64(0), got)
}

// M35-6-T003 — ChatMsgsPerMin: count / minutes elapsed, zeroed when duration<=0.
func TestComputeChatRatePerMinute_Normal(t *testing.T) {
	dur := 4 * time.Minute
	got := analytics.ComputeChatRatePerMinute(10, dur)
	assert.InDelta(t, 2.5, got, 0.001)
}

func TestComputeChatRatePerMinute_ZeroDuration(t *testing.T) {
	assert.Equal(t, 0.0, analytics.ComputeChatRatePerMinute(10, 0))
	assert.Equal(t, 0.0, analytics.ComputeChatRatePerMinute(10, -1*time.Second))
}

// M35-6-T004 — Conversion src whitelist: known src lands in its bucket,
// unknown src is bucketed into "direct" (the catch-all for untagged traffic).
// Per spec the ConversionBuckets struct has five fixed fields; any src not in
// {qr, wa, email, invite, direct} is dropped into "direct" to avoid silent
// loss.
func TestBucketConversionSrc_Known(t *testing.T) {
	buckets := analytics.BucketConversionSrc(map[string]int{
		"qr":     4,
		"wa":     2,
		"email":  1,
		"invite": 3,
		"direct": 5,
	})
	assert.Equal(t, 4, buckets.QR)
	assert.Equal(t, 2, buckets.WA)
	assert.Equal(t, 1, buckets.Email)
	assert.Equal(t, 3, buckets.Invite)
	assert.Equal(t, 5, buckets.Direct)
}

func TestBucketConversionSrc_UnknownFallsThroughToDirect(t *testing.T) {
	buckets := analytics.BucketConversionSrc(map[string]int{
		"qr":       1,
		"tiktok":   7, // unknown
		"":         3, // empty
		"direct":   2,
		"facebook": 5, // unknown
	})
	assert.Equal(t, 1, buckets.QR)
	// Unknown sources collapse into Direct (2 known + 7 + 3 + 5 unknown = 17).
	assert.Equal(t, 17, buckets.Direct)
}

// M35-6-T005 — WorkspaceMetrics carries the fields the dashboard widget needs:
// month-window streams, credits, and top streams. These are already in the
// contract — re-lock them for M35-6 regression.
func TestWorkspaceMetrics_IncludesMonthlyStreamsCreditsTop(t *testing.T) {
	id := uuid.New()
	ended := time.Date(2026, 4, 10, 12, 0, 0, 0, time.UTC)
	m := analytics.WorkspaceMetrics{
		Month:           "2026-04",
		StreamsCount:    7,
		CreditsConsumed: 4350,
		TopStreams: []analytics.TopStream{
			{ID: id, Title: "A", PeakViewers: 200, WatchTimeSec: 3600, ChatMessages: 42, EndedAt: &ended},
		},
	}
	b, err := json.Marshal(m)
	require.NoError(t, err)
	var raw map[string]any
	require.NoError(t, json.Unmarshal(b, &raw))
	assert.EqualValues(t, 7, raw["streamsCount"])
	assert.EqualValues(t, 4350, raw["creditsConsumed"])
	top := raw["topStreams"].([]any)[0].(map[string]any)
	for _, k := range []string{"id", "title", "peakViewers", "watchTimeSec", "chatMessages", "endedAt"} {
		_, ok := top[k]
		assert.True(t, ok, "topStream must include %q", k)
	}
}

// M35-6-T006 — Cross-workspace isolation: ForStream-style aggregator call with
// a mismatched workspace returns ErrCrossWorkspace without touching the DB.
// This is a pure-guard check; the full SQL path is covered in handler tests.
func TestStreamMetricsForWorkspace_CrossWorkspaceGuard(t *testing.T) {
	a := analytics.New(nil) // nil pool — guard must fire before any query.
	_, err := a.StreamMetricsForWorkspace(
		contextTODO(),
		uuid.New(), // stream id
		uuid.New(), // caller workspace id
		uuid.New(), // actual owner — different
	)
	assert.ErrorIs(t, err, analytics.ErrCrossWorkspace)
}

// small helper to avoid context import churn in the fixture above.
func contextTODO() context.Context { return context.Background() }
