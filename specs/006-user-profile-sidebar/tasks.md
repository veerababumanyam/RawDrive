# Tasks: User Profile & Subscription Integration

**Input**: Design documents from `/specs/006-user-profile-sidebar/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/subscription-api.yaml

**Tests**: Not explicitly requested in specification. Test tasks are NOT included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/app/`, `frontend/src/`
- Paths follow plan.md structure

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and shared dependencies

- [x] T001 Install Razorpay Python SDK in backend/requirements.txt
- [x] T002 [P] Add Razorpay environment variables to .env.example (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET)
- [x] T003 [P] Create frontend/src/services/subscriptionService.ts with empty exports and types

**Checkpoint**: Dependencies installed, environment configured

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema and shared infrastructure that MUST be complete before user stories

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Create database migration 0046_invoices_payment_methods.py in backend/migrations/versions/
- [x] T005 Run migration: `DATABASE_URL="..." PYTHONPATH=src alembic upgrade head`
- [x] T006 [P] Create Invoice SQLAlchemy model in backend/src/app/models/invoice.py (adapted: combined with repository using raw SQL pattern)
- [x] T007 [P] Create PaymentMethod SQLAlchemy model in backend/src/app/models/payment_method.py (adapted: combined with repository using raw SQL pattern)
- [x] T008 [P] Create InvoiceRepository in backend/src/app/repositories/invoice_repository.py
- [x] T009 Create Pydantic schemas for subscription API in backend/src/app/api/schemas.py (SubscriptionStatusResponse, CheckoutRequest, InvoiceResponse)
- [x] T010 Create subscription router skeleton in backend/src/app/api/v1/subscription.py
- [x] T011 Register subscription router in backend/src/app/api/v1/__init__.py

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Access User Profile from Sidebar (Priority: P1)

**Goal**: Add "My Profile" navigation link to workspace sidebar for quick access to user settings (production-ready)

**Independent Test**: Navigate to any workspace page, click "My Profile" in sidebar, verify navigation to `/settings/profile`

### Implementation for User Story 1

- [x] T012 [US1] Add "My Profile" navigation item to System section in frontend/src/components/workspace/WorkspaceSidebar.tsx (already implemented)
- [x] T013 [US1] Add User icon import from lucide-react in frontend/src/components/workspace/WorkspaceSidebar.tsx (already imported)
- [x] T014 [US1] Add tooltip text "Personal settings" for collapsed sidebar state in frontend/src/components/workspace/WorkspaceSidebar.tsx (uses SidebarItem tooltip)
- [x] T015 [US1] Verify navigation to /settings/profile works correctly (path configured correctly)

**Checkpoint**: User Story 1 complete - users can access profile settings from sidebar

---

## Phase 4: User Story 2 - View Current Subscription & Usage (Priority: P1)

**Goal**: Display subscription status with plan details and usage metrics

**Independent Test**: Navigate to `/settings/subscription`, verify current plan, usage bars, and trial status are displayed

### Implementation for User Story 2

- [ ] T016 [P] [US2] Implement GET /workspaces/{id}/subscription endpoint in backend/src/app/api/v1/subscription.py
- [ ] T017 [P] [US2] Add get_subscription_status method to use SubscriptionService in backend/src/app/api/v1/subscription.py
- [ ] T018 [US2] Implement subscriptionService.getStatus() in frontend/src/services/subscriptionService.ts
- [ ] T019 [US2] Create useSubscription React Query hook in frontend/src/hooks/useSubscription.ts
- [ ] T020 [P] [US2] Create UsageCard component for usage metrics in frontend/src/components/subscription/UsageCard.tsx
- [ ] T021 [P] [US2] Create PlanCard component for plan details in frontend/src/components/subscription/PlanCard.tsx
- [ ] T022 [US2] Create SubscriptionSettingsPage in frontend/src/pages/settings/SubscriptionSettingsPage.tsx
- [ ] T023 [US2] Add SubscriptionSettingsPage route to frontend/src/router/routes.tsx
- [ ] T024 [US2] Display trial days remaining with progress indicator in SubscriptionSettingsPage
- [ ] T025 [US2] Add warning banner for cancel_at_period_end status in SubscriptionSettingsPage

**Checkpoint**: User Story 2 complete - users can view subscription status and usage

---

## Phase 5: User Story 3 - Upgrade Subscription Plan (Priority: P2)

**Goal**: Enable plan upgrades via Razorpay checkout integration

**Independent Test**: Click "Upgrade", select a plan, complete test checkout, verify subscription updates

### Implementation for User Story 3

- [ ] T026 [US3] Create RazorpayService in backend/src/app/services/razorpay_service.py
- [ ] T027 [US3] Implement create_checkout_session method in RazorpayService
- [ ] T028 [US3] Implement POST /workspaces/{id}/subscription/checkout endpoint in backend/src/app/api/v1/subscription.py
- [ ] T029 [US3] Implement Razorpay webhook handler POST /webhooks/razorpay in backend/src/app/api/v1/subscription.py
- [ ] T030 [US3] Add webhook signature verification in Razorpay webhook handler
- [ ] T031 [US3] Implement subscriptionService.createCheckoutSession() in frontend/src/services/subscriptionService.ts
- [ ] T032 [P] [US3] Create PlanComparisonCard component in frontend/src/components/subscription/PlanComparisonCard.tsx
- [ ] T033 [P] [US3] Create UpgradeModal component in frontend/src/components/subscription/UpgradeModal.tsx
- [ ] T034 [US3] Add upgrade button and modal trigger to SubscriptionSettingsPage
- [ ] T035 [US3] Implement redirect to Razorpay checkout URL on plan selection
- [ ] T036 [US3] Handle success/error return from Razorpay in SubscriptionSettingsPage
- [ ] T037 [US3] Invalidate subscription query on successful upgrade

**Checkpoint**: User Story 3 complete - users can upgrade their subscription

---

## Phase 6: User Story 4 - Cancel Subscription (Priority: P2)

**Goal**: Enable subscription cancellation with reactivation option

**Independent Test**: Click "Cancel", confirm, verify subscription shows pending cancellation, test reactivation

### Implementation for User Story 4

- [ ] T038 [US4] Implement POST /workspaces/{id}/subscription/cancel endpoint in backend/src/app/api/v1/subscription.py
- [ ] T039 [US4] Implement POST /workspaces/{id}/subscription/reactivate endpoint in backend/src/app/api/v1/subscription.py
- [ ] T040 [US4] Implement subscriptionService.cancel() in frontend/src/services/subscriptionService.ts
- [ ] T041 [US4] Implement subscriptionService.reactivate() in frontend/src/services/subscriptionService.ts
- [ ] T042 [US4] Create CancelSubscriptionModal component in frontend/src/components/subscription/CancelSubscriptionModal.tsx
- [ ] T043 [US4] Add cancellation policy explanation text to CancelSubscriptionModal
- [ ] T044 [US4] Add cancel button and modal trigger to SubscriptionSettingsPage
- [ ] T045 [US4] Add reactivate button when cancel_at_period_end is true in SubscriptionSettingsPage
- [ ] T046 [US4] Show cancellation date when subscription is scheduled to cancel

**Checkpoint**: User Story 4 complete - users can cancel and reactivate subscriptions

---

## Phase 7: User Story 5 - View Billing History & Invoices (Priority: P2)

**Goal**: Display billing history with PDF invoice downloads

**Independent Test**: Navigate to billing history, view invoice list, download a PDF

### Implementation for User Story 5

- [ ] T047 [US5] Implement list_invoices method in backend/src/app/repositories/invoice_repository.py
- [ ] T048 [US5] Implement get_invoice method in backend/src/app/repositories/invoice_repository.py
- [ ] T049 [US5] Implement GET /workspaces/{id}/invoices endpoint in backend/src/app/api/v1/subscription.py
- [ ] T050 [US5] Implement GET /workspaces/{id}/invoices/{id}/pdf endpoint in backend/src/app/api/v1/subscription.py
- [ ] T051 [US5] Generate PDF URL from Razorpay or create redirect to provider invoice
- [ ] T052 [US5] Implement subscriptionService.getInvoices() in frontend/src/services/subscriptionService.ts
- [ ] T053 [US5] Implement subscriptionService.downloadInvoicePdf() in frontend/src/services/subscriptionService.ts
- [ ] T054 [US5] Create InvoiceList component in frontend/src/components/subscription/InvoiceList.tsx
- [ ] T055 [US5] Add invoice table with date, amount, status columns in InvoiceList
- [ ] T056 [US5] Add download PDF button for each invoice in InvoiceList
- [ ] T057 [US5] Add billing history section to SubscriptionSettingsPage
- [ ] T058 [US5] Handle failed payment status display with retry option

**Checkpoint**: User Story 5 complete - users can view and download invoices

---

## Phase 8: User Story 6 - Consolidated User Settings Navigation (Priority: P3)

**Goal**: Add Subscription to settings navigation for consistent UX

**Independent Test**: Navigate through all settings sections, verify Subscription appears and navigation is seamless

### Implementation for User Story 6

- [ ] T059 [US6] Add "Subscription" navigation item to frontend/src/components/layout/SettingsLayout.tsx
- [ ] T060 [US6] Add CreditCard icon import from lucide-react in SettingsLayout.tsx
- [ ] T061 [US6] Verify navigation between all settings sections works without page reload
- [ ] T062 [US6] Add section descriptions to settings navigation items if missing

**Checkpoint**: User Story 6 complete - all settings sections have consistent navigation

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T063 [P] Create SubscriptionBanner component for warning states in frontend/src/components/subscription/SubscriptionBanner.tsx
- [ ] T064 Add SubscriptionBanner to WorkspaceLayout for past_due/expiring states
- [ ] T065 Add ENABLE_SUBSCRIPTION_MANAGEMENT feature flag support
- [ ] T066 [P] Add loading skeletons to SubscriptionSettingsPage
- [ ] T067 [P] Add error states with retry buttons to subscription components
- [ ] T068 Verify all subscription endpoints have proper RBAC checks (billing:read, billing:write)
- [ ] T069 Run quickstart.md validation checklist
- [ ] T070 Update CLAUDE.md with 006-user-profile-sidebar in Active Technologies

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **User Stories (Phase 3-8)**: All depend on Foundational phase completion
  - US1 and US2 are both P1 and can run in parallel
  - US3, US4, US5 are P2 and can run in parallel after US2 (need subscription status)
  - US6 is P3 and can run independently
- **Polish (Phase 9)**: Depends on core user stories (US1-US5) being complete

### User Story Dependencies

- **US1 (P1)**: Independent - Sidebar navigation only
- **US2 (P1)**: Independent - Subscription status display
- **US3 (P2)**: Soft dependency on US2 (uses same page but is independent feature)
- **US4 (P2)**: Soft dependency on US2 (uses same page but is independent feature)
- **US5 (P2)**: Soft dependency on US2 (uses same page but is independent feature)
- **US6 (P3)**: Soft dependency on US2 (adds nav item to existing layout)

### Within Each User Story

- Backend models/repos before endpoints
- Endpoints before frontend services
- Frontend services before components
- Components before page integration

### Parallel Opportunities

- T002, T003 can run in parallel (Setup phase)
- T006, T007, T008 can run in parallel (Models and repos)
- T016, T017 can run in parallel (Backend endpoints)
- T020, T021 can run in parallel (Frontend components)
- T032, T033 can run in parallel (Upgrade components)
- US1 and US2 can run in parallel (both P1, different files)
- US3, US4, US5 can run in parallel (all P2, different features)

---

## Parallel Example: User Story 2

```bash
# Launch backend and frontend in parallel:
Task: "Implement GET /workspaces/{id}/subscription endpoint" (T016)
Task: "Create UsageCard component" (T020)
Task: "Create PlanCard component" (T021)

# Then sequential:
Task: "Create SubscriptionSettingsPage" (T022) - depends on components
```

---

## Implementation Strategy

### Full Production Delivery

All phases must be completed for production release:

1. **Phase 1: Setup** - Dependencies and environment
2. **Phase 2: Foundational** - Database schema and shared infrastructure (BLOCKS all user stories)
3. **Phase 3-8: All User Stories** - Complete US1-US6 in priority order
4. **Phase 9: Polish** - Warning banners, loading states, error handling, RBAC verification

### Execution Order

1. Complete Setup + Foundational - Foundation ready
2. Complete US1 + US2 (P1) - Sidebar access and subscription view
3. Complete US3 (P2) - Plan upgrades via Razorpay
4. Complete US4 (P2) - Subscription cancellation/reactivation
5. Complete US5 (P2) - Invoice history and PDF downloads
6. Complete US6 (P3) - Settings navigation integration
7. Complete Polish phase - Production-ready error handling, loading states, RBAC

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 (sidebar) + US6 (nav polish)
   - Developer B: US2 (subscription status) + US3 (upgrade)
   - Developer C: US4 (cancel) + US5 (invoices)
3. All stories complete and integrate for production release

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Frontend uses React Query for data fetching - invalidate cache on mutations
- Backend uses existing SubscriptionService for business logic
- Razorpay webhook must verify signatures for security
