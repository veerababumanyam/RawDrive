package email

import (
	"context"
	"fmt"
	"strings"
)

// NotificationSender sends generic product notifications through SMTP.
type NotificationSender struct {
	cfg    *SMTPConfig
	loader configLoader
	mailer Mailer
}

func NewNotificationSender(cfg *SMTPConfig) *NotificationSender {
	if cfg == nil {
		return nil
	}
	return &NotificationSender{cfg: cfg, mailer: defaultMailer}
}

// NewDynamicNotificationSender reloads SMTP settings from platform_settings
// for every send, falling back to SMTP_* env vars per key.
func NewDynamicNotificationSender(reader SettingsReader) *NotificationSender {
	return &NotificationSender{loader: dynamicConfigLoader(reader), mailer: defaultMailer}
}

func (s *NotificationSender) Send(ctx context.Context, to, subject, body, actionURL string) error {
	cfg, err := resolveConfig(ctx, s.cfg, s.loader)
	if err != nil {
		return err
	}
	return sendConfigured(s.mailer, cfg, to, composeNotificationMessage(cfg, to, subject, body, actionURL))
}

func composeNotificationMessage(cfg *SMTPConfig, to, subject, body, actionURL string) []byte {
	var b strings.Builder
	writeFromHeader(&b, cfg)
	fmt.Fprintf(&b, "To: <%s>\r\n", to)
	fmt.Fprintf(&b, "Subject: %s\r\n", subject)
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	b.WriteString("\r\n")
	if body != "" {
		b.WriteString(body)
		b.WriteString("\r\n\r\n")
	}
	if actionURL != "" {
		fmt.Fprintf(&b, "Open in RawDrive: %s\r\n\r\n", actionURL)
	}
	b.WriteString("If you did not expect this notification, you can safely ignore this email.\r\n")
	return []byte(b.String())
}
