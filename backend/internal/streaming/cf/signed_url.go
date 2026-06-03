package cf

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// SignedURLService mints short-lived signed playback URLs for Cloudflare
// Stream live inputs and replays. Per NFR-014-PERF-01 the hot path must
// complete under 50ms p95; the implementation therefore avoids any I/O.
//
// Signing model: HS256 JWT whose claims identify the video (live input UID
// or recording videoID), a key ID (`kid`), expiration, and an optional
// allowed-origin restriction. The signed token is appended as `?token=...`
// to the CF playback URL. Secrets come from *Config — never hardcoded.
type SignedURLService struct {
	cfg    *Config
	clock  func() time.Time
	maxTTL time.Duration // absolute cap on exp — Cloudflare signed URLs should never outlive the viewer session
}

// NewSignedURLService builds a service. If clock is nil, time.Now is used.
func NewSignedURLService(cfg *Config) *SignedURLService {
	return &SignedURLService{
		cfg:    cfg,
		clock:  time.Now,
		maxTTL: 4 * time.Hour,
	}
}

// PlaybackClaims is the JWT body for a signed playback URL.
type PlaybackClaims struct {
	Sub           string   `json:"sub"` // videoID or liveInputUID
	AllowedOrigin []string `json:"ao,omitempty"`
	jwt.RegisteredClaims
}

// PlaybackURLRequest is the input to Sign.
type PlaybackURLRequest struct {
	VideoID    string    // CF videoID (recording) or liveInputUID
	SessionExp time.Time // viewer session expiry — exp is capped at this
	Origin     string    // request Origin header, for allowed-list enforcement
}

// PlaybackURLResponse is the returned URL + expiry.
type PlaybackURLResponse struct {
	URL       string
	Token     string
	ExpiresAt time.Time
}

var (
	ErrNoSigningKey     = errors.New("signed-url: signing key not configured")
	ErrOriginNotAllowed = errors.New("signed-url: origin not in allow-list")
	ErrMissingVideoID   = errors.New("signed-url: video id required")
)

// Sign mints a signed playback URL. It performs no I/O.
//
// Behavior:
//   - Exp = min(sessionExp, now + maxTTL). Must be > now or error.
//   - Origin must be empty or present in cfg.AllowedOrigins; tested in
//     handler layer but re-checked here for defense in depth.
//   - Returns ErrNoSigningKey if cfg.SigningKey is blank.
func (s *SignedURLService) Sign(req PlaybackURLRequest) (*PlaybackURLResponse, error) {
	if s.cfg == nil || s.cfg.SigningKey == "" {
		return nil, ErrNoSigningKey
	}
	if req.VideoID == "" {
		return nil, ErrMissingVideoID
	}
	if req.Origin != "" && !s.originAllowed(req.Origin) {
		return nil, ErrOriginNotAllowed
	}

	now := s.clock()
	exp := req.SessionExp
	cap := now.Add(s.maxTTL)
	if exp.IsZero() || exp.After(cap) {
		exp = cap
	}
	if !exp.After(now) {
		return nil, fmt.Errorf("signed-url: exp %v not after now %v", exp, now)
	}

	claims := &PlaybackClaims{
		Sub:           req.VideoID,
		AllowedOrigin: originList(req.Origin),
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(exp),
			NotBefore: jwt.NewNumericDate(now),
			Issuer:    "rawdrive-cf",
			Subject:   req.VideoID,
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	// kid (key ID) distinguishes signing-key generations for rotation.
	// Sourced from platform_settings via Config.SigningKeyID; "v1" is the
	// greenfield default so existing tokens stay valid after cfg is wired.
	kid := s.cfg.SigningKeyID
	if kid == "" {
		kid = "v1"
	}
	tok.Header["kid"] = kid
	signed, err := tok.SignedString([]byte(s.cfg.SigningKey))
	if err != nil {
		return nil, fmt.Errorf("signed-url: sign: %w", err)
	}

	url := fmt.Sprintf("https://customer-%s.cloudflarestream.com/%s/manifest/video.m3u8?token=%s",
		s.cfg.AccountID, req.VideoID, signed)

	return &PlaybackURLResponse{URL: url, Token: signed, ExpiresAt: exp}, nil
}

// Parse validates a token — used by tests and (optionally) by the CF edge
// verification shadow logic.
func (s *SignedURLService) Parse(token string) (*PlaybackClaims, error) {
	claims := &PlaybackClaims{}
	t, err := jwt.ParseWithClaims(token, claims, func(t *jwt.Token) (any, error) {
		if t.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, fmt.Errorf("unexpected alg %q", t.Method.Alg())
		}
		return []byte(s.cfg.SigningKey), nil
	})
	if err != nil {
		return nil, err
	}
	if !t.Valid {
		return nil, errors.New("token invalid")
	}
	return claims, nil
}

func (s *SignedURLService) originAllowed(origin string) bool {
	if len(s.cfg.AllowedOrigins) == 0 {
		return true // empty allow-list = permit all (handler layer enforces stricter)
	}
	for _, o := range s.cfg.AllowedOrigins {
		if o == origin {
			return true
		}
	}
	return false
}

func originList(o string) []string {
	if o == "" {
		return nil
	}
	return []string{o}
}
