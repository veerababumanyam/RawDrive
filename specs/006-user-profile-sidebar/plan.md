# Implementation Plan: User Profile & Subscription Integration

**Branch**: `006-user-profile-sidebar` | **Date**: 2025-12-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-user-profile-sidebar/spec.md`

## Summary

Add "My Profile" link to workspace sidebar and implement comprehensive subscription management UI. The user profile settings pages already exist at `/settings/*` but are not accessible from the workspace sidebar. Backend subscription service exists with core functionality, but API endpoints and frontend subscription management (status display, upgrade flow, cancellation, invoices) are missing.

**Technical Approach**:
1. Add sidebar navigation link to existing user settings
2. Create subscription management API endpoints using existing SubscriptionService
3. Integrate Razorpay for payment processing (primary for India market)
4. Build frontend subscription management UI with React Query

## Technical Context

**Language/Version**: Python 3.11+ (Backend FastAPI), TypeScript 5.2+ (Frontend React 18.3)
**Primary Dependencies**: FastAPI 0.115+, React 18.3, SQLAlchemy 2.0+, asyncpg 0.29+, Razorpay SDK, React Query, TailwindCSS
**Storage**: PostgreSQL 16 (new tables: invoices, payment_methods)
**Testing**: pytest (backend), Vitest + React Testing Library (frontend)
**Target Platform**: Web application (responsive)
**Project Type**: web
**Performance Goals**: API p95 < 250ms, subscription status cached 5 minutes
**Constraints**: GST-compliant invoicing for India, Razorpay webhook reliability
**Scale/Scope**: Supports existing multi-tenant workspace model

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| Minimal scope | PASS | Leverages existing user settings pages and SubscriptionService |
| Existing patterns | PASS | Follows established sidebar navigation, React Query, API patterns |
| No new frameworks | PASS | Only adds Razorpay SDK (required for payment integration) |
| Security first | PASS | Uses existing workspace isolation and RBAC patterns |

## Project Structure

### Documentation (this feature)

```text
specs/006-user-profile-sidebar/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research decisions
├── data-model.md        # Database schema (invoices, payment_methods)
├── quickstart.md        # Implementation guide with phases
├── contracts/
│   └── subscription-api.yaml  # OpenAPI 3.0 subscription endpoints
└── checklists/
    └── requirements.md  # Quality validation checklist
```

### Source Code (repository root)

```text
backend/
├── src/app/
│   ├── api/v1/
│   │   └── subscription.py        # NEW: Subscription management endpoints
│   ├── services/
│   │   ├── subscription_service.py  # EXISTING: Core subscription logic
│   │   └── razorpay_service.py      # NEW: Razorpay integration
│   └── repositories/
│       └── invoice_repository.py    # NEW: Invoice data access
├── migrations/versions/
│   └── 0046_invoices_payment_methods.py  # NEW: Database migration
└── tests/

frontend/
├── src/
│   ├── components/
│   │   ├── workspace/
│   │   │   └── WorkspaceSidebar.tsx  # MODIFY: Add "My Profile" link
│   │   ├── layout/
│   │   │   └── SettingsLayout.tsx    # MODIFY: Add Subscription nav item
│   │   └── subscription/             # NEW: Subscription UI components
│   │       ├── PlanComparisonCard.tsx
│   │       ├── UsageCard.tsx
│   │       ├── InvoiceList.tsx
│   │       ├── CancelSubscriptionModal.tsx
│   │       └── SubscriptionBanner.tsx
│   ├── pages/settings/
│   │   └── SubscriptionSettingsPage.tsx  # NEW: Main subscription page
│   ├── services/
│   │   └── subscriptionService.ts    # NEW: Subscription API client
│   └── hooks/
│       └── useSubscription.ts        # NEW: React Query hook
└── tests/
```

**Structure Decision**: Web application structure with backend FastAPI (Python) and frontend React (TypeScript). Follows existing monorepo conventions with clear separation between backend API and frontend UI.

## Complexity Tracking

No constitution violations requiring justification.

## Implementation Phases

### Phase 1: Sidebar Navigation (P1) - Low Risk

**Goal**: Add "My Profile" link to workspace sidebar

**Files**:
- `frontend/src/components/workspace/WorkspaceSidebar.tsx` (modify)

**Verification**: Click "My Profile" in sidebar navigates to `/settings/profile`

---

### Phase 2: Subscription Status API & UI (P1) - Medium Risk

**Goal**: Display subscription status with usage metrics

**Files**:
- `backend/src/app/api/v1/subscription.py` (new)
- `frontend/src/services/subscriptionService.ts` (new)
- `frontend/src/hooks/useSubscription.ts` (new)
- `frontend/src/pages/settings/SubscriptionSettingsPage.tsx` (new)
- `frontend/src/components/subscription/UsageCard.tsx` (new)

**Verification**: Navigate to `/settings/subscription`, see plan and usage metrics

---

### Phase 3: Plan Upgrade Flow (P2) - High Risk

**Goal**: Razorpay checkout integration for plan upgrades

**Files**:
- `backend/src/app/services/razorpay_service.py` (new)
- `backend/src/app/api/v1/subscription.py` (modify - add checkout endpoint)
- `frontend/src/components/subscription/PlanComparisonCard.tsx` (new)
- `frontend/src/components/subscription/UpgradeModal.tsx` (new)

**Verification**: Complete test checkout via Razorpay, subscription updates

---

### Phase 4: Subscription Cancellation (P2) - Medium Risk

**Goal**: Cancel and reactivate subscription

**Files**:
- `backend/src/app/api/v1/subscription.py` (modify - add cancel/reactivate)
- `frontend/src/components/subscription/CancelSubscriptionModal.tsx` (new)

**Verification**: Cancel subscription, see scheduled cancellation, reactivate before period end

---

### Phase 5: Invoice History (P2) - Medium Risk

**Goal**: Display billing history with PDF downloads

**Files**:
- `backend/migrations/versions/0046_invoices_payment_methods.py` (new)
- `backend/src/app/repositories/invoice_repository.py` (new)
- `frontend/src/components/subscription/InvoiceList.tsx` (new)

**Verification**: View invoice list, download PDF

---

### Phase 6: Settings Navigation Integration (P3) - Low Risk

**Goal**: Add Subscription to settings navigation

**Files**:
- `frontend/src/components/layout/SettingsLayout.tsx` (modify)
- `frontend/src/router/routes.tsx` (modify)

**Verification**: Subscription appears in settings nav, navigation works

## Generated Artifacts

| Artifact | Path | Description |
|----------|------|-------------|
| Feature Specification | `specs/006-user-profile-sidebar/spec.md` | 6 user stories, 14 requirements |
| Research Document | `specs/006-user-profile-sidebar/research.md` | 6 research decisions |
| Data Model | `specs/006-user-profile-sidebar/data-model.md` | invoices, payment_methods schema |
| API Contract | `specs/006-user-profile-sidebar/contracts/subscription-api.yaml` | OpenAPI 3.0 spec |
| Quickstart Guide | `specs/006-user-profile-sidebar/quickstart.md` | Implementation phases |
| Requirements Checklist | `specs/006-user-profile-sidebar/checklists/requirements.md` | Quality validation |

## Next Steps

1. Run `/speckit.tasks` to generate implementation tasks from this plan
2. Or proceed directly with implementation following quickstart.md phases
