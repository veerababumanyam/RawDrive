// Package reuseguard enforces, at access time, that a paid-reuse account whose
// subscription has lapsed does NOT silently fall back to free-tier use (slice 5
// of the phone-reuse epic).
//
// The in-flight billing-lifecycle worker is not on main, so this guard does not
// depend on a background job: when a paid_active account is observed with no
// active subscription it is flipped to paid_expired and blocked until it renews
// or moves to a different phone. The pure decision (EvaluateReuseAccess) is
// unit-tested; the applier persists the transition via injected collaborators.
package reuseguard

import "context"

// Phone-reuse states.
const (
	StateFree        = "free"
	StatePaidPending = "paid_pending"
	StatePaidActive  = "paid_active"
	StatePaidExpired = "paid_expired"
)

// AccessDecision is the outcome of evaluating a user's reuse access.
type AccessDecision struct {
	// NewState is the state to persist; "" means no change.
	NewState string
	// Blocked is true when the account must NOT be served free-tier access.
	Blocked bool
	// Reason is a short machine code for logging/telemetry.
	Reason string
}

// EvaluateReuseAccess decides what happens when a user touches the app, given
// their phone_reuse_state and whether they currently hold an active subscription.
//
//   - free                       -> allowed (the phone's one free slot)
//   - paid_active + active sub    -> allowed (paid and current)
//   - paid_active + NO active sub -> flip to paid_expired, blocked (lapsed)
//   - paid_expired                -> blocked (renew or use a different phone)
//   - paid_pending                -> blocked from free-tier (no workspace until paid)
//   - anything else               -> allowed (fail open for unknown legacy values)
func EvaluateReuseAccess(state string, hasActiveSub bool) AccessDecision {
	switch state {
	case StateFree:
		return AccessDecision{Blocked: false, Reason: "free"}
	case StatePaidActive:
		if hasActiveSub {
			return AccessDecision{Blocked: false, Reason: "paid_active_current"}
		}
		return AccessDecision{NewState: StatePaidExpired, Blocked: true, Reason: "paid_active_lapsed"}
	case StatePaidExpired:
		return AccessDecision{Blocked: true, Reason: "paid_expired"}
	case StatePaidPending:
		return AccessDecision{Blocked: true, Reason: "paid_pending_unpaid"}
	default:
		return AccessDecision{Blocked: false, Reason: "unknown_fail_open"}
	}
}

// StateStore reads/writes a user's phone_reuse_state and reports subscription
// status.
type StateStore interface {
	GetReuseState(ctx context.Context, userID string) (string, error)
	HasActiveSubscription(ctx context.Context, userID string) (bool, error)
	SetReuseState(ctx context.Context, userID, state string) error
}

// Guard applies EvaluateReuseAccess and persists any state transition.
type Guard struct{ store StateStore }

// NewGuard constructs the guard.
func NewGuard(store StateStore) *Guard { return &Guard{store: store} }

// Check evaluates the user and persists a paid_active -> paid_expired transition
// when the subscription has lapsed. Returns whether free-tier access is blocked.
//
// NOTE: the wiring of Check into the request path (e.g. the plan-tier lookup /
// onboarding guard) is a runtime-UAT follow-up; the decision + persistence are
// unit-tested here.
func (g *Guard) Check(ctx context.Context, userID string) (blocked bool, err error) {
	state, err := g.store.GetReuseState(ctx, userID)
	if err != nil {
		return false, err
	}
	// Only paid-states need a subscription check; free/unknown short-circuit.
	hasSub := false
	if state == StatePaidActive {
		hasSub, err = g.store.HasActiveSubscription(ctx, userID)
		if err != nil {
			return false, err
		}
	}
	d := EvaluateReuseAccess(state, hasSub)
	if d.NewState != "" && d.NewState != state {
		if err := g.store.SetReuseState(ctx, userID, d.NewState); err != nil {
			return d.Blocked, err
		}
	}
	return d.Blocked, nil
}
