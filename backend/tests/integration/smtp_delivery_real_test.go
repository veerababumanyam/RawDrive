package integration_test

// ISSUE-002 (brownfield P0, production readiness): issuestofix.md item
// #6 observed that the SMTP transport fix is code-complete but not
// evidence-complete — no recorded test run proved that registration
// OTP, team invite, or password-reset emails actually make it through
// a real SMTP server. The unit tests in backend/internal/email exercise
// message composition and auth construction but never open a socket.
//
// This file is the end-to-end smoke test for OTPDelivery and
// InvitationSender against a real SMTP speaker. It talks to the
// docker-compose Mailpit service, which is wire-compatible with the
// RFC 5321 path the production transport will take against Postmark /
// SES / Mailgun, and verifies the composed message lands in a
// mailbox with the expected subject and payload.
//
// Note on "real provider" coverage: a complete production smoke test
// against Postmark or SES would additionally verify STARTTLS, PLAIN
// auth, and DKIM signing — all of which require operator-supplied
// credentials that this repo does not ship. Operator-facing steps for
// running the equivalent check against a real provider are documented
// in docs/brownfield/meta-issues-clarification.md. For in-repo CI,
// Mailpit is the strongest "actually uses net/smtp.SendMail against a
// live server" evidence we can generate without baking credentials.

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/email"
)

const (
	mailpitSMTPAddr = "localhost:1025"
	mailpitAPIBase  = "http://localhost:8025"
)

// mailpitResponsive probes the Mailpit HTTP API with a short timeout.
// We need both the SMTP port (via smtpResponsive from health_test.go)
// AND the HTTP API up — the test needs to send mail AND read it back.
// Separate check from smtpResponsive because the two ports have
// independent health states.
func mailpitResponsive(timeout time.Duration) bool {
	client := &http.Client{Timeout: timeout}
	resp, err := client.Get(mailpitAPIBase + "/api/v1/info")
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

// mailpitMessageSummary matches the JSON shape returned by
// GET /api/v1/messages. Mailpit exposes more fields than we need; the
// ones below are what this test asserts on.
type mailpitMessageSummary struct {
	ID      string              `json:"ID"`
	From    mailpitAddress      `json:"From"`
	To      []mailpitAddress    `json:"To"`
	Subject string              `json:"Subject"`
	Snippet string              `json:"Snippet"`
}

type mailpitAddress struct {
	Name    string `json:"Name"`
	Address string `json:"Address"`
}

type mailpitListResponse struct {
	Total    int                     `json:"total"`
	Messages []mailpitMessageSummary `json:"messages"`
}

type mailpitFullMessage struct {
	ID      string           `json:"ID"`
	From    mailpitAddress   `json:"From"`
	To      []mailpitAddress `json:"To"`
	Subject string           `json:"Subject"`
	Text    string           `json:"Text"` // plain-text body as parsed by Mailpit
}

// findMailpitMessageForRecipient polls Mailpit's message list and
// returns the first (newest) message whose To includes the given
// address. Polling is necessary because SMTP delivery is asynchronous
// from the client's perspective — SendOTP returns after the server
// sends DATA/250, but Mailpit may take a few millis to expose the
// message via the REST API. 3s with 100ms steps is plenty and keeps
// the test fast when everything is healthy.
func findMailpitMessageForRecipient(t *testing.T, recipient string) mailpitMessageSummary {
	t.Helper()

	deadline := time.Now().Add(3 * time.Second)
	client := &http.Client{Timeout: 2 * time.Second}

	for time.Now().Before(deadline) {
		resp, err := client.Get(mailpitAPIBase + "/api/v1/messages?limit=50")
		require.NoError(t, err, "mailpit /messages must respond")
		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, resp.StatusCode, "mailpit list status: %s", body)

		var list mailpitListResponse
		require.NoError(t, json.Unmarshal(body, &list))

		for _, msg := range list.Messages {
			for _, to := range msg.To {
				if to.Address == recipient {
					return msg
				}
			}
		}

		time.Sleep(100 * time.Millisecond)
	}

	t.Fatalf("no mailpit message for recipient %q after 3s poll", recipient)
	return mailpitMessageSummary{} // unreachable
}

// fetchMailpitFullMessage retrieves the parsed body of a single
// message by ID. Used to assert on the exact text payload.
func fetchMailpitFullMessage(t *testing.T, id string) mailpitFullMessage {
	t.Helper()

	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(mailpitAPIBase + "/api/v1/message/" + id)
	require.NoError(t, err)
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode, "mailpit message status: %s", body)

	var msg mailpitFullMessage
	require.NoError(t, json.Unmarshal(body, &msg))
	return msg
}

// mailpitConfig returns a Mailpit-shaped SMTPConfig. Mailpit accepts
// unauthenticated SMTP on port 1025, so Username and Password are
// empty. The FromAddress is a test-only address that does not need
// to be routable.
func mailpitConfig() *email.SMTPConfig {
	return &email.SMTPConfig{
		Host:        "localhost",
		Port:        1025,
		FromAddress: "smoke-test@rawdrive.test",
		FromName:    "RawDrive Smoke Test",
	}
}

// TestSMTPRealDelivery_OTPLandsInMailpit is the end-to-end happy path
// for OTPDelivery. It constructs the production delivery type with
// Mailpit config, sends a verification code to a unique recipient,
// then pulls the resulting message out of Mailpit's REST API and
// asserts the subject and body.
//
// Uniqueness: recipient contains time.Now().UnixNano() so parallel
// runs (or a local dev instance with residue) never cross-contaminate.
func TestSMTPRealDelivery_OTPLandsInMailpit(t *testing.T) {
	if !smtpResponsive(mailpitSMTPAddr, 2*time.Second) {
		t.Skipf("mailpit SMTP not responsive at %s — skipping real SMTP smoke test", mailpitSMTPAddr)
	}
	if !mailpitResponsive(2 * time.Second) {
		t.Skipf("mailpit HTTP API not responsive at %s — cannot assert delivery", mailpitAPIBase)
	}

	recipient := fmt.Sprintf("otp-smoke-%d@rawdrive.test", time.Now().UnixNano())
	code := "ABC123"

	delivery := email.NewOTPDelivery(mailpitConfig())

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	require.NoError(t, delivery.SendOTP(ctx, recipient, code),
		"production OTPDelivery.SendOTP must succeed against real Mailpit")

	summary := findMailpitMessageForRecipient(t, recipient)
	assert.Contains(t, summary.Subject, "verification code",
		"OTP subject must identify itself as a verification code")

	full := fetchMailpitFullMessage(t, summary.ID)
	assert.Contains(t, full.Text, code,
		"OTP body must contain the exact 6-digit code that was passed in")
	assert.Equal(t, "smoke-test@rawdrive.test", full.From.Address,
		"from address must match configured FromAddress")
}

// TestSMTPRealDelivery_InvitationLandsInMailpit is the same shape for
// the team-invitation transport. This covers the second SMTP code path
// called out by ISSUE-002 (team invites were also stubbed).
func TestSMTPRealDelivery_InvitationLandsInMailpit(t *testing.T) {
	if !smtpResponsive(mailpitSMTPAddr, 2*time.Second) {
		t.Skipf("mailpit SMTP not responsive at %s — skipping real SMTP smoke test", mailpitSMTPAddr)
	}
	if !mailpitResponsive(2 * time.Second) {
		t.Skipf("mailpit HTTP API not responsive at %s — cannot assert delivery", mailpitAPIBase)
	}

	recipient := fmt.Sprintf("invite-smoke-%d@rawdrive.test", time.Now().UnixNano())
	inviteLink := fmt.Sprintf("https://rawdrive.test/accept-invite/%d", time.Now().UnixNano())

	sender := email.NewInvitationSender(mailpitConfig())

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	require.NoError(t, sender.SendInvitation(ctx, recipient, inviteLink),
		"production InvitationSender.SendInvitation must succeed against real Mailpit")

	summary := findMailpitMessageForRecipient(t, recipient)
	assert.Contains(t, summary.Subject, "invited to a RawDrive workspace",
		"invitation subject must be recognizable")

	full := fetchMailpitFullMessage(t, summary.ID)
	assert.Contains(t, full.Text, inviteLink,
		"invitation body must contain the exact accept-invite URL that was passed in")
}
