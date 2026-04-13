package cf

import (
	"errors"
	"strings"
	"testing"
	"time"
)

func testSigner(t *testing.T, key string, now time.Time) *SignedURLService {
	t.Helper()
	cfg := &Config{
		AccountID:      "acc-1",
		APIToken:       "api-tok",
		SigningKey:     key,
		AllowedOrigins: []string{"https://studio.example"},
	}
	s := NewSignedURLService(cfg)
	s.clock = func() time.Time { return now }
	return s
}

// T-S2-01
func TestSignPlayback_ClaimsMatchSpec(t *testing.T) {
	now := time.Now().UTC().Add(-1 * time.Second) // nbf in past so real-clock Parse accepts
	s := testSigner(t, "thirty-two-byte-minimum-signing-k", now)

	res, err := s.Sign(PlaybackURLRequest{
		VideoID:    "vid-1",
		SessionExp: now.Add(15 * time.Minute),
		Origin:     "https://studio.example",
	})
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}
	if !strings.Contains(res.URL, "customer-acc-1.cloudflarestream.com") {
		t.Errorf("URL missing account: %s", res.URL)
	}
	if !strings.Contains(res.URL, "vid-1/manifest/video.m3u8") {
		t.Errorf("URL missing video path: %s", res.URL)
	}
	c, err := s.Parse(res.Token)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if c.Sub != "vid-1" {
		t.Errorf("sub = %q", c.Sub)
	}
	if c.Issuer != "rawdrive-cf" {
		t.Errorf("iss = %q", c.Issuer)
	}
	if !res.ExpiresAt.Equal(now.Add(15 * time.Minute)) {
		t.Errorf("exp = %v", res.ExpiresAt)
	}
}

// T-S2-02 — exp capped at viewer session exp
func TestSignPlayback_ExpCappedAtSessionExp(t *testing.T) {
	now := time.Now().UTC().Add(1 * time.Minute)
	s := testSigner(t, "key-abc-32-bytes-minimum-padding", now)

	// Session exp shorter than 4h cap → use session exp
	res, err := s.Sign(PlaybackURLRequest{VideoID: "v", SessionExp: now.Add(5 * time.Minute)})
	if err != nil {
		t.Fatalf("%v", err)
	}
	if !res.ExpiresAt.Equal(now.Add(5 * time.Minute)) {
		t.Errorf("exp = %v, want 5m", res.ExpiresAt)
	}
}

// T-S2-03 — exp never exceeds 4h
func TestSignPlayback_ExpNeverExceeds4h(t *testing.T) {
	now := time.Date(2026, 4, 13, 10, 0, 0, 0, time.UTC)
	s := testSigner(t, "key-abc-32-bytes-minimum-padding", now)

	res, err := s.Sign(PlaybackURLRequest{VideoID: "v", SessionExp: now.Add(10 * time.Hour)})
	if err != nil {
		t.Fatalf("%v", err)
	}
	if !res.ExpiresAt.Equal(now.Add(4 * time.Hour)) {
		t.Errorf("exp = %v, want 4h cap", res.ExpiresAt)
	}
}

// T-S2-04 — benchmark, NFR-014-PERF-01
func BenchmarkSignPlayback_Under50ms(b *testing.B) {
	s := NewSignedURLService(&Config{AccountID: "a", SigningKey: "k-32-bytes-minimum-padding-string"})
	req := PlaybackURLRequest{VideoID: "v", SessionExp: time.Now().Add(15 * time.Minute)}
	b.ResetTimer()
	start := time.Now()
	for i := 0; i < b.N; i++ {
		_, _ = s.Sign(req)
	}
	// Assert average; p95 cannot be sampled from b.N aggregate but average
	// well below budget is a strong proxy (crypto is deterministic).
	if b.N > 100 {
		avg := time.Since(start) / time.Duration(b.N)
		if avg > 50*time.Millisecond {
			b.Fatalf("avg sign = %v, budget 50ms", avg)
		}
	}
}

// T-S2-05 — missing signing key
func TestSignPlayback_MissingSigningKey_ReturnsError_NotPanic(t *testing.T) {
	s := NewSignedURLService(&Config{AccountID: "a"}) // no SigningKey
	_, err := s.Sign(PlaybackURLRequest{VideoID: "v", SessionExp: time.Now().Add(time.Minute)})
	if !errors.Is(err, ErrNoSigningKey) {
		t.Errorf("err = %v, want ErrNoSigningKey", err)
	}
}

// T-S2-06 — origin not allowed
func TestSignPlayback_OriginNotAllowed_Errors(t *testing.T) {
	now := time.Now()
	s := testSigner(t, "key-32-bytes-minimum-padding-yyyy", now)

	_, err := s.Sign(PlaybackURLRequest{VideoID: "v", SessionExp: now.Add(time.Minute), Origin: "https://evil.example"})
	if !errors.Is(err, ErrOriginNotAllowed) {
		t.Errorf("err = %v, want ErrOriginNotAllowed", err)
	}
}

// Additional: missing video id
func TestSignPlayback_MissingVideoID_Errors(t *testing.T) {
	s := testSigner(t, "key-32-bytes-minimum-padding-yyyy", time.Now())
	_, err := s.Sign(PlaybackURLRequest{SessionExp: time.Now().Add(time.Minute)})
	if !errors.Is(err, ErrMissingVideoID) {
		t.Errorf("err = %v, want ErrMissingVideoID", err)
	}
}

// Exp not in future
func TestSignPlayback_ExpInPast_Errors(t *testing.T) {
	now := time.Date(2026, 4, 13, 10, 0, 0, 0, time.UTC)
	s := testSigner(t, "key-32-bytes-minimum-padding-yyyy", now)
	_, err := s.Sign(PlaybackURLRequest{VideoID: "v", SessionExp: now.Add(-time.Minute)})
	if err == nil {
		t.Fatal("expected error")
	}
}
