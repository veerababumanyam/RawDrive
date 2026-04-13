package recharge

// PlatformSettingsResolver loads PhonePe and Razorpay configs from the
// platform_settings table on every call, so super-admin edits take effect
// without a server restart. Returned providers are cheap value types.

import (
	"context"
	"fmt"
)

// SettingsRepo is the minimal projection of repository.PlatformSettingsRepo
// the resolver needs. Defined here to avoid pulling the whole repo type.
type SettingsRepo interface {
	GetByKey(ctx context.Context, category, key string) (*PlatformSettingValue, error)
}

// PlatformSettingValue mirrors the relevant fields of repository.PlatformSetting.
type PlatformSettingValue struct {
	Value string
}

// PlatformSettingsResolver implements ProviderResolver.
type PlatformSettingsResolver struct {
	repo SettingsRepo
}

// NewPlatformSettingsResolver constructs a resolver.
func NewPlatformSettingsResolver(repo SettingsRepo) *PlatformSettingsResolver {
	return &PlatformSettingsResolver{repo: repo}
}

// PhonePe loads phonepe_* keys and returns a PhonePeProvider.
func (r *PlatformSettingsResolver) PhonePe(ctx context.Context) (Provider, error) {
	merchantID, _ := r.read(ctx, "payments", "phonepe_merchant_id")
	saltKey, _ := r.read(ctx, "payments", "phonepe_salt_key")
	saltIndex, _ := r.read(ctx, "payments", "phonepe_salt_index")
	baseURL, _ := r.read(ctx, "payments", "phonepe_base_url")

	if saltIndex == "" {
		saltIndex = "1"
	}

	cfg := PhonePeConfig{
		MerchantID: merchantID,
		SaltKey:    saltKey,
		SaltIndex:  saltIndex,
		BaseURL:    baseURL,
	}
	prov, err := NewPhonePeProvider(cfg)
	if err != nil {
		return nil, fmt.Errorf("recharge: phonepe config incomplete: %w", err)
	}
	return prov, nil
}

// Razorpay loads razorpay_* keys and returns a RazorpayProvider.
// Returns ErrProviderUnavailable if razorpay_enabled is not "true".
func (r *PlatformSettingsResolver) Razorpay(ctx context.Context) (Provider, error) {
	enabled, _ := r.read(ctx, "payments", "razorpay_enabled")
	if enabled != "true" {
		return nil, ErrProviderUnavailable
	}

	keyID, _ := r.read(ctx, "payments", "razorpay_key_id")
	keySecret, _ := r.read(ctx, "payments", "razorpay_key_secret")
	webhookSecret, _ := r.read(ctx, "payments", "razorpay_webhook_secret")

	cfg := RazorpayConfig{
		KeyID:         keyID,
		KeySecret:     keySecret,
		WebhookSecret: webhookSecret,
	}
	prov, err := NewRazorpayProvider(cfg)
	if err != nil {
		return nil, fmt.Errorf("recharge: razorpay config incomplete: %w", err)
	}
	return prov, nil
}

func (r *PlatformSettingsResolver) read(ctx context.Context, category, key string) (string, error) {
	v, err := r.repo.GetByKey(ctx, category, key)
	if err != nil {
		return "", err
	}
	if v == nil {
		return "", nil
	}
	return v.Value, nil
}
