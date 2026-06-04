package featureflag

// ClientFaceIndexFlag gates the client-computed face-embedding ingest path
// (epic: seamless Find Me on E2EE galleries, slice 1). On client-E2EE
// galleries the server only ever sees ciphertext, so it cannot detect faces
// itself; the browser computes embeddings at upload and POSTs them to
// /api/v1/assets/{id}/face-embeddings. That endpoint is inert until this flag
// is enabled so the new ingest path can land on main without exposing a
// half-built feature.
//
// Source-of-truth precedence (mirrors StreamingCommercialFlag):
//  1. platform_settings (category='featureflag', key='client_face_index')
//  2. env fallback FEATURE_CLIENT_FACE_INDEX=true|false
//  3. default: disabled

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ClientFaceIndexFlag evaluates the client-face-index rollout flag per workspace.
type ClientFaceIndexFlag struct {
	settings    SettingsLookup
	envFallback bool
}

// NewClientFaceIndexFlag constructs the flag with an env fallback.
func NewClientFaceIndexFlag(s SettingsLookup, envFallback bool) *ClientFaceIndexFlag {
	return &ClientFaceIndexFlag{settings: s, envFallback: envFallback}
}

// IsEnabled returns (enabled, source) for the given workspace.
// source ∈ {"settings","env","default","error"}. It reuses the shared
// flagValue shape + evaluate() so allowlist + rollout semantics match the
// rest of the featureflag package.
func (f *ClientFaceIndexFlag) IsEnabled(ctx context.Context, workspaceID uuid.UUID) (bool, string) {
	row, err := f.settings.GetByKey(ctx, "featureflag", "client_face_index")
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
