package featureflag

// CullingFlag gates the Smart Culling API and worker. The feature is currently
// landing in slices, so the safe default is disabled until the full review/apply
// workflow is ready.
//
// Source-of-truth precedence:
//  1. platform_settings (category='featureflag', key='ai.culling')
//  2. env fallback FEATURE_AI_CULLING=true|false
//  3. default: disabled

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// CullingFlag evaluates the Smart Culling rollout flag per workspace.
type CullingFlag struct {
	settings    SettingsLookup
	envFallback bool
}

// NewCullingFlag constructs the flag with an env fallback.
func NewCullingFlag(s SettingsLookup, envFallback bool) *CullingFlag {
	return &CullingFlag{settings: s, envFallback: envFallback}
}

// IsEnabled returns (enabled, source) for the given workspace.
// source in {"settings","env","default","error"}.
func (f *CullingFlag) IsEnabled(ctx context.Context, workspaceID uuid.UUID) (bool, string) {
	row, err := f.settings.GetByKey(ctx, "featureflag", "ai.culling")
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
