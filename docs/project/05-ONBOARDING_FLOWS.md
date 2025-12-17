# Onboarding Flows

## Overview

Onboarding flows define the step-by-step processes for new users to get started with RawDrive. This document covers photographer signup, payment processing, tier activation, and initial setup workflows.

## Purpose

Onboarding flows serve to:
- **Reduce Friction**: Streamline signup process
- **Ensure Compliance**: Collect required information
- **Activate Features**: Enable tier-specific features
- **Collect Payments**: Process subscriptions
- **Educate Users**: Guide users through setup
- **Maximize Retention**: Improve first-time user experience

---

## Photographer Signup Flow

### Step 1: Email Registration

User enters email and creates password.

**User Actions:**
1. Click "Sign Up" button
2. Enter email address
3. Enter password (8+ chars, uppercase, lowercase, number, special char)
4. Confirm password
5. Accept terms of service
6. Click "Create Account"

**System Actions:**
1. Validate email format
2. Check email uniqueness
3. Validate password strength
4. Hash password with Argon2id
5. Create user account with FREE tier
6. Send verification email
7. Redirect to email verification page

**Data Created:**
```typescript
{
  id: UUID,
  email: string,
  passwordHash: string,
  subscriptionTier: 'free',
  subscriptionStatus: 'active',
  emailVerified: false,
  createdAt: Date,
}
```

**Error Handling:**
- Email already exists → Show error, suggest login
- Weak password → Show requirements
- Terms not accepted → Disable submit button
- Network error → Show retry option

### Step 2: Email Verification

User verifies email address.

**User Actions:**
1. Check email inbox
2. Click verification link
3. Email verified confirmation

**System Actions:**
1. Generate verification token (24-hour expiration)
2. Send verification email with link
3. Validate token when clicked
4. Mark email as verified
5. Redirect to profile setup

**Email Template:**
```
Subject: Verify your RawDrive email

Hi [Name],

Click the link below to verify your email:
[Verification Link]

This link expires in 24 hours.

Thanks,
RawDrive Team
```

**Error Handling:**
- Link expired → Show "Resend verification email" option
- Invalid token → Show error
- Email already verified → Redirect to next step

### Step 3: Profile Setup

User completes profile information.

**User Actions:**
1. Enter first name
2. Enter last name
3. Enter business name (optional)
4. Upload profile photo (optional)
5. Enter bio (optional)
6. Click "Continue"

**System Actions:**
1. Validate required fields
2. Store profile information
3. Process profile photo upload
4. Create default gallery
5. Redirect to tier selection

**Data Updated:**
```typescript
{
  firstName: string,
  lastName: string,
  displayName: string,
  avatar?: string,
  bio?: string,
}
```

**Default Gallery:**
```typescript
{
  id: UUID,
  photographerId: userId,
  name: 'Welcome Gallery',
  description: 'Your first gallery',
  isPublic: false,
  createdAt: Date,
}
```

### Step 4: Tier Selection

User chooses subscription tier.

**Tier Options:**
```
┌─────────────────────────────────────────────────────────────┐
│ FREE (Current)          STARTER             PROFESSIONAL    │
│ $0/month                $9.99/month         $29.99/month    │
│ • 1 GB storage          • 10 GB storage     • 100 GB storage│
│ • 3 galleries           • 10 galleries      • 50 galleries  │
│ • 5 clients             • 20 clients        • 100 clients   │
│ • Basic AI (10 credits) • Advanced AI       • Premium AI    │
│                         • Custom branding   • Custom domain │
│                                             • Print designer│
│ [Stay Free]             [Upgrade]           [Upgrade]       │
└─────────────────────────────────────────────────────────────┘
```

**User Actions:**
1. Review tier options
2. Click "Upgrade" for paid tier or "Stay Free"
3. If upgrade: Proceed to payment
4. If free: Proceed to onboarding complete

**System Actions:**
1. Display tier comparison
2. Show pricing and features
3. Redirect based on selection

### Step 5: Payment Processing

User enters payment information (if upgrading).

**Payment Flow:**
1. Redirect to Stripe checkout
2. Enter card details
3. Enter billing address
4. Review order summary
5. Click "Pay"

**Stripe Integration:**
```typescript
interface StripeCheckout {
  lineItems: [
    {
      price: string, // Stripe price ID
      quantity: 1,
    }
  ],
  mode: 'subscription',
  successUrl: 'https://rawdrive.com/onboarding/success',
  cancelUrl: 'https://rawdrive.com/onboarding/payment',
}
```

**System Actions:**
1. Create Stripe checkout session
2. Redirect to Stripe
3. Receive webhook confirmation
4. Update subscription status
5. Activate tier features
6. Send confirmation email

**Subscription Created:**
```typescript
{
  id: UUID,
  userId: userId,
  tier: 'starter' | 'professional' | 'business' | 'enterprise',
  billingCycle: 'monthly' | 'annual',
  price: number,
  stripeSubscriptionId: string,
  status: 'active',
  startDate: Date,
  renewalDate: Date,
}
```

**Error Handling:**
- Card declined → Show error, allow retry
- Invalid address → Show validation errors
- Network error → Show retry option
- Webhook timeout → Retry webhook delivery

### Step 6: Onboarding Complete

User sees success message and next steps.

**Success Page:**
```
✓ Welcome to RawDrive!

Your account is ready. Here's what's next:

1. Upload your first photos
   [Upload Photos Button]

2. Invite your first client
   [Invite Client Button]

3. Explore features
   [View Tutorial Button]

4. Get help
   [Contact Support Button]
```

**System Actions:**
1. Mark onboarding as complete
2. Send welcome email
3. Redirect to dashboard
4. Show onboarding tips

**Welcome Email:**
```
Subject: Welcome to RawDrive!

Hi [Name],

Your RawDrive account is ready! Here's what you can do:

✓ Upload and organize photos
✓ Share galleries with clients
✓ Design print albums
✓ Manage bookings
✓ Use AI-powered features

Get started: [Dashboard Link]

Questions? Contact us at support@rawdrive.com

Welcome aboard!
RawDrive Team
```

---

## Client Signup Flow

### Invited Client Registration

Client invited to gallery creates account.

**Invitation Email:**
```
Subject: [Photographer] shared a gallery with you

Hi [Client Name],

[Photographer] shared a gallery with you on RawDrive.

View Gallery: [Gallery Link]

If you don't have an account, create one:
[Sign Up Link]

Thanks,
RawDrive
```

**User Actions:**
1. Click gallery link or sign up link
2. Enter email
3. Create password
4. Verify email
5. View gallery

**System Actions:**
1. Create client account
2. Link to photographer
3. Grant gallery access
4. Send confirmation email
5. Redirect to gallery

**Client Account:**
```typescript
{
  id: UUID,
  email: string,
  firstName?: string,
  lastName?: string,
  passwordHash: string,
  role: 'client',
  createdAt: Date,
}
```

---

## Free Trial Flow

### Trial Activation

User starts free trial of paid tier.

**Trial Options:**
```
Try Professional for 14 days free
• 100 GB storage
• 50 galleries
• 100 clients
• Custom domain
• Print designer

[Start 14-Day Trial]
```

**User Actions:**
1. Click "Start Trial"
2. Enter payment method (for auto-renewal)
3. Confirm trial terms
4. Click "Start Trial"

**System Actions:**
1. Create trial subscription
2. Set trial end date (14 days)
3. Store payment method
4. Activate tier features
5. Send trial confirmation email

**Trial Subscription:**
```typescript
{
  id: UUID,
  userId: userId,
  tier: 'professional' | 'business' | 'enterprise',
  status: 'trial',
  trialStartDate: Date,
  trialEndDate: Date, // 14 days from start
  autoRenew: true,
  paymentMethodId: string,
}
```

**Trial Expiration:**
- 3 days before expiration: Send reminder email
- On expiration: Convert to free tier or charge card
- After expiration: Downgrade features

---

## Tier Upgrade Flow

### Upgrade from Free to Paid

User upgrades from free tier.

**Upgrade Trigger:**
- User clicks "Upgrade" button
- User reaches storage limit
- User reaches gallery limit
- User reaches client limit

**Upgrade Flow:**
1. Show tier comparison
2. Select new tier
3. Enter payment information
4. Confirm upgrade
5. Activate new tier

**System Actions:**
1. Create new subscription
2. Process payment
3. Update user tier
4. Activate new features
5. Send confirmation email

**Upgrade Email:**
```
Subject: Welcome to [Tier Name]!

Hi [Name],

Your upgrade to [Tier Name] is complete!

New features available:
✓ [Feature 1]
✓ [Feature 2]
✓ [Feature 3]

Explore new features: [Dashboard Link]

Thanks,
RawDrive Team
```

---

## Downgrade Flow

### Downgrade to Lower Tier

User downgrades subscription.

**Downgrade Trigger:**
- User clicks "Downgrade" in settings
- Subscription expires
- Payment fails

**Downgrade Flow:**
1. Show confirmation dialog
2. Warn about feature loss
3. Confirm downgrade
4. Process downgrade
5. Send confirmation email

**Confirmation Dialog:**
```
Downgrade to [Tier Name]?

You'll lose access to:
• [Feature 1]
• [Feature 2]
• [Feature 3]

Your data will be preserved.

[Cancel] [Confirm Downgrade]
```

**System Actions:**
1. Update subscription
2. Disable tier-specific features
3. Warn if over limits
4. Send confirmation email

**Downgrade Email:**
```
Subject: Your subscription has been downgraded

Hi [Name],

Your subscription has been downgraded to [Tier Name].

Features disabled:
✗ [Feature 1]
✗ [Feature 2]
✗ [Feature 3]

Your data is safe and will be preserved.

Need help? Contact support@rawdrive.com

RawDrive Team
```

---

## Cancellation Flow

### Cancel Subscription

User cancels subscription.

**Cancellation Trigger:**
- User clicks "Cancel Subscription" in settings
- User requests cancellation via support

**Cancellation Flow:**
1. Show cancellation survey
2. Collect feedback
3. Confirm cancellation
4. Process cancellation
5. Send confirmation email

**Cancellation Survey:**
```
We're sorry to see you go!

Why are you cancelling?
○ Too expensive
○ Not using features
○ Found alternative
○ Other: [Text field]

[Cancel Subscription] [Keep Subscription]
```

**System Actions:**
1. Record cancellation reason
2. Update subscription status
3. Set cancellation date
4. Disable paid features
5. Send cancellation email

**Cancellation Email:**
```
Subject: Your RawDrive subscription has been cancelled

Hi [Name],

Your subscription has been cancelled effective [Date].

Your data will be preserved for 30 days.
After 30 days, your account will be deleted.

To reactivate: [Reactivate Link]

We'd love to hear your feedback: [Survey Link]

RawDrive Team
```

---

## Reactivation Flow

### Reactivate Cancelled Subscription

User reactivates cancelled subscription.

**Reactivation Trigger:**
- User clicks "Reactivate" link in email
- User logs in and clicks "Reactivate"
- Within 30 days of cancellation

**Reactivation Flow:**
1. Show reactivation options
2. Select tier
3. Enter payment (if needed)
4. Confirm reactivation
5. Restore access

**System Actions:**
1. Create new subscription
2. Process payment
3. Restore tier features
4. Send reactivation email

**Reactivation Email:**
```
Subject: Welcome back to RawDrive!

Hi [Name],

Your subscription has been reactivated!

Tier: [Tier Name]
Renewal Date: [Date]

Get started: [Dashboard Link]

Thanks for coming back!
RawDrive Team
```

---

## Onboarding Metrics

### Key Metrics to Track

**Signup Metrics:**
- Signup completion rate
- Time to complete signup
- Email verification rate
- Tier selection distribution

**Payment Metrics:**
- Payment success rate
- Payment failure rate
- Average payment amount
- Churn rate

**Engagement Metrics:**
- First photo upload (within 24 hours)
- First client invitation (within 7 days)
- Feature adoption rate
- Return rate (7-day, 30-day)

**Cohort Analysis:**
- Retention by signup date
- Retention by tier
- Retention by acquisition channel
- LTV by cohort

---

## Onboarding Best Practices

### Do's
- ✅ Keep signup form short (email, password only)
- ✅ Show progress indicator
- ✅ Provide clear next steps
- ✅ Send confirmation emails
- ✅ Offer live chat support
- ✅ Show value early
- ✅ Make tier comparison clear
- ✅ Provide trial period

### Don'ts
- ❌ Don't require too much information upfront
- ❌ Don't hide pricing
- ❌ Don't make payment mandatory for free tier
- ❌ Don't send too many emails
- ❌ Don't make cancellation difficult
- ❌ Don't skip email verification
- ❌ Don't force tier upgrade
- ❌ Don't lose user data on cancellation

---

## Related Files

- `docs/CUSTOMER_AUTOMATED_ONBOARDING.md` - Onboarding details
- `docs/RBAC_AND_USER_MANAGEMENT.md` - User management
- `frontend/src/components/auth/RegistrationForm.tsx` - Registration UI
- `backend/src/services/authService.ts` - Auth service

## Last Updated

2025-12-17
