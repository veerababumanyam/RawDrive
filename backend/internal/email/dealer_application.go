package email

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// DealerApplicationData holds the submitted dealer partnership details.
type DealerApplicationData struct {
	DealerEmail     string
	BusinessName    string
	State           string
	TerritoryType   string
	PANNumber       string // optional — empty when not provided
	GSTIN           string // optional — empty when not provided
	BusinessProfile string // optional — free-text business description
	SubmittedAt     time.Time
}

// DealerApplicationSender sends partnership-application emails through SMTP.
type DealerApplicationSender struct {
	loader configLoader
	mailer Mailer
}

// NewDynamicDealerApplicationSender reloads SMTP settings from platform_settings
// for every send, falling back to SMTP_* env vars.
func NewDynamicDealerApplicationSender(reader SettingsReader) *DealerApplicationSender {
	return &DealerApplicationSender{loader: dynamicConfigLoader(reader), mailer: defaultMailer}
}

// SendNotification sends the full application details to the partnerships team.
func (s *DealerApplicationSender) SendNotification(ctx context.Context, notifyEmail string, data DealerApplicationData) error {
	cfg, err := resolveConfig(ctx, nil, s.loader)
	if err != nil {
		return err
	}
	return sendConfigured(s.mailer, cfg, notifyEmail, composeDealerApplicationNotification(cfg, notifyEmail, data))
}

// SendAcknowledgment sends a no-reply confirmation to the applicant.
func (s *DealerApplicationSender) SendAcknowledgment(ctx context.Context, data DealerApplicationData) error {
	cfg, err := resolveConfig(ctx, nil, s.loader)
	if err != nil {
		return err
	}
	return sendConfigured(s.mailer, cfg, data.DealerEmail, composeDealerAcknowledgment(cfg, data))
}

func composeDealerApplicationNotification(cfg *SMTPConfig, to string, data DealerApplicationData) []byte {
	var b strings.Builder
	writeFromHeader(&b, cfg)
	fmt.Fprintf(&b, "To: <%s>\r\n", sanitizeHeaderValue(to))
	b.WriteString("Subject: New Dealer Partnership Application\r\n")
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	b.WriteString("\r\n")
	b.WriteString("New Dealer Partnership Application\r\n")
	b.WriteString("==================================\r\n\r\n")
	fmt.Fprintf(&b, "Business Name:  %s\r\n", sanitizeHeaderValue(data.BusinessName))
	fmt.Fprintf(&b, "Dealer Email:   %s\r\n", sanitizeHeaderValue(data.DealerEmail))
	fmt.Fprintf(&b, "State:          %s\r\n", sanitizeHeaderValue(data.State))
	fmt.Fprintf(&b, "Territory Type: %s\r\n", sanitizeHeaderValue(data.TerritoryType))
	if data.PANNumber != "" {
		fmt.Fprintf(&b, "PAN Number:     %s\r\n", sanitizeHeaderValue(data.PANNumber))
	}
	if data.GSTIN != "" {
		fmt.Fprintf(&b, "GSTIN:          %s\r\n", sanitizeHeaderValue(data.GSTIN))
	}
	if data.BusinessProfile != "" {
		b.WriteString("\r\nBusiness Profile:\r\n")
		fmt.Fprintf(&b, "%s\r\n", data.BusinessProfile)
	}
	fmt.Fprintf(&b, "\r\nSubmitted: %s\r\n", data.SubmittedAt.UTC().Format("02 Jan 2006, 15:04 UTC"))
	return []byte(b.String())
}

func composeDealerAcknowledgment(cfg *SMTPConfig, data DealerApplicationData) []byte {
	var b strings.Builder
	writeFromHeader(&b, cfg)
	fmt.Fprintf(&b, "To: <%s>\r\n", sanitizeHeaderValue(data.DealerEmail))
	b.WriteString("Subject: We received your dealer partnership application\r\n")
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	b.WriteString("\r\n")
	b.WriteString("Hi,\r\n\r\n")
	b.WriteString("Thank you for applying to become a RawDrive dealer partner.\r\n\r\n")
	b.WriteString("We have received your application:\r\n\r\n")
	fmt.Fprintf(&b, "  Business Name:  %s\r\n", sanitizeHeaderValue(data.BusinessName))
	fmt.Fprintf(&b, "  State:          %s\r\n", sanitizeHeaderValue(data.State))
	fmt.Fprintf(&b, "  Territory Type: %s\r\n", sanitizeHeaderValue(data.TerritoryType))
	b.WriteString("\r\nOur partnerships team will review your application and reach out within 3-5 business days.\r\n\r\n")
	b.WriteString("If you have any questions in the meantime, you can write to hello@swazconsultants.com.\r\n\r\n")
	b.WriteString("-- The RawDrive Partnerships Team\r\n")
	return []byte(b.String())
}
