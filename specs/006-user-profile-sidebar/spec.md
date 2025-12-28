# Feature Specification: User Profile & Subscription Integration

**Feature Branch**: `006-user-profile-sidebar`
**Created**: 2025-12-28
**Status**: Draft
**Input**: User description: "User profile options missing in workspace sidebar. Add user profile section under settings similar to company profile. Review entire app for user profile related features, configure and integrate them. Implement missing subscription features like renewals, upgrades, cancellations."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Access User Profile from Sidebar (Priority: P1)

As a workspace user, I need quick access to my personal settings (profile, security, notifications) from the workspace sidebar, similar to how I access company settings, so that I can manage my account without leaving the workspace context.

**Why this priority**: This is the core navigation gap identified - users cannot discover or access their personal settings from the workspace. Without this, users must know the direct URL (`/settings/*`) which creates poor discoverability and UX friction.

**Independent Test**: Can be fully tested by navigating to any workspace page, clicking the new "My Profile" or "My Account" link in the sidebar, and verifying navigation to user settings pages.

**Acceptance Scenarios**:

1. **Given** a logged-in user on any workspace page, **When** they view the sidebar "System" section, **Then** they see a "My Profile" or "My Account" option alongside existing settings options
2. **Given** a user clicks the "My Profile" option, **When** the page loads, **Then** they are navigated to their personal profile settings page (`/settings/profile`)
3. **Given** a user is on user settings pages, **When** they click "Back to Dashboard" or the workspace navigation, **Then** they return to the workspace context seamlessly
4. **Given** the sidebar is collapsed, **When** the user hovers over the profile icon, **Then** a tooltip shows "My Profile" or similar label

---

### User Story 2 - View Current Subscription & Usage (Priority: P1)

As a workspace owner, I need to view my current subscription plan, usage statistics (storage, galleries, AI credits), and billing cycle information from within the workspace, so that I can understand my account status and make informed decisions about upgrades.

**Why this priority**: Users need visibility into their subscription status before they can take action on renewals or upgrades. This is foundational for all subscription management features.

**Independent Test**: Can be fully tested by navigating to the new subscription/billing section and verifying current plan details, usage metrics, and billing period are displayed correctly.

**Acceptance Scenarios**:

1. **Given** a workspace owner, **When** they navigate to the subscription/billing page, **Then** they see their current plan name, price, and billing cycle dates
2. **Given** a user on the subscription page, **When** viewing usage statistics, **Then** they see storage used vs limit, galleries count vs limit, AI credits used vs limit
3. **Given** a user on a trial plan, **When** viewing subscription status, **Then** they see trial days remaining and a clear call-to-action to upgrade
4. **Given** a subscription is set to cancel at period end, **When** viewing status, **Then** they see a warning and option to reactivate

---

### User Story 3 - Upgrade Subscription Plan (Priority: P2)

As a workspace owner on a lower-tier plan, I need to upgrade to a higher plan to unlock more storage, galleries, or features, so that I can grow my photography business without limitations.

**Why this priority**: Upgrades are a primary revenue driver and common user need. However, viewing current status (P1) must exist first.

**Independent Test**: Can be fully tested by navigating to subscription page, clicking upgrade, selecting a new plan, and completing the upgrade flow (with test payment provider).

**Acceptance Scenarios**:

1. **Given** a workspace owner on a free or lower-tier plan, **When** they click "Upgrade", **Then** they see available upgrade options with feature comparisons
2. **Given** a user selects an upgrade plan, **When** they proceed, **Then** they are directed to the payment provider (Razorpay/Stripe) checkout
3. **Given** a successful payment, **When** returning to the app, **Then** their plan is immediately updated and new limits are in effect
4. **Given** a failed payment, **When** returning to the app, **Then** they see an error message and option to retry

---

### User Story 4 - Cancel Subscription (Priority: P2)

As a workspace owner, I need the ability to cancel my subscription if I no longer need the service, with a clear understanding of what happens to my data and when access ends.

**Why this priority**: Cancellation is a required feature for subscription businesses and regulatory compliance. Clear cancellation UX reduces support burden.

**Independent Test**: Can be fully tested by navigating to subscription page, initiating cancellation, confirming the action, and verifying the subscription status changes.

**Acceptance Scenarios**:

1. **Given** an active subscription, **When** a user clicks "Cancel Subscription", **Then** they see a confirmation modal explaining the cancellation policy
2. **Given** the user confirms cancellation, **When** processed, **Then** the subscription is set to cancel at period end (not immediately)
3. **Given** a pending cancellation, **When** viewing subscription status, **Then** the user sees the cancellation date and option to reactivate
4. **Given** a user reactivates before period end, **When** processed, **Then** the cancellation is reversed and subscription continues

---

### User Story 5 - View Billing History & Invoices (Priority: P2)

As a workspace owner, I need to view my billing history and download invoices for accounting and expense tracking purposes.

**Why this priority**: Required for business users who need invoices for tax/expense purposes. Lower priority than subscription management but essential for complete billing experience.

**Independent Test**: Can be fully tested by navigating to billing history, viewing list of past invoices, and downloading a PDF invoice.

**Acceptance Scenarios**:

1. **Given** a workspace with payment history, **When** navigating to billing history, **Then** the user sees a list of past invoices with date, amount, and status
2. **Given** an invoice in the list, **When** the user clicks download, **Then** a PDF invoice is downloaded with all required details (GST for India)
3. **Given** a failed payment, **When** viewing billing history, **Then** the failed transaction is shown with status and retry option

---

### User Story 6 - Consolidated User Settings Navigation (Priority: P3)

As a user, I need a consistent way to navigate between all user settings sections (Profile, Security, Notifications, Privacy, AI, Account, Billing) from within the workspace or settings pages.

**Why this priority**: Improves overall UX consistency but is enhancement after core features are working.

**Independent Test**: Can be fully tested by navigating through all settings sections and verifying consistent navigation patterns.

**Acceptance Scenarios**:

1. **Given** a user in any settings section, **When** viewing the sidebar or navigation, **Then** all available settings sections are visible and accessible
2. **Given** a user on the Profile settings page, **When** they click Security, **Then** they navigate to Security settings without page reload
3. **Given** a new user visiting settings for the first time, **When** they view available sections, **Then** the purpose of each section is clear from labels and descriptions

---

### Edge Cases

- What happens when a user's payment method expires during auto-renewal?
  - The system should mark subscription as `past_due`, notify user via email, and show warning banner in app
- How does the system handle downgrade requests (moving to a lower plan)?
  - Downgrade takes effect at next billing cycle; current period keeps higher plan benefits
- What happens to data if storage exceeds new plan limits after downgrade?
  - System warns user before confirming downgrade; existing data is preserved but new uploads blocked
- How are trial users handled who never add a payment method?
  - Trial expires after 30 days; workspace enters limited/read-only mode with upgrade prompts
- What if the user cancels and the subscription is already canceled?
  - Show appropriate message that no active subscription exists to cancel

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display a "My Profile" or "My Account" navigation item in the workspace sidebar under the System section
- **FR-002**: System MUST navigate users to the existing `/settings/profile` page when clicking the profile navigation item
- **FR-003**: System MUST add a "Subscription" or "Billing" navigation item in user settings that links to subscription management
- **FR-004**: System MUST display current subscription plan details including plan name, price, billing cycle, and renewal date
- **FR-005**: System MUST display current usage metrics (storage, galleries, clients, team members, AI credits) against plan limits
- **FR-006**: System MUST display trial status and days remaining for users on trial plans
- **FR-007**: System MUST provide an upgrade flow that shows available plans with feature comparison
- **FR-008**: System MUST integrate with payment providers (Razorpay primary, Stripe optional) for processing upgrades
- **FR-009**: System MUST handle subscription cancellation with cancel-at-period-end behavior
- **FR-010**: System MUST allow users to reactivate a canceled subscription before the period ends
- **FR-011**: System MUST display billing history with past invoices and payment status
- **FR-012**: System MUST allow users to download invoices as PDF (GST-compliant for India)
- **FR-013**: System MUST show warning banner when subscription is past_due or trial is expiring
- **FR-014**: System MUST prevent certain actions (uploads, exports) when subscription is expired or limits exceeded

### Key Entities *(include if feature involves data)*

- **UserProfile**: Personal information, avatar, timezone preferences (already exists at `/settings/*`)
- **WorkspaceSubscription**: Current plan, status, billing cycle, provider details (already exists)
- **Plan**: Available subscription tiers with limits and features (already exists)
- **Invoice**: Past billing records with amounts, status, PDF generation (already exists)
- **UsageMeter**: Tracked usage for storage, galleries, AI credits (already exists)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can discover and access personal settings from the workspace within 2 clicks from any workspace page
- **SC-002**: 90% of workspace owners can successfully view their subscription status without requiring support assistance
- **SC-003**: Trial-to-paid conversion flow can be completed in under 3 minutes
- **SC-004**: Subscription cancellation requests are processed within 30 seconds of user confirmation
- **SC-005**: Invoice downloads complete within 5 seconds of user request
- **SC-006**: 100% of billing-related user journeys are accessible from the workspace sidebar navigation
- **SC-007**: User settings pages maintain consistent navigation with less than 1 second load time between sections

## Assumptions

- Payment providers (Razorpay/Stripe) are already configured at the platform level
- The existing `/settings/*` pages (Profile, Security, Notifications, Privacy, AI, Account) are functional and can be linked
- Backend subscription service (`SubscriptionService`) already supports plan changes, cancellations, and status queries
- Invoice PDF generation is available or can be implemented using existing backend infrastructure
- GST compliance for India invoices follows existing platform patterns
