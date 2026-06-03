package handler

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/upload/credit"
	uploadhandlers "github.com/rawdrive/backend/internal/upload/handlers"
)

// UploadCreditGrantService is the narrow interface the admin grant handler
// needs. *credit.Service satisfies this directly. The indirection keeps
// the handler decoupled from the full credit.Service surface for testing.
type UploadCreditGrantService interface {
	GrantAdmin(ctx context.Context, in credit.GrantAdminInput) (*credit.LedgerEntry, error)
}

// AdminUploadCreditsHandler serves the admin-only upload-credit endpoints:
// the grant (POST) and the per-workspace balance read (GET).
// FR-UCRT-03 / NFR-UCRT-S1 / NFR-UCRT-O1 — RequirePlatformRole(super_admin, admin)
// is enforced at the router level (see admin_routes.go); the GrantAdmin call
// writes both the ledger entry and the audit_log row in a single tx.
//
// BalanceReader is the sibling provider used by the admin balance lookup.
// It resolves a balance for ANY workspace by id (unlike the user-facing
// /api/v1/uploads/balance endpoint which reads workspace_id from the
// caller's JWT claim). This is what powers the "credits granted" column
// on /admin/upload-credits so admins can see existing balances before
// topping up. Nil-safe: the Balance handler returns 503 when unset.
type AdminUploadCreditsHandler struct {
	Svc           UploadCreditGrantService
	BalanceReader uploadhandlers.BalanceProvider
}

type adminGrantRequest struct {
	AmountCredits  int64  `json:"amount_credits"`
	IdempotencyKey string `json:"idempotency_key"`
	Reason         string `json:"reason"`
}

type adminGrantResponse struct {
	LedgerEntryID  string `json:"ledger_entry_id"`
	WorkspaceID    string `json:"workspace_id"`
	AmountCredits  int64  `json:"amount_credits"`
	IdempotencyKey string `json:"idempotency_key"`
	CreatedAt      string `json:"created_at"`
}

// Grant handles POST /api/v1/admin/workspaces/{id}/upload-credits/grant.
//
// 401 — no JWT (handled upstream by middleware.RequireAuth)
// 403 — role check fails (handled upstream by RequirePlatformRole)
// 400 — malformed body, missing workspace id, or input validation error
// 422 — hard cap exceeded (PRD §D3, 100_000 credits per grant)
// 500 — service unavailable or DB error
// 200 — success; idempotent on (workspace_id, idempotency_key)
func (h *AdminUploadCreditsHandler) Grant(w http.ResponseWriter, r *http.Request) {
	if h.Svc == nil {
		http.Error(w, `{"error":"grant_service_unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	// Resolve target workspace from URL.
	wsIDRaw := chi.URLParam(r, "id")
	wsID, err := uuid.Parse(wsIDRaw)
	if err != nil {
		http.Error(w, `{"error_code":"INVALID_WORKSPACE_ID","error":"workspace id must be a UUID"}`, http.StatusBadRequest)
		return
	}

	// Resolve actor from JWT claims.
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthenticated"}`, http.StatusUnauthorized)
		return
	}
	actorRaw, _ := claims["sub"].(string)
	actorID, err := uuid.Parse(actorRaw)
	if err != nil {
		http.Error(w, `{"error_code":"ACTOR_ID_MISSING","error":"sub claim missing or malformed"}`, http.StatusBadRequest)
		return
	}

	// M41-SEC-001: Cap the request body. The admin grant payload is 3
	// short fields (amount_credits, idempotency_key, reason) and fits in
	// well under 4 KiB. Without this guard an authenticated admin client
	// could stream a multi-GB JSON body into the decoder and force Go to
	// allocate unbounded memory — same failure mode the webhook handlers
	// already protect against at 1 MiB. io.ReadAll is only used here to
	// surface the size breach as a clean 413 before json.Decode runs.
	const adminGrantBodyCap = 4096
	capped, readErr := io.ReadAll(http.MaxBytesReader(w, r.Body, adminGrantBodyCap))
	if readErr != nil {
		http.Error(w, `{"error":"body_too_large"}`, http.StatusRequestEntityTooLarge)
		return
	}
	var body adminGrantRequest
	if err := json.Unmarshal(capped, &body); err != nil {
		http.Error(w, `{"error":"invalid_json"}`, http.StatusBadRequest)
		return
	}

	entry, err := h.Svc.GrantAdmin(r.Context(), credit.GrantAdminInput{
		WorkspaceID:    wsID,
		AmountCredits:  body.AmountCredits,
		IdempotencyKey: body.IdempotencyKey,
		ActorID:        actorID,
		Reason:         body.Reason,
	})
	switch {
	case err == nil:
		// success
	case errors.Is(err, credit.ErrEmptyIdempotencyKey),
		errors.Is(err, credit.ErrNonPositiveAmount),
		errors.Is(err, credit.ErrEmptyReason):
		http.Error(w, `{"error_code":"INVALID_GRANT_INPUT","error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	case errors.Is(err, credit.ErrAmountExceedsLimit):
		// 422 Unprocessable Entity — the request was well-formed but violates
		// the per-grant business cap (PRD §D3). Distinct from 400 so dashboards
		// and audit tooling can filter cap-violation attempts.
		http.Error(w, `{"error_code":"GRANT_CAP_EXCEEDED","error":"amount exceeds per-grant hard cap (100000)"}`, http.StatusUnprocessableEntity)
		return
	default:
		http.Error(w, `{"error":"grant_failed"}`, http.StatusInternalServerError)
		return
	}

	resp := adminGrantResponse{
		LedgerEntryID:  entry.ID.String(),
		WorkspaceID:    entry.WorkspaceID.String(),
		AmountCredits:  entry.AmountCredits,
		IdempotencyKey: entry.IdempotencyKey,
		CreatedAt:      entry.CreatedAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

// NewAdminUploadCreditsHandler constructs the handler. Nil-safe: when svc
// is nil, the Grant handler returns 503 so test call sites without a real
// credit.Service can still exercise route registration. The balance
// reader is left unset — callers that want balance lookups populate it
// via the struct field.
func NewAdminUploadCreditsHandler(svc UploadCreditGrantService) *AdminUploadCreditsHandler {
	return &AdminUploadCreditsHandler{Svc: svc}
}

// adminBalanceResponse mirrors the public /api/v1/uploads/balance shape
// so the frontend's `UploadCreditBalance` type can be reused end-to-end.
// Workspace id is echoed so the admin UI doesn't have to thread the
// request parameter back into the response consumer.
type adminBalanceResponse struct {
	WorkspaceID         string    `json:"workspace_id"`
	AvailableCredits    int64     `json:"available_credits"`
	PlanGranted         int64     `json:"plan_granted"`
	Purchased           int64     `json:"purchased"`
	Reserved            int64     `json:"reserved"`
	Consumed            int64     `json:"consumed"`
	Refunded            int64     `json:"refunded"`
	UpdatedAt           time.Time `json:"updated_at"`
	LowBalance          bool      `json:"low_balance"`
	LowBalanceThreshold int       `json:"low_balance_threshold"`
}

// Balance handles GET /api/v1/admin/workspaces/{id}/upload-credits/balance.
//
// Unlike the user-facing balance endpoint this is NOT feature-flag gated
// — admin tooling must always be able to inspect balances, even when the
// customer-facing pill is disabled. Role check is enforced by the router's
// RequirePlatformRole middleware so only super_admin + admin reach here.
//
// 200 — success with the full balance view + echo of workspace id
// 400 — malformed workspace id (not a UUID)
// 503 — balance reader not wired (test/bootstrap safety)
// 500 — provider error; admins must see errors truthfully instead of the
//
//	user-pill fallback-to-zero, otherwise they could grant credits on
//	the assumption the workspace has none when the lookup actually
//	failed.
func (h *AdminUploadCreditsHandler) Balance(w http.ResponseWriter, r *http.Request) {
	if h.BalanceReader == nil {
		http.Error(w, `{"error":"balance_reader_unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	wsIDRaw := chi.URLParam(r, "id")
	wsID, err := uuid.Parse(wsIDRaw)
	if err != nil {
		http.Error(w, `{"error_code":"INVALID_WORKSPACE_ID","error":"workspace id must be a UUID"}`, http.StatusBadRequest)
		return
	}

	view, err := h.BalanceReader.UploadBalance(r.Context(), wsID)
	if err != nil {
		http.Error(w, `{"error":"balance_lookup_failed"}`, http.StatusInternalServerError)
		return
	}
	if view.UpdatedAt.IsZero() {
		view.UpdatedAt = time.Now().UTC()
	}

	resp := adminBalanceResponse{
		WorkspaceID:         wsID.String(),
		AvailableCredits:    view.Available,
		PlanGranted:         view.PlanGranted,
		Purchased:           view.Purchased,
		Reserved:            view.Reserved,
		Consumed:            view.Consumed,
		Refunded:            view.Refunded,
		UpdatedAt:           view.UpdatedAt,
		LowBalance:          view.Available < int64(uploadhandlers.LowBalanceThresholdCredits),
		LowBalanceThreshold: uploadhandlers.LowBalanceThresholdCredits,
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

// Compile-time assertion that the Grant handler type has not silently
// dropped its context usage — keeps linters happy and guards against a
// future refactor that would orphan the context import.
var _ context.Context = context.TODO()
