package handler

import (
	"os"
	"strings"
	"testing"
)

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

func TestEventsHandlerAuthDoesNotReadBearerTokenFromQuery(t *testing.T) {
	source, err := os.ReadFile("events_handler.go")
	if err != nil {
		t.Fatalf("read events_handler.go: %v", err)
	}
	body := string(source)
	if !strings.Contains(body, "auth.AccessTokenFromRequest") {
		t.Fatal("events stream must authenticate via Authorization/cookie helper")
	}
	if strings.Contains(body, `r.URL.Query().Get("token")`) {
		t.Fatal("events stream must not accept bearer access tokens from query strings")
	}
}
