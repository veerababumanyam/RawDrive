# Business Onboarding & Workspace Setup

> **Reference Documentation**:
> - `docs/Business_Features/09_AUTHENTICATION_AUTHORIZATION.md` - Auth & RBAC
> - `docs/Business_Features/10_BILLING_SUBSCRIPTION.md` - Billing & Plans
> - `.kiro/specs/onboarding-flow/` - Onboarding flow specs

## Business Value Proposition

The Onboarding and Workspace Setup process is the critical "First Mile" of the RawDrive experience. It converts a sign-up into an active, value-generating business workspace. This flow automates the provisioning of secure environments, configures initial branding, and guides the user to their "Aha!" moment (uploading their first gallery).

### Key Business Benefits
- **Reduced Friction**: Streamlined wizard reduces drop-off rates during sign-up.
- **Instant Activation**: Automated provisioning allows immediate usage.
- **Personalized Setup**: Tailors the workspace to the photographer's specific business type (Wedding, Portrait, Event).
- **Compliance**: Ensures terms of service and privacy policy acceptance upfront.
- **Brand Identity**: Captures studio name and branding immediately, reinforcing professional value.

---

## User Personas

### Primary Users
1.  **New Studio Owner**
    *   Signs up to try the platform.
    *   Expects a quick, guided setup.
    *   Wants to see the value immediately without configuration fatigue.

2.  **Expanding Business Owner**
    *   Creating a secondary workspace for a sub-brand.
    *   Expects isolation from their primary workspace.

---

## Onboarding Workflow

### 1. Sign-Up & Authentication
*   **Entry Points**: Landing Page, Referral Link, Invitation Email.
*   **Methods**:
    *   **Google OAuth**: One-click signup (preferred).
    *   **Email/Password**: Standard flow with email verification.
*   **Account Creation**:
    *   Creates a `User` record.
    *   Triggers "Welcome" email.
    *   Redirects to **Workspace Setup Wizard**.

### 2. Workspace Setup Wizard
A multi-step, persistent form that guides the user through initial configuration.

#### Step 1: Business Identity
*   **Studio Name**: Usage for invoices and public profile (e.g., "Lumina Studios").
*   **Workspace Slug**: Unique URL identifier (e.g., `rawdrive.com/lumina`).
    *   *Auto-generated slug suggestion based on name.*
    *   *Real-time availability check.*
*   **Business Type**: Wedding, Portrait, Corporate, Event, Other. (Used for template recommendations).

#### Step 2: Regional Preferences
*   **Currency**: Primary currency for billing and client payments (e.g., INR, USD).
*   **Timezone**: For accurate scheduling and log timestamps.
*   **Date Format**: Regional preference (DD/MM/YYYY vs MM/DD/YYYY).
*   **Preferred Language**: UI language for the dashboard (e.g., English, Hindi).

#### Step 3: Brand Basics (Optional)
*   **Logo Upload**: Quick upload for immediate branding.
*   **Brand Color**: Primary accent color selection.
*   *(Can be skipped and configured later details in Company Profile).*

### 3. Trial Provisioning
*   **Plan Assignment**: Automatically assigns the "Pro Trial" (14-30 days).
*   **Quota Allocation**:
    *   Storage: 100GB.
    *   AI Credits: 500 initial credits.
    *   Members: Unlimited during trial.
*   **No Credit Card Required**: Reduces friction for initial trial.

### 4. The "First Mile" Checklist
After the wizard, the user lands on the Dashboard with a gamified checklist to drive activation:
1.  **Create First Gallery** (Primary Action).
2.  **Upload Logo** (if skipped).
3.  **Invite Team Member** (optional).
4.  **Connect Payment Gateway** (for collecting payments).

---

## Technical Architecture

### Backend Services

```
onboarding_service.py       - Orchestrates the setup flow
workspace_service.py        - Creates tenant isolation
user_service.py             - Manages user identity
subscription_service.py     - Provisions trial plans
notification_service.py     - Sends welcome emails
```

### API Endpoints

```
POST /api/v1/onboarding/workspace
    - Creates workspace, links owner, sets defaults.
    - Input: { name, slug, timezone, currency, business_type }

GET /api/v1/onboarding/slug-check?slug={slug}
    - Checks availability.

POST /api/v1/onboarding/complete
    - Marks onboarding as complete, dismisses wizard.
```

### Database Schema

*   `workspaces`: Stores the core tenant configuration.
*   `user_workspaces`: Links the user as `OWNER` of the new workspace.
*   `onboarding_state`: Tracks wizard progress (e.g., `step: 2`, `completed: false`) to resume dropped sessions.

---

## Integration Points

| Feature | Integration |
| :--- | :--- |
| **Authentication** | User account creation precedes workspace setup. |
| **Billing** | Trial subscription created immediately upon workspace setup. |
| **Company Profile** | Wizard inputs populate the initial Company Profile. |
| **Notifications** | Triggers "Welcome to RawDrive" and "Tips" email series. |

---

## Future Enhancements
*   **Industry-Specific Templates**: Pre-fill gallery settings based on "Business Type" (e.g., Weddings get "Romance" theme defaults).
*   **Concierge Onboarding**: Option to request a guided demo for Enterprise leads.
*   **Import Wizard**: Tools to migrate data from competitors (Pixieset, SmugMug).
