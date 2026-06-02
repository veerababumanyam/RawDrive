package email

// Tests for the timeout-bounded SMTP send path (sendMailWithTimeout), added
// after diagnosing "OTP emails are not sent immediately": net/smtp.SendMail has
// no dial timeout, so a slow/black-holed relay — or the Docker Desktop port
// proxy's cold-connect to the published Mailpit port — blocked the OTP request
// for the full OS connect timeout. These pin (a) that a hung connect fast-fails
// and (b) that the Mailpit-style plaintext path still delivers through the new
// code.

import (
	"bufio"
	"net"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeSMTPServer accepts exactly one connection and speaks the minimal SMTP
// dialogue a net/smtp client expects for a no-auth, no-STARTTLS relay (i.e.
// Mailpit on 1025). It captures the DATA payload so the test can assert the
// message body made it through. Returns the listen address, a pointer the
// captured body is written to, and a channel closed when the dialogue ends.
func fakeSMTPServer(t *testing.T) (addr string, captured *string, done chan struct{}) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	addr = ln.Addr().String()
	captured = new(string)
	done = make(chan struct{})

	go func() {
		defer close(done)
		conn, err := ln.Accept()
		_ = ln.Close() // one-shot listener
		if err != nil {
			return
		}
		defer conn.Close()

		br := bufio.NewReader(conn)
		bw := bufio.NewWriter(conn)
		writeLine := func(s string) {
			_, _ = bw.WriteString(s + "\r\n")
			_ = bw.Flush()
		}

		writeLine("220 fake ESMTP")
		inData := false
		var data strings.Builder
		for {
			line, err := br.ReadString('\n')
			if err != nil {
				return
			}
			if inData {
				if line == ".\r\n" || line == ".\n" {
					inData = false
					*captured = data.String()
					writeLine("250 2.0.0 Ok: queued")
					continue
				}
				data.WriteString(line)
				continue
			}
			up := strings.ToUpper(strings.TrimRight(line, "\r\n"))
			switch {
			case strings.HasPrefix(up, "EHLO"), strings.HasPrefix(up, "HELO"):
				// Advertise no extensions => no STARTTLS, no AUTH, matching Mailpit.
				writeLine("250 fake greets you")
			case strings.HasPrefix(up, "MAIL FROM"):
				writeLine("250 2.1.0 Ok")
			case strings.HasPrefix(up, "RCPT TO"):
				writeLine("250 2.1.5 Ok")
			case strings.HasPrefix(up, "DATA"):
				writeLine("354 End data with <CR><LF>.<CR><LF>")
				inData = true
			case strings.HasPrefix(up, "QUIT"):
				writeLine("221 2.0.0 Bye")
				return
			default:
				writeLine("250 Ok")
			}
		}
	}()
	return addr, captured, done
}

// TestSendSMTP_PlaintextHappyPath_DeliversThroughTimeoutPath proves the
// timeout-bounded path is a behavior-preserving replacement for
// net/smtp.SendMail on the Mailpit-style (no auth, no STARTTLS) transport.
func TestSendSMTP_PlaintextHappyPath_DeliversThroughTimeoutPath(t *testing.T) {
	addr, captured, done := fakeSMTPServer(t)
	host, portStr, err := net.SplitHostPort(addr)
	require.NoError(t, err)
	port, err := strconv.Atoi(portStr)
	require.NoError(t, err)

	cfg := &SMTPConfig{
		Host:        host,
		Port:        port,
		Security:    "auto", // port != 465 => plaintext path => sendMailWithTimeout
		FromAddress: "noreply@rawdrive.in",
	}

	sendErr := sendSMTP(cfg, []string{"user@example.com"}, []byte("Subject: hi\r\n\r\nhello-otp-body\r\n"))
	require.NoError(t, sendErr)

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("fake SMTP server did not complete the dialogue")
	}
	assert.Contains(t, *captured, "hello-otp-body")
}

// TestSendSMTP_DialTimeout_FastFailsInsteadOfHanging pins the core fix: a
// connect that never completes must fail within the dial timeout, not hang the
// caller. 192.0.2.1 is TEST-NET-1 (RFC 5737) — reserved and unroutable.
func TestSendSMTP_DialTimeout_FastFailsInsteadOfHanging(t *testing.T) {
	orig := smtpDialTimeout
	smtpDialTimeout = 200 * time.Millisecond
	t.Cleanup(func() { smtpDialTimeout = orig })

	cfg := &SMTPConfig{
		Host:        "192.0.2.1",
		Port:        2525,
		Security:    "auto",
		FromAddress: "x@example.com",
	}

	start := time.Now()
	err := sendSMTP(cfg, []string{"to@example.com"}, []byte("hi"))
	elapsed := time.Since(start)

	require.Error(t, err, "expected a dial error against an unroutable host")
	assert.Less(t, elapsed, 2*time.Second,
		"dial timeout (200ms) was not enforced; the send blocked for %v", elapsed)
}
