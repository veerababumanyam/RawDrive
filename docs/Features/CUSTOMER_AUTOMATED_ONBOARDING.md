# Customer Automated Onboarding

> Terminology: See [`GLOSSARY.md`](GLOSSARY.md) (Workspace, Asset, Share Link, Trial, etc.).

## Overview

RawDrive implements a comprehensive automated onboarding system that guides newly registered customers through signup, payment processing, and tier activation. The system is designed to be frictionless, secure, and user-friendly, with automatic tier activation upon successful payment.

## Purpose

The automated onboarding system serves to:
- **Streamline Signup**: Guide customers through account creation with minimal friction
- **Facilitate Payment**: Integrate payment processing seamlessly into the signup flow
- **Automate Tier Activation**: Instantly activate subscription tiers upon payment success
- **Reduce Churn**: Provide guided setup to help customers get value quickly
- **Collect Data**: Gather essential information for account setup and personalization
- **Ensure Compliance**: Collect necessary agreements and verify customer information

## Onboarding Flow Architecture

### High-Level Flow

```
1. Landing Page
   ↓
2. Plan Selection
   ↓
3. Registration (Email, Password, Name, Business)
   ↓
4. Payment Processing
   ↓
5. Payment Verification
   ↓
6. Tier Activation
   ↓
7. Guided Setup (Profile, Gallery, Branding)
   ↓
8. Dashboard Access
```

### State Management

```typescript
interface OnboardingState {
  // Step tracking
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  
  // User data
  registrationData: RegistrationData;
  paymentData: PaymentData;
  profileData: ProfileData;
  
  // Status tracking
  isLoading: boolean;
  error?: string;
  paymentStatus: 'pending' | 'processing' | 'success' | 'failed';
  tierActivationStatus: 'pending' | 'activated' | 'failed';
}

type OnboardingStep = 
  | 'plan-selection'
  | 'registration'
  | 'payment'
  | 'verification'
  | 'setup'
  | 'complete';
```

## Step 1: Plan Selection

### Plan Selection Interface

Customers choose their subscription tier before creating an account.

**Display Elements:**
- Plan cards with features and pricing
- Billing cycle toggle (Monthly/Annual)
- Savings badge for annual billing
- Feature comparison matrix
- CTA button ("Get Started")
- FAQ section

**Plan Information:**
```typescript
interface PlanCard {
  id: PlanId; // 'free' | 'starter' | 'professional' | 'business' | 'enterprise'
  name: string;
  description: string;
  price: {
    monthly: number;
    annually: number;
  };
  features: string[];
  limits: {
    storage: number;
    galleries: number;
    clients: number;
    teamMembers: number;
  };
  highlighted?: boolean; // Recommended plan
  badge?: string; // "Most Popular", "Best Value"
}
```

**Billing Cycle Toggle:**
- Monthly: Full price per month
- Annual: Discounted price, billed once per year
- Savings calculation displayed
- Switch between cycles updates pricing

**Accessibility:**
- Keyboard navigation between plan cards
- Screen reader support for pricing and features
- Focus indicators on all interactive elements
- High contrast pricing display
- Clear CTA button labels

### Plan Persistence

Selected plan persists through signup flow.

```typescript
// Store in session/URL
const selectedPlan = {
  planId: 'professional',
  billingCycle: 'annually',
  selectedAt: new Date(),
};

// Pass to registration form
<RegistrationForm 
  initialPlanId={selectedPlan.planId}
  initialBillingCycle={selectedPlan.billingCycle}
/>
```

## Step 2: Registration

### Registration Form

Collect essential customer information.

**Form Fields:**

```typescript
interface RegistrationData {
  // Authentication
  email: string;
  password: string;
  confirmPassword: string;
  
  // Personal Information
  firstName: string;
  lastName: string;
  
  // Business Information
  businessName: string;
  
  // Plan Selection
  planId: PlanId;
  billingCycle: 'monthly' | 'annually';
  
  // Agreements
  agreeToTerms: boolean;
  agreeToPrivacy: boolean;
}
```

**Field Validation:**

```typescript
interface ValidationRules {
  email: {
    required: true;
    format: 'email';
    unique: true; // Check against database
    maxLength: 255;
  };
  password: {
    required: true;
    minLength: 8;
    requireUppercase: true;
    requireLowercase: true;
    requireNumber: true;
    requireSpecial: true;
  };
  firstName: {
    required: true;
    minLength: 2;
    maxLength: 50;
  };
  lastName: {
    required: true;
    minLength: 2;
    maxLength: 50;
  };
  businessName: {
    required: true;
    minLength: 2;
    maxLength: 100;
  };
}
```

### Password Strength Indicator

Real-time password strength feedback.

**Strength Levels:**
- Weak (0-1): Red, shows missing requirements
- Fair (2): Orange, shows remaining requirements
- Good (3): Yellow, nearly complete
- Strong (4): Green, all requirements met

**Requirements Checklist:**
- ✓ At least 8 characters
- ✓ Uppercase letter (A-Z)
- ✓ Lowercase letter (a-z)
- ✓ Number (0-9)
- ✓ Special character (!@#$%^&*)

**Accessibility:**
- Live region announces strength changes
- Checklist items marked with ARIA
- Color not the only indicator
- Clear text descriptions

### Email Verification

Verify email ownership before account creation.

**Process:**
1. Customer enters email
2. System checks if email exists
3. If new, send verification email
4. Customer clicks verification link
5. Email marked as verified
6. Account creation proceeds

**Verification Email:**
- Branded with photographer's studio (if applicable)
- Clear call-to-action button
- Verification link valid for 24 hours
- Resend option if expired
- Security information

### Social Login Option

Allow signup via Google/social providers.

**Features:**
- "Sign up with Google" button
- Pre-fills email and name
- Skips password creation
- Still requires business name
- Faster signup process

**Flow:**
1. Click "Sign up with Google"
2. Redirect to Google OAuth
3. User authorizes RawDrive
4. Return with email and name
5. Pre-fill registration form
6. User enters business name
7. Proceed to payment

### Terms & Privacy Agreements

Collect necessary legal agreements.

**Checkboxes:**
- ☐ I agree to the Terms of Service
- ☐ I agree to the Privacy Policy
- ☐ I agree to receive marketing emails (optional)

**Links:**
- Terms of Service (opens in new tab)
- Privacy Policy (opens in new tab)
- Contact support link

**Accessibility:**
- Checkboxes with associated labels
- Links clearly marked as external
- Required fields marked with asterisk
- Error messages for unchecked required boxes

### Form Submission

Submit registration data to backend.

**Validation Flow:**
1. Client-side validation
2. Show validation errors
3. User corrects errors
4. Submit to backend
5. Backend validation
6. Check email uniqueness
7. Create user account
8. Return session token
9. Proceed to payment

**Error Handling:**
```typescript
interface RegistrationError {
  field?: string;
  message: string;
  code: string; // 'email_exists', 'invalid_email', 'weak_password', etc.
}

// Display errors
{errors.map(error => (
  <div role="alert" className="error-message">
    {error.message}
  </div>
))}
```

## Step 3: Payment Processing

### Payment Gateway Integration

Integrate with payment provider (Stripe, Razorpay, etc.).

**Payment Methods:**
- Credit/Debit Card (Visa, Mastercard, Amex)
- Digital Wallets (Apple Pay, Google Pay)
- Bank Transfer (UPI, ACH)
- Local Payment Methods (varies by region)

### Payment Form

Secure payment collection interface.

**Form Fields:**
```typescript
interface PaymentData {
  // Card Information
  cardNumber: string;
  expiryMonth: number;
  expiryYear: number;
  cvv: string;
  
  // Billing Address
  fullName: string;
  email: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  
  // Plan Information
  planId: PlanId;
  billingCycle: 'monthly' | 'annually';
  amount: number;
  currency: string;
}
```

**Security:**
- PCI DSS compliant
- Never store full card details
- Use tokenization
- SSL/TLS encryption
- 3D Secure authentication
- Fraud detection

**Accessibility:**
- Clear form labels
- Error messages announced
- Keyboard navigable
- Screen reader support
- High contrast input fields
- 44x44px minimum touch targets

### Order Summary

Display order details before payment.

**Summary Information:**
- Plan name and features
- Billing cycle (Monthly/Annual)
- Price breakdown
  - Base price
  - Taxes/GST
  - Discounts (if applicable)
  - Total amount
- Currency display
- Renewal information
- Cancellation policy link

**Accessibility:**
- Summary in semantic HTML table
- Clear pricing hierarchy
- Total amount emphasized
- Screen reader friendly

### Payment Processing

Process payment securely.

**Flow:**
1. Validate payment form
2. Tokenize card details
3. Send to payment gateway
4. Wait for authorization
5. Show processing indicator
6. Handle response
7. Create subscription record
8. Activate tier
9. Send confirmation email

**Error Handling:**
```typescript
interface PaymentError {
  code: string; // 'card_declined', 'expired_card', 'insufficient_funds', etc.
  message: string;
  retryable: boolean;
}

// Display error and allow retry
if (error.retryable) {
  showError(error.message);
  enableRetryButton();
} else {
  showError('Payment failed. Please contact support.');
}
```

### Payment Confirmation

Confirm successful payment.

**Confirmation Screen:**
- Success message
- Order number
- Amount charged
- Plan details
- Next steps
- "Continue to Setup" button

**Email Confirmation:**
- Order confirmation
- Invoice attachment
- Plan details
- Billing information
- Support contact

## Step 4: Payment Verification

### Webhook Processing

Verify payment status via webhook.

**Webhook Events:**
- `payment.success`: Payment completed
- `payment.failed`: Payment declined
- `payment.pending`: Awaiting confirmation
- `subscription.created`: Subscription activated
- `subscription.updated`: Plan changed

**Webhook Handler:**
```typescript
// Backend webhook endpoint
POST /api/webhooks/payment
{
  event: 'payment.success',
  paymentId: 'pay_123456',
  userId: 'user_789',
  amount: 99900,
  currency: 'INR',
  planId: 'professional',
  billingCycle: 'monthly',
  timestamp: '2025-12-17T10:30:00Z'
}

// Verify webhook signature
const isValid = verifyWebhookSignature(req.body, req.headers['x-signature']);

// Process payment
if (isValid) {
  await activateTier(userId, planId, billingCycle);
  await sendConfirmationEmail(userId);
}
```

### Idempotency

Handle duplicate webhook events.

```typescript
// Store processed webhook IDs
const processedWebhooks = new Set<string>();

const handleWebhook = async (webhookId: string, data: WebhookData) => {
  // Check if already processed
  if (processedWebhooks.has(webhookId)) {
    return { status: 'already_processed' };
  }
  
  // Process webhook
  await processPayment(data);
  
  // Mark as processed
  processedWebhooks.add(webhookId);
  
  return { status: 'processed' };
};
```

### Retry Logic

Retry failed webhook processing.

```typescript
// Exponential backoff retry
const retryWebhook = async (webhookId: string, maxRetries: number = 5) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await processWebhook(webhookId);
      return { success: true };
    } catch (error) {
      const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s, 8s, 16s
      await sleep(delay);
    }
  }
  
  // Log failure after max retries
  await logWebhookFailure(webhookId);
  return { success: false };
};
```

## Step 5: Tier Activation

### Automatic Tier Activation

Instantly activate subscription tier upon payment success.

**Activation Process:**
```typescript
const activateTier = async (userId: string, planId: PlanId, billingCycle: string) => {
  // 1. Create subscription record
  const subscription = await Subscription.create({
    userId,
    planId,
    billingCycle,
    status: 'active',
    startDate: new Date(),
    renewalDate: calculateRenewalDate(billingCycle),
    amount: getPlanPrice(planId, billingCycle),
  });
  
  // 2. Update user tier
  await User.update(userId, {
    subscriptionTier: planId,
    subscriptionId: subscription.id,
    subscriptionStatus: 'active',
  });
  
  // 3. Initialize tier limits
  await initializeTierLimits(userId, planId);
  
  // 4. Grant tier features
  await grantTierFeatures(userId, planId);
  
  // 5. Send confirmation email
  await sendTierActivationEmail(userId, planId);
  
  // 6. Log activation
  await logAuditEvent(userId, 'tier_activated', planId);
  
  return subscription;
};
```

### Tier Limits Initialization

Set up resource limits based on tier.

**Limits by Tier:**
```typescript
const TIER_LIMITS = {
  starter: {
    storage: 10 * 1024 * 1024 * 1024, // 10 GB
    galleries: 10,
    clients: 20,
    teamMembers: 1,
    aiCredits: 100,
  },
  professional: {
    storage: 100 * 1024 * 1024 * 1024, // 100 GB
    galleries: 50,
    clients: 100,
    teamMembers: 1,
    aiCredits: 500,
  },
  business: {
    storage: 1 * 1024 * 1024 * 1024 * 1024, // 1 TB
    galleries: 200,
    clients: 500,
    teamMembers: 5,
    aiCredits: 2000,
  },
  enterprise: {
    storage: Infinity,
    galleries: Infinity,
    clients: Infinity,
    teamMembers: Infinity,
    aiCredits: 10000,
  },
  // Trial is an account state. During the 30-day trial, treat the workspace as Business-tier.
  trial: {
    storage: 1 * 1024 * 1024 * 1024 * 1024, // 1 TB
    galleries: 200,
    clients: 500,
    teamMembers: 5,
    aiCredits: 2000,
  },
};

// Initialize limits for user
const initializeTierLimits = async (userId: string, planId: PlanId) => {
  const limits = TIER_LIMITS[planId];
  
  await UserLimits.create({
    userId,
    ...limits,
    createdAt: new Date(),
  });
};
```

### Feature Activation

Enable tier-specific features.

**Feature Flags:**
```typescript
const TIER_FEATURES = {
  starter: {
    customBranding: true,
    customDomain: false,
    clientDownloads: true,
    printDesigner: false,
    faceRecognition: true,
    videoSupport: true,
    apiAccess: false,
  },
  // ... more tiers
};

// Trial is an account state; feature gating should be based on the paid tier (e.g., business)
// plus a trial status (e.g., subscriptionStatus: 'trialing' or trial_status: 'active_trial').

// Grant features
const grantTierFeatures = async (userId: string, planId: PlanId) => {
  const features = TIER_FEATURES[planId];
  
  await UserFeatures.create({
    userId,
    ...features,
    activatedAt: new Date(),
  });
};
```

### Subscription Record

Create subscription record for billing.

```typescript
interface Subscription {
  id: string;
  userId: string;
  planId: PlanId;
  billingCycle: 'monthly' | 'annually';
  status: 'active' | 'canceled' | 'past_due' | 'trialing';
  
  // Billing
  amount: number;
  currency: string;
  
  // Dates
  startDate: Date;
  renewalDate: Date;
  canceledAt?: Date;
  
  // Payment
  paymentMethodId: string;
  lastPaymentDate: Date;
  nextPaymentDate: Date;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}
```

## Step 6: Guided Setup

### Onboarding Wizard

Guide new customers through initial setup.

**Setup Steps:**
1. **Welcome**: Introduction and overview
2. **Profile**: Business information and branding
3. **Gallery**: Create first gallery
4. **Complete**: Congratulations and next steps

### Step 1: Welcome

Introduction to RawDrive.

**Content:**
- Welcome message
- Key features overview
- Quick tips
- "Get Started" button
- "Skip for now" option

**Accessibility:**
- Clear heading hierarchy
- Semantic HTML
- Keyboard navigable
- Screen reader friendly

### Step 2: Profile Setup

Configure photographer profile and branding.

**Form Fields:**
```typescript
interface ProfileData {
  // Business Information
  businessName: string;
  businessDescription: string;
  website?: string;
  
  // Branding
  brandColor: string; // Hex color
  logo?: File; // Image upload
  
  // Contact
  email: string;
  phone?: string;
  address?: string;
  
  // Social Media
  instagram?: string;
  facebook?: string;
  twitter?: string;
}
```

**Features:**
- Logo upload with preview
- Brand color picker
- Form validation
- Save progress
- Skip option

**Accessibility:**
- Form labels with htmlFor
- Color picker with text input
- File upload with clear instructions
- Error messages announced
- Keyboard navigable

### Step 3: Gallery Creation

Create first gallery.

**Form Fields:**
```typescript
interface GalleryData {
  name: string;
  description?: string;
  category?: string;
}
```

**Features:**
- Gallery name input
- Description textarea
- Category selection
- Preview
- Create button

**Post-Creation:**
- Show gallery created message
- Provide upload instructions
- Link to upload interface
- Option to create another gallery

### Step 4: Completion

Congratulations and next steps.

**Content:**
- Success message
- Summary of setup
- Key next steps
  - Upload photos
  - Invite clients
  - Customize settings
- Links to help resources
- "Go to Dashboard" button

**Accessibility:**
- Success announcement
- Clear next steps
- Keyboard navigable links
- Screen reader support

### Skip Option

Allow skipping setup wizard.

**Features:**
- "Skip for now" button on each step
- Confirmation dialog
- Access dashboard immediately
- Wizard available later in settings
- Reminder notifications

## Step 7: Dashboard Access

### Post-Onboarding Dashboard

Access main application after setup.

**Dashboard Components:**
- Welcome message
- Quick stats (galleries, clients, storage)
- Recent activity
- Quick action buttons
- Onboarding checklist (optional)
- Help resources

**Quick Actions:**
- Create gallery
- Upload photos
- Invite clients
- View settings
- Access help

### Onboarding Checklist

Optional checklist of setup tasks.

**Tasks:**
- ☐ Complete profile
- ☐ Create gallery
- ☐ Upload photos
- ☐ Invite first client
- ☐ Customize branding
- ☐ Configure gallery settings

**Features:**
- Check off completed tasks
- Progress indicator
- Rewards/badges for completion
- Dismiss option
- Reopen from settings

## Email Communications

### Confirmation Emails

Send confirmation emails at key stages.

**Email Types:**

**1. Welcome Email**
- Sent after account creation
- Welcome message
- Account details
- Getting started guide
- Support contact

**2. Payment Confirmation**
- Sent after successful payment
- Order number
- Invoice attachment
- Plan details
- Billing information
- Support contact

**3. Tier Activation**
- Sent after tier activation
- Tier name and features
- Limits and quotas
- Getting started guide
- Feature highlights
- Support contact

**4. Setup Reminder**
- Sent if setup not completed
- Encouragement to complete setup
- Benefits of setup
- Link to continue setup
- Support contact

### Email Templates

Professional, branded email templates.

**Template Elements:**
- Studio logo
- Brand colors
- Professional layout
- Clear call-to-action
- Support contact
- Unsubscribe link
- Social media links

**Accessibility:**
- Alt text for images
- Semantic HTML
- High contrast text
- Readable font sizes
- Mobile responsive

## Error Handling & Recovery

### Common Errors

Handle common onboarding errors gracefully.

**Registration Errors:**
- Email already exists
- Weak password
- Invalid email format
- Missing required fields
- Terms not accepted

**Payment Errors:**
- Card declined
- Expired card
- Insufficient funds
- Invalid CVV
- Billing address mismatch
- 3D Secure failed

**Tier Activation Errors:**
- Subscription creation failed
- Limits initialization failed
- Feature activation failed
- Email sending failed

### Error Recovery

Provide clear recovery paths.

```typescript
interface ErrorRecovery {
  error: string;
  message: string;
  action: string; // 'retry', 'contact_support', 'try_different_method'
  actionLabel: string;
  supportLink?: string;
}

// Display error with recovery option
<div role="alert" className="error-container">
  <h2>{error.message}</h2>
  <p>{error.description}</p>
  <AppButton onClick={handleAction}>
    {error.actionLabel}
  </AppButton>
  {error.supportLink && (
    <a href={error.supportLink}>Contact Support</a>
  )}
</div>
```

### Retry Logic

Implement retry logic for transient failures.

```typescript
const retryWithBackoff = async (
  fn: () => Promise<any>,
  maxRetries: number = 3
) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      
      const delay = Math.pow(2, attempt) * 1000;
      await sleep(delay);
    }
  }
};
```

## Security Considerations

### Data Protection

Protect customer data throughout onboarding.

**Measures:**
- HTTPS for all communication
- Password hashing (bcrypt, Argon2)
- PCI DSS compliance for payments
- No sensitive data in logs
- Encryption at rest
- Secure session management

### Fraud Prevention

Prevent fraudulent signups and payments.

**Measures:**
- Email verification
- Cloudflare Turnstile on signup (and adaptive challenges on suspicious login/checkout)
- Rate limiting
- Fraud detection (payment gateway)
- 3D Secure authentication
- IP validation
- Device fingerprinting

### Compliance

Ensure regulatory compliance.

**Requirements:**
- GDPR compliance
- CCPA compliance
- Terms of Service acceptance
- Privacy Policy acceptance
- Age verification (if applicable)
- KYC/AML (for certain regions)

## Analytics & Monitoring

### Onboarding Metrics

Track onboarding performance.

**Metrics:**
- Signup completion rate
- Payment success rate
- Tier activation rate
- Time to complete onboarding
- Drop-off points
- Error rates
- Email delivery rates

### Monitoring

Monitor onboarding system health.

**Alerts:**
- High error rates
- Payment gateway failures
- Email delivery failures
- Webhook processing failures
- Tier activation failures
- Database connection issues

### Logging

Log important onboarding events.

```typescript
interface OnboardingLog {
  userId: string;
  event: string; // 'signup_started', 'payment_processed', 'tier_activated', etc.
  timestamp: Date;
  data: Record<string, any>;
  status: 'success' | 'failure';
  errorMessage?: string;
}

// Log events
await logOnboardingEvent({
  userId,
  event: 'tier_activated',
  data: { planId, billingCycle },
  status: 'success',
});
```

## Accessibility Compliance

### WCAG 2.1 AA Standards

All onboarding flows meet WCAG 2.1 Level AA.

**Requirements:**
- Keyboard navigation throughout
- Screen reader support
- High contrast text (4.5:1 minimum)
- Focus indicators visible
- Form labels associated
- Error messages announced
- No color-only information
- Zoom support up to 200%

### Testing

Test accessibility before launch.

**Tests:**
- Keyboard-only navigation
- Screen reader testing (NVDA, JAWS, VoiceOver)
- Color contrast verification
- Focus indicator visibility
- Form validation announcements
- Mobile accessibility

## Related Files

- `frontend/src/components/auth/RegistrationForm.tsx` - Registration form
- `frontend/src/components/onboarding/OnboardingFlow.tsx` - Onboarding wizard
- `frontend/src/components/billing/BillingPortal.tsx` - Billing interface
- `frontend/src/components/billing/PaymentMethodModal.tsx` - Payment form
- `backend/src/services/paymentService.ts` - Payment processing
- `backend/src/services/subscriptionService.ts` - Subscription management
- `backend/src/webhooks/paymentWebhooks.ts` - Webhook handlers
- `docs/RBAC_AND_USER_MANAGEMENT.md` - User roles and permissions
- `docs/CLIENT_FACING_FEATURES.md` - Client features

## Last Updated

2025-12-17
