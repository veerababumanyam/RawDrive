package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"strings"

	backendcrypto "github.com/rawdrive/backend/internal/crypto"
	"github.com/rawdrive/backend/internal/repository"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type envSetting struct {
	category    string
	key         string
	envNames    []string
	isSecret    bool
	description string
}

type syncOptions struct {
	category string
	keys     map[string]struct{}
	dryRun   bool
}

type syncSummary struct {
	selected int
	written  int
	skipped  int
}

type platformSettingsWriter interface {
	Upsert(ctx context.Context, category, key, value string, isSecret bool, description string, updatedBy *uuid.UUID) error
}

func main() {
	ctx := context.Background()
	logger := log.New(os.Stderr, "", log.LstdFlags)

	opts, err := parseSyncOptions(os.Args[1:], os.Stderr)
	if err != nil {
		logger.Fatal(err)
	}

	var writer platformSettingsWriter
	var closePool func()
	if !opts.dryRun {
		var err error
		writer, closePool, err = openPlatformSettingsWriter(ctx, os.Getenv)
		if err != nil {
			logger.Fatal(err)
		}
		defer closePool()
	}

	summary, err := syncSettings(ctx, writer, os.Getenv, opts, logger)
	if err != nil {
		logger.Fatal(err)
	}
	logger.Printf("platform_settings sync complete: selected=%d written=%d skipped_empty_env=%d dry_run=%t",
		summary.selected, summary.written, summary.skipped, opts.dryRun)
}

func parseSyncOptions(args []string, output io.Writer) (syncOptions, error) {
	fs := flag.NewFlagSet("sync-platform-settings-from-env", flag.ContinueOnError)
	fs.SetOutput(output)
	category := fs.String("category", "", "optional platform_settings category filter, e.g. email")
	keys := fs.String("keys", "", "optional comma-separated key filter, e.g. smtp_host,smtp_password")
	dryRun := fs.Bool("dry-run", false, "print selected writes without connecting to the database")
	if err := fs.Parse(args); err != nil {
		return syncOptions{}, err
	}
	keySet, err := parseKeySet(*keys)
	if err != nil {
		return syncOptions{}, err
	}
	return syncOptions{
		category: strings.TrimSpace(*category),
		keys:     keySet,
		dryRun:   *dryRun,
	}, nil
}

func parseKeySet(keys string) (map[string]struct{}, error) {
	keys = strings.TrimSpace(keys)
	if keys == "" {
		return nil, nil
	}
	result := map[string]struct{}{}
	for _, key := range strings.Split(keys, ",") {
		key = strings.TrimSpace(key)
		if key == "" {
			return nil, errors.New("--keys contains an empty key")
		}
		result[key] = struct{}{}
	}
	return result, nil
}

func syncSettings(ctx context.Context, writer platformSettingsWriter, getenv func(string) string, opts syncOptions, logger *log.Logger) (syncSummary, error) {
	if getenv == nil {
		getenv = os.Getenv
	}
	if logger == nil {
		logger = log.New(io.Discard, "", 0)
	}
	if !opts.dryRun && writer == nil {
		return syncSummary{}, errors.New("platform settings writer is required unless --dry-run is set")
	}

	var summary syncSummary
	for _, setting := range settingsFromEnv() {
		if !settingSelected(setting, opts) {
			continue
		}
		summary.selected++
		value := firstNonEmptyEnv(getenv, setting.envNames...)
		if value == "" {
			summary.skipped++
			logger.Printf("skipped %s.%s: env empty", setting.category, setting.key)
			continue
		}
		if opts.dryRun {
			logger.Printf("would upsert %s.%s (secret=%t)", setting.category, setting.key, setting.isSecret)
			continue
		}
		if err := writer.Upsert(ctx, setting.category, setting.key, value, setting.isSecret, setting.description, nil); err != nil {
			return summary, fmt.Errorf("upsert %s.%s: %w", setting.category, setting.key, err)
		}
		logger.Printf("upserted %s.%s (secret=%t)", setting.category, setting.key, setting.isSecret)
		summary.written++
	}
	if summary.selected == 0 {
		return summary, errors.New("no settings matched --category/--keys filters")
	}
	return summary, nil
}

func settingSelected(setting envSetting, opts syncOptions) bool {
	if opts.category != "" && setting.category != opts.category {
		return false
	}
	if len(opts.keys) > 0 {
		_, ok := opts.keys[setting.key]
		return ok
	}
	return true
}

func openPlatformSettingsWriter(ctx context.Context, getenv func(string) string) (platformSettingsWriter, func(), error) {
	if getenv == nil {
		getenv = os.Getenv
	}
	dsn := strings.TrimSpace(getenv("DATABASE_URL"))
	if dsn == "" {
		return nil, nil, errors.New("DATABASE_URL is required")
	}
	kekHex := strings.TrimSpace(getenv("PLATFORM_SETTINGS_KEK"))
	if kekHex == "" {
		return nil, nil, errors.New("PLATFORM_SETTINGS_KEK is required so secret settings stay encrypted")
	}
	envelope, err := backendcrypto.NewEnvelopeFromHex(kekHex)
	if err != nil {
		return nil, nil, fmt.Errorf("invalid PLATFORM_SETTINGS_KEK: %w", err)
	}

	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, nil, fmt.Errorf("invalid DATABASE_URL: %w", err)
	}
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeExec
	cfg.MaxConns = 2
	cfg.MinConns = 0

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, nil, fmt.Errorf("connect database: %w", err)
	}

	repo := repository.NewPlatformSettingsRepo(pool).WithEnvelope(envelope)
	return repo, pool.Close, nil
}

func firstNonEmptyEnv(getenv func(string) string, names ...string) string {
	for _, name := range names {
		if value := strings.TrimSpace(getenv(name)); value != "" {
			return value
		}
	}
	return ""
}

func settingsFromEnv() []envSetting {
	return []envSetting{
		{category: "auth", key: "google_client_id", envNames: []string{"GOOGLE_CLIENT_ID"}, description: "Google OAuth client ID"},
		{category: "auth", key: "google_client_secret", envNames: []string{"GOOGLE_CLIENT_SECRET"}, isSecret: true, description: "Google OAuth client secret"},
		{category: "auth", key: "google_redirect_url", envNames: []string{"GOOGLE_REDIRECT_URL"}, description: "Google OAuth redirect URL"},
		{category: "auth", key: "google_oauth_state_key", envNames: []string{"GOOGLE_OAUTH_STATE_KEY"}, isSecret: true, description: "Google OAuth state-cookie signing key"},

		{category: "email", key: "smtp_host", envNames: []string{"SMTP_HOST"}, description: "SMTP server host"},
		{category: "email", key: "smtp_port", envNames: []string{"SMTP_PORT"}, description: "SMTP server port"},
		{category: "email", key: "smtp_user", envNames: []string{"SMTP_USERNAME"}, description: "SMTP username"},
		{category: "email", key: "smtp_password", envNames: []string{"SMTP_PASSWORD"}, isSecret: true, description: "SMTP password"},
		{category: "email", key: "smtp_security", envNames: []string{"SMTP_SECURITY"}, description: "SMTP security mode: auto, ssl, or starttls"},
		{category: "email", key: "smtp_from", envNames: []string{"SMTP_FROM"}, description: "Default sender email"},
		{category: "email", key: "smtp_from_name", envNames: []string{"SMTP_FROM_NAME"}, description: "Default sender display name"},

		{category: "payments", key: "razorpay_key_id", envNames: []string{"RAZORPAY_KEY_ID"}, description: "Razorpay key ID"},
		{category: "payments", key: "razorpay_key_secret", envNames: []string{"RAZORPAY_KEY_SECRET"}, isSecret: true, description: "Razorpay key secret"},
		{category: "payments", key: "razorpay_webhook_secret", envNames: []string{"RAZORPAY_WEBHOOK_SECRET"}, isSecret: true, description: "Razorpay webhook secret"},
		{category: "payments", key: "razorpay_base_url", envNames: []string{"RAZORPAY_BASE_URL"}, description: "Razorpay API base URL"},
		{category: "payments", key: "phonepe_client_id", envNames: []string{"PHONEPE_CLIENT_ID", "PHONEPE_CLIENTID"}, description: "PhonePe Standard Checkout v2 client ID"},
		{category: "payments", key: "phonepe_client_secret", envNames: []string{"PHONEPE_CLIENT_SECRET", "PHONEPE_SECRET"}, isSecret: true, description: "PhonePe Standard Checkout v2 client secret"},
		{category: "payments", key: "phonepe_client_version", envNames: []string{"PHONEPE_CLIENT_VERSION", "PHONEPE_VERSION"}, description: "PhonePe Standard Checkout v2 client version"},
		{category: "payments", key: "phonepe_v2_base_url", envNames: []string{"PHONEPE_V2_BASE_URL", "PHONEPE_BASE_URL"}, description: "PhonePe Standard Checkout v2 pay/status base URL"},
		{category: "payments", key: "phonepe_v2_auth_base_url", envNames: []string{"PHONEPE_V2_AUTH_BASE_URL", "PHONEPE_AUTH_BASE_URL"}, description: "PhonePe Standard Checkout v2 OAuth base URL"},
		{category: "payments", key: "phonepe_webhook_username", envNames: []string{"PHONEPE_WEBHOOK_USERNAME"}, description: "PhonePe dashboard webhook username"},
		{category: "payments", key: "phonepe_webhook_password", envNames: []string{"PHONEPE_WEBHOOK_PASSWORD"}, isSecret: true, description: "PhonePe dashboard webhook password"},
		{category: "payments", key: "public_base_url", envNames: []string{"PUBLIC_BASE_URL", "APP_PUBLIC_BASE_URL", "FRONTEND_URL"}, description: "Public app base URL used for payment redirect URLs"},
		{category: "payments", key: "upi_pa", envNames: []string{"UPI_PA"}, description: "UPI payee address"},

		{category: "storage", key: "driver", envNames: []string{"STORAGE_DRIVER"}, description: "Storage driver (s3 for managed Backblaze B2)"},
		{category: "storage", key: "b2_bucket_name", envNames: []string{"B2_BUCKET_NAME", "B2_BUCKET"}, description: "Backblaze B2 bucket name"},
		{category: "storage", key: "b2_region", envNames: []string{"B2_REGION"}, description: "Backblaze B2 S3-compatible region"},
		{category: "storage", key: "b2_endpoint", envNames: []string{"B2_ENDPOINT"}, description: "Backblaze B2 S3-compatible endpoint URL"},
		{category: "storage", key: "b2_key_id", envNames: []string{"B2_KEY_ID", "B2_ACCESS_KEY_ID"}, isSecret: true, description: "Backblaze B2 key ID / S3 access key ID"},
		{category: "storage", key: "b2_application_key", envNames: []string{"B2_APPLICATION_KEY", "B2_SECRET_ACCESS_KEY"}, isSecret: true, description: "Backblaze B2 application key / S3 secret access key"},
		{category: "storage", key: "sse_mode", envNames: []string{"STORAGE_SSE_MODE"}, description: "Storage server-side encryption mode: AES256 or SSE-C"},
		{category: "storage", key: "sse_customer_key_hex", envNames: []string{"STORAGE_SSE_C_KEY"}, isSecret: true, description: "SSE-C customer key as 64 hex characters"},
	}
}
