// Package viewer issues and verifies the short-lived session JWTs that
// authorise a public viewer to watch a PIN- or invite-protected stream.
//
// M30 / E100-S2 — A separate signing key (loaded from platform_settings
// under streaming.viewer_jwt_signing_key, KEK-encrypted at rest) keeps the
// viewer session boundary isolated from the main user auth JWT key. Key
// rotation cadences therefore remain independent.
package viewer

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// AccessLevel describes how a viewer reached the stream.
type AccessLevel string

const (
	AccessLevelOpen       AccessLevel = "open"
	AccessLevelPIN        AccessLevel = "pin"
	AccessLevelInviteOnly AccessLevel = "invite_only"

	viewerAccessAudience  = "viewer-access"
	viewerRefreshAudience = "viewer-refresh"
)

// IsValid reports whether the access level is one of the allowed values.
func (a AccessLevel) IsValid() bool {
	switch a {
	case AccessLevelOpen, AccessLevelPIN, AccessLevelInviteOnly:
		return true
	}
	return false
}

// Config is the set of parameters the Service needs at construction time.
type Config struct {
	// SigningKey is the HMAC secret used for HS256. Minimum 32 bytes —
	// NewService does not enforce length, but the documented bootstrap
	// path always loads a 32-byte random key out of platform_settings.
	SigningKey []byte

	// SlidingTTL is how long a freshly-issued access token lives before
	// it must be refreshed. Per FR-014-SEC-02 this is 15 minutes.
	SlidingTTL time.Duration

	// MaxLifetime bounds the absolute lifetime of a viewer session: even
	// with refreshes, no session may outlive this. Per FR-014-SEC-02 this
	// is 4 hours.
	MaxLifetime time.Duration

	// Issuer populates the JWT `iss` claim. Defaults to "rawdrive-viewer".
	Issuer string
}

// Claims is the decoded body of a viewer session JWT.
type Claims struct {
	StreamID        string      `json:"stream_id"`
	AccessLevel     AccessLevel `json:"access_level"`
	ViewerSessionID string      `json:"viewer_session_id"`
	jwt.RegisteredClaims
}

// TokenPair is what IssueSession returns: the short-lived access token and
// a longer-lived refresh token bound to the same viewer_session_id.
type TokenPair struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int64  `json:"expires_in"`
	TokenType    string `json:"token_type"`
}

// Service issues and parses viewer session JWTs.
type Service struct {
	cfg Config
}

// NewService constructs a Service. Issuer defaults to rawdrive-viewer when
// blank. SigningKey is not validated for length — the caller is responsible
// for loading a sufficiently long key from platform_settings.
func NewService(cfg Config) *Service {
	if cfg.Issuer == "" {
		cfg.Issuer = "rawdrive-viewer"
	}
	if cfg.SlidingTTL <= 0 {
		cfg.SlidingTTL = 15 * time.Minute
	}
	if cfg.MaxLifetime <= 0 {
		cfg.MaxLifetime = 4 * time.Hour
	}
	return &Service{cfg: cfg}
}

// IssueSession mints a new TokenPair for the given streamID and access level.
func (s *Service) IssueSession(streamID string, level AccessLevel) (*TokenPair, error) {
	if strings.TrimSpace(streamID) == "" {
		return nil, errors.New("viewer: streamID must not be empty")
	}
	if !level.IsValid() {
		return nil, fmt.Errorf("viewer: access level %q is not valid", level)
	}

	viewerSessionID := uuid.NewString()
	now := time.Now().UTC()

	access, err := s.signToken(&Claims{
		StreamID:        streamID,
		AccessLevel:     level,
		ViewerSessionID: viewerSessionID,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    s.cfg.Issuer,
			Subject:   viewerSessionID,
			Audience:  jwt.ClaimStrings{viewerAccessAudience},
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.cfg.SlidingTTL)),
			ID:        uuid.NewString(),
		},
	})
	if err != nil {
		return nil, fmt.Errorf("viewer: sign access: %w", err)
	}

	refresh, err := s.signToken(&Claims{
		StreamID:        streamID,
		AccessLevel:     level,
		ViewerSessionID: viewerSessionID,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    s.cfg.Issuer,
			Subject:   viewerSessionID,
			Audience:  jwt.ClaimStrings{viewerRefreshAudience},
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.cfg.MaxLifetime)),
			ID:        uuid.NewString(),
		},
	})
	if err != nil {
		return nil, fmt.Errorf("viewer: sign refresh: %w", err)
	}

	return &TokenPair{
		AccessToken:  access,
		RefreshToken: refresh,
		ExpiresIn:    int64(s.cfg.SlidingTTL.Seconds()),
		TokenType:    "Bearer",
	}, nil
}

// Parse validates and decodes the token, returning the claims or an error.
func (s *Service) Parse(tokenStr string) (*Claims, error) {
	if strings.TrimSpace(tokenStr) == "" {
		return nil, errors.New("viewer: token must not be empty")
	}
	claims := &Claims{}
	parser := jwt.NewParser(
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithStrictDecoding(),
		jwt.WithExpirationRequired(),
		jwt.WithIssuer(s.cfg.Issuer),
		jwt.WithAudience(viewerAccessAudience),
	)
	token, err := parser.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		if t.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, fmt.Errorf("viewer: unexpected signing alg %q", t.Method.Alg())
		}
		return s.cfg.SigningKey, nil
	})
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, errors.New("viewer: token is not valid")
	}
	if strings.TrimSpace(claims.StreamID) == "" {
		return nil, errors.New("viewer: stream_id claim is required")
	}
	if strings.TrimSpace(claims.ViewerSessionID) == "" {
		return nil, errors.New("viewer: viewer_session_id claim is required")
	}
	if !claims.AccessLevel.IsValid() {
		return nil, fmt.Errorf("viewer: access level %q is not valid", claims.AccessLevel)
	}
	return claims, nil
}

func (s *Service) signToken(claims *Claims) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.cfg.SigningKey)
}
