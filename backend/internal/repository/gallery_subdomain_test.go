package repository

import (
	"errors"
	"strings"
	"testing"
)

// Tests for the pure functions only (validator + sanitizer). The DB-backed
// GenerateUniqueSubdomainSlug and GetBySubdomainSlug are exercised by the
// existing repo integration tests that use pgxtest. Keeping these pure
// keeps them fast and ensures the validator stays self-contained.

func TestSanitizeForSubdomain(t *testing.T) {
	tests := []struct {
		name   string
		input  string
		maxLen int
		want   string
	}{
		{"basic", "Wedding Veera Aishu", 50, "wedding-veera-aishu"},
		{"mixed case", "GROOM-AND-BRIDE", 50, "groom-and-bride"},
		{"strips punctuation", "Hello, World! 2026", 50, "hello-world-2026"},
		{"collapses hyphens", "foo---bar", 50, "foo-bar"},
		{"trims trailing hyphens after truncation", "abcdefghij", 5, "abcde"},
		{"empty input", "", 50, ""},
		{"only punctuation", "!!!???", 50, ""},
		{"unicode dropped", "café résumé", 50, "caf-rsum"},
		{"truncation respects hyphen-trim", "a-b-c-d-e", 4, "a-b"},
		{"single char", "x", 50, "x"},
		{"all hyphens", "----", 50, ""},
		{"leading punctuation then valid", "!!! hello", 50, "hello"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := sanitizeForSubdomain(tc.input, tc.maxLen)
			if got != tc.want {
				t.Errorf("sanitizeForSubdomain(%q, %d) = %q, want %q", tc.input, tc.maxLen, got, tc.want)
			}
		})
	}
}

func TestValidateSubdomainSlug_Accepts(t *testing.T) {
	good := []string{
		"a",
		"wedding-veera-aishu-a1b2c3d4",
		"a1",
		"abc-def-123",
		"single",
		strings.Repeat("a", 63), // exactly the max length
	}
	for _, s := range good {
		t.Run(s, func(t *testing.T) {
			if err := validateSubdomainSlug(s); err != nil {
				t.Errorf("validateSubdomainSlug(%q) = %v, want nil", s, err)
			}
		})
	}
}

func TestValidateSubdomainSlug_RejectsReserved(t *testing.T) {
	for _, s := range []string{"api", "www", "app", "admin", "rawdrive", "test"} {
		t.Run(s, func(t *testing.T) {
			err := validateSubdomainSlug(s)
			if !errors.Is(err, ErrSubdomainSlugReserved) {
				t.Errorf("validateSubdomainSlug(%q) = %v, want ErrSubdomainSlugReserved", s, err)
			}
		})
	}
}

func TestValidateSubdomainSlug_RejectsInvalidShape(t *testing.T) {
	tests := []struct {
		name string
		slug string
	}{
		{"empty", ""},
		{"leading hyphen", "-foo"},
		{"trailing hyphen", "foo-"},
		{"consecutive hyphens", "foo--bar"},
		{"uppercase", "Foo"},
		{"underscore", "foo_bar"},
		{"space", "foo bar"},
		{"dot", "foo.bar"},
		{"too long", strings.Repeat("a", 64)},
		{"non-ascii", "café"},
		{"emoji", "wedding-🎉"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := validateSubdomainSlug(tc.slug)
			if !errors.Is(err, ErrSubdomainSlugInvalid) {
				t.Errorf("validateSubdomainSlug(%q) = %v, want ErrSubdomainSlugInvalid", tc.slug, err)
			}
		})
	}
}

// TestSanitize_ProducesValidLabels — sanitization output should always pass
// the validator (modulo the special cases where sanitize produces an empty
// string, which the generator then replaces with "gallery"). This invariant
// keeps the sanitizer and validator in lockstep.
func TestSanitize_ProducesValidLabels(t *testing.T) {
	inputs := []string{
		"normal title",
		"PRoofing %% 2026",
		"---weird---",
		"a",
		"",
		"!!!",
		"Wedding (Veera & Aishu) — 2026",
	}
	for _, in := range inputs {
		t.Run(in, func(t *testing.T) {
			s := sanitizeForSubdomain(in, 50)
			if s == "" {
				// Empty is acceptable — GenerateUniqueSubdomainSlug falls back
				// to a fixed base in that case. Skip the validator check.
				return
			}
			// With a suffix appended (as GenerateUniqueSubdomainSlug does),
			// the result must validate. Append a known-good 8-char suffix.
			candidate := s + "-deadbeef"
			if len(candidate) <= 63 {
				if err := validateSubdomainSlug(candidate); err != nil {
					t.Errorf("sanitize(%q)+\"-deadbeef\" = %q failed validate: %v", in, candidate, err)
				}
			}
		})
	}
}
