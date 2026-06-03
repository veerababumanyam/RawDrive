package main

import (
	"bytes"
	"context"
	"log"
	"testing"

	"github.com/google/uuid"
)

type capturedUpsert struct {
	category    string
	key         string
	value       string
	isSecret    bool
	description string
}

type fakeSettingsWriter struct {
	upserts []capturedUpsert
}

func (w *fakeSettingsWriter) Upsert(ctx context.Context, category, key, value string, isSecret bool, description string, _ *uuid.UUID) error {
	w.upserts = append(w.upserts, capturedUpsert{
		category:    category,
		key:         key,
		value:       value,
		isSecret:    isSecret,
		description: description,
	})
	return nil
}

func envMap(values map[string]string) func(string) string {
	return func(key string) string {
		return values[key]
	}
}

func TestSyncSettingsDryRunFiltersEmailKeysWithoutWriting(t *testing.T) {
	var logs bytes.Buffer
	writer := &fakeSettingsWriter{}
	opts, err := parseSyncOptions([]string{
		"--dry-run",
		"--category", "email",
		"--keys", "smtp_host,smtp_password",
	}, &logs)
	if err != nil {
		t.Fatalf("parse options: %v", err)
	}

	summary, err := syncSettings(context.Background(), writer, envMap(map[string]string{
		"SMTP_HOST":     "smtpout.secureserver.net",
		"SMTP_PASSWORD": "do-not-log-me",
	}), opts, log.New(&logs, "", 0))
	if err != nil {
		t.Fatalf("sync settings: %v", err)
	}

	if summary.selected != 2 || summary.written != 0 || summary.skipped != 0 {
		t.Fatalf("unexpected summary: %+v", summary)
	}
	if len(writer.upserts) != 0 {
		t.Fatalf("dry-run must not write, got %d upserts", len(writer.upserts))
	}
	if bytes.Contains(logs.Bytes(), []byte("do-not-log-me")) {
		t.Fatal("dry-run logs must not contain secret env values")
	}
	if !bytes.Contains(logs.Bytes(), []byte("would upsert email.smtp_password (secret=true)")) {
		t.Fatalf("expected redacted dry-run log for smtp_password, got %q", logs.String())
	}
}

func TestSyncSettingsWritesOnlyRequestedKeys(t *testing.T) {
	writer := &fakeSettingsWriter{}
	opts, err := parseSyncOptions([]string{
		"--category", "email",
		"--keys", "smtp_password",
	}, &bytes.Buffer{})
	if err != nil {
		t.Fatalf("parse options: %v", err)
	}

	summary, err := syncSettings(context.Background(), writer, envMap(map[string]string{
		"SMTP_HOST":     "smtpout.secureserver.net",
		"SMTP_PASSWORD": "rotated-secret",
	}), opts, log.New(&bytes.Buffer{}, "", 0))
	if err != nil {
		t.Fatalf("sync settings: %v", err)
	}

	if summary.selected != 1 || summary.written != 1 || summary.skipped != 0 {
		t.Fatalf("unexpected summary: %+v", summary)
	}
	if len(writer.upserts) != 1 {
		t.Fatalf("expected one upsert, got %d", len(writer.upserts))
	}
	got := writer.upserts[0]
	if got.category != "email" || got.key != "smtp_password" || got.value != "rotated-secret" || !got.isSecret {
		t.Fatalf("unexpected upsert: %+v", got)
	}
}

func TestSyncSettingsReturnsErrorWhenFiltersMatchNothing(t *testing.T) {
	opts, err := parseSyncOptions([]string{
		"--category", "email",
		"--keys", "does_not_exist",
		"--dry-run",
	}, &bytes.Buffer{})
	if err != nil {
		t.Fatalf("parse options: %v", err)
	}

	_, err = syncSettings(context.Background(), nil, envMap(nil), opts, log.New(&bytes.Buffer{}, "", 0))
	if err == nil || err.Error() != "no settings matched --category/--keys filters" {
		t.Fatalf("expected no-match error, got %v", err)
	}
}

func TestSyncSettingsSkipsSelectedEmptyEnv(t *testing.T) {
	writer := &fakeSettingsWriter{}
	opts, err := parseSyncOptions([]string{
		"--category", "email",
		"--keys", "smtp_from_name",
	}, &bytes.Buffer{})
	if err != nil {
		t.Fatalf("parse options: %v", err)
	}

	summary, err := syncSettings(context.Background(), writer, envMap(map[string]string{}), opts, log.New(&bytes.Buffer{}, "", 0))
	if err != nil {
		t.Fatalf("sync settings: %v", err)
	}
	if summary.selected != 1 || summary.written != 0 || summary.skipped != 1 {
		t.Fatalf("unexpected summary: %+v", summary)
	}
	if len(writer.upserts) != 0 {
		t.Fatalf("empty env must not write, got %d upserts", len(writer.upserts))
	}
}

func TestSettingsFromEnvIncludesCompleteSMTPContract(t *testing.T) {
	emailSettings := map[string]envSetting{}
	for _, setting := range settingsFromEnv() {
		if setting.category == "email" {
			emailSettings[setting.key] = setting
		}
	}

	expected := map[string][]string{
		"smtp_host":      {"SMTP_HOST"},
		"smtp_port":      {"SMTP_PORT"},
		"smtp_user":      {"SMTP_USERNAME"},
		"smtp_password":  {"SMTP_PASSWORD"},
		"smtp_security":  {"SMTP_SECURITY"},
		"smtp_from":      {"SMTP_FROM"},
		"smtp_from_name": {"SMTP_FROM_NAME"},
	}
	for key, envNames := range expected {
		setting, ok := emailSettings[key]
		if !ok {
			t.Fatalf("missing email setting %s", key)
		}
		if len(setting.envNames) != len(envNames) {
			t.Fatalf("%s env names = %v, want %v", key, setting.envNames, envNames)
		}
		for i, envName := range envNames {
			if setting.envNames[i] != envName {
				t.Fatalf("%s env names = %v, want %v", key, setting.envNames, envNames)
			}
		}
	}

	if !emailSettings["smtp_password"].isSecret {
		t.Fatal("smtp_password must sync as a secret platform setting")
	}
	if emailSettings["smtp_user"].isSecret {
		t.Fatal("smtp_user is not stored as a secret; only smtp_password is credential material")
	}
}
