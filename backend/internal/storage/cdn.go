package storage

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// DefaultCDNBaseURL is the managed signed-CDN edge — the Cloudflare Worker
// deployed on cdn.rawdrive.in. Used when CDN_BASE_URL / platform_settings
// cdn.base_url is unset.
const DefaultCDNBaseURL = "https://cdn.rawdrive.in"

// cdnSignedURLTTL is the lifetime of a minted signed CDN URL. Short-lived so a
// leaked URL stops working quickly, but long enough to outlast a gallery
// page's render + lazy-load window. Mirrors the Worker's ~1h expectation.
const cdnSignedURLTTL = time.Hour

// SignedCDNURL builds a signed cdn.rawdrive.in URL for a derivative storage key.
//
// It MUST match the Cloudflare Worker
// (deploy/cloudflare/cdn-worker/src/cdn-worker.js) byte-for-byte:
//
//	URL   : <base>/<percent-encoded-key>?exp=<unix>&sig=<hex>
//	canon : <raw-key> + "\n" + <exp>   (raw decoded key; exp = decimal unix seconds)
//	sig   : lowercase hex of HMAC-SHA256(canon, secret)  (secret as UTF-8 string bytes)
//
// The key is signed in its RAW (decoded) form; only the URL path is
// percent-escaped per segment with "/" separators preserved, so the Worker's
// decodeURIComponent recovers the exact raw key it re-signs and compares.
func SignedCDNURL(base, rawKey, secret string, ttl time.Duration) string {
	return signedCDNURLAt(base, rawKey, secret, time.Now().Add(ttl).Unix())
}

// signedCDNURLAt is SignedCDNURL with an explicit expiry. Extracting the
// time-dependent part lets the parity test pin a deterministic golden vector
// (fixed key + exp + secret → fixed sig) and prove Go⇄Worker agreement.
func signedCDNURLAt(base, rawKey, secret string, exp int64) string {
	// Canonical signed string: raw (decoded) key + "\n" + decimal unix exp.
	canonical := rawKey + "\n" + strconv.FormatInt(exp, 10)
	m := hmac.New(sha256.New, []byte(secret))
	m.Write([]byte(canonical))
	sig := hex.EncodeToString(m.Sum(nil))

	segs := strings.Split(rawKey, "/")
	for i, s := range segs {
		segs[i] = url.PathEscape(s)
	}
	return fmt.Sprintf("%s/%s?exp=%d&sig=%s", strings.TrimRight(base, "/"), strings.Join(segs, "/"), exp, sig)
}

// CDNSigner decides whether a derivative storage key is served via the signed
// cdn.rawdrive.in edge or left as a bare key for the JWT-gated /storage proxy.
// Enabled / BaseURL / Secret are resolved in main.go via the standard
// platform_settings → env order (cdn.signed_urls / cdn.base_url /
// cdn.hmac_secret with CDN_SIGNED_URLS / CDN_BASE_URL / CDN_HMAC_SECRET env
// fallbacks).
//
// A nil *CDNSigner, a disabled signer, or a missing secret all degrade to the
// existing behaviour: the bare key is returned unchanged and the frontend
// serves it through /storage (JWT). The flag defaults OFF.
type CDNSigner struct {
	Enabled bool
	BaseURL string
	Secret  string
}

// DerivativeDeliveryURL returns the delivery URL for a derivative storage key.
//
//   - When CDN delivery is active AND the key is a derivative (thumbnails/* or
//     derivatives/*), it returns a short-lived signed cdn.rawdrive.in URL.
//   - Otherwise it returns the key UNCHANGED — current behaviour, where the
//     frontend prefixes /storage/ and fetches it via the JWT-gated proxy.
//
// Originals and masters are NEVER signed: their keys do not carry the
// thumbnails/ or derivatives/ prefix, so they always fall through to /storage.
// This prefix check is the hard scope guard — only derivatives ever reach the
// CDN. Callers must only invoke this AFTER their own access/PIN/gallery-session
// check, since a signed URL is a 1-hour bearer capability.
func (s *CDNSigner) DerivativeDeliveryURL(key string) string {
	if s == nil || !s.Enabled || strings.TrimSpace(s.Secret) == "" || !isDerivativeKey(key) {
		return key
	}
	base := s.BaseURL
	if strings.TrimSpace(base) == "" {
		base = DefaultCDNBaseURL
	}
	return SignedCDNURL(base, key, s.Secret, cdnSignedURLTTL)
}

// isDerivativeKey reports whether a storage key is an in-app derivative (WebP
// thumbnail or display variant) safe to serve via the signed CDN. Originals and
// masters live under other prefixes (workspaces/*, originals/*, …) and are
// deliberately excluded. Legacy fully-qualified URL values stored in
// thumbnail_urls (https://…) also fail this check and are returned unchanged.
func isDerivativeKey(key string) bool {
	return strings.HasPrefix(key, "thumbnails/") || strings.HasPrefix(key, "derivatives/")
}
