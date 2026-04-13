// Package cloudflare receives and processes Cloudflare Stream webhook events.
//
// M33 / F-014 — Events arrive at POST /api/v1/webhooks/cloudflare-stream,
// are signature-verified, parsed into StreamEvent, and routed to the
// appropriate state transition. Unknown event types are logged and 200'd so
// Cloudflare does not retry.
package cloudflare

import (
	"encoding/json"
	"time"
)

// EventType is the canonical set of CF Stream events M33 handles.
type EventType string

const (
	EvtLiveInputConnected    EventType = "live_input.connected"
	EvtLiveInputDisconnected EventType = "live_input.disconnected"
	EvtLiveInputErrored      EventType = "live_input.errored"
	EvtRecordingReady        EventType = "recording.ready"
	EvtRecordingDeleted      EventType = "recording.deleted"
)

// StreamEvent is the decoded top-level webhook payload.
type StreamEvent struct {
	Type       EventType       `json:"type"`
	UID        string          `json:"uid"`               // live input UID
	VideoID    string          `json:"videoID,omitempty"` // recording-scoped events
	OccurredAt time.Time       `json:"occurredAt"`
	Payload    json.RawMessage `json:"payload,omitempty"`
}

// IsKnown reports whether the event type is one we intend to process.
func (e StreamEvent) IsKnown() bool {
	switch e.Type {
	case EvtLiveInputConnected, EvtLiveInputDisconnected, EvtLiveInputErrored,
		EvtRecordingReady, EvtRecordingDeleted:
		return true
	}
	return false
}
