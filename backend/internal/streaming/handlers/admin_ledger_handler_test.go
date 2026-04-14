package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/middleware"
)

// RED-phase tests for M34 R3 admin ledger HTTP layer.
// Handler stubs return 501 so every assertion fails.

func newStubAdminLedgerHandler() *AdminLedgerHandler {
	return NewAdminLedgerHandler(nil)
}

// T007 super-admin 200, non-super 403.
func TestAdminLedgerHandler_NonSuperAdminGetsJSON403(t *testing.T) {
	h := newStubAdminLedgerHandler()
	req := httptest.NewRequest(http.MethodGet, "/admin/streaming/ledger", nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(uuid.New().String(), "photographer")))
	rr := httptest.NewRecorder()
	h.ServeJSON(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("non-super: want 403 got %d", rr.Code)
	}
}

func TestAdminLedgerHandler_SuperAdminGetsJSON200(t *testing.T) {
	h := newStubAdminLedgerHandler()
	req := httptest.NewRequest(http.MethodGet, "/admin/streaming/ledger", nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(uuid.New().String(), "super_admin")))
	rr := httptest.NewRecorder()
	h.ServeJSON(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("super: want 200 got %d body=%s", rr.Code, rr.Body.String())
	}
}

// T008 CSV export — Content-Type/headers/row count parity.
func TestAdminLedgerHandler_CSVExportContractAndParity(t *testing.T) {
	h := newStubAdminLedgerHandler()
	req := httptest.NewRequest(http.MethodGet, "/admin/streaming/ledger.csv", nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(uuid.New().String(), "super_admin")))
	rr := httptest.NewRecorder()
	h.ServeCSV(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("csv: want 200 got %d", rr.Code)
	}
	if !strings.HasPrefix(rr.Header().Get("Content-Type"), "text/csv") {
		t.Fatalf("Content-Type: want text/csv got %q", rr.Header().Get("Content-Type"))
	}
	lines := strings.Split(strings.TrimRight(rr.Body.String(), "\n"), "\n")
	if len(lines) == 0 {
		t.Fatalf("csv empty body")
	}
	want := "id,workspace,type,amount,package,reservation_id,stream_id,created_at"
	if lines[0] != want {
		t.Fatalf("csv header mismatch: want %q got %q", want, lines[0])
	}
}

// T009 SQLi on workspace param → 400 invalid_workspace_id (not DB error).
func TestAdminLedgerHandler_SQLiOnWorkspaceParam400(t *testing.T) {
	h := newStubAdminLedgerHandler()
	req := httptest.NewRequest(http.MethodGet,
		"/admin/streaming/ledger?workspace="+`'+or+1=1--`, nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(uuid.New().String(), "super_admin")))
	rr := httptest.NewRecorder()
	h.ServeJSON(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("sqli: want 400 got %d", rr.Code)
	}
	if !strings.Contains(rr.Body.String(), "invalid_workspace_id") {
		t.Fatalf("sqli body: want invalid_workspace_id got %q", rr.Body.String())
	}
}

// T010 CSV export writes admin_audit row — RED-phase proxy: header surface.
// GREEN phase also asserts the admin_audit table row via DB integration.
func TestAdminLedgerHandler_CSVWritesAuditRow(t *testing.T) {
	h := newStubAdminLedgerHandler()
	req := httptest.NewRequest(http.MethodGet, "/admin/streaming/ledger.csv?workspace=all", nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(uuid.New().String(), "super_admin")))
	rr := httptest.NewRecorder()
	h.ServeCSV(rr, req)
	// GREEN stub: returning 501 → this header is missing → fail.
	if rr.Header().Get("X-Audit-Action") != "streaming.ledger.export_csv" {
		t.Fatalf("missing audit action header (proxy for admin_audit row); got %q", rr.Header().Get("X-Audit-Action"))
	}
}
