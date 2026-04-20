// Package handlers exposes HTTP handlers for the M40 Upload Credit Meter.
//
// The balance endpoint is a thin read-side projection over the
// upload/credit package. It mirrors backend/internal/streaming/handlers
// so the frontend can reuse the same pill/hook pattern.
package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/middleware"
)

// LowBalanceThresholdCredits is the UI warning cutoff. When available <
// this value the response's low_balance flag is true so the pill can
// render a warning style. Echoed in the response so the client is not
// hardcoded to the constant.
const LowBalanceThresholdCredits = 100

// UploadBalanceView is the provider-side projection of an upload credit
// balance. Decouples the handler from the upload/credit package so tests
// can stub it directly.
type UploadBalanceView struct {
	Available   int64     `json:"available"`
	PlanGranted int64     `json:"plan_granted"`
	Purchased   int64     `json:"purchased"`
	Reserved    int64     `json:"reserved"`
	Consumed    int64     `json:"consumed"`
	Refunded    int64     `json:"refunded"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// BalanceProvider is the narrow interface upload-handlers need.
// upload/credit.Service satisfies this via a small adapter in main.go.
type BalanceProvider interface {
	UploadBalance(ctx context.Context, workspaceID uuid.UUID) (UploadBalanceView, error)
}

// UploadBalanceHandler serves GET /api/v1/uploads/balance.
type UploadBalanceHandler struct {
	Balance     BalanceProvider
	FeatureFlag func(name string) bool
}

type uploadBalanceResponse struct {
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

// GetBalance returns the caller workspace's upload credit balance.
//
// Feature-gated: when the flag streaming.upload_credit_pill_v1 is off,
// returns 404 so the frontend hook treats the endpoint as disabled and
// stops polling (mirrors PR #32 / streaming credit pill pattern).
//
// On provider error the endpoint degrades to a zero-balance 200 response
// rather than 500 — a transient DB failure should not break the pill.
func (h *UploadBalanceHandler) GetBalance(w http.ResponseWriter, r *http.Request) {
	if h.FeatureFlag != nil && !h.FeatureFlag("streaming.upload_credit_pill_v1") {
		http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
		return
	}

	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthenticated"}`, http.StatusUnauthorized)
		return
	}
	wsRaw, _ := claims["workspace_id"].(string)
	wsID, err := uuid.Parse(wsRaw)
	if err != nil {
		// M40-API-001: A missing/malformed workspace_id claim is an auth
		// integration bug, not a transient infra failure. The provider-
		// error zero-fallback below is intentionally preserved for DB
		// hiccups; here we must surface the real problem so the client
		// hook doesn't render "you're broke" when the true cause is a
		// mis-issued JWT or TenantContext middleware skipped upstream.
		if _, ok := claims["sub"].(string); !ok {
			http.Error(w, `{"error":"unauthenticated"}`, http.StatusUnauthorized)
			return
		}
		http.Error(w, `{"error_code":"WORKSPACE_ID_MISSING","error":"workspace_id claim missing or malformed"}`, http.StatusBadRequest)
		return
	}

	view := UploadBalanceView{UpdatedAt: time.Now().UTC()}
	if h.Balance != nil {
		v, ferr := h.Balance.UploadBalance(r.Context(), wsID)
		if ferr == nil {
			view = v
			if view.UpdatedAt.IsZero() {
				view.UpdatedAt = time.Now().UTC()
			}
		}
		// On error: fall through with the zero view — the response body
		// still renders correctly and the pill stays live.
	}

	resp := uploadBalanceResponse{
		AvailableCredits:    view.Available,
		PlanGranted:         view.PlanGranted,
		Purchased:           view.Purchased,
		Reserved:            view.Reserved,
		Consumed:            view.Consumed,
		Refunded:            view.Refunded,
		UpdatedAt:           view.UpdatedAt,
		LowBalance:          view.Available < int64(LowBalanceThresholdCredits),
		LowBalanceThreshold: LowBalanceThresholdCredits,
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

// RegisterRoutes wires the balance endpoint onto an existing chi router.
// main.go calls this after constructing the handler.
func (h *UploadBalanceHandler) RegisterRoutes(mux interface {
	Get(string, http.HandlerFunc)
}) {
	mux.Get("/api/v1/uploads/balance", h.GetBalance)
}
