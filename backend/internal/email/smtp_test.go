package email

// ISSUE-002 (brownfield P0, production-readiness): tests pinning the
// SMTP email transport contract that replaces the stdout stubs in
// cmd/api/main.go. The user chose "SMTP (bring-your-own)" over a
// specific SaaS provider, so these tests cover the generic SMTP path
// without binding to Postmark/SES/Resend/SendGrid specifics.

import (
	"context"
	"net/smtp"
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ──────────────────────── Config loader ────────────────────────

// fakeSettingsReader is an in-memory implementation of
// SettingsReader used to verify the platform_settings precedence
// path without touching the repository layer.
type fakeSettingsReader struct {
	data map[string]string // key: category+"/"+key, value: value
	err  error             // optional fault injection
}

func (f *fakeSettingsReader) Get(_ context.Context, category, key string) (string, bool, error) {
	if f.err != nil {
		return "", false, f.err
	}
	v, ok := f.data[category+"/"+key]
	return v, ok, nil
}

func withEnv(t *testing.T, kv map[string]string) {
	t.Helper()
	originals := map[string]string{}
	for k := range kv {
		originals[k] = os.Getenv(k)
	}
	for k, v := range kv {
		t.Setenv(k, v)
	}
	// t.Setenv handles restoration automatically at test end.
	_ = originals
}

func TestLoadSMTPConfig_EnvVarsOnly(t *testing.T) {
	withEnv(t, map[string]string{
		"SMTP_HOST":      "smtp.example.com",
		"SMTP_PORT":      "587",
		"SMTP_USERNAME":  "apikey",
		"SMTP_PASSWORD":  "s3cret",
		"SMTP_SECURITY":  "starttls",
		"SMTP_FROM":      "noreply@rawdrive.in",
		"SMTP_FROM_NAME": "RawDrive Notifications",
	})

	cfg, err := LoadSMTPConfig(context.Background(), nil)
	require.NoError(t, err)
	require.NotNil(t, cfg, "env-only path must return a non-nil config")

	assert.Equal(t, "smtp.example.com", cfg.Host)
	assert.Equal(t, 587, cfg.Port)
	assert.Equal(t, "apikey", cfg.Username)
	assert.Equal(t, "s3cret", cfg.Password)
	assert.Equal(t, "starttls", cfg.Security)
	assert.Equal(t, "noreply@rawdrive.in", cfg.FromAddress)
	assert.Equal(t, "RawDrive Notifications", cfg.FromName)
}

func TestLoadSMTPConfig_AllMissing_ReturnsNil(t *testing.T) {
	// Clear every env var. t.Setenv with empty string counts as set
	// but empty, which the loader treats as unset.
	withEnv(t, map[string]string{
		"SMTP_HOST":      "",
		"SMTP_PORT":      "",
		"SMTP_USERNAME":  "",
		"SMTP_PASSWORD":  "",
		"SMTP_SECURITY":  "",
		"SMTP_FROM":      "",
		"SMTP_FROM_NAME": "",
	})

	cfg, err := LoadSMTPConfig(context.Background(), nil)
	assert.NoError(t, err, "missing config is not an error — caller decides FATAL vs. stub fallback")
	assert.Nil(t, cfg, "missing required fields must return a nil config so main.go can decide")
}

func TestLoadSMTPConfig_SettingsReaderBeatsEnvVars(t *testing.T) {
	// Both sources configured. The platform_settings reader must win
	// per the AGENTS.md No-Hardcoded-Credentials rule: "(1) platform_settings
	// table → (2) environment variables → (3) fail".
	withEnv(t, map[string]string{
		"SMTP_HOST":      "env.example.com",
		"SMTP_PORT":      "25",
		"SMTP_SECURITY":  "starttls",
		"SMTP_FROM":      "env@rawdrive.in",
		"SMTP_FROM_NAME": "Env Mail",
	})
	reader := &fakeSettingsReader{data: map[string]string{
		"email/smtp_host":      "db.example.com",
		"email/smtp_port":      "587",
		"email/smtp_security":  "ssl",
		"email/smtp_from":      "db@rawdrive.in",
		"email/smtp_from_name": "DB Mail",
	}}

	cfg, err := LoadSMTPConfig(context.Background(), reader)
	require.NoError(t, err)
	require.NotNil(t, cfg)

	assert.Equal(t, "db.example.com", cfg.Host, "platform_settings wins over env var")
	assert.Equal(t, 587, cfg.Port, "platform_settings wins over env var")
	assert.Equal(t, "ssl", cfg.Security, "platform_settings wins over env var")
	assert.Equal(t, "db@rawdrive.in", cfg.FromAddress, "platform_settings wins over env var")
	assert.Equal(t, "DB Mail", cfg.FromName, "platform_settings wins over env var")
}

func TestLoadSMTPConfig_SettingsReaderPartialFallsBackToEnv(t *testing.T) {
	// DB has host + port but not the from address. Loader must fall
	// back to the env var for the missing key.
	withEnv(t, map[string]string{
		"SMTP_HOST": "env.example.com",
		"SMTP_PORT": "25",
		"SMTP_FROM": "env@rawdrive.in",
	})
	reader := &fakeSettingsReader{data: map[string]string{
		"email/smtp_host": "db.example.com",
		"email/smtp_port": "2525",
		// from_address intentionally omitted
	}}

	cfg, err := LoadSMTPConfig(context.Background(), reader)
	require.NoError(t, err)
	require.NotNil(t, cfg)

	assert.Equal(t, "db.example.com", cfg.Host)
	assert.Equal(t, 2525, cfg.Port)
	assert.Equal(t, "env@rawdrive.in", cfg.FromAddress)
}

func TestLoadSMTPConfig_InvalidPort_Errors(t *testing.T) {
	withEnv(t, map[string]string{
		"SMTP_HOST": "smtp.example.com",
		"SMTP_PORT": "not-a-number",
		"SMTP_FROM": "noreply@rawdrive.in",
	})

	cfg, err := LoadSMTPConfig(context.Background(), nil)
	assert.Nil(t, cfg)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "SMTP_PORT")
}

func TestLoadSMTPConfig_InvalidSecurity_Errors(t *testing.T) {
	withEnv(t, map[string]string{
		"SMTP_HOST":     "smtp.example.com",
		"SMTP_PORT":     "587",
		"SMTP_SECURITY": "definitely-not-valid",
		"SMTP_FROM":     "noreply@rawdrive.in",
	})

	cfg, err := LoadSMTPConfig(context.Background(), nil)
	assert.Nil(t, cfg)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "SMTP_SECURITY")
}

func TestUsesImplicitTLS_HonorsSecurityMode(t *testing.T) {
	assert.True(t, usesImplicitTLS(&SMTPConfig{Host: "smtpout.secureserver.net", Port: 465, Security: "auto"}), "auto uses implicit TLS on 465")
	assert.True(t, usesImplicitTLS(&SMTPConfig{Host: "smtp.example.com", Port: 587, Security: "ssl"}), "ssl forces implicit TLS even off 465")
	assert.False(t, usesImplicitTLS(&SMTPConfig{Host: "smtpout.secureserver.net", Port: 465, Security: "starttls"}), "explicit starttls disables implicit TLS")
	assert.False(t, usesImplicitTLS(&SMTPConfig{Host: "smtp.example.com", Port: 587, Security: "auto"}), "auto does not use implicit TLS off 465")
}

// ──────────────────────── Message composition ────────────────────────

func TestComposeOTPMessage_ContainsCodeAndHeaders(t *testing.T) {
	cfg := &SMTPConfig{
		Host:        "smtp.example.com",
		Port:        587,
		FromAddress: "noreply@rawdrive.in",
		FromName:    "RawDrive",
	}
	msg := string(composeOTPMessage(cfg, "user@example.com", "123456"))

	assert.Contains(t, msg, "From:")
	assert.Contains(t, msg, "noreply@rawdrive.in")
	assert.Contains(t, msg, "RawDrive", "display name must appear in From header when set")
	assert.Contains(t, msg, "To:")
	assert.Contains(t, msg, "user@example.com")
	assert.Contains(t, msg, "Subject:")
	assert.Contains(t, msg, "verification code")
	assert.Contains(t, msg, "MIME-Version: 1.0")
	assert.Contains(t, msg, "Content-Type: text/plain")
	assert.Contains(t, msg, "123456", "body MUST include the OTP code")
	// RFC 5322 header/body separator is CRLF CRLF.
	assert.Contains(t, msg, "\r\n\r\n")
}

func TestComposeInvitationMessage_ContainsLink(t *testing.T) {
	cfg := &SMTPConfig{
		FromAddress: "noreply@rawdrive.in",
		FromName:    "RawDrive",
	}
	link := "https://app.rawdrive.io/invite?token=tok_abc123"
	msg := string(composeInvitationMessage(cfg, "invitee@example.com", link))

	assert.Contains(t, msg, "From:")
	assert.Contains(t, msg, "noreply@rawdrive.in")
	assert.Contains(t, msg, "To:")
	assert.Contains(t, msg, "invitee@example.com")
	assert.Contains(t, msg, "Subject:")
	assert.Contains(t, msg, "invited")
	assert.Contains(t, msg, link, "body MUST include the invitation link verbatim")
}

// Issue #4 (RawDrive_NewUniqueIssues.xlsx): platform-role invitation
// emails must name the granted role in the subject and body, and
// include the activation link verbatim so the invitee can reach the
// existing /activate OTP flow.
func TestComposeAdminInvitationMessage_IncludesRoleAndLink(t *testing.T) {
	cfg := &SMTPConfig{
		FromAddress: "noreply@rawdrive.in",
		FromName:    "RawDrive",
	}
	link := "https://app.rawdrive.io/activate?email=new-admin%40example.com"
	msg := string(composeAdminInvitationMessage(cfg, "new-admin@example.com", "admin", link))

	assert.Contains(t, msg, "To:")
	assert.Contains(t, msg, "new-admin@example.com")
	assert.Contains(t, msg, "Subject:")
	assert.Contains(t, msg, "as Admin", "subject must display the human-readable role label")
	assert.Contains(t, msg, "granted the Admin role", "body must spell out the role being granted")
	assert.Contains(t, msg, link, "body must include the activation link verbatim")
}

func TestComposeAdminInvitationMessage_UnknownRoleIsPassedThrough(t *testing.T) {
	cfg := &SMTPConfig{FromAddress: "noreply@rawdrive.in"}
	msg := string(composeAdminInvitationMessage(cfg, "x@example.com", "custom_role", "https://app.rawdrive.io/activate"))
	assert.Contains(t, msg, "as custom_role", "fallback must reuse the raw role string")
}

func TestHumanRoleLabel_KnownRoles(t *testing.T) {
	cases := map[string]string{
		"admin":        "Admin",
		"photographer": "Photographer",
		"dealer":       "Dealer",
		"team_member":  "Team Member",
		"client":       "Client",
		"unknown":      "unknown",
	}
	for in, want := range cases {
		assert.Equal(t, want, humanRoleLabel(in), "role label mismatch for %q", in)
	}
}

// ──────────────────────── Delivery adapters ────────────────────────

// capturedMail records a single SendMail invocation for the fake
// Mailer used by the delivery tests. Wrapping the values keeps the
// assertion code simple.
func TestComposeMessages_SanitizeHeadersAndEscapeGalleryHTML(t *testing.T) {
	cfg := &SMTPConfig{
		FromAddress: "noreply@rawdrive.in\r\nBcc: injected@example.com",
		FromName:    "RawDrive\r\nBcc: injected@example.com",
	}

	galleryMsg := string(composeGalleryShareMessage(cfg, "client@example.com\r\nBcc: injected@example.com", GalleryShareData{
		SenderName:   "Planner\r\nBcc: injected@example.com",
		GalleryTitle: `<img src=x onerror="alert(1)">`,
		Message:      `<script>alert("xss")</script>`,
		GalleryLink:  `https://rawdrive.test/g/wedding?share=abc&next="bad"`,
	}))

	assert.NotContains(t, galleryMsg, "\r\nBcc:", "headers must not allow CRLF injection")
	assert.NotContains(t, galleryMsg, "<script>", "custom message must be HTML-escaped")
	assert.NotContains(t, galleryMsg, "<img src=x", "gallery title must be HTML-escaped")
	assert.Contains(t, galleryMsg, "&lt;script&gt;alert(&#34;xss&#34;)&lt;/script&gt;")
	assert.Contains(t, galleryMsg, "&lt;img src=x onerror=&#34;alert(1)&#34;&gt;")
	assert.Contains(t, galleryMsg, "share=abc&amp;next=&#34;bad&#34;")

	notificationMsg := string(composeNotificationMessage(
		cfg,
		"owner@example.com\r\nBcc: injected@example.com",
		"Lead update\r\nBcc: injected@example.com",
		"Body",
		"/crm/leads/1",
	))
	assert.NotContains(t, notificationMsg, "\r\nBcc:", "notification headers must not allow CRLF injection")
	assert.Contains(t, notificationMsg, "Subject: Lead update Bcc: injected@example.com\r\n")
}

type capturedMail struct {
	addr string
	auth smtp.Auth
	from string
	to   []string
	msg  []byte
}

func captureMail(target *capturedMail) Mailer {
	return func(cfg *SMTPConfig, to []string, msg []byte) error {
		*target = capturedMail{
			addr: smtpAddr(cfg),
			auth: smtpAuth(cfg),
			from: cfg.FromAddress,
			to:   append([]string(nil), to...),
			msg:  append([]byte(nil), msg...),
		}
		return nil
	}
}

func TestOTPDelivery_SendOTP_CallsMailerWithComposedMessage(t *testing.T) {
	cfg := &SMTPConfig{
		Host:        "smtp.example.com",
		Port:        587,
		Username:    "apikey",
		Password:    "s3cret",
		FromAddress: "noreply@rawdrive.in",
		FromName:    "RawDrive",
	}
	var captured capturedMail
	d := &OTPDelivery{
		cfg:    cfg,
		mailer: captureMail(&captured),
	}

	err := d.SendOTP(context.Background(), "user@example.com", "654321")
	require.NoError(t, err)

	assert.Equal(t, "smtp.example.com:587", captured.addr)
	assert.NotNil(t, captured.auth, "PLAIN auth must be constructed when username is present")
	assert.Equal(t, "noreply@rawdrive.in", captured.from)
	assert.Equal(t, []string{"user@example.com"}, captured.to)
	assert.True(t, strings.Contains(string(captured.msg), "654321"), "sent message must include the OTP code")
}

func TestOTPDelivery_SendOTP_NoAuthWhenUsernameEmpty(t *testing.T) {
	// Matches the dev Mailpit listener on port 1025 which accepts
	// mail with no auth at all.
	cfg := &SMTPConfig{
		Host:        "mailpit",
		Port:        1025,
		FromAddress: "noreply@rawdrive.in",
	}
	var captured capturedMail
	d := &OTPDelivery{
		cfg:    cfg,
		mailer: captureMail(&captured),
	}

	err := d.SendOTP(context.Background(), "user@example.com", "654321")
	require.NoError(t, err)

	assert.Equal(t, "mailpit:1025", captured.addr)
	assert.Nil(t, captured.auth, "PLAIN auth must be nil when username is empty")
}

func TestDynamicOTPDelivery_ReloadsSettingsPerSend(t *testing.T) {
	reader := &fakeSettingsReader{data: map[string]string{
		"email/smtp_host": "first.example.com",
		"email/smtp_port": "587",
		"email/smtp_from": "noreply@rawdrive.in",
	}}
	var addrs []string
	d := NewDynamicOTPDelivery(reader)
	d.mailer = func(cfg *SMTPConfig, to []string, msg []byte) error {
		addrs = append(addrs, smtpAddr(cfg))
		return nil
	}

	require.NoError(t, d.SendOTP(context.Background(), "user@example.com", "111111"))
	reader.data["email/smtp_host"] = "smtpout.secureserver.net"
	reader.data["email/smtp_port"] = "465"
	require.NoError(t, d.SendOTP(context.Background(), "user@example.com", "222222"))

	assert.Equal(t, []string{"first.example.com:587", "smtpout.secureserver.net:465"}, addrs)
}

func TestInvitationSender_SendInvitation_CallsMailerWithLink(t *testing.T) {
	cfg := &SMTPConfig{
		Host:        "smtp.example.com",
		Port:        587,
		Username:    "apikey",
		Password:    "s3cret",
		FromAddress: "noreply@rawdrive.in",
	}
	var captured capturedMail
	d := &InvitationSender{
		cfg:    cfg,
		mailer: captureMail(&captured),
	}

	link := "https://app.rawdrive.io/invite?token=tok_abc"
	err := d.SendInvitation(context.Background(), "invitee@example.com", link)
	require.NoError(t, err)

	assert.Equal(t, "smtp.example.com:587", captured.addr)
	assert.Equal(t, []string{"invitee@example.com"}, captured.to)
	assert.True(t, strings.Contains(string(captured.msg), link), "sent message must include the invitation link")
}
