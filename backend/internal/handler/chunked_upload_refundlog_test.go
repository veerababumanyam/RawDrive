package handler

import (
	"bytes"
	"errors"
	"log"
	"strings"
	"testing"
)

// F-027 — credit refund failures on the upload error paths must be logged at
// ERROR level instead of being silently swallowed with `_ =`. The three
// finalize-failure refund call sites (stream-hash-fail, scan-manifest-invalid,
// infra-failure) route through logRefundFailure; if the refund itself fails
// the user stays billed for a failed upload, so the failure must be observable
// to drive a reconciliation / retry job (the refund reasons carry idempotency
// keys for exactly that purpose).
//
// logRefundFailure is unexported, so this test lives in package handler.

// captureLog redirects the standard logger to a buffer for the duration of fn
// and returns everything written.
func captureLog(fn func()) string {
	var buf bytes.Buffer
	prevOut := log.Writer()
	prevFlags := log.Flags()
	log.SetOutput(&buf)
	log.SetFlags(0)
	defer func() {
		log.SetOutput(prevOut)
		log.SetFlags(prevFlags)
	}()
	fn()
	return buf.String()
}

func TestF027_RefundFailureIsLogged(t *testing.T) {
	const uploadID = "up-abc-123"
	out := captureLog(func() {
		logRefundFailure(uploadID, "stream-hash-fail", errors.New("ledger write timeout"))
	})

	if out == "" {
		t.Fatalf("expected a log line when a refund fails, got none")
	}
	for _, want := range []string{uploadID, "stream-hash-fail", "ledger write timeout", "refund"} {
		if !strings.Contains(out, want) {
			t.Fatalf("refund-failure log must contain %q for observability; got: %q", want, out)
		}
	}
}

func TestF027_RefundSuccessIsSilent(t *testing.T) {
	out := captureLog(func() {
		logRefundFailure("up-xyz", "infra-failure", nil)
	})
	if out != "" {
		t.Fatalf("a successful refund (nil err) must not emit a log line; got: %q", out)
	}
}
