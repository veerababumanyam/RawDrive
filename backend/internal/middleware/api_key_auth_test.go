package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// stubVerifier returns a fixed key (or error) regardless of cleartext.
type stubVerifier struct {
	key *repository.APIKey
	err error
}

func (s stubVerifier) VerifyKey(ctx context.Context, cleartext string) (*repository.APIKey, error) {
	if s.err != nil {
		return nil, s.err
	}
	return s.key, nil
}

// TestAPIKeyAuthPopulatesJWTClaims is the S5-G3 regression guard: after a key
// is verified, downstream handlers reading middleware.JWTClaimsFromContext must
// see sub + workspace_id populated (and a non-nil actor), otherwise role-gated
// /api/v1/dp/* routes 401 and audit attributes actions to uuid.Nil.
func TestAPIKeyAuthPopulatesJWTClaims(t *testing.T) {
	wsID := uuid.New()
	owner := uuid.New()
	key := &repository.APIKey{
		ID:          uuid.New(),
		WorkspaceID: wsID,
		Name:        "ci-bot",
		KeyPrefix:   "rd_abcde",
		Scopes:      []string{"galleries:read"},
		CreatedBy:   &owner,
		IsActive:    true,
	}

	var gotClaims map[string]interface{}
	var gotActor uuid.UUID
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotClaims = JWTClaimsFromContext(r.Context())
		gotActor = GetActorID(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	h := APIKeyAuth(stubVerifier{key: key})(next)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/dp/ping", nil)
	req.Header.Set("Authorization", "Bearer rd_abcdefghijklmnopqrstuvwxyz012345")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.NotNil(t, gotClaims, "JWT claims must be populated after API key auth")

	// sub + workspace_id are the contract downstream reads depend on.
	assert.Equal(t, owner.String(), gotClaims["sub"], "sub must be the key owner")
	assert.Equal(t, owner.String(), gotClaims["user_id"], "user_id must mirror sub (JWTAuth parity)")
	assert.Equal(t, wsID.String(), gotClaims["workspace_id"], "workspace_id must be the key's workspace")

	// Actor must be a parseable, non-nil UUID so audit isn't attributed to uuid.Nil.
	assert.Equal(t, owner, gotActor)
	assert.NotEqual(t, uuid.Nil, gotActor)

	// Workspace role must satisfy the Editor/Admin-gated dp routes.
	assert.Equal(t, "Admin", gotClaims["role"])
}

// TestAPIKeyAuthFallsBackToKeyIDWhenNoOwner ensures keys that predate owner
// tracking (CreatedBy nil) still get a stable non-nil actor — the key's own ID
// — rather than uuid.Nil.
func TestAPIKeyAuthFallsBackToKeyIDWhenNoOwner(t *testing.T) {
	wsID := uuid.New()
	keyID := uuid.New()
	key := &repository.APIKey{
		ID:          keyID,
		WorkspaceID: wsID,
		Name:        "legacy",
		KeyPrefix:   "rd_legacy",
		CreatedBy:   nil, // no owner recorded
		IsActive:    true,
	}

	var gotClaims map[string]interface{}
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotClaims = JWTClaimsFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	h := APIKeyAuth(stubVerifier{key: key})(next)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/dp/ping", nil)
	req.Header.Set("Authorization", "Api-Key rd_legacyaaaaaaaaaaaaaaaaaaaaaaaaaa")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.NotNil(t, gotClaims)
	assert.Equal(t, keyID.String(), gotClaims["sub"], "sub falls back to key ID when no owner")
	assert.Equal(t, wsID.String(), gotClaims["workspace_id"])
	assert.NotEqual(t, uuid.Nil.String(), gotClaims["sub"], "actor must never be uuid.Nil")
}
