// Package phone provides a single canonical phone-number normalization used
// everywhere a phone identity is established or compared (registration,
// profile update, onboarding, and the reuse-state backfill).
//
// Why this exists: the users table historically enforced one-account-per-phone
// with a byte-exact UNIQUE constraint on the raw input. With no normalization,
// "9876543210", "+91 98765 43210" and "098765 43210" are stored as DISTINCT
// rows, so the rule was trivially bypassable by reformatting. Normalize()
// collapses every formatting variant of one number to a single canonical
// string so uniqueness can be enforced on identity, not on typography.
//
// RawDrive is an India-first platform: a bare 10-digit number is assumed Indian
// and prefixed with the "91" country code. An explicit "+<cc>" prefix is taken
// at face value and preserved (we never mangle a real international number).
package phone

import "strings"

// Normalize returns the canonical digit-only identity for a raw phone string,
// or "" when the input contains no digits (treated as "no phone").
//
// Rules (deterministic, idempotent):
//   - All non-digit characters are stripped (spaces, dashes, parens, dots).
//   - A leading "+" marks the remaining digits as an explicit country code and
//     they are returned verbatim (e.g. "+1 415 555 2671" -> "14155552671").
//   - Without "+", India-first heuristics apply to the digit string:
//   - 10 digits            -> "91" + digits         (bare Indian mobile)
//   - 11 digits, leading 0 -> "91" + digits[1:]     (national "0" prefix)
//   - 12 digits, "91…"     -> digits                (already CC-prefixed)
//   - 13 digits, "091…"    -> digits[1:]            (national "0" + CC)
//   - anything else        -> digits                (best-effort passthrough)
//
// The result never contains "+" so it fits cleanly in a VARCHAR(20) and
// compares as a plain string.
func Normalize(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	hadPlus := strings.HasPrefix(s, "+")

	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteByte(byte(r))
		}
	}
	d := b.String()
	if d == "" {
		return ""
	}

	// Explicit country code: the caller asserted these are the CC digits.
	if hadPlus {
		return d
	}

	switch {
	case len(d) == 10:
		return "91" + d
	case len(d) == 11 && d[0] == '0':
		return "91" + d[1:]
	case len(d) == 12 && strings.HasPrefix(d, "91"):
		return d
	case len(d) == 13 && strings.HasPrefix(d, "091"):
		return d[1:]
	default:
		return d
	}
}
