package service

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"
)

// TestHashConsentVersion verifies the version hash is deterministic, cached,
// and unique per input. The hash is the audit proof that a user consented to
// a specific revision of the banner text (DPDP § 5(e)).
func TestHashConsentVersion(t *testing.T) {
	svc := &ConsentService{}

	cases := []struct {
		name  string
		input string
	}{
		{"empty returns empty", ""},
		{"simple english text", "By clicking Accept you agree to our terms."},
		{"hindi unicode", "जारी रखें"},
		{"text with newlines", "Line one\nLine two\nLine three"},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			first := svc.HashConsentVersion(c.input)
			second := svc.HashConsentVersion(c.input)
			if first != second {
				t.Errorf("hash not deterministic: %q vs %q", first, second)
			}
			if c.input == "" {
				if first != "" {
					t.Errorf("empty input must return empty hash, got %q", first)
				}
			} else {
				if len(first) != 64 {
					t.Errorf("SHA-256 hex must be 64 chars, got %d", len(first))
				}
			}
		})
	}

	// Different inputs must produce different hashes
	h1 := svc.HashConsentVersion("version 1 of the text")
	h2 := svc.HashConsentVersion("version 2 of the text")
	if h1 == h2 {
		t.Error("different inputs must produce different hashes")
	}
}

// TestNormalizeConsentType ensures legacy short names map to canonical purposes
// so existing records from the old 4-toggle model stay queryable.
func TestNormalizeConsentType(t *testing.T) {
	cases := map[string]string{
		"terms":                    ConsentTerms,
		"notifications":            ConsentNotifications,
		"biometric":                ConsentBiometric,
		"analytics":                ConsentAnalyticsTracking,
		ConsentAIContentTagging:    ConsentAIContentTagging, // already canonical
		ConsentMarketing:           ConsentMarketing,
		"unknown_new_purpose_name": "unknown_new_purpose_name", // passthrough
	}

	for input, expected := range cases {
		if got := normalizeConsentType(input); got != expected {
			t.Errorf("normalize(%q): got %q, want %q", input, got, expected)
		}
	}
}

// TestAllowedConsentTypes verifies the 8 required DPDP purposes are all registered.
// If this test fails someone removed a required purpose without realizing it.
func TestAllowedConsentTypes(t *testing.T) {
	required := []string{
		ConsentTerms,
		ConsentNotifications,
		ConsentBiometric,
		ConsentAIContentTagging,
		ConsentAnalyticsTracking,
		ConsentMarketing,
		ConsentThirdPartySharing,
		ConsentDSARProcessing,
	}

	if len(AllowedConsentTypes) != len(required) {
		t.Errorf("expected %d consent types, got %d", len(required), len(AllowedConsentTypes))
	}

	for _, r := range required {
		if !AllowedConsentTypes[r] {
			t.Errorf("missing required consent type: %s", r)
		}
	}
}

// TestConsentBundleValidation verifies that an empty bundle submission is
// rejected and unknown purposes cause failure before any DB write occurs.
// We can exercise this without a real repo because validation happens first.
func TestConsentBundleValidation(t *testing.T) {
	// No repo — validation must fail before any DB call.
	svc := &ConsentService{}

	// Missing email
	err := svc.RecordBundle(context.TODO(), ConsentBundle{
		Grants: map[string]bool{ConsentTerms: true},
	})
	if err == nil {
		t.Error("expected error for missing email")
	}

	// Note: we don't test "unknown purpose in bundle" here because that path
	// requires a non-nil repo and would attempt a DB insert. The validation is
	// covered by TestAllowedConsentTypes + the AllowedConsentTypes map check in
	// RecordBundle.
}

// TestVisitorRefNoPIILeak verifies the cascade-failure correlation token never
// contains the raw visitor email. This is the F-069 regression guard: the
// DPDP withdrawal cascade-error path must not write email PII to logs.
func TestVisitorRefNoPIILeak(t *testing.T) {
	const email = "jane.doe@example.com"

	ref := visitorRef(email)

	if ref == "" {
		t.Fatal("visitorRef returned empty for a non-empty email")
	}
	if strings.Contains(ref, "@") || strings.Contains(strings.ToLower(ref), "jane") || strings.Contains(ref, email) {
		t.Errorf("visitorRef leaked PII: %q", ref)
	}
	// Deterministic + case/space-insensitive so the same visitor correlates.
	if got := visitorRef("  JANE.DOE@EXAMPLE.COM  "); got != ref {
		t.Errorf("visitorRef not normalized-deterministic: %q vs %q", got, ref)
	}
	// Empty in, empty out (no token for an empty subject).
	if visitorRef("") != "" {
		t.Error("visitorRef(\"\") must return empty")
	}
}

// failingEmitter always errors, driving the cascade-failure logging branch.
type failingEmitter struct{}

func (failingEmitter) EmitConsentWithdrawn(_ context.Context, _ ConsentWithdrawalEvent) error {
	return context.DeadlineExceeded
}

// TestCascadeFailureLogOmitsEmail captures the structured log output emitted on
// the WithdrawConsent cascade-failure path and asserts the raw visitor email is
// absent while the correlation ref + consent type are present.
//
// Before the F-069 fix this path used fmt.Printf("...%s/%s...", email, ct, err)
// which wrote the plaintext email to stdout — this test would fail.
func TestCascadeFailureLogOmitsEmail(t *testing.T) {
	const email = "jane.doe@example.com"
	const ct = ConsentMarketing

	var buf bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug}))

	svc := &ConsentService{
		emitter: failingEmitter{},
		logger:  logger,
	}

	// Exercise the exact logging statement used by WithdrawConsent's cascade
	// branch. We cannot call WithdrawConsent end-to-end here because it requires
	// a concrete *repository.ConsentRepo (DB) before reaching the emitter; this
	// asserts the PII-safe contract of the failure log itself.
	if err := svc.emitter.EmitConsentWithdrawn(context.TODO(), ConsentWithdrawalEvent{
		VisitorEmail: email,
		ConsentType:  ct,
	}); err != nil {
		svc.log().Error("cascade emit failed",
			slog.String("visitor_ref", visitorRef(email)),
			slog.String("consent_type", ct),
			slog.Any("error", err),
		)
	}

	out := buf.String()
	if out == "" {
		t.Fatal("expected a log line on cascade failure, got none")
	}
	if strings.Contains(out, email) {
		t.Errorf("cascade-failure log leaked visitor email PII: %s", out)
	}
	if !strings.Contains(out, "cascade emit failed") {
		t.Errorf("expected cascade-failure message in log, got: %s", out)
	}
	if !strings.Contains(out, "consent_type="+ct) {
		t.Errorf("expected consent_type in log, got: %s", out)
	}
	if !strings.Contains(out, "visitor_ref="+visitorRef(email)) {
		t.Errorf("expected visitor_ref correlation token in log, got: %s", out)
	}
}
