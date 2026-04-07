# RawDrive Super Admin Role — Frontend Requirements Specification

**Version:** 1.0
**Date:** 2026-04-04
**PRD Reference:** `frontend/docs/TechnicalRequirements/PRD.md` (Sections 6.2.1, 9.3, 11, 12, 28, 30, 38)

---

## Table of Contents

1. [Role Overview](#1-role-overview)
2. [Navigation and Layout](#2-navigation-and-layout)
3. [Dashboard and Home Screen](#3-dashboard-and-home-screen)
4. [Feature Access Matrix](#4-feature-access-matrix)
5. [Screens and Page Inventory](#5-screens-and-page-inventory)
6. [UI Components and Patterns](#6-ui-components-and-patterns)
7. [Business Rules and Validation](#7-business-rules-and-validation)
8. [Notifications and Alerts](#8-notifications-and-alerts)
9. [Cross-References](#9-cross-references)
10. [Acceptance Criteria](#10-acceptance-criteria)

---

## 1. Role Overview

### 1.1 Role Description

The **Super Admin** is the highest-privilege role in RawDrive. This role owns platform configuration, revenue logic, dealership governance, pricing, ratio rules, coupon policy, disputes, and payout approvals. Every financial, structural, and governance decision flows through Super Admin.

### 1.2 Who Holds This Role

- Founder / CEO
- CTO / Technical Co-Founder
- Designated platform governance officer
- Maximum 2-3 individuals at any time

### 1.3 Security Classification

- **Highest privilege level** — unrestricted platform access
- Mandatory 2FA enforcement
- Session timeout: 30 minutes of inactivity
- All actions logged to immutable audit trail
- IP allowlist recommended for production access

### 1.4 Core Responsibilities

| Area | Responsibility |
|------|---------------|
| Financial Governance | Define statewise margin ratios, commission basis, payout approval |
| Dealership Management | Assign/reassign state dealers, manage territories, approve applications |
| Pricing Control | Full CRUD on plan catalog with versioned pricing and entitlements |
| Coupon Policy | Set global coupon policies, create any coupon type, override limits |
| User Governance | Create Admins, override any role assignment, delete accounts |
| Platform Configuration | Feature flags, AI providers, maintenance mode, security settings |
| Compliance | Full audit log access, financial audit export, data retention oversight |
| Dispute Resolution | Override financial attribution, resolve dealer/payout disputes |

---

## 2. Navigation and Layout

### 2.1 Primary Navigation Structure (Sidebar)

```
Sidebar Navigation:

[RawDrive Logo]
[Super Admin Name + Avatar]
[Role Badge: "Super Admin" — red/gold]

— COMMAND CENTER —
  Dashboard                    (home)
  Escalation Queue             (escalations from Admins)

— USER GOVERNANCE —
  User Management              (all users)
  Role Management              (role assignment, Super Admin creation)

— DEALERSHIP —
  Dealer Management            (applications, territories, assignment)
  Territory Map                (interactive India map, drag-reassign)
  Dealer Performance           (state-level metrics)

— FINANCIAL GOVERNANCE —
  Margin Configuration         (statewise ratios, commission basis)
  Payout Management            (batch creation, approval, disputes)
  Revenue Reports              (MRR, ARR, state-level, dealer-level)
  GST & TDS Views              (tax reporting)

— COMMERCIAL —
  Pricing & Plans              (plan catalog CRUD, entitlements)
  Coupon Policy & Management   (global policy, all coupons)
  Subscription Overview        (billing health, mandate governance)
  Streaming Rate Cards         (CRUD, activation)
  Storage Quota Policies       (plan-level storage rules)

— ANALYTICS —
  Executive Dashboard          (MRR, ARR, churn, expansion)
  Signups by State             (geographic acquisition)
  Dealer Analytics             (dealer contribution, conversion)
  Product Analytics            (feature adoption, engagement)
  Funnel Analytics             (onboarding, trial-to-paid)

— MODERATION —
  Content Moderation           (flagged content, marketplace)
  Communication Safety         (abuse reports, blocking)
  Marketplace Moderation       (freelancer, rental listings)

— PLATFORM —
  Audit Center                 (full audit logs, financial audit)
  Feature Flags                (full CRUD)
  AI Provider Settings         (provider config, usage)
  Maintenance Controls         (maintenance mode, announcements)
  Security Settings            (2FA policies, IP allowlists, session rules)

— SYSTEM —
  Notification Center          (all notifications + escalation responses)
  Support Oversight            (ticket overview, SLA compliance)
  My Profile                   (personal settings)
```

### 2.2 Top Bar Elements

| Element | Description |
|---------|-------------|
| Breadcrumb | Current navigation path |
| Global Search | Search across all entities (users, dealers, coupons, payouts, audit entries) |
| Escalation Badge | Count of pending escalation requests from Admins |
| Notification Bell | Unread count with priority indicator |
| System Health | Green/amber/red dot indicating platform operational status |
| Profile Menu | Settings, logout, active sessions |

### 2.3 How This Differs From Other Roles

| Aspect | Super Admin | Admin | Dealer | Photographer |
|--------|-------------|-------|--------|-------------|
| Sidebar scope | Full platform | Operations subset | Territory only | Own workspace only |
| Financial controls | Full read/write | Read-only | Own earnings only | Own billing only |
| Territory map | Interactive (drag-assign) | View-only | Own state only | N/A |
| Payout management | Create + approve | View-only | View own | N/A |
| Feature flags | Full CRUD | Scoped toggle | N/A | N/A |
| Audit access | Full (including financial) | Operational only | N/A | N/A |

---

## 3. Dashboard and Home Screen

### 3.1 Executive KPI Cards (Top Row)

| KPI | Data | Refresh | Click Target |
|-----|------|---------|-------------|
| MRR (Monthly Recurring Revenue) | Current MRR in INR with trend arrow vs last month | 1 hour | Revenue Reports |
| ARR (Annual Run Rate) | Projected annual revenue | 1 hour | Revenue Reports |
| Active Subscribers | Total paid users by plan tier | 15 min | Subscription Overview |
| Signups Today | New registrations with state breakdown | 5 min | Signups by State |
| Dealer Performance Index | Aggregate score across all dealers | 1 hour | Dealer Analytics |
| Churn Rate | Monthly churn % with trend | 1 hour | Executive Dashboard |
| Trial Pipeline | Active trial users approaching expiry (30/7/1 day) | 15 min | Funnel Analytics |
| Pending Escalations | Unresolved Admin escalation requests | Real-time | Escalation Queue |

**FR-SA-DASH-001**: Each KPI card must show current value, period comparison (vs previous month), and trend arrow (up/down with %).
**FR-SA-DASH-002**: Clicking any KPI card navigates to the relevant detail screen.
**FR-SA-DASH-003**: KPI cards must show loading skeletons during data fetch, never empty states.

### 3.2 Real-Time Alerts Panel

| Alert Type | Trigger | Severity |
|-----------|---------|----------|
| Payout batch pending approval | Batch created, awaiting Super Admin approval | High |
| Dealer application pending | New dealer application >48h without review | Medium |
| State change request | Photographer requesting state change | Medium |
| Margin rule expiring | Commission rule approaching effective_to date | High |
| Revenue anomaly | Daily revenue deviates >20% from 7-day average | Critical |
| Billing failure spike | >5% renewal failures in 1h window | Critical |
| Escalation from Admin | Admin escalated a restricted action | High |
| Coupon budget threshold | Coupon total redemption value approaching budget limit | Medium |
| Security event | Failed 2FA attempts, suspicious IP activity | Critical |

**FR-SA-DASH-004**: Critical alerts must persist until explicitly acknowledged.
**FR-SA-DASH-005**: Alerts must be dismissible with "Mark Reviewed" that logs the action.

### 3.3 Quick Actions

| Action | Description | Shortcut |
|--------|-------------|----------|
| Approve Payout Batch | Jump to oldest pending payout batch | Ctrl+P |
| Review Escalation | Jump to oldest pending escalation | Ctrl+E |
| User Lookup | Global user search modal | Ctrl+K |
| Create Margin Rule | Open margin rule creation form | Ctrl+M |
| Create Coupon | Open coupon creation form | Ctrl+C |

---

## 4. Feature Access Matrix

### 4.1 Comprehensive Access Table

| Feature Area | Access Level | Create | Read | Update | Delete |
|-------------|-------------|--------|------|--------|--------|
| **Platform Configuration** | Full | YES | YES | YES | YES |
| **User Management** | Full | YES | YES | YES | YES |
| **Role Assignment (all roles including Super Admin)** | Full | YES | YES | YES | YES |
| **Dealer Management** | Full | YES | YES | YES | YES |
| **Territory Assignment** | Full | YES | YES | YES | YES |
| **Dealer Application Review** | Full | — | YES | YES | — |
| **Margin Ratio Configuration** | Full | YES | YES | YES | YES |
| **Commission Basis Configuration** | Full | YES | YES | YES | — |
| **Payout Batch Management** | Full | YES | YES | YES | — |
| **Payout Approval** | Full | — | YES | YES | — |
| **Dispute Resolution** | Full | YES | YES | YES | — |
| **Pricing & Plan Catalog** | Full CRUD with versioning | YES | YES | YES | YES |
| **Plan Entitlements** | Full | YES | YES | YES | — |
| **Coupon Global Policy** | Full | YES | YES | YES | YES |
| **Coupon Management (all scopes)** | Full | YES | YES | YES | YES |
| **Subscription Oversight** | Full | — | YES | YES | — |
| **Billing Override** | Full | — | YES | YES | — |
| **PhonePe Governance** | Full | — | YES | YES | — |
| **Streaming Rate Cards** | Full CRUD | YES | YES | YES | YES |
| **Storage Quota Policies** | Full | YES | YES | YES | — |
| **Analytics (Executive)** | Full read | — | YES | — | — |
| **Analytics (Product)** | Full read | — | YES | — | — |
| **Analytics (Dealer)** | Full read | — | YES | — | — |
| **Analytics (State-level)** | Full read | — | YES | — | — |
| **Audit Logs (all types)** | Full read + export | — | YES | — | — |
| **Financial Audit** | Full read + export | — | YES | — | — |
| **Moderation (all types)** | Full override | — | YES | YES | YES |
| **Feature Flags** | Full CRUD | YES | YES | YES | YES |
| **AI Provider Settings** | Full | YES | YES | YES | — |
| **Security Settings** | Full | YES | YES | YES | — |
| **Maintenance Controls** | Full | YES | YES | YES | — |
| **Notification Templates** | Full | YES | YES | YES | YES |
| **SLA Configuration** | Full | YES | YES | YES | — |
| **State Change Approval** | Full | — | YES | YES | — |
| **Marketplace Moderation** | Full | — | YES | YES | YES |
| **Communication Safety** | Full | — | YES | YES | YES |

---

## 5. Screens and Page Inventory

### 5.1 Command Center

| Screen ID | Screen Name | Route | Description |
|-----------|-------------|-------|-------------|
| SA-DASH-001 | Super Admin Dashboard | `/superadmin/dashboard` | Executive overview with KPIs, alerts, quick actions |
| SA-ESC-001 | Escalation Queue | `/superadmin/escalations` | All Admin escalation requests with action workflow |
| SA-ESC-002 | Escalation Detail | `/superadmin/escalations/:id` | Single escalation with context, recommendation, action buttons |

### 5.2 User Governance

| Screen ID | Screen Name | Route | Description |
|-----------|-------------|-------|-------------|
| SA-USR-001 | User List | `/superadmin/users` | All platform users, searchable, filterable |
| SA-USR-002 | User Detail | `/superadmin/users/:userId` | Full user profile with all data across services |
| SA-USR-003 | Role Management | `/superadmin/users/:userId/roles` | Full role assignment including Super Admin |
| SA-USR-004 | User Suspension | `/superadmin/users/:userId/suspend` | Suspension with impact preview |
| SA-USR-005 | Account Deletion | `/superadmin/users/:userId/delete` | Permanent deletion with data purge confirmation |
| SA-USR-006 | State Change Requests | `/superadmin/state-changes` | All photographer state change requests |
| SA-USR-007 | State Change Review | `/superadmin/state-changes/:id` | Review with Admin recommendation, approve/reject |
| SA-USR-008 | Bulk User Operations | `/superadmin/users/bulk` | Bulk actions: export, notify, suspend |

**Functional Requirements:**

**FR-SA-USR-001**: User list must support search by name, email, phone, user ID, state, dealer attribution.
**FR-SA-USR-002**: Account deletion must require 2FA confirmation and display full data purge scope (galleries, clients, albums, media, sessions).
**FR-SA-USR-003**: State change approval must show: original state, requested state, Admin recommendation, financial impact (attribution changes, commission recalculation).
**FR-SA-USR-004**: State change approval must create an audit entry with before/after snapshot and effective date.

### 5.3 Dealership Management

| Screen ID | Screen Name | Route | Description |
|-----------|-------------|-------|-------------|
| SA-DLR-001 | Dealer List | `/superadmin/dealers` | All dealers with state, status, performance |
| SA-DLR-002 | Dealer Detail | `/superadmin/dealers/:dealerId` | Full dealer profile with financials, territory, performance |
| SA-DLR-003 | Dealer Applications | `/superadmin/dealers/applications` | Pending applications with review workflow |
| SA-DLR-004 | Application Review | `/superadmin/dealers/applications/:id` | Single application review with approve/reject |
| SA-DLR-005 | Territory Map | `/superadmin/dealers/territory` | Interactive India map — drag to assign/reassign dealers |
| SA-DLR-006 | Territory Assignment | `/superadmin/dealers/territory/:stateCode` | Assign/reassign primary dealer for a state |
| SA-DLR-007 | Dealer Performance | `/superadmin/dealers/performance` | Aggregate dealer metrics with state comparison |
| SA-DLR-008 | Dealer Financials | `/superadmin/dealers/:dealerId/financials` | Full financial view: commissions, payouts, TDS |

**Functional Requirements:**

**FR-SA-DLR-001**: Territory map must be an interactive India map where Super Admin can click a state to view/assign/reassign the primary dealer.
**FR-SA-DLR-002**: Dealer reassignment must show impact: affected photographers count, commission recalculation, payout implications.
**FR-SA-DLR-003**: Dealer reassignment must require 2FA confirmation and create an audit entry.
**FR-SA-DLR-004**: Territory assignment must enforce one primary dealer per state by default, with override option requiring explicit confirmation.

### 5.4 Financial Governance

| Screen ID | Screen Name | Route | Description |
|-----------|-------------|-------|-------------|
| SA-FIN-001 | Margin Configuration | `/superadmin/margins` | Statewise margin ratio management |
| SA-FIN-002 | Create/Edit Margin Rule | `/superadmin/margins/create` | Form: state, plan, product type, channel, percentages, effective dates |
| SA-FIN-003 | Margin Rule History | `/superadmin/margins/history` | Version history of all margin rule changes |
| SA-FIN-004 | Margin Rule Comparison | `/superadmin/margins/compare` | Side-by-side comparison of rule versions |
| SA-FIN-005 | Commission Basis Config | `/superadmin/commission-basis` | Configure calculation mode (gross, net-of-GST, net-of-GST-and-fees) |
| SA-FIN-006 | Payout Dashboard | `/superadmin/payouts` | All payout batches with status pipeline |
| SA-FIN-007 | Payout Batch Detail | `/superadmin/payouts/:batchId` | Line items, dealer breakdown, approval controls |
| SA-FIN-008 | Payout Approval | `/superadmin/payouts/:batchId/approve` | Approval workflow with 2FA confirmation |
| SA-FIN-009 | Dispute Resolution | `/superadmin/payouts/disputes` | Attribution disputes with evidence and override controls |
| SA-FIN-010 | Revenue Reports | `/superadmin/revenue` | MRR, ARR, state-level, plan-level, dealer-level breakdowns |
| SA-FIN-011 | GST & TDS View | `/superadmin/tax` | Tax reporting: GST collected, TDS withheld, compliance status |

**Functional Requirements:**

**FR-SA-FIN-001**: Margin rule creation must require: state, plan, product type, dealer percentage, platform percentage (must sum to 100%), effective_from date, optional effective_to date.
**FR-SA-FIN-002**: Margin rules must be versioned — editing creates a new version, old version remains with effective_to set.
**FR-SA-FIN-003**: Margin rule comparison must show side-by-side diff of two versions highlighting changed fields.
**FR-SA-FIN-004**: Payout approval must show: total amount, dealer count, calculation basis used, rule version applied per line item.
**FR-SA-FIN-005**: Payout approval must require 2FA and create an immutable audit entry.
**FR-SA-FIN-006**: Dispute resolution must show: original attribution, disputed attribution, evidence from both parties, and override controls.
**FR-SA-FIN-007**: Revenue reports must support drill-down: national → state → dealer → plan → individual transaction.

### 5.5 Commercial Management

| Screen ID | Screen Name | Route | Description |
|-----------|-------------|-------|-------------|
| SA-PRC-001 | Plan Catalog | `/superadmin/pricing` | All subscription plans with versioned pricing |
| SA-PRC-002 | Create/Edit Plan | `/superadmin/pricing/create` | Plan CRUD: name, billing, storage, limits, features, effective date |
| SA-PRC-003 | Plan Version History | `/superadmin/pricing/history` | Version history of plan changes |
| SA-PRC-004 | Entitlement Editor | `/superadmin/pricing/:planId/entitlements` | Configure storage_bytes, gallery_limit, client_limit, team_member_limit |
| SA-CPN-001 | Coupon Policy | `/superadmin/coupons/policy` | Global coupon policy: max discount %, budget caps, allowed types |
| SA-CPN-002 | Coupon List | `/superadmin/coupons` | All coupons (global, state, dealer) with status/performance |
| SA-CPN-003 | Create Coupon | `/superadmin/coupons/create` | Full coupon creation (no scope limits for Super Admin) |
| SA-CPN-004 | Coupon Detail | `/superadmin/coupons/:couponId` | Usage analytics, redemption list, attribution impact |
| SA-CPN-005 | Coupon Analytics | `/superadmin/coupons/analytics` | Aggregate performance: revenue impact, abuse detection |
| SA-SUB-001 | Subscription Overview | `/superadmin/subscriptions` | Billing health, mandate status, renewal monitoring |
| SA-SUB-002 | Subscription Detail | `/superadmin/subscriptions/:userId` | Individual subscription with override controls |
| SA-STR-001 | Streaming Rate Cards | `/superadmin/streaming/rates` | Rate card CRUD with effective dates |
| SA-STR-002 | Create/Edit Rate Card | `/superadmin/streaming/rates/create` | Package definition: duration, viewer cap, price |
| SA-STQ-001 | Storage Quota Policies | `/superadmin/storage/policies` | Plan-level storage rules and enforcement settings |

**Functional Requirements:**

**FR-SA-PRC-001**: Plan changes must be versioned with effective dates — no retroactive changes unless explicit correction workflow.
**FR-SA-PRC-002**: Entitlement changes must propagate to active subscriptions via background sync with progress indicator.
**FR-SA-CPN-001**: Super Admin coupon creation has no scope limits — can create global, state, dealer, plan, or campaign-scoped coupons.
**FR-SA-CPN-002**: Coupon policy must define: max discount %, max flat discount, max budget per coupon, allowed coupon types for Admin/Dealer roles.
**FR-SA-STR-001**: Streaming rate card changes must apply to future purchases only — historical purchases retain original rate.
**FR-SA-SUB-001**: Super Admin can override billing status (e.g., extend trial, waive billing hold) with mandatory audit entry.

### 5.6 Analytics Suite

| Screen ID | Screen Name | Route | Description |
|-----------|-------------|-------|-------------|
| SA-ANL-001 | Executive Dashboard | `/superadmin/analytics/executive` | MRR, ARR, churn, expansion, gross margin after commissions |
| SA-ANL-002 | Signups by State | `/superadmin/analytics/signups` | Geographic acquisition with state-level heatmap |
| SA-ANL-003 | Dealer Analytics | `/superadmin/analytics/dealers` | Dealer contribution, conversion rates, cost-per-acquisition |
| SA-ANL-004 | Product Analytics | `/superadmin/analytics/product` | Feature adoption: galleries, AI, streaming, albums, CRM |
| SA-ANL-005 | Funnel Analytics | `/superadmin/analytics/funnel` | Onboarding → activation → trial → paid → retained |
| SA-ANL-006 | Revenue by Dimension | `/superadmin/analytics/revenue` | Revenue sliced by state / plan / dealer / product / channel |
| SA-ANL-007 | Storage Analytics | `/superadmin/analytics/storage` | Platform-wide and per-tenant storage consumption |
| SA-ANL-008 | Gallery & Engagement | `/superadmin/analytics/engagement` | Gallery views, client interactions, proofing completion |

**Functional Requirements:**

**FR-SA-ANL-001**: All analytics must support date range presets (Today, 7d, 30d, Quarter, YTD, Custom) and export (CSV, PNG chart).
**FR-SA-ANL-002**: Executive dashboard must show gross margin = revenue minus total dealer commissions.
**FR-SA-ANL-003**: State-level heatmap must use India map with intensity shading by selected metric (users, revenue, churn).
**FR-SA-ANL-004**: Funnel analytics must show drop-off % between each stage with drill-down to user lists.

### 5.7 Audit & Compliance

| Screen ID | Screen Name | Route | Description |
|-----------|-------------|-------|-------------|
| SA-AUD-001 | Audit Center | `/superadmin/audit` | All audit logs — operational + financial |
| SA-AUD-002 | Audit Entry Detail | `/superadmin/audit/:entryId` | Full detail with before/after state snapshots |
| SA-AUD-003 | Financial Audit Trail | `/superadmin/audit/financial` | Margin changes, payout approvals, commission overrides |
| SA-AUD-004 | State Change History | `/superadmin/audit/state-changes` | All state change events with snapshots |
| SA-AUD-005 | Audit Export | `/superadmin/audit/export` | Export audit data for compliance reporting |

**Functional Requirements:**

**FR-SA-AUD-001**: Audit logs must be searchable by: date range, actor, action type, target entity, result.
**FR-SA-AUD-002**: Financial audit entries must show before/after values for any changed field.
**FR-SA-AUD-003**: Audit export must support filtered export with date range and category selection.
**FR-SA-AUD-004**: Audit entries are immutable — no edit or delete controls even for Super Admin.

### 5.8 Platform Settings

| Screen ID | Screen Name | Route | Description |
|-----------|-------------|-------|-------------|
| SA-PLT-001 | Feature Flags | `/superadmin/flags` | Full CRUD on feature flags with scope and audience |
| SA-PLT-002 | AI Provider Settings | `/superadmin/ai` | Configure Gemini/Cloud Vision API keys, model selection, usage limits |
| SA-PLT-003 | Maintenance Controls | `/superadmin/maintenance` | Maintenance mode toggle, scheduled maintenance, announcements |
| SA-PLT-004 | Security Settings | `/superadmin/security` | 2FA policies, session timeouts, IP allowlists |
| SA-PLT-005 | Notification Templates | `/superadmin/notifications/templates` | Manage notification templates for all channels |
| SA-PLT-006 | SLA Configuration | `/superadmin/sla` | Define support SLA targets and escalation rules |

---

## 6. UI Components and Patterns

### 6.1 Approval Workflow Dialogs

**Component:** `<ApprovalWorkflow />`
- Used for: payout batch approval, state change approval, dealer application approval
- Multi-step: Review Summary → Confirm Details → 2FA Challenge → Confirm Action
- Shows impact summary before confirmation
- Creates audit entry on completion

**FR-SA-UI-001**: All financial approval dialogs must include a 2FA challenge step.
**FR-SA-UI-002**: Approval dialogs must show a human-readable impact summary (e.g., "This will pay Rs.45,000 to 12 dealers across 5 states").

### 6.2 Version Comparison Views

**Component:** `<VersionComparison />`
- Used for: margin rules, pricing plans, coupon policies
- Side-by-side layout with changed fields highlighted in amber
- Shows: version number, effective dates, author, and diff

**FR-SA-UI-003**: Changed fields must be highlighted with background color and marked with "Changed" badge.
**FR-SA-UI-004**: Version comparison must support selecting any two versions for comparison.

### 6.3 Interactive Territory Map

**Component:** `<TerritoryMap />`
- Interactive India map with state boundaries
- Click state to view/assign dealer
- Color coding: assigned (green), unassigned (gray), disputed (red)
- Tooltip on hover showing: state name, current dealer, photographer count, revenue

**FR-SA-UI-005**: Territory map must support click-to-assign for unassigned states.
**FR-SA-UI-006**: Reassignment must show confirmation with impact details before executing.

### 6.4 Payout Pipeline Visualization

**Component:** `<PayoutPipeline />`
- Kanban-style pipeline: Pending Accrual → Draft Batch → Approved → Processing → Paid → Failed/Reversed
- Cards show: dealer name, amount, state, batch date
- Drag to advance (only for allowed transitions)

**FR-SA-UI-007**: Pipeline cards must be draggable only through valid state transitions.
**FR-SA-UI-008**: Advancing to "Approved" must trigger the approval workflow dialog with 2FA.

### 6.5 Financial Configuration Forms

**Component:** `<MarginRuleForm />`, `<CommissionBasisForm />`
- Multi-field forms with: state selector, plan selector, product type, channel, percentage inputs, date pickers
- Real-time validation (percentages must sum to 100%)
- Preview panel showing impact on sample transactions

**FR-SA-UI-009**: Percentage inputs for dealer/platform split must validate sum = 100% in real-time.
**FR-SA-UI-010**: Preview panel must show 3 sample calculations using the configured rule.

### 6.6 Data Tables with Export

- All list views use `<DataTable />` with: sorting, filtering, column visibility, pagination (10/25/50/100), CSV/Excel export
- Financial tables must format INR using `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`

### 6.7 Confirmation Dialogs for Destructive Actions

- Account deletion, dealer removal, coupon policy changes, maintenance mode activation
- Two-step: "Are you sure?" → 2FA challenge
- Destructive actions use red-themed buttons with explicit consequence text

**FR-SA-UI-011**: Destructive action dialogs must spell out consequences in plain text (not just "Are you sure?").
**FR-SA-UI-012**: Destructive buttons must use red color and explicit labels like "Delete Account Permanently" not just "Delete".

---

## 7. Business Rules and Validation

### 7.1 Actions Requiring 2FA Confirmation

| Action | Screen | Reason |
|--------|--------|--------|
| Approve payout batch | SA-FIN-008 | Financial disbursement |
| Override financial attribution | SA-FIN-009 | Revenue impact |
| Delete user account | SA-USR-005 | Irreversible data loss |
| Reassign state dealer | SA-DLR-006 | Commission recalculation |
| Approve state change request | SA-USR-007 | Attribution change |
| Modify commission basis | SA-FIN-005 | Revenue calculation change |
| Create Super Admin account | SA-USR-003 | Highest privilege grant |
| Toggle maintenance mode | SA-PLT-003 | Platform availability impact |

### 7.2 Irreversible Actions

| Action | Consequence | Safeguard |
|--------|------------|-----------|
| Account deletion | All user data permanently purged | 2FA + explicit typed confirmation |
| Payout marked as "Paid" | Cannot be reversed through UI | Separate reversal workflow required |
| Audit entry creation | Immutable once written | By design |

### 7.3 Versioned Data Requirements

| Data Type | Versioning Rule |
|-----------|----------------|
| Margin ratios | New version on every change; old version gets effective_to date |
| Plan pricing | New version on change; old applies to existing subscribers until renewal |
| Plan entitlements | Versioned; propagated via background sync |
| Commission basis | Versioned with effective dates |
| Coupon policies | Versioned; changes apply to future coupons only |
| Streaming rate cards | Versioned; changes apply to future purchases only |

### 7.4 State Change Governance

**BR-SA-SC-001**: State change requests must show: original state, requested state, Admin recommendation, attribution impact analysis.
**BR-SA-SC-002**: Approving a state change must: set new state, set effective date, snapshot historical attribution, update future attribution, create audit entry.
**BR-SA-SC-003**: State change must NOT recalculate historical transactions unless Super Admin explicitly runs a correction.

### 7.5 Financial Override Rules

**BR-SA-FO-001**: Any financial override must create an audit entry containing: original value, overridden value, reason, evidence reference, Super Admin identity.
**BR-SA-FO-002**: Overrides must not modify historical audit entries — they create new entries that reference the original.

---

## 8. Notifications and Alerts

### 8.1 Super Admin Notification Triggers

| Trigger | Priority | Channel |
|---------|----------|---------|
| Admin escalation received | High | In-app toast + email |
| Payout batch ready for approval | High | In-app toast + email |
| Revenue anomaly detected (>20% deviation) | Critical | In-app persistent + email + SMS |
| Billing failure spike | Critical | In-app persistent + email |
| Dealer application pending >48h | Medium | In-app |
| State change request submitted | Medium | In-app |
| Margin rule approaching expiry | Medium | In-app + email |
| Coupon budget threshold reached | Medium | In-app |
| Security event (failed 2FA, suspicious IP) | Critical | In-app persistent + email + SMS |
| Maintenance window approaching | Low | In-app |
| Feature flag changed by Admin | Low | In-app |
| New Super Admin account created | Critical | In-app + email + SMS |

### 8.2 Escalation Response Workflow

1. Super Admin sees escalation in queue (SA-ESC-001)
2. Opens escalation detail — sees Admin's reason, urgency, context
3. Takes action: Approve (perform the requested action), Reject (deny with reason), Defer (request more information)
4. System notifies originating Admin of the resolution
5. Audit entry created for the escalation lifecycle

**FR-SA-NOT-001**: Critical notifications must bypass all preferences and display as persistent, undismissable toasts.
**FR-SA-NOT-002**: Escalation responses must include resolution notes visible to the originating Admin.

---

## 9. Cross-References

| PRD Section | Super Admin Requirement Coverage |
|-------------|--------------------------------|
| 6.2.1 (Super Admin role) | Section 1 (Role Overview) |
| 8 (State-First Tenancy) | Sections 5.2 (State Change), 7.4 (State Governance) |
| 9.3 (Financial Control Rules) | Section 4 (Access Matrix), 5.4 (Financial Governance) |
| 11 (Dealership Model) | Section 5.3 (Dealer Management) |
| 11.3 (Margin Configuration) | Section 5.4 (SA-FIN-001 to 004) |
| 11.6 (Dealer Payouts) | Section 5.4 (SA-FIN-006 to 009) |
| 12 (Coupon Engine) | Section 5.5 (SA-CPN-001 to 005) |
| 13.8 (Plan Catalog) | Section 5.5 (SA-PRC-001 to 004) |
| 13.9 (Billing Lifecycle) | Section 5.5 (SA-SUB-001 to 002) |
| 26.2 (Streaming Monetization) | Section 5.5 (SA-STR-001 to 002) |
| 28 (Admin Suite) | Entire document — Super Admin is superset |
| 30 (Compliance) | Section 5.7 (Audit Center) |
| 31 (Reporting) | Section 5.6 (Analytics Suite) |
| 38 (Data Model) | Section 7.3 (Versioned Data) |

---

## 10. Acceptance Criteria

### 10.1 Authentication & Access

**AC-SA-001**: Given a Super Admin, when they log in, then they must land on `/superadmin/dashboard` with full sidebar visible.
**AC-SA-002**: Given a Super Admin, when they access any platform URL, then no "Restricted" or "View Only" badges must appear.
**AC-SA-003**: Given a Super Admin, when their session is inspected, then role claims must grant unrestricted API access.

### 10.2 Financial Governance

**AC-SA-004**: Given a Super Admin on Margin Configuration, when they create a new rule for Telangana/Monthly/Subscription at 20% dealer / 80% platform, then the rule must be saved with effective_from date and appear in the rule list.
**AC-SA-005**: Given a Super Admin editing a margin rule, when they save changes, then a new version must be created and the old version must show effective_to = new version's effective_from.
**AC-SA-006**: Given a Super Admin on Payout Approval, when they approve a batch, then they must complete 2FA before the approval is processed.
**AC-SA-007**: Given a Super Admin on Payout Approval, when the batch is approved, then each dealer must see updated payout status in their portal and an audit entry must be created.
**AC-SA-008**: Given a Super Admin on Revenue Reports, when they drill down from national to state to dealer, then revenue figures must aggregate correctly at each level.

### 10.3 Dealership Management

**AC-SA-009**: Given a Super Admin on Territory Map, when they click an unassigned state, then they must see an assignment dialog with dealer search.
**AC-SA-010**: Given a Super Admin reassigning a dealer, when they confirm with 2FA, then affected photographer attribution must be updated and an audit entry created.
**AC-SA-011**: Given a Super Admin reviewing a dealer application, when they approve, then the dealer must receive a notification and gain portal access.

### 10.4 Commercial Management

**AC-SA-012**: Given a Super Admin on Plan Catalog, when they create a new plan with pricing Rs.500/month, 100GB storage, 50 galleries, then the plan must be created with a version and effective date.
**AC-SA-013**: Given a Super Admin changing plan entitlements, when they save, then active subscribers must have entitlements updated via background sync within 15 minutes.
**AC-SA-014**: Given a Super Admin setting coupon policy max discount to 30%, when an Admin tries to create a 35% coupon, then it must be blocked.
**AC-SA-015**: Given a Super Admin creating a streaming rate card, when saved, then it must apply only to future purchases.

### 10.5 State Change & Attribution

**AC-SA-016**: Given a photographer state change request, when Super Admin approves, then future transactions must use the new state and historical transactions must retain original state.
**AC-SA-017**: Given a financial attribution override, when Super Admin overrides, then an audit entry must capture original value, new value, reason, and Super Admin identity.

### 10.6 Audit & Compliance

**AC-SA-018**: Given a Super Admin on Audit Center, when they search for "payout approval" actions, then all matching entries must appear with full before/after detail.
**AC-SA-019**: Given any Super Admin action, when it completes, then an audit entry must be created within 1 second.
**AC-SA-020**: Given a Super Admin attempting to delete an audit entry, then no delete control must exist in the UI.

### 10.7 Platform Settings

**AC-SA-021**: Given a Super Admin toggling maintenance mode, when they confirm with 2FA, then all non-admin users must see a maintenance page.
**AC-SA-022**: Given a Super Admin creating a feature flag, when saved with scope "state:TG", then the flag must only affect users in Telangana.

---

## Requirement Summary

| Category | Count |
|----------|-------|
| Functional Requirements (FR-SA-*) | 42 |
| Business Rules (BR-SA-*) | 8 |
| UI Component Specs (FR-SA-UI-*) | 12 |
| Acceptance Criteria (AC-SA-*) | 22 |
| **Total Testable Requirements** | **84** |

---

*End of Super Admin Role Frontend Requirements Specification*
