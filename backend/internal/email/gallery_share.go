package email

import (
	"fmt"
	"strings"
)

// GalleryShareSender sends gallery share emails via SMTP.
type GalleryShareSender struct {
	cfg    *SMTPConfig
	mailer Mailer
}

// NewGalleryShareSender creates a new GalleryShareSender. Returns nil if cfg is nil.
func NewGalleryShareSender(cfg *SMTPConfig) *GalleryShareSender {
	if cfg == nil {
		return nil
	}
	return &GalleryShareSender{cfg: cfg, mailer: defaultMailer}
}

// GalleryShareData holds data for a gallery share email.
type GalleryShareData struct {
	SenderName   string
	GalleryTitle string
	Message      string
	GalleryLink  string
}

// Send sends a gallery share notification email.
func (s *GalleryShareSender) Send(to string, data GalleryShareData) error {
	msg := composeGalleryShareMessage(s.cfg, to, data)
	return s.mailer(
		fmt.Sprintf("%s:%d", s.cfg.Host, s.cfg.Port),
		smtpAuth(s.cfg),
		s.cfg.FromAddress,
		[]string{to},
		msg,
	)
}

func composeGalleryShareMessage(cfg *SMTPConfig, to string, data GalleryShareData) []byte {
	var b strings.Builder
	writeFromHeader(&b, cfg)
	fmt.Fprintf(&b, "To: <%s>\r\n", to)
	fmt.Fprintf(&b, "Subject: %s shared a gallery with you: %s\r\n", data.SenderName, data.GalleryTitle)
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Content-Type: text/html; charset=UTF-8\r\n")
	b.WriteString("\r\n")

	b.WriteString(`<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:40px;background:#f5f5f7;">`)
	b.WriteString(`<div style="max-width:480px;margin:0 auto;background:white;border-radius:16px;padding:32px;">`)
	b.WriteString(`<h2 style="margin:0 0 8px;font-size:20px;color:#1d1d1f;">Gallery shared with you</h2>`)
	fmt.Fprintf(&b, `<p style="color:#424245;line-height:1.5;"><strong>%s</strong> shared the gallery <strong>%s</strong> with you on RawDrive.</p>`, data.SenderName, data.GalleryTitle)

	if data.Message != "" {
		fmt.Fprintf(&b, `<div style="margin:16px 0;padding:12px 16px;background:#f5f5f7;border-radius:8px;color:#424245;font-style:italic;">&ldquo;%s&rdquo;</div>`, data.Message)
	}

	fmt.Fprintf(&b, `<div style="margin:24px 0;text-align:center;"><a href="%s" style="display:inline-block;background:#0071e3;color:white;text-decoration:none;padding:12px 32px;border-radius:12px;font-weight:500;font-size:16px;">View Gallery</a></div>`, data.GalleryLink)
	b.WriteString(`<p style="color:#86868b;font-size:13px;margin:0;">If you didn't expect this, you can safely ignore it.</p>`)
	b.WriteString(`</div></body></html>`)

	return []byte(b.String())
}
