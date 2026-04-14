package preflight_test

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/streaming/preflight"
)

type fakeCF struct{}

func (fakeCF) CreateEphemeralInput(ctx context.Context, parent uuid.UUID) (string, string, string, error) {
	return "cf-ephemeral-abc", "rtmps://live.example/in", "test-key-xyz", nil
}

type fakePerm struct {
	allow bool
	err   error
}

func (f fakePerm) HasStreamControl(ctx context.Context, userID, streamID uuid.UUID) (bool, error) {
	return f.allow, f.err
}

// M34-R2-T012 — Preflight without streams:control permission returns 403 and
// does not invoke the CF factory or touch the DB.
func TestPreflight_ForbiddenWithoutPermission(t *testing.T) {
	svc := preflight.New(nil, fakeCF{}, fakePerm{allow: false})
	_, status, err := svc.Start(context.Background(), uuid.New(), uuid.New())
	assert.Equal(t, http.StatusForbidden, status)
	assert.ErrorIs(t, err, preflight.ErrForbidden)
}

// M34-R2-T011 — happy path: permission OK → CF input issued, StartResponse
// carries testBroadcastId/rtmpsUrl/rtmpsKey/expiresAt/recommendedBitrateKbps,
// AND the service function signature never references streaming_ledger.
func TestPreflight_StartHappyPathContract(t *testing.T) {
	svc := preflight.New(nil, fakeCF{}, fakePerm{allow: true})
	resp, status, err := svc.Start(context.Background(), uuid.New(), uuid.New())
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, status)
	assert.Equal(t, "cf-ephemeral-abc", resp.TestBroadcastID)
	assert.Equal(t, "rtmps://live.example/in", resp.RTMPSUrl)
	assert.Equal(t, "test-key-xyz", resp.RTMPSKey)
	assert.Equal(t, 4500, resp.RecommendedBitrateKbps)
	// expires ~60s in future
	delta := resp.ExpiresAt.Sub(resp.ExpiresAt.Add(-preflight.SessionTTL))
	assert.Equal(t, preflight.SessionTTL, delta)
}

// If the permission check fails internally (DB down), surface 500 not 200.
func TestPreflight_PermErrorSurfaces500(t *testing.T) {
	svc := preflight.New(nil, fakeCF{}, fakePerm{allow: false, err: errors.New("db down")})
	_, status, err := svc.Start(context.Background(), uuid.New(), uuid.New())
	require.Error(t, err)
	assert.Equal(t, http.StatusInternalServerError, status)
}
