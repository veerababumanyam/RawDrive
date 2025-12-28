# Research: User Profile & Subscription Integration

**Feature**: 006-user-profile-sidebar
**Date**: 2025-12-28

## Research Questions

### 1. Sidebar Navigation Structure

**Question**: How should user profile settings be integrated into the existing workspace sidebar?

**Findings**:
- Current sidebar (`WorkspaceSidebar.tsx`) has "System" section with: Settings, Company Profile, Help
- User settings pages exist at `/settings/*` but are NOT linked from sidebar
- The SettingsLayout component (`SettingsLayout.tsx`) already has navigation for user settings sections

**Decision**: Add "My Profile" link in workspace sidebar under System section, navigating to `/settings/profile`

**Rationale**:
- Maintains existing sidebar pattern (adding new item to System section)
- Leverages existing SettingsLayout for user settings navigation
- Clear separation: workspace settings vs personal settings

**Alternatives Rejected**:
- Dropdown menu from avatar: Less discoverable, breaks existing pattern
- Separate user menu section: Too much visual complexity

---

### 2. Backend Subscription API Availability

**Question**: What subscription management APIs already exist in the backend?

**Findings**:
The `SubscriptionService` (backend/src/app/services/subscription_service.py) provides:
- `get_subscription_status()` - Full status with plan, usage, trial info
- `list_plans()` - All available plans
- `change_plan()` - Upgrade/downgrade
- `cancel_subscription()` - With cancel-at-period-end option
- `check_tier_limit()` - Usage limit checking
- `consume_ai_credits()` - AI credit consumption

Existing API endpoints:
- `GET /api/v1/billing/plans` - List plans
- Workspace endpoints include subscription info in responses

**Missing APIs** (need to be created):
- `GET /api/v1/workspaces/{id}/subscription` - Detailed subscription status
- `POST /api/v1/workspaces/{id}/subscription/cancel` - Cancel subscription
- `POST /api/v1/workspaces/{id}/subscription/reactivate` - Reactivate canceled subscription
- `GET /api/v1/workspaces/{id}/invoices` - List invoices
- `GET /api/v1/workspaces/{id}/invoices/{id}/pdf` - Download invoice PDF
- Payment provider integration endpoints (Razorpay checkout session)

**Decision**: Create new subscription management endpoints using existing SubscriptionService

**Rationale**: Backend service logic exists; only API layer and frontend needed

---

### 3. Payment Provider Integration

**Question**: Which payment provider(s) should be integrated and how?

**Findings**:
- CLAUDE.md mentions Razorpay (primary for India) and Stripe (optional)
- payments_billing_subscriptions.json spec defines Razorpay integration patterns
- No existing payment integration code found in backend
- SubscriptionService has `billing_provider` and `billing_subscription_id` fields

**Decision**: Implement Razorpay Checkout integration for Indian market (primary user base)

**Rationale**:
- Razorpay is better for INR payments and Indian compliance (GST)
- Checkout mode provides hosted payment page (simpler integration)
- Backend stores `billing_subscription_id` for webhook reconciliation

**Alternatives Rejected**:
- Stripe: Secondary priority, can be added later
- Custom payment form: More complex, PCI compliance burden

---

### 4. Invoice Generation

**Question**: How should invoice PDF generation be implemented?

**Findings**:
- No existing invoice generation code
- Razorpay provides invoice functionality
- GST compliance required for India

**Decision**: Use Razorpay Invoices API for invoice generation

**Rationale**:
- Razorpay handles GST-compliant invoices automatically
- Reduces implementation complexity
- Invoices stored in Razorpay dashboard for audit

**Alternatives Rejected**:
- Custom PDF generation: Additional library dependencies, GST calculation complexity

---

### 5. Frontend Subscription Service Pattern

**Question**: How should the frontend subscription service be structured?

**Findings**:
- Frontend services follow singleton pattern with TypeScript
- API calls use `api.ts` base client with interceptors
- React Query is used for data fetching and caching

**Decision**: Create `subscriptionService.ts` following existing patterns

**Rationale**: Consistency with existing codebase patterns

**Implementation Pattern**:
```typescript
// subscriptionService.ts
export interface SubscriptionStatus {
  plan: Plan;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
  is_trial: boolean;
  trial_days_remaining: number | null;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  usage: UsageStats;
}

export const subscriptionService = {
  getStatus: (workspaceId: string) => api.get<SubscriptionStatus>(`/workspaces/${workspaceId}/subscription`),
  getPlans: () => api.get<Plan[]>('/billing/plans'),
  cancel: (workspaceId: string) => api.post(`/workspaces/${workspaceId}/subscription/cancel`),
  reactivate: (workspaceId: string) => api.post(`/workspaces/${workspaceId}/subscription/reactivate`),
  createCheckoutSession: (workspaceId: string, planId: string) => api.post<{checkout_url: string}>(`/workspaces/${workspaceId}/subscription/checkout`, { plan_id: planId }),
  getInvoices: (workspaceId: string) => api.get<Invoice[]>(`/workspaces/${workspaceId}/invoices`),
};
```

---

### 6. Warning Banner Implementation

**Question**: How should subscription warning banners be displayed?

**Findings**:
- App layout uses `WorkspaceLayout.tsx` with header area
- Toast system exists for notifications
- No existing global banner system

**Decision**: Add conditional banner component in WorkspaceLayout above main content

**Rationale**:
- Persistent visibility until user takes action
- Follows common SaaS patterns
- Non-blocking (user can continue working)

**Implementation**:
- `SubscriptionBanner.tsx` component
- Displays for: trial_expiring (< 7 days), past_due, expired states
- Contextual message with CTA button

---

## Summary of New Components Needed

### Backend
1. `backend/src/app/api/v1/subscription.py` - New subscription management endpoints
2. `backend/src/app/services/razorpay_service.py` - Razorpay integration
3. Database table: `invoices` (if not using Razorpay-stored invoices)

### Frontend
1. `frontend/src/services/subscriptionService.ts` - Subscription API client
2. `frontend/src/pages/settings/SubscriptionSettingsPage.tsx` - Subscription management UI
3. `frontend/src/components/subscription/SubscriptionBanner.tsx` - Warning banners
4. `frontend/src/components/subscription/PlanComparisonCard.tsx` - Plan upgrade cards
5. `frontend/src/components/subscription/UsageCard.tsx` - Usage statistics display
6. `frontend/src/components/subscription/InvoiceList.tsx` - Invoice history
7. `frontend/src/hooks/useSubscription.ts` - React Query hook for subscription data

### Sidebar Update
1. Modify `WorkspaceSidebar.tsx` to add "My Profile" link
2. Modify `SettingsLayout.tsx` to add "Subscription" navigation item

## Dependencies

- Razorpay SDK for payment integration
- Existing SubscriptionService for business logic
- React Query for data fetching (already in use)
- lucide-react icons (already in use)
