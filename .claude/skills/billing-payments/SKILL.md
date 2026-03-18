---
name: billing-payments
description: "Stripe and Razorpay payment integration, subscription management, plan tiers, webhooks, and billing service patterns for RawDrive. Use this skill when working with payments, subscriptions, invoices, plan creation, Stripe/Razorpay webhooks, pricing, trial management, or the billing-service microservice. Also use for subscription lifecycle (trialing, active, past_due, canceled), plan limits (storage, galleries, AI credits), or multi-currency support (INR/USD). Triggers on: billing, payment, Stripe, Razorpay, subscription, invoice, plan, pricing, trial, checkout, webhook payment, currency."
---

# Billing & Payments

RawDrive uses **Stripe (primary)** + **Razorpay (secondary)** with multi-currency support (INR + USD).

## Subscription Plans

| Plan Code | Features |
|-----------|----------|
| `STARTER` | Basic storage, limited galleries |
| `PROFESSIONAL` | More storage, AI credits, custom branding |
| `STUDIO` | Full features, priority support |
| `ENTERPRISE` | Unlimited, custom pricing |

### Plan Model Fields
```python
class SubscriptionPlan:
    code: PlanCode  # STARTER, PROFESSIONAL, STUDIO, ENTERPRISE
    status: PlanStatus  # ACTIVE, DEPRECATED, ARCHIVED

    # Pricing (dual currency)
    price_monthly: Decimal      # INR
    price_annual: Decimal       # INR
    price_monthly_usd: Decimal  # USD
    price_annual_usd: Decimal   # USD

    # Limits (enforce in services)
    storage_bytes: int
    max_galleries: int
    max_clients: int
    max_team_members: int
    ai_credits_monthly: int

    # Feature flags
    watermark_enabled: bool
    custom_branding_enabled: bool
    priority_support: bool

    # Stripe integration
    stripe_product_id: str
    stripe_price_id_monthly: str
    stripe_price_id_annual: str
```

## Subscription Lifecycle

```
TRIALING → ACTIVE → (PAST_DUE → ACTIVE) or CANCELED → EXPIRED
                  → PAUSED → ACTIVE
```

| Status | Meaning |
|--------|---------|
| `TRIALING` | Free trial period |
| `ACTIVE` | Paying customer |
| `PAST_DUE` | Payment failed, grace period |
| `CANCELED` | User canceled, access until period end |
| `EXPIRED` | Access revoked |
| `PAUSED` | Temporarily suspended |
| `INCOMPLETE` | Requires payment action (3D Secure) |

## Billing Service Architecture

```
services/billing-service/src/
├── api/v1/
│   ├── subscription.py     # Subscription CRUD
│   └── webhooks.py          # Stripe/Razorpay webhook handlers
├── repositories/
│   ├── subscription_repository.py
│   ├── plan_repository.py
│   ├── invoice_repository.py
│   └── payment_transaction_repository.py
├── config.py
├── database.py
├── redis_client.py
└── main.py
```

## Stripe Webhook Handling

```python
@router.post("/webhooks/stripe")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    # Verify webhook signature (CRITICAL - prevents spoofing)
    event = stripe.Webhook.construct_event(
        payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
    )

    match event["type"]:
        case "checkout.session.completed":
            await handle_checkout_completed(event["data"]["object"])
        case "invoice.payment_succeeded":
            await handle_payment_succeeded(event["data"]["object"])
        case "invoice.payment_failed":
            await handle_payment_failed(event["data"]["object"])
        case "customer.subscription.updated":
            await handle_subscription_updated(event["data"]["object"])
        case "customer.subscription.deleted":
            await handle_subscription_deleted(event["data"]["object"])

    return {"status": "ok"}
```

## Enforcing Plan Limits

```python
# In services, check limits before allowing actions
async def check_gallery_limit(workspace_id: UUID, db: AsyncSession):
    subscription = await subscription_repo.get_active(workspace_id)
    plan = await plan_repo.get_by_id(subscription.plan_id)

    current_count = await gallery_repo.count(workspace_id)
    if current_count >= plan.max_galleries:
        raise HTTPException(403, detail={
            "code": "PLAN_LIMIT_REACHED",
            "message": f"Your {plan.code} plan allows {plan.max_galleries} galleries",
            "upgrade_url": "/settings/billing"
        })
```

## Security Rules

- Never log full card numbers or payment tokens
- Verify webhook signatures before processing
- Store `stripe_customer_id` on workspace, not user (multi-tenant)
- Idempotency keys on all payment API calls
- PCI compliance: never handle raw card data (use Stripe Elements/Checkout)

**Deep dive:** Read `.claude/reference/billing-payments-best-practices.md`
