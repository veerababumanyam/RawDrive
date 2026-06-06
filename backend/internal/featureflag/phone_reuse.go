// Phone-reuse enforcement flag (phone-reuse epic).
//
// Gates ONLY the paid_pending routing path — i.e. whether a signup on an
// already-used phone with paid intent is allowed to proceed as a paid_pending
// account. When disabled, registration still enforces one-account-per-(normalized)
// -phone (the normalization-aware replacement for users_phone_key) and simply
// rejects the duplicate; it never creates a paid_pending account. So the flag
// being OFF preserves today's "one account per phone" behavior, and ON unlocks
// the pay-to-add-another-account flow.
//
// Source of truth precedence (mirrors StreamingCommercialFlag):
//  1. platform_settings (category='featureflag', key='phone_reuse.enforcement')
//  2. env fallback FEATURE_PHONE_REUSE_ENFORCEMENT=true|false
//  3. default: disabled
package featureflag

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
)

// PhoneReuseEnforcementFlag evaluates the global phone-reuse enforcement toggle.
// Unlike the streaming flag this is NOT per-workspace — registration has no
// workspace yet — so it is a simple global on/off.
type PhoneReuseEnforcementFlag struct {
	settings    SettingsLookup
	envFallback bool
}

// NewPhoneReuseEnforcementFlag constructs the flag with an env fallback.
func NewPhoneReuseEnforcementFlag(s SettingsLookup, envFallback bool) *PhoneReuseEnforcementFlag {
	return &PhoneReuseEnforcementFlag{settings: s, envFallback: envFallback}
}

// Enabled reports whether paid_pending routing is on. A settings row overrides
// the env fallback; a malformed/absent row falls through to env then default.
func (f *PhoneReuseEnforcementFlag) Enabled(ctx context.Context) bool {
	en, _ := f.evaluate(ctx)
	return en
}

// EnabledWithSource returns (enabled, source) where source ∈
// {"settings","env","default","error"} — useful for admin diagnostics.
func (f *PhoneReuseEnforcementFlag) EnabledWithSource(ctx context.Context) (bool, string) {
	return f.evaluate(ctx)
}

func (f *PhoneReuseEnforcementFlag) evaluate(ctx context.Context) (bool, string) {
	if f.settings != nil {
		row, err := f.settings.GetByKey(ctx, "featureflag", "phone_reuse.enforcement")
		if err == nil && row != nil {
			var v struct {
				Enabled bool `json:"enabled"`
			}
			if jerr := json.Unmarshal([]byte(row.Value), &v); jerr == nil {
				return v.Enabled, "settings"
			}
		} else if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return false, "error"
		}
	}
	if f.envFallback {
		return true, "env"
	}
	return false, "default"
}
