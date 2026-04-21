package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

// fakeRow satisfies the narrow planTierRow interface used by
// PlanTierContext. Returns a canned plan tier; error pretends Scan
// succeeded.
type fakeRow struct{ planTier string }

func (r fakeRow) Scan(dest ...any) error {
	if len(dest) > 0 {
		if p, ok := dest[0].(*string); ok {
			*p = r.planTier
		}
	}
	return nil
}

// fakePool implements planTierPool. Captures the workspace id it was
// asked to resolve and returns a pre-seeded plan tier.
type fakePool struct {
	calledWithWS string
	planTier     string
}

func (p *fakePool) QueryRow(_ context.Context, _ string, args ...any) PlanTierRow {
	if len(args) > 0 {
		if ws, ok := args[0].(string); ok {
			p.calledWithWS = ws
		}
	}
	return fakeRow{planTier: p.planTier}
}

func TestPlanTierContext_StashesResolvedPlan(t *testing.T) {
	pool := &fakePool{planTier: "enterprise"}
	var observedPlan string

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		observedPlan = PlanTierFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/anything", nil)
	req = req.WithContext(WithWorkspaceID(req.Context(), "ws-abc"))
	rr := httptest.NewRecorder()

	PlanTierContext(pool)(inner).ServeHTTP(rr, req)

	assert.Equal(t, "ws-abc", pool.calledWithWS, "middleware must call QueryRow with the workspace id")
	assert.Equal(t, "enterprise", observedPlan)
}

func TestPlanTierContext_NoWorkspaceID_PassesThroughEmpty(t *testing.T) {
	pool := &fakePool{planTier: "standard"}
	var observedPlan string

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		observedPlan = PlanTierFromContext(r.Context())
	})

	// No WithWorkspaceID on the request context.
	req := httptest.NewRequest(http.MethodGet, "/api/v1/anything", nil)
	rr := httptest.NewRecorder()

	PlanTierContext(pool)(inner).ServeHTTP(rr, req)

	// Middleware must short-circuit — no DB call, empty plan tier surfaces.
	assert.Empty(t, pool.calledWithWS, "middleware must NOT query when workspace id missing")
	assert.Empty(t, observedPlan)
}

func TestPlanTierContext_NilPool_IsNoOp(t *testing.T) {
	var observedPlan string
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		observedPlan = PlanTierFromContext(r.Context())
	})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/anything", nil)
	req = req.WithContext(WithWorkspaceID(req.Context(), "ws-abc"))
	rr := httptest.NewRecorder()

	PlanTierContext(nil)(inner).ServeHTTP(rr, req)

	// nil pool → no enrichment, empty plan tier downstream.
	assert.Empty(t, observedPlan)
}

func TestWithPlanTier_RoundtripsThroughContext(t *testing.T) {
	ctx := WithPlanTier(context.Background(), "professional")
	assert.Equal(t, "professional", PlanTierFromContext(ctx))
}
