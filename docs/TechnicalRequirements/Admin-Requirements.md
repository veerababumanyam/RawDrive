# RawDrive Admin Role — Frontend Requirements Specification

**Version:** 1.0
**Date:** 2026-04-04
**PRD Reference:** `frontend/docs/TechnicalRequirements/PRD.md` (Sections 6.2.2, 9.2, 9.3, 28, 30)
**Related Documents:** `SuperAdmin-Requirements.md`

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
9. [Restricted Actions — Explicit Denials](#9-restricted-actions--explicit-denials)
10. [Cross-References](#10-cross-references)
11. [Acceptance Criteria](#11-acceptance-criteria)

---

## 1. Role Overview

### 1.1 Role Description

The **Admin** role operates as the day-to-day platform operations manager within RawDrive. An Admin handles user support, content moderation, dealer oversight, analytics monitoring, subscription health tracking, and operational reporting without unrestricted financial control.

### 1.2 Who Holds This Role

- Operations managers
- Support team leads
- Moderation supervisors
- Regional operations staff

### 1.3 Critical Boundary — Admin vs Super Admin

| Capability | Admin | Super Admin |
|-----------|-------|-------------|
| Modify margin ratios | NO | YES |
| Change commission basis | NO | YES |
| Approve payout batches | NO | YES |
| Reassign state dealer ownership | NO | YES |
| Modify global pricing | NO | YES |
| Override financial attribution | NO | YES |
| Create Super Admin accounts | NO | YES |
| Modify AI provider config | NO | YES |
| Delete audit logs | NO | YES |
| Set global coupon policy | NO | YES |
| Approve state change requests | NO | YES |
| Modify streaming rate cards | NO | YES |
| Create feature flags | NO | YES |
| Override billing status | NO | YES |
| Manage users (except Super Admin) | YES | YES |
| Full moderation control | YES | YES |
| Full support ticket control | YES | YES |
| View financial reports (read-only) | YES | YES (read/write) |
| Create coupons (within scope) | YES (scoped) | YES (global) |

### 1.4 Escalation Model

When an Admin encounters a restricted action:
1. Display a "Restricted Action" indicator (not a raw 403)
2. Offer "Escalate to Super Admin" button
3. Log the escalation attempt in audit trail
4. Notify the Super Admin

---

## 2. Navigation and Layout

### 2.1 Primary Navigation (Sidebar)

```
[RawDrive Logo]
[Admin Name + Avatar]
[Role Badge: "Admin"]

— OPERATIONS —
  Dashboard
  User Management
  Support Center
  Moderation Center

— BUSINESS —
  Dealer Oversight
  Coupon Operations
  Subscription Monitoring

— INSIGHTS —
  Analytics
  Audit Viewer

— PLATFORM — [read-only badges]
  Financial Reports          [View Only]
  Pricing Catalog            [View Only]
  Payout Viewer              [View Only]
  Feature Flags              [View Only]
  AI Settings                [View Only]

— SYSTEM —
  Notification Center
  My Profile
```

### 2.2 Top Bar

| Element | Description |
|---------|-------------|
| Breadcrumb | Current location path |
| Global Search | Search users, tickets, dealers, coupons, audit |
| Notification Bell | Badge count of unread alerts |
| Escalation Counter | Pending escalations requiring Super Admin |
| Profile Menu | Settings, logout |

**FR-ADM-NAV-001**: Read-only sections must display a lock icon or "View Only" badge.
**FR-ADM-NAV-002**: Escalation counter must update in real-time.
**FR-ADM-NAV-003**: Navigation items Admin has zero access to must be hidden entirely.

---

## 3. Dashboard and Home Screen

### 3.1 KPI Cards

| KPI | Metric | Refresh |
|-----|--------|---------|
| Active Users | Count active in 24h/7d/30d (toggle) | 5 min |
| Open Support Tickets | Total open + average age | Real-time |
| Moderation Queue | Items awaiting review | Real-time |
| Onboarding Funnel | Users per stage | 15 min |
| Trial Conversions | Conversion rate with trend | 1 hour |
| Recent Signups | 24h count with 7-day sparkline | 15 min |

**FR-ADM-DASH-001**: Each KPI card must show comparison vs previous period.
**FR-ADM-DASH-002**: Clicking any KPI navigates to relevant detail screen.

### 3.2 Alert Panel

| Alert Type | Severity |
|-----------|----------|
| Flagged content pending review | High |
| Coupon misuse detected | Medium |
| OTP failure spike (>10% in 1h) | High |
| Upload failure spike (>5% in 1h) | Medium |
| Billing renewal failures | High |
| Dealer application pending | Low |
| User escalation / SLA breach | High |

**FR-ADM-DASH-003**: Alerts must be dismissible with "Mark Reviewed" (logged to audit).
**FR-ADM-DASH-004**: High severity = red border, Medium = amber, Low = blue.

### 3.3 Quick Actions

| Action | Shortcut |
|--------|----------|
| User Lookup | Ctrl+K |
| Ticket Assignment | Ctrl+T |
| Content Moderation | Ctrl+M |
| Create Coupon | Ctrl+C |
| View Escalations | Ctrl+E |

---

## 4. Feature Access Matrix

| Feature Area | Access Level | Create | Read | Update | Delete | Escalation For |
|-------------|-------------|--------|------|--------|--------|---------------|
| User Management | Full (except Super Admin) | — | YES | YES | — | Delete account, assign Super Admin |
| Support Tickets | Full | YES | YES | YES | — | — |
| Content Moderation | Full | — | YES | YES | YES | — |
| Marketplace Moderation | Full | — | YES | YES | YES | — |
| Communication Abuse | Full | — | YES | YES | — | — |
| Dealer Applications | Full (review) | — | YES | YES | — | Reassign ownership |
| Dealer Performance | Read-only | — | YES | — | — | — |
| Dealer Financials | Read-only | — | YES | — | — | Any modification |
| Dealer Territory Map | Read-only | — | YES | — | — | Any modification |
| Financial Reports | Read-only | — | YES | — | — | Any modification |
| Margin Configuration | Denied | — | — | — | — | Super Admin required |
| Pricing Catalog | Read-only | — | YES | — | — | Any modification |
| Coupon Management | Scoped | YES | YES | YES | — | Exceeding policy limits, permanent delete |
| Coupon Policy | Denied | — | — | — | — | Super Admin required |
| Payout Viewer | Read-only | — | YES | — | — | Approval, rejection |
| Subscription Monitoring | Read-only | — | YES | — | — | Override, cancel |
| Streaming Usage | Read-only | — | YES | — | — | Rate card changes |
| Analytics (all) | Full read | — | YES | — | — | — |
| Audit Logs (operational) | Full read | — | YES | — | — | Financial audit export |
| Feature Flags | Scoped toggle | — | YES | Scoped | — | Create, delete, global toggle |
| AI Settings | Read-only | — | YES | — | — | Any modification |
| State Change Requests | Recommend only | YES | YES | — | — | Approval |

---

## 5. Screens and Page Inventory

### 5.1 Operations

| Screen ID | Route | Description |
|-----------|-------|-------------|
| ADM-DASH-001 | `/admin/dashboard` | Operational overview with KPIs, alerts, quick actions |
| ADM-USR-001 | `/admin/users` | Paginated, searchable user list |
| ADM-USR-002 | `/admin/users/:userId` | User profile, subscription, activity, support history |
| ADM-USR-003 | `/admin/users/:userId/suspend` | Suspension form with reason and impact preview |
| ADM-USR-004 | `/admin/users/:userId/roles` | Role management (Super Admin option hidden) |
| ADM-USR-005 | `/admin/users/:userId/financial` | Read-only billing and payment history |

**FR-ADM-USR-001**: User search must support name, email, phone, user ID with 300ms debounce.
**FR-ADM-USR-002**: Suspension must require mandatory reason from predefined list.
**FR-ADM-USR-003**: Role dropdown must NOT include "Super Admin" option.
**FR-ADM-USR-004**: User financial view must have zero edit controls in the DOM.
**FR-ADM-USR-005**: All user management actions logged to audit trail.

### 5.2 Support Center

| Screen ID | Route | Description |
|-----------|-------|-------------|
| ADM-SUP-001 | `/admin/support/tickets` | All tickets with status/priority/assignment filters |
| ADM-SUP-002 | `/admin/support/tickets/:ticketId` | Full thread, user context, assignment, resolution |
| ADM-SUP-003 | `/admin/support/assign` | Bulk assignment with workload view |
| ADM-SUP-004 | `/admin/support/escalations` | Tickets escalated to Super Admin |
| ADM-SUP-005 | `/admin/support/sla` | SLA compliance: first response, resolution time |

**FR-ADM-SUP-001**: Ticket list must support real-time status updates.
**FR-ADM-SUP-002**: SLA timers: green = within, amber = approaching, red = breached.
**FR-ADM-SUP-003**: Escalation to Super Admin requires reason category + description (min 20 chars).

### 5.3 Moderation Center

| Screen ID | Route | Description |
|-----------|-------|-------------|
| ADM-MOD-001 | `/admin/moderation/queue` | All pending moderation, sorted by severity/age |
| ADM-MOD-002 | `/admin/moderation/content/:id` | Content review with actions: approve, warn, remove, suspend, escalate |
| ADM-MOD-003 | `/admin/moderation/marketplace` | Flagged marketplace listings |
| ADM-MOD-004 | `/admin/moderation/abuse` | Communication abuse reports |
| ADM-MOD-005 | `/admin/moderation/history` | Log of all moderation decisions |

**FR-ADM-MOD-001**: Queue sorted by: high severity first, then oldest first.
**FR-ADM-MOD-002**: Every moderation action requires reason from predefined list.
**FR-ADM-MOD-003**: After action, next queue item auto-loads.
**FR-ADM-MOD-004**: All moderation actions create audit log entries.

### 5.4 Dealer Oversight

| Screen ID | Route | Description |
|-----------|-------|-------------|
| ADM-DLR-001 | `/admin/dealers` | All dealers with status, state, performance |
| ADM-DLR-002 | `/admin/dealers/:dealerId` | Dealer profile, metrics (financials read-only) |
| ADM-DLR-003 | `/admin/dealers/applications` | Pending applications with approve/reject |
| ADM-DLR-004 | `/admin/dealers/performance` | Aggregate dealer metrics |
| ADM-DLR-005 | `/admin/dealers/territory` | India map — view-only, no drag/reassign |

**FR-ADM-DLR-001**: Territory map entirely read-only — no drag, reassign, or edit.
**FR-ADM-DLR-002**: Dealer financial data shown as read-only summary cards.
**FR-ADM-DLR-003**: Application approve/reject must trigger notification to applicant.

### 5.5 Coupon Operations

| Screen ID | Route | Description |
|-----------|-------|-------------|
| ADM-CPN-001 | `/admin/coupons` | All coupons with status, usage, expiry |
| ADM-CPN-002 | `/admin/coupons/create` | Create within scoped limits |
| ADM-CPN-003 | `/admin/coupons/:couponId` | Detail with usage analytics |
| ADM-CPN-004 | `/admin/coupons/analytics` | Aggregate coupon performance |

**FR-ADM-CPN-001**: Creation enforces Super Admin policy limits (max %, max amount, max budget).
**FR-ADM-CPN-002**: Exceeding limits blocks submission + shows escalation prompt.
**FR-ADM-CPN-003**: Admin can pause/unpause but NOT permanently delete coupons.
**FR-ADM-CPN-004**: If no coupon policy configured by Super Admin, creation is entirely disabled.

### 5.6 Subscription Monitoring

| Screen ID | Route | Description |
|-----------|-------|-------------|
| ADM-SUB-001 | `/admin/subscriptions` | Billing health overview (read-only) |
| ADM-SUB-002 | `/admin/subscriptions/mandates` | Mandate status distribution |
| ADM-SUB-003 | `/admin/subscriptions/failed` | Failed renewals with reasons |
| ADM-SUB-004 | `/admin/subscriptions/trials` | Trial pipeline with conversion indicators |
| ADM-SUB-005 | `/admin/subscriptions/holds` | Billing-hold accounts |

**FR-ADM-SUB-001**: All subscription screens are purely observational — zero edit/override controls.
**FR-ADM-SUB-002**: Attempting override via URL triggers `<RestrictedActionModal />`.

### 5.7 Analytics

| Screen ID | Route | Description |
|-----------|-------|-------------|
| ADM-ANL-001 | `/admin/analytics/signups` | Registration trends, sources, geography |
| ADM-ANL-002 | `/admin/analytics/funnel` | User journey funnel with drop-off % |
| ADM-ANL-003 | `/admin/analytics/engagement` | DAU/WAU/MAU, session duration |
| ADM-ANL-004 | `/admin/analytics/galleries` | Gallery usage, sharing, storage |
| ADM-ANL-005 | `/admin/analytics/features` | Feature adoption rates |
| ADM-ANL-006 | `/admin/analytics/revenue` | Revenue charts (read-only, no attribution detail) |

**FR-ADM-ANL-001**: Date range presets: Today, 7d, 30d, Quarter, Custom.
**FR-ADM-ANL-002**: Charts exportable as PNG, data as CSV.
**FR-ADM-ANL-003**: Revenue view shows totals only — no margin/commission breakdowns.

### 5.8 Audit & Read-Only Screens

| Screen ID | Route | Description |
|-----------|-------|-------------|
| ADM-AUD-001 | `/admin/audit` | Searchable operational audit logs |
| ADM-AUD-002 | `/admin/audit/:entryId` | Audit entry detail |
| ADM-FIN-001 | `/admin/reports/financial` | Read-only financial dashboards |
| ADM-PRC-001 | `/admin/pricing` | Read-only plan catalog |
| ADM-PAY-001 | `/admin/payouts` | Read-only payout batch list |
| ADM-FLG-001 | `/admin/flags` | Feature flags (scoped toggle only) |
| ADM-AI-001 | `/admin/ai` | Read-only AI config and usage |
| ADM-SCR-001 | `/admin/state-changes` | State change requests (recommend, not approve) |

**FR-ADM-RO-001**: All read-only screens must display persistent "View Only" banner.
**FR-ADM-RO-002**: No `<input>`, `<textarea>`, `<select>`, or `contentEditable` on financial pages.
**FR-ADM-RO-003**: State change detail includes "Submit Recommendation" form (not approval).

---

## 6. UI Components and Patterns

### 6.1 Escalation Badge
- Orange badge with upward-arrow icon — "Escalation Required" or "Awaiting Super Admin"
- Used on restricted items and navigation counters

### 6.2 Read-Only Financial Cards
- Display monetary values with lock icon, no interactive elements
- INR formatted with `Intl.NumberFormat('en-IN')`
- Defense-in-depth: no hidden form inputs in DOM

### 6.3 Moderation Action Bar
- Sticky bottom bar: Approve (green), Warn (amber), Remove (red), Suspend (red), Escalate (orange)
- Keyboard shortcuts: A/W/R/S/E for rapid workflow

### 6.4 Bulk Action Toolbar
- Appears on item selection in list views
- Shows selected count, available actions, select all/deselect
- Confirmation dialog before execution

### 6.5 Restricted Action Modal
- Appears on any denied action — never shows raw 403
- Clear explanation + "Escalate to Super Admin" button
- Pre-populates escalation form with context

### 6.6 Data Tables
- Sorting, filtering, column visibility, pagination (10/25/50/100)
- Filters persist in URL (bookmarkable)
- CSV export for permitted data

### 6.7 SLA Timer Display
- Countdown timer: green (within), amber (approaching), red (breached)
- Integrated into ticket headers

---

## 7. Business Rules and Validation

### 7.1 Coupon Scope Boundaries

**BR-ADM-CPN-001**: Coupons must not exceed max discount % set by Super Admin.
**BR-ADM-CPN-002**: Coupons must not exceed max flat amount set by Super Admin.
**BR-ADM-CPN-003**: Coupons must not exceed max total budget set by Super Admin.
**BR-ADM-CPN-004**: No coupon policy configured = coupon creation fully disabled.

### 7.2 Graceful Access Denial

**BR-ADM-ACC-001**: Direct URL navigation to restricted screens shows `<RestrictedActionModal />` not 403.
**BR-ADM-ACC-002**: Client-side route guards + server-side authorization (server is authoritative).
**BR-ADM-ACC-003**: API 403 responses return structured body: `{ code: "FORBIDDEN", requiredRole: "super_admin", escalationAvailable: true }`.

### 7.3 Moderation Audit

**BR-ADM-MOD-001**: Every moderation action generates immutable audit entry: moderator ID, timestamp, content ID, action, reason.
**BR-ADM-MOD-002**: Suspension additionally logs: duration, notification sent, affected resources.

### 7.4 User Management

**BR-ADM-USR-001**: Cannot suspend another Admin or Super Admin.
**BR-ADM-USR-002**: Suspension shows impact: galleries hidden, events flagged, pending payouts held.
**BR-ADM-USR-003**: Reactivation restores pre-suspension visibility state.

---

## 8. Notifications and Alerts

| Trigger | Priority | Channel |
|---------|----------|---------|
| New support ticket | Medium | In-app |
| SLA approaching breach | High | In-app toast + email |
| SLA breached | Critical | In-app persistent + email |
| Content flag (user-reported) | Medium | In-app |
| Content flag (AI-detected) | High | In-app toast |
| Coupon misuse detected | High | In-app toast + email |
| OTP failure spike | Critical | In-app persistent + email |
| Upload failure spike | High | In-app toast |
| Billing failure spike | High | In-app toast + email |
| Dealer application pending | Low | In-app |
| User escalation | High | In-app toast |
| Escalation response from Super Admin | Medium | In-app toast |

**Priority behavior:**
- Critical: persistent until acknowledged, bypasses preferences
- High: auto-dismiss 30s, always in-app
- Medium: auto-dismiss 10s, respects preferences
- Low: notification list only

---

## 9. Restricted Actions — Explicit Denials

| # | Denied Action | Frontend Enforcement | Backend Enforcement |
|---|-------------|---------------------|-------------------|
| RD-001 | Modify margin ratios | No edit controls rendered | API 403 |
| RD-002 | Change commission basis | No edit controls rendered | API 403 |
| RD-003 | Approve payout batches | No approve button rendered | API 403 |
| RD-004 | Reject/hold payout batches | No buttons rendered | API 403 |
| RD-005 | Reassign state dealer ownership | Map is view-only | API 403 |
| RD-006 | Modify subscription pricing | Page is read-only | API 403 |
| RD-007 | Override financial attribution | No controls visible | API 403 |
| RD-008 | Create Super Admin accounts | Option hidden in dropdown | API 403 |
| RD-009 | Assign Super Admin role | Option hidden in dropdown | API 403 |
| RD-010 | Modify AI provider config | Page is read-only | API 403 |
| RD-011 | Delete audit logs | No delete controls | API 403 |
| RD-012 | Set global coupon policy | No policy UI rendered | API 403 |
| RD-013 | Create coupon exceeding limits | Form validation blocks | API 403/422 |
| RD-014 | Permanently delete coupons | No delete button | API 403 |
| RD-015 | Override billing/mandate status | No override controls | API 403 |
| RD-016 | Cancel subscriptions | No cancel button | API 403 |
| RD-017 | Modify streaming rate cards | No edit controls | API 403 |
| RD-018 | Create feature flags | No create button | API 403 |
| RD-019 | Delete feature flags | No delete controls | API 403 |
| RD-020 | Toggle global feature flags | Toggle disabled with tooltip | API 403 |
| RD-021 | Approve state change requests | No approve button, only recommend | API 403 |
| RD-022 | Delete user accounts | No delete button | API 403 |
| RD-023 | Modify SLA configuration | Read-only display | API 403 |
| RD-024 | Suspend Admin or Super Admin | Action hidden for those roles | API 403 |
| RD-025 | Export financial audit data | Triggers escalation workflow | API requires co-approval |

---

## 10. Cross-References

| PRD Section | Admin Coverage |
|-------------|---------------|
| 6.2.2 (Admin role) | Section 1 (Role Overview) |
| 9.2 (Registration Rules) | Section 7.4 (User Management) |
| 9.3 (Financial Control Rules) | Section 9 (Restricted Actions) |
| 28 (Admin Suite) | Sections 4-5 (Access Matrix, Screens) |
| 30 (Compliance) | Section 5.8 (Audit Viewer) |

---

## 11. Acceptance Criteria

### 11.1 Auth & Access
**AC-ADM-001**: Admin login lands on `/admin/dashboard` with Admin sidebar.
**AC-ADM-002**: Super Admin URLs show restricted action page, not 403.
**AC-ADM-003**: API calls to restricted endpoints return structured 403.

### 11.2 Dashboard
**AC-ADM-004**: All KPI cards display within 3s of page load.
**AC-ADM-005**: Open tickets KPI updates within 60s without refresh.
**AC-ADM-006**: Ctrl+K opens user search modal.

### 11.3 User Management
**AC-ADM-007**: User search results appear within 500ms.
**AC-ADM-008**: Suspension shows impact confirmation dialog.
**AC-ADM-009**: Role dropdown does NOT show "Super Admin".
**AC-ADM-010**: Financial view has zero `<input>` elements in DOM.

### 11.4 Support
**AC-ADM-011**: Breached SLA tickets display red timer and auto-escalate.
**AC-ADM-012**: Escalation requires 20+ character description.

### 11.5 Moderation
**AC-ADM-013**: Queue sorted by severity then age.
**AC-ADM-014**: "Remove Content" requires confirmation with reason.
**AC-ADM-015**: After action, next queue item auto-loads.

### 11.6 Dealer Oversight
**AC-ADM-016**: Territory map has no drag/edit interactions.
**AC-ADM-017**: Dealer financial data displays as read-only text.

### 11.7 Coupons
**AC-ADM-018**: Creating coupon exceeding policy limit blocks + shows escalation.
**AC-ADM-019**: No coupon policy = creation fully disabled with message.
**AC-ADM-020**: No "Delete" button visible on coupon list.

### 11.8 Subscriptions
**AC-ADM-021**: No override/cancel/modify controls exist on subscription pages.
**AC-ADM-022**: Direct URL to override endpoint shows restricted action modal.

### 11.9 Access Denial (Comprehensive)
**AC-ADM-023**: Financial pages have zero form elements in DOM.
**AC-ADM-024**: Browser console API calls to restricted endpoints return 403.
**AC-ADM-025**: Every restricted action modal creates an audit entry.

---

## Requirement Summary

| Category | Count |
|----------|-------|
| Functional Requirements (FR-ADM-*) | 38 |
| Business Rules (BR-ADM-*) | 12 |
| Restricted Action Denials (RD-*) | 25 |
| Acceptance Criteria (AC-ADM-*) | 25 |
| **Total Testable Requirements** | **100** |

---

*End of Admin Role Frontend Requirements Specification*
