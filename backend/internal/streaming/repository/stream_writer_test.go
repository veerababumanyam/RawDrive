package repository

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

func TestStreamWriter_MapAccessLevel(t *testing.T) {
	cases := []struct{ in, want string }{
		{"pin", "pin_protected"},
		{"link", "invite_only"},
		{"sso", "workspace_only"},
		{"bogus", "pin_protected"},
	}
	for _, c := range cases {
		if got := mapAccessLevel(c.in); got != c.want {
			t.Errorf("mapAccessLevel(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestStreamWriter_MapChatPolicy(t *testing.T) {
	cases := []struct{ in, want string }{
		{"off", "disabled"},
		{"authenticated", "subscribers_only"},
		{"open", "open"},
		{"x", "open"},
	}
	for _, c := range cases {
		if got := mapChatPolicy(c.in); got != c.want {
			t.Errorf("mapChatPolicy(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestStreamWriter_NullableUUID(t *testing.T) {
	if nullableUUID(uuid.Nil) != nil {
		t.Error("expected nil for zero UUID")
	}
	id := uuid.New()
	if nullableUUID(id) != id {
		t.Errorf("expected pass-through for non-zero UUID")
	}
}

// Nil-pool guard: ReleaseReservation with nil pool returns nil without panic.
func TestPgStreamWriter_ReleaseReservation_ZeroID_NoOp(t *testing.T) {
	w := &PgStreamWriter{pool: nil}
	if err := w.ReleaseReservation(context.Background(), uuid.Nil); err != nil {
		t.Errorf("err = %v", err)
	}
}
