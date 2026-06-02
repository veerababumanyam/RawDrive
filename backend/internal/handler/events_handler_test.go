package handler

import "testing"

func TestSSEEventType_MapsWorkspaceScopedSubjectsToClientEvents(t *testing.T) {
	tests := []struct {
		subject string
		want    string
	}{
		{"asset.ready.22222222-2222-2222-2222-222222222222", "asset"},
		{"chat.message.22222222-2222-2222-2222-222222222222.11111111-1111-1111-1111-111111111111", "chat.message"},
		{"legacy.topic.123", "legacy.topic"},
		{"plain", "plain"},
	}
	for _, tt := range tests {
		t.Run(tt.subject, func(t *testing.T) {
			if got := sseEventType(tt.subject); got != tt.want {
				t.Fatalf("sseEventType(%q) = %q, want %q", tt.subject, got, tt.want)
			}
		})
	}
}
