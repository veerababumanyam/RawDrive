# Data Model: User Profile & Subscription Integration

**Feature**: 006-user-profile-sidebar
**Date**: 2025-12-28

## Entities

### Existing Entities (No Changes Required)

#### users
User personal information for user profile settings. Already has all required fields.

| Field | Type | Description |
|-------|------|-------------|
| user_id | UUID | Primary key |
| email | VARCHAR(255) | User email |
| display_name | VARCHAR(100) | Display name |
| avatar_url | TEXT | Avatar URL |
| job_title | VARCHAR(100) | Job title |
| phone | VARCHAR(50) | Phone number |
| timezone | VARCHAR(50) | IANA timezone |
| bio | TEXT | Short biography |
| email_verified | BOOLEAN | Email verification status |
| preferred_language | VARCHAR(10) | Language preference |
| last_password_changed_at | TIMESTAMP | Password change timestamp |
| deletion_requested_at | TIMESTAMP | Account deletion request timestamp |
| created_at | TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | Last update timestamp |

#### plans
Subscription plan definitions. Already exists with all required fields.

| Field | Type | Description |
|-------|------|-------------|
| plan_id | UUID | Primary key |
| code | VARCHAR(50) | Plan code (free, starter, professional, etc.) |
| name | VARCHAR(100) | Display name |
| price_monthly | DECIMAL(10,2) | Monthly price |
| price_annual | DECIMAL(10,2) | Annual price |
| currency | VARCHAR(3) | Currency code (INR, USD) |
| storage_bytes | BIGINT | Storage limit |
| max_galleries | INT | Gallery limit |
| max_clients | INT | Client limit |
| max_team_members | INT | Team member limit |
| ai_credits_monthly | INT | AI credits per month |
| features | JSONB | Feature flags |

#### workspace_subscriptions
Workspace subscription status. Already exists with all required fields.

| Field | Type | Description |
|-------|------|-------------|
| subscription_id | UUID | Primary key |
| workspace_id | UUID | FK to workspaces |
| plan_id | UUID | FK to plans |
| status | VARCHAR(20) | trialing/active/past_due/canceled/expired |
| trial_started_at | TIMESTAMP | Trial start |
| trial_expires_at | TIMESTAMP | Trial expiration |
| current_period_start | TIMESTAMP | Current billing period start |
| current_period_end | TIMESTAMP | Current billing period end |
| cancel_at_period_end | BOOLEAN | Scheduled for cancellation |
| billing_provider | VARCHAR(20) | razorpay/stripe |
| billing_subscription_id | VARCHAR(100) | External subscription ID |
| created_at | TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | Last update timestamp |

---

### New Entities

#### invoices
Billing invoice records for invoice history and PDF download.

| Field | Type | Description |
|-------|------|-------------|
| invoice_id | UUID | Primary key |
| workspace_id | UUID | FK to workspaces |
| subscription_id | UUID | FK to workspace_subscriptions |
| invoice_number | VARCHAR(50) | Human-readable invoice number |
| external_id | VARCHAR(100) | Razorpay/Stripe invoice ID |
| amount | DECIMAL(10,2) | Invoice amount |
| currency | VARCHAR(3) | Currency code |
| tax_amount | DECIMAL(10,2) | GST/tax amount |
| status | VARCHAR(20) | pending/paid/failed/refunded |
| billing_period_start | DATE | Period covered start |
| billing_period_end | DATE | Period covered end |
| pdf_url | TEXT | PDF download URL (or null if generated on-demand) |
| paid_at | TIMESTAMP | Payment timestamp |
| created_at | TIMESTAMP | Creation timestamp |
| metadata | JSONB | Additional data (line items, GST details) |

**Indexes**:
- `idx_invoices_workspace_id` on `workspace_id`
- `idx_invoices_subscription_id` on `subscription_id`
- `idx_invoices_external_id` on `external_id`

**Constraints**:
- FK to workspaces (workspace_id)
- FK to workspace_subscriptions (subscription_id)
- UNIQUE on invoice_number

---

#### payment_methods
Stored payment methods for subscription management.

| Field | Type | Description |
|-------|------|-------------|
| payment_method_id | UUID | Primary key |
| workspace_id | UUID | FK to workspaces |
| provider | VARCHAR(20) | razorpay/stripe |
| external_id | VARCHAR(100) | Provider payment method ID |
| type | VARCHAR(20) | card/upi/netbanking |
| last_four | VARCHAR(4) | Last 4 digits (for cards) |
| brand | VARCHAR(20) | Card brand (visa/mastercard) |
| expiry_month | INT | Card expiry month |
| expiry_year | INT | Card expiry year |
| is_default | BOOLEAN | Default payment method |
| created_at | TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | Last update timestamp |

**Indexes**:
- `idx_payment_methods_workspace_id` on `workspace_id`
- `idx_payment_methods_external_id` on `external_id`

**Constraints**:
- FK to workspaces (workspace_id)
- UNIQUE on (workspace_id, provider, external_id)

---

## Entity Relationships

```
users (1) ─────────┐
                   │
                   ▼
workspaces (N) ◄───┼───► workspace_subscriptions (1)
                   │              │
                   │              ▼
                   │         plans (N:1)
                   │
                   ├───────► invoices (N)
                   │
                   └───────► payment_methods (N)
```

## State Transitions

### Subscription Status

```
                    ┌─────────────────────────┐
                    │                         │
                    ▼                         │
┌─────────┐    ┌────────┐    ┌────────────┐  │
│ trialing│───►│ active │───►│cancel_at_  │──┤
└─────────┘    └────────┘    │period_end  │  │
     │              │        └────────────┘  │
     │              │              │         │
     ▼              ▼              ▼         │
┌─────────┐    ┌────────┐    ┌─────────┐    │
│ expired │    │past_due│───►│ canceled│◄───┘
└─────────┘    └────────┘    └─────────┘
                    │
                    ▼
               ┌────────┐
               │ active │  (after payment)
               └────────┘
```

**Transitions**:
- `trialing` → `active`: First payment success
- `trialing` → `expired`: Trial period ends without payment
- `active` → `cancel_at_period_end`: User requests cancellation
- `cancel_at_period_end` → `canceled`: Period ends
- `cancel_at_period_end` → `active`: User reactivates
- `active` → `past_due`: Payment fails
- `past_due` → `active`: Payment success
- `past_due` → `canceled`: Grace period ends

### Invoice Status

```
┌─────────┐    ┌──────┐
│ pending │───►│ paid │
└─────────┘    └──────┘
     │
     ▼
┌─────────┐    ┌──────────┐
│ failed  │───►│ refunded │
└─────────┘    └──────────┘
```

## Validation Rules

### Invoices
- `amount` must be >= 0
- `currency` must be valid ISO currency code
- `billing_period_end` must be >= `billing_period_start`
- `invoice_number` must be unique across all invoices

### Payment Methods
- `expiry_year` must be >= current year
- `last_four` must be exactly 4 digits for cards
- Only one `is_default = true` per workspace

## Migration

New migration file: `0046_invoices_payment_methods.py`

```python
def upgrade():
    # Create invoices table
    op.create_table(
        'invoices',
        sa.Column('invoice_id', UUID(), primary_key=True),
        sa.Column('workspace_id', UUID(), nullable=False),
        sa.Column('subscription_id', UUID(), nullable=True),
        sa.Column('invoice_number', sa.String(50), nullable=False, unique=True),
        sa.Column('external_id', sa.String(100), nullable=True),
        sa.Column('amount', sa.Numeric(10, 2), nullable=False),
        sa.Column('currency', sa.String(3), nullable=False, default='INR'),
        sa.Column('tax_amount', sa.Numeric(10, 2), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, default='pending'),
        sa.Column('billing_period_start', sa.Date(), nullable=True),
        sa.Column('billing_period_end', sa.Date(), nullable=True),
        sa.Column('pdf_url', sa.Text(), nullable=True),
        sa.Column('paid_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=func.now()),
        sa.Column('metadata', JSONB(), nullable=True),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.workspace_id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['subscription_id'], ['workspace_subscriptions.subscription_id'], ondelete='SET NULL'),
    )
    op.create_index('idx_invoices_workspace_id', 'invoices', ['workspace_id'])
    op.create_index('idx_invoices_external_id', 'invoices', ['external_id'])

    # Create payment_methods table
    op.create_table(
        'payment_methods',
        sa.Column('payment_method_id', UUID(), primary_key=True),
        sa.Column('workspace_id', UUID(), nullable=False),
        sa.Column('provider', sa.String(20), nullable=False),
        sa.Column('external_id', sa.String(100), nullable=False),
        sa.Column('type', sa.String(20), nullable=False),
        sa.Column('last_four', sa.String(4), nullable=True),
        sa.Column('brand', sa.String(20), nullable=True),
        sa.Column('expiry_month', sa.Integer(), nullable=True),
        sa.Column('expiry_year', sa.Integer(), nullable=True),
        sa.Column('is_default', sa.Boolean(), default=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=func.now()),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=func.now()),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.workspace_id'], ondelete='CASCADE'),
        sa.UniqueConstraint('workspace_id', 'provider', 'external_id', name='uq_payment_methods_workspace_provider_external'),
    )
    op.create_index('idx_payment_methods_workspace_id', 'payment_methods', ['workspace_id'])
```
