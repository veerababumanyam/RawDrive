package service

import (
	"context"
	"crypto/rand"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// newSignedAccessSvc builds a GalleryAccessService wired with an HMAC signing
// key (the durable, node-portable session path, S4-G4/E) but no repos — the
// session-issuing/validation methods under test never touch the DB.
func newSignedAccessSvc(key []byte) *GalleryAccessService {
	s := &GalleryAccessService{sessionTTL: time.Hour, sessions: map[string]galleryAccessSession{}}
	return s.WithSessionSigningKey(key)
}

func mustKey(t *testing.T) []byte {
	t.Helper()
	k := make([]byte, 32)
	if _, err := rand.Read(k); err != nil {
		t.Fatalf("generate key: %v", err)
	}
	return k
}

// TestSignedSession_ValidOnAnotherNode is the S4-G4/E regression: a session
// minted on "node A" must validate on "node B" so long as both share the
// signing key. The old in-memory map failed this (node B had no entry).
func TestSignedSession_ValidOnAnotherNode(t *testing.T) {
	key := mustKey(t)
	nodeA := newSignedAccessSvc(key)
	nodeB := newSignedAccessSvc(key) // separate process, same shared key

	gid := uuid.New()
	token, err := nodeA.issueSession(gid, gallerySessionScopePassword, "")
	if err != nil {
		t.Fatalf("issueSession: %v", err)
	}
	if token == "" {
		t.Fatal("expected a non-empty signed token")
	}

	if !nodeB.ValidateSession(context.Background(), gid, token) {
		t.Fatal("session minted on node A must validate on node B (S4-G4/E)")
	}

	// Bound to its gallery — a token for gallery A must not unlock gallery B.
	if nodeB.ValidateSession(context.Background(), uuid.New(), token) {
		t.Fatal("session must be bound to its gallery id")
	}
}

// TestSignedSession_WrongKeyRejected proves a token signed with a different key
// (e.g. a forged/rotated key) is rejected — the HMAC actually gates.
func TestSignedSession_WrongKeyRejected(t *testing.T) {
	good := newSignedAccessSvc(mustKey(t))
	bad := newSignedAccessSvc(mustKey(t))

	gid := uuid.New()
	token, err := good.issueSession(gid, gallerySessionScopePassword, "")
	if err != nil {
		t.Fatalf("issueSession: %v", err)
	}
	if bad.ValidateSession(context.Background(), gid, token) {
		t.Fatal("token signed with a different key must not validate")
	}
}

// TestSignedSession_Expired proves expiry is enforced on the stateless path.
// We hand-sign a token whose exp is in the past (mirroring exactly what
// issueSession produces, just with an elapsed lifetime) and confirm the parser
// rejects it. This guards against a future change dropping WithExpirationRequired.
func TestSignedSession_Expired(t *testing.T) {
	key := mustKey(t)
	s := newSignedAccessSvc(key)

	gid := uuid.New()
	past := time.Now().UTC().Add(-2 * time.Minute)
	claims := &gallerySessionClaims{
		GalleryID: gid.String(),
		Scope:     gallerySessionScopePassword,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    gallerySessionIssuer,
			Subject:   gid.String(),
			Audience:  jwt.ClaimStrings{gallerySessionAudience},
			IssuedAt:  jwt.NewNumericDate(past.Add(-time.Minute)),
			NotBefore: jwt.NewNumericDate(past.Add(-time.Minute)),
			ExpiresAt: jwt.NewNumericDate(past),
			ID:        uuid.NewString(),
		},
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(key)
	if err != nil {
		t.Fatalf("sign expired token: %v", err)
	}
	if s.ValidateSession(context.Background(), gid, signed) {
		t.Fatal("an already-expired session must not validate")
	}
	if _, ok := s.GalleryIDFromSession(context.Background(), signed); ok {
		t.Fatal("an expired session must not yield a gallery id")
	}
}

// TestSignedSession_GalleryIDFromSession proves the byte-path helper (S4-G1)
// recovers the bound gallery id from a valid token and rejects garbage.
func TestSignedSession_GalleryIDFromSession(t *testing.T) {
	key := mustKey(t)
	s := newSignedAccessSvc(key)

	gid := uuid.New()
	token, err := s.IssueShareSession(gid, "share-tok-123")
	if err != nil {
		t.Fatalf("IssueShareSession: %v", err)
	}

	got, ok := s.GalleryIDFromSession(context.Background(), token)
	if !ok || got != gid {
		t.Fatalf("GalleryIDFromSession = %v,%v want %v,true", got, ok, gid)
	}

	if _, ok := s.GalleryIDFromSession(context.Background(), "not-a-token"); ok {
		t.Fatal("garbage token must not yield a gallery id")
	}
	if _, ok := s.GalleryIDFromSession(context.Background(), ""); ok {
		t.Fatal("empty token must not yield a gallery id")
	}
}

// TestLegacyFallback_SingleNodeOnly documents the no-key fallback: it still
// works on the SAME instance (so dev/test without a key keeps functioning) but
// is inherently single-node. This guards the fail-soft branch in main.go.
func TestLegacyFallback_SingleNodeOnly(t *testing.T) {
	node := &GalleryAccessService{sessionTTL: time.Hour, sessions: map[string]galleryAccessSession{}}

	gid := uuid.New()
	token, err := node.issueSession(gid, gallerySessionScopePassword, "")
	if err != nil {
		t.Fatalf("issueSession: %v", err)
	}
	if !node.ValidateSession(context.Background(), gid, token) {
		t.Fatal("legacy in-memory session must validate on the same node")
	}

	// A second instance (no shared key, separate map) cannot see it — this is
	// exactly the prod failure S4-G4/E fixes by switching to the signed path.
	other := &GalleryAccessService{sessionTTL: time.Hour, sessions: map[string]galleryAccessSession{}}
	if other.ValidateSession(context.Background(), gid, token) {
		t.Fatal("legacy session must NOT validate on a different instance (single-node only)")
	}
}
