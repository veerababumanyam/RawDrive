# RawDrive State Dealer / Distributor Role — Frontend Requirements Specification

**Version:** 1.0
**Date:** 2026-04-04
**PRD Reference:** `frontend/docs/TechnicalRequirements/PRD.md` (Sections 6.2.3, 11, 12, 29, 31)

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

The **State Dealer / Distributor** owns growth for a state or assigned territory. They generate leads, help onboard photographers, distribute coupons, track revenue attribution, and earn state-linked revenue share. Dealers see ONLY their own state's data.

### 1.2 Who Holds This Role

- Local business partner / regional distributor
- State-level growth agent
- Registration: application-based or admin-created

### 1.3 Critical Security Rule

**State-scoped data isolation is absolute.** Every API query, every UI data fetch, every report MUST be scoped to the dealer's assigned `state_code`. A dealer must NEVER see data from another state.

---

## 2. Navigation and Layout

### 2.1 Dealer Portal Navigation

```
[RawDrive Logo]
[Dealer Name + Avatar]
[Role Badge: "Dealer"]
[State Badge: "Telangana" — always visible]

— MY TERRITORY —
  Dashboard
  My Signups
  Active Customers
  Trial Pipeline

— GROWTH TOOLS —
  Coupon Manager
  Referral Links
  Lead Submission

— EARNINGS —
  Earnings Overview
  Payout History
  Payout Disputes
  Statement Downloads

— RESOURCES —
  Training Center
  Support Desk

— ACCOUNT —
  Profile & Bank Details
  Notification Preferences
```

### 2.2 Layout Principles

**FR-DLR-NAV-001**: State badge must be permanently visible in sidebar — dealer cannot change it.
**FR-DLR-NAV-002**: No admin, super-admin, or photographer workspace navigation items visible.
**FR-DLR-NAV-003**: Portal branded as "Dealer Portal" in header.
**FR-DLR-NAV-004**: Responsive layout: desktop sidebar + mobile bottom nav.

---

## 3. Dashboard and Home Screen

### 3.1 Territory KPI Cards

| KPI | Data | Refresh |
|-----|------|---------|
| Attributed Signups (MTD) | New photographers this month from territory | 15 min |
| Attributed Signups (Total) | All-time signups | 1 hour |
| Active Paying Customers | Currently subscribed photographers | 1 hour |
| Trial Users | Active trial users in territory | 15 min |
| Coupon Redemptions (MTD) | Coupons used this month | 15 min |
| Conversion Rate | Trial → paid conversion % | 1 hour |
| Commission Earned (MTD) | Month-to-date earnings | 1 hour |
| Next Payout Estimate | Projected next payout amount | 1 hour |

**FR-DLR-DASH-001**: All KPIs scoped to dealer's assigned state only.
**FR-DLR-DASH-002**: Each card shows trend vs previous month.
**FR-DLR-DASH-003**: Click any KPI to navigate to detail screen.

### 3.2 Activity Feed

- Recent signups from territory
- Coupon redemption events
- Trial conversion events
- Payout status changes

### 3.3 Quick Actions

| Action | Description |
|--------|-------------|
| Generate Coupon | Open coupon creation wizard |
| Submit Lead | Open lead submission form |
| View Payout Status | Navigate to payout history |
| Copy Referral Link | Copy personalized referral link to clipboard |
| Share via WhatsApp | Pre-filled WhatsApp message with referral link |

---

## 4. Feature Access Matrix

| Feature | Access Level | Create | Read | Update | Delete |
|---------|-------------|--------|------|--------|--------|
| Attributed Signups | Read (own state) | — | YES | — | — |
| Active Customers | Read (own state) | — | YES | — | — |
| Trial Pipeline | Read (own state) | — | YES | — | — |
| Coupon Management | Scoped CRUD | YES | YES | YES | — |
| Lead Submission | Create | YES | YES | — | — |
| Referral Links | Create/Read | YES | YES | — | — |
| Earnings Dashboard | Read (own) | — | YES | — | — |
| Payout Status | Read (own) | — | YES | — | — |
| Payout Disputes | Create/Read | YES | YES | — | — |
| Statement Downloads | Read/Export | — | YES | — | — |
| Training Assets | Read | — | YES | — | — |
| Support Tickets | Create/Read | YES | YES | — | — |
| Profile & Bank Details | Full | — | YES | YES | — |
| **User Account Details** | **DENIED** | — | — | — | — |
| **Photographer Workspaces** | **DENIED** | — | — | — | — |
| **Financial Rules/Margins** | **DENIED** | — | — | — | — |
| **Platform Pricing** | **DENIED** | — | — | — | — |
| **Cross-State Data** | **DENIED** | — | — | — | — |
| **Admin Functions** | **DENIED** | — | — | — | — |
| **Gallery/Content** | **DENIED** | — | — | — | — |
| **Audit Logs** | **DENIED** | — | — | — | — |
| **Moderation** | **DENIED** | — | — | — | — |

---

## 5. Screens and Page Inventory

### 5.1 Dashboard

| Screen ID | Route | Description |
|-----------|-------|-------------|
| DLR-DASH-001 | `/dealer/dashboard` | Territory overview with KPIs, activity feed, quick actions |

### 5.2 Territory Data

| Screen ID | Route | Description |
|-----------|-------|-------------|
| DLR-SIG-001 | `/dealer/signups` | Attributed photographers: name, date, plan, status |
| DLR-ACT-001 | `/dealer/customers` | Paying customers: name, plan, subscription date, status |
| DLR-TRL-001 | `/dealer/trials` | Trial users: name, trial start, days remaining, engagement score |

**FR-DLR-TER-001**: Signup list shows only photographers attributed to this dealer via coupon, referral, or state default.
**FR-DLR-TER-002**: All data queries include `WHERE state_code = dealer.state_code` filter.
**FR-DLR-TER-003**: Trial pipeline shows conversion likelihood indicator (Low/Medium/High based on engagement).

### 5.3 Growth Tools

| Screen ID | Route | Description |
|-----------|-------|-------------|
| DLR-CPN-001 | `/dealer/coupons` | Dealer's coupons: code, type, status, usage count, performance |
| DLR-CPN-002 | `/dealer/coupons/create` | Coupon creation wizard within state scope |
| DLR-CPN-003 | `/dealer/coupons/:couponId` | Coupon detail: redemptions, revenue impact |
| DLR-CPN-004 | `/dealer/coupons/analytics` | Aggregate coupon performance |
| DLR-REF-001 | `/dealer/referral` | Generate/manage referral links, copy, WhatsApp share |
| DLR-LED-001 | `/dealer/leads/submit` | Lead submission form |
| DLR-LED-002 | `/dealer/leads` | Submitted leads with follow-up status |

**Coupon Creation Wizard Steps:**
1. **Type**: Select discount type (%, flat, trial extension, etc.)
2. **Scope**: Auto-set to dealer's state — cannot change
3. **Validity**: Start/end date, max total uses, max per user
4. **Amount**: Discount value (within policy limits)
5. **Preview**: Show eligible plans/products, estimated impact
6. **Confirm**: Review and create

**FR-DLR-CPN-001**: Coupon scope auto-locked to dealer's state — no global or cross-state option.
**FR-DLR-CPN-002**: Discount limits enforced by Super Admin coupon policy.
**FR-DLR-CPN-003**: Coupon code auto-generated or manual entry with uniqueness check.
**FR-DLR-CPN-004**: Dealer can pause/disable own coupons but cannot delete.

**FR-DLR-REF-001**: Referral link includes dealer ID for attribution tracking.
**FR-DLR-REF-002**: "Share via WhatsApp" pre-fills message: "Join RawDrive for your photography business! Use my referral link: [link]"
**FR-DLR-REF-003**: Referral link page shows: total clicks, signups via link, conversion rate.

**FR-DLR-LED-001**: Lead form: prospect name, phone, email, city, interest level, notes.
**FR-DLR-LED-002**: Duplicate detection: warn if phone/email already exists in system.

### 5.4 Earnings

| Screen ID | Route | Description |
|-----------|-------|-------------|
| DLR-ERN-001 | `/dealer/earnings` | Commission overview: earned MTD/YTD, calculation breakdown |
| DLR-ERN-002 | `/dealer/earnings/detail` | Line-item commission breakdown per attributed transaction |
| DLR-PAY-001 | `/dealer/payouts` | Payout history: batch status, amount, date |
| DLR-PAY-002 | `/dealer/payouts/:batchId` | Payout batch detail with line items |
| DLR-DIS-001 | `/dealer/payouts/disputes` | Raise clarification, view resolution status |
| DLR-DIS-002 | `/dealer/payouts/disputes/create` | Dispute form: select transaction, describe issue |
| DLR-STM-001 | `/dealer/statements` | Monthly/quarterly statement downloads (PDF) |

**FR-DLR-ERN-001**: Earnings overview shows: gross attributed revenue, commission rate applied, commission earned, TDS withheld, net payable.
**FR-DLR-ERN-002**: Dealer CANNOT see or modify the commission rate/margin rule — only the resulting amount.
**FR-DLR-ERN-003**: Line-item detail shows: photographer name, plan, payment date, gross amount, commission earned.
**FR-DLR-PAY-001**: Payout status pipeline visualization: Pending → Draft → Approved → Processing → Paid → Failed.
**FR-DLR-PAY-002**: Statements downloadable as PDF with dealer header, period, line items, totals.

### 5.5 Earnings Calculator (Simulator)

| Screen ID | Route | Description |
|-----------|-------|-------------|
| DLR-SIM-001 | `/dealer/earnings/simulator` | "If I get X signups at Y plan, I earn Z" |

**FR-DLR-SIM-001**: Calculator uses current commission rates (dealer cannot see the rates directly, only the output).
**FR-DLR-SIM-002**: Inputs: number of signups, plan selection. Output: estimated monthly/annual commission.

### 5.6 Resources & Support

| Screen ID | Route | Description |
|-----------|-------|-------------|
| DLR-TRN-001 | `/dealer/training` | Onboarding materials, sales playbooks, product updates |
| DLR-SUP-001 | `/dealer/support` | Submit tickets, view responses |
| DLR-SUP-002 | `/dealer/support/create` | Support ticket form |

### 5.7 Account

| Screen ID | Route | Description |
|-----------|-------|-------------|
| DLR-PRF-001 | `/dealer/profile` | Contact info, business name, state (read-only) |
| DLR-PRF-002 | `/dealer/profile/bank` | Bank details for payout (with verification workflow) |
| DLR-NOT-001 | `/dealer/notifications` | Notification preferences and history |

**FR-DLR-PRF-001**: State field is read-only — dealer cannot change.
**FR-DLR-PRF-002**: Bank detail changes require phone OTP verification and create audit entry.

---

## 6. UI Components and Patterns

### 6.1 State Scope Indicator
- Permanent badge showing dealer's state (e.g., "Telangana")
- Visible in sidebar and on every data screen
- Reinforces that all data is state-scoped

### 6.2 Coupon Generation Wizard
- Multi-step form: Type → Scope (locked) → Validity → Amount → Preview → Confirm
- Real-time validation against policy limits
- Auto-code generation with copy button

### 6.3 Referral Link Generator
- Generate unique link with dealer attribution
- Copy-to-clipboard button
- WhatsApp share button (pre-filled message)
- QR code for the referral link

### 6.4 Payout Timeline Visualization
- Horizontal pipeline: Pending → Draft → Approved → Processing → Paid
- Current status highlighted
- Estimated dates where available
- Failed/Reversed shown as red branch

### 6.5 Statement PDF Download
- Click to generate and download
- Period selector (monthly/quarterly)
- Printer-friendly format

### 6.6 Earnings Calculator
- Simple input form with slider/number inputs
- Real-time output calculation
- "This is an estimate" disclaimer

### 6.7 Lead Submission Form
- Clean form with: name, phone, email, city, interest, notes
- Duplicate warning toast
- Success confirmation with follow-up reminder option

---

## 7. Business Rules and Validation

### 7.1 State Isolation (Critical)

**BR-DLR-ISO-001**: ALL API calls must include `state_code` filter matching dealer's assignment.
**BR-DLR-ISO-002**: Backend must validate state_code on every request — frontend filter alone is insufficient.
**BR-DLR-ISO-003**: If a dealer's state assignment changes (rare, admin-initiated), active session must be invalidated immediately.
**BR-DLR-ISO-004**: Search/filter results must never include data from other states.

### 7.2 Coupon Constraints

**BR-DLR-CPN-001**: Coupons auto-scoped to dealer's state — cannot create global or other-state coupons.
**BR-DLR-CPN-002**: Discount limits set by Super Admin coupon policy (max %, max flat, max budget).
**BR-DLR-CPN-003**: Coupon code must be unique across entire platform (not just dealer's state).
**BR-DLR-CPN-004**: Dealer can pause/disable own coupons, cannot delete.
**BR-DLR-CPN-005**: Coupon redemptions visible only for own coupons.

### 7.3 Financial Data Visibility

**BR-DLR-FIN-001**: Dealer sees commission amounts, NOT commission rates/percentages.
**BR-DLR-FIN-002**: Dealer sees gross attributed revenue, NOT platform take.
**BR-DLR-FIN-003**: Payout amounts are read-only (calculated by platform).
**BR-DLR-FIN-004**: TDS withholding shown as deduction line item, not configurable.

### 7.4 Bank Detail Changes

**BR-DLR-BNK-001**: Bank detail changes require phone OTP verification.
**BR-DLR-BNK-002**: Bank detail changes create audit entry.
**BR-DLR-BNK-003**: Changed bank details apply to next payout batch (not retroactive).

### 7.5 Lead Management

**BR-DLR-LED-001**: Leads submitted by dealer are attributed to dealer if they convert.
**BR-DLR-LED-002**: Duplicate phone/email shows warning (not hard block — prospect may be legitimate).

---

## 8. Notifications and Alerts

| Trigger | Priority | Channel |
|---------|----------|---------|
| New signup attributed to dealer | Medium | In-app + push |
| Coupon redemption event | Low | In-app |
| Trial user converted to paid | High | In-app + push |
| Payout batch status: Draft → Approved | Medium | In-app + email |
| Payout batch status: Approved → Paid | High | In-app + email + SMS |
| Payout batch status: Failed | Critical | In-app + email + SMS |
| Payout dispute response | Medium | In-app + email |
| Commission adjustment notice | High | In-app + email |
| Coupon approaching expiry (7 days) | Low | In-app |
| Coupon budget threshold (80% used) | Medium | In-app |
| Training material updated | Low | In-app |
| Account status change | High | In-app + email |

---

## 9. Restricted Actions — Explicit Denials

| # | Denied Action | Enforcement |
|---|-------------|-------------|
| RD-DLR-001 | View other states' data | API state_code filter; frontend hides cross-state UI |
| RD-DLR-002 | Modify margin ratios | No access to any admin/financial screens |
| RD-DLR-003 | Alter platform pricing | No access |
| RD-DLR-004 | Access photographer account internals | No gallery/CRM/asset screens |
| RD-DLR-005 | Approve payouts | No approval controls |
| RD-DLR-006 | Create admin/super-admin accounts | No access |
| RD-DLR-007 | Access audit logs | No access |
| RD-DLR-008 | Modify platform settings | No access |
| RD-DLR-009 | Access moderation tools | No access |
| RD-DLR-010 | Create global coupons | Scope locked to own state |
| RD-DLR-011 | Delete coupons permanently | Only pause/disable available |
| RD-DLR-012 | See commission rates/percentages | Only resulting amounts shown |
| RD-DLR-013 | Change own state assignment | Field read-only; changes via admin workflow only |
| RD-DLR-014 | Access other dealers' data | API + frontend isolation |
| RD-DLR-015 | Access photographer galleries/content | No content screens |

---

## 10. Cross-References

| PRD Section | Dealer Coverage |
|-------------|----------------|
| 6.2.3 (Dealer role) | Section 1 |
| 11 (Dealership Model) | Sections 3-5 (Dashboard, Territory, Earnings) |
| 11.2 (Attribution Sources) | Section 5.3 (Referral Links, Coupons) |
| 11.3 (Margin Configuration) | Section 7.3 (not visible to dealer) |
| 11.6 (Dealer Statements) | Section 5.4 (Earnings, Payouts) |
| 12 (Coupon Engine) | Section 5.3 (Coupon Manager) |
| 29 (Dealer Portal) | Entire document |
| 31.3 (Dealer Reporting) | Section 5.4 (Earnings) |

---

## 11. Acceptance Criteria

### 11.1 State Isolation
**AC-DLR-001**: Given a Telangana dealer, when any API call is made, then results must contain ONLY Telangana data.
**AC-DLR-002**: Given a Telangana dealer, when they search for a photographer from Maharashtra, then zero results must return.
**AC-DLR-003**: Given a dealer, when they view their profile, then state field must be read-only.

### 11.2 Dashboard
**AC-DLR-004**: Given a dealer on dashboard, when page loads, then all KPIs must show state-scoped data within 3s.
**AC-DLR-005**: Given a dealer, when a photographer signs up using their coupon, then "Attributed Signups" KPI must update within 15 minutes.

### 11.3 Coupons
**AC-DLR-006**: Given a dealer creating a coupon, when scope field renders, then it must show dealer's state and be non-editable.
**AC-DLR-007**: Given Super Admin sets max 30% discount, when dealer enters 35%, then form must block submission.
**AC-DLR-008**: Given a dealer on coupon list, when they search for "Delete", then no delete option exists.
**AC-DLR-009**: Given a dealer's coupon is redeemed, then redemption appears in coupon detail within 15 minutes.

### 11.4 Referral Links
**AC-DLR-010**: Given a dealer generating a referral link, when a photographer signs up via that link, then signup must be attributed to the dealer.
**AC-DLR-011**: Given a dealer clicking "Share via WhatsApp", then a pre-filled message with the referral link must open.

### 11.5 Earnings & Payouts
**AC-DLR-012**: Given a dealer on earnings, when they view commission earned, then the commission rate/percentage must NOT be visible — only the resulting amount.
**AC-DLR-013**: Given a dealer on payout history, when a batch moves to "Paid", then the dealer receives email + SMS notification.
**AC-DLR-014**: Given a dealer raising a payout dispute, then Super Admin must see the dispute in their queue.
**AC-DLR-015**: Given a dealer downloading a statement, then it must be a PDF with dealer name, period, line items, and totals.

### 11.6 Bank Details
**AC-DLR-016**: Given a dealer changing bank details, when they submit, then OTP verification must be required.
**AC-DLR-017**: Given bank details changed, then an audit entry must be created.

### 11.7 Access Denials
**AC-DLR-018**: Given a dealer, when they navigate to any `/admin/*` or `/superadmin/*` URL, then they must receive a 403 or redirect.
**AC-DLR-019**: Given a dealer, when they use browser dev tools to call admin API endpoints, then API must return 403.
**AC-DLR-020**: Given a dealer, when they view any data screen, then no data from other states must appear.

---

## Requirement Summary

| Category | Count |
|----------|-------|
| Functional Requirements (FR-DLR-*) | 28 |
| Business Rules (BR-DLR-*) | 16 |
| Restricted Action Denials (RD-DLR-*) | 15 |
| Acceptance Criteria (AC-DLR-*) | 20 |
| **Total Testable Requirements** | **79** |

---

*End of State Dealer Role Frontend Requirements Specification*
