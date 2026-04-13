package cloudflare

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strconv"
	"strings"
	"time"
)

// ErrBadSignature is returned by SignatureVerifier.Verify for any failure
// (missing header, decode error, HMAC mismatch, replay).
var ErrBadSignature = errors.New("webhook: bad signature")

// SignatureVerifier enforces Cloudflare's Webhooks v1 signing protocol:
//   Webhook-Signature: time=<unix>,sig1=<hex(hmac_sha256(secret, time + "." + body))>
// Secret NEVER hardcoded — passed in via NewHMACVerifier from *Config.
type SignatureVerifier interface {
	Verify(body []byte, header string, now time.Time) error
}

type hmacVerifier struct {
	secret       []byte
	maxSkew      time.Duration
}

// NewHMACVerifier returns a verifier with the given HMAC secret.
// maxSkew is the max age of a signed timestamp before it is rejected as
// a replay. 5 minutes is a standard default.
func NewHMACVerifier(secret string, maxSkew time.Duration) SignatureVerifier {
	if maxSkew <= 0 {
		maxSkew = 5 * time.Minute
	}
	return &hmacVerifier{secret: []byte(secret), maxSkew: maxSkew}
}

func (v *hmacVerifier) Verify(body []byte, header string, now time.Time) error {
	if header == "" || len(v.secret) == 0 {
		return ErrBadSignature
	}
	parts := strings.Split(header, ",")
	var ts, sig string
	for _, p := range parts {
		kv := strings.SplitN(strings.TrimSpace(p), "=", 2)
		if len(kv) != 2 {
			continue
		}
		switch kv[0] {
		case "time":
			ts = kv[1]
		case "sig1":
			sig = kv[1]
		}
	}
	if ts == "" || sig == "" {
		return ErrBadSignature
	}
	tsInt, err := strconv.ParseInt(ts, 10, 64)
	if err != nil {
		return ErrBadSignature
	}
	eventTime := time.Unix(tsInt, 0)
	age := now.Sub(eventTime)
	if age < -v.maxSkew || age > v.maxSkew {
		return ErrBadSignature
	}

	mac := hmac.New(sha256.New, v.secret)
	mac.Write([]byte(ts))
	mac.Write([]byte{'.'})
	mac.Write(body)
	expected := mac.Sum(nil)

	got, err := hex.DecodeString(sig)
	if err != nil {
		return ErrBadSignature
	}
	if !hmac.Equal(expected, got) {
		return ErrBadSignature
	}
	return nil
}
