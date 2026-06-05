package storage

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"
	"testing"
	"time"
)

// workerSig recomputes the expected signature exactly the way the Cloudflare
// Worker does (crypto.subtle.sign("HMAC-SHA256", secret-as-UTF-8-bytes,
// `${key}\n${exp}`) → lowercase hex). It is intentionally an INDEPENDENT
// implementation from SignedCDNURL so the test proves agreement rather than
// re-deriving the production code's own arithmetic.
func workerSig(rawKey, secret string, exp int64) string {
	m := hmac.New(sha256.New, []byte(secret))
	m.Write([]byte(fmt.Sprintf("%s\n%d", rawKey, exp)))
	return hex.EncodeToString(m.Sum(nil))
}

// TestSignedCDNURL_GoldenVector pins one fixed (key, exp, secret) → sig vector.
// The hex below was computed out-of-band (Python hmac, matching the Worker's
// crypto.subtle) and is hard-pinned so a future change to the canonical string,
// the secret-byte handling, or the hash silently breaking Worker parity fails
// this test.
func TestSignedCDNURL_GoldenVector(t *testing.T) {
	const (
		base   = "https://cdn.rawdrive.in"
		secret = "test-cdn-secret-vector"
		key    = "derivatives/9b/display_webp.webp"
		exp    = int64(1700000000)
		// Independently computed: hex(HMAC_SHA256("derivatives/9b/display_webp.webp\n1700000000", "test-cdn-secret-vector"))
		wantSig = "2ded5b3d4ed41cb249e5d1059035b0363f9ed73b633795b2de1de9b8bc97af60"
		wantURL = "https://cdn.rawdrive.in/derivatives/9b/display_webp.webp?exp=1700000000&sig=" +
			"2ded5b3d4ed41cb249e5d1059035b0363f9ed73b633795b2de1de9b8bc97af60"
	)

	// Cross-check the pinned golden against the independent Worker-style impl.
	if got := workerSig(key, secret, exp); got != wantSig {
		t.Fatalf("golden vector drift: independent worker sig = %q, pinned = %q", got, wantSig)
	}

	got := signedCDNURLAt(base, key, secret, exp)
	if got != wantURL {
		t.Fatalf("signedCDNURLAt mismatch:\n got  %q\n want %q", got, wantURL)
	}
}

// TestSignedCDNURL_PathEscaping proves a key containing a space and parentheses
// (the canonical RawDrive test-photo filename shape, e.g. "Wedding (42).jpg") is
// percent-escaped per segment in the URL path — while the SIGNATURE is still
// computed over the RAW (unescaped) key, which is what the Worker re-signs after
// decodeURIComponent. "/" separators are preserved.
func TestSignedCDNURL_PathEscaping(t *testing.T) {
	const (
		base   = "https://cdn.rawdrive.in"
		secret = "test-cdn-secret-vector"
		rawKey = "thumbnails/Wedding (42)/thumb_md_webp.webp"
		exp    = int64(1700000000)
		// Independently computed over the RAW key (with the space + parens):
		wantSig         = "e9fda86216ee89d72ef51277fa8a296e308db3786c971a59284fd23a8b7acafc"
		wantEscapedPath = "thumbnails/Wedding%20%2842%29/thumb_md_webp.webp"
	)

	if got := workerSig(rawKey, secret, exp); got != wantSig {
		t.Fatalf("escaping golden drift: independent worker sig = %q, pinned = %q", got, wantSig)
	}

	got := signedCDNURLAt(base, rawKey, secret, exp)
	wantURL := fmt.Sprintf("%s/%s?exp=%d&sig=%s", base, wantEscapedPath, exp, wantSig)
	if got != wantURL {
		t.Fatalf("path-escaping mismatch:\n got  %q\n want %q", got, wantURL)
	}
	// Defensive: the raw space/parens must not leak into the emitted URL.
	for _, bad := range []string{" ", "(", ")"} {
		if strings.Contains(got, bad) {
			t.Errorf("emitted URL contains unescaped %q: %q", bad, got)
		}
	}
}

// TestSignedCDNURL_TrimsTrailingSlashBase ensures a base with a trailing slash
// does not produce a double slash before the key.
func TestSignedCDNURL_TrimsTrailingSlashBase(t *testing.T) {
	got := signedCDNURLAt("https://cdn.rawdrive.in/", "derivatives/x/display_webp.webp", "s", 1)
	if strings.Contains(got, "in//derivatives") {
		t.Fatalf("double slash after base: %q", got)
	}
}

// TestSignedCDNURL_PublicTTLWrapper proves the public SignedCDNURL wrapper signs
// with a future expiry (now + ttl) and the same canonical form, by recomputing
// the signature from the exp it embedded.
func TestSignedCDNURL_PublicTTLWrapper(t *testing.T) {
	const (
		base   = "https://cdn.rawdrive.in"
		secret = "test-cdn-secret-vector"
		key    = "thumbnails/abc/thumb_sm_webp.webp"
	)
	before := time.Now().Add(time.Hour).Unix()
	got := SignedCDNURL(base, key, secret, time.Hour)
	after := time.Now().Add(time.Hour).Unix()

	// Pull exp + sig back out of the URL and verify they are internally
	// consistent (sig is HMAC over key\nexp) and exp is within [before, after].
	var exp int64
	var sig string
	q := got[strings.Index(got, "?")+1:]
	for _, kv := range strings.Split(q, "&") {
		switch {
		case strings.HasPrefix(kv, "exp="):
			parsed, err := strconv.ParseInt(strings.TrimPrefix(kv, "exp="), 10, 64)
			if err != nil {
				t.Fatalf("exp not a base-10 int: %q (%v)", kv, err)
			}
			exp = parsed
		case strings.HasPrefix(kv, "sig="):
			sig = strings.TrimPrefix(kv, "sig=")
		}
	}
	if exp < before || exp > after {
		t.Fatalf("exp %d outside [%d,%d] (ttl not applied as now+ttl)", exp, before, after)
	}
	if want := workerSig(key, secret, exp); want != sig {
		t.Fatalf("ttl-wrapper sig mismatch: got %q want %q", sig, want)
	}
}

// TestCDNSigner_DerivativeDeliveryURL covers the scope guard: only derivative
// keys are signed, and only when enabled with a secret; everything else (and a
// nil signer) returns the key unchanged for the /storage proxy.
func TestCDNSigner_DerivativeDeliveryURL(t *testing.T) {
	on := &CDNSigner{Enabled: true, BaseURL: "https://cdn.rawdrive.in", Secret: "s"}

	t.Run("signs derivatives prefix", func(t *testing.T) {
		got := on.DerivativeDeliveryURL("derivatives/abc/display_webp.webp")
		if !strings.HasPrefix(got, "https://cdn.rawdrive.in/derivatives/abc/display_webp.webp?exp=") {
			t.Fatalf("derivative not signed: %q", got)
		}
	})

	t.Run("signs thumbnails prefix", func(t *testing.T) {
		got := on.DerivativeDeliveryURL("thumbnails/abc/thumb_sm_webp.webp")
		if !strings.HasPrefix(got, "https://cdn.rawdrive.in/thumbnails/abc/thumb_sm_webp.webp?exp=") {
			t.Fatalf("thumbnail not signed: %q", got)
		}
	})

	t.Run("never signs originals/masters", func(t *testing.T) {
		for _, k := range []string{
			"workspaces/w1/original.jpg",
			"originals/abc/master.cr3",
			"https://example.com/legacy.jpg", // legacy fully-qualified value
		} {
			if got := on.DerivativeDeliveryURL(k); got != k {
				t.Errorf("non-derivative %q was rewritten to %q", k, got)
			}
		}
	})

	t.Run("disabled returns key unchanged", func(t *testing.T) {
		off := &CDNSigner{Enabled: false, BaseURL: "https://cdn.rawdrive.in", Secret: "s"}
		k := "derivatives/abc/display_webp.webp"
		if got := off.DerivativeDeliveryURL(k); got != k {
			t.Errorf("disabled signer rewrote %q to %q", k, got)
		}
	})

	t.Run("enabled but no secret returns key unchanged", func(t *testing.T) {
		noSecret := &CDNSigner{Enabled: true, BaseURL: "https://cdn.rawdrive.in", Secret: " "}
		k := "derivatives/abc/display_webp.webp"
		if got := noSecret.DerivativeDeliveryURL(k); got != k {
			t.Errorf("secret-less signer rewrote %q to %q", k, got)
		}
	})

	t.Run("nil signer returns key unchanged", func(t *testing.T) {
		var nilSigner *CDNSigner
		k := "derivatives/abc/display_webp.webp"
		if got := nilSigner.DerivativeDeliveryURL(k); got != k {
			t.Errorf("nil signer rewrote %q to %q", k, got)
		}
	})

	t.Run("defaults base url when unset", func(t *testing.T) {
		noBase := &CDNSigner{Enabled: true, Secret: "s"}
		got := noBase.DerivativeDeliveryURL("derivatives/abc/display_webp.webp")
		if !strings.HasPrefix(got, DefaultCDNBaseURL+"/") {
			t.Fatalf("default base not applied: %q", got)
		}
	})
}
