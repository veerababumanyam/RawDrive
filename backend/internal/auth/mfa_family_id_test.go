package auth

import (
	"os"
	"strings"
	"testing"
)

// TestF013_MFARefreshTokenFamilyIsPerSession is a regression guard for
// finding F-013 (MFA Refresh Token Family ID Collision).
//
// Root cause: VerifyTOTP and VerifyRecoveryCode minted their refresh token
// with a deterministic, user-derived family ID — "family-"+claims.Sub — so
// every MFA-verified session for the same user collapsed into a single
// refresh-token family. Because RevokeFamily / RevokeSession(FamilyID) act
// family-wide and enforceSessionLimit short-circuits on UserHasFamily, this
// meant one logout or one reuse-detection revocation killed every concurrent
// MFA session, and MaxSessions accounting mis-counted the second MFA login as
// the same family. The password Login and OAuth paths correctly use a unique
// "family-"+uuid.New().String() per session.
//
// Fix: both MFA step-up call sites now use "family-"+uuid.New().String().
//
// Why a source-level assertion: the family ID is generated inline at the call
// site via uuid.New().String() (matching the existing Login/OAuth pattern),
// so there is no extractable pure function to unit-test in isolation, and the
// only behavioural alternative is a full handler integration test that depends
// on the JWT/TOTP/envelope/workspace fakes defined across several files in
// this package. This deterministic guard fails the moment anyone reintroduces
// the deterministic family ID at either MFA call site — which is precisely the
// regression F-013 describes — without requiring any DB or network.
func TestF013_MFARefreshTokenFamilyIsPerSession(t *testing.T) {
	const src = "mfa_handler.go"

	b, err := os.ReadFile(src)
	if err != nil {
		t.Fatalf("read %s: %v", src, err)
	}
	contents := string(b)

	// The vulnerable, deterministic family ID must not appear anywhere.
	if strings.Contains(contents, `"family-"+claims.Sub`) {
		t.Errorf("F-013 regression: %s still builds a refresh-token family ID "+
			"from the deterministic \"family-\"+claims.Sub. All MFA-verified "+
			"sessions for a user would share one family, so a single logout or "+
			"reuse-detection revocation would kill every concurrent MFA session. "+
			"Use \"family-\"+uuid.New().String() instead (matching the Login and "+
			"OAuth paths).", src)
	}

	// Each MFA refresh-token call site must use a per-session UUID family.
	// VerifyTOTP + VerifyRecoveryCode == exactly 2 call sites.
	perSession := strings.Count(contents, `"family-"+uuid.New().String()`)
	if perSession != 2 {
		t.Errorf("F-013 regression: expected exactly 2 per-session refresh-token "+
			"family IDs (\"family-\"+uuid.New().String()) in %s — one in "+
			"VerifyTOTP and one in VerifyRecoveryCode — but found %d. Each "+
			"successful MFA step-up must get its own independent family for "+
			"correct session isolation and MaxSessions accounting.",
			src, perSession)
	}
}
