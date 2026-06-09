package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/rawdrive/backend/internal/repository"
)

// M39 E8-S1 GREEN: audit-log actor filter + RFC3339 time parsing.

func TestAuditLogFilter_HasActorTermField(t *testing.T) {
	f := repository.AuditLogFilter{ActorTerm: "rao"}
	if f.ActorTerm != "rao" {
		t.Fatalf("expected ActorTerm round-trip, got %q", f.ActorTerm)
	}
}

func TestParseAuditLogTime_EmptyReturnsNil(t *testing.T) {
	tt, err := parseAuditLogTime("")
	if err != nil {
		t.Fatalf("empty string must not error, got %v", err)
	}
	if tt != nil {
		t.Fatalf("empty string must return nil *time.Time, got %v", tt)
	}
}

func TestParseAuditLogTime_RFC3339(t *testing.T) {
	tt, err := parseAuditLogTime("2026-04-01T12:34:56Z")
	if err != nil {
		t.Fatalf("RFC3339 must parse, got %v", err)
	}
	if tt == nil || tt.Year() != 2026 || tt.Month() != 4 || tt.Day() != 1 {
		t.Fatalf("unexpected parsed time: %v", tt)
	}
}

func TestParseAuditLogTime_DateOnly_BackwardCompat(t *testing.T) {
	tt, err := parseAuditLogTime("2026-04-01")
	if err != nil {
		t.Fatalf("YYYY-MM-DD must parse (backward compat), got %v", err)
	}
	if tt == nil {
		t.Fatal("YYYY-MM-DD must return non-nil time")
	}
}

func TestParseAuditLogTime_Garbage_Returns400(t *testing.T) {
	tt, err := parseAuditLogTime("notadate")
	if err == nil {
		t.Fatal("garbage input must return error so handler can respond 400 (FR-F05, no silent drop)")
	}
	if tt != nil {
		t.Fatalf("garbage input must return nil time, got %v", tt)
	}
}

func TestAuditLogHandler_DateFromGarbage_Returns400(t *testing.T) {
	h := NewAdminAuditLogsHandler(nil) // nil svc is fine; 400 fires before svc is called
	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/audit-logs?date_from=notadate", nil)
	rec := httptest.NewRecorder()
	h.List(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on garbage date_from, got %d (body=%q)", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "invalid time value") {
		t.Fatalf("error body must explain the issue, got %q", rec.Body.String())
	}
}

func TestAuditLogHandler_DateToGarbage_Returns400(t *testing.T) {
	h := NewAdminAuditLogsHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/audit-logs?date_to=oops", nil)
	rec := httptest.NewRecorder()
	h.List(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on garbage date_to, got %d", rec.Code)
	}
}
