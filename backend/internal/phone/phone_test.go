package phone

import "testing"

func TestNormalize(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		// Indian 10-digit and common formatted variants all collapse to the
		// same canonical "91XXXXXXXXXX". This is the core anti-bypass property:
		// formatting must never produce a distinct identity.
		{"bare 10-digit", "9876543210", "919876543210"},
		{"spaced", "98765 43210", "919876543210"},
		{"plus91 spaced", "+91 98765 43210", "919876543210"},
		{"plus91 packed", "+919876543210", "919876543210"},
		{"leading zero", "09876543210", "919876543210"},
		{"already 91 prefixed", "919876543210", "919876543210"},
		// Explicit "+" means "these are the exact country-code digits" — we do
		// NOT second-guess a malformed leading zero after the CC; kept verbatim.
		{"plus91 then stray zero kept verbatim", "+91 09876543210", "9109876543210"},
		{"dashes and parens", "(987)-654-3210", "919876543210"},
		{"dotted", "98765.43210", "919876543210"},
		{"tabbed/padded", "  9876543210  ", "919876543210"},

		// Explicit non-India country code is preserved (RawDrive is India-first
		// but must not silently mangle a real international number).
		{"us number", "+1 415 555 2671", "14155552671"},
		{"us packed", "+14155552671", "14155552671"},

		// Degenerate input → empty (column is nullable; empty means "no phone").
		{"empty", "", ""},
		{"whitespace only", "   ", ""},
		{"no digits", "abc-def", ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := Normalize(c.in)
			if got != c.want {
				t.Fatalf("Normalize(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}

// TestNormalize_Idempotent guarantees normalizing an already-normalized value
// is a no-op — required because the value is written back through Create/Update
// and re-backfilled; a non-idempotent normalize would drift identities.
func TestNormalize_Idempotent(t *testing.T) {
	for _, in := range []string{"919876543210", "14155552671", ""} {
		once := Normalize(in)
		twice := Normalize(once)
		if once != twice {
			t.Fatalf("not idempotent for %q: once=%q twice=%q", in, once, twice)
		}
	}
}

// TestNormalize_CollisionProperty asserts the differently-formatted variants of
// one Indian number all share an identity (the property the partial unique
// index relies on), while two genuinely different numbers do not.
func TestNormalize_CollisionProperty(t *testing.T) {
	variants := []string{"9876543210", "+91 98765 43210", "098765 43210", "(98765)43210"}
	first := Normalize(variants[0])
	for _, v := range variants[1:] {
		if Normalize(v) != first {
			t.Fatalf("variant %q normalized to %q, expected %q", v, Normalize(v), first)
		}
	}
	if Normalize("9876543211") == first {
		t.Fatalf("distinct number collided with %q", first)
	}
}
