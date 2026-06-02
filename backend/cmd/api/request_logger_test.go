package main

import (
	"bytes"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSanitizedRequestURI_RedactsOAuthCallbackSecrets(t *testing.T) {
	req := httptest.NewRequest(
		http.MethodGet,
		"/api/v1/auth/oauth/google/callback?state=state-secret&code=code-secret&access_token=access-secret&id_token=id-secret&mfa_token=mfa-secret&refresh_token=refresh-secret&client_secret=client-secret&scope=email",
		nil,
	)

	got := sanitizedRequestURI(req)

	for _, rawSecret := range []string{
		"state-secret",
		"code-secret",
		"access-secret",
		"id-secret",
		"mfa-secret",
		"refresh-secret",
		"client-secret",
	} {
		if strings.Contains(got, rawSecret) {
			t.Fatalf("sanitized URI leaked secret %q: %s", rawSecret, got)
		}
	}
	for _, redactedKey := range []string{
		"access_token=%3Credacted%3E",
		"client_secret=%3Credacted%3E",
		"code=%3Credacted%3E",
		"id_token=%3Credacted%3E",
		"mfa_token=%3Credacted%3E",
		"refresh_token=%3Credacted%3E",
		"state=%3Credacted%3E",
	} {
		if !strings.Contains(got, redactedKey) {
			t.Fatalf("sanitized URI should keep %s placeholder, got %s", redactedKey, got)
		}
	}
	if !strings.Contains(got, "scope=email") {
		t.Fatalf("sanitized URI should preserve non-sensitive query params, got %s", got)
	}
}

func TestSafeRequestLogger_DoesNotLogOAuthCallbackSecrets(t *testing.T) {
	var buf bytes.Buffer
	previousWriter := log.Writer()
	previousFlags := log.Flags()
	log.SetOutput(&buf)
	log.SetFlags(0)
	t.Cleanup(func() {
		log.SetOutput(previousWriter)
		log.SetFlags(previousFlags)
	})

	handler := safeRequestLogger(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusFound)
	}))
	req := httptest.NewRequest(
		http.MethodGet,
		"/api/v1/auth/oauth/google/callback?state=state-secret&code=code-secret&token=generic-secret&scope=email",
		nil,
	)
	handler.ServeHTTP(httptest.NewRecorder(), req)

	line := buf.String()
	for _, rawSecret := range []string{"state-secret", "code-secret", "generic-secret"} {
		if strings.Contains(line, rawSecret) {
			t.Fatalf("request log leaked secret %q: %s", rawSecret, line)
		}
	}
	for _, redactedKey := range []string{
		"code=%3Credacted%3E",
		"state=%3Credacted%3E",
		"token=%3Credacted%3E",
	} {
		if !strings.Contains(line, redactedKey) {
			t.Fatalf("request log should keep %s placeholder: %s", redactedKey, line)
		}
	}
	if !strings.Contains(line, "scope=email") {
		t.Fatalf("request log should preserve non-sensitive query params: %s", line)
	}
}
