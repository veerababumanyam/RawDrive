# Pricing Model

## Overview

The RawDrive pricing model defines subscription tiers, feature availability, pricing strategy, and revenue optimization. This document provides comprehensive pricing information and business logic.

## Purpose

The pricing model serves to:
- **Define Value**: Communicate tier value proposition
- **Optimize Revenue**: Maximize customer lifetime value
- **Enable Growth**: Support business scaling
- **Ensure Fairness**: Transparent pricing
- **Reduce Churn**: Provide value at each tier
- **Support Compliance**: Locked tier specifications

---

## Subscription Tiers

### Tier Overview

RawDrive offers five subscription tiers with increasing features and capacity.

**Tier Comparison:**

| Feature | Free | Starter | Professional | Business | Enterprise |
|---------|------|---------|--------------|----------|-----------|
| **Price** | $0 | $9.99/mo | $29.99/mo | $99.99/mo | Custom |
| **Billing** | N/A | Monthly | Monthly | Monthly | Annual |
| **Storage** | 1 GB | 10 GB | 100 GB | 1 TB | Unlimited |
| **Galleries** | 3 | 10 | 50 | 200 | Unlimited |
| **Clients** | 5 | 20 | 100 | 500 | Unlimited |
| **Team Members** | 1 | 1 | 1 | 5 | Unlimited |
| **AI Credits/mo** | 10 | 100 | 500 | 2,000 | Unlimited |

### Free Tier

Entry-level tier for photographers getting started.

**Free Tier Details:**
```typescript
interface FreeTier {
  price: 0,
  billingCycle: null,
  features: {
    storage: 1_000_000_000, // 1 GB
    galleries: 3,
    clients: 5,
    teamMembers: 1,
    aiCredits: 10,
    customBranding: false,
    customDomain: false,
    clientDownloads: false,
    printDesigner: false,
    faceRecognition: false,
    videoSupport: false,
    apiAccess: false,
    prioritySupport: false,
  },
  limitations: {
    maxPhotoSize: 10_000_000, // 10 MB
    maxUploadPerDay: 100,
    maxGallerySize: 100_000_000, // 100 MB
    noCommercialUse: false,
  },
}
```

**Free Tier Use Cases:**
- Hobbyist photographers
- Portfolio building
- Testing platform
- Small personal projects

**Upgrade Incentives:**
- Reach storage limit
- Reach gallery limit
- Reach client limit
- Need custom branding
- Need print designer

### Starter Tier

Professional tier for active photographers.

**Starter Tier Details:**
```typescript
interface StarterTier {
  price: 9.99,
  billingCycle: 'monthly',
  features: {
    storage: 10_000_000_000, // 10 GB
    galleries: 10,
    clients: 20,
    teamMembers: 1,
    aiCredits: 100,
    customBranding: true,
    customDomain: false,
    clientDownloads: true,
    printDesigner: false,
    faceRecognition: true,
    videoSupport: true,
    apiAccess: false,
    prioritySupport: false,
  },
}
```

**Starter Tier Use Cases:**
- Active photographers
- Regular client work
- Small studios
- Growing businesses

**Upgrade Path:**
- Reach storage limit (10 GB)
- Need custom domain
- Need print designer
- Need API access

### Professional Tier

Advanced tier for established photographers.

**Professional Tier Details:**
```typescript
interface ProfessionalTier {
  price: 29.99,
  billingCycle: 'monthly',
  features: {
    storage: 100_000_000_000, // 100 GB
    galleries: 50,
    clients: 100,
    teamMembers: 1,
    aiCredits: 500,
    customBranding: true,
    customDomain: true,
    clientDownloads: true,
    printDesigner: true,
    faceRecognition: true,
    videoSupport: true,
    apiAccess: false,
    prioritySupport: false,
  },
}
```

**Professional Tier Use Cases:**
- Established photographers
- Multiple concurrent projects
- Print album sales
- Custom branding needs

**Upgrade Path:**
- Need team collaboration
- Need API access
- Need unlimited resources

### Business Tier

Enterprise tier for studios and agencies.

**Business Tier Details:**
```typescript
interface BusinessTier {
  price: 99.99,
  billingCycle: 'monthly',
  features: {
    storage: 1_000_000_000_000, // 1 TB
    galleries: 200,
    clients: 500,
    teamMembers: 5,
    aiCredits: 2000,
    customBranding: true,
    customDomain: true,
    clientDownloads: true,
    printDesigner: true,
    faceRecognition: true,
    videoSupport: true,
    apiAccess: true,
    prioritySupport: true,
  },
}
```

**Business Tier Use Cases:**
- Photography studios
- Agencies
- Multi-photographer teams
- High-volume operations

**Upgrade Path:**
- Need unlimited resources
- Need white-label solution
- Need dedicated support

### Enterprise Tier

Custom tier for large organizations.

**Enterprise Tier Details:**
```typescript
interface EnterpriseTier {
  price: 'custom',
  billingCycle: 'annual',
  features: {
    storage: Infinity,
    galleries: Infinity,
    clients: Infinity,
    teamMembers: Infinity,
    aiCredits: Infinity,
    customBranding: true,
    customDomain: true,
    clientDownloads: true,
    printDesigner: true,
    faceRecognition: true,
    videoSupport: true,
    apiAccess: true,
    prioritySupport: true,
    whiteLabelOption: true,
    dedicatedSupport: true,
    customIntegrations: true,
    sso: true,
  },
}
```

**Enterprise Tier Use Cases:**
- Large photography networks
- White-label solutions
- Custom integrations
- Dedicated support needs

---

## Pricing Strategy

### Pricing Model

RawDrive uses a value-based pricing model with tiered features.

**Pricing Principles:**
1. **Value-Based**: Price reflects value delivered
2. **Tiered**: Multiple tiers for different needs
3. **Transparent**: Clear pricing, no hidden fees
4. **Competitive**: Competitive with market rates
5. **Scalable**: Pricing scales with usage
6. **Fair**: Proportional value at each tier

### Annual Billing Discount

Encourage annual billing with discount.

**Annual Discount:**
```typescript
interface AnnualDiscount {
  monthlyPrice: 9.99,
  annualPrice: 99.99, // 16.7% discount
  savings: 19.89,
  savingsPercent: 16.7,
}

// Calculation
// Monthly: $9.99 × 12 = $119.88
// Annual: $99.99
// Savings: $19.89 (16.7%)
```

**Annual Billing Benefits:**
- Lower cost for customers
- Predictable revenue for business
- Reduced churn
- Improved cash flow

### Volume Discounts

Offer discounts for large teams.

**Team Discounts:**
```typescript
interface TeamDiscount {
  teamSize: number,
  discountPercent: number,
}

// Example
{
  1-5: 0,
  6-10: 10,
  11-20: 15,
  21-50: 20,
  50+: 25,
}
```

**Team Discount Calculation:**
```
Base price: $99.99/month
Team size: 10 members
Discount: 15%
Discounted price: $99.99 × 0.85 = $84.99/month
```

### Promotional Pricing

Limited-time promotions to drive growth.

**Promotion Types:**
```typescript
interface Promotion {
  // Discount
  discountPercent: number,
  discountAmount: number,
  
  // Duration
  startDate: Date,
  endDate: Date,
  
  // Eligibility
  newCustomersOnly: boolean,
  specificTiers: string[],
  
  // Limits
  maxUses: number,
  maxPerCustomer: number,
}

// Example: New customer promotion
{
  discountPercent: 50,
  duration: 3, // months
  newCustomersOnly: true,
  maxUses: 1000,
}
```

---

## Feature Pricing

### AI Credits

AI features consume credits.

**AI Credit System:**
```typescript
interface AICredits {
  // Monthly allocation
  free: 10,
  starter: 100,
  professional: 500,
  business: 2000,
  enterprise: Infinity,
  
  // Credit costs
  photoAnalysis: 1,
  faceDetection: 2,
  captionGeneration: 1,
  storyGeneration: 5,
  albumDesignSuggestion: 3,
  
  // Rollover
  unusedCreditsRollover: true,
  rolloverMonths: 3,
  maxRollover: 300,
}
```

**Credit Usage Example:**
```
Monthly allocation: 100 credits

Usage:
- Analyze 50 photos: 50 credits
- Detect faces in 20 photos: 40 credits
- Generate 2 stories: 10 credits

Total used: 100 credits
Remaining: 0 credits
```

### Add-On Pricing

Purchase additional resources.

**Add-On Options:**
```typescript
interface AddOns {
  // Storage
  extraStorage: {
    amount: 100_000_000_000, // 100 GB
    price: 4.99,
    billingCycle: 'monthly',
  },
  
  // AI Credits
  extraAICredits: {
    amount: 100,
    price: 9.99,
    billingCycle: 'monthly',
  },
  
  // Team Members
  extraTeamMember: {
    price: 9.99,
    billingCycle: 'monthly',
  },
  
  // Priority Support
  prioritySupport: {
    price: 19.99,
    billingCycle: 'monthly',
  },
}
```

---

## Revenue Model

### Monthly Recurring Revenue (MRR)

Calculate MRR from subscriptions.

**MRR Calculation:**
```typescript
interface MRRCalculation {
  // Subscriptions
  freeUsers: 10000,
  starterUsers: 5000,
  professionalUsers: 2000,
  businessUsers: 500,
  enterpriseUsers: 50,
  
  // Revenue
  starterMRR: 5000 × $9.99 = $49,950
  professionalMRR: 2000 × $29.99 = $59,980
  businessMRR: 500 × $99.99 = $49,995
  enterpriseMRR: 50 × $5000 = $250,000
  
  // Total
  totalMRR: $409,925
}
```

### Annual Recurring Revenue (ARR)

Calculate ARR from subscriptions.

**ARR Calculation:**
```
ARR = MRR × 12
ARR = $409,925 × 12 = $4,919,100
```

### Customer Lifetime Value (LTV)

Calculate LTV for each tier.

**LTV Calculation:**
```typescript
interface LTVCalculation {
  // Starter tier
  monthlyPrice: 9.99,
  averageLifetime: 24, // months
  churnRate: 0.05, // 5% monthly
  
  // LTV formula
  LTV = monthlyPrice / churnRate
  LTV = 9.99 / 0.05 = $199.80
  
  // With discount
  LTV = (monthlyPrice × averageLifetime) - (monthlyPrice × averageLifetime × churnRate)
  LTV = (9.99 × 24) - (9.99 × 24 × 0.05)
  LTV = $239.76 - $11.99 = $227.77
}
```

### Customer Acquisition Cost (CAC)

Calculate CAC for marketing efficiency.

**CAC Calculation:**
```typescript
interface CACCalculation {
  // Marketing spend
  monthlyMarketingSpend: 50000,
  newCustomersAcquired: 500,
  
  // CAC
  CAC = monthlyMarketingSpend / newCustomersAcquired
  CAC = 50000 / 500 = $100
  
  // CAC Payback Period
  monthlyPrice: 9.99,
  paybackMonths = CAC / monthlyPrice
  paybackMonths = 100 / 9.99 = 10 months
}
```

### Churn Rate

Track subscription cancellations.

**Churn Calculation:**
```typescript
interface ChurnCalculation {
  // Starter tier
  startingSubscriptions: 5000,
  cancelledSubscriptions: 250,
  
  // Monthly churn rate
  monthlyChurn = cancelledSubscriptions / startingSubscriptions
  monthlyChurn = 250 / 5000 = 0.05 = 5%
  
  // Annual churn rate
  annualChurn = 1 - (1 - monthlyChurn)^12
  annualChurn = 1 - (0.95)^12 = 0.46 = 46%
}
```

---

## Payment Processing

### Payment Methods

Supported payment methods.

**Payment Options:**
- Credit card (Visa, Mastercard, Amex)
- Debit card
- PayPal
- Bank transfer (Enterprise)
- Invoice (Enterprise)

### Billing Cycle

Subscription billing schedule.

**Billing Details:**
```typescript
interface BillingCycle {
  // Monthly
  monthly: {
    billingDate: 'same day each month',
    renewalDate: 'one month from billing date',
    cancellationNotice: '0 days',
  },
  
  // Annual
  annual: {
    billingDate: 'same day each year',
    renewalDate: 'one year from billing date',
    cancellationNotice: '30 days',
  },
}
```

### Invoice Management

Generate and manage invoices.

**Invoice Details:**
```typescript
interface Invoice {
  id: string,
  userId: string,
  subscriptionId: string,
  
  // Dates
  invoiceDate: Date,
  dueDate: Date,
  paidDate?: Date,
  
  // Amounts
  subtotal: number,
  tax: number,
  total: number,
  
  // Status
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled',
  
  // Items
  items: [
    {
      description: string,
      quantity: number,
      unitPrice: number,
      amount: number,
    }
  ],
}
```

---

## Compliance

### Locked Tier Specifications

Tier specifications are LOCKED and require approval to change.

**Locked Tiers:**
- Free: 1 GB, 3 galleries, 5 clients
- Starter: 10 GB, 10 galleries, 20 clients
- Professional: 100 GB, 50 galleries, 100 clients
- Business: 1 TB, 200 galleries, 500 clients
- Enterprise: Unlimited

**Change Process:**
1. Submit change request to product owner
2. Provide business justification
3. Get written approval
4. Update all tier definition files
5. Deploy changes

**Reference:** `.kiro/steering/tier-limits-locked.md`

### Tax Compliance

Handle tax calculations and reporting.

**Tax Configuration:**
```typescript
interface TaxCompliance {
  // VAT/GST
  vatEnabled: true,
  vatRate: 0.20, // 20% for EU
  
  // Sales tax
  salesTaxEnabled: true,
  salesTaxRates: {
    'US-CA': 0.0725,
    'US-NY': 0.08,
    'US-TX': 0.0625,
  },
  
  // Tax ID validation
  validateTaxId: true,
  
  // Reporting
  taxReporting: 'quarterly',
}
```

### GDPR Compliance

Handle data privacy requirements.

**GDPR Features:**
- Right to be forgotten (data deletion)
- Data portability (export data)
- Consent management
- Privacy policy
- Terms of service

---

## Pricing Optimization

### A/B Testing

Test pricing variations.

**A/B Test Example:**
```typescript
interface PricingABTest {
  // Control
  control: {
    starterPrice: 9.99,
    professionalPrice: 29.99,
  },
  
  // Variant A
  variantA: {
    starterPrice: 12.99,
    professionalPrice: 34.99,
  },
  
  // Variant B
  variantB: {
    starterPrice: 7.99,
    professionalPrice: 24.99,
  },
  
  // Metrics
  metrics: [
    'conversion_rate',
    'mrr',
    'churn_rate',
    'ltv',
  ],
}
```

### Price Elasticity

Measure price sensitivity.

**Elasticity Calculation:**
```
Elasticity = (% Change in Quantity) / (% Change in Price)

Example:
- Price increase: 10%
- Quantity decrease: 5%
- Elasticity = -5% / 10% = -0.5

Interpretation:
- Inelastic (< 1): Quantity not very sensitive to price
- Elastic (> 1): Quantity very sensitive to price
```

---

## Related Files

- `docs/RBAC_AND_USER_MANAGEMENT.md` - Tier definitions
- `backend/src/config/tier-limits.ts` - Tier configuration
- `backend/src/services/billingService.ts` - Billing logic
- `.kiro/steering/tier-limits-locked.md` - Locked specifications

## Last Updated

2025-12-17
