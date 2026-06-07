package featureflag

// ServerPlaintextFaceIndexFlag gates the server-side plaintext face-index
// ingest path: POST /api/v1/assets/{id}/face-index-image (handler
// StoreIndexImage). That path accepts a DECRYPTED upload frame and runs
// face-svc (buffalo_l) on the server, so the server transiently sees the
// plaintext face — which defeats the E2EE "server never sees plaintext"
// contract. It is therefore OFF by default and inert unless this flag is
// deliberately enabled, so the privacy contract holds until the client-side
// embedding path (slice 2b: in-browser ONNX) is unblocked on its external
// prerequisites (a commercially-licensed model, public model hosting, and an
// embedding-parity index regen).
//
// See docs/decisions/faceid-licensing-and-e2ee-posture.md.
//
// Source-of-truth precedence (mirrors ClientFaceIndexFlag):
//  1. platform_settings (category='featureflag', key='server_face_index_plaintext')
//  2. env fallback FEATURE_SERVER_FACE_INDEX_PLAINTEXT=true|false
//  3. default: disabled

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ServerPlaintextFaceIndexFlag evaluates the plaintext-frame ingest kill switch
// per workspace.
type ServerPlaintextFaceIndexFlag struct {
	settings    SettingsLookup
	envFallback bool
}

// NewServerPlaintextFaceIndexFlag constructs the flag with an env fallback.
func NewServerPlaintextFaceIndexFlag(s SettingsLookup, envFallback bool) *ServerPlaintextFaceIndexFlag {
	return &ServerPlaintextFaceIndexFlag{settings: s, envFallback: envFallback}
}

// IsEnabled returns (enabled, source) for the given workspace.
// source ∈ {"settings","env","default","error"}. It reuses the shared
// flagValue shape + evaluate() so allowlist + rollout semantics match the rest
// of the featureflag package.
func (f *ServerPlaintextFaceIndexFlag) IsEnabled(ctx context.Context, workspaceID uuid.UUID) (bool, string) {
	row, err := f.settings.GetByKey(ctx, "featureflag", "server_face_index_plaintext")
	if err == nil && row != nil {
		var v flagValue
		if jerr := json.Unmarshal([]byte(row.Value), &v); jerr == nil {
			return evaluate(v, workspaceID), "settings"
		}
	} else if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return false, "error"
	}

	if f.envFallback {
		return true, "env"
	}
	return false, "default"
}
