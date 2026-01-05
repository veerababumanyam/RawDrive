# Billing & Subscription Management

## Business Value Proposition

Billing & Subscription Management enables RawDrive to monetize the platform through flexible subscription plans, usage-based billing, and India-first payment processing with Razorpay and Stripe integration.

### Key Business Benefits
- **Revenue Generation**: Monetize platform through subscriptions
- **India-First**: Razorpay integration (UPI, card, netbanking)
- **Global Payments**: Stripe for international payments
- **GST Compliance**: GST-compliant invoicing for India
- **Usage Tracking**: Track usage against quotas
- **Trial Management**: 30-day trial with conversion tracking

> **Reference Documentation**:
> - `.kiro/steering/product.md` - Product overview with pricing tiers
> - `docs/Features/DATA_RETENTION_AND_CUSTOMER_REMOVAL.md` - Retention policies

---

## Subscription Plans

### Tier Structure

| Tier | Storage | Galleries | Users | AI Credits | Price (INR) |
|------|---------|-----------|-------|------------|-------------|
| Starter | 10 GB | 10 | 1 | 100/mo | ₹499/mo |
| Professional | 100 GB | 50 | 3 | 500/mo | ₹1,499/mo |
| Business | 1 TB | Unlimited | 10 | 2,000/mo | ₹3,999/mo |
| Enterprise | Unlimited | Unlimited | Unlimited | Custom | Custom |

### Trial Period
- 30-day free trial with Business-tier features
- No credit card required to start
- Full feature access during trial
- Conversion tracking and re-engagement emails

---

## Key Capabilities

### Payment Processing

**Razorpay (India Primary)**:
- UPI payments
- Credit/debit cards
- Netbanking
- Wallets (Paytm, PhonePe)
- EMI options
- Recurring subscriptions

**Stripe (International)**:
- Credit/debit cards
- Apple Pay, Google Pay
- SEPA Direct Debit
- Recurring subscriptions

### Invoice Management

**GST Compliance**:
- GSTIN validation
- HSN/SAC codes
- GST calculation (CGST, SGST, IGST)
- E-invoicing support
- GST return data export

**Invoice Features**:
- Automatic generation
- PDF download
- Email delivery
- Invoice history
- Custom branding

### Usage Tracking

**Tracked Metrics**:
- Storage used (bytes)
- Gallery count
- User count
- AI credits consumed
- API calls (Business+)

**Quota Enforcement**:
- Soft limits with warnings (75%, 90%)
- Hard limits with blocking (100%)
- Overage charges (optional)
- Usage alerts via email

### Subscription Management

- Plan selection and comparison
- Upgrade/downgrade with proration
- Cancellation with grace period
- Pause subscription (up to 3 months)
- Automatic renewal

---

## Technical Architecture

### Backend Services

```
subscription_service.py
├── Subscription CRUD
├── Plan selection
├── Upgrade/downgrade
├── Cancellation
└── Renewal management

razorpay_service.py
├── Payment creation
├── Payment verification
├── Webhook handling
├── Subscription management
└── Refund processing

stripe_service.py
├── Payment intent creation
├── Webhook handling
├── Subscription management
└── Refund processing

invoice_service.py
├── Invoice generation
├── GST calculation
├── PDF generation
├── Email delivery
└── Invoice history

usage_tracking_service.py
├── Track usage metrics
├── Calculate quotas
├── Generate alerts
├── Enforce limits
└── Usage analytics
```

### API Endpoints

```
# Subscription
GET    /api/v1/subscription              # Get current subscription
POST   /api/v1/subscription              # Create subscription
PUT    /api/v1/subscription              # Update subscription
DELETE /api/v1/subscription              # Cancel subscription

GET    /api/v1/subscription/plans        # List available plans
POST   /api/v1/subscription/upgrade      # Upgrade plan
POST   /api/v1/subscription/downgrade    # Downgrade plan

# Billing
GET    /api/v1/billing/invoices          # List invoices
GET    /api/v1/billing/invoices/{id}     # Get invoice
GET    /api/v1/billing/invoices/{id}/pdf # Download PDF

GET    /api/v1/billing/payment-methods   # List payment methods
POST   /api/v1/billing/payment-methods   # Add payment method
DELETE /api/v1/billing/payment-methods/{id}

# Usage
GET    /api/v1/usage                     # Get current usage
GET    /api/v1/usage/history             # Usage history

# Webhooks
POST   /api/v1/webhooks/razorpay         # Razorpay webhooks
POST   /api/v1/webhooks/stripe           # Stripe webhooks
```

### Database Schema

```sql
subscriptions
├── id (UUID)
├── workspace_id (UUID)
├── plan_id (UUID)
├── status (VARCHAR) - 'active', 'paused', 'cancelled', 'expired'
├── current_period_start (TIMESTAMPTZ)
├── current_period_end (TIMESTAMPTZ)
├── cancel_at (TIMESTAMPTZ)
├── created_at (TIMESTAMPTZ)
└── metadata (JSONB)

subscription_plans
├── id (UUID)
├── name (VARCHAR)
├── price_monthly (DECIMAL)
├── price_annual (DECIMAL)
├── currency (VARCHAR)
├── storage_limit (BIGINT)
├── gallery_limit (INTEGER)
├── user_limit (INTEGER)
├── ai_credits (INTEGER)
├── features (JSONB)
└── is_active (BOOLEAN)

invoices
├── id (UUID)
├── workspace_id (UUID)
├── invoice_number (VARCHAR)
├── amount (DECIMAL)
├── tax_amount (DECIMAL)
├── total_amount (DECIMAL)
├── currency (VARCHAR)
├── status (VARCHAR)
├── gstin (VARCHAR)
├── issued_at (TIMESTAMPTZ)
├── paid_at (TIMESTAMPTZ)
└── metadata (JSONB)

payments
├── id (UUID)
├── workspace_id (UUID)
├── invoice_id (UUID)
├── amount (DECIMAL)
├── payment_provider (VARCHAR)
├── provider_payment_id (VARCHAR)
├── status (VARCHAR)
├── created_at (TIMESTAMPTZ)
└── metadata (JSONB)

usage_tracking
├── id (UUID)
├── workspace_id (UUID)
├── metric_name (VARCHAR)
├── usage_amount (BIGINT)
├── quota_limit (BIGINT)
├── period_start (TIMESTAMPTZ)
├── period_end (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)
```

---

## Integration Points

- **All Features**: Plan-based feature access and quotas
- **Storage**: Storage quota based on plan
- **AI Features**: AI credits allocation per plan
- **Authentication**: User limits per plan
- **Analytics**: Revenue and subscription metrics

---

## Business Metrics

- **MRR/ARR**: Monthly/Annual Recurring Revenue
- **Churn Rate**: % of customers churning
- **Trial Conversion**: % of trials converting to paid
- **ARPU**: Average Revenue Per User
- **LTV:CAC Ratio**: Lifetime value to acquisition cost

---

## Implementation Status

- Completed: Subscription management, Razorpay integration, invoice generation
- In Progress: Stripe integration, usage-based billing
- Planned: GST e-invoicing, dunning management
