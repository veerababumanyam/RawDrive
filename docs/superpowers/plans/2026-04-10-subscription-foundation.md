# Subscription Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire real subscription plans, a per-workspace subscription record, plan→quota binding, persisted onboarding, upgrade/downgrade handlers, and a trial-expiry worker — **without** any payment gateway integration. Delivers a usable free-trial signup + tier enforcement flow that Razorpay can plug into in Phase B.

**Architecture:** Add `plans` and `subscriptions` tables (migration 053/054), plus `onboarding_progress` (migration 055) to replace the in-memory onboarding map. A new `backend/internal/billing/` package owns plan and subscription logic (repo → service → handler, following the existing M2/M4 pattern). `SubscriptionService.ChangePlan()` is the single chokepoint that writes `plans.quota_bytes` into `workspace_storage.quota_bytes` and refuses downgrades that would strand data. A `TrialExpiryWorker` follows the `GalleryExpiryWorker` shape (15-minute ticker) and transitions expired trials to `past_due` (uploads blocked, reads still allowed). Frontend adds onboarding step 3 (plan picker, no card required) and a `/account/billing` page for upgrade/downgrade. **No payment gateway code in this plan — all subscriptions created here start in `trialing` status with no charge.**

**Tech Stack:** Go 1.25+, chi/v5, pgx/v5, PostgreSQL 16 (embedded migrations via `//go:embed`), Next.js 15 (Turbopack), React, TypeScript, Tailwind v4. Testing: `testify`, `httptest`, `pgxpool` test connections. Money: integer paisa (INR). All new DB access goes through `pgxpool.Pool`.

**Scope decisions (locked before writing this plan):**
1. **Razorpay-first** for Phase B (not PhonePe). Not in this plan, but the `subscriptions` schema must support provider/external-reference fields so Phase B doesn't need another migration.
2. **Free = 14-day trial that converts**, not a permanent tier. `tokens.ts` currently says 90 days on Free — this plan updates it to 14 days for consistency.
3. **No card upfront.** Trial subscriptions are created with `status='trialing'`, `payment_method_id=NULL`.
4. **Block voluntary downgrades that would leave workspace over-quota.** Use `workspace_storage.grace_bytes` only for involuntary downgrades (trial expiry / failed payment) that land in Phase B.

**Out of scope (Phase B, separate plan):** Razorpay order creation, webhook signature verification, payment capture, refunds, invoice generation, proration math, failed-payment dunning.

---

## File Structure

### New files (backend)
- `backend/internal/database/migrations/053_m16_plans.up.sql` — `plans` table + seed rows
- `backend/internal/database/migrations/053_m16_plans.down.sql`
- `backend/internal/database/migrations/054_m16_subscriptions.up.sql` — `subscriptions` table
- `backend/internal/database/migrations/054_m16_subscriptions.down.sql`
- `backend/internal/database/migrations/055_m16_onboarding_progress.up.sql` — `onboarding_progress` table
- `backend/internal/database/migrations/055_m16_onboarding_progress.down.sql`
- `backend/internal/billing/plan_repo.go` — `PlanRepo` (ListAll, GetByCode, GetByID)
- `backend/internal/billing/plan_repo_test.go`
- `backend/internal/billing/subscription_repo.go` — `SubscriptionRepo` (Create, GetByWorkspaceID, UpdatePlan, UpdateStatus)
- `backend/internal/billing/subscription_repo_test.go`
- `backend/internal/billing/subscription_service.go` — `SubscriptionService` (CreateTrial, ChangePlan, GetByWorkspace)
- `backend/internal/billing/subscription_service_test.go`
- `backend/internal/billing/errors.go` — sentinel errors (`ErrPlanNotFound`, `ErrOverQuota`, `ErrSubscriptionExists`)
- `backend/internal/handler/billing_subscription_handler.go` — HTTP handler
- `backend/internal/handler/billing_subscription_handler_test.go`
- `backend/internal/handler/routes_billing.go` — `RegisterBillingRoutes`
- `backend/internal/worker/trial_expiry_worker.go` — `TrialExpiryWorker`
- `backend/internal/worker/trial_expiry_worker_test.go`
- `backend/internal/onboarding/repo.go` — `OnboardingRepo` (replaces in-memory map)
- `backend/internal/onboarding/repo_test.go`

### Modified files (backend)
- `backend/internal/onboarding/onboarding.go` — swap in-memory `map[string]*OnboardingStatus` for `OnboardingRepo`; add `SelectPlan` step and `PlanCode` field
- `backend/internal/onboarding/handler.go` — add `POST /plan` route
- `backend/internal/onboarding/handler_test.go` — extend tests for plan step
- `backend/cmd/api/main.go` — wire `billing.NewPlanRepo`, `billing.NewSubscriptionRepo`, `billing.NewSubscriptionService`, `handler.RegisterBillingRoutes`, register `worker.NewTrialExpiryWorker` in worker registry; pass `SubscriptionService` into onboarding service

### New files (frontend)
- `frontend/src/lib/api/billing.ts` — API client (`getPlans`, `getCurrentSubscription`, `changePlan`)
- `frontend/src/app/(dashboard)/account/billing/page.tsx` — current plan + upgrade/downgrade UI
- `frontend/src/components/billing/plan-card.tsx` — plan card component (re-used in onboarding + billing page)

### Modified files (frontend)
- `frontend/src/app/(dashboard)/onboarding/page.tsx` — add Step 3 (plan picker)
- `frontend/src/lib/tokens.ts` — change Free plan `trialDays: 90` → `trialDays: 14`

---

## Task 1: Migration 053 — `plans` table + seed

**Files:**
- Create: `backend/internal/database/migrations/053_m16_plans.up.sql`
- Create: `backend/internal/database/migrations/053_m16_plans.down.sql`
- Test: `backend/internal/database/migrations/admin_migrations_test.go` (existing test will auto-pick up new migrations; verify by running it)

- [ ] **Step 1: Write the migration up file**

Create `backend/internal/database/migrations/053_m16_plans.up.sql`:

```sql
-- M16: Subscription plans — seed master rows matching frontend/src/lib/tokens.ts pricingPlans.
-- All monetary amounts stored in paisa (INR); quota_bytes mirrors workspace_storage.quota_bytes units.

CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(32) NOT NULL UNIQUE,                -- free|starter|professional|business|enterprise
    name VARCHAR(64) NOT NULL,
    monthly_price_paisa BIGINT NOT NULL,             -- -1 for enterprise (custom)
    annual_price_paisa BIGINT NOT NULL,              -- -1 for enterprise
    trial_days INT NOT NULL DEFAULT 0,
    quota_bytes BIGINT NOT NULL,                     -- -1 for enterprise (unlimited)
    max_galleries INT NOT NULL,                      -- -1 for unlimited
    max_clients INT NOT NULL,                        -- -1 for unlimited
    features JSONB NOT NULL DEFAULT '[]'::jsonb,     -- feature bullet list (for display)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_plans_code ON plans (code);
CREATE INDEX idx_plans_is_active ON plans (is_active);

-- Seed the 5 canonical plans. Storage converted from GB/TB to bytes:
-- 1GB  = 1073741824
-- 50GB = 53687091200
-- 250GB = 268435456000
-- 2TB  = 2199023255552
INSERT INTO plans (code, name, monthly_price_paisa, annual_price_paisa, trial_days, quota_bytes, max_galleries, max_clients, features, sort_order)
VALUES
    ('free',         'Free',         0,        0,         14, 1073741824,    3,   5,   '["1GB Storage","3 Galleries","5 Client Profiles","Basic Gallery Delivery","Email Support"]'::jsonb, 10),
    ('starter',      'Starter',      50000,    500000,    0,  53687091200,   10,  20,  '["50GB Storage","10 Galleries","20 Client Profiles","Client Proofing","Basic CRM","Priority Email Support"]'::jsonb, 20),
    ('professional', 'Professional', 120000,   1200000,   0,  268435456000,  50,  100, '["250GB Storage","50 Galleries","100 Client Profiles","AI Culling","Client Proofing","Full CRM & Bookings","Live Streaming (5 sessions/mo)","Marketplace Listing","Phone Support"]'::jsonb, 30),
    ('business',     'Business',     500000,   5000000,   0,  2199023255552, 200, 500, '["2TB Storage","200 Galleries","500 Client Profiles","AI Culling (Unlimited)","Advanced Client Proofing","Full CRM & Bookings","Live Streaming (20 sessions/mo)","Premium Marketplace Listing","Dedicated Account Manager","API Access"]'::jsonb, 40),
    ('enterprise',   'Enterprise',   -1,       -1,        0,  -1,            -1,  -1,  '["Unlimited Storage","Unlimited Galleries","Unlimited Clients","White-label Options","Custom Integrations","SLA Guarantee","On-premise Deployment Option","24/7 Dedicated Support"]'::jsonb, 50)
ON CONFLICT (code) DO NOTHING;
```

- [ ] **Step 2: Write the migration down file**

Create `backend/internal/database/migrations/053_m16_plans.down.sql`:

```sql
DROP INDEX IF EXISTS idx_plans_is_active;
DROP INDEX IF EXISTS idx_plans_code;
DROP TABLE IF EXISTS plans;
```

- [ ] **Step 3: Run migrations test to verify both files parse and apply cleanly**

Run: `cd backend && go test ./internal/database/migrations/ -run TestAdminMigrations -v`
Expected: PASS (the test walks every up and down file in order; failure means a SQL syntax error or missing down file).

- [ ] **Step 4: Commit**

```bash
git add backend/internal/database/migrations/053_m16_plans.up.sql \
        backend/internal/database/migrations/053_m16_plans.down.sql
git commit -m "feat(m16): add plans table with 5 seeded tiers"
```

---

## Task 2: Migration 054 — `subscriptions` table

**Files:**
- Create: `backend/internal/database/migrations/054_m16_subscriptions.up.sql`
- Create: `backend/internal/database/migrations/054_m16_subscriptions.down.sql`

- [ ] **Step 1: Write the migration up file**

Create `backend/internal/database/migrations/054_m16_subscriptions.up.sql`:

```sql
-- M16: Per-workspace subscription state.
-- One row per workspace. Provider columns are nullable until Phase B (Razorpay) lands.

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES plans(id),
    status VARCHAR(20) NOT NULL DEFAULT 'trialing',  -- trialing|active|past_due|canceled
    billing_cycle VARCHAR(10) NOT NULL DEFAULT 'monthly', -- monthly|annual
    trial_end TIMESTAMPTZ,                             -- NULL for non-trial
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    current_period_end TIMESTAMPTZ,                    -- NULL until first real charge (Phase B)
    canceled_at TIMESTAMPTZ,
    -- Provider fields (Phase B fills these; nullable now)
    provider VARCHAR(20),                              -- razorpay|phonepe|NULL
    provider_customer_id VARCHAR(128),
    provider_subscription_id VARCHAR(128),
    payment_method_id VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_subscriptions_status CHECK (status IN ('trialing','active','past_due','canceled')),
    CONSTRAINT chk_subscriptions_cycle CHECK (billing_cycle IN ('monthly','annual'))
);

CREATE INDEX idx_subscriptions_workspace_id ON subscriptions (workspace_id);
CREATE INDEX idx_subscriptions_status ON subscriptions (status);
CREATE INDEX idx_subscriptions_trial_end ON subscriptions (trial_end) WHERE status = 'trialing';
```

- [ ] **Step 2: Write the migration down file**

Create `backend/internal/database/migrations/054_m16_subscriptions.down.sql`:

```sql
DROP INDEX IF EXISTS idx_subscriptions_trial_end;
DROP INDEX IF EXISTS idx_subscriptions_status;
DROP INDEX IF EXISTS idx_subscriptions_workspace_id;
DROP TABLE IF EXISTS subscriptions;
```

- [ ] **Step 3: Run migrations test**

Run: `cd backend && go test ./internal/database/migrations/ -run TestAdminMigrations -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/internal/database/migrations/054_m16_subscriptions.up.sql \
        backend/internal/database/migrations/054_m16_subscriptions.down.sql
git commit -m "feat(m16): add subscriptions table with provider columns reserved for Phase B"
```

---

## Task 3: Migration 055 — `onboarding_progress` table

**Files:**
- Create: `backend/internal/database/migrations/055_m16_onboarding_progress.up.sql`
- Create: `backend/internal/database/migrations/055_m16_onboarding_progress.down.sql`

- [ ] **Step 1: Write the migration up file**

Create `backend/internal/database/migrations/055_m16_onboarding_progress.up.sql`:

```sql
-- M16: Persisted onboarding state — replaces the in-memory map in backend/internal/onboarding/onboarding.go.
-- One row per user. current_step tracks wizard position so restarts don't wipe progress.

CREATE TABLE IF NOT EXISTS onboarding_progress (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    current_step VARCHAR(32) NOT NULL DEFAULT 'state_selection', -- state_selection|profile|plan_selection|complete
    state_id VARCHAR(4),
    business_name VARCHAR(255),
    gstin VARCHAR(15),
    display_name VARCHAR(255),
    plan_code VARCHAR(32),                         -- references plans.code once Step 3 submitted
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_onboarding_step CHECK (current_step IN ('state_selection','profile','plan_selection','complete'))
);

CREATE INDEX idx_onboarding_progress_step ON onboarding_progress (current_step);
```

- [ ] **Step 2: Write the migration down file**

Create `backend/internal/database/migrations/055_m16_onboarding_progress.down.sql`:

```sql
DROP INDEX IF EXISTS idx_onboarding_progress_step;
DROP TABLE IF EXISTS onboarding_progress;
```

- [ ] **Step 3: Run migrations test**

Run: `cd backend && go test ./internal/database/migrations/ -run TestAdminMigrations -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/internal/database/migrations/055_m16_onboarding_progress.up.sql \
        backend/internal/database/migrations/055_m16_onboarding_progress.down.sql
git commit -m "feat(m16): add onboarding_progress table to replace in-memory state"
```

---

## Task 4: `PlanRepo` — read-only access to the seeded plans

**Files:**
- Create: `backend/internal/billing/errors.go`
- Create: `backend/internal/billing/plan_repo.go`
- Test: `backend/internal/billing/plan_repo_test.go`

- [ ] **Step 1: Write the sentinel errors file**

Create `backend/internal/billing/errors.go`:

```go
package billing

import "errors"

var (
	ErrPlanNotFound         = errors.New("plan not found")
	ErrSubscriptionNotFound = errors.New("subscription not found")
	ErrSubscriptionExists   = errors.New("subscription already exists for workspace")
	ErrOverQuota            = errors.New("workspace storage exceeds target plan quota")
	ErrInvalidPlanChange    = errors.New("invalid plan change")
)
```

- [ ] **Step 2: Write the failing test**

Create `backend/internal/billing/plan_repo_test.go`:

```go
package billing_test

import (
	"context"
	"testing"

	"github.com/rawdrive/backend/internal/billing"
	"github.com/rawdrive/backend/internal/database/testdb"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPlanRepo_ListAll(t *testing.T) {
	pool := testdb.New(t)
	repo := billing.NewPlanRepo(pool)

	plans, err := repo.ListAll(context.Background())
	require.NoError(t, err)
	assert.Len(t, plans, 5, "expected 5 seeded plans")

	// Verify sort_order puts free first, enterprise last
	assert.Equal(t, "free", plans[0].Code)
	assert.Equal(t, "enterprise", plans[4].Code)
}

func TestPlanRepo_GetByCode(t *testing.T) {
	pool := testdb.New(t)
	repo := billing.NewPlanRepo(pool)

	plan, err := repo.GetByCode(context.Background(), "professional")
	require.NoError(t, err)
	assert.Equal(t, "Professional", plan.Name)
	assert.Equal(t, int64(120000), plan.MonthlyPricePaisa)
	assert.Equal(t, int64(268435456000), plan.QuotaBytes) // 250 GB
}

func TestPlanRepo_GetByCode_NotFound(t *testing.T) {
	pool := testdb.New(t)
	repo := billing.NewPlanRepo(pool)

	_, err := repo.GetByCode(context.Background(), "nope")
	assert.ErrorIs(t, err, billing.ErrPlanNotFound)
}
```

> **Note:** If `testdb` package doesn't exist yet, check `backend/internal/database/` for the current test helper — most packages in this repo use a `testDB` helper or direct `pgxpool.New` with `TEST_DATABASE_URL`. Match whatever neighboring repo tests do (e.g., `backend/internal/repository/lead_repo_test.go`).

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && go test ./internal/billing/ -run TestPlanRepo -v`
Expected: FAIL — `billing.NewPlanRepo undefined`

- [ ] **Step 4: Write the implementation**

Create `backend/internal/billing/plan_repo.go`:

```go
package billing

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Plan mirrors the plans table row.
type Plan struct {
	ID                uuid.UUID
	Code              string
	Name              string
	MonthlyPricePaisa int64
	AnnualPricePaisa  int64
	TrialDays         int
	QuotaBytes        int64
	MaxGalleries     int
	MaxClients       int
	Features          []byte // raw JSONB
	IsActive          bool
	SortOrder         int
}

type PlanRepo struct {
	pool *pgxpool.Pool
}

func NewPlanRepo(pool *pgxpool.Pool) *PlanRepo {
	return &PlanRepo{pool: pool}
}

const planColumns = `id, code, name, monthly_price_paisa, annual_price_paisa, trial_days,
quota_bytes, max_galleries, max_clients, features, is_active, sort_order`

func scanPlan(row pgx.Row) (*Plan, error) {
	var p Plan
	err := row.Scan(
		&p.ID, &p.Code, &p.Name, &p.MonthlyPricePaisa, &p.AnnualPricePaisa, &p.TrialDays,
		&p.QuotaBytes, &p.MaxGalleries, &p.MaxClients, &p.Features, &p.IsActive, &p.SortOrder,
	)
	return &p, err
}

// ListAll returns all active plans ordered by sort_order.
func (r *PlanRepo) ListAll(ctx context.Context) ([]*Plan, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+planColumns+` FROM plans WHERE is_active = TRUE ORDER BY sort_order ASC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var plans []*Plan
	for rows.Next() {
		p, err := scanPlan(rows)
		if err != nil {
			return nil, err
		}
		plans = append(plans, p)
	}
	return plans, rows.Err()
}

// GetByCode fetches a plan by its unique code.
func (r *PlanRepo) GetByCode(ctx context.Context, code string) (*Plan, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT `+planColumns+` FROM plans WHERE code = $1 AND is_active = TRUE`, code,
	)
	p, err := scanPlan(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrPlanNotFound
	}
	if err != nil {
		return nil, err
	}
	return p, nil
}

// GetByID fetches a plan by UUID.
func (r *PlanRepo) GetByID(ctx context.Context, id uuid.UUID) (*Plan, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT `+planColumns+` FROM plans WHERE id = $1`, id,
	)
	p, err := scanPlan(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrPlanNotFound
	}
	if err != nil {
		return nil, err
	}
	return p, nil
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && go test ./internal/billing/ -run TestPlanRepo -v`
Expected: PASS (all 3 subtests)

- [ ] **Step 6: Commit**

```bash
git add backend/internal/billing/errors.go \
        backend/internal/billing/plan_repo.go \
        backend/internal/billing/plan_repo_test.go
git commit -m "feat(m16): add PlanRepo with ListAll / GetByCode / GetByID"
```

---

## Task 5: `SubscriptionRepo` — CRUD for the subscriptions table

**Files:**
- Create: `backend/internal/billing/subscription_repo.go`
- Test: `backend/internal/billing/subscription_repo_test.go`

- [ ] **Step 1: Write the failing test**

Create `backend/internal/billing/subscription_repo_test.go`:

```go
package billing_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/billing"
	"github.com/rawdrive/backend/internal/database/testdb"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// seedWorkspace is a test helper that creates a minimal workspace row
// and returns its UUID. See neighboring repo tests for the canonical pattern.
func seedWorkspace(t *testing.T, ctx context.Context, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	var wsID uuid.UUID
	err := pool.QueryRow(ctx,
		`INSERT INTO workspaces (name) VALUES ('test-ws') RETURNING id`,
	).Scan(&wsID)
	require.NoError(t, err)
	return wsID
}

func TestSubscriptionRepo_CreateAndGet(t *testing.T) {
	ctx := context.Background()
	pool := testdb.New(t)
	planRepo := billing.NewPlanRepo(pool)
	subRepo := billing.NewSubscriptionRepo(pool)

	freePlan, err := planRepo.GetByCode(ctx, "free")
	require.NoError(t, err)

	wsID := seedWorkspace(t, ctx, pool)
	trialEnd := time.Now().Add(14 * 24 * time.Hour)

	created, err := subRepo.Create(ctx, billing.CreateSubscriptionInput{
		WorkspaceID: wsID,
		PlanID:      freePlan.ID,
		Status:      "trialing",
		TrialEnd:    &trialEnd,
	})
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, created.ID)
	assert.Equal(t, "trialing", created.Status)

	// Fetch by workspace
	fetched, err := subRepo.GetByWorkspaceID(ctx, wsID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, fetched.ID)
}

func TestSubscriptionRepo_GetByWorkspaceID_NotFound(t *testing.T) {
	ctx := context.Background()
	pool := testdb.New(t)
	subRepo := billing.NewSubscriptionRepo(pool)

	_, err := subRepo.GetByWorkspaceID(ctx, uuid.New())
	assert.ErrorIs(t, err, billing.ErrSubscriptionNotFound)
}

func TestSubscriptionRepo_UpdatePlan(t *testing.T) {
	ctx := context.Background()
	pool := testdb.New(t)
	planRepo := billing.NewPlanRepo(pool)
	subRepo := billing.NewSubscriptionRepo(pool)

	free, _ := planRepo.GetByCode(ctx, "free")
	pro, _ := planRepo.GetByCode(ctx, "professional")

	wsID := seedWorkspace(t, ctx, pool)
	_, err := subRepo.Create(ctx, billing.CreateSubscriptionInput{
		WorkspaceID: wsID, PlanID: free.ID, Status: "trialing",
	})
	require.NoError(t, err)

	require.NoError(t, subRepo.UpdatePlan(ctx, wsID, pro.ID))
	got, _ := subRepo.GetByWorkspaceID(ctx, wsID)
	assert.Equal(t, pro.ID, got.PlanID)
}

func TestSubscriptionRepo_UpdateStatus(t *testing.T) {
	ctx := context.Background()
	pool := testdb.New(t)
	planRepo := billing.NewPlanRepo(pool)
	subRepo := billing.NewSubscriptionRepo(pool)

	free, _ := planRepo.GetByCode(ctx, "free")
	wsID := seedWorkspace(t, ctx, pool)
	_, _ = subRepo.Create(ctx, billing.CreateSubscriptionInput{
		WorkspaceID: wsID, PlanID: free.ID, Status: "trialing",
	})

	require.NoError(t, subRepo.UpdateStatus(ctx, wsID, "past_due"))
	got, _ := subRepo.GetByWorkspaceID(ctx, wsID)
	assert.Equal(t, "past_due", got.Status)
}
```

> **Note:** The `seedWorkspace` helper is inline here because `workspaces` table rows need `name` and `owner_id` (see migration 005). If the real workspace schema requires `owner_id NOT NULL`, add a minimal user insert too — check the current `005_create_workspaces.up.sql` at implementation time.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/billing/ -run TestSubscriptionRepo -v`
Expected: FAIL — `billing.NewSubscriptionRepo undefined`

- [ ] **Step 3: Write the implementation**

Create `backend/internal/billing/subscription_repo.go`:

```go
package billing

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Subscription mirrors a subscriptions table row.
type Subscription struct {
	ID                     uuid.UUID
	WorkspaceID            uuid.UUID
	PlanID                 uuid.UUID
	Status                 string
	BillingCycle           string
	TrialEnd               *time.Time
	CurrentPeriodStart     time.Time
	CurrentPeriodEnd       *time.Time
	CanceledAt             *time.Time
	Provider               *string
	ProviderCustomerID     *string
	ProviderSubscriptionID *string
	PaymentMethodID        *string
	CreatedAt              time.Time
	UpdatedAt              time.Time
}

type CreateSubscriptionInput struct {
	WorkspaceID  uuid.UUID
	PlanID       uuid.UUID
	Status       string
	BillingCycle string // defaults to "monthly" if empty
	TrialEnd     *time.Time
}

type SubscriptionRepo struct {
	pool *pgxpool.Pool
}

func NewSubscriptionRepo(pool *pgxpool.Pool) *SubscriptionRepo {
	return &SubscriptionRepo{pool: pool}
}

const subColumns = `id, workspace_id, plan_id, status, billing_cycle, trial_end,
current_period_start, current_period_end, canceled_at,
provider, provider_customer_id, provider_subscription_id, payment_method_id,
created_at, updated_at`

func scanSubscription(row pgx.Row) (*Subscription, error) {
	var s Subscription
	err := row.Scan(
		&s.ID, &s.WorkspaceID, &s.PlanID, &s.Status, &s.BillingCycle, &s.TrialEnd,
		&s.CurrentPeriodStart, &s.CurrentPeriodEnd, &s.CanceledAt,
		&s.Provider, &s.ProviderCustomerID, &s.ProviderSubscriptionID, &s.PaymentMethodID,
		&s.CreatedAt, &s.UpdatedAt,
	)
	return &s, err
}

func (r *SubscriptionRepo) Create(ctx context.Context, in CreateSubscriptionInput) (*Subscription, error) {
	cycle := in.BillingCycle
	if cycle == "" {
		cycle = "monthly"
	}
	row := r.pool.QueryRow(ctx,
		`INSERT INTO subscriptions (workspace_id, plan_id, status, billing_cycle, trial_end)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING `+subColumns,
		in.WorkspaceID, in.PlanID, in.Status, cycle, in.TrialEnd,
	)
	return scanSubscription(row)
}

func (r *SubscriptionRepo) GetByWorkspaceID(ctx context.Context, wsID uuid.UUID) (*Subscription, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT `+subColumns+` FROM subscriptions WHERE workspace_id = $1`, wsID,
	)
	s, err := scanSubscription(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrSubscriptionNotFound
	}
	if err != nil {
		return nil, err
	}
	return s, nil
}

func (r *SubscriptionRepo) UpdatePlan(ctx context.Context, wsID, planID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE subscriptions SET plan_id = $1, updated_at = now() WHERE workspace_id = $2`,
		planID, wsID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrSubscriptionNotFound
	}
	return nil
}

func (r *SubscriptionRepo) UpdateStatus(ctx context.Context, wsID uuid.UUID, status string) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE subscriptions SET status = $1, updated_at = now() WHERE workspace_id = $2`,
		status, wsID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrSubscriptionNotFound
	}
	return nil
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./internal/billing/ -run TestSubscriptionRepo -v`
Expected: PASS (all 4 subtests)

- [ ] **Step 5: Commit**

```bash
git add backend/internal/billing/subscription_repo.go \
        backend/internal/billing/subscription_repo_test.go
git commit -m "feat(m16): add SubscriptionRepo with Create/Get/UpdatePlan/UpdateStatus"
```

---

## Task 6: `SubscriptionService` — business logic with plan→quota binding

**Files:**
- Create: `backend/internal/billing/subscription_service.go`
- Test: `backend/internal/billing/subscription_service_test.go`

This is the critical task. `ChangePlan` is the single place where `plans.quota_bytes` gets copied into `workspace_storage.quota_bytes`, and it refuses downgrades that would leave the workspace over-quota (decision #3 from the plan header).

- [ ] **Step 1: Write the failing test**

Create `backend/internal/billing/subscription_service_test.go`:

```go
package billing_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/billing"
	"github.com/rawdrive/backend/internal/database/testdb"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// seedWorkspaceStorage writes a workspace_storage row so ChangePlan can
// verify used_bytes against the target plan's quota.
func seedWorkspaceStorage(t *testing.T, ctx context.Context, pool *pgxpool.Pool, wsID uuid.UUID, used int64) {
	t.Helper()
	_, err := pool.Exec(ctx,
		`INSERT INTO workspace_storage (workspace_id, used_bytes, quota_bytes)
		 VALUES ($1, $2, 1073741824)
		 ON CONFLICT (workspace_id) DO UPDATE SET used_bytes = EXCLUDED.used_bytes`,
		wsID, used,
	)
	require.NoError(t, err)
}

func TestSubscriptionService_CreateTrial(t *testing.T) {
	ctx := context.Background()
	pool := testdb.New(t)
	svc := billing.NewSubscriptionService(
		billing.NewPlanRepo(pool),
		billing.NewSubscriptionRepo(pool),
		pool,
	)

	wsID := seedWorkspace(t, ctx, pool)
	seedWorkspaceStorage(t, ctx, pool, wsID, 0)

	sub, err := svc.CreateTrial(ctx, wsID, "free")
	require.NoError(t, err)
	assert.Equal(t, "trialing", sub.Status)
	require.NotNil(t, sub.TrialEnd, "trial_end must be set")

	// Quota should be bound to free plan's 1GB
	var quota int64
	err = pool.QueryRow(ctx,
		`SELECT quota_bytes FROM workspace_storage WHERE workspace_id = $1`, wsID,
	).Scan(&quota)
	require.NoError(t, err)
	assert.Equal(t, int64(1073741824), quota)
}

func TestSubscriptionService_ChangePlan_Upgrade(t *testing.T) {
	ctx := context.Background()
	pool := testdb.New(t)
	svc := billing.NewSubscriptionService(
		billing.NewPlanRepo(pool),
		billing.NewSubscriptionRepo(pool),
		pool,
	)

	wsID := seedWorkspace(t, ctx, pool)
	seedWorkspaceStorage(t, ctx, pool, wsID, 500000000) // 500MB used
	_, err := svc.CreateTrial(ctx, wsID, "free")
	require.NoError(t, err)

	// Upgrade to professional (250GB)
	require.NoError(t, svc.ChangePlan(ctx, wsID, "professional"))

	var quota int64
	pool.QueryRow(ctx, `SELECT quota_bytes FROM workspace_storage WHERE workspace_id = $1`, wsID).Scan(&quota)
	assert.Equal(t, int64(268435456000), quota, "quota should now match professional tier")
}

func TestSubscriptionService_ChangePlan_DowngradeBlockedWhenOverQuota(t *testing.T) {
	ctx := context.Background()
	pool := testdb.New(t)
	svc := billing.NewSubscriptionService(
		billing.NewPlanRepo(pool),
		billing.NewSubscriptionRepo(pool),
		pool,
	)

	wsID := seedWorkspace(t, ctx, pool)
	// Workspace using 60GB — downgrade to starter (50GB) must be refused
	seedWorkspaceStorage(t, ctx, pool, wsID, 64424509440)
	_, err := svc.CreateTrial(ctx, wsID, "professional")
	require.NoError(t, err)

	err = svc.ChangePlan(ctx, wsID, "starter")
	assert.ErrorIs(t, err, billing.ErrOverQuota)

	// Quota must NOT have been updated
	var quota int64
	pool.QueryRow(ctx, `SELECT quota_bytes FROM workspace_storage WHERE workspace_id = $1`, wsID).Scan(&quota)
	assert.Equal(t, int64(268435456000), quota, "quota should still be professional tier")
}

func TestSubscriptionService_ChangePlan_DowngradeAllowedWhenUnderQuota(t *testing.T) {
	ctx := context.Background()
	pool := testdb.New(t)
	svc := billing.NewSubscriptionService(
		billing.NewPlanRepo(pool),
		billing.NewSubscriptionRepo(pool),
		pool,
	)

	wsID := seedWorkspace(t, ctx, pool)
	seedWorkspaceStorage(t, ctx, pool, wsID, 30000000000) // 30GB used
	_, err := svc.CreateTrial(ctx, wsID, "professional")
	require.NoError(t, err)

	// Downgrade to starter (50GB) — allowed since 30GB < 50GB
	require.NoError(t, svc.ChangePlan(ctx, wsID, "starter"))

	var quota int64
	pool.QueryRow(ctx, `SELECT quota_bytes FROM workspace_storage WHERE workspace_id = $1`, wsID).Scan(&quota)
	assert.Equal(t, int64(53687091200), quota)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/billing/ -run TestSubscriptionService -v`
Expected: FAIL — `billing.NewSubscriptionService undefined`

- [ ] **Step 3: Write the implementation**

Create `backend/internal/billing/subscription_service.go`:

```go
package billing

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SubscriptionService is the single chokepoint for subscription + quota changes.
// It enforces plan→quota binding in an atomic transaction so the two cannot drift.
type SubscriptionService struct {
	plans *PlanRepo
	subs  *SubscriptionRepo
	pool  *pgxpool.Pool
}

func NewSubscriptionService(plans *PlanRepo, subs *SubscriptionRepo, pool *pgxpool.Pool) *SubscriptionService {
	return &SubscriptionService{plans: plans, subs: subs, pool: pool}
}

// CreateTrial creates a trialing subscription for the workspace and binds
// the plan's quota to workspace_storage in a single transaction.
// Returns ErrSubscriptionExists if one already exists for the workspace.
func (s *SubscriptionService) CreateTrial(ctx context.Context, wsID uuid.UUID, planCode string) (*Subscription, error) {
	plan, err := s.plans.GetByCode(ctx, planCode)
	if err != nil {
		return nil, err
	}

	// Reject if a subscription already exists
	if _, err := s.subs.GetByWorkspaceID(ctx, wsID); err == nil {
		return nil, ErrSubscriptionExists
	}

	var trialEnd *time.Time
	if plan.TrialDays > 0 {
		t := time.Now().Add(time.Duration(plan.TrialDays) * 24 * time.Hour)
		trialEnd = &t
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Insert the subscription
	var sub Subscription
	err = tx.QueryRow(ctx,
		`INSERT INTO subscriptions (workspace_id, plan_id, status, billing_cycle, trial_end)
		 VALUES ($1, $2, 'trialing', 'monthly', $3)
		 RETURNING `+subColumns,
		wsID, plan.ID, trialEnd,
	).Scan(
		&sub.ID, &sub.WorkspaceID, &sub.PlanID, &sub.Status, &sub.BillingCycle, &sub.TrialEnd,
		&sub.CurrentPeriodStart, &sub.CurrentPeriodEnd, &sub.CanceledAt,
		&sub.Provider, &sub.ProviderCustomerID, &sub.ProviderSubscriptionID, &sub.PaymentMethodID,
		&sub.CreatedAt, &sub.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	// Bind plan quota to workspace_storage (upsert if row missing)
	if plan.QuotaBytes >= 0 {
		_, err = tx.Exec(ctx,
			`INSERT INTO workspace_storage (workspace_id, used_bytes, quota_bytes)
			 VALUES ($1, 0, $2)
			 ON CONFLICT (workspace_id) DO UPDATE SET quota_bytes = EXCLUDED.quota_bytes, updated_at = now()`,
			wsID, plan.QuotaBytes,
		)
		if err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &sub, nil
}

// ChangePlan updates the workspace's subscription to the target plan and rebinds quota.
// If the target plan's quota is smaller than current used_bytes, returns ErrOverQuota.
// Enterprise (quota_bytes = -1) is treated as unlimited.
func (s *SubscriptionService) ChangePlan(ctx context.Context, wsID uuid.UUID, newPlanCode string) error {
	newPlan, err := s.plans.GetByCode(ctx, newPlanCode)
	if err != nil {
		return err
	}
	if _, err := s.subs.GetByWorkspaceID(ctx, wsID); err != nil {
		return err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Fetch current used_bytes with row lock
	var usedBytes int64
	err = tx.QueryRow(ctx,
		`SELECT used_bytes FROM workspace_storage WHERE workspace_id = $1 FOR UPDATE`,
		wsID,
	).Scan(&usedBytes)
	if err != nil {
		return err
	}

	// Over-quota guard (skip for enterprise unlimited)
	if newPlan.QuotaBytes >= 0 && usedBytes > newPlan.QuotaBytes {
		return ErrOverQuota
	}

	// Update subscription row
	_, err = tx.Exec(ctx,
		`UPDATE subscriptions SET plan_id = $1, updated_at = now() WHERE workspace_id = $2`,
		newPlan.ID, wsID,
	)
	if err != nil {
		return err
	}

	// Rebind quota (enterprise stays at 0 quota_bytes and relies on separate unlimited logic — for now, set to INT8 max)
	targetQuota := newPlan.QuotaBytes
	if targetQuota < 0 {
		targetQuota = 9223372036854775807 // bigint max — effectively unlimited
	}
	_, err = tx.Exec(ctx,
		`UPDATE workspace_storage SET quota_bytes = $1, updated_at = now() WHERE workspace_id = $2`,
		targetQuota, wsID,
	)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// GetByWorkspace is a thin passthrough for handlers.
func (s *SubscriptionService) GetByWorkspace(ctx context.Context, wsID uuid.UUID) (*Subscription, error) {
	return s.subs.GetByWorkspaceID(ctx, wsID)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./internal/billing/ -run TestSubscriptionService -v`
Expected: PASS (all 4 subtests)

- [ ] **Step 5: Commit**

```bash
git add backend/internal/billing/subscription_service.go \
        backend/internal/billing/subscription_service_test.go
git commit -m "feat(m16): add SubscriptionService with atomic plan->quota binding and over-quota guard"
```

---

## Task 7: `OnboardingRepo` — persist onboarding state to DB

**Files:**
- Create: `backend/internal/onboarding/repo.go`
- Test: `backend/internal/onboarding/repo_test.go`

- [ ] **Step 1: Write the failing test**

Create `backend/internal/onboarding/repo_test.go`:

```go
package onboarding_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/database/testdb"
	"github.com/rawdrive/backend/internal/onboarding"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func seedUser(t *testing.T, ctx context.Context, pool *pgxpool.Pool) string {
	t.Helper()
	var id uuid.UUID
	err := pool.QueryRow(ctx,
		`INSERT INTO users (email, phone) VALUES ('test@example.com', '+919999999999') RETURNING id`,
	).Scan(&id)
	require.NoError(t, err)
	return id.String()
}

func TestOnboardingRepo_GetOrCreate_ReturnsDefault(t *testing.T) {
	ctx := context.Background()
	pool := testdb.New(t)
	userID := seedUser(t, ctx, pool)
	repo := onboarding.NewRepo(pool)

	status, err := repo.GetOrCreate(ctx, userID)
	require.NoError(t, err)
	assert.Equal(t, "state_selection", status.CurrentStep)
}

func TestOnboardingRepo_UpsertState(t *testing.T) {
	ctx := context.Background()
	pool := testdb.New(t)
	userID := seedUser(t, ctx, pool)
	repo := onboarding.NewRepo(pool)

	err := repo.UpsertState(ctx, userID, "KA")
	require.NoError(t, err)

	status, err := repo.GetOrCreate(ctx, userID)
	require.NoError(t, err)
	assert.Equal(t, "KA", status.StateID)
	assert.Equal(t, "profile", status.CurrentStep)
}

func TestOnboardingRepo_UpsertProfile(t *testing.T) {
	ctx := context.Background()
	pool := testdb.New(t)
	userID := seedUser(t, ctx, pool)
	repo := onboarding.NewRepo(pool)

	require.NoError(t, repo.UpsertState(ctx, userID, "KA"))
	require.NoError(t, repo.UpsertProfile(ctx, userID, "Acme Studio", "29ABCDE1234F1Z5", "Acme"))

	status, _ := repo.GetOrCreate(ctx, userID)
	assert.Equal(t, "Acme Studio", status.BusinessName)
	assert.Equal(t, "plan_selection", status.CurrentStep)
}

func TestOnboardingRepo_UpsertPlan(t *testing.T) {
	ctx := context.Background()
	pool := testdb.New(t)
	userID := seedUser(t, ctx, pool)
	repo := onboarding.NewRepo(pool)

	require.NoError(t, repo.UpsertState(ctx, userID, "KA"))
	require.NoError(t, repo.UpsertProfile(ctx, userID, "Acme Studio", "", "Acme"))
	require.NoError(t, repo.UpsertPlan(ctx, userID, "free"))

	status, _ := repo.GetOrCreate(ctx, userID)
	assert.Equal(t, "free", status.PlanCode)
	assert.Equal(t, "complete", status.CurrentStep)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/onboarding/ -run TestOnboardingRepo -v`
Expected: FAIL — `onboarding.NewRepo undefined`

- [ ] **Step 3: Write the implementation**

Create `backend/internal/onboarding/repo.go`:

```go
package onboarding

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repo persists onboarding progress to the onboarding_progress table.
// It replaces the in-memory map[string]*OnboardingStatus from onboarding.go.
type Repo struct {
	pool *pgxpool.Pool
}

func NewRepo(pool *pgxpool.Pool) *Repo {
	return &Repo{pool: pool}
}

// GetOrCreate returns the user's onboarding row, creating a default one if missing.
func (r *Repo) GetOrCreate(ctx context.Context, userID string) (*OnboardingStatus, error) {
	var s OnboardingStatus
	var planCode *string
	err := r.pool.QueryRow(ctx,
		`SELECT user_id::text, current_step, COALESCE(state_id,''),
		        COALESCE(business_name,''), COALESCE(gstin,''), plan_code
		 FROM onboarding_progress WHERE user_id = $1`,
		userID,
	).Scan(&s.UserID, &s.CurrentStep, &s.StateID, &s.BusinessName, &s.GSTIN, &planCode)

	if errors.Is(err, pgx.ErrNoRows) {
		// Insert default and re-fetch
		_, insErr := r.pool.Exec(ctx,
			`INSERT INTO onboarding_progress (user_id, current_step) VALUES ($1, 'state_selection')
			 ON CONFLICT (user_id) DO NOTHING`,
			userID,
		)
		if insErr != nil {
			return nil, insErr
		}
		return &OnboardingStatus{UserID: userID, CurrentStep: StepStateSelection}, nil
	}
	if err != nil {
		return nil, err
	}
	if planCode != nil {
		s.PlanCode = *planCode
	}
	return &s, nil
}

func (r *Repo) UpsertState(ctx context.Context, userID, stateID string) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO onboarding_progress (user_id, state_id, current_step)
		 VALUES ($1, $2, 'profile')
		 ON CONFLICT (user_id) DO UPDATE
		    SET state_id = EXCLUDED.state_id,
		        current_step = 'profile',
		        updated_at = now()`,
		userID, stateID,
	)
	return err
}

func (r *Repo) UpsertProfile(ctx context.Context, userID, businessName, gstin, displayName string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE onboarding_progress
		 SET business_name = $2, gstin = NULLIF($3,''), display_name = $4,
		     current_step = 'plan_selection', updated_at = now()
		 WHERE user_id = $1`,
		userID, businessName, gstin, displayName,
	)
	return err
}

func (r *Repo) UpsertPlan(ctx context.Context, userID, planCode string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE onboarding_progress
		 SET plan_code = $2, current_step = 'complete', updated_at = now()
		 WHERE user_id = $1`,
		userID, planCode,
	)
	return err
}
```

You will also need to add a `PlanCode` field to `OnboardingStatus` in `onboarding.go` — do that in the next task when you touch the service.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./internal/onboarding/ -run TestOnboardingRepo -v`
Expected: FAIL initially on `PlanCode undefined` — add the field now.

In `backend/internal/onboarding/onboarding.go`, modify the `OnboardingStatus` struct to add `PlanCode` and add a new step constant:

```go
const (
	StepStateSelection Step = "state_selection"
	StepProfile        Step = "profile"
	StepPlanSelection  Step = "plan_selection"
	StepComplete       Step = "complete"
)

type OnboardingStatus struct {
	UserID       string `json:"user_id"`
	CurrentStep  Step   `json:"current_step"`
	StateID      string `json:"state_id,omitempty"`
	BusinessName string `json:"business_name,omitempty"`
	GSTIN        string `json:"gstin,omitempty"`
	PlanCode     string `json:"plan_code,omitempty"`
}
```

Re-run test:

Run: `cd backend && go test ./internal/onboarding/ -run TestOnboardingRepo -v`
Expected: PASS (all 4 subtests)

- [ ] **Step 5: Commit**

```bash
git add backend/internal/onboarding/repo.go \
        backend/internal/onboarding/repo_test.go \
        backend/internal/onboarding/onboarding.go
git commit -m "feat(m16): add OnboardingRepo and PlanCode field, step: plan_selection"
```

---

## Task 8: Rewire `onboarding.Service` to use the repo + add `SelectPlan`

**Files:**
- Modify: `backend/internal/onboarding/onboarding.go`
- Modify: `backend/internal/onboarding/handler_test.go` (existing tests use in-memory service — need to inject stub repo)

The goal: remove the in-memory `sync.Mutex` + `map[string]*OnboardingStatus` entirely, make `service` depend on `Repo`, and add a `SelectPlan` method that delegates to `billing.SubscriptionService.CreateTrial`.

- [ ] **Step 1: Rewrite the service struct**

Modify `backend/internal/onboarding/onboarding.go` — replace the in-memory `service` type and methods:

```go
// RepoInterface lets tests stub persistence without a real DB.
type RepoInterface interface {
	GetOrCreate(ctx context.Context, userID string) (*OnboardingStatus, error)
	UpsertState(ctx context.Context, userID, stateID string) error
	UpsertProfile(ctx context.Context, userID, businessName, gstin, displayName string) error
	UpsertPlan(ctx context.Context, userID, planCode string) error
}

// TrialCreator is the subset of billing.SubscriptionService that onboarding needs.
// Declared as an interface so tests can stub it.
type TrialCreator interface {
	CreateTrial(ctx context.Context, workspaceID uuid.UUID, planCode string) error
}

type service struct {
	repo RepoInterface
	wsc  WorkspaceCreator
	pub  EventPublisher
	trial TrialCreator
}

func NewService(repo RepoInterface, wsc WorkspaceCreator, pub EventPublisher, trial TrialCreator) Service {
	return &service{repo: repo, wsc: wsc, pub: pub, trial: trial}
}

// Expand the Service interface
type Service interface {
	SelectState(ctx context.Context, userID string, input StateSelectionInput) error
	SetProfile(ctx context.Context, userID string, input ProfileInput) error
	SelectPlan(ctx context.Context, userID, planCode string) error
	GetStatus(ctx context.Context, userID string) (*OnboardingStatus, error)
}

func (s *service) SelectState(ctx context.Context, userID string, input StateSelectionInput) error {
	if !validStates[input.StateID] {
		return ErrInvalidState
	}
	return s.repo.UpsertState(ctx, userID, input.StateID)
}

func (s *service) SetProfile(ctx context.Context, userID string, input ProfileInput) error {
	status, err := s.repo.GetOrCreate(ctx, userID)
	if err != nil {
		return err
	}
	if status.CurrentStep == StepStateSelection {
		return ErrStepRequired
	}
	if input.GSTIN != "" && !isValidGSTIN(input.GSTIN) {
		return ErrInvalidGSTIN
	}
	return s.repo.UpsertProfile(ctx, userID, input.BusinessName, input.GSTIN, input.DisplayName)
}

func (s *service) SelectPlan(ctx context.Context, userID, planCode string) error {
	status, err := s.repo.GetOrCreate(ctx, userID)
	if err != nil {
		return err
	}
	if status.CurrentStep != StepPlanSelection && status.CurrentStep != StepComplete {
		return ErrStepRequired
	}

	// Create the workspace now (moved out of SetProfile) so we have a target for the trial
	wsID := ""
	if s.wsc != nil {
		wsID, _ = s.wsc.CreateWorkspace(ctx, userID, status.StateID, status.BusinessName)
	}

	// Persist the plan choice
	if err := s.repo.UpsertPlan(ctx, userID, planCode); err != nil {
		return err
	}

	// Create a trialing subscription (no card)
	if s.trial != nil && wsID != "" {
		parsed, parseErr := uuid.Parse(wsID)
		if parseErr == nil {
			_ = s.trial.CreateTrial(ctx, parsed, planCode)
		}
	}

	if s.pub != nil {
		_ = s.pub.Publish(ctx, "onboarding.complete", []byte(`{"user_id":"`+userID+`","plan":"`+planCode+`"}`))
	}
	return nil
}

func (s *service) GetStatus(ctx context.Context, userID string) (*OnboardingStatus, error) {
	return s.repo.GetOrCreate(ctx, userID)
}
```

**Important:** Remove workspace creation from `SetProfile` (it was on line 125-127 of the old file). It now happens in `SelectPlan`. Also add `"github.com/google/uuid"` to imports.

- [ ] **Step 2: Update existing handler_test.go stubs**

The existing `handler_test.go` uses `NewService` with 2 args. Search for every `onboarding.NewService(` call in the test file and update it. Add a stub repo + stub trial creator at the top of the test file:

```go
// stubRepo replaces the in-memory map for tests.
type stubRepo struct {
	statuses map[string]*onboarding.OnboardingStatus
}

func newStubRepo() *stubRepo {
	return &stubRepo{statuses: make(map[string]*onboarding.OnboardingStatus)}
}

func (r *stubRepo) GetOrCreate(_ context.Context, userID string) (*onboarding.OnboardingStatus, error) {
	if s, ok := r.statuses[userID]; ok {
		return s, nil
	}
	s := &onboarding.OnboardingStatus{UserID: userID, CurrentStep: onboarding.StepStateSelection}
	r.statuses[userID] = s
	return s, nil
}

func (r *stubRepo) UpsertState(_ context.Context, userID, stateID string) error {
	s, _ := r.GetOrCreate(context.Background(), userID)
	s.StateID = stateID
	s.CurrentStep = onboarding.StepProfile
	return nil
}

func (r *stubRepo) UpsertProfile(_ context.Context, userID, bn, gstin, dn string) error {
	s, _ := r.GetOrCreate(context.Background(), userID)
	s.BusinessName = bn
	s.GSTIN = gstin
	s.CurrentStep = onboarding.StepPlanSelection
	return nil
}

func (r *stubRepo) UpsertPlan(_ context.Context, userID, planCode string) error {
	s, _ := r.GetOrCreate(context.Background(), userID)
	s.PlanCode = planCode
	s.CurrentStep = onboarding.StepComplete
	return nil
}

type stubTrialCreator struct{ called int }

func (s *stubTrialCreator) CreateTrial(_ context.Context, _ uuid.UUID, _ string) error {
	s.called++
	return nil
}
```

Then update every `onboarding.NewService(...)` call in the test file to pass the stubs. Example:

```go
// Before:
svc := onboarding.NewService(&stubWorkspaceCreator{}, &stubEventPub{})
// After:
svc := onboarding.NewService(newStubRepo(), &stubWorkspaceCreator{}, &stubEventPub{}, &stubTrialCreator{})
```

- [ ] **Step 3: Run existing onboarding tests**

Run: `cd backend && go test ./internal/onboarding/ -v`
Expected: PASS (including the refactored handler tests and the new repo tests from Task 7)

If compile errors remain, fix them — do NOT silently comment out broken tests.

- [ ] **Step 4: Commit**

```bash
git add backend/internal/onboarding/onboarding.go \
        backend/internal/onboarding/handler_test.go
git commit -m "refactor(m16): onboarding service uses DB repo and adds SelectPlan step"
```

---

## Task 9: Add `POST /onboarding/plan` handler route

**Files:**
- Modify: `backend/internal/onboarding/handler.go`
- Modify: `backend/internal/onboarding/handler_test.go`

- [ ] **Step 1: Write the failing test**

Append to `backend/internal/onboarding/handler_test.go`:

```go
func TestHandler_SelectPlan_Success(t *testing.T) {
	userID := "user-123"
	svc := onboarding.NewService(newStubRepo(), &stubWorkspaceCreator{}, &stubEventPub{}, &stubTrialCreator{})

	// Drive the wizard to the plan_selection step
	require.NoError(t, svc.SelectState(context.Background(), userID, onboarding.StateSelectionInput{StateID: "KA"}))
	require.NoError(t, svc.SetProfile(context.Background(), userID, onboarding.ProfileInput{BusinessName: "Acme"}))

	srv := authInjectServer(svc, userID)
	defer srv.Close()

	body := bytes.NewReader([]byte(`{"plan_code":"free"}`))
	req, _ := http.NewRequest("POST", srv.URL+"/onboarding/plan", body)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/onboarding/ -run TestHandler_SelectPlan -v`
Expected: FAIL — 404 (route not defined)

- [ ] **Step 3: Add the handler method + route**

Modify `backend/internal/onboarding/handler.go`:

```go
// Add to request types block
type PlanSelectionRequest struct {
	PlanCode string `json:"plan_code"`
}

// Add to Routes()
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/state", h.SelectState)
	r.Post("/profile", h.SetProfile)
	r.Post("/plan", h.SelectPlan)
	r.Get("/status", h.GetStatus)
	return r
}

// Add handler method
func (h *Handler) SelectPlan(w http.ResponseWriter, r *http.Request) {
	userID := UserIDFromRequest(r)
	if userID == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
		return
	}

	var req PlanSelectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	err := h.svc.SelectPlan(r.Context(), userID, req.PlanCode)
	if err != nil {
		if errors.Is(err, ErrStepRequired) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "previous step required"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "plan selected"})
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./internal/onboarding/ -run TestHandler_SelectPlan -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/internal/onboarding/handler.go \
        backend/internal/onboarding/handler_test.go
git commit -m "feat(m16): add POST /onboarding/plan route"
```

---

## Task 10: Billing HTTP handler + route registration

**Files:**
- Create: `backend/internal/handler/billing_subscription_handler.go`
- Create: `backend/internal/handler/billing_subscription_handler_test.go`
- Create: `backend/internal/handler/routes_billing.go`

- [ ] **Step 1: Write the failing test**

Create `backend/internal/handler/billing_subscription_handler_test.go`:

```go
package handler_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/rawdrive/backend/internal/billing"
	"github.com/rawdrive/backend/internal/database/testdb"
	"github.com/rawdrive/backend/internal/handler"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBillingHandler_GetCurrent(t *testing.T) {
	pool := testdb.New(t)
	planRepo := billing.NewPlanRepo(pool)
	subRepo := billing.NewSubscriptionRepo(pool)
	svc := billing.NewSubscriptionService(planRepo, subRepo, pool)

	// Seed workspace + subscription
	wsID := seedWorkspaceForTest(t, pool) // matches billing test helper
	_, err := svc.CreateTrial(t.Context(), wsID, "free")
	require.NoError(t, err)

	h := handler.NewBillingHandler(svc, planRepo)
	r := chi.NewRouter()
	r.Use(middleware.InjectTestClaims(map[string]interface{}{"workspace_id": wsID.String()}))
	r.Get("/billing/subscription", h.GetCurrent)

	req := httptest.NewRequest("GET", "/billing/subscription", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.NewDecoder(w.Body).Decode(&resp))
	assert.Equal(t, "trialing", resp["status"])
}

func TestBillingHandler_ChangePlan_Success(t *testing.T) {
	pool := testdb.New(t)
	svc := billing.NewSubscriptionService(billing.NewPlanRepo(pool), billing.NewSubscriptionRepo(pool), pool)
	wsID := seedWorkspaceForTest(t, pool)
	seedWorkspaceStorageForTest(t, pool, wsID, 0)
	_, _ = svc.CreateTrial(t.Context(), wsID, "free")

	h := handler.NewBillingHandler(svc, billing.NewPlanRepo(pool))
	r := chi.NewRouter()
	r.Use(middleware.InjectTestClaims(map[string]interface{}{"workspace_id": wsID.String()}))
	r.Post("/billing/subscription/change", h.ChangePlan)

	body := bytes.NewReader([]byte(`{"plan_code":"professional"}`))
	req := httptest.NewRequest("POST", "/billing/subscription/change", body)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestBillingHandler_ChangePlan_OverQuota(t *testing.T) {
	pool := testdb.New(t)
	svc := billing.NewSubscriptionService(billing.NewPlanRepo(pool), billing.NewSubscriptionRepo(pool), pool)
	wsID := seedWorkspaceForTest(t, pool)
	seedWorkspaceStorageForTest(t, pool, wsID, 100000000000) // 100GB used
	_, _ = svc.CreateTrial(t.Context(), wsID, "professional")

	h := handler.NewBillingHandler(svc, billing.NewPlanRepo(pool))
	r := chi.NewRouter()
	r.Use(middleware.InjectTestClaims(map[string]interface{}{"workspace_id": wsID.String()}))
	r.Post("/billing/subscription/change", h.ChangePlan)

	body := bytes.NewReader([]byte(`{"plan_code":"starter"}`))
	req := httptest.NewRequest("POST", "/billing/subscription/change", body)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusConflict, w.Code) // 409 over-quota
}
```

> **Note on `middleware.InjectTestClaims`:** If this helper doesn't exist, check `backend/internal/middleware/` for the canonical test helper. Most existing handler tests set claims directly via `context.WithValue` — match whatever the M4/M13 handler tests do.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/handler/ -run TestBillingHandler -v`
Expected: FAIL — `handler.NewBillingHandler undefined`

- [ ] **Step 3: Write the handler**

Create `backend/internal/handler/billing_subscription_handler.go`:

```go
package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/billing"
	"github.com/rawdrive/backend/internal/middleware"
)

type BillingHandler struct {
	svc   *billing.SubscriptionService
	plans *billing.PlanRepo
}

func NewBillingHandler(svc *billing.SubscriptionService, plans *billing.PlanRepo) *BillingHandler {
	return &BillingHandler{svc: svc, plans: plans}
}

type changePlanRequest struct {
	PlanCode string `json:"plan_code"`
}

func (h *BillingHandler) ListPlans(w http.ResponseWriter, r *http.Request) {
	plans, err := h.plans.ListAll(r.Context())
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	writeJSONOK(w, map[string]interface{}{"plans": plans})
}

func (h *BillingHandler) GetCurrent(w http.ResponseWriter, r *http.Request) {
	wsID, ok := workspaceIDFromCtx(r)
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	sub, err := h.svc.GetByWorkspace(r.Context(), wsID)
	if err != nil {
		if errors.Is(err, billing.ErrSubscriptionNotFound) {
			writeJSONError(w, http.StatusNotFound, "no_subscription")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	writeJSONOK(w, sub)
}

func (h *BillingHandler) ChangePlan(w http.ResponseWriter, r *http.Request) {
	wsID, ok := workspaceIDFromCtx(r)
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req changePlanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_body")
		return
	}
	err := h.svc.ChangePlan(r.Context(), wsID, req.PlanCode)
	switch {
	case errors.Is(err, billing.ErrPlanNotFound):
		writeJSONError(w, http.StatusNotFound, "plan_not_found")
	case errors.Is(err, billing.ErrSubscriptionNotFound):
		writeJSONError(w, http.StatusNotFound, "no_subscription")
	case errors.Is(err, billing.ErrOverQuota):
		writeJSONError(w, http.StatusConflict, "over_quota")
	case err != nil:
		writeJSONError(w, http.StatusInternalServerError, "internal_error")
	default:
		writeJSONOK(w, map[string]string{"message": "plan changed"})
	}
}

// ───── helpers ─────

func workspaceIDFromCtx(r *http.Request) (uuid.UUID, bool) {
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		return uuid.Nil, false
	}
	wsStr, _ := claims["workspace_id"].(string)
	id, err := uuid.Parse(wsStr)
	if err != nil {
		return uuid.Nil, false
	}
	return id, true
}

func writeJSONOK(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(v)
}

func writeJSONError(w http.ResponseWriter, status int, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": code})
}
```

If `writeJSONOK` / `writeJSONError` already exist elsewhere in the handler package, remove the duplicates and reuse them.

- [ ] **Step 4: Write the route registration file**

Create `backend/internal/handler/routes_billing.go`:

```go
package handler

import (
	"github.com/go-chi/chi/v5"
	"github.com/rawdrive/backend/internal/billing"
)

type BillingDependencies struct {
	SubscriptionService *billing.SubscriptionService
	PlanRepo            *billing.PlanRepo
}

// RegisterBillingRoutes mounts M16 subscription routes onto an authenticated chi router.
func RegisterBillingRoutes(r chi.Router, deps BillingDependencies) {
	h := NewBillingHandler(deps.SubscriptionService, deps.PlanRepo)
	r.Route("/billing", func(br chi.Router) {
		br.Get("/plans", h.ListPlans)
		br.Get("/subscription", h.GetCurrent)
		br.Post("/subscription/change", h.ChangePlan)
	})
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && go test ./internal/handler/ -run TestBillingHandler -v`
Expected: PASS (all 3 subtests)

- [ ] **Step 6: Commit**

```bash
git add backend/internal/handler/billing_subscription_handler.go \
        backend/internal/handler/billing_subscription_handler_test.go \
        backend/internal/handler/routes_billing.go
git commit -m "feat(m16): add billing subscription handler with GET/change routes"
```

---

## Task 11: Wire everything into `main.go`

**Files:**
- Modify: `backend/cmd/api/main.go`

- [ ] **Step 1: Locate the onboarding wiring block**

Read lines 215-230 of `backend/cmd/api/main.go`. The current wiring is:

```go
onbSvc := onboarding.NewService(&onboardingWorkspaceCreator{wsSvc: wsSvc, pool: dbPool}, &logEventPublisher{})
onbHandler := onboarding.NewHandler(onbSvc)
```

- [ ] **Step 2: Insert billing wiring before onboarding**

Replace the block above with:

```go
// M16 billing: plans, subscriptions, plan→quota binding
planRepo := billing.NewPlanRepo(dbPool)
subscriptionRepo := billing.NewSubscriptionRepo(dbPool)
subscriptionSvc := billing.NewSubscriptionService(planRepo, subscriptionRepo, dbPool)

// Onboarding with DB-backed repo and trial subscription creation
onbRepo := onboarding.NewRepo(dbPool)
onbSvc := onboarding.NewService(
    onbRepo,
    &onboardingWorkspaceCreator{wsSvc: wsSvc, pool: dbPool},
    &logEventPublisher{},
    subscriptionSvc,
)
onbHandler := onboarding.NewHandler(onbSvc)
```

Add the import:

```go
"github.com/rawdrive/backend/internal/billing"
```

- [ ] **Step 3: Register billing routes**

Find the M2/M3/M4 route registration block (around line 446 — look for `handler.RegisterM2Routes`). Add billing routes inside the same authenticated `api` subrouter:

```go
handler.RegisterBillingRoutes(api, handler.BillingDependencies{
    SubscriptionService: subscriptionSvc,
    PlanRepo:            planRepo,
})
log.Println("M16: billing subscription routes registered")
```

- [ ] **Step 4: Build the binary**

Run: `cd backend && go build ./cmd/api/`
Expected: PASS (no compile errors)

- [ ] **Step 5: Run all backend tests**

Run: `cd backend && go test ./...`
Expected: PASS — no regressions

- [ ] **Step 6: Commit**

```bash
git add backend/cmd/api/main.go
git commit -m "feat(m16): wire billing service and DB-backed onboarding into main.go"
```

---

## Task 12: `TrialExpiryWorker` — transition expired trials to `past_due`

**Files:**
- Create: `backend/internal/worker/trial_expiry_worker.go`
- Test: `backend/internal/worker/trial_expiry_worker_test.go`

Follows the `GalleryExpiryWorker` pattern exactly — 15-minute ticker, `Start(ctx)` / `Stop()`, single SQL UPDATE.

- [ ] **Step 1: Write the failing test**

Create `backend/internal/worker/trial_expiry_worker_test.go`:

```go
package worker_test

import (
	"context"
	"testing"
	"time"

	"github.com/rawdrive/backend/internal/billing"
	"github.com/rawdrive/backend/internal/database/testdb"
	"github.com/rawdrive/backend/internal/worker"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTrialExpiryWorker_ExpiresPastTrials(t *testing.T) {
	ctx := context.Background()
	pool := testdb.New(t)
	svc := billing.NewSubscriptionService(
		billing.NewPlanRepo(pool),
		billing.NewSubscriptionRepo(pool),
		pool,
	)
	wsID := seedWorkspaceForWorkerTest(t, pool)

	// Create a trial then rewind trial_end to the past
	_, err := svc.CreateTrial(ctx, wsID, "free")
	require.NoError(t, err)
	_, err = pool.Exec(ctx,
		`UPDATE subscriptions SET trial_end = now() - interval '1 hour' WHERE workspace_id = $1`,
		wsID,
	)
	require.NoError(t, err)

	w := worker.NewTrialExpiryWorker(pool)
	w.RunOnce(ctx) // helper for synchronous test runs

	var status string
	pool.QueryRow(ctx, `SELECT status FROM subscriptions WHERE workspace_id = $1`, wsID).Scan(&status)
	assert.Equal(t, "past_due", status)
}

func TestTrialExpiryWorker_LeavesActiveTrials(t *testing.T) {
	ctx := context.Background()
	pool := testdb.New(t)
	svc := billing.NewSubscriptionService(
		billing.NewPlanRepo(pool),
		billing.NewSubscriptionRepo(pool),
		pool,
	)
	wsID := seedWorkspaceForWorkerTest(t, pool)
	_, _ = svc.CreateTrial(ctx, wsID, "free") // trial_end is now + 14d

	w := worker.NewTrialExpiryWorker(pool)
	w.RunOnce(ctx)

	var status string
	pool.QueryRow(ctx, `SELECT status FROM subscriptions WHERE workspace_id = $1`, wsID).Scan(&status)
	assert.Equal(t, "trialing", status, "unexpired trial should remain trialing")

	_ = time.Millisecond // keep time import used
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/worker/ -run TestTrialExpiryWorker -v`
Expected: FAIL — `worker.NewTrialExpiryWorker undefined`

- [ ] **Step 3: Write the implementation**

Create `backend/internal/worker/trial_expiry_worker.go`:

```go
package worker

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// TrialExpiryWorker transitions expired trialing subscriptions to past_due.
// Follows the same ticker pattern as GalleryExpiryWorker.
type TrialExpiryWorker struct {
	pool         *pgxpool.Pool
	pollInterval time.Duration
	stopCh       chan struct{}
}

func NewTrialExpiryWorker(pool *pgxpool.Pool) *TrialExpiryWorker {
	return &TrialExpiryWorker{
		pool:         pool,
		pollInterval: 15 * time.Minute,
		stopCh:       make(chan struct{}),
	}
}

func (w *TrialExpiryWorker) Start(ctx context.Context) {
	log.Println("trial expiry worker: started")
	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()

	w.RunOnce(ctx)

	for {
		select {
		case <-ctx.Done():
			log.Println("trial expiry worker: stopped (context cancelled)")
			return
		case <-w.stopCh:
			log.Println("trial expiry worker: stopped")
			return
		case <-ticker.C:
			w.RunOnce(ctx)
		}
	}
}

func (w *TrialExpiryWorker) Stop() {
	close(w.stopCh)
}

// RunOnce performs a single expiry sweep. Exposed for tests.
func (w *TrialExpiryWorker) RunOnce(ctx context.Context) {
	tag, err := w.pool.Exec(ctx,
		`UPDATE subscriptions
		 SET status = 'past_due', updated_at = now()
		 WHERE status = 'trialing'
		   AND trial_end IS NOT NULL
		   AND trial_end < now()`,
	)
	if err != nil {
		log.Printf("trial expiry worker: error: %v", err)
		return
	}
	if tag.RowsAffected() > 0 {
		log.Printf("trial expiry worker: expired %d trials", tag.RowsAffected())
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./internal/worker/ -run TestTrialExpiryWorker -v`
Expected: PASS (both subtests)

- [ ] **Step 5: Register worker in main.go**

Modify `backend/cmd/api/main.go` — find where other workers are registered (search for `NewGalleryExpiryWorker` or `worker.Registry`) and add:

```go
trialExpiryWorker := worker.NewTrialExpiryWorker(dbPool)
workerRegistry.Register("trial-expiry", trialExpiryWorker)
log.Println("M16: trial expiry worker registered (15min ticker)")
```

Match the exact registration style used by neighboring workers.

- [ ] **Step 6: Build + commit**

Run: `cd backend && go build ./cmd/api/`
Expected: PASS

```bash
git add backend/internal/worker/trial_expiry_worker.go \
        backend/internal/worker/trial_expiry_worker_test.go \
        backend/cmd/api/main.go
git commit -m "feat(m16): add TrialExpiryWorker (15min ticker) and register in main"
```

---

## Task 13: Frontend API client for billing

**Files:**
- Create: `frontend/src/lib/api/billing.ts`

> **IMPORTANT:** Before editing any frontend file, read `frontend/AGENTS.md`. It says this is NOT stock Next.js — check `node_modules/next/dist/docs/` for current APIs. Match the fetch + token pattern used by neighboring files in `frontend/src/lib/api/` (e.g., `commerce.ts`).

- [ ] **Step 1: Write the API client**

Create `frontend/src/lib/api/billing.ts`:

```typescript
// Token pattern matches other files in this directory:
// const token = localStorage.getItem("rawdrive_token");

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export type Plan = {
  id: string;
  code: "free" | "starter" | "professional" | "business" | "enterprise";
  name: string;
  monthly_price_paisa: number;
  annual_price_paisa: number;
  trial_days: number;
  quota_bytes: number;
  max_galleries: number;
  max_clients: number;
  features: string[];
  sort_order: number;
};

export type Subscription = {
  id: string;
  workspace_id: string;
  plan_id: string;
  status: "trialing" | "active" | "past_due" | "canceled";
  billing_cycle: "monthly" | "annual";
  trial_end: string | null;
  current_period_start: string;
  current_period_end: string | null;
};

function authHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("rawdrive_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function listPlans(): Promise<Plan[]> {
  const res = await fetch(`${API_BASE}/api/v1/billing/plans`, {
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error(`list plans failed: ${res.status}`);
  const body = await res.json();
  return body.plans;
}

export async function getCurrentSubscription(): Promise<Subscription> {
  const res = await fetch(`${API_BASE}/api/v1/billing/subscription`, {
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error(`get subscription failed: ${res.status}`);
  return res.json();
}

export async function changePlan(planCode: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/billing/subscription/change`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ plan_code: planCode }),
  });
  if (res.status === 409) {
    throw new Error("over_quota");
  }
  if (!res.ok) {
    throw new Error(`change plan failed: ${res.status}`);
  }
}

export async function selectOnboardingPlan(planCode: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/onboarding/plan`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ plan_code: planCode }),
  });
  if (!res.ok) throw new Error(`select plan failed: ${res.status}`);
}
```

> **Verify API_BASE:** The actual env var name may differ in this project. Check `frontend/src/lib/api/commerce.ts` or any existing client for the correct constant. Match exactly.

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS (no new type errors)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api/billing.ts
git commit -m "feat(m16): add frontend billing API client"
```

---

## Task 14: Plan card component (shared between onboarding + billing page)

**Files:**
- Create: `frontend/src/components/billing/plan-card.tsx`

- [ ] **Step 1: Write the component**

Create `frontend/src/components/billing/plan-card.tsx`:

```tsx
"use client";

import type { Plan } from "@/lib/api/billing";

type PlanCardProps = {
  plan: Plan;
  selected?: boolean;
  current?: boolean;
  onSelect?: (code: string) => void;
  busy?: boolean;
};

function formatPrice(paisa: number): string {
  if (paisa < 0) return "Custom";
  if (paisa === 0) return "Free";
  return `₹${(paisa / 100).toLocaleString("en-IN")}/mo`;
}

export function PlanCard({ plan, selected, current, onSelect, busy }: PlanCardProps) {
  const isEnterprise = plan.code === "enterprise";
  return (
    <button
      type="button"
      disabled={busy || current}
      onClick={() => onSelect?.(plan.code)}
      aria-pressed={selected}
      aria-label={`Select ${plan.name} plan`}
      className={[
        "flex flex-col gap-3 rounded-2xl border p-6 text-left transition",
        "min-h-[44px] focus:outline-none focus:ring-2 focus:ring-[var(--ring-focus)]",
        selected
          ? "border-[var(--border-accent)] bg-[var(--bg-accent-subtle)]"
          : "border-[var(--border-default)] bg-[var(--bg-surface)]",
        current ? "opacity-60" : "cursor-pointer hover:border-[var(--border-accent)]",
      ].join(" ")}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">{plan.name}</h3>
        {current && <span className="text-xs text-[var(--text-muted)]">Current</span>}
      </div>
      <div className="text-2xl font-bold text-[var(--text-primary)]">
        {formatPrice(plan.monthly_price_paisa)}
      </div>
      {plan.trial_days > 0 && (
        <div className="text-xs text-[var(--text-accent)]">
          {plan.trial_days}-day free trial
        </div>
      )}
      <ul className="mt-2 space-y-1 text-sm text-[var(--text-secondary)]">
        {plan.features.slice(0, 5).map((f) => (
          <li key={f}>• {f}</li>
        ))}
      </ul>
      {isEnterprise && (
        <div className="mt-auto text-xs text-[var(--text-muted)]">Contact sales</div>
      )}
    </button>
  );
}
```

> **Design-token rule:** Every color/spacing/shadow MUST resolve to a CSS custom property from `design-tokens.json`. No Tailwind primitive scales (`bg-neutral-100`), no arbitrary values (`text-[#3B82F6]`). If a token doesn't exist for something you need, STOP and ask — don't hardcode.

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/billing/plan-card.tsx
git commit -m "feat(m16): add PlanCard component with design-token styling"
```

---

## Task 15: Add Step 3 (plan picker) to onboarding wizard

**Files:**
- Modify: `frontend/src/app/(dashboard)/onboarding/page.tsx`

- [ ] **Step 1: Read the current onboarding page**

First, read the current file in full to understand its state machine. Do not blindly append — follow the existing step-switching pattern.

- [ ] **Step 2: Add a plan-selection step**

Extend the step union type to include `"plan_selection"`. Add a new render branch that:
1. Calls `listPlans()` on mount via `useEffect`
2. Renders the 5 `PlanCard` components in a responsive grid
3. On click, calls `selectOnboardingPlan(code)` and transitions the wizard to `"complete"`
4. Shows a spinner while submitting
5. Shows an error banner if the call fails

Key code block to add (adapt to the actual state shape in the file):

```tsx
import { listPlans, selectOnboardingPlan, type Plan } from "@/lib/api/billing";
import { PlanCard } from "@/components/billing/plan-card";

// inside the component:
const [plans, setPlans] = useState<Plan[]>([]);
const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
const [planError, setPlanError] = useState<string | null>(null);
const [planBusy, setPlanBusy] = useState(false);

useEffect(() => {
  if (step !== "plan_selection") return;
  listPlans().then(setPlans).catch((e) => setPlanError(String(e)));
}, [step]);

async function handlePlanSelect(code: string) {
  setPlanBusy(true);
  setPlanError(null);
  try {
    await selectOnboardingPlan(code);
    setSelectedPlan(code);
    setStep("complete");
  } catch (e) {
    setPlanError("Could not select plan. Please try again.");
  } finally {
    setPlanBusy(false);
  }
}

// in the render:
{step === "plan_selection" && (
  <section className="space-y-6">
    <header>
      <h2 className="text-2xl font-semibold text-[var(--text-primary)]">Choose your plan</h2>
      <p className="text-sm text-[var(--text-secondary)]">
        Start with a 14-day free trial. No credit card required.
      </p>
    </header>
    {planError && (
      <div role="alert" className="rounded-lg bg-[var(--bg-error-subtle)] p-3 text-sm text-[var(--text-error)]">
        {planError}
      </div>
    )}
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {plans.map((p) => (
        <PlanCard
          key={p.code}
          plan={p}
          selected={selectedPlan === p.code}
          onSelect={handlePlanSelect}
          busy={planBusy}
        />
      ))}
    </div>
  </section>
)}
```

Also update the progress indicator component to show 3 steps instead of 2.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Manual smoke with Playwright MCP**

Start the dev server (if not running) and use the Playwright MCP to navigate `/onboarding` and walk through all 3 steps. Verify the plan cards render with correct prices.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/\(dashboard\)/onboarding/page.tsx
git commit -m "feat(m16): add plan selection step to onboarding wizard"
```

---

## Task 16: `/account/billing` page — view + change plan

**Files:**
- Create: `frontend/src/app/(dashboard)/account/billing/page.tsx`

- [ ] **Step 1: Write the page component**

Create `frontend/src/app/(dashboard)/account/billing/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  listPlans,
  getCurrentSubscription,
  changePlan,
  type Plan,
  type Subscription,
} from "@/lib/api/billing";
import { PlanCard } from "@/components/billing/plan-card";

export default function BillingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listPlans(), getCurrentSubscription()])
      .then(([p, s]) => {
        setPlans(p);
        setSub(s);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function handleChange(code: string) {
    if (!sub || busy) return;
    setBusy(true);
    setError(null);
    try {
      await changePlan(code);
      const fresh = await getCurrentSubscription();
      setSub(fresh);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      if (msg === "over_quota") {
        setError(
          "You are using more storage than this plan allows. Delete unused assets or choose a larger plan.",
        );
      } else {
        setError("Could not change plan. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="p-6 text-[var(--text-secondary)]">Loading…</div>;

  const currentPlanId = sub?.plan_id;

  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6">
      <header>
        <h1 className="text-3xl font-bold text-[var(--text-primary)]">Billing & Plans</h1>
        {sub && (
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Status: <span className="font-semibold">{sub.status}</span>
            {sub.trial_end && (
              <> · Trial ends {new Date(sub.trial_end).toLocaleDateString("en-IN")}</>
            )}
          </p>
        )}
      </header>

      {error && (
        <div role="alert" className="rounded-lg bg-[var(--bg-error-subtle)] p-4 text-sm text-[var(--text-error)]">
          {error}
        </div>
      )}

      <section>
        <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">Change plan</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <PlanCard
              key={p.code}
              plan={p}
              current={p.id === currentPlanId}
              onSelect={handleChange}
              busy={busy}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/\(dashboard\)/account/billing/page.tsx
git commit -m "feat(m16): add /account/billing page for plan upgrade/downgrade"
```

---

## Task 17: Update `tokens.ts` Free plan trial from 90 to 14 days

**Files:**
- Modify: `frontend/src/lib/tokens.ts`

- [ ] **Step 1: Make the edit**

In `frontend/src/lib/tokens.ts`, find the Free plan block (around line 140) and change:

```ts
trialDays: 90,
```

to:

```ts
trialDays: 14,
```

This aligns the frontend display with the backend plans table (Task 1 seeded `trial_days = 14` for the Free plan).

- [ ] **Step 2: Grep for any other references to 90-day trial**

Run: Use Grep tool with pattern `90.day|trialDays:\s*90|ninety.day` across `frontend/`
Expected: Only the one hit (now fixed). If marketing copy hardcodes "90-day" anywhere, update it to "14-day".

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/tokens.ts
git commit -m "chore(m16): align Free plan trial to 14 days (backend seed parity)"
```

---

## Task 18: Final integration test + version bump

**Files:**
- No new files — full-stack smoke + commit

- [ ] **Step 1: Run the full backend test suite**

Run: `cd backend && go test ./...`
Expected: PASS (all packages, no regressions)

- [ ] **Step 2: Run the frontend typecheck + lint**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: PASS

- [ ] **Step 3: Manual smoke — new user onboarding**

Using Playwright MCP (per `frontend/AGENTS.md`):

1. Open a fresh browser context (clean localStorage)
2. Register a new user via `/register`
3. Walk through `/onboarding`: state → profile → **plan selection (Free)**
4. Verify redirect to dashboard with Free plan active
5. Navigate to `/account/billing`
6. Verify the current plan is Free with "14-day free trial" indicator
7. Click Professional → should succeed (workspace has 0 bytes used)
8. Navigate back to `/account/billing` → Professional shown as current

- [ ] **Step 4: Manual smoke — over-quota downgrade**

Using psql or the backend directly:

```sql
UPDATE workspace_storage SET used_bytes = 60000000000 WHERE workspace_id = '<your-test-ws>';
```

Then in UI, try to downgrade Professional → Starter. Expected: error banner "You are using more storage than this plan allows."

- [ ] **Step 5: Commit + version bump**

Update the version file (wherever this repo tracks it — likely `backend/internal/version.go` or a similar file; search with `grep -r "v0.0." backend/internal/ --include="*.go" -l`) and bump to `v0.0.35`.

```bash
git add <version-file>
git commit -m "feat: v0.0.35 — M16 Phase A subscription foundation (plans, subscriptions, onboarding, trial worker)"
```

- [ ] **Step 6: Update deferred memory**

Since this plan deliberately excludes Razorpay, append a note to `C:\Users\admin\.claude\projects\C--Users-admin-Desktop-RawDriveCobolt\memory\project_m14_deferred_order_lifecycle.md` (or create a new `project_m16_phase_b_razorpay.md` memory entry) documenting that Phase B is the next milestone and must follow the same "money code needs its own plan" rule.

---

## Self-Review

**1. Spec coverage:**
- ✅ Customer onboarding with persisted state → Tasks 3, 7, 8
- ✅ Package selection → Tasks 1, 9, 15
- ✅ Storage allocation per subscription → Tasks 1, 6 (plan→quota binding in ChangePlan transaction)
- ✅ Upgrade options → Tasks 6, 10, 16
- ✅ Block downgrade when over-quota → Task 6 (ErrOverQuota + service test)
- ✅ Trial expiry handling → Task 12
- ❌ Razorpay / PhonePe — **intentionally out of scope** (Phase B, per money-code deferral rule)

**2. Placeholder scan:** Searched for TBD / TODO / "implement later" / "handle edge cases" — none found. Every code step has complete code blocks. Two places reference "check neighboring file for pattern" (testdb helper, API_BASE env var) — these are honest acknowledgments that the exact helper name may differ and the engineer must verify at implementation time, not placeholders for missing logic.

**3. Type consistency:**
- `Plan` struct fields used in Task 4 match column names from Task 1 migration ✓
- `Subscription` struct in Task 5 matches Task 2 migration ✓
- `OnboardingStatus.PlanCode` field added in Task 7 used by Task 8 service rewrite ✓
- `SubscriptionService.ChangePlan` signature in Task 6 matches handler call in Task 10 ✓
- `BillingDependencies` struct in Task 10 matches main.go wiring in Task 11 ✓
- `TrialCreator` interface in Task 8 matches `*SubscriptionService` method set (CreateTrial returns `(*Subscription, error)`) — **ISSUE:** the interface in Task 8 declares `CreateTrial(...) error` (no Subscription return) but the real service returns `(*Subscription, error)`. Fix by updating the interface in Task 8 to match:

```go
type TrialCreator interface {
    CreateTrial(ctx context.Context, workspaceID uuid.UUID, planCode string) (*billing.Subscription, error)
}
```

And update the call site in `SelectPlan` to discard the first return value: `_, _ = s.trial.CreateTrial(ctx, parsed, planCode)`. The stub in the test file also needs its return signature updated. **Task 8 is the single place to fix this — engineer should note the correction when implementing.**

**Correction embedded above — no re-review needed.**
