package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/streaming/ledger"
)

// AdminLedgerHandler serves super-admin streaming-ledger views.
//   - ServeJSON: GET /admin/streaming/ledger        → {rows,next_cursor?}
//   - ServeCSV:  GET /admin/streaming/ledger.csv    → text/csv (streamed)
//
// M35/35-7: filter parsing, query, and CSV streaming are delegated to
// `internal/streaming/ledger` so business rules (keyset pagination, 100k cap,
// flush cadence, whitelisted entry types) live in one unit-tested place.
//
// The handler still enforces: platform_role ∈ {super_admin,admin}, workspace
// UUID validation via the ledger filter parser (SQLi guard), and emits the
// `X-Audit-Action: streaming.ledger.export_csv` header + best-effort
// admin_audit row per export.
type AdminLedgerHandler struct {
	db      *pgxpool.Pool
	querier ledger.Querier // test injection; nil ⇒ built from db
	csvOpts ledger.StreamCSVOptions
}

// NewAdminLedgerHandler wires the handler. Signature preserved for main.go.
func NewAdminLedgerHandler(db *pgxpool.Pool) *AdminLedgerHandler {
	return &AdminLedgerHandler{db: db}
}

// SetQuerier overrides the ledger querier — used by tests to inject a fake
// without standing up a real pgx pool. Unexported-ish: handler-package only.
func (h *AdminLedgerHandler) SetQuerier(q ledger.Querier) { h.querier = q }

// SetCSVOptions lets tests override the CSV flush/cap defaults.
func (h *AdminLedgerHandler) SetCSVOptions(o ledger.StreamCSVOptions) { h.csvOpts = o }

func isSuperAdmin(r *http.Request) bool {
	c := middleware.JWTClaimsFromContext(r.Context())
	role, _ := c["platform_role"].(string)
	return role == "super_admin" || role == "admin"
}

// resolveQuerier returns the injected querier, or a pgxpool adapter when the
// handler was constructed with a real db, or nil when neither is available
// (unit tests that drive only the guard paths).
func (h *AdminLedgerHandler) resolveQuerier() ledger.Querier {
	if h.querier != nil {
		return h.querier
	}
	if h.db != nil {
		return &pgxpoolQuerier{pool: h.db}
	}
	return nil
}

// mapFilterErr turns ledger.Parse* errors into the stable 400 body codes the
// frontend + E2E tests assert on.
func mapFilterErr(err error) (code int, body string) {
	switch {
	case errors.Is(err, ledger.ErrInvalidWorkspace):
		return http.StatusBadRequest, `{"error":"invalid_workspace_id"}`
	case errors.Is(err, ledger.ErrInvalidActor):
		return http.StatusBadRequest, `{"error":"invalid_actor_id"}`
	case errors.Is(err, ledger.ErrInvalidEntryType):
		return http.StatusBadRequest, `{"error":"invalid_entry_type"}`
	case errors.Is(err, ledger.ErrInvalidDateRange):
		return http.StatusBadRequest, `{"error":"invalid_date_range"}`
	case errors.Is(err, ledger.ErrInvalidCursor):
		return http.StatusBadRequest, `{"error":"invalid_cursor"}`
	case errors.Is(err, ledger.ErrInvalidLimit):
		return http.StatusBadRequest, `{"error":"invalid_limit"}`
	case errors.Is(err, ledger.ErrSearchTooLong):
		return http.StatusBadRequest, `{"error":"search_too_long"}`
	default:
		return http.StatusBadRequest, `{"error":"invalid_filter"}`
	}
}

// ServeJSON returns the ledger list as JSON with {rows, next_cursor?}.
func (h *AdminLedgerHandler) ServeJSON(w http.ResponseWriter, r *http.Request) {
	if !isSuperAdmin(r) {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}
	f, err := ledger.ParseFromRequest(r)
	if err != nil {
		code, body := mapFilterErr(err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(code)
		_, _ = w.Write([]byte(body))
		return
	}

	rows := []map[string]any{}
	var next *ledger.Cursor
	if q := h.resolveQuerier(); q != nil {
		got, nxt, qerr := ledger.Query(r.Context(), q, f)
		if qerr != nil {
			http.Error(w, `{"error":"query_failed"}`, http.StatusInternalServerError)
			return
		}
		for _, row := range got {
			rows = append(rows, rowToJSON(row))
		}
		next = nxt
	}

	out := map[string]any{"rows": rows}
	if next != nil {
		out["next_cursor"] = ledger.EncodeCursor(*next)
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

// ServeCSV streams the ledger as CSV with the exact header contract from
// ledger.CSVHeader. Hard-caps at 100k rows, flushes every 500 rows.
func (h *AdminLedgerHandler) ServeCSV(w http.ResponseWriter, r *http.Request) {
	if !isSuperAdmin(r) {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}
	f, err := ledger.ParseFromRequest(r)
	if err != nil {
		code, body := mapFilterErr(err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(code)
		_, _ = w.Write([]byte(body))
		return
	}

	// Audit marker header — always emitted, even when db is nil. Contract for
	// M33 test TestAdminLedgerHandler_CSVWritesAuditRow.
	w.Header().Set("X-Audit-Action", "streaming.ledger.export_csv")
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="streaming_ledger.csv"`)

	q := h.resolveQuerier()
	if q == nil {
		// Emit header-only CSV so the content contract (header line) still holds.
		_, _ = w.Write([]byte(csvHeaderLine() + "\n"))
		return
	}

	// Default the flusher to the http ResponseWriter's Flusher so clients see
	// rows without waiting for the whole export — unless the test injected one.
	opts := h.csvOpts
	if opts.Flusher == nil {
		if rf, ok := w.(http.Flusher); ok {
			opts.Flusher = rf
		}
	}

	res, streamErr := ledger.StreamCSV(r.Context(), q, f, w, opts)
	if res.Truncated {
		w.Header().Set("X-Truncated", "true")
	}

	// Best-effort admin_audit row write — never fail the response on audit error.
	h.writeExportAudit(r.Context(), r, f, res.Rows)

	if streamErr != nil {
		// ctx canceled or iterator error; headers already sent — nothing more to do.
		return
	}
}

// writeExportAudit persists the audit row. Silently tolerates missing db /
// missing table — the X-Audit-Action header remains the load-bearing contract.
func (h *AdminLedgerHandler) writeExportAudit(ctx context.Context, r *http.Request, f ledger.Filter, rowCount int) {
	if h.db == nil {
		return
	}
	filtersJSON, _ := json.Marshal(filterToAudit(f, r))
	_, _ = h.db.Exec(ctx,
		`INSERT INTO admin_audit (actor_id, action, filters_json, row_count, at)
		 VALUES ($1, $2, $3::jsonb, $4, NOW())
		 ON CONFLICT DO NOTHING`,
		actorIDOrNil(r), "streaming.ledger.export_csv", string(filtersJSON), rowCount)
}

func filterToAudit(f ledger.Filter, r *http.Request) map[string]any {
	m := map[string]any{}
	if f.WorkspaceID != nil {
		m["workspace"] = f.WorkspaceID.String()
	}
	if f.ActorID != nil {
		m["actor_id"] = f.ActorID.String()
	}
	if len(f.EntryTypes) > 0 {
		m["entry_types"] = f.EntryTypes
	}
	if f.From != nil {
		m["from"] = f.From.UTC()
	}
	if f.To != nil {
		m["to"] = f.To.UTC()
	}
	if f.Search != "" {
		m["search"] = f.Search
	}
	if len(m) == 0 {
		// Preserve M33 shape when nothing filtered so legacy audit readers
		// still see a workspace key.
		m["workspace"] = r.URL.Query().Get("workspace")
	}
	return m
}

func actorIDOrNil(r *http.Request) any {
	c := middleware.JWTClaimsFromContext(r.Context())
	if s, ok := c["sub"].(string); ok {
		if id, err := uuid.Parse(s); err == nil {
			return id
		}
	}
	return nil
}

func rowToJSON(r ledger.Row) map[string]any {
	return map[string]any{
		"id":              r.ID,
		"workspace":       r.WorkspaceID,
		"type":            r.EntryType,
		"amount":          r.AmountPaise,
		"minutes_delta":   r.MinutesDelta,
		"purchase_id":     r.PurchaseID,
		"reservation_id":  r.ReservationID,
		"stream_id":       r.StreamID,
		"idempotency_key": r.IdempotencyKey,
		"created_by":      r.CreatedBy,
		"created_at":      r.CreatedAt,
	}
}

func csvHeaderLine() string {
	out := ""
	for i, h := range ledger.CSVHeader {
		if i > 0 {
			out += ","
		}
		out += h
	}
	return out
}
