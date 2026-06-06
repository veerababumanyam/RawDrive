package email

import (
	"context"
	"encoding/base64"
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

func (s *NotificationSender) SendWithAttachment(ctx context.Context, to, subject, body, actionURL, attachmentName, attachmentContentType string, attachment []byte) error {
	cfg, err := resolveConfig(ctx, s.cfg, s.loader)
	if err != nil {
		return err
	}
	return sendConfigured(s.mailer, cfg, to, composeNotificationAttachmentMessage(
		cfg,
		to,
		subject,
		body,
		actionURL,
		attachmentName,
		attachmentContentType,
		attachment,
	))
}

func composeNotificationMessage(cfg *SMTPConfig, to, subject, body, actionURL string) []byte {
	var b strings.Builder
	writeFromHeader(&b, cfg)
	fmt.Fprintf(&b, "To: <%s>\r\n", sanitizeHeaderValue(to))
	fmt.Fprintf(&b, "Subject: %s\r\n", sanitizeHeaderValue(subject))
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	b.WriteString("\r\n")
	if body != "" {
		b.WriteString(body)
		b.WriteString("\r\n\r\n")
	}
	if actionURL != "" {
		fmt.Fprintf(&b, "Open in RawDrive: %s\r\n\r\n", sanitizeHeaderValue(actionURL))
	}
	b.WriteString("If you did not expect this notification, you can safely ignore this email.\r\n")
	return []byte(b.String())
}

func composeNotificationAttachmentMessage(cfg *SMTPConfig, to, subject, body, actionURL, attachmentName, attachmentContentType string, attachment []byte) []byte {
	if attachmentContentType == "" {
		attachmentContentType = "application/octet-stream"
	}
	if attachmentName == "" {
		attachmentName = "attachment.bin"
	}

	const boundary = "rawdrive-notification-boundary"
	var b strings.Builder
	writeFromHeader(&b, cfg)
	fmt.Fprintf(&b, "To: <%s>\r\n", sanitizeHeaderValue(to))
	fmt.Fprintf(&b, "Subject: %s\r\n", sanitizeHeaderValue(subject))
	b.WriteString("MIME-Version: 1.0\r\n")
	fmt.Fprintf(&b, "Content-Type: multipart/mixed; boundary=%q\r\n", boundary)
	b.WriteString("\r\n")

	fmt.Fprintf(&b, "--%s\r\n", boundary)
	b.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	b.WriteString("Content-Transfer-Encoding: 8bit\r\n")
	b.WriteString("\r\n")
	if body != "" {
		b.WriteString(body)
		b.WriteString("\r\n\r\n")
	}
	if actionURL != "" {
		fmt.Fprintf(&b, "Open in RawDrive: %s\r\n\r\n", sanitizeHeaderValue(actionURL))
	}
	b.WriteString("If you did not expect this notification, you can safely ignore this email.\r\n")
	b.WriteString("\r\n")

	fmt.Fprintf(&b, "--%s\r\n", boundary)
	fmt.Fprintf(&b, "Content-Type: %s\r\n", sanitizeHeaderValue(attachmentContentType))
	fmt.Fprintf(&b, "Content-Disposition: attachment; filename=%q\r\n", sanitizeHeaderValue(attachmentName))
	b.WriteString("Content-Transfer-Encoding: base64\r\n")
	b.WriteString("\r\n")
	writeBase64Lines(&b, attachment)
	b.WriteString("\r\n")
	fmt.Fprintf(&b, "--%s--\r\n", boundary)
	return []byte(b.String())
}

func writeBase64Lines(b *strings.Builder, data []byte) {
	encoded := base64.StdEncoding.EncodeToString(data)
	const width = 76
	for len(encoded) > width {
		b.WriteString(encoded[:width])
		b.WriteString("\r\n")
		encoded = encoded[width:]
	}
	if encoded != "" {
		b.WriteString(encoded)
		b.WriteString("\r\n")
	}
}
