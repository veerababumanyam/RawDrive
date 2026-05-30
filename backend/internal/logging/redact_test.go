package logging

import "testing"

func TestMaskEmail(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"normal", "alice@example.com", "a***@example.com"},
		{"single-char-local", "b@example.com", "b***@example.com"},
		{"subdomain", "Joe.Smith@mail.corp.example.co", "J***@mail.corp.example.co"},
		{"empty", "", ""},
		{"no-at", "not-an-email", "[redacted]"},
		{"leading-at", "@example.com", "[redacted]"},
		{"trailing-at", "alice@", "[redacted]"},
		{"only-at", "@", "[redacted]"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := MaskEmail(c.in); got != c.want {
				t.Errorf("MaskEmail(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}

// TestMaskEmail_NeverLeaksLocalPartBeyondFirstChar guards the PII contract:
// the masked output must never contain the local part past its first byte.
func TestMaskEmail_NeverLeaksFullLocalPart(t *testing.T) {
	const secret = "verysecretuser"
	masked := MaskEmail(secret + "@example.com")
	if masked == "" || masked == "[redacted]" {
		t.Fatalf("unexpected mask for a valid email: %q", masked)
	}
	if got := masked[:1]; got != "v" {
		t.Fatalf("expected first char preserved, got %q", got)
	}
	if contains(masked, secret[1:]) {
		t.Errorf("masked value %q leaked the local part tail %q", masked, secret[1:])
	}
}

func contains(haystack, needle string) bool {
	if needle == "" {
		return true
	}
	for i := 0; i+len(needle) <= len(haystack); i++ {
		if haystack[i:i+len(needle)] == needle {
			return true
		}
	}
	return false
}
