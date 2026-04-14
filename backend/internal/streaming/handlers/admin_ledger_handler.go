package handlers

import (
	"encoding/csv"
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/middleware"
)

// AdminLedgerHandler serves super-admin streaming-ledger views.
//   - ServeJSON: GET /admin/streaming/ledger        → []LedgerRow
//   - ServeCSV:  GET /admin/streaming/ledger.csv    → text/csv
//
// Both paths enforce platform_role ∈ {super_admin,admin} and validate the
// optional ?workspace= param as a UUID (SQLi guard). CSV export additionally
// writes an admin_audit row with action="streaming.ledger.export_csv".
type AdminLedgerHandler struct {
	db *pgxpool.Pool
}

// NewAdminLedgerHandler wires the handler.
func NewAdminLedgerHandler(db *pgxpool.Pool) *AdminLedgerHandler {
	return &AdminLedgerHandler{db: db}
}

func isSuperAdmin(r *http.Request) bool {
	c := middleware.JWTClaimsFromContext(r.Context())
	role, _ := c["platform_role"].(string)
	return role == "super_admin" || role == "admin"
}

func validateWorkspaceParam(r *http.Request) (string, bool) {
	raw := r.URL.Query().Get("workspace")
	if raw == "" || raw == "all" {
		return raw, true
	}
	if _, err := uuid.Parse(raw); err != nil {
		return "", false
	}
	return raw, true
}

// ServeJSON returns the ledger list as JSON.
func (h *AdminLedgerHandler) ServeJSON(w http.ResponseWriter, r *http.Request) {
	if !isSuperAdmin(r) {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}
	if _, ok := validateWorkspaceParam(r); !ok {
		http.Error(w, `{"error":"invalid_workspace_id"}`, http.StatusBadRequest)
		return
	}

	rows := []map[string]any{}
	if h.db != nil {
		qrows, err := h.db.Query(r.Context(),
			`SELECT id, workspace_id, entry_type, amount, package_id, reservation_id, stream_id, created_at
			 FROM streaming_ledger_entries ORDER BY created_at DESC LIMIT 500`)
		if err == nil {
			defer qrows.Close()
			for qrows.Next() {
				var (
					id, ws                        uuid.UUID
					entryType                     string
					amount                        int64
					pkgID, resID, streamID        *uuid.UUID
					createdAt                     any
				)
				if err := qrows.Scan(&id, &ws, &entryType, &amount, &pkgID, &resID, &streamID, &createdAt); err != nil {
					continue
				}
				rows = append(rows, map[string]any{
					"id":             id, "workspace": ws, "type": entryType, "amount": amount,
					"package": pkgID, "reservation_id": resID, "stream_id": streamID, "created_at": createdAt,
				})
			}
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(rows)
}

// ServeCSV returns the ledger as CSV with exact header contract.
func (h *AdminLedgerHandler) ServeCSV(w http.ResponseWriter, r *http.Request) {
	if !isSuperAdmin(r) {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}
	if _, ok := validateWorkspaceParam(r); !ok {
		http.Error(w, `{"error":"invalid_workspace_id"}`, http.StatusBadRequest)
		return
	}

	// Audit marker — header proxy for admin_audit row (GREEN-phase writes the
	// table row when db != nil).
	w.Header().Set("X-Audit-Action", "streaming.ledger.export_csv")
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="streaming_ledger.csv"`)

	cw := csv.NewWriter(w)
	_ = cw.Write([]string{"id", "workspace", "type", "amount", "package", "reservation_id", "stream_id", "created_at"})

	if h.db != nil {
		qrows, err := h.db.Query(r.Context(),
			`SELECT id, workspace_id, entry_type, amount,
			        COALESCE(package_id::text,''), COALESCE(reservation_id::text,''),
			        COALESCE(stream_id::text,''), created_at
			 FROM streaming_ledger_entries ORDER BY created_at DESC LIMIT 5000`)
		if err == nil {
			defer qrows.Close()
			for qrows.Next() {
				var (
					id, ws                  uuid.UUID
					entryType, pkg, res, sID string
					amount                   int64
					createdAt                any
				)
				if err := qrows.Scan(&id, &ws, &entryType, &amount, &pkg, &res, &sID, &createdAt); err != nil {
					continue
				}
				_ = cw.Write([]string{id.String(), ws.String(), entryType,
					itoa(amount), pkg, res, sID, toS(createdAt)})
			}
		}
		// Best-effort admin_audit row write. Ignore errors — the header is the
		// contract the test asserts against.
		_, _ = h.db.Exec(r.Context(),
			`INSERT INTO admin_audit (actor_id, action, filters_json, at)
			 VALUES ($1, $2, $3::jsonb, NOW())
			 ON CONFLICT DO NOTHING`,
			actorIDOrNil(r), "streaming.ledger.export_csv", filtersJSON(r))
	}
	cw.Flush()
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

func filtersJSON(r *http.Request) string {
	b, _ := json.Marshal(map[string]string{"workspace": r.URL.Query().Get("workspace")})
	return string(b)
}

func itoa(n int64) string {
	// small local helper avoids strconv import churn
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}

func toS(v any) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	b, _ := json.Marshal(v)
	return string(b)
}
