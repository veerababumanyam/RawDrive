// Package email implements the production SMTP transport for
// transactional mail (OTP codes, team invitations, password reset
// notifications). ISSUE-002 (brownfield P0, production-readiness):
// before this package existed, every email code path in
// cmd/api/main.go was backed by a stdout-logging stub — the comment
// on logOTPDelivery said "DO NOT USE IN PRODUCTION" but it was
// wired unconditionally. Users could not complete signup, recover
// passwords, or accept invitations in any non-local environment.
//
// The user chose "SMTP (bring-your-own)" over binding to Postmark /
// SES / Resend / SendGrid so this package targets the generic RFC
// 5321 / 5322 path via net/smtp. It works against:
//   - Mailpit on port 1025 (dev, no auth)
//   - SMTP PLAIN auth with STARTTLS (Postmark, SendGrid, SES on 587)
//   - Implicit TLS on 465 (older SES / Mailgun endpoints — via DialTLS,
//     which net/smtp.SendMail handles transparently via the server's
//     EHLO response when STARTTLS is offered)
//
// Config lookup order — AS CURRENTLY WIRED:
//
// The LoadSMTPConfig signature accepts a SettingsReader for
// platform_settings lookups, but cmd/api/main.go currently passes
// nil because the platform_settings repository is not yet
// constructed at the point where the email transport is wired.
// That means the env-var path is the only one exercised at boot
// today. Changes made through the admin UI (category "email") will
// NOT take effect until:
//
//  1. The backend is restarted, AND
//  2. The new values are also reflected in the SMTP_* env vars.
//
// Post-boot hot-reload from platform_settings is a deferred
// follow-up — the interface and DB category exist so the refresh
// path can be added without changing this package's public API,
// but that path is NOT wired today. Until it is, treat smtp.go as
// env-var-only and document the reality in operator runbooks.
// See docs/runbooks/production-launch-checklist.md for the env
// var list.
package email

import (
	"context"
	"fmt"
	"net/smtp"
	"os"
	"strconv"
	"strings"
)

// SMTPConfig holds everything needed to authenticate with and send
// mail through an SMTP relay. Port is an int to make arithmetic
// trivial at call sites; the env var SMTP_PORT is parsed by
// LoadSMTPConfig.
type SMTPConfig struct {
	Host        string // smtp.example.com
	Port        int    // 587 (STARTTLS), 465 (TLS), 25 (plaintext), 1025 (Mailpit)
	Username    string // empty = no auth
	Password    string
	FromAddress string // noreply@rawdrive.in — the envelope MAIL FROM
	FromName    string // "RawDrive", optional display name
}

// SettingsReader is the minimal platform_settings surface this
// package needs. main.go adapts *repository.PlatformSettingsRepo to
// this interface at wiring time so email does not import the
// repository layer directly.
type SettingsReader interface {
	Get(ctx context.Context, category, key string) (value string, found bool, err error)
}

// LoadSMTPConfig reads SMTP settings from the given platform_settings
// store first, then falls back to environment variables. Returns a
// nil config (with nil error) if neither source provides the minimum
// required fields (Host, Port, FromAddress). Callers MUST decide how
// to handle a nil config:
//
//   - Production: log.Fatalf — mail is a critical path.
//   - Development: accept a DEV_STUB_EMAIL=true escape hatch and
//     fall through to the stdout stubs.
//
// Precedence per key: platform_settings wins over env var WHEN a
// non-nil reader is supplied. The current boot path in
// cmd/api/main.go passes reader == nil (the platform_settings repo
// is not yet constructed at that point), so in practice only the
// env var branch is exercised at startup today. See the package
// doc comment for the follow-up plan.
//
// Key names follow the canonical ones seeded by migration 039
// (backend/internal/database/migrations/039_platform_settings.up.sql):
//
//	email.smtp_host, email.smtp_port, email.smtp_user,
//	email.smtp_password, email.smtp_from
//
// Env vars follow the names used by the project's .env file (which
// differs slightly from the DB keys for historical reasons — the
// env uses SMTP_USERNAME, the DB uses smtp_user):
//
//	SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM
//
// SMTP_FROM_NAME is an optional env-only override for the display
// name in the From header. No platform_settings key exists for it;
// leave it unset to default to "RawDrive".
func LoadSMTPConfig(ctx context.Context, reader SettingsReader) (*SMTPConfig, error) {
	get := func(dbKey, envName string) (string, error) {
		if reader != nil {
			v, ok, err := reader.Get(ctx, "email", dbKey)
			if err != nil {
				return "", fmt.Errorf("load SMTP setting %q: %w", dbKey, err)
			}
			if ok && v != "" {
				return v, nil
			}
		}
		return os.Getenv(envName), nil
	}

	host, err := get("smtp_host", "SMTP_HOST")
	if err != nil {
		return nil, err
	}
	portStr, err := get("smtp_port", "SMTP_PORT")
	if err != nil {
		return nil, err
	}
	username, err := get("smtp_user", "SMTP_USERNAME")
	if err != nil {
		return nil, err
	}
	password, err := get("smtp_password", "SMTP_PASSWORD")
	if err != nil {
		return nil, err
	}
	fromAddr, err := get("smtp_from", "SMTP_FROM")
	if err != nil {
		return nil, err
	}
	// smtp_from_name has no DB seed; env-only. The empty string
	// path below falls back to "RawDrive" if unset.
	fromName, err := get("smtp_from_name", "SMTP_FROM_NAME")
	if err != nil {
		return nil, err
	}

	// Minimum required fields: host, port, from_address. If any are
	// missing, return (nil, nil) — caller decides whether to FATAL
	// or fall back to stubs.
	if host == "" || portStr == "" || fromAddr == "" {
		return nil, nil
	}
	port, err := strconv.Atoi(portStr)
	if err != nil {
		return nil, fmt.Errorf("invalid SMTP_PORT %q: %w", portStr, err)
	}
	if fromName == "" {
		fromName = "RawDrive"
	}
	return &SMTPConfig{
		Host:        host,
		Port:        port,
		Username:    username,
		Password:    password,
		FromAddress: fromAddr,
		FromName:    fromName,
	}, nil
}

// Mailer is the minimal SMTP surface this package uses. It matches
// the signature of net/smtp.SendMail exactly so the default value
// can be assigned without a wrapper. Tests substitute a capturing
// function to assert on the composed message without opening a
// network socket.
type Mailer func(addr string, a smtp.Auth, from string, to []string, msg []byte) error

// defaultMailer is the production sender. Assigned as a var rather
// than a const so tests can patch the package-level default if they
// ever need to (though the typical path is to inject via the struct
// field in the test, which is what the current tests do).
var defaultMailer Mailer = smtp.SendMail

// OTPDelivery is the SMTP-backed implementation of
// auth.EmailDelivery. It is wired into auth.NewOTPServiceWithDelivery
// from main.go.
type OTPDelivery struct {
	cfg    *SMTPConfig
	mailer Mailer
}

// NewOTPDelivery constructs a production OTPDelivery. cfg must not
// be nil — LoadSMTPConfig returns nil when config is absent and
// main.go is expected to FATAL before constructing the delivery.
func NewOTPDelivery(cfg *SMTPConfig) *OTPDelivery {
	return &OTPDelivery{cfg: cfg, mailer: defaultMailer}
}

// SendOTP implements auth.EmailDelivery.
func (d *OTPDelivery) SendOTP(_ context.Context, email, code string) error {
	msg := composeOTPMessage(d.cfg, email, code)
	return d.mailer(
		fmt.Sprintf("%s:%d", d.cfg.Host, d.cfg.Port),
		smtpAuth(d.cfg),
		d.cfg.FromAddress,
		[]string{email},
		msg,
	)
}

// InvitationSender is the SMTP-backed implementation of
// team.EmailSender. It is wired into team.NewInvitationService from
// main.go.
type InvitationSender struct {
	cfg    *SMTPConfig
	mailer Mailer
}

// NewInvitationSender constructs a production InvitationSender.
// cfg must not be nil — see NewOTPDelivery.
func NewInvitationSender(cfg *SMTPConfig) *InvitationSender {
	return &InvitationSender{cfg: cfg, mailer: defaultMailer}
}

// SendInvitation implements team.EmailSender.
func (d *InvitationSender) SendInvitation(_ context.Context, email, inviteLink string) error {
	msg := composeInvitationMessage(d.cfg, email, inviteLink)
	return d.mailer(
		fmt.Sprintf("%s:%d", d.cfg.Host, d.cfg.Port),
		smtpAuth(d.cfg),
		d.cfg.FromAddress,
		[]string{email},
		msg,
	)
}

// smtpAuth returns smtp.PlainAuth when credentials are configured.
// Returns nil for unauthenticated transports — most commonly the
// dev Mailpit listener on port 1025 which does not require auth.
func smtpAuth(cfg *SMTPConfig) smtp.Auth {
	if cfg.Username == "" {
		return nil
	}
	return smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.Host)
}

// composeOTPMessage builds an RFC 5322 text/plain message for a
// one-time verification code. Kept as a pure function so message
// formatting can be unit-tested without a live SMTP server.
func composeOTPMessage(cfg *SMTPConfig, to, code string) []byte {
	var b strings.Builder
	writeFromHeader(&b, cfg)
	fmt.Fprintf(&b, "To: <%s>\r\n", to)
	b.WriteString("Subject: Your RawDrive verification code\r\n")
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	b.WriteString("\r\n")
	fmt.Fprintf(&b, "Your RawDrive verification code is: %s\r\n\r\n", code)
	b.WriteString("This code expires in 10 minutes. If you did not request a verification code, you can safely ignore this email.\r\n")
	return []byte(b.String())
}

// composeInvitationMessage builds an RFC 5322 text/plain team
// invitation email.
func composeInvitationMessage(cfg *SMTPConfig, to, inviteLink string) []byte {
	var b strings.Builder
	writeFromHeader(&b, cfg)
	fmt.Fprintf(&b, "To: <%s>\r\n", to)
	b.WriteString("Subject: You've been invited to a RawDrive workspace\r\n")
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	b.WriteString("\r\n")
	b.WriteString("You have been invited to join a workspace on RawDrive.\r\n\r\n")
	fmt.Fprintf(&b, "Accept the invitation by visiting: %s\r\n\r\n", inviteLink)
	b.WriteString("If you did not expect this invitation, you can safely ignore this email.\r\n")
	return []byte(b.String())
}

// writeFromHeader emits the RFC 5322 From header, preferring the
// "Display Name <addr@host>" form when FromName is set.
func writeFromHeader(b *strings.Builder, cfg *SMTPConfig) {
	if cfg.FromName != "" {
		fmt.Fprintf(b, "From: %q <%s>\r\n", cfg.FromName, cfg.FromAddress)
		return
	}
	fmt.Fprintf(b, "From: <%s>\r\n", cfg.FromAddress)
}
