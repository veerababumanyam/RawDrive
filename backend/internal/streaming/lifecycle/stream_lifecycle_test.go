package lifecycle_test

import (
	"testing"

	"github.com/rawdrive/backend/internal/streaming/lifecycle"
)

func TestStreamLifecycle_TransitionTable(t *testing.T) {
	t.Parallel()

	allowed := []struct {
		from, to lifecycle.State
	}{
		{lifecycle.StateScheduled, lifecycle.StateWaiting},
		{lifecycle.StateWaiting, lifecycle.StateLive},
		{lifecycle.StateLive, lifecycle.StateEnded},
		{lifecycle.StateEnded, lifecycle.StateReplay},
		{lifecycle.StateReplay, lifecycle.StateEnded}, // replay expiry → ended
	}
	for _, tc := range allowed {
		if err := lifecycle.Transition(tc.from, tc.to); err != nil {
			t.Errorf("expected allowed %s→%s, got error %v", tc.from, tc.to, err)
		}
	}

	rejected := []struct {
		from, to lifecycle.State
	}{
		{lifecycle.StateScheduled, lifecycle.StateLive},     // skips waiting
		{lifecycle.StateLive, lifecycle.StateScheduled},     // cannot rewind
		{lifecycle.StateEnded, lifecycle.StateLive},         // cannot re-live
		{lifecycle.StateReplay, lifecycle.StateLive},        // cannot re-live
		{lifecycle.StateWaiting, lifecycle.StateScheduled},  // cannot rewind
		{lifecycle.StateLive, lifecycle.StateLive},          // no self
	}
	for _, tc := range rejected {
		if err := lifecycle.Transition(tc.from, tc.to); err == nil {
			t.Errorf("expected rejected %s→%s, got nil error", tc.from, tc.to)
		}
	}
}

func TestStreamLifecycle_AllStatesString(t *testing.T) {
	t.Parallel()
	states := []lifecycle.State{
		lifecycle.StateScheduled,
		lifecycle.StateWaiting,
		lifecycle.StateLive,
		lifecycle.StateReplay,
		lifecycle.StateEnded,
	}
	seen := map[string]bool{}
	for _, s := range states {
		str := string(s)
		if str == "" {
			t.Errorf("state has empty string")
		}
		if seen[str] {
			t.Errorf("duplicate state string %q", str)
		}
		seen[str] = true
	}
}
