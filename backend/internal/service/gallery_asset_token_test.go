package service

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

// TestAssetToken_RoundTrip: a minted asset-access token validates back to the
// gallery it was bound to.
func TestAssetToken_RoundTrip(t *testing.T) {
	svc := newSignedAccessSvc(mustKey(t))
	gid := uuid.New()

	at, err := svc.IssueAssetAccessToken(gid)
	if err != nil {
		t.Fatalf("IssueAssetAccessToken: %v", err)
	}
	got, ok := svc.GalleryIDFromAssetToken(context.Background(), at)
	if !ok || got != gid {
		t.Fatalf("GalleryIDFromAssetToken = (%v, %v), want (%v, true)", got, ok, gid)
	}
}

// TestAssetToken_NotAcceptedAsSession is the core SEC-1 guarantee: a leaked
// ?at= URL token (distinct audience) must NOT be replayable as a durable
// gallery session that unlocks the gallery UI / gated JSON APIs.
func TestAssetToken_NotAcceptedAsSession(t *testing.T) {
	svc := newSignedAccessSvc(mustKey(t))
	gid := uuid.New()

	at, err := svc.IssueAssetAccessToken(gid)
	if err != nil {
		t.Fatalf("IssueAssetAccessToken: %v", err)
	}
	if svc.ValidateSession(context.Background(), gid, at) {
		t.Fatal("asset-access token was accepted as a session — audience separation broken (SEC-1 regression)")
	}
	if _, ok := svc.GalleryIDFromSession(context.Background(), at); ok {
		t.Fatal("asset-access token resolved via GalleryIDFromSession — audience separation broken")
	}
}

// TestSession_NotAcceptedAsAssetToken: the inverse — a durable session token
// must NOT validate via the asset-token path either.
func TestSession_NotAcceptedAsAssetToken(t *testing.T) {
	svc := newSignedAccessSvc(mustKey(t))
	gid := uuid.New()

	sess, err := svc.issueSession(gid, gallerySessionScopePassword, "")
	if err != nil {
		t.Fatalf("issueSession: %v", err)
	}
	if _, ok := svc.GalleryIDFromAssetToken(context.Background(), sess); ok {
		t.Fatal("session token was accepted as an asset-access token — audience separation broken")
	}
}

// TestAssetToken_WrongKeyRejected: a token signed under one key must not
// validate under another (different node key / forged token).
func TestAssetToken_WrongKeyRejected(t *testing.T) {
	issuer := newSignedAccessSvc(mustKey(t))
	verifier := newSignedAccessSvc(mustKey(t)) // different key

	at, err := issuer.IssueAssetAccessToken(uuid.New())
	if err != nil {
		t.Fatalf("IssueAssetAccessToken: %v", err)
	}
	if _, ok := verifier.GalleryIDFromAssetToken(context.Background(), at); ok {
		t.Fatal("asset token validated under a different signing key")
	}
}

// TestAssetToken_RequiresSigningKey: without a signing key (legacy single-node
// fallback / misconfig), minting errors and validation fails closed rather than
// issuing an unverifiable token.
func TestAssetToken_RequiresSigningKey(t *testing.T) {
	svc := NewGalleryAccessService(nil, nil) // no signing key
	if _, err := svc.IssueAssetAccessToken(uuid.New()); err == nil {
		t.Fatal("expected error minting asset token without a signing key")
	}
	if _, ok := svc.GalleryIDFromAssetToken(context.Background(), "anything"); ok {
		t.Fatal("asset-token validation should fail closed without a signing key")
	}
}

// TestAssetToken_EmptyRejected: empty token never validates.
func TestAssetToken_EmptyRejected(t *testing.T) {
	svc := newSignedAccessSvc(mustKey(t))
	if _, ok := svc.GalleryIDFromAssetToken(context.Background(), ""); ok {
		t.Fatal("empty asset token validated")
	}
}
