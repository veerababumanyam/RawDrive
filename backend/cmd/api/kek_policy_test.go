package main

import "testing"

// TestF113_KEKRequiredForEnv asserts the F-113 policy: PLATFORM_SETTINGS_KEK
// (at-rest envelope encryption) is mandatory in every environment except the
// explicit local-development/test allowlist.
//
// Before the fix, only production/prod required the KEK; staging/review/UAT
// and any unrecognized APP_ENV silently fell back to PLAINTEXT secret
// storage. The "staging" / "review" / "" (unrecognized non-local) cases in
// the want=true group below fail against the old behavior and pass after.
func TestF113_KEKRequiredForEnv(t *testing.T) {
	cases := []struct {
		appEnv string
		want   bool
	}{
		// Allowlisted local/dev/test environments may run without a KEK.
		{"", false},
		{"development", false},
		{"dev", false},
		{"test", false},
		{"testing", false},
		{"local", false},

		// Production was always gated.
		{"production", true},
		{"prod", true},

		// F-113: these previously leaked to plaintext and must now be gated.
		{"staging", true},
		{"stage", true},
		{"review", true},
		{"preview", true},
		{"uat", true},
		{"demo", true},

		// Fail closed: any unrecognized APP_ENV requires the KEK.
		{"something-unexpected", true},
	}

	for _, tc := range cases {
		if got := kekRequiredForEnv(tc.appEnv); got != tc.want {
			t.Errorf("kekRequiredForEnv(%q) = %v, want %v", tc.appEnv, got, tc.want)
		}
	}
}
