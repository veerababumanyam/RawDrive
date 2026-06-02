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

func TestGoogleOAuthRedirectURLPolicy(t *testing.T) {
	cases := []struct {
		name    string
		url     string
		appEnv  string
		wantErr bool
	}{
		{
			name:    "local dev may use localhost http callback",
			url:     "http://localhost:8080/api/v1/auth/oauth/google/callback",
			appEnv:  "development",
			wantErr: false,
		},
		{
			name:    "production rejects localhost callback",
			url:     "http://localhost:8080/api/v1/auth/oauth/google/callback",
			appEnv:  "production",
			wantErr: true,
		},
		{
			name:    "staging rejects plain http callback",
			url:     "http://api.rawdrive.in/auth/oauth/google/callback",
			appEnv:  "staging",
			wantErr: true,
		},
		{
			name:    "production accepts https api callback",
			url:     "https://api.rawdrive.in/auth/oauth/google/callback",
			appEnv:  "production",
			wantErr: false,
		},
		{
			name:    "malformed callback rejected",
			url:     "not a url",
			appEnv:  "development",
			wantErr: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateGoogleRedirectURLForEnv(tc.url, tc.appEnv)
			if tc.wantErr && err == nil {
				t.Fatalf("validateGoogleRedirectURLForEnv(%q, %q) = nil, want error", tc.url, tc.appEnv)
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("validateGoogleRedirectURLForEnv(%q, %q) = %v, want nil", tc.url, tc.appEnv, err)
			}
		})
	}
}
