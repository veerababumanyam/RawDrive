package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/streaming/ledger"
)

// --- fake ledger.Querier for unit-testing the handler wiring ---------------

type fakeLedgerRow struct {
	id, ws                        uuid.UUID
	entryType                     string
	amount                        int64
	minutes                       int32
	purchase, reservation, stream *uuid.UUID
	idem                          string
	createdBy                     *uuid.UUID
	createdAt                     time.Time
}

type fakeLedgerIter struct {
	rows []fakeLedgerRow
	i    int
}

func (f *fakeLedgerIter) Next() bool {
	if f.i >= len(f.rows) {
		return false
	}
	f.i++
	return true
}
func (f *fakeLedgerIter) Scan(dest ...any) error {
	r := f.rows[f.i-1]
	vals := []any{r.id, r.ws, r.entryType, r.amount, r.minutes,
		r.purchase, r.reservation, r.stream, r.idem, r.createdBy, r.createdAt}
	if len(dest) != len(vals) {
		return fmt.Errorf("scan len mismatch")
	}
	for i, v := range vals {
		switch d := dest[i].(type) {
		case *uuid.UUID:
			*d = v.(uuid.UUID)
		case **uuid.UUID:
			*d = v.(*uuid.UUID)
		case *string:
			*d = v.(string)
		case *int64:
			*d = v.(int64)
		case *int32:
			*d = v.(int32)
		case *time.Time:
			*d = v.(time.Time)
		default:
			return fmt.Errorf("unsupported dest type %T", dest[i])
		}
	}
	return nil
}
func (f *fakeLedgerIter) Err() error { return nil }
func (f *fakeLedgerIter) Close()     {}

type fakeLedgerQuerier struct {
	rows    []fakeLedgerRow
	lastSQL string
	lastArg []any
	calls   int
}

func (q *fakeLedgerQuerier) QueryIter(_ context.Context, sql string, args ...any) (ledger.RowIterator, error) {
	q.lastSQL = sql
	q.lastArg = args
	q.calls++
	return &fakeLedgerIter{rows: q.rows}, nil
}

func mkLedgerRows(n int) []fakeLedgerRow {
	out := make([]fakeLedgerRow, n)
	base := time.Date(2026, 4, 14, 12, 0, 0, 0, time.UTC)
	for i := range out {
		out[i] = fakeLedgerRow{
			id:        uuid.New(),
			ws:        uuid.New(),
			entryType: "purchase",
			amount:    int64(100 + i),
			idem:      fmt.Sprintf("idem-%d", i),
			createdAt: base.Add(-time.Duration(i) * time.Second),
		}
	}
	return out
}

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
	want := "id,workspace,type,amount,minutes_delta,purchase_id,reservation_id,stream_id,idempotency_key,created_by,created_at"
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

// M35-35-7 — Filters parsed from query string reach the SQL layer.
func TestAdminLedger_ParseFilters_Applied(t *testing.T) {
	h := newStubAdminLedgerHandler()
	q := &fakeLedgerQuerier{rows: mkLedgerRows(3)}
	h.SetQuerier(q)

	ws := uuid.New().String()
	actor := uuid.New().String()
	url := "/admin/streaming/ledger?workspace=" + ws +
		"&actor_id=" + actor +
		"&entry_type=purchase,refund" +
		"&from_date=2026-04-01T00:00:00Z" +
		"&to_date=2026-04-14T00:00:00Z"
	req := httptest.NewRequest(http.MethodGet, url, nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(uuid.New().String(), "super_admin")))
	rr := httptest.NewRecorder()
	h.ServeJSON(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("want 200 got %d body=%s", rr.Code, rr.Body.String())
	}
	if q.calls != 1 {
		t.Fatalf("expected querier.Query once, got %d", q.calls)
	}
	if !strings.Contains(q.lastSQL, "workspace_id =") {
		t.Fatalf("expected workspace filter in SQL: %s", q.lastSQL)
	}
	if !strings.Contains(q.lastSQL, "created_by =") {
		t.Fatalf("expected actor filter in SQL: %s", q.lastSQL)
	}
	if !strings.Contains(q.lastSQL, "entry_type = ANY") {
		t.Fatalf("expected entry_type filter in SQL: %s", q.lastSQL)
	}
	if !strings.Contains(q.lastSQL, "created_at >=") || !strings.Contains(q.lastSQL, "created_at <") {
		t.Fatalf("expected date-range filter in SQL: %s", q.lastSQL)
	}
}

// M35-35-7 — invalid enum must 400, not reach the DB.
func TestAdminLedger_InvalidEnum_400(t *testing.T) {
	h := newStubAdminLedgerHandler()
	q := &fakeLedgerQuerier{}
	h.SetQuerier(q)

	req := httptest.NewRequest(http.MethodGet,
		"/admin/streaming/ledger?entry_type=fraud", nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(uuid.New().String(), "super_admin")))
	rr := httptest.NewRecorder()
	h.ServeJSON(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("want 400 got %d", rr.Code)
	}
	if q.calls != 0 {
		t.Fatalf("handler must not query on invalid enum")
	}
	if !strings.Contains(rr.Body.String(), "invalid_entry_type") {
		t.Fatalf("body: want invalid_entry_type got %q", rr.Body.String())
	}
}

// M35-35-7 — keyset pagination: first page returns next_cursor; second page
// uses it and issues a query with the keyset WHERE clause.
func TestAdminLedger_KeysetPagination_StableOrder(t *testing.T) {
	h := newStubAdminLedgerHandler()
	q1 := &fakeLedgerQuerier{rows: mkLedgerRows(5)}
	h.SetQuerier(q1)

	req := httptest.NewRequest(http.MethodGet, "/admin/streaming/ledger?limit=5", nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(uuid.New().String(), "super_admin")))
	rr := httptest.NewRecorder()
	h.ServeJSON(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("page1 want 200 got %d", rr.Code)
	}
	var page1 struct {
		Rows       []map[string]any `json:"rows"`
		NextCursor string           `json:"next_cursor"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &page1); err != nil {
		t.Fatalf("decode: %v body=%s", err, rr.Body.String())
	}
	if len(page1.Rows) != 5 {
		t.Fatalf("want 5 rows got %d", len(page1.Rows))
	}
	if page1.NextCursor == "" {
		t.Fatalf("expected next_cursor when page full")
	}

	q2 := &fakeLedgerQuerier{rows: mkLedgerRows(2)}
	h.SetQuerier(q2)
	req2 := httptest.NewRequest(http.MethodGet,
		"/admin/streaming/ledger?limit=5&cursor="+page1.NextCursor, nil)
	req2 = req2.WithContext(middleware.WithJWTClaims(req2.Context(), claimsFor(uuid.New().String(), "super_admin")))
	rr2 := httptest.NewRecorder()
	h.ServeJSON(rr2, req2)
	if rr2.Code != http.StatusOK {
		t.Fatalf("page2 want 200 got %d body=%s", rr2.Code, rr2.Body.String())
	}
	if !strings.Contains(q2.lastSQL, "(created_at, id) <") {
		t.Fatalf("expected keyset WHERE on page2: %s", q2.lastSQL)
	}
	var page2 struct {
		Rows       []map[string]any `json:"rows"`
		NextCursor string           `json:"next_cursor"`
	}
	_ = json.Unmarshal(rr2.Body.Bytes(), &page2)
	if page2.NextCursor != "" {
		t.Fatalf("page2 (2<5 rows) must not set next_cursor, got %q", page2.NextCursor)
	}
}

// M35-35-7 — CSV honours the hard cap and surfaces X-Truncated.
func TestAdminLedger_StreamCSV_HonorsCap100k(t *testing.T) {
	h := newStubAdminLedgerHandler()
	q := &fakeLedgerQuerier{rows: mkLedgerRows(30)}
	h.SetQuerier(q)
	h.SetCSVOptions(ledger.StreamCSVOptions{HardCap: 20, FlushEvery: 5})

	req := httptest.NewRequest(http.MethodGet, "/admin/streaming/ledger.csv", nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(uuid.New().String(), "super_admin")))
	rr := httptest.NewRecorder()
	h.ServeCSV(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("want 200 got %d", rr.Code)
	}
	if rr.Header().Get("X-Truncated") != "true" {
		t.Fatalf("X-Truncated: want true got %q", rr.Header().Get("X-Truncated"))
	}
	lines := strings.Split(strings.TrimRight(rr.Body.String(), "\n"), "\n")
	if len(lines) != 21 {
		t.Fatalf("expected 21 lines (header+20) got %d", len(lines))
	}
}

// M35-35-7 — flusher fires every 500 rows.
func TestAdminLedger_StreamCSV_FlushEvery500(t *testing.T) {
	h := newStubAdminLedgerHandler()
	q := &fakeLedgerQuerier{rows: mkLedgerRows(1500)}
	h.SetQuerier(q)
	cf := &countingHandlerFlusher{}
	h.SetCSVOptions(ledger.StreamCSVOptions{HardCap: 10_000, FlushEvery: 500, Flusher: cf})

	req := httptest.NewRequest(http.MethodGet, "/admin/streaming/ledger.csv", nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(uuid.New().String(), "super_admin")))
	rr := httptest.NewRecorder()
	h.ServeCSV(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("want 200 got %d", rr.Code)
	}
	if cf.n < 3 {
		t.Fatalf("expected >=3 flushes for 1500 rows @ FlushEvery=500, got %d", cf.n)
	}
}

type countingHandlerFlusher struct{ n int }

func (c *countingHandlerFlusher) Flush() { c.n++ }

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
