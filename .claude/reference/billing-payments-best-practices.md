# Billing & Payments Best Practices

A guide for integrating Stripe/Razorpay and managing subscriptions in the `billing-service`.

---

## 1. Data Model

### Separation of Concerns
Billing data should stay in `billing-service` database updates.
*   `Customer`: Links `workspace_id` to `stripe_customer_id`.
*   `Subscription`: Status, plan, interval, expiration.
*   `Invoice`: History of payments.

**Don't** store sensitive card data. Store only the 4 last digits and brand for UI display.

---

## 2. Integration Patterns (Stripe/Razorpay)

### Checkout Session (Hosted)
Prefer hosted checkout pages over building custom UI components for PCI compliance simplification.
1.  Client clicks "Upgrade".
2.  Backend calls `stripe.checkout.sessions.create()`.
3.  Client redirects to Stripe URL.
4.  Success/Cancel URL redirects back to RawDrive.

### Idempotency
Payment APIs are sensitive. Use `Idempotency-Key` headers for all modification requests to the payment gateway to prevent double charging on retry.

---

## 3. Webhook Handling

Payment confirmation happens asynchronously via webhooks.

### Security
*   **Signature Verification:** MANDATORY. Verify the `Stripe-Signature` or `X-Razorpay-Signature` header to prevent spoofing.
*   **Secrets:** Rotate webhook signing secrets periodically.

### Processing
1.  **Receive:** Endpoint accepts payload, verifies signature immediately.
2.  **Ack:** Return `200 OK` instantly to the provider.
3.  **Process:** Queue the event (Redis/BullMQ) for async processing ("Update Subscription in DB", "Send Email"). **Do not process logic in the webhook handler directly.**

### Chaos Engineering
*   Test for **Duplicate Events**: Providers guarantee "at least once" delivery. Your handler must be idempotent (check `event_id` before processing).
*   Test for **Out of Order**: `invoice.paid` might arrive before `subscription.created` in rare cases. Handle gracefully.

---

## 4. Subscription Lifecycle

### Grace Periods
*   If auto-renewal fails (card expired), do not lock account immediately.
*   Enter `past_due` state for 3-7 days.
*   Retry payment logic (handled by Stripe settings).

### Upgrades/Downgrades
*   **Proration:** Handle pro-rated charges when switching plans mid-cycle.
*   **Downgrade:** If usage (storage used) > new plan limit, block downgrade until user frees up space.

---

## 5. India-Specific (RBI Guidelines)

If using Razorpay/Stripe India:
*   **e-mandate:** Recurring payments require special registration (e-mandate) flow with AFA (Additional Factor of Authentication).
*   **Pre-debit Notification:** User must be notified 24h before charge. (Handled by the Gateway usually, but verify settings).
