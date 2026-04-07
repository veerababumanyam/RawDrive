# Technical Requirements: Razorpay Integration

**Document Status:** Draft v1.0  
**Ownership:** Billing / Platform  
**Stack:** Go API, React/Vite frontend, PostgreSQL `payments` table  
**Related Systems:** PhonePe checkout, billing subscriptions, payment status page

---

## 1. Objective
Add **Razorpay** as an additional payment provider alongside **PhonePe** for subscription checkout without breaking the existing PhonePe flow.

The implementation must:
- Preserve PhonePe as an available provider.
- Let users choose PhonePe or Razorpay at checkout.
- Store gateway-specific order and payment references in the existing billing data model.
- Verify Razorpay payments server-side before marking subscriptions active.
- Support webhook-based reconciliation for both providers.

---

## 2. Scope

### In Scope
- Backend checkout session creation for Razorpay.
- Frontend provider selection between PhonePe and Razorpay.
- Razorpay order creation using server-side credentials.
- Razorpay payment signature verification endpoint.
- Razorpay webhook endpoint for payment reconciliation.
- Payment status lookup for both PhonePe and Razorpay.
- `.env` and `.env.example` support for Razorpay credentials.

### Out of Scope
- International multi-currency settlement changes.
- Refund automation through Razorpay.
- Full onboarding-flow rewrite to replace the legacy placeholder payment page.
- Mandate/subscription-recurring billing through Razorpay Subscriptions API.

---

## 3. Functional Requirements

### FR-1 Provider Selection
Authenticated users starting a paid-plan checkout must be able to choose `phonepe` or `razorpay`.

### FR-2 Backward Compatibility
If no provider is supplied, the system must default to `phonepe`.

### FR-3 Razorpay Order Creation
For Razorpay checkout, the backend must create a Razorpay order using `amount`, `currency`, and a server-generated receipt/session ID.

### FR-4 Server-Side Verification
The backend must verify the Razorpay success payload using the payment signature before treating the payment as valid.

### FR-5 Subscription Activation
Subscriptions must only be activated after a successful payment state is confirmed from the provider.

### FR-6 Status Tracking
The frontend payment-status view must be able to query payment status for both providers.

### FR-7 Auditability
The existing `payments` record must retain:
- Internal session/idempotency key
- Provider name
- Provider order/transaction reference
- Gateway response payload
- Plan ID metadata

### FR-8 Webhook Reconciliation
The backend must expose a public Razorpay webhook endpoint and validate `X-Razorpay-Signature` using a dedicated webhook secret.

---

## 4. Architecture

### 4.1 Existing Baseline
The current billing flow already contains:
- `POST /api/v1/billing/checkout`
- `GET /api/v1/billing/payments/{txnId}/status`
- PhonePe webhook handling
- PostgreSQL `payments` storage with `provider`, `provider_payment_ref`, and `metadata`

### 4.2 Target Design
The billing service becomes a **multi-provider orchestration layer**:
- `phonepe` remains redirect-based.
- `razorpay` uses server-created orders plus frontend checkout modal.
- Provider-specific references are stored in the same order/payment record.
- Subscription activation remains centralized in the billing service.

### 4.3 Data Model Strategy
No schema migration is required immediately because `payments` already supports:
- `provider`
- `provider_payment_ref`
- `metadata`

Implementation detail:
- `provider` stores `phonepe` or `razorpay`.
- `provider_payment_ref` stores:
  - PhonePe merchant transaction ID
  - Razorpay order ID
- `metadata` stores:
  - `idempotency_key`
  - `plan_id`
  - `gateway_order_id`
  - `razorpay_payment_id`
  - `payment_method`
  - gateway response snapshots

### 4.4 Security Model
- Razorpay `key_secret` is used only server-side.
- Razorpay checkout signature is verified on the backend.
- Webhooks require a separate `RAZORPAY_WEBHOOK_SECRET`.
- Frontend only receives `key_id`, `gateway_order_id`, amount, currency, and display metadata.

---

## 5. API Contracts

### 5.1 Checkout Creation
`POST /api/v1/billing/checkout`

Request:
```json
{
  "plan_id": "uuid",
  "billing_cycle": "monthly",
  "payment_provider": "razorpay",
  "success_url": "https://app.rawdrive.in/settings/subscription",
  "cancel_url": "https://app.rawdrive.in/settings/subscription"
}
```

PhonePe response:
```json
{
  "provider": "phonepe",
  "checkout_url": "https://...",
  "session_id": "RD-12345678",
  "expires_at": "2026-04-06T12:00:00Z"
}
```

Razorpay response:
```json
{
  "provider": "razorpay",
  "session_id": "RD-12345678",
  "gateway_order_id": "order_ABC123",
  "key_id": "rzp_live_xxx",
  "amount": 99900,
  "currency": "INR",
  "merchant_name": "RawDrive",
  "description": "RawDrive Professional plan",
  "expires_at": "2026-04-06T12:00:00Z"
}
```

### 5.2 Razorpay Verification
`POST /api/v1/billing/razorpay/verify`

Request:
```json
{
  "session_id": "RD-12345678",
  "razorpay_order_id": "order_ABC123",
  "razorpay_payment_id": "pay_DEF456",
  "razorpay_signature": "signature"
}
```

Response:
```json
{
  "verified": true,
  "provider": "razorpay",
  "session_id": "RD-12345678",
  "order_id": "uuid",
  "transaction_id": "pay_DEF456",
  "state": "captured"
}
```

### 5.3 Status API
`GET /api/v1/billing/payments/{txnId}/status?provider=razorpay`

The API must normalize provider-specific states into the existing frontend contract:
- `PAYMENT_SUCCESS`
- `PAYMENT_PENDING`
- `PAYMENT_ERROR`
- `PAYMENT_DECLINED`
- `PAYMENT_CANCELLED`

### 5.4 Razorpay Webhook
`POST /api/v1/billing/razorpay/webhook`

Supported events:
- `payment.captured`
- `payment.failed`
- `order.paid`

---

## 6. UI / UX Design

### 6.1 Checkout Selector
The plan-upgrade modal must expose a simple provider choice:
- `PhonePe` for UPI-first checkout
- `Razorpay` for UPI, cards, net banking, and wallets

### 6.2 Razorpay Experience
- Backend creates the order.
- Frontend loads `https://checkout.razorpay.com/v1/checkout.js`.
- Frontend opens Razorpay hosted checkout.
- Successful payment calls backend verification before redirecting the user.

### 6.3 Status Experience
The payment-status page must:
- Read `provider` from query params.
- Poll the shared status endpoint.
- Use provider-aware copy in the loading state.

### 6.4 Error States
Users must see clear recoverable messages for:
- Checkout script load failure
- Razorpay modal dismiss/cancel
- Signature verification failure
- Provider status lookup failure

---

## 7. Environment & Secrets

Required variables:
```env
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
RAZORPAY_MERCHANT_NAME=RawDrive
```

Implementation note:
- `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are now wired into local `.env`.
- `RAZORPAY_WEBHOOK_SECRET` still needs the webhook secret from the Razorpay dashboard before production webhooks can be verified.

---

## 8. Delivery Plan

### Phase 1
- Add provider enum and provider-aware checkout request/response contracts.
- Store provider metadata in billing orders.

### Phase 2
- Add Razorpay Go client and backend order creation.
- Add Razorpay verification and webhook endpoints.
- Extend status lookup for Razorpay.

### Phase 3
- Add frontend provider selector.
- Add Razorpay checkout modal flow.
- Update payment-status page for provider awareness.

### Phase 4
- Configure live webhook secret in the dashboard and `.env`.
- Run end-to-end checkout validation in staging and production.

---

## 9. Acceptance Criteria
- Users can choose PhonePe or Razorpay in the upgrade flow.
- PhonePe checkout still redirects exactly as before.
- Razorpay checkout opens hosted checkout and verifies payment server-side.
- Paid subscriptions activate after successful Razorpay verification.
- Status page works for both `phonepe` and `razorpay`.
- All billing-domain tests pass after the integration.

---

## 10. Operational Notes
- Live credentials must stay only in local/prod secret storage and never in committed templates.
- Webhook replay handling is currently idempotent through order-status updates, but a dedicated event ledger can be added later for stricter deduplication.
- Refunds, partial captures, and recurring mandates should be handled as a follow-up milestone if the business wants Razorpay to replace PhonePe for renewals.
