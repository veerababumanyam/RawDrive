# Quickstart: User Profile & Subscription Integration

**Feature**: 006-user-profile-sidebar
**Date**: 2025-12-28

## Prerequisites

Before starting implementation, ensure:

1. **Development environment** is set up with Docker running:
   ```bash
   npm run docker:dev:up
   ```

2. **Database migrations** are current:
   ```bash
   cd backend && DATABASE_URL="postgresql://rawdrive:rawdrive@localhost:5432/rawdrive" PYTHONPATH=src alembic upgrade head
   ```

3. **Razorpay test account** is configured (for payment integration):
   - Sign up at https://dashboard.razorpay.com/
   - Get test mode API keys
   - Add to `.env`:
     ```
     RAZORPAY_KEY_ID=rzp_test_xxx
     RAZORPAY_KEY_SECRET=xxx
     RAZORPAY_WEBHOOK_SECRET=xxx
     ```

## Implementation Order

### Phase 1: Sidebar Navigation (P1)

**Goal**: Add "My Profile" link to workspace sidebar

**Files to modify**:
1. `frontend/src/components/workspace/WorkspaceSidebar.tsx`

**Steps**:
```typescript
// In WorkspaceSidebar.tsx, add to System section items:
{
  label: 'My Profile',
  icon: User,
  href: '/settings/profile',
  tooltip: 'Personal settings',
}
```

**Verify**:
- Navigate to any workspace page
- Click "My Profile" in sidebar
- Should navigate to `/settings/profile`

---

### Phase 2: Subscription Status Page (P1)

**Goal**: Display subscription status with usage metrics

**Files to create**:
1. `backend/src/app/api/v1/subscription.py` - API endpoints
2. `frontend/src/services/subscriptionService.ts` - API client
3. `frontend/src/pages/settings/SubscriptionSettingsPage.tsx` - UI page
4. `frontend/src/hooks/useSubscription.ts` - React Query hook

**Backend endpoint** (`subscription.py`):
```python
@router.get("/api/v1/workspaces/{workspace_id}/subscription")
async def get_subscription_status(
    workspace_id: UUID,
    current_user: CurrentUserDep,
    subscription_service: SubscriptionServiceDep,
) -> SubscriptionStatusResponse:
    # Verify user has access to workspace
    # Call subscription_service.get_subscription_status()
    # Return formatted response
```

**Frontend hook** (`useSubscription.ts`):
```typescript
export function useSubscription(workspaceId: string) {
  return useQuery({
    queryKey: ['subscription', workspaceId],
    queryFn: () => subscriptionService.getStatus(workspaceId),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
```

**Verify**:
- Navigate to `/settings/subscription`
- See current plan name and price
- See usage metrics (storage, galleries, etc.)
- See trial days remaining (if applicable)

---

### Phase 3: Plan Upgrade Flow (P2)

**Goal**: Allow users to upgrade subscription plans

**Files to create**:
1. `backend/src/app/services/razorpay_service.py` - Razorpay integration
2. `frontend/src/components/subscription/PlanComparisonCard.tsx` - Plan cards
3. `frontend/src/components/subscription/UpgradeModal.tsx` - Upgrade modal

**Backend checkout endpoint**:
```python
@router.post("/api/v1/workspaces/{workspace_id}/subscription/checkout")
async def create_checkout_session(
    workspace_id: UUID,
    request: CheckoutRequest,
    current_user: CurrentUserDep,
    razorpay_service: RazorpayServiceDep,
) -> CheckoutSessionResponse:
    # Create Razorpay subscription/order
    # Return checkout URL
```

**Razorpay webhook** (handle payment success):
```python
@router.post("/api/v1/webhooks/razorpay")
async def razorpay_webhook(request: Request):
    # Verify signature
    # Handle payment.captured event
    # Update workspace_subscriptions
```

**Verify**:
- Click "Upgrade" on subscription page
- See plan comparison
- Select a plan
- Complete Razorpay test checkout
- Return to app with updated subscription

---

### Phase 4: Subscription Cancellation (P2)

**Goal**: Allow users to cancel subscription

**Files to modify**:
1. `backend/src/app/api/v1/subscription.py` - Add cancel/reactivate endpoints
2. `frontend/src/components/subscription/CancelSubscriptionModal.tsx` - Confirmation modal

**Verify**:
- Click "Cancel Subscription"
- See confirmation with policy explanation
- Confirm cancellation
- See "Cancellation scheduled" status
- Test reactivation before period end

---

### Phase 5: Invoice History (P2)

**Goal**: Display billing history with PDF downloads

**Files to create**:
1. Database migration: `0046_invoices_payment_methods.py`
2. `backend/src/app/repositories/invoice_repository.py`
3. `frontend/src/components/subscription/InvoiceList.tsx`

**Verify**:
- Navigate to Billing History section
- See list of past invoices
- Click "Download" on any invoice
- PDF downloads with GST details

---

### Phase 6: Settings Navigation Integration (P3)

**Goal**: Add Subscription to user settings navigation

**Files to modify**:
1. `frontend/src/components/layout/SettingsLayout.tsx`
2. `frontend/src/router/routes.tsx`

**Add to SettingsLayout**:
```typescript
{
  label: 'Subscription',
  href: '/settings/subscription',
  icon: CreditCard,
}
```

**Add route**:
```typescript
{
  path: '/settings/subscription',
  element: <SubscriptionSettingsPage />,
}
```

**Verify**:
- Navigate between all settings sections
- Subscription appears in navigation
- Consistent navigation experience

---

## Testing Checklist

### Unit Tests
- [ ] SubscriptionService methods
- [ ] RazorpayService integration
- [ ] Invoice repository queries

### Integration Tests
- [ ] Subscription status endpoint returns correct data
- [ ] Checkout session creation
- [ ] Webhook processing
- [ ] Invoice PDF generation

### E2E Tests
- [ ] Full upgrade flow with test payment
- [ ] Cancellation and reactivation flow
- [ ] Invoice download

### Manual Testing
- [ ] Sidebar navigation works in collapsed state
- [ ] Usage progress bars show correct percentages
- [ ] Trial countdown displays correctly
- [ ] Warning banners appear for trial expiring/past_due

---

## Common Issues

### Razorpay Webhook Not Receiving Events
- Ensure webhook URL is publicly accessible (use ngrok for local dev)
- Verify webhook secret matches
- Check Razorpay dashboard for failed deliveries

### Subscription Status Not Updating
- Verify webhook is processing correctly
- Check database for updated `workspace_subscriptions` record
- Invalidate React Query cache after webhook

### PDF Download Fails
- Verify Razorpay invoice exists
- Check for GST compliance issues
- Ensure PDF URL hasn't expired

---

## Environment Variables

Add to `.env` for full functionality:

```env
# Razorpay (required for payments)
RAZORPAY_KEY_ID=rzp_test_xxx
RAZORPAY_KEY_SECRET=xxx
RAZORPAY_WEBHOOK_SECRET=xxx

# Feature flags (optional)
ENABLE_SUBSCRIPTION_MANAGEMENT=true
```
