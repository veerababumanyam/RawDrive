// Package email implements the production SMTP transport for
// transactional mail (OTP codes, team invitations, password reset
// notifications). ISSUE-002 (brownfield P0, production-readiness):
// before this package existed, every email code path in
// cmd/api/main.go was backed by a stdout-logging stub - the comment
// on logOTPDelivery said "DO NOT USE IN PRODUCTION" but it was
// wired unconditionally. Users could not complete signup, recover
// passwords, or accept invitations in any non-local environment.
//
// The user chose "SMTP (bring-your-own)" over binding to Postmark /
// SES / Resend / SendGrid so this package targets the generic RFC
// 5321 / 5322 path via net/smtp. It works against:
//   - Mailpit on port 1025 (dev, no auth)
//   - SMTP PLAIN auth with STARTTLS (Postmark, SendGrid, SES on 587)
//   - Implicit TLS on 465 (GoDaddy / legacy SMTPS providers)
//
// Config lookup order - AS WIRED:
//
// cmd/api/main.go supplies a platform_settings reader, so
// LoadSMTPConfig reads platform_settings first and falls back to
// SMTP_* env vars per key. The dynamic senders reload this config
// for each send, so admin UI changes in category "email" take
// effect without a nightly sync job or backend restart.
package email

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"net"
	"net/smtp"
	"os"
	"strconv"
	"strings"
	"time"
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
	Security    string // auto, ssl, starttls
	FromAddress string // noreply@rawdrive.in - the envelope MAIL FROM
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
//   - Production: log.Fatalf - mail is a critical path.
//   - Development: accept a DEV_STUB_EMAIL=true escape hatch and
//     fall through to the stdout stubs.
//
// Precedence per key: platform_settings wins over env var when a
// non-nil reader is supplied. cmd/api/main.go supplies that reader
// during normal API startup.
//
// Key names follow the canonical ones seeded by migration 039
// (backend/internal/database/migrations/039_platform_settings.up.sql):
//
//	email.smtp_host, email.smtp_port, email.smtp_user,
//	email.smtp_password, email.smtp_from, email.smtp_security,
//	email.smtp_from_name
//
// Env vars follow the names used by the project's .env file (which
// differs slightly from the DB keys for historical reasons - the
// env uses SMTP_USERNAME, the DB uses smtp_user):
//
//	SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM,
//	SMTP_SECURITY, SMTP_FROM_NAME
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
	security, err := get("smtp_security", "SMTP_SECURITY")
	if err != nil {
		return nil, err
	}
	fromName, err := get("smtp_from_name", "SMTP_FROM_NAME")
	if err != nil {
		return nil, err
	}

	// Minimum required fields: host, port, from_address. If any are
	// missing, return (nil, nil) - caller decides whether to FATAL
	// or fall back to stubs.
	if host == "" || portStr == "" || fromAddr == "" {
		return nil, nil
	}
	port, err := strconv.Atoi(portStr)
	if err != nil {
		return nil, fmt.Errorf("invalid SMTP_PORT %q: %w", portStr, err)
	}
	security, err = normalizeSMTPSecurity(security)
	if err != nil {
		return nil, err
	}
	if fromName == "" {
		fromName = "RawDrive"
	}
	return &SMTPConfig{
		Host:        host,
		Port:        port,
		Username:    username,
		Password:    password,
		Security:    security,
		FromAddress: fromAddr,
		FromName:    fromName,
	}, nil
}

// Mailer is the minimal SMTP surface this package uses. Tests
// substitute a capturing function to assert on the composed message
// without opening a network socket; production uses sendSMTP, which
// chooses implicit TLS from the loaded config.
type Mailer func(cfg *SMTPConfig, to []string, msg []byte) error

type configLoader func(ctx context.Context) (*SMTPConfig, error)

func dynamicConfigLoader(reader SettingsReader) configLoader {
	return func(ctx context.Context) (*SMTPConfig, error) {
		return LoadSMTPConfig(ctx, reader)
	}
}

func resolveConfig(ctx context.Context, cfg *SMTPConfig, loader configLoader) (*SMTPConfig, error) {
	if loader != nil {
		loaded, err := loader(ctx)
		if err != nil {
			return nil, err
		}
		if loaded == nil {
			return nil, errors.New("smtp: config incomplete")
		}
		return loaded, nil
	}
	if cfg == nil {
		return nil, errors.New("smtp: config incomplete")
	}
	return cfg, nil
}

func sendConfigured(mailer Mailer, cfg *SMTPConfig, to string, msg []byte) error {
	if mailer == nil {
		mailer = defaultMailer
	}
	return mailer(cfg, []string{to}, msg)
}

// defaultMailer is the production sender. Assigned as a var rather
// than a const so tests can patch the package-level default if they
// ever need to (though the typical path is to inject via the struct
// field in the test, which is what the current tests do).
var defaultMailer Mailer = sendSMTP

// sendSMTP preserves net/smtp.SendMail behavior for plaintext and
// STARTTLS providers, and adds the implicit-TLS path required by
// SMTPS providers. Explicit smtp_security settings win; "auto"
// preserves the conventional port-465 implicit TLS behavior.
func sendSMTP(cfg *SMTPConfig, to []string, msg []byte) error {
	addr := smtpAddr(cfg)
	auth := smtpAuth(cfg)
	if usesImplicitTLS(cfg) {
		return sendMailImplicitTLS(cfg.Host, addr, auth, cfg.FromAddress, to, msg)
	}
	return smtp.SendMail(addr, auth, cfg.FromAddress, to, msg)
}

func smtpAddr(cfg *SMTPConfig) string {
	return net.JoinHostPort(cfg.Host, strconv.Itoa(cfg.Port))
}

func normalizeSMTPSecurity(v string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "", "auto":
		return "auto", nil
	case "ssl", "tls", "implicit_tls", "implicit-tls", "smtps":
		return "ssl", nil
	case "starttls", "start_tls", "start-tls":
		return "starttls", nil
	default:
		return "", fmt.Errorf("invalid SMTP_SECURITY %q: expected auto, ssl, or starttls", v)
	}
}

func usesImplicitTLS(cfg *SMTPConfig) bool {
	switch strings.ToLower(strings.TrimSpace(cfg.Security)) {
	case "ssl":
		return true
	case "starttls":
		return false
	default:
		return cfg.Port == 465
	}
}

func sendMailImplicitTLS(host, addr string, a smtp.Auth, from string, to []string, msg []byte) error {
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	conn, err := tls.DialWithDialer(dialer, "tcp", addr, &tls.Config{
		ServerName: host,
		MinVersion: tls.VersionTLS12,
	})
	if err != nil {
		return err
	}

	c, err := smtp.NewClient(conn, host)
	if err != nil {
		_ = conn.Close()
		return err
	}
	defer c.Close()

	if err := c.Hello("localhost"); err != nil {
		return err
	}
	if a != nil {
		if ok, _ := c.Extension("AUTH"); !ok {
			return errors.New("smtp: server doesn't support AUTH")
		}
		if err := c.Auth(a); err != nil {
			return err
		}
	}
	if err := c.Mail(from); err != nil {
		return err
	}
	for _, recipient := range to {
		if err := c.Rcpt(recipient); err != nil {
			return err
		}
	}
	w, err := c.Data()
	if err != nil {
		return err
	}
	if _, err := w.Write(msg); err != nil {
		_ = w.Close()
		return err
	}
	if err := w.Close(); err != nil {
		return err
	}
	return c.Quit()
}

// OTPDelivery is the SMTP-backed implementation of
// auth.EmailDelivery. It is wired into auth.NewOTPServiceWithDelivery
// from main.go.
type OTPDelivery struct {
	cfg    *SMTPConfig
	loader configLoader
	mailer Mailer
}

// NewOTPDelivery constructs a production OTPDelivery. cfg must not
// be nil - LoadSMTPConfig returns nil when config is absent and
// main.go is expected to FATAL before constructing the delivery.
func NewOTPDelivery(cfg *SMTPConfig) *OTPDelivery {
	return &OTPDelivery{cfg: cfg, mailer: defaultMailer}
}

// NewDynamicOTPDelivery reloads SMTP settings from platform_settings
// for every send, falling back to SMTP_* env vars per key.
func NewDynamicOTPDelivery(reader SettingsReader) *OTPDelivery {
	return &OTPDelivery{loader: dynamicConfigLoader(reader), mailer: defaultMailer}
}

// SendOTP implements auth.EmailDelivery.
func (d *OTPDelivery) SendOTP(ctx context.Context, email, code string) error {
	cfg, err := resolveConfig(ctx, d.cfg, d.loader)
	if err != nil {
		return err
	}
	return sendConfigured(d.mailer, cfg, email, composeOTPMessage(cfg, email, code))
}

// InvitationSender is the SMTP-backed implementation of
// team.EmailSender. It is wired into team.NewInvitationService from
// main.go.
type InvitationSender struct {
	cfg    *SMTPConfig
	loader configLoader
	mailer Mailer
}

// NewInvitationSender constructs a production InvitationSender.
// cfg must not be nil - see NewOTPDelivery.
func NewInvitationSender(cfg *SMTPConfig) *InvitationSender {
	return &InvitationSender{cfg: cfg, mailer: defaultMailer}
}

// NewDynamicInvitationSender reloads SMTP settings from platform_settings
// for every send, falling back to SMTP_* env vars per key.
func NewDynamicInvitationSender(reader SettingsReader) *InvitationSender {
	return &InvitationSender{loader: dynamicConfigLoader(reader), mailer: defaultMailer}
}

// SendInvitation implements team.EmailSender.
func (d *InvitationSender) SendInvitation(ctx context.Context, email, inviteLink string) error {
	cfg, err := resolveConfig(ctx, d.cfg, d.loader)
	if err != nil {
		return err
	}
	return sendConfigured(d.mailer, cfg, email, composeInvitationMessage(cfg, email, inviteLink))
}

// smtpAuth returns smtp.PlainAuth when credentials are configured.
// Returns nil for unauthenticated transports - most commonly the
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
	fmt.Fprintf(&b, "To: <%s>\r\n", sanitizeHeaderValue(to))
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
	fmt.Fprintf(&b, "To: <%s>\r\n", sanitizeHeaderValue(to))
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
	fromAddress := sanitizeHeaderValue(cfg.FromAddress)
	fromName := sanitizeHeaderValue(cfg.FromName)
	if fromName != "" {
		fmt.Fprintf(b, "From: %q <%s>\r\n", fromName, fromAddress)
		return
	}
	fmt.Fprintf(b, "From: <%s>\r\n", fromAddress)
}

func sanitizeHeaderValue(value string) string {
	value = strings.NewReplacer("\r", " ", "\n", " ").Replace(value)
	return strings.Join(strings.Fields(value), " ")
}
