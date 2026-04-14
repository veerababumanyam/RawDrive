package featureflag_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/featureflag"
	"github.com/rawdrive/backend/internal/repository"
)

// fakeSettings is an in-memory SettingsLookup for tests.
type fakeSettings struct {
	row    *repository.PlatformSetting
	err    error
	called int
}

func (f *fakeSettings) GetByKey(ctx context.Context, category, key string) (*repository.PlatformSetting, error) {
	f.called++
	if f.err != nil {
		return nil, f.err
	}
	return f.row, nil
}

// M34-R2-T008 — IsEnabled: settings > env > default false
func TestStreamingFlag_IsEnabled_Precedence(t *testing.T) {
	ws := uuid.New()

	t.Run("settings row enabled wins", func(t *testing.T) {
		s := &fakeSettings{row: &repository.PlatformSetting{
			Category: "featureflag", Key: "streaming.commercial_v1",
			Value: `{"enabled":true}`,
		}}
		f := featureflag.NewStreamingCommercialFlag(s, false)
		ok, src := f.IsEnabled(context.Background(), ws)
		assert.True(t, ok)
		assert.Equal(t, "settings", src)
	})

	t.Run("settings missing falls back to env true", func(t *testing.T) {
		s := &fakeSettings{err: pgx.ErrNoRows}
		f := featureflag.NewStreamingCommercialFlag(s, true)
		ok, src := f.IsEnabled(context.Background(), ws)
		assert.True(t, ok)
		assert.Equal(t, "env", src)
	})

	t.Run("both missing returns default false", func(t *testing.T) {
		s := &fakeSettings{err: pgx.ErrNoRows}
		f := featureflag.NewStreamingCommercialFlag(s, false)
		ok, src := f.IsEnabled(context.Background(), ws)
		assert.False(t, ok)
		assert.Equal(t, "default", src)
	})

	t.Run("settings error other than not-found propagates as disabled", func(t *testing.T) {
		s := &fakeSettings{err: errors.New("db dead")}
		f := featureflag.NewStreamingCommercialFlag(s, true)
		ok, src := f.IsEnabled(context.Background(), ws)
		assert.False(t, ok)
		assert.Equal(t, "error", src)
	})
}

// M34-R2-T009 — allowlist + rollout composition
func TestStreamingFlag_AllowlistAndRollout(t *testing.T) {
	ws := uuid.MustParse("11111111-1111-1111-1111-111111111111")

	t.Run("workspace in allowlist wins regardless of rollout", func(t *testing.T) {
		s := &fakeSettings{row: &repository.PlatformSetting{Value: `{"enabled":true,"rollout":0,"enabledWorkspaces":["11111111-1111-1111-1111-111111111111"]}`}}
		f := featureflag.NewStreamingCommercialFlag(s, false)
		ok, _ := f.IsEnabled(context.Background(), ws)
		assert.True(t, ok, "allowlist must override rollout=0")
	})

	t.Run("rollout 0 → false for non-allowlisted", func(t *testing.T) {
		s := &fakeSettings{row: &repository.PlatformSetting{Value: `{"enabled":true,"rollout":0}`}}
		f := featureflag.NewStreamingCommercialFlag(s, false)
		ok, _ := f.IsEnabled(context.Background(), ws)
		assert.False(t, ok)
	})

	t.Run("rollout 100 → true for all", func(t *testing.T) {
		s := &fakeSettings{row: &repository.PlatformSetting{Value: `{"enabled":true,"rollout":100}`}}
		f := featureflag.NewStreamingCommercialFlag(s, false)
		ok, _ := f.IsEnabled(context.Background(), ws)
		assert.True(t, ok)
	})
}

// M34-R2-T010 — Gate middleware dispatches to on/off handler
func TestStreamingFlag_GateDispatch(t *testing.T) {
	ws := uuid.New()

	onH := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		_, _ = w.Write([]byte("on"))
	})
	offH := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(404)
		_, _ = w.Write([]byte("off"))
	})

	t.Run("enabled workspace hits on handler", func(t *testing.T) {
		s := &fakeSettings{row: &repository.PlatformSetting{Value: `{"enabled":true,"rollout":100}`}}
		f := featureflag.NewStreamingCommercialFlag(s, false)
		h := f.Gate(onH, offH)
		req := httptest.NewRequest("GET", "/api/v1/streaming/balance", nil)
		req = req.WithContext(featureflag.WithWorkspace(req.Context(), ws))
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		assert.Equal(t, 200, rec.Code)
		assert.Equal(t, "on", rec.Body.String())
	})

	t.Run("disabled workspace hits off handler", func(t *testing.T) {
		s := &fakeSettings{err: pgx.ErrNoRows}
		f := featureflag.NewStreamingCommercialFlag(s, false)
		h := f.Gate(onH, offH)
		req := httptest.NewRequest("GET", "/api/v1/streaming/balance", nil)
		req = req.WithContext(featureflag.WithWorkspace(req.Context(), ws))
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		assert.Equal(t, 404, rec.Code)
		assert.Equal(t, "off", rec.Body.String())
	})
}

func TestMain(m *testing.M) {
	_ = os.Unsetenv("FEATURE_STREAMING_COMMERCIAL_V1")
	os.Exit(m.Run())
}

var _ = require.New // keep import
