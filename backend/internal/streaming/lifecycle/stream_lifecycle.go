// Package lifecycle contains the pure state machine for a commercial stream's
// lifecycle (scheduled → waiting → live → ended → replay). The transition
// function has no I/O and is safe to call from any goroutine.
package lifecycle

import "fmt"

// State is the canonical server-authoritative state a stream can be in.
// The viewer never infers state; every transition is driven by this table.
type State string

const (
	StateScheduled State = "scheduled"
	StateWaiting   State = "waiting"
	StateLive      State = "live"
	StateReplay    State = "replay"
	StateEnded     State = "ended"
)

// allowed enumerates permitted transitions. Any (from, to) not present here
// is rejected by Transition.
var allowed = map[State]map[State]struct{}{
	StateScheduled: {StateWaiting: {}, StateEnded: {}},
	StateWaiting:   {StateLive: {}, StateEnded: {}},
	StateLive:      {StateEnded: {}},
	StateEnded:     {StateReplay: {}},
	StateReplay:    {StateEnded: {}}, // replay expiry returns to ended.
}

// Transition returns nil when from→to is a permitted state transition, and
// a descriptive error otherwise.
func Transition(from, to State) error {
	dsts, ok := allowed[from]
	if !ok {
		return fmt.Errorf("lifecycle: unknown from state %q", from)
	}
	if _, ok := dsts[to]; !ok {
		return fmt.Errorf("lifecycle: illegal transition %s→%s", from, to)
	}
	return nil
}
