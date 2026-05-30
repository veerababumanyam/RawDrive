package middleware

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"log/slog"
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

// ──────────────────────────── F-108 regression ────────────────────────────

// errRow is a PlanTierRow whose Scan always returns scanErr. It models a
// failing plan-tier lookup so we can exercise PlanTierContext's error branch.
type errRow struct{ scanErr error }

func (r errRow) Scan(_ ...any) error { return r.scanErr }

// errPool returns an errRow seeded with scanErr.
type errPool struct{ scanErr error }

func (p *errPool) QueryRow(_ context.Context, _ string, _ ...any) PlanTierRow {
	return errRow{scanErr: p.scanErr}
}

// captureSlog swaps slog.Default for a buffer-backed text logger for the
// duration of the test and returns the buffer. The original logger is restored
// via t.Cleanup so other tests are unaffected.
func captureSlog(t *testing.T) *bytes.Buffer {
	t.Helper()
	buf := &bytes.Buffer{}
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(buf, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(prev) })
	return buf
}

// runPlanTierWithPool drives PlanTierContext for a request whose context
// carries the given workspace id and returns the plan tier observed
// downstream.
func runPlanTierWithPool(pool PlanTierPool, wsID string) string {
	var observed string
	inner := http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		observed = PlanTierFromContext(r.Context())
	})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/anything", nil)
	req = req.WithContext(WithWorkspaceID(req.Context(), wsID))
	PlanTierContext(pool)(inner).ServeHTTP(httptest.NewRecorder(), req)
	return observed
}

// TestPlanTierContext_ScanError_EmitsWarnAndFailsOpen is the F-108 regression.
// Before the fix the scan error was discarded with `_ =` and no log was
// emitted, so the WARN assertion below failed. After the fix a transient
// (non-ErrNoRows) scan failure must (a) fail open to an empty plan tier AND
// (b) emit a structured WARN naming the workspace.
func TestPlanTierContext_ScanError_EmitsWarnAndFailsOpen(t *testing.T) {
	buf := captureSlog(t)
	pool := &errPool{scanErr: errors.New("connection reset by peer")}

	plan := runPlanTierWithPool(pool, "ws-transient-fail")

	assert.Empty(t, plan, "fail-open invariant: scan error must surface an empty plan tier (never escalate)")

	logged := buf.String()
	assert.Contains(t, logged, "level=WARN", "transient scan failure must emit a WARN log")
	assert.Contains(t, logged, "plan tier scan failed", "WARN must carry the diagnostic message")
	assert.Contains(t, logged, "ws-transient-fail", "WARN must include the workspace id for triage")
}

// TestPlanTierContext_NoRows_FailsOpenSilently confirms the benign
// "workspace absent" case still fails open to empty WITHOUT logging:
// sql.ErrNoRows must not be treated as a fault, otherwise every
// missing-workspace request would spam WARN.
func TestPlanTierContext_NoRows_FailsOpenSilently(t *testing.T) {
	buf := captureSlog(t)
	pool := &errPool{scanErr: sql.ErrNoRows}

	plan := runPlanTierWithPool(pool, "ws-absent")

	assert.Empty(t, plan, "no row must surface an empty plan tier")
	assert.NotContains(t, buf.String(), "level=WARN", "sql.ErrNoRows must not emit a WARN")
}

// TestPlanTierContext_PgxNoRowsMessage_FailsOpenSilently confirms that a
// driver which reports an absent row via the canonical pgx message
// ("no rows in result set") rather than the database/sql sentinel is still
// treated as the benign empty-tier case and does NOT emit a WARN. This guards
// the production path, where the PlanTierPool adapter wraps pgx.
func TestPlanTierContext_PgxNoRowsMessage_FailsOpenSilently(t *testing.T) {
	buf := captureSlog(t)
	pool := &errPool{scanErr: errors.New("no rows in result set")}

	plan := runPlanTierWithPool(pool, "ws-absent-pgx")

	assert.Empty(t, plan, "pgx no-rows must surface an empty plan tier")
	assert.NotContains(t, buf.String(), "level=WARN", "pgx no-rows message must not emit a WARN")
}

// TestPlanTierContext_HappyPath_NoWarn confirms the normal success path
// resolves the real tier and stays silent.
func TestPlanTierContext_HappyPath_NoWarn(t *testing.T) {
	buf := captureSlog(t)
	pool := &fakePool{planTier: "enterprise"}

	plan := runPlanTierWithPool(pool, "ws-ok")

	assert.Equal(t, "enterprise", plan)
	assert.NotContains(t, buf.String(), "level=WARN", "happy path must not emit a WARN")
}
