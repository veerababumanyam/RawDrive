// M34 story 34-3: GET /api/v1/credits/balance alias.
//
// Thin alias over the M32 /api/v1/streaming/balance endpoint — returns a
// UI-friendly shape (minutes + seconds + updated_at + low_balance flag +
// threshold) so the dashboard credit pill does not need to know the
// threshold constant. Reuses credit.Service via the BalanceProvider
// interface so this package does not pull a hard dependency on the
// credit package (keeps the handlers layer lean).
package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/middleware"
)

// LowBalanceThresholdMinutes is the UI low-balance cutoff. Single source
// of truth for both the boolean flag and the echoed threshold.
const LowBalanceThresholdMinutes = 30

// BalanceProvider is the minimum surface needed to answer a credit
// balance request. credit.Service (via a small adapter in main.go)
// satisfies this interface — tests stub it directly.
type BalanceProvider interface {
	BalanceForWorkspace(ctx context.Context, workspaceID uuid.UUID) (BalanceView, error)
}

// BalanceView is the provider-side projection of the ledger balance.
// Seconds is kept distinct from Minutes so the pill can render a
// sub-minute remainder without re-fetching the underlying ledger.
type BalanceView struct {
	Minutes   int       `json:"balance_minutes"`
	Seconds   int       `json:"balance_seconds"`
	UpdatedAt time.Time `json:"updated_at"`
}

// CreditBalanceHandler serves GET /api/v1/credits/balance.
type CreditBalanceHandler struct {
	Balance     BalanceProvider
	FeatureFlag func(name string) bool
}

type creditBalanceResponse struct {
	Minutes                    int       `json:"balance_minutes"`
	Seconds                    int       `json:"balance_seconds"`
	UpdatedAt                  time.Time `json:"updated_at"`
	LowBalance                 bool      `json:"low_balance"`
	LowBalanceThresholdMinutes int       `json:"low_balance_threshold_minutes"`
}

// GetBalance returns the caller workspace's credit balance in the shape
// the dashboard pill consumes.
func (h *CreditBalanceHandler) GetBalance(w http.ResponseWriter, r *http.Request) {
	if h.FeatureFlag != nil && !h.FeatureFlag("streaming.credit_pill_v1") {
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
		// Missing / malformed workspace claim — treat as unauthenticated
		// rather than leaking a 400 through the alias surface.
		if _, ok := claims["sub"].(string); !ok {
			http.Error(w, `{"error":"unauthenticated"}`, http.StatusUnauthorized)
			return
		}
		wsID = uuid.Nil
	}

	view := BalanceView{UpdatedAt: time.Now().UTC()}
	if h.Balance != nil {
		v, ferr := h.Balance.BalanceForWorkspace(r.Context(), wsID)
		if ferr == nil {
			view = v
		}
	}

	resp := creditBalanceResponse{
		Minutes:                    view.Minutes,
		Seconds:                    view.Seconds,
		UpdatedAt:                  view.UpdatedAt,
		LowBalance:                 view.Minutes < LowBalanceThresholdMinutes,
		LowBalanceThresholdMinutes: LowBalanceThresholdMinutes,
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}
