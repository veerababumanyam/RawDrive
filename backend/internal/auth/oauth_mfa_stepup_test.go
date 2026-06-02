package auth

import (
	"os"
	"strings"
	"testing"
)

// TestF012_OAuthGoogleCallbackEnforcesMFAStepUp is the regression guard for
// finding F-012 (Google OAuth Login Bypasses TOTP Step-Up).
//
// Root cause: OAuthGoogleCallback resolved the user and went straight to
// GenerateRefreshTokenWithClaims, never consulting the MFA enrollment store.
// A user who had enrolled (and verified) TOTP could log in via Google and
// receive a full session with mfa_verified=false, never being prompted for
// their second factor — while the password Login path correctly gates on the
// enrollment store and issues an mfa_challenge.
//
// Fix: the step-up decision is centralized in (*Handler).requiresMFAStepUp,
// which both Login and OAuthGoogleCallback now call before issuing tokens. On
// a verified, active enrollment the OAuth path mints a short-lived challenge
// token and 302-redirects with mfa_required=1 instead of completing login.
//
// Why a source-level assertion: exercising the OAuth callback behaviourally
// requires a live-exchange OAuthService plus an envelope-backed MFAHandler and
// enrollment store wired together — the same cross-file fixture burden that
// led the F-013 guard (mfa_family_id_test.go) to assert at the source level.
// requiresMFAStepUp itself is unexported, so an external auth_test package
// cannot call it directly. This guard fails the moment anyone removes the
// step-up gate from the OAuth path or lets the OAuth refresh token be issued
// ahead of the gate — precisely the regression F-012 describes — with no DB,
// network, or crypto dependencies.
func TestF012_OAuthGoogleCallbackEnforcesMFAStepUp(t *testing.T) {
	const src = "handler.go"

	b, err := os.ReadFile(src)
	if err != nil {
		t.Fatalf("read %s: %v", src, err)
	}
	contents := string(b)

	// The shared step-up predicate must exist.
	if !strings.Contains(contents, "func (h *Handler) requiresMFAStepUp(") {
		t.Fatalf("F-012 regression: the shared requiresMFAStepUp predicate is "+
			"missing from %s. Both Login and OAuthGoogleCallback must gate "+
			"token issuance on the same verified-enrollment check.", src)
	}

	// Isolate the OAuthGoogleCallback function body so the assertions below
	// concern only that handler.
	const fnSig = "func (h *Handler) OAuthGoogleCallback("
	start := strings.Index(contents, fnSig)
	if start < 0 {
		t.Fatalf("F-012 regression: OAuthGoogleCallback not found in %s", src)
	}
	// The next top-level "\nfunc " after the signature bounds the body.
	rest := contents[start+len(fnSig):]
	end := strings.Index(rest, "\nfunc ")
	if end < 0 {
		end = len(rest)
	}
	body := rest[:end]

	// The OAuth callback must consult the step-up gate.
	gateIdx := strings.Index(body, "h.requiresMFAStepUp(")
	if gateIdx < 0 {
		t.Fatalf("F-012 regression: OAuthGoogleCallback no longer calls " +
			"h.requiresMFAStepUp(...). An enrolled user could log in via " +
			"Google and bypass the TOTP second factor entirely.")
	}

	// And it must issue the MFA challenge on the gated path.
	if !strings.Contains(body, "IssueMFAChallengeToken(") {
		t.Errorf("F-012 regression: OAuthGoogleCallback does not issue an MFA " +
			"challenge token. The step-up path must mint a challenge and " +
			"redirect to the TOTP page instead of completing login.")
	}
	if !strings.Contains(body, `"mfa_required"`) {
		t.Errorf("F-012 regression: OAuthGoogleCallback does not signal " +
			"mfa_required on the step-up redirect, so the frontend cannot " +
			"route the user to the TOTP step-up page.")
	}
	if strings.Contains(body, `"mfa_token"`) {
		t.Errorf("F-012 regression: OAuthGoogleCallback must not put the " +
			"MFA challenge token in a redirect URL. Use the HttpOnly " +
			"rawdrive_mfa_challenge cookie instead.")
	}
	if !strings.Contains(body, "setMFAChallengeCookie(") {
		t.Errorf("F-012 regression: OAuthGoogleCallback must store the " +
			"OAuth MFA challenge in an HttpOnly cookie before redirecting.")
	}

	// The gate must come BEFORE the full-session refresh token is issued —
	// otherwise the enrolled user would already hold a valid session.
	refreshIdx := strings.Index(body, "GenerateRefreshTokenWithClaims(")
	if refreshIdx < 0 {
		t.Fatalf("F-012 regression: OAuthGoogleCallback no longer issues a " +
			"refresh token via GenerateRefreshTokenWithClaims — the test's " +
			"ordering assumption is stale and must be revisited.")
	}
	if gateIdx > refreshIdx {
		t.Errorf("F-012 regression: the requiresMFAStepUp gate (offset %d) must "+
			"run BEFORE the full-session refresh token is issued (offset %d). "+
			"As ordered, an enrolled user receives a full session before the "+
			"second-factor check.", gateIdx, refreshIdx)
	}
}
