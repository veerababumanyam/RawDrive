package service

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// These tests cover the pure-logic portions of APIKeyService that DON'T
// hit the database: cleartext generation format, hash determinism,
// scope validation, and the error paths in CreateKey and VerifyKey
// before they reach the repo. Repo-touching paths are tested via
// integration tests under backend/internal/database that load real SQL.

// TestAPIKey_GenerateProducesValidFormat verifies the format invariants.
func TestAPIKey_GenerateProducesValidFormat(t *testing.T) {
	cleartext, prefix, err := generateAPIKey()
	if err != nil {
		t.Fatalf("generateAPIKey: %v", err)
	}
	if !strings.HasPrefix(cleartext, "rd_") {
		t.Errorf("missing rd_ prefix: %q", cleartext)
	}
	body := strings.TrimPrefix(cleartext, "rd_")
	if len(body) != 32 {
		t.Errorf("body length: want 32 hex chars, got %d", len(body))
	}
	for _, c := range body {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) {
			t.Errorf("non-hex char %q in body", c)
			break
		}
	}
	if len(prefix) != 8 {
		t.Errorf("prefix length: want 8, got %d", len(prefix))
	}
	if prefix != body[:8] {
		t.Errorf("prefix mismatch: want %q, got %q", body[:8], prefix)
	}
}

// TestAPIKey_GenerateUniqueness verifies that 100 successive calls produce
// distinct keys (entropy check).
func TestAPIKey_GenerateUniqueness(t *testing.T) {
	seen := make(map[string]bool, 100)
	for i := 0; i < 100; i++ {
		k, _, err := generateAPIKey()
		if err != nil {
			t.Fatal(err)
		}
		if seen[k] {
			t.Errorf("duplicate key in 100 generations: %s", k)
		}
		seen[k] = true
	}
}

// TestAPIKey_HashDeterministic verifies that the same cleartext always
// produces the same hash, and different cleartexts produce different
// hashes.
func TestAPIKey_HashDeterministic(t *testing.T) {
	a := hashAPIKey("rd_abc123")
	b := hashAPIKey("rd_abc123")
	c := hashAPIKey("rd_abc124")

	if a != b {
		t.Errorf("hash not deterministic: %q vs %q", a, b)
	}
	if a == c {
		t.Errorf("collision: %q == %q", a, c)
	}
	if len(a) != 64 { // SHA-256 hex
		t.Errorf("hash length: want 64, got %d", len(a))
	}
}

// TestHasScope verifies the scope check helper.
func TestHasScope(t *testing.T) {
	key := &repository.APIKey{
		Scopes: []string{"galleries:read", "assets:write"},
	}
	if !HasScope(key, "galleries:read") {
		t.Error("missing galleries:read")
	}
	if HasScope(key, "galleries:write") {
		t.Error("falsely matched galleries:write")
	}
	if HasScope(nil, "anything") {
		t.Error("nil key should never have scope")
	}
}

// TestAPIKey_CreateKey_RejectsEmptyName verifies validation.
func TestAPIKey_CreateKey_RejectsEmptyName(t *testing.T) {
	svc := &APIKeyService{} // repo not used in this validation path
	_, err := svc.CreateKey(context.Background(), CreateAPIKeyInput{
		WorkspaceID: uuid.New(),
		Name:        "",
		Scopes:      []string{"galleries:read"},
	})
	if !errors.Is(err, ErrAPIKeyInvalidName) {
		t.Errorf("want ErrAPIKeyInvalidName, got %v", err)
	}
}

// TestAPIKey_CreateKey_RejectsInvalidScope verifies scope whitelist.
func TestAPIKey_CreateKey_RejectsInvalidScope(t *testing.T) {
	svc := &APIKeyService{}
	_, err := svc.CreateKey(context.Background(), CreateAPIKeyInput{
		WorkspaceID: uuid.New(),
		Name:        "test key",
		Scopes:      []string{"galleries:read", "admin:everything"},
	})
	if !errors.Is(err, ErrAPIKeyInvalidScope) {
		t.Errorf("want ErrAPIKeyInvalidScope, got %v", err)
	}
}

// TestAPIKey_VerifyKey_RejectsMalformed verifies the format gate.
func TestAPIKey_VerifyKey_RejectsMalformed(t *testing.T) {
	svc := &APIKeyService{}
	_, err := svc.VerifyKey(context.Background(), "not-an-api-key")
	if !errors.Is(err, ErrAPIKeyMalformed) {
		t.Errorf("want ErrAPIKeyMalformed, got %v", err)
	}
}

// TestAPIKey_VerifyKey_RejectsTooShort verifies the length gate after
// the rd_ prefix is stripped.
func TestAPIKey_VerifyKey_RejectsTooShort(t *testing.T) {
	svc := &APIKeyService{}
	_, err := svc.VerifyKey(context.Background(), "rd_abc")
	if !errors.Is(err, ErrAPIKeyMalformed) {
		t.Errorf("want ErrAPIKeyMalformed for short key, got %v", err)
	}
}
