package handler

import (
	"encoding/json"
	"math"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/middleware"
)

// SubscriptionHandler serves workspace subscription / plan details.
// Wired at GET /api/v1/workspace/subscription.
type SubscriptionHandler struct {
	DB *pgxpool.Pool
}

type subscriptionResponse struct {
	PlanTier  string  `json:"plan_tier"`
	Status    string  `json:"status"`
	StartedAt *string `json:"started_at,omitempty"`
	ExpiresAt *string `json:"expires_at,omitempty"`
	DaysLeft  *int    `json:"days_left,omitempty"`
}

func (h *SubscriptionHandler) Get(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.WorkspaceIDFromContext(r.Context())
	if wsID == "" || wsID == "pending-onboarding" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "workspace required"})
		return
	}

	var planTier string
	var status string
	var startedAt, expiresAt *time.Time

	err := h.DB.QueryRow(r.Context(),
		`SELECT COALESCE(w.plan_tier, 'free'),
		        COALESCE(s.status, 'active'),
		        s.started_at,
		        s.expires_at
		 FROM workspaces w
		 LEFT JOIN subscriptions s ON s.workspace_id = w.id AND s.status = 'active'
		 WHERE w.id = $1
		 ORDER BY s.started_at DESC NULLS LAST
		 LIMIT 1`,
		wsID,
	).Scan(&planTier, &status, &startedAt, &expiresAt)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not load subscription"})
		return
	}

	resp := subscriptionResponse{
		PlanTier: planTier,
		Status:   status,
	}
	if startedAt != nil {
		s := startedAt.UTC().Format(time.RFC3339)
		resp.StartedAt = &s
	}
	if expiresAt != nil {
		e := expiresAt.UTC().Format(time.RFC3339)
		resp.ExpiresAt = &e
		days := int(math.Ceil(time.Until(*expiresAt).Hours() / 24))
		if days < 0 {
			days = 0
		}
		resp.DaysLeft = &days
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}
