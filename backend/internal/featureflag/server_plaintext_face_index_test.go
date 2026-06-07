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

// The plaintext face-index ingest endpoint (StoreIndexImage) lets the server
// see a decrypted frame, so it must stay inert until deliberately enabled.
// Precedence: settings > env > default false. Mirrors ClientFaceIndexFlag.
func TestServerPlaintextFaceIndexFlag_IsEnabled_Precedence(t *testing.T) {
	ws := uuid.New()

	t.Run("settings row enabled wins", func(t *testing.T) {
		s := &fakeSettings{row: &repository.PlatformSetting{
			Category: "featureflag", Key: "server_face_index_plaintext",
			Value: `{"enabled":true}`,
		}}
		f := featureflag.NewServerPlaintextFaceIndexFlag(s, false)
		ok, src := f.IsEnabled(context.Background(), ws)
		assert.True(t, ok)
		assert.Equal(t, "settings", src)
	})

	t.Run("settings disabled wins over env", func(t *testing.T) {
		s := &fakeSettings{row: &repository.PlatformSetting{Value: `{"enabled":false}`}}
		f := featureflag.NewServerPlaintextFaceIndexFlag(s, true)
		ok, src := f.IsEnabled(context.Background(), ws)
		assert.False(t, ok)
		assert.Equal(t, "settings", src)
	})

	t.Run("settings missing falls back to env true", func(t *testing.T) {
		s := &fakeSettings{err: pgx.ErrNoRows}
		f := featureflag.NewServerPlaintextFaceIndexFlag(s, true)
		ok, src := f.IsEnabled(context.Background(), ws)
		assert.True(t, ok)
		assert.Equal(t, "env", src)
	})

	t.Run("both missing returns default false (closed by default)", func(t *testing.T) {
		s := &fakeSettings{err: pgx.ErrNoRows}
		f := featureflag.NewServerPlaintextFaceIndexFlag(s, false)
		ok, src := f.IsEnabled(context.Background(), ws)
		assert.False(t, ok)
		assert.Equal(t, "default", src)
	})

	t.Run("settings error other than not-found is disabled", func(t *testing.T) {
		s := &fakeSettings{err: errors.New("db dead")}
		f := featureflag.NewServerPlaintextFaceIndexFlag(s, true)
		ok, src := f.IsEnabled(context.Background(), ws)
		assert.False(t, ok)
		assert.Equal(t, "error", src)
	})
}
