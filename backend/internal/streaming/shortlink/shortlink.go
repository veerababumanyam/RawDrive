// Package shortlink provides 8-char base62 shortcodes for F-014 stream invite
// links (M34 / E109-C1).
//
// Alphabet excludes visually-ambiguous characters (0, O, I, l, 1) to keep QR
// codes and printed handouts readable. Codes are cryptographically random and
// collide only on astronomical probability; on the rare UNIQUE violation the
// service retries with a fresh code.
package shortlink

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	// Alphabet: 52 chars = 62 base62 minus 0, O, I, l, 1.
	alphabet   = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
	codeLength = 8
	maxRetries = 5
)

// ErrNotFound is returned by Resolve when no shortlink matches.
var ErrNotFound = errors.New("shortlink: not found")

// denyShortcode blocks codes that resemble reserved path prefixes.
// /s/admin, /s/api, /s/null would be confusing operationally.
var denyShortcode = regexp.MustCompile(`(?i)^(admin|api|null|test|root|www)`)

// Service persists shortlinks and their hits.
type Service struct {
	db *pgxpool.Pool
}

// NewService wires the shortlink service to a pgx pool.
func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

// generateCode produces a single random 8-char code from the safe alphabet.
// Exposed for testing via generateCodeFn variable.
var generateCodeFn = generateCode

func generateCode() (string, error) {
	buf := make([]byte, codeLength)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	out := make([]byte, codeLength)
	for i, b := range buf {
		out[i] = alphabet[int(b)%len(alphabet)]
	}
	return string(out), nil
}

// Generate inserts a new shortlink row, retrying on UNIQUE violation.
func (s *Service) Generate(ctx context.Context, streamID, workspaceID uuid.UUID) (string, error) {
	for attempt := 0; attempt < maxRetries; attempt++ {
		code, err := generateCodeFn()
		if err != nil {
			return "", err
		}
		if denyShortcode.MatchString(code) {
			continue
		}
		_, err = s.db.Exec(ctx,
			`INSERT INTO streaming_shortlinks (stream_id, workspace_id, shortcode) VALUES ($1,$2,$3)`,
			streamID, workspaceID, code,
		)
		if err == nil {
			return code, nil
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			continue // UNIQUE violation — retry with a fresh code
		}
		return "", err
	}
	return "", errors.New("shortlink: exhausted retries")
}

// Resolve looks up a shortcode; returns (streamID, revoked, error).
func (s *Service) Resolve(ctx context.Context, shortcode string) (uuid.UUID, bool, error) {
	var streamID uuid.UUID
	var revokedAt *string
	err := s.db.QueryRow(ctx,
		`SELECT stream_id, revoked_at::text FROM streaming_shortlinks WHERE shortcode = $1`,
		shortcode,
	).Scan(&streamID, &revokedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, false, ErrNotFound
	}
	if err != nil {
		return uuid.Nil, false, err
	}
	return streamID, revokedAt != nil, nil
}

// Revoke marks all shortlinks for a stream as revoked.
func (s *Service) Revoke(ctx context.Context, streamID uuid.UUID) error {
	_, err := s.db.Exec(ctx,
		`UPDATE streaming_shortlinks SET revoked_at = NOW() WHERE stream_id = $1 AND revoked_at IS NULL`,
		streamID,
	)
	return err
}

// RecordHit inserts an analytics row. ip is hashed (sha256) before storage.
func (s *Service) RecordHit(ctx context.Context, shortcode, src, rawIP, userAgent string) error {
	src = strings.ToLower(strings.TrimSpace(src))
	ipHash := hashIP(rawIP)
	_, err := s.db.Exec(ctx,
		`INSERT INTO streaming_shortlink_hits (shortcode, src, ip_hash, user_agent) VALUES ($1,$2,$3,$4)`,
		shortcode, src, ipHash, userAgent,
	)
	return err
}

// HashIP is exposed for tests to verify we never store raw IPs.
func HashIP(ip string) string { return hashIP(ip) }

func hashIP(ip string) string {
	sum := sha256.Sum256([]byte(ip))
	return hex.EncodeToString(sum[:])
}

// Alphabet returns the allowed character set — exposed for test assertions.
func Alphabet() string { return alphabet }

// CodeLength is the fixed length of every shortcode.
func CodeLength() int { return codeLength }
