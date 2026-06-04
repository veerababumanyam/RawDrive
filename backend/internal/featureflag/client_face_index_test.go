package featureflag_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"

	"github.com/rawdrive/backend/internal/featureflag"
	"github.com/rawdrive/backend/internal/repository"
)

// Slice 1 of the E2EE face-search epic: the client-face-index ingest endpoint
// is inert until this flag is enabled. Precedence: settings > env > default false.
func TestClientFaceIndexFlag_IsEnabled_Precedence(t *testing.T) {
	ws := uuid.New()

	t.Run("settings row enabled wins", func(t *testing.T) {
		s := &fakeSettings{row: &repository.PlatformSetting{
			Category: "featureflag", Key: "client_face_index",
			Value: `{"enabled":true}`,
		}}
		f := featureflag.NewClientFaceIndexFlag(s, false)
		ok, src := f.IsEnabled(context.Background(), ws)
		assert.True(t, ok)
		assert.Equal(t, "settings", src)
	})

	t.Run("settings disabled wins over env", func(t *testing.T) {
		s := &fakeSettings{row: &repository.PlatformSetting{Value: `{"enabled":false}`}}
		f := featureflag.NewClientFaceIndexFlag(s, true)
		ok, src := f.IsEnabled(context.Background(), ws)
		assert.False(t, ok)
		assert.Equal(t, "settings", src)
	})

	t.Run("settings missing falls back to env true", func(t *testing.T) {
		s := &fakeSettings{err: pgx.ErrNoRows}
		f := featureflag.NewClientFaceIndexFlag(s, true)
		ok, src := f.IsEnabled(context.Background(), ws)
		assert.True(t, ok)
		assert.Equal(t, "env", src)
	})

	t.Run("both missing returns default false", func(t *testing.T) {
		s := &fakeSettings{err: pgx.ErrNoRows}
		f := featureflag.NewClientFaceIndexFlag(s, false)
		ok, src := f.IsEnabled(context.Background(), ws)
		assert.False(t, ok)
		assert.Equal(t, "default", src)
	})

	t.Run("settings error other than not-found is disabled", func(t *testing.T) {
		s := &fakeSettings{err: errors.New("db dead")}
		f := featureflag.NewClientFaceIndexFlag(s, true)
		ok, src := f.IsEnabled(context.Background(), ws)
		assert.False(t, ok)
		assert.Equal(t, "error", src)
	})
}

// Reuses the allowlist/rollout evaluate() shared with StreamingCommercialFlag.
func TestClientFaceIndexFlag_AllowlistAndRollout(t *testing.T) {
	ws := uuid.MustParse("11111111-1111-1111-1111-111111111111")

	t.Run("allowlist overrides rollout 0", func(t *testing.T) {
		s := &fakeSettings{row: &repository.PlatformSetting{Value: `{"enabled":true,"rollout":0,"enabledWorkspaces":["11111111-1111-1111-1111-111111111111"]}`}}
		f := featureflag.NewClientFaceIndexFlag(s, false)
		ok, _ := f.IsEnabled(context.Background(), ws)
		assert.True(t, ok)
	})

	t.Run("rollout 100 enables all", func(t *testing.T) {
		s := &fakeSettings{row: &repository.PlatformSetting{Value: `{"enabled":true,"rollout":100}`}}
		f := featureflag.NewClientFaceIndexFlag(s, false)
		ok, _ := f.IsEnabled(context.Background(), ws)
		assert.True(t, ok)
	})
}
