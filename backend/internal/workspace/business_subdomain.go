package workspace

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
)

// Deprecated internal workspace identity from migration 121.
//
// Each workspace still owns one DB identity shaped as:
//
//   <business_profile_slug>-<business_unique_code>
//
// `business_profile_slug` is derived from the workspace name (lowercased,
// sanitized to DNS-label rules, truncated to 54 chars). `business_unique_code`
// is an 8-char lowercase hex string drawn from crypto/rand and persisted
// in the DB with a UNIQUE index — collisions are essentially impossible
// (16^8 ≈ 4 billion values) but the index is the ultimate guard.
// Generated production gallery URLs no longer use this identity; they use
// https://rawdrive.in/g/<slug>.
//
// This file mirrors the contract baked into migration 121:
//   - reservedSubdomainLabels (Go) == migration 121 CHECK list (DB)
//   - sanitizeBusinessProfileSlug (Go) == migration 121 backfill SQL
// Any future addition to the reserved list needs a new migration AND a
// matching update here. The DB CHECK is the source of truth.

// reservedSubdomainLabels are business-profile slugs we explicitly refuse to
// hand out as the leading half of a subdomain. Even though the full subdomain
// stays unique via the random unique_code, `api-a1b2c3d4.rawdrive.in` looks
// like a system endpoint and would be confusing — prefix those with `studio-`.
var reservedSubdomainLabels = map[string]struct{}{
	"www":       {},
	"api":       {},
	"app":       {},
	"admin":     {},
	"cdn":       {},
	"mail":      {},
	"ftp":       {},
	"static":    {},
	"assets":    {},
	"blog":      {},
	"docs":      {},
	"support":   {},
	"status":    {},
	"billing":   {},
	"payments":  {},
	"auth":      {},
	"login":     {},
	"register":  {},
	"mx":        {},
	"ns":        {},
	"cobolt":    {},
	"rawdrive":  {},
	"localhost": {},
	"test":      {},
}

const (
	// businessProfileSlugMaxLen is the cap on the human-readable half.
	// 63 (column max for full subdomain) - 1 ('-' delimiter) - 8 (code) = 54.
	businessProfileSlugMaxLen = 54

	// businessUniqueCodeLen is the random code length. 8 lowercase hex chars
	// = 16^8 ≈ 4 billion possible values — collision probability is
	// statistically zero for the scale we'd ever reach.
	businessUniqueCodeLen = 8

	// businessUniqueCodeRetries caps the retry loop in GenerateBusinessUniqueCode.
	// Should never be hit but keeps the loop bounded.
	businessUniqueCodeRetries = 5
)

// ErrBusinessProfileSlugInvalid is returned when a candidate slug fails the
// DNS-label shape check. Callers shouldn't normally encounter this — the
// sanitizer produces only valid slugs — but the validator runs after as
// defense-in-depth.
var ErrBusinessProfileSlugInvalid = errors.New("business profile slug is not a valid DNS label")

// sanitizeBusinessProfileSlug takes a workspace name and produces a DNS-safe
// label. Rules mirror migration 121's backfill SQL exactly:
//
//  1. lowercase
//  2. keep [a-z0-9], coerce spaces and hyphens to single hyphen separator
//  3. drop everything else
//  4. collapse runs of hyphens
//  5. trim hyphens from both ends
//  6. truncate to maxLen, then trim trailing hyphens if cutoff hit one
//
// Returns "" when the input has no usable characters (caller should fall
// back to "studio").
func sanitizeBusinessProfileSlug(name string) string {
	if name == "" {
		return ""
	}
	lower := strings.ToLower(name)
	var b strings.Builder
	b.Grow(len(lower))
	prevHyphen := false
	for _, r := range lower {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			prevHyphen = false
		case r == ' ' || r == '-':
			// Spaces and hyphens both become a single hyphen separator. Skip
			// when we haven't emitted any alphanumeric yet (drops leading)
			// or when the previous character was already a hyphen (collapse).
			if !prevHyphen && b.Len() > 0 {
				b.WriteByte('-')
				prevHyphen = true
			}
		default:
			// drop (e.g. '.', '!', '&', non-ASCII)
		}
	}
	out := strings.TrimRight(b.String(), "-")
	if len(out) > businessProfileSlugMaxLen {
		out = strings.TrimRight(out[:businessProfileSlugMaxLen], "-")
	}
	return out
}

// resolveBusinessProfileSlug applies the reserved-label fallback: if the
// sanitized slug is empty OR matches a reserved label, return a safe
// substitute. This is called from Create — its output is what gets stored.
func resolveBusinessProfileSlug(name string) string {
	clean := sanitizeBusinessProfileSlug(name)
	if clean == "" {
		return "studio"
	}
	if _, reserved := reservedSubdomainLabels[clean]; reserved {
		// Prefix with "studio-" so the subdomain reads as a studio identity
		// rather than a system endpoint. The full subdomain is still unique
		// via the random code suffix, but this is more readable.
		const prefix = "studio-"
		body := clean
		if len(body)+len(prefix) > businessProfileSlugMaxLen {
			body = strings.TrimRight(body[:businessProfileSlugMaxLen-len(prefix)], "-")
		}
		return prefix + body
	}
	return clean
}

// validateBusinessProfileSlug verifies the slug satisfies the DB CHECK
// constraint shape: 1-54 chars, single DNS label, no consecutive hyphens.
// Used as a final guard before INSERT — should never fail for outputs of
// resolveBusinessProfileSlug, but a panic-vs-error tradeoff: better to
// surface a clean error than to hit a CHECK constraint at the DB.
func validateBusinessProfileSlug(slug string) error {
	if slug == "" {
		return fmt.Errorf("%w: empty", ErrBusinessProfileSlugInvalid)
	}
	if len(slug) > businessProfileSlugMaxLen {
		return fmt.Errorf("%w: exceeds %d chars", ErrBusinessProfileSlugInvalid, businessProfileSlugMaxLen)
	}
	first := slug[0]
	last := slug[len(slug)-1]
	if !isAlnum(first) || !isAlnum(last) {
		return fmt.Errorf("%w: leading or trailing hyphen", ErrBusinessProfileSlugInvalid)
	}
	prevHyphen := false
	for i := 0; i < len(slug); i++ {
		c := slug[i]
		switch {
		case isAlnum(c):
			prevHyphen = false
		case c == '-':
			if prevHyphen {
				return fmt.Errorf("%w: consecutive hyphens", ErrBusinessProfileSlugInvalid)
			}
			prevHyphen = true
		default:
			return fmt.Errorf("%w: char %q not allowed", ErrBusinessProfileSlugInvalid, c)
		}
	}
	return nil
}

func isAlnum(c byte) bool {
	return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
}

// generateBusinessUniqueCode draws 4 random bytes and returns them as 8 hex
// chars (lowercase). No DB check here — caller is responsible for the
// uniqueness retry loop. With 4B values the chance of collision per draw
// scales linearly with the workspace count (n / 4e9), still negligible at
// any realistic scale.
func generateBusinessUniqueCode() (string, error) {
	var b [4]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", fmt.Errorf("business unique code rand: %w", err)
	}
	return hex.EncodeToString(b[:]), nil
}

// codeExister is the minimal contract Repo needs from itself to check
// uniqueness during code generation. Defined as an interface so the
// generator function is testable without a real DB.
type codeExister interface {
	businessUniqueCodeExists(ctx context.Context, code string) (bool, error)
}

// generateUniqueBusinessCode loops generateBusinessUniqueCode + a DB
// existence check until it finds an unused code, up to a bounded number
// of attempts. The DB's UNIQUE index is the ultimate guard if a concurrent
// INSERT wins a race after this returns.
func generateUniqueBusinessCode(ctx context.Context, ex codeExister) (string, error) {
	for attempt := 0; attempt < businessUniqueCodeRetries; attempt++ {
		code, err := generateBusinessUniqueCode()
		if err != nil {
			return "", err
		}
		taken, err := ex.businessUniqueCodeExists(ctx, code)
		if err != nil {
			return "", err
		}
		if !taken {
			return code, nil
		}
	}
	return "", fmt.Errorf("could not generate unique business_unique_code after %d attempts", businessUniqueCodeRetries)
}
