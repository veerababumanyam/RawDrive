---
name: saas-practices
aliases: [multi-tenancy, billing, subscriptions, onboarding, metering, workspace, plans]
description: SaaS best practices for RawDrive photography platform. Use when implementing multi-tenancy, subscription features, billing, onboarding, or usage metering.
---

# SaaS Best Practices for RawDrive

## Multi-Tenancy Architecture

RawDrive uses **workspace-scoped multi-tenancy** where all data is isolated by `workspace_id`.

### Key Files

| Purpose | Location |
|---------|----------|
| Workspace middleware | `backend/src/app/middleware/workspace.py` |
| Auth dependencies | `backend/src/app/api/dependencies.py` |
| Workspace service | `backend/src/app/services/workspace_service.py` |
| Billing service | `backend/src/app/services/billing_service.py` |

### Workspace Context Pattern

```python
# backend/src/app/api/dependencies.py

async def get_current_workspace(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> Workspace:
    """Extract workspace from JWT - never trust client input."""
    workspace = await workspace_service.get_by_id(db, user.workspace_id)
    if not workspace or workspace.deleted_at:
        raise HTTPException(403, "Workspace not found or inactive")
    return workspace
```

### Data Isolation (CRITICAL)

```python
# ALWAYS include workspace_id in queries
async def get_galleries(db: AsyncSession, workspace_id: UUID) -> list[Gallery]:
    result = await db.execute(
        select(Gallery)
        .where(Gallery.workspace_id == workspace_id)
        .where(Gallery.deleted_at.is_(None))
    )
    return result.scalars().all()

# WRONG - No workspace isolation
result = await db.execute(select(Gallery).where(Gallery.id == gallery_id))
```

## Subscription Plans

```python
# Plan feature limits
PLAN_FEATURES = {
    "free": {
        "storage_gb": 5,
        "max_photos_per_gallery": 100,
        "max_team_members": 1,
        "ai_analysis_monthly": 0,
        "custom_branding": False,
    },
    "professional": {
        "storage_gb": 500,
        "max_photos_per_gallery": 1000,
        "max_team_members": 10,
        "ai_analysis_monthly": 500,
        "custom_branding": True,
    },
    "enterprise": {
        "storage_gb": -1,  # unlimited
        "max_photos_per_gallery": -1,
        "max_team_members": -1,
        "ai_analysis_monthly": -1,
        "custom_branding": True,
    },
}
```

## Feature Gating

```python
# backend/src/app/api/dependencies.py

def require_feature(feature: str):
    """Dependency to check plan features."""
    async def check_feature(workspace: Workspace = Depends(get_current_workspace)):
        plan = PLAN_FEATURES.get(workspace.plan_slug, PLAN_FEATURES["free"])
        if not plan.get(feature):
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "Feature not available",
                    "upgrade_url": "/settings/billing/upgrade",
                }
            )
        return True
    return Depends(check_feature)

# Usage
@router.post("/branding")
async def update_branding(
    _: bool = require_feature("custom_branding"),
    workspace: Workspace = Depends(get_current_workspace),
):
    ...
```

## Quota Enforcement

```python
# backend/src/app/services/usage_service.py

async def check_storage_quota(
    db: AsyncSession,
    workspace: Workspace,
    new_bytes: int
) -> bool:
    """Check if workspace has storage quota available."""
    current_usage = await get_storage_usage(db, workspace.id)
    plan = PLAN_FEATURES[workspace.plan_slug]
    limit_bytes = plan["storage_gb"] * 1024 * 1024 * 1024

    if limit_bytes == -1:  # unlimited
        return True

    if current_usage + new_bytes > limit_bytes:
        raise HTTPException(
            status_code=402,
            detail={
                "error": "Storage quota exceeded",
                "current": current_usage,
                "limit": limit_bytes,
            }
        )
    return True
```

## Billing Integration

```python
# backend/src/app/services/payment_service.py
import stripe

# Load from env - NEVER hardcode
stripe.api_key = os.environ["STRIPE_SECRET_KEY"]

async def create_subscription(
    workspace_id: UUID,
    plan_id: str,
    payment_method_id: str
) -> Subscription:
    workspace = await workspace_service.get_by_id(workspace_id)

    # Create/get Stripe customer
    customer_id = workspace.stripe_customer_id
    if not customer_id:
        customer = stripe.Customer.create(
            email=workspace.billing_email,
            metadata={"workspace_id": str(workspace_id)}
        )
        customer_id = customer.id

    # Create subscription
    subscription = stripe.Subscription.create(
        customer=customer_id,
        items=[{"price": plan.stripe_price_id}],
        default_payment_method=payment_method_id,
    )

    return subscription
```

## Usage Tracking

```python
# Track usage in Redis for real-time access
async def track_usage(workspace_id: UUID, metric: str, delta: int):
    period_key = f"usage:{workspace_id}:{get_current_month()}"
    await redis.hincrby(period_key, metric, delta)
    await redis.expire(period_key, 35 * 24 * 60 * 60)  # 35 days

# Get current usage
async def get_usage(workspace_id: UUID) -> dict:
    period_key = f"usage:{workspace_id}:{get_current_month()}"
    return await redis.hgetall(period_key)
```

## Onboarding Flow

```python
# backend/src/app/services/onboarding_service.py

ONBOARDING_STEPS = [
    {"id": "profile", "title": "Complete profile"},
    {"id": "branding", "title": "Set up branding"},
    {"id": "first_library", "title": "Create library"},
    {"id": "invite_client", "title": "Invite client"},
]

async def get_onboarding_status(workspace_id: UUID) -> dict:
    progress = await get_progress(workspace_id)
    completed = [s for s in ONBOARDING_STEPS if s["id"] in progress.completed_steps]

    return {
        "steps": ONBOARDING_STEPS,
        "completed": [s["id"] for s in completed],
        "progress_percentage": len(completed) / len(ONBOARDING_STEPS) * 100,
        "is_complete": len(completed) == len(ONBOARDING_STEPS),
    }
```

## Best Practices Checklist

### Multi-Tenancy
- [ ] All queries include `workspace_id` filter
- [ ] Workspace context from JWT, never request body
- [ ] Storage keys prefixed with `workspaces/{workspace_id}/`
- [ ] Cross-workspace access impossible by design

### Billing
- [ ] Webhook handlers are idempotent
- [ ] Payment failures trigger grace period
- [ ] Subscription changes are audited
- [ ] Currency consistent per workspace

### Usage
- [ ] Real-time tracking in Redis
- [ ] Hard limits block operations
- [ ] Soft warnings at 80%, 90%
- [ ] History retained for disputes
