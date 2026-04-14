package analytics_test

import (
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
		StreamID:       uuid.MustParse("11111111-1111-1111-1111-111111111111"),
		PeakViewers:    142,
		UniqueViewers:  389,
		WatchTimeSec:   68432,
		ChatMessages:   512,
		ChatMsgsPerMin: 4.8,
		Reactions:      1023,
		ReplayViews:    87,
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
