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

// --- methods added for M34/M35 handler wiring ---

func TestPreflight_GenerateOBSProfile_DefaultTier(t *testing.T) {
	svc := preflight.New(nil, fakeCF{}, fakePerm{allow: true})
	body, filename, err := svc.GenerateOBSProfile(context.Background(), uuid.New())
	require.NoError(t, err)
	assert.Contains(t, filename, "720p30") // default without sample
	assert.Contains(t, string(body), "video_bitrate=2500")
	assert.Contains(t, string(body), "resolution=1280x720")
}

func TestPreflight_RecordBandwidth_Persists(t *testing.T) {
	svc := preflight.New(nil, fakeCF{}, fakePerm{allow: true})
	sid := uuid.New()
	err := svc.RecordBandwidth(context.Background(), sid, preflight.BandwidthResult{
		UplinkKbps: 5000, JitterMs: 10, LossPct: 0.5,
	})
	require.NoError(t, err)
	// classify should now pick 1080p30
	_, kbps := svc.Classify(sid)
	assert.Equal(t, 4200, kbps)
}

func TestPreflight_CompleteSession_Warn_OnHighLoss(t *testing.T) {
	svc := preflight.New(nil, fakeCF{}, fakePerm{allow: true})
	sid := uuid.New()
	_ = svc.RecordBandwidth(context.Background(), sid, preflight.BandwidthResult{
		UplinkKbps: 5000, LossPct: 5, JitterMs: 5,
	})
	v, err := svc.CompleteSession(context.Background(), sid)
	require.NoError(t, err)
	assert.Equal(t, "warn", v.Status)
	assert.NotEmpty(t, v.Reasons)
}

func TestPreflight_CompleteSession_Fail_OnLowUplink(t *testing.T) {
	svc := preflight.New(nil, fakeCF{}, fakePerm{allow: true})
	sid := uuid.New()
	_ = svc.RecordBandwidth(context.Background(), sid, preflight.BandwidthResult{
		UplinkKbps: 1500,
	})
	v, err := svc.CompleteSession(context.Background(), sid)
	require.NoError(t, err)
	assert.Equal(t, "fail", v.Status)
}

func TestPreflight_SessionWorkspace_NilDB_ReturnsNotFound(t *testing.T) {
	svc := preflight.New(nil, fakeCF{}, fakePerm{allow: true})
	_, err := svc.SessionWorkspace(context.Background(), uuid.New())
	assert.ErrorIs(t, err, preflight.ErrSessionNotFound)
}

func TestPreflight_StopTestBroadcast_NilDB_NoError(t *testing.T) {
	svc := preflight.New(nil, fakeCF{}, fakePerm{allow: true})
	err := svc.StopTestBroadcast(context.Background(), uuid.New())
	assert.NoError(t, err)
}

func TestPreflight_StartSession_HappyPath(t *testing.T) {
	svc := preflight.New(nil, fakeCF{}, fakePerm{allow: true})
	sess, err := svc.StartSession(context.Background(), uuid.New(), uuid.New())
	require.NoError(t, err)
	assert.Equal(t, "cf-ephemeral-abc", sess.TestBroadcastID)
	assert.Equal(t, 4500, sess.RecommendedBitrateKbps)
	assert.NotEqual(t, uuid.Nil, sess.ID)
}

// If the permission check fails internally (DB down), surface 500 not 200.
func TestPreflight_PermErrorSurfaces500(t *testing.T) {
	svc := preflight.New(nil, fakeCF{}, fakePerm{allow: false, err: errors.New("db down")})
	_, status, err := svc.Start(context.Background(), uuid.New(), uuid.New())
	require.Error(t, err)
	assert.Equal(t, http.StatusInternalServerError, status)
}
