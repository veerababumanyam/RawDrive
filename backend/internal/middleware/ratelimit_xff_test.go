package middleware

import (
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// f008OK is a trivial leaf handler that returns 200. (A package-level
// okHandler already exists in mfa_mount_validation_test.go, so the F-008
// tests use their own uniquely-named helpers to avoid a redeclaration.)
func f008OK() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
}

// f008Req fires a single request through the limiter with the given
// RemoteAddr and X-Forwarded-For header and returns the status code.
func f008Req(h http.Handler, remoteAddr, xff string) int {
	req := httptest.NewRequest(http.MethodPost, "/auth/login", nil)
	req.RemoteAddr = remoteAddr
	if xff != "" {
		req.Header.Set("X-Forwarded-For", xff)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Code
}

// TestF008_SpoofedXFFFromUntrustedPeerCannotBypassRateLimit is the
// regression guard for F-008. An attacker on a DIRECT (untrusted) connection
// rotates a fresh X-Forwarded-For per request to try to dodge the limiter.
// The limiter must key on the unspoofable TCP source (r.RemoteAddr) and
// therefore start returning 429 once the per-source budget is exhausted —
// regardless of how many distinct fake XFF values are presented.
//
// Before the fix the limiter trusted X-Forwarded-For unconditionally, so
// every request got a brand-new bucket and the limit was never enforced;
// this test would see all 200s and fail.
func TestF008_SpoofedXFFFromUntrustedPeerCannotBypassRateLimit(t *testing.T) {
	// Force the allowlist to a known set that does NOT include the
	// attacker's public peer address, so the test is deterministic and
	// independent of any ambient TRUSTED_PROXY_CIDR env value.
	t.Setenv("TRUSTED_PROXY_CIDR", "172.16.0.0/12")

	const maxReq = 3
	limit, _ := RateLimitWithReset(maxReq, time.Minute)
	h := limit(f008OK())

	// Untrusted public peer (203.0.113.7 is TEST-NET-3, not in the CIDR).
	const attackerPeer = "203.0.113.7:54321"

	allowed := 0
	blocked := 0
	for i := 0; i < maxReq+5; i++ {
		// Rotate a fake X-Forwarded-For on every request.
		fakeIP := net.IPv4(198, 51, 100, byte(i)).String()
		code := f008Req(h, attackerPeer, fakeIP)
		switch code {
		case http.StatusOK:
			allowed++
		case http.StatusTooManyRequests:
			blocked++
		default:
			t.Fatalf("unexpected status %d on request %d", code, i)
		}
	}

	if allowed != maxReq {
		t.Errorf("spoofed XFF bypassed the limiter: allowed=%d, want exactly %d (the per-peer budget)", allowed, maxReq)
	}
	if blocked == 0 {
		t.Errorf("expected requests beyond the budget to be 429-blocked, got blocked=%d", blocked)
	}
}

// TestF008_TrustedProxyXFFStillHonored verifies the fix does NOT regress the
// legitimate behavior: when the request genuinely arrives through a trusted
// proxy (RemoteAddr inside TRUSTED_PROXY_CIDR), distinct real client IPs in
// X-Forwarded-For must still get independent buckets, so one busy client
// does not exhaust the shared budget for everyone behind the proxy.
func TestF008_TrustedProxyXFFStillHonored(t *testing.T) {
	t.Setenv("TRUSTED_PROXY_CIDR", "172.16.0.0/12")

	const maxReq = 2
	limit, _ := RateLimitWithReset(maxReq, time.Minute)
	h := limit(f008OK())

	// Trusted nginx peer on the docker bridge.
	const proxyPeer = "172.18.0.4:5000"

	// Client A exhausts its budget.
	for i := 0; i < maxReq; i++ {
		if code := f008Req(h, proxyPeer, "11.11.11.11"); code != http.StatusOK {
			t.Fatalf("client A request %d should be allowed, got %d", i, code)
		}
	}
	if code := f008Req(h, proxyPeer, "11.11.11.11"); code != http.StatusTooManyRequests {
		t.Fatalf("client A over budget should be 429, got %d", code)
	}

	// Client B (different real IP, same trusted proxy) must NOT be blocked
	// by client A's usage — proves XFF is honored for trusted peers.
	if code := f008Req(h, proxyPeer, "22.22.22.22"); code != http.StatusOK {
		t.Fatalf("client B behind trusted proxy should get its own bucket, got %d", code)
	}
}

// TestF008_UntrustedPeerNoXFFKeysOnRemoteAddr is a focused unit check on the
// IP-selection helper: with an untrusted peer, attacker-supplied
// X-Forwarded-For / X-Real-IP are ignored and the bucket key is the peer
// host (port stripped).
func TestF008_UntrustedPeerNoXFFKeysOnRemoteAddr(t *testing.T) {
	_, n, _ := net.ParseCIDR("172.16.0.0/12")
	trusted := []*net.IPNet{n}

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "203.0.113.9:1234"
	req.Header.Set("X-Forwarded-For", "8.8.8.8")
	req.Header.Set("X-Real-IP", "9.9.9.9")

	got := clientIPForRateLimit(req, trusted)
	if got != "203.0.113.9" {
		t.Errorf("untrusted peer must key on RemoteAddr host; got %q, want %q", got, "203.0.113.9")
	}
}
