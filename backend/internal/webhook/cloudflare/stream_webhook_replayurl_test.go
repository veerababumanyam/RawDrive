package cloudflare

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"
)

// newTestHandlerWithLogBuf builds a Handler wired only with a logger that
// writes to the returned buffer. extractReplayURL needs no repos/verifier,
// so the other dependencies are left nil to keep this a pure unit test and
// avoid colliding with fakes declared elsewhere in the package's tests.
func newTestHandlerWithLogBuf() (*Handler, *bytes.Buffer) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelWarn}))
	return NewHandler(nil, nil, nil, nil, logger), &buf
}

// TestF109_ExtractReplayURL_MalformedPayloadLogsWarn is the regression test for
// finding F-109: extractReplayURL previously discarded the json.Unmarshal error
// with `_ =` and returned "" on a malformed-but-nonempty payload, silently
// losing VOD replay URLs with no observable cause. It must now WARN-log on the
// unmarshal failure while still degrading gracefully to an empty string.
func TestF109_ExtractReplayURL_MalformedPayloadLogsWarn(t *testing.T) {
	h, buf := newTestHandlerWithLogBuf()

	// Nonempty but structurally invalid JSON (an array, not an object).
	got := h.extractReplayURL(json.RawMessage(`["not","an","object"]`))

	if got != "" {
		t.Fatalf("expected empty replay url on malformed payload, got %q", got)
	}

	logged := buf.String()
	if !strings.Contains(logged, "level=WARN") {
		t.Fatalf("expected a WARN log on unmarshal failure, got: %q", logged)
	}
	if !strings.Contains(logged, "replay_url_parse_failed") {
		t.Fatalf("expected alert field replay_url_parse_failed in log, got: %q", logged)
	}
}

// TestF109_ExtractReplayURL_ValidPayloadReturnsURL guards against
// over-correction: a well-formed payload must still yield the URL and emit no
// WARN noise.
func TestF109_ExtractReplayURL_ValidPayloadReturnsURL(t *testing.T) {
	h, buf := newTestHandlerWithLogBuf()

	got := h.extractReplayURL(json.RawMessage(`{"replayUrl":"https://cf.example/vod/abc.m3u8"}`))

	if got != "https://cf.example/vod/abc.m3u8" {
		t.Fatalf("expected replay url to be parsed, got %q", got)
	}
	if logged := buf.String(); strings.Contains(logged, "level=WARN") {
		t.Fatalf("expected no WARN log on valid payload, got: %q", logged)
	}
}

// TestF109_ExtractReplayURL_EmptyPayloadNoWarn confirms the pre-existing
// empty-payload guard still returns "" without logging (empty payload is a
// normal, expected case — not drift).
func TestF109_ExtractReplayURL_EmptyPayloadNoWarn(t *testing.T) {
	h, buf := newTestHandlerWithLogBuf()

	if got := h.extractReplayURL(nil); got != "" {
		t.Fatalf("expected empty replay url on empty payload, got %q", got)
	}
	if logged := buf.String(); strings.Contains(logged, "level=WARN") {
		t.Fatalf("expected no WARN log on empty payload, got: %q", logged)
	}
}
