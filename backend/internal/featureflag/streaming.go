// Package featureflag provides runtime feature toggles for F-014 streaming
// commercial v1 (M34 / E111-C1).
//
// Source of truth precedence:
//  1. platform_settings (category='featureflag', key='streaming.commercial_v1')
//  2. env fallback FEATURE_STREAMING_COMMERCIAL_V1=true|false
//  3. default: disabled
package featureflag

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/rawdrive/backend/internal/repository"
)

// SettingsLookup is the minimum repository surface the flag needs.
// It matches *repository.PlatformSettingsRepo.GetByKey.
type SettingsLookup interface {
	GetByKey(ctx context.Context, category, key string) (*repository.PlatformSetting, error)
}

type flagValue struct {
	Enabled            bool        `json:"enabled"`
	Rollout            *int        `json:"rollout,omitempty"`
	EnabledWorkspaces  []uuid.UUID `json:"enabledWorkspaces,omitempty"`
}

// StreamingCommercialFlag evaluates the F-014 rollout flag per workspace.
type StreamingCommercialFlag struct {
	settings    SettingsLookup
	envFallback bool
}

// NewStreamingCommercialFlag constructs the flag with env fallback.
func NewStreamingCommercialFlag(s SettingsLookup, envFallback bool) *StreamingCommercialFlag {
	return &StreamingCommercialFlag{settings: s, envFallback: envFallback}
}

// IsEnabled returns (enabled, source) for the given workspace.
// source ∈ {"settings","env","default","error"}.
func (f *StreamingCommercialFlag) IsEnabled(ctx context.Context, workspaceID uuid.UUID) (bool, string) {
	row, err := f.settings.GetByKey(ctx, "featureflag", "streaming.commercial_v1")
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

func evaluate(v flagValue, workspaceID uuid.UUID) bool {
	if !v.Enabled {
		return false
	}
	for _, ws := range v.EnabledWorkspaces {
		if ws == workspaceID {
			return true
		}
	}
	if v.Rollout == nil {
		return true
	}
	// Deterministic rollout: lowest byte of workspace id < rollout%.
	bucket := int(workspaceID[0]) * 100 / 256
	return bucket < *v.Rollout
}

// Gate returns an http.Handler that dispatches to onHandler when the flag is
// enabled for the request's workspace and offHandler otherwise.
func (f *StreamingCommercialFlag) Gate(onHandler, offHandler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ws, _ := WorkspaceFromContext(r.Context())
		enabled, _ := f.IsEnabled(r.Context(), ws)
		if enabled {
			onHandler.ServeHTTP(w, r)
			return
		}
		offHandler.ServeHTTP(w, r)
	})
}

type ctxKey struct{}

// WithWorkspace stores a workspace id in ctx for Gate() to read.
func WithWorkspace(ctx context.Context, workspaceID uuid.UUID) context.Context {
	return context.WithValue(ctx, ctxKey{}, workspaceID)
}

// WorkspaceFromContext returns the workspace id previously stored via
// WithWorkspace or uuid.Nil + false when absent.
func WorkspaceFromContext(ctx context.Context) (uuid.UUID, bool) {
	v, ok := ctx.Value(ctxKey{}).(uuid.UUID)
	return v, ok
}
