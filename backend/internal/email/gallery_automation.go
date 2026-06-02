package email

import (
	"context"
	"fmt"
	"html"
	"strings"
)

// GalleryAutomationSender sends branded, automated client gallery emails
// (gallery ready / reminder / last-chance) via SMTP. Modeled on
// GalleryShareSender but carries per-workspace studio branding (name, accent
// colour, logo) so the client sees the photographer's identity.
type GalleryAutomationSender struct {
	cfg    *SMTPConfig
	loader configLoader
	mailer Mailer
}

// NewGalleryAutomationSender creates a static-config sender. Returns nil if cfg is nil.
func NewGalleryAutomationSender(cfg *SMTPConfig) *GalleryAutomationSender {
	if cfg == nil {
		return nil
	}
	return &GalleryAutomationSender{cfg: cfg, mailer: defaultMailer}
}

// NewDynamicGalleryAutomationSender reloads SMTP settings from platform_settings
// for every send (falling back to SMTP_* env vars), mirroring the other senders.
func NewDynamicGalleryAutomationSender(reader SettingsReader) *GalleryAutomationSender {
	return &GalleryAutomationSender{loader: dynamicConfigLoader(reader), mailer: defaultMailer}
}

// GalleryAutomationData holds the data for one branded automation email.
type GalleryAutomationData struct {
	EventType    string // "ready" | "reminder" | "last_chance"
	GalleryTitle string
	GalleryLink  string
	StudioName   string // empty → neutral fallback
	AccentColor  string // "#RRGGBB"; empty → default brand blue
	LogoURL      string // optional absolute URL
	ExpiryLabel  string // human date, used by "last_chance"
}

const defaultAutomationAccent = "#0071e3"

// looksLikeHexColor reports whether s is a #RGB or #RRGGBB hex colour, so an
// untrusted workspace accent never lands unvalidated in an inline style.
func looksLikeHexColor(s string) bool {
	if len(s) != 4 && len(s) != 7 {
		return false
	}
	if s[0] != '#' {
		return false
	}
	for _, c := range s[1:] {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
			return false
		}
	}
	return true
}

// Send composes and delivers the branded automation email for data.EventType.
func (s *GalleryAutomationSender) Send(ctx context.Context, to string, data GalleryAutomationData) error {
	cfg, err := resolveConfig(ctx, s.cfg, s.loader)
	if err != nil {
		return err
	}
	return sendConfigured(s.mailer, cfg, to, composeGalleryAutomationMessage(cfg, to, data))
}

// automationSubject returns the subject line for an event type.
func automationSubject(eventType, studio, galleryTitle string) string {
	who := studio
	if who == "" {
		who = "Your photographer"
	}
	switch eventType {
	case "reminder":
		return fmt.Sprintf("A reminder from %s: your gallery %q is waiting", who, galleryTitle)
	case "last_chance":
		return fmt.Sprintf("Last chance to download your gallery %q", galleryTitle)
	default: // "ready"
		return fmt.Sprintf("Your gallery %q is ready", galleryTitle)
	}
}

// automationHeadline / automationBody return the in-body copy per event type.
func automationCopy(eventType, studio, expiryLabel string) (headline, body string) {
	who := studio
	if who == "" {
		who = "Your photographer"
	}
	switch eventType {
	case "reminder":
		return "Your gallery is waiting",
			fmt.Sprintf("Just a friendly reminder from %s — your photos are ready to view and download whenever you are.", who)
	case "last_chance":
		msg := fmt.Sprintf("Your gallery from %s is closing soon.", who)
		if expiryLabel != "" {
			msg = fmt.Sprintf("Your gallery from %s closes on %s. Please download your photos before then.", who, expiryLabel)
		}
		return "Last chance to download", msg
	default:
		return "Your gallery is ready",
			fmt.Sprintf("%s has finished your gallery. Tap below to view and download your photos.", who)
	}
}

func composeGalleryAutomationMessage(cfg *SMTPConfig, to string, data GalleryAutomationData) []byte {
	studio := sanitizeHeaderValue(data.StudioName)
	galleryTitle := sanitizeHeaderValue(data.GalleryTitle)
	safeStudio := html.EscapeString(studio)
	safeTitle := html.EscapeString(galleryTitle)
	safeLink := html.EscapeString(sanitizeHeaderValue(data.GalleryLink))
	safeLogo := html.EscapeString(sanitizeHeaderValue(data.LogoURL))

	accent := strings.TrimSpace(data.AccentColor)
	if !looksLikeHexColor(accent) {
		accent = defaultAutomationAccent
	}

	headline, body := automationCopy(data.EventType, studio, sanitizeHeaderValue(data.ExpiryLabel))
	safeHeadline := html.EscapeString(headline)
	safeBody := html.EscapeString(body)

	var b strings.Builder
	writeFromHeader(&b, cfg)
	fmt.Fprintf(&b, "To: <%s>\r\n", sanitizeHeaderValue(to))
	fmt.Fprintf(&b, "Subject: %s\r\n", sanitizeHeaderValue(automationSubject(data.EventType, studio, galleryTitle)))
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Content-Type: text/html; charset=UTF-8\r\n")
	b.WriteString("\r\n")

	b.WriteString(`<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:40px;background:#f5f5f7;">`)
	b.WriteString(`<div style="max-width:480px;margin:0 auto;background:white;border-radius:16px;padding:32px;text-align:center;">`)

	// Branded header: logo when available, else studio name.
	if safeLogo != "" {
		fmt.Fprintf(&b, `<img src="%s" alt="%s" style="max-height:48px;margin:0 auto 16px;display:block;" />`, safeLogo, safeStudio)
	} else if safeStudio != "" {
		fmt.Fprintf(&b, `<div style="font-size:18px;font-weight:600;color:#1d1d1f;margin-bottom:16px;">%s</div>`, safeStudio)
	}

	fmt.Fprintf(&b, `<h2 style="margin:0 0 8px;font-size:22px;color:#1d1d1f;">%s</h2>`, safeHeadline)
	fmt.Fprintf(&b, `<p style="color:#424245;line-height:1.5;">%s</p>`, safeBody)
	fmt.Fprintf(&b, `<p style="color:#424245;line-height:1.5;font-weight:500;">%s</p>`, safeTitle)
	fmt.Fprintf(&b, `<div style="margin:24px 0;"><a href="%s" style="display:inline-block;background:%s;color:white;text-decoration:none;padding:12px 32px;border-radius:12px;font-weight:500;font-size:16px;">View your gallery</a></div>`, safeLink, html.EscapeString(accent))
	b.WriteString(`<p style="color:#86868b;font-size:13px;margin:0;">Sent on behalf of your photographer via RawDrive.</p>`)
	b.WriteString(`</div></body></html>`)

	return []byte(b.String())
}
