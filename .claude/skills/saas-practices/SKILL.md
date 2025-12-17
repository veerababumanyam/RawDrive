---
name: saas-practices
description: SaaS best practices for RawDrive photography platform. Use when implementing multi-tenancy, subscription features, billing, onboarding, or usage metering.
---

# SaaS Best Practices for RawDrive

## Overview

RawDrive is a multi-tenant SaaS platform serving 20,000+ professional photographers. This skill covers patterns for multi-tenancy, subscription management, billing, onboarding, and usage tracking.

## Multi-Tenancy Architecture (Workspace-Scoped)

### Workspace Model

```sql
-- Workspaces table (organizations/studios)
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    plan_id UUID REFERENCES subscription_plans(id),
    billing_email VARCHAR(255),
    country_code CHAR(2) DEFAULT 'US',
    timezone VARCHAR(50) DEFAULT 'UTC',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- All data tables include workspace_id
CREATE TABLE libraries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    name VARCHAR(255) NOT NULL,
    -- ... other fields
    CONSTRAINT fk_workspace FOREIGN KEY (workspace_id)
        REFERENCES workspaces(id) ON DELETE CASCADE
);

-- Index for workspace isolation
CREATE INDEX idx_libraries_workspace ON libraries(workspace_id)
    WHERE deleted_at IS NULL;
```

### Workspace Context Pattern

```typescript
// apps/api/src/middleware/workspaceContext.ts
import { Request, Response, NextFunction } from 'express';
import { AsyncLocalStorage } from 'async_hooks';

interface WorkspaceContext {
  workspaceId: string;
  userId: string;
  plan: SubscriptionPlan;
}

export const workspaceStorage = new AsyncLocalStorage<WorkspaceContext>();

export const workspaceContextMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Extract from JWT token
  const { workspaceId, userId } = req.user;

  // Load workspace details (cached)
  const workspace = await workspaceService.getById(workspaceId);

  if (!workspace || workspace.deleted_at) {
    return res.status(403).json({ error: 'Workspace not found or inactive' });
  }

  const context: WorkspaceContext = {
    workspaceId,
    userId,
    plan: workspace.plan,
  };

  // Run handler with workspace context
  workspaceStorage.run(context, () => next());
};

// Usage in services
export function getCurrentWorkspace(): WorkspaceContext {
  const context = workspaceStorage.getStore();
  if (!context) {
    throw new Error('No workspace context available');
  }
  return context;
}
```

### Data Isolation Query Helper

```typescript
// apps/api/src/utils/workspaceQuery.ts
import { getCurrentWorkspace } from '../middleware/workspaceContext';
import { pool } from '../config/database';

export async function workspaceQuery<T>(
  query: string,
  params: any[] = []
): Promise<T[]> {
  const { workspaceId } = getCurrentWorkspace();

  // Automatically inject workspace_id
  const scopedQuery = query.replace(
    /FROM\s+(\w+)/gi,
    'FROM $1 WHERE $1.workspace_id = $' + (params.length + 1)
  );

  const result = await pool.query(scopedQuery, [...params, workspaceId]);
  return result.rows;
}

// Simplified usage
const libraries = await workspaceQuery<Library>(
  'SELECT * FROM libraries WHERE deleted_at IS NULL ORDER BY created_at DESC'
);
// Automatically becomes:
// SELECT * FROM libraries WHERE libraries.workspace_id = $1 AND deleted_at IS NULL...
```

## Subscription Management

### Plan Structure

```typescript
// apps/api/src/models/subscription.ts

interface SubscriptionPlan {
  id: string;
  name: string;
  slug: 'free' | 'starter' | 'professional' | 'business' | 'enterprise';
  price_monthly: number;
  price_yearly: number;
  currency: string;
  features: PlanFeatures;
}

interface PlanFeatures {
  // Storage
  storage_gb: number;              // 5, 100, 500, 2000, unlimited
  max_photos_per_gallery: number;  // 100, 500, 1000, unlimited

  // Users
  max_team_members: number;        // 1, 3, 10, 25, unlimited
  max_clients: number;             // 10, 50, 200, unlimited

  // Features
  ai_analysis_monthly: number;     // 0, 100, 500, 2000, unlimited
  custom_branding: boolean;
  white_label: boolean;
  api_access: boolean;
  priority_support: boolean;
  sla_uptime: number;              // 99, 99.9, 99.99

  // Integrations
  cloud_storage_integrations: string[];  // ['google_drive', 'dropbox']
  payment_gateways: string[];            // ['stripe', 'razorpay']
}

// Plan definitions
const PLANS: Record<string, PlanFeatures> = {
  free: {
    storage_gb: 5,
    max_photos_per_gallery: 100,
    max_team_members: 1,
    max_clients: 10,
    ai_analysis_monthly: 0,
    custom_branding: false,
    white_label: false,
    api_access: false,
    priority_support: false,
    sla_uptime: 99,
    cloud_storage_integrations: [],
    payment_gateways: [],
  },
  professional: {
    storage_gb: 500,
    max_photos_per_gallery: 1000,
    max_team_members: 10,
    max_clients: 200,
    ai_analysis_monthly: 500,
    custom_branding: true,
    white_label: false,
    api_access: true,
    priority_support: true,
    sla_uptime: 99.9,
    cloud_storage_integrations: ['google_drive', 'dropbox'],
    payment_gateways: ['stripe', 'razorpay'],
  },
  // ... other plans
};
```

### Feature Gating

```typescript
// apps/api/src/middleware/featureGate.ts

type FeatureFlag = keyof PlanFeatures | 'custom';

export const requireFeature = (feature: FeatureFlag) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { plan } = getCurrentWorkspace();

    // Check boolean features
    if (typeof plan.features[feature] === 'boolean') {
      if (!plan.features[feature]) {
        return res.status(403).json({
          error: 'Feature not available',
          message: `This feature requires a higher plan`,
          upgrade_url: '/settings/billing/upgrade',
        });
      }
    }

    next();
  };
};

// Usage in routes
router.post(
  '/branding/custom',
  authenticate,
  requireFeature('custom_branding'),
  brandingController.updateCustomBranding
);

router.get(
  '/v1/workspaces/:workspaceId/libraries',
  authenticate,
  requireFeature('api_access'),
  libraryController.list
);
```

### Quota Enforcement

```typescript
// apps/api/src/middleware/quotaEnforcement.ts

interface QuotaCheck {
  resource: 'storage' | 'photos' | 'team_members' | 'clients' | 'ai_analysis';
  action: 'read' | 'create' | 'update' | 'delete';
}

export const enforceQuota = (check: QuotaCheck) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { workspaceId, plan } = getCurrentWorkspace();

    // Get current usage
    const usage = await usageService.getCurrentUsage(workspaceId);

    switch (check.resource) {
      case 'storage':
        const newSize = req.body.file_size || 0;
        if (usage.storage_bytes + newSize > plan.features.storage_gb * 1024 * 1024 * 1024) {
          return res.status(402).json({
            error: 'Storage quota exceeded',
            current: usage.storage_bytes,
            limit: plan.features.storage_gb * 1024 * 1024 * 1024,
            upgrade_url: '/settings/billing/upgrade',
          });
        }
        break;

      case 'team_members':
        if (usage.team_member_count >= plan.features.max_team_members) {
          return res.status(402).json({
            error: 'Team member limit reached',
            current: usage.team_member_count,
            limit: plan.features.max_team_members,
          });
        }
        break;

      case 'ai_analysis':
        if (usage.ai_analysis_this_month >= plan.features.ai_analysis_monthly) {
          return res.status(402).json({
            error: 'Monthly AI analysis limit reached',
            current: usage.ai_analysis_this_month,
            limit: plan.features.ai_analysis_monthly,
            resets_at: getNextMonthStart(),
          });
        }
        break;
    }

    next();
  };
};

// Usage
router.post(
  '/v1/workspaces/:workspaceId/uploads',
  authenticate,
  enforceQuota({ resource: 'storage', action: 'create' }),
  uploadController.create
);

router.post(
  '/v1/workspaces/:workspaceId/ai/analyze',
  authenticate,
  enforceQuota({ resource: 'ai_analysis', action: 'create' }),
  aiController.analyzeAsset
);
```

## Billing Integration

### Stripe Integration

```typescript
// apps/api/src/services/PaymentService.ts
import Stripe from 'stripe';

// Load secrets from environment variables - NEVER hardcode
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export class PaymentService {
  async createSubscription(
    workspaceId: string,
    planId: string,
    paymentMethodId: string
  ): Promise<Subscription> {
    const workspace = await workspaceService.getById(workspaceId);
    const plan = await planService.getById(planId);

    // Create or get Stripe customer
    let customerId = workspace.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: workspace.billing_email,
        metadata: { workspace_id: workspaceId },
      });
      customerId = customer.id;
      await workspaceService.updateStripeCustomer(workspaceId, customerId);
    }

    // Attach payment method
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: plan.stripe_price_id }],
      default_payment_method: paymentMethodId,
      metadata: { workspace_id: workspaceId },
    });

    // Update workspace plan
    await workspaceService.updatePlan(workspaceId, planId, subscription.id);

    return this.mapStripeSubscription(subscription);
  }

  async handleWebhook(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdate(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionCancellation(event.data.object);
        break;

      case 'invoice.payment_failed':
        await this.handlePaymentFailure(event.data.object);
        break;

      case 'invoice.paid':
        await this.handlePaymentSuccess(event.data.object);
        break;
    }
  }

  private async handlePaymentFailure(invoice: Stripe.Invoice): Promise<void> {
    const workspaceId = invoice.metadata?.workspace_id;
    if (!workspaceId) return;

    // Mark subscription as past_due
    await workspaceService.updateSubscriptionStatus(workspaceId, 'past_due');

    // Send notification
    await notificationService.sendPaymentFailedEmail(workspaceId, {
      amount: invoice.amount_due,
      invoice_url: invoice.hosted_invoice_url,
    });

    // Log for monitoring
    logger.warn('Payment failed', { workspaceId, invoice_id: invoice.id });
  }
}
```

### Razorpay Integration (India)

```typescript
// apps/api/src/services/RazorpayService.ts
import Razorpay from 'razorpay';

// Load secrets from environment variables - NEVER hardcode
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export class RazorpayService {
  async createSubscription(
    workspaceId: string,
    planId: string
  ): Promise<RazorpaySubscription> {
    const workspace = await workspaceService.getById(workspaceId);
    const plan = await planService.getById(planId);

    // Create Razorpay subscription
    const subscription = await razorpay.subscriptions.create({
      plan_id: plan.razorpay_plan_id,
      customer_notify: 1,
      total_count: 12,  // 1 year
      notes: { workspace_id: workspaceId },
    });

    return subscription;
  }

  async verifyPayment(
    paymentId: string,
    subscriptionId: string,
    signature: string
  ): Promise<boolean> {
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(`${paymentId}|${subscriptionId}`)
      .digest('hex');

    return generatedSignature === signature;
  }
}
```

## Usage Tracking

### Usage Metrics

```typescript
// apps/api/src/services/UsageTrackingService.ts

interface UsageMetrics {
  workspace_id: string;
  period_start: Date;
  period_end: Date;
  storage_bytes: number;
  bandwidth_bytes: number;
  photo_count: number;
  gallery_count: number;
  client_count: number;
  team_member_count: number;
  ai_analysis_count: number;
  api_request_count: number;
}

export class UsageTrackingService {
  async trackEvent(event: UsageEvent): Promise<void> {
    const { workspaceId } = getCurrentWorkspace();

    // Increment counters in Redis (real-time)
    const periodKey = this.getPeriodKey(workspaceId);
    await redis.hincrby(periodKey, event.metric, event.delta);

    // Set expiry for auto-cleanup
    await redis.expire(periodKey, 35 * 24 * 60 * 60);  // 35 days

    // Log for analytics
    await this.logUsageEvent(workspaceId, event);
  }

  async getCurrentUsage(workspaceId: string): Promise<UsageMetrics> {
    const periodKey = this.getPeriodKey(workspaceId);

    // Get from Redis (fast)
    const cached = await redis.hgetall(periodKey);
    if (Object.keys(cached).length > 0) {
      return this.parseUsageMetrics(cached);
    }

    // Fall back to database
    return this.computeUsageFromDb(workspaceId);
  }

  async generateUsageReport(
    workspaceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<UsageReport> {
    const dailyUsage = await pool.query(
      `SELECT
         DATE(created_at) as date,
         SUM(storage_delta) as storage_change,
         SUM(bandwidth_delta) as bandwidth,
         COUNT(DISTINCT asset_id) as assets_uploaded,
         COUNT(DISTINCT library_id) as libraries_created
       FROM usage_events
       WHERE workspace_id = $1
         AND created_at BETWEEN $2 AND $3
       GROUP BY DATE(created_at)
       ORDER BY date`,
      [workspaceId, startDate, endDate]
    );

    return {
      workspace_id: workspaceId,
      period: { start: startDate, end: endDate },
      daily_usage: dailyUsage.rows,
      totals: this.computeTotals(dailyUsage.rows),
    };
  }
}

// Track storage usage
router.post('/v1/workspaces/:workspaceId/uploads/:uploadId/commit', async (req, res) => {
  const asset = await uploadService.commit(req.params.uploadId);

  await usageService.trackEvent({
    metric: 'storage_bytes',
    delta: asset.original_bytes,
    resource_type: 'asset',
    resource_id: asset.asset_id,
  });

  res.json(asset);
});
```

### Usage Dashboard Data

```typescript
// apps/api/src/routes/v1/usage.ts

router.get('/v1/workspaces/:workspaceId/usage/current', authenticate, async (req, res) => {
  const { workspaceId, plan } = getCurrentWorkspace();

  const [usage, limits] = await Promise.all([
    usageService.getCurrentUsage(workspaceId),
    planService.getLimits(plan.id),
  ]);

  res.json({
    usage: {
      storage: {
        used: usage.storage_bytes,
        limit: limits.storage_gb * 1024 * 1024 * 1024,
        percentage: (usage.storage_bytes / (limits.storage_gb * 1024 * 1024 * 1024)) * 100,
      },
      assets: {
        count: usage.asset_count,
        limit: limits.max_assets_per_library,
      },
      team: {
        count: usage.team_member_count,
        limit: limits.max_team_members,
      },
      ai_analysis: {
        used: usage.ai_analysis_count,
        limit: limits.ai_analysis_monthly,
        resets_at: getNextMonthStart(),
      },
    },
    plan: {
      name: plan.name,
      slug: plan.slug,
    },
  });
});
```

## Onboarding Flow

### Tenant Setup

```typescript
// apps/api/src/services/OnboardingService.ts

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  action_url?: string;
}

export class OnboardingService {
  private steps: OnboardingStep[] = [
    { id: 'profile', title: 'Complete your profile', description: 'Add your business details', completed: false, action_url: '/settings/profile' },
    { id: 'branding', title: 'Set up branding', description: 'Add your logo and colors', completed: false, action_url: '/settings/branding' },
    { id: 'first_library', title: 'Create your first library', description: 'Upload photos to share', completed: false, action_url: '/libraries/new' },
    { id: 'invite_client', title: 'Invite a client', description: 'Share a library with a client', completed: false, action_url: '/clients/invite' },
    { id: 'connect_payment', title: 'Connect payments', description: 'Set up payment processing', completed: false, action_url: '/settings/payments' },
  ];

  async getOnboardingStatus(workspaceId: string): Promise<OnboardingStatus> {
    const progress = await this.loadProgress(workspaceId);

    const steps = this.steps.map(step => ({
      ...step,
      completed: progress.completed_steps.includes(step.id),
    }));

    const completedCount = steps.filter(s => s.completed).length;

    return {
      steps,
      progress_percentage: (completedCount / steps.length) * 100,
      is_complete: completedCount === steps.length,
      next_step: steps.find(s => !s.completed),
    };
  }

  async completeStep(workspaceId: string, stepId: string): Promise<void> {
    await pool.query(
      `UPDATE workspace_onboarding
       SET completed_steps = array_append(completed_steps, $1),
           updated_at = NOW()
       WHERE workspace_id = $2`,
      [stepId, workspaceId]
    );

    // Check for completion rewards
    const status = await this.getOnboardingStatus(workspaceId);
    if (status.is_complete) {
      await this.grantOnboardingReward(workspaceId);
    }
  }

  private async grantOnboardingReward(workspaceId: string): Promise<void> {
    // Example: Grant 30-day trial of Professional plan
    await workspaceService.grantTrialUpgrade(workspaceId, 'professional', 30);

    // Send congratulations email
    await emailService.sendOnboardingComplete(workspaceId);
  }
}
```

### Welcome Flow Component

```typescript
// apps/web/src/components/Onboarding/OnboardingWizard.tsx

export const OnboardingWizard: React.FC = () => {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);

  useEffect(() => {
    loadOnboardingStatus();
  }, []);

  if (!status || status.is_complete) {
    return null;
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Getting Started</h3>
        <span className="text-sm text-secondary-foreground">
          {status.progress_percentage.toFixed(0)}% complete
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-muted rounded-full mb-6">
        <div
          className="h-full bg-accent rounded-full transition-all"
          style={{ width: `${status.progress_percentage}%` }}
        />
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {status.steps.map((step, index) => (
          <OnboardingStep
            key={step.id}
            step={step}
            isActive={!step.completed && index === status.steps.findIndex(s => !s.completed)}
          />
        ))}
      </div>
    </div>
  );
};
```

## Trial & Conversion

### Trial Management

```typescript
// apps/api/src/services/TrialService.ts

export class TrialService {
  async startTrial(workspaceId: string, planSlug: string, durationDays: number): Promise<Trial> {
    const plan = await planService.getBySlug(planSlug);

    const trial = await pool.query(
      `INSERT INTO trials (workspace_id, plan_id, started_at, ends_at)
       VALUES ($1, $2, NOW(), NOW() + INTERVAL '${durationDays} days')
       RETURNING *`,
      [workspaceId, plan.id]
    );

    // Temporarily upgrade workspace
    await workspaceService.updatePlan(workspaceId, plan.id, null, true);

    // Schedule trial ending notification
    await jobQueue.add('trial-ending-reminder', {
      workspaceId,
      trialId: trial.rows[0].id,
    }, {
      delay: (durationDays - 3) * 24 * 60 * 60 * 1000,  // 3 days before
    });

    return trial.rows[0];
  }

  async checkTrialExpiry(): Promise<void> {
    // Find expiring trials
    const expiringTrials = await pool.query(
      `SELECT t.*, w.billing_email
       FROM trials t
       JOIN workspaces w ON w.id = t.workspace_id
       WHERE t.ends_at < NOW()
         AND t.status = 'active'`
    );

    for (const trial of expiringTrials.rows) {
      await this.expireTrial(trial);
    }
  }

  private async expireTrial(trial: Trial): Promise<void> {
    // Downgrade to free plan
    await workspaceService.updatePlan(trial.workspace_id, 'free');

    // Update trial status
    await pool.query(
      `UPDATE trials SET status = 'expired' WHERE id = $1`,
      [trial.id]
    );

    // Send expiry notification
    await emailService.sendTrialExpired(trial.workspace_id, {
      plan_name: trial.plan_name,
      upgrade_url: `${APP_URL}/settings/billing/upgrade`,
    });

    logger.info('Trial expired', { workspaceId: trial.workspace_id, plan: trial.plan_name });
  }
}
```

### Conversion Tracking

```typescript
// apps/api/src/services/ConversionService.ts

export class ConversionService {
  async trackConversionEvent(
    workspaceId: string,
    event: ConversionEvent
  ): Promise<void> {
    await pool.query(
      `INSERT INTO conversion_events (workspace_id, event_type, event_data, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [workspaceId, event.type, JSON.stringify(event.data)]
    );

    // Track in analytics
    await analytics.track({
      workspaceId,
      event: event.type,
      properties: event.data,
    });
  }

  async getConversionFunnel(
    startDate: Date,
    endDate: Date
  ): Promise<ConversionFunnel> {
    const stages = await pool.query(
      `SELECT
         COUNT(DISTINCT CASE WHEN event_type = 'signup' THEN workspace_id END) as signups,
         COUNT(DISTINCT CASE WHEN event_type = 'onboarding_complete' THEN workspace_id END) as onboarded,
         COUNT(DISTINCT CASE WHEN event_type = 'trial_started' THEN workspace_id END) as trial_started,
         COUNT(DISTINCT CASE WHEN event_type = 'subscription_created' THEN workspace_id END) as converted
       FROM conversion_events
       WHERE created_at BETWEEN $1 AND $2`,
      [startDate, endDate]
    );

    const data = stages.rows[0];

    return {
      stages: [
        { name: 'Signups', count: data.signups },
        { name: 'Onboarded', count: data.onboarded },
        { name: 'Trial Started', count: data.trial_started },
        { name: 'Converted', count: data.converted },
      ],
      conversion_rates: {
        signup_to_onboard: (data.onboarded / data.signups) * 100,
        onboard_to_trial: (data.trial_started / data.onboarded) * 100,
        trial_to_paid: (data.converted / data.trial_started) * 100,
        overall: (data.converted / data.signups) * 100,
      },
    };
  }
}
```

## Best Practices Checklist

### Multi-Tenancy (Workspace-Scoped)
- [ ] All database queries include workspace_id filter
- [ ] Workspace context is set from JWT, never from request body
- [ ] Cross-workspace data access is impossible by design
- [ ] Workspace deletion cascades all related data
- [ ] Workspace settings are workspace-scoped
- [ ] Storage object keys include workspace_id prefix

### Billing
- [ ] Webhook handlers are idempotent
- [ ] Payment failures trigger grace period, not immediate lockout
- [ ] Subscription status changes are audited
- [ ] Invoices are stored for compliance
- [ ] Currency is consistent per tenant

### Usage
- [ ] Usage is tracked in real-time (Redis)
- [ ] Hard limits block operations before exceeding quota
- [ ] Soft limits trigger warnings at 80%, 90%
- [ ] Usage resets are timezone-aware
- [ ] Usage history is retained for billing disputes

### Onboarding
- [ ] Onboarding progress is persisted
- [ ] Steps can be completed in any order (where logical)
- [ ] Completion rewards are granted only once
- [ ] Skipping steps is allowed with warning
- [ ] Onboarding can be resumed later
