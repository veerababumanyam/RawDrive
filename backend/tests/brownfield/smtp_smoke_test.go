package brownfield_test

// ISSUE-002 smoke test: send a real email through the email.OTPDelivery
// and email.InvitationSender implementations and verify the message
// arrives in Mailpit by querying the Mailpit HTTP API. This closes
// the last end-to-end verification gap that the unit tests (which
// use a fake Mailer) cannot cover.
//
// When Mailpit is not reachable at localhost:1025 the test skips
// cleanly with a descriptive reason. That makes the test safe to
// run on machines without a compose stack up; CI or operators with
// a running compose stack get actual verification.

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/email"
)

// mailpitSMTPHost is the default compose Mailpit SMTP listener.
// Override with MAILPIT_SMTP_HOST / MAILPIT_SMTP_PORT env vars if
// targeting a different stack. mailpitHTTPHost is the HTTP API the
// test queries to verify the message arrived.
const (
	mailpitSMTPHost = "127.0.0.1"
	mailpitSMTPPort = 1025
	mailpitHTTPHost = "http://127.0.0.1:8025"
)

// mailpitReachable returns true iff a TCP connection to the Mailpit
// SMTP port succeeds within a short deadline AND a banner byte
// arrives. A port-open-but-no-protocol state (classic hung-container
// symptom) returns false so the test skips instead of hanging.
func mailpitReachable(t *testing.T) bool {
	t.Helper()
	addr := fmt.Sprintf("%s:%d", mailpitSMTPHost, mailpitSMTPPort)
	d := net.Dialer{Timeout: 2 * time.Second}
	conn, err := d.Dial("tcp", addr)
	if err != nil {
		return false
	}
	defer conn.Close()
	// SMTP servers greet with "220 ..." immediately. If we cannot
	// read at least one byte within 2 seconds, the container is
	// hung — skip.
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	buf := make([]byte, 1)
	if _, err := conn.Read(buf); err != nil {
		return false
	}
	return buf[0] == '2'
}

// clearMailpitInbox deletes every message currently in Mailpit's
// inbox so assertions on message count / content are not polluted
// by previous runs. Best-effort: a 204 or 200 is success; anything
// else is a warning logged to the test output.
func clearMailpitInbox(t *testing.T) {
	t.Helper()
	req, err := http.NewRequest(http.MethodDelete, mailpitHTTPHost+"/api/v1/messages", nil)
	require.NoError(t, err, "new delete request")
	resp, err := (&http.Client{Timeout: 3 * time.Second}).Do(req)
	if err != nil {
		t.Logf("mailpit clear inbox: %v (ignored)", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		t.Logf("mailpit clear inbox unexpected status %d (ignored)", resp.StatusCode)
	}
}

// mailpitMessage is a partial shape of the Mailpit /api/v1/messages
// response. Only the fields the smoke test asserts on are modeled.
type mailpitMessage struct {
	ID      string `json:"ID"`
	From    struct{ Address string } `json:"From"`
	To      []struct{ Address string } `json:"To"`
	Subject string `json:"Subject"`
	Snippet string `json:"Snippet"`
}

type mailpitListResponse struct {
	Total    int              `json:"total"`
	Messages []mailpitMessage `json:"messages"`
}

// fetchMailpitMessages pulls the current inbox summary from Mailpit.
// The caller asserts total / message content against this.
func fetchMailpitMessages(t *testing.T) mailpitListResponse {
	t.Helper()
	resp, err := (&http.Client{Timeout: 5 * time.Second}).Get(mailpitHTTPHost + "/api/v1/messages?limit=50")
	require.NoError(t, err, "mailpit GET messages")
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode, "mailpit messages body: %s", body)
	var out mailpitListResponse
	require.NoError(t, json.Unmarshal(body, &out), "decode mailpit body: %s", body)
	return out
}

// fetchMailpitMessageBody retrieves the text body for a given
// Mailpit message ID. Used to assert the OTP code / invite link
// appears verbatim in the delivered message.
func fetchMailpitMessageBody(t *testing.T, id string) string {
	t.Helper()
	resp, err := (&http.Client{Timeout: 5 * time.Second}).Get(mailpitHTTPHost + "/api/v1/message/" + id)
	require.NoError(t, err, "mailpit GET message %s", id)
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode, "mailpit body status: %s", body)
	// The /api/v1/message/{id} endpoint returns JSON with a "Text"
	// field. We do not bother with a full typed decode — just look
	// for the code / link as a substring of the whole response.
	return string(body)
}

// TestIssue002_SMTP_OTPDelivery_ReachesMailpit is the end-to-end
// smoke test for ISSUE-002. It uses the REAL email.OTPDelivery
// implementation (not the fake Mailer) and sends an actual SMTP
// message to the compose Mailpit listener. Verification is via
// Mailpit's HTTP inbox API.
func TestIssue002_SMTP_OTPDelivery_ReachesMailpit(t *testing.T) {
	if !mailpitReachable(t) {
		t.Skip("mailpit not reachable at 127.0.0.1:1025 (compose down or container hung)")
	}
	clearMailpitInbox(t)

	cfg := &email.SMTPConfig{
		Host:        mailpitSMTPHost,
		Port:        mailpitSMTPPort,
		FromAddress: "noreply@rawdrive.test",
		FromName:    "RawDrive Brownfield Smoke",
		// No username/password — Mailpit's SMTP listener accepts
		// unauthenticated mail from the host.
	}
	delivery := email.NewOTPDelivery(cfg)

	// Unique code so re-runs against a non-cleared inbox are still
	// unambiguous.
	code := fmt.Sprintf("%06d", time.Now().UnixNano()%1_000_000)
	recipient := "user-" + uuid.New().String()[:8] + "@example.com"

	err := delivery.SendOTP(context.Background(), recipient, code)
	require.NoError(t, err, "SendOTP against Mailpit")

	// Give Mailpit a brief moment to index the message.
	time.Sleep(200 * time.Millisecond)

	inbox := fetchMailpitMessages(t)
	require.GreaterOrEqual(t, inbox.Total, 1, "mailpit should have received at least one message")

	var found *mailpitMessage
	for i := range inbox.Messages {
		for _, to := range inbox.Messages[i].To {
			if to.Address == recipient {
				found = &inbox.Messages[i]
				break
			}
		}
		if found != nil {
			break
		}
	}
	require.NotNil(t, found, "message addressed to %s not found in mailpit inbox", recipient)

	assert.Equal(t, "noreply@rawdrive.test", found.From.Address)
	assert.Contains(t, found.Subject, "verification code")

	body := fetchMailpitMessageBody(t, found.ID)
	assert.True(t, strings.Contains(body, code), "delivered message must contain the OTP code %q", code)
}

// TestIssue002_SMTP_InvitationSender_ReachesMailpit is the parallel
// smoke test for the team invitation path. Uses the REAL
// email.InvitationSender.
func TestIssue002_SMTP_InvitationSender_ReachesMailpit(t *testing.T) {
	if !mailpitReachable(t) {
		t.Skip("mailpit not reachable at 127.0.0.1:1025 (compose down or container hung)")
	}
	clearMailpitInbox(t)

	cfg := &email.SMTPConfig{
		Host:        mailpitSMTPHost,
		Port:        mailpitSMTPPort,
		FromAddress: "noreply@rawdrive.test",
		FromName:    "RawDrive Brownfield Smoke",
	}
	sender := email.NewInvitationSender(cfg)

	inviteToken := uuid.New().String()
	link := "https://app.rawdrive.test/invite?token=" + inviteToken
	recipient := "invitee-" + inviteToken[:8] + "@example.com"

	err := sender.SendInvitation(context.Background(), recipient, link)
	require.NoError(t, err, "SendInvitation against Mailpit")

	time.Sleep(200 * time.Millisecond)

	inbox := fetchMailpitMessages(t)
	require.GreaterOrEqual(t, inbox.Total, 1)

	var found *mailpitMessage
	for i := range inbox.Messages {
		for _, to := range inbox.Messages[i].To {
			if to.Address == recipient {
				found = &inbox.Messages[i]
				break
			}
		}
		if found != nil {
			break
		}
	}
	require.NotNil(t, found, "invitation not found in mailpit for %s", recipient)
	assert.Contains(t, found.Subject, "invited")

	body := fetchMailpitMessageBody(t, found.ID)
	assert.True(t, strings.Contains(body, link), "delivered invitation must contain the invite link")
}
