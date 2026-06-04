package auth

import (
	"context"
	"time"
)

// CodeDenylist provides cross-node single-use recording for short-lived codes
// (TOTP used-code replay, MFA challenge tokens). When set on a service, it is
// preferred over the per-process sync.Map so used-code state is shared across
// all app nodes via Valkey. A nil implementation keeps the in-process fallback.
type CodeDenylist interface {
	// MarkUsed atomically records key as consumed for the given TTL.
	// Returns (true, nil) on fresh recording, (false, nil) if already present,
	// (false, err) on backend failure — callers fall back to sync.Map on error.
	MarkUsed(ctx context.Context, key string, ttl time.Duration) (newlyRecorded bool, err error)
}
