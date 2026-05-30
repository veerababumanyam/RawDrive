// Package logging provides small, dependency-free helpers for emitting
// observable logs without leaking user PII.
package logging

import "strings"

// MaskEmail redacts an email address for logging so user PII (F-070) does not
// persist in log aggregators with no TTL (DPDP/GDPR). It keeps just enough to
// correlate support reports: the first character of the local part and the full
// domain, e.g. "alice@example.com" -> "a***@example.com". Inputs that don't look
// like an email are reported as "[redacted]" so a malformed value can never leak
// verbatim. Empty input stays empty.
func MaskEmail(email string) string {
	if email == "" {
		return ""
	}
	at := strings.LastIndex(email, "@")
	if at <= 0 || at >= len(email)-1 {
		// No usable local part or domain — never echo the raw value.
		return "[redacted]"
	}
	return email[:1] + "***@" + email[at+1:]
}
