package viewer

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestReplayGate_BeforeExpiry_ReturnsPlayback(t *testing.T) {
	now := time.Date(2026, 4, 14, 12, 0, 0, 0, time.UTC)
	clock := &manualClock{t: now}
	signer := &fakeSigner{url: "https://cf.example/signed", expiresAt: now.Add(5 * time.Minute)}

	g := NewReplayGate(signer, 48*time.Hour, clock.Now)

	in := ReplayInputs{
		StreamID:      uuid.New(),
		State:         ReplayAvailable,
		ExpiresAt:     now.Add(72 * time.Hour),
		ReplayVideoID: "vid-1",
		// Client expiry input — must be IGNORED by server-authoritative gate.
		ClientExpiresAt: now.Add(-1 * time.Hour),
	}
	d, err := g.Decide(context.Background(), in)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if !d.Allowed {
		t.Fatal("want Allowed=true")
	}
	if d.PlaybackURL != "https://cf.example/signed" {
		t.Fatalf("want signed URL, got %q", d.PlaybackURL)
	}
	if d.BannerFlag {
		t.Fatal("want BannerFlag=false (outside 48h warn window)")
	}
}

func TestReplayGate_AfterExpiry_ReturnsErr410Equivalent(t *testing.T) {
	now := time.Date(2026, 4, 14, 12, 0, 0, 0, time.UTC)
	clock := &manualClock{t: now}
	signer := &fakeSigner{}

	g := NewReplayGate(signer, 48*time.Hour, clock.Now)
	in := ReplayInputs{
		State:     ReplayAvailable,
		ExpiresAt: now.Add(-1 * time.Second),
	}
	d, err := g.Decide(context.Background(), in)
	if !errors.Is(err, ErrReplayExpired) {
		t.Fatalf("want ErrReplayExpired, got %v", err)
	}
	if d.Allowed {
		t.Fatal("want Allowed=false on expiry")
	}
	if signer.calls != 0 {
		t.Fatal("signer must not be called on expired replay")
	}
}

func TestReplayGate_48hBefore_ReturnsBannerFlag(t *testing.T) {
	now := time.Date(2026, 4, 14, 12, 0, 0, 0, time.UTC)
	clock := &manualClock{t: now}
	signer := &fakeSigner{url: "https://cf.example/signed", expiresAt: now.Add(5 * time.Minute)}

	g := NewReplayGate(signer, 48*time.Hour, clock.Now)
	in := ReplayInputs{
		State:         ReplayAvailable,
		ExpiresAt:     now.Add(47 * time.Hour),
		ReplayVideoID: "vid-2",
	}
	d, err := g.Decide(context.Background(), in)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if !d.Allowed {
		t.Fatal("want Allowed=true (still within expiry)")
	}
	if !d.BannerFlag {
		t.Fatal("want BannerFlag=true within 48h warn window")
	}
}

func TestReplayGate_ServerAuthoritative_IgnoresClientExpiry(t *testing.T) {
	now := time.Date(2026, 4, 14, 12, 0, 0, 0, time.UTC)
	clock := &manualClock{t: now}
	signer := &fakeSigner{}

	g := NewReplayGate(signer, 48*time.Hour, clock.Now)

	// Server says expired; client claims fresh for days.
	in := ReplayInputs{
		State:           ReplayAvailable,
		ExpiresAt:       now.Add(-10 * time.Minute),
		ClientExpiresAt: now.Add(72 * time.Hour),
	}
	_, err := g.Decide(context.Background(), in)
	if !errors.Is(err, ErrReplayExpired) {
		t.Fatalf("server must ignore client expiry and return ErrReplayExpired, got %v", err)
	}
}

type fakeSigner struct {
	url       string
	expiresAt time.Time
	err       error
	calls     int
}

func (f *fakeSigner) SignPlaybackURL(_ context.Context, _ string, _ time.Duration) (string, time.Time, error) {
	f.calls++
	if f.err != nil {
		return "", time.Time{}, f.err
	}
	return f.url, f.expiresAt, nil
}
