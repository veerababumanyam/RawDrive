package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	backendcrypto "github.com/rawdrive/backend/internal/crypto"
	"github.com/rawdrive/backend/internal/email"
	"github.com/rawdrive/backend/internal/repository"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type platformSettingsEmailReader struct {
	repo *repository.PlatformSettingsRepo
}

func (r *platformSettingsEmailReader) Get(ctx context.Context, category, key string) (string, bool, error) {
	row, err := r.repo.GetByKey(ctx, category, key)
	if err != nil {
		return "", false, err
	}
	if row == nil {
		return "", false, nil
	}
	return row.Value, true, nil
}

func main() {
	to := flag.String("to", "", "recipient email address for the SMTP smoke test")
	subject := flag.String("subject", "RawDrive SMTP smoke test", "smoke test message subject")
	body := flag.String("body", "", "optional smoke test message body")
	timeout := flag.Duration("timeout", 45*time.Second, "overall smoke test timeout")
	flag.Parse()

	if strings.TrimSpace(*to) == "" {
		log.Fatal("--to is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), *timeout)
	defer cancel()

	reader, closeReader, err := openSettingsReader(ctx)
	if err != nil {
		log.Fatal(err)
	}
	defer closeReader()

	cfg, err := email.LoadSMTPConfig(ctx, reader)
	if err != nil {
		log.Fatalf("load SMTP config: %v", err)
	}
	if cfg == nil {
		log.Fatal("SMTP config incomplete: set email.smtp_host/email.smtp_port/email.smtp_from or SMTP_* env vars")
	}

	messageBody := strings.TrimSpace(*body)
	if messageBody == "" {
		messageBody = fmt.Sprintf("RawDrive SMTP smoke test sent at %s. If you received this, SMTP authentication and delivery are working at the provider handoff.", time.Now().UTC().Format(time.RFC3339))
	}

	log.Printf("SMTP smoke: sending via %s:%d from=%s username=%s",
		cfg.Host, cfg.Port, cfg.FromAddress, redactUsername(cfg.Username))
	sender := email.NewNotificationSender(cfg)
	if sender == nil {
		log.Fatal("SMTP sender unavailable")
	}
	if err := sender.Send(ctx, strings.TrimSpace(*to), strings.TrimSpace(*subject), messageBody, ""); err != nil {
		log.Fatalf("SMTP smoke failed: %v", err)
	}
	log.Printf("SMTP smoke succeeded: provider accepted message for %s", strings.TrimSpace(*to))
}

func openSettingsReader(ctx context.Context) (email.SettingsReader, func(), error) {
	dsn := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if dsn == "" {
		return nil, func() {}, nil
	}

	kekHex := strings.TrimSpace(os.Getenv("PLATFORM_SETTINGS_KEK"))
	var envelope *backendcrypto.Envelope
	if kekHex != "" {
		parsed, err := backendcrypto.NewEnvelopeFromHex(kekHex)
		if err != nil {
			return nil, nil, fmt.Errorf("invalid PLATFORM_SETTINGS_KEK: %w", err)
		}
		envelope = parsed
	} else if productionEnv(os.Getenv("APP_ENV")) {
		return nil, nil, errors.New("PLATFORM_SETTINGS_KEK is required in production so encrypted SMTP secrets can be read")
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
	repo := repository.NewPlatformSettingsRepo(pool)
	if envelope != nil {
		repo.WithEnvelope(envelope)
	}
	return &platformSettingsEmailReader{repo: repo}, pool.Close, nil
}

func productionEnv(appEnv string) bool {
	switch strings.ToLower(strings.TrimSpace(appEnv)) {
	case "production", "prod":
		return true
	default:
		return false
	}
}

func redactUsername(username string) string {
	username = strings.TrimSpace(username)
	if username == "" {
		return "<empty>"
	}
	parts := strings.SplitN(username, "@", 2)
	if len(parts) != 2 {
		return "<set>"
	}
	local := parts[0]
	if local == "" {
		return "***@" + parts[1]
	}
	return local[:1] + "***@" + parts[1]
}
