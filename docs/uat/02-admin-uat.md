# Admin (Platform Operations) — User Acceptance Testing

**Persona:** Admin — day-to-day platform operations manager
**Requirements source:** `docs/TechnicalRequirements/Admin-Requirements.md` (FR-ADM-*, BR-ADM-*, RD-*, AC-ADM-*)
**Supporting specs:** `Security_Compliance_Privacy.md`, `Revenue_Dealership_Engine.md`, `Razorpay_Payment_Gateway_Integration.md`
**Primary handles under test:** `@admin_ops` (general ops), `@admin_mod` (moderation-scoped)
**Build under test:** v0.0.40 (M17 Hardening Wave 5)
**Owner:** Head of Operations
**Read first:** [`README.md`](README.md)

---

## 1. Core assumption — what Admin is, and isn't

Admin is an **operational** role. It handles the grinding day-to-day: user support, content moderation, dealer oversight, analytics monitoring, subscription health, and operational reporting. It is **not** a financial role. The line between Admin and Super Admin is absolute:

| Can Admin do… | Answer |
|---|---|
| Modify margin ratios? | **No** — Super Admin only |
| Approve payout batches? | **No** |
| Reassign state dealer ownership? | **No** |
| Modify global pricing? | **No** |
| Delete audit logs? | **No** |
| Create Super Admin accounts? | **No** |
| Manage users (except Super Admins)? | **Yes** |
| Moderate content? | **Yes** |
| Read financial reports? | **Yes, read-only** |
| Create coupons? | **Yes — within the Super Admin policy envelope** |

The entire UAT treats **denial of restricted actions as first-class test cases**, not afterthoughts — a 403 leak from Admin into Super Admin territory is a release blocker.

---

## 2. Pre-flight

Same as Photographer §2 plus:
- Seeded 5+ active dealers, 20+ photographers across ≥ 3 states.
- At least 3 pending support tickets (varied priorities) and 2 flagged content items in the moderation queue.
- Super Admin coupon policy seeded: `max_discount_pct=30`, `max_flat_amount=2000`, `max_total_budget=100000`.

---

## Table of modules

| Module | Area | Scenarios |
|---|---|---|
| [A](#module-a--authentication--access-boundary-a01-a08) | Authentication & access boundary | A01–A08 |
| [B](#module-b--dashboard--alerts-b01-b08) | Dashboard & alerts | B01–B08 |
| [C](#module-c--user-management-c01-c12) | User management | C01–C12 |
| [D](#module-d--support-centre--sla-d01-d08) | Support Centre & SLA | D01–D08 |
| [E](#module-e--moderation-centre-e01-e10) | Moderation Centre | E01–E10 |
| [F](#module-f--dealer-oversight-read-only-f01-f08) | Dealer oversight (read-only) | F01–F08 |
| [G](#module-g--coupon-operations-scoped-g01-g10) | Coupon operations (scoped) | G01–G10 |
| [H](#module-h--subscription-monitoring-read-only-h01-h07) | Subscription monitoring | H01–H07 |
| [I](#module-i--analytics-i01-i06) | Analytics | I01–I06 |
| [J](#module-j--audit-viewer-operational-j01-j05) | Audit viewer (operational) | J01–J05 |
| [K](#module-k--read-only-screens-k01-k07) | Read-only: financial / pricing / payout / AI / feature flags | K01–K07 |
| [L](#module-l--escalation-workflow-l01-l06) | Escalation workflow | L01–L06 |
| [M](#module-m--restricted-actions-negative-m01-m25) | Restricted actions (RD-001 → RD-025) | M01–M25 |
| [N](#module-n--cross-persona-flows-n01-n03) | Cross-persona flows | N01–N03 |

---

## Module A — Authentication & access boundary (A01–A08)

| ID | P | Title |
|---|---|---|
| A01 | P0 | Admin login lands on `/admin/dashboard` with Admin sidebar |
| A02 | P0 | Admin sidebar contains only operations + read-only sections (no Super Admin items) |
| A03 | P0 | Read-only sections display "View Only" badge or lock icon |
| A04 | P0 | Direct URL navigation to `/superadmin/*` shows `<RestrictedActionModal />`, **not** a raw 403 |
| A05 | P0 | API call to restricted endpoint returns structured body: `{ code: "FORBIDDEN", requiredRole: "super_admin", escalationAvailable: true }` |
| A06 | P1 | Admin TOTP enrolled and enforced at login per security policy |
| A07 | P1 | Session timeout per Super Admin configured value (default per security policy) |
| A08 | P1 | Logout revokes refresh token; previously-captured access token rejected within rotation window |

### A04 — Graceful denial
- **Refs:** BR-ADM-ACC-001, AC-ADM-002.
- **Steps:** as `@admin_ops`, paste `/superadmin/payouts` into the address bar.
- **Expected:** modal appears with the reason, an "Escalate to Super Admin" button, and the page *does not* render any data from the restricted route. No 403 page, no stack trace.
- **Pass:** modal is triggered client-side before the API is hit; API is hit as a guard, and returns 403 with the structured body from A05.

---

## Module B — Dashboard & alerts (B01–B08)

| ID | P | Title | Ref |
|---|---|---|---|
| B01 | P0 | All KPI cards render within 3 s of page load | AC-ADM-004 |
| B02 | P1 | KPI cards show comparison vs previous period + trend arrow | FR-ADM-DASH-001 |
| B03 | P1 | Clicking any KPI navigates to the relevant detail screen | FR-ADM-DASH-002 |
| B04 | P0 | Open-tickets KPI updates within 60 s without full refresh | AC-ADM-005 |
| B05 | P1 | Alert panel colour-codes severity: High=red, Medium=amber, Low=blue | FR-ADM-DASH-004 |
| B06 | P1 | "Mark Reviewed" on an alert dismisses it AND writes an audit entry | FR-ADM-DASH-003 |
| B07 | P1 | `Ctrl+K` opens the user search modal | AC-ADM-006 |
| B08 | P1 | Dashboard survives backend 500 on one KPI without taking the whole page down |

---

## Module C — User management (C01–C12)

| ID | P | Title |
|---|---|---|
| C01 | P0 | User search by name, email, phone, user ID, with ≤ 500 ms debounce |
| C02 | P0 | User detail shows subscription, activity, ticket history |
| C03 | P0 | Role dropdown does NOT include "Super Admin" option |
| C04 | P0 | Suspend user requires a reason from a predefined list |
| C05 | P1 | Suspension preview shows impact: galleries hidden, events flagged, pending payouts held |
| C06 | P0 | Reactivation restores pre-suspension visibility state |
| C07 | P0 | User financial view has **zero** `<input>`, `<textarea>`, `<select>`, or `contentEditable` elements in DOM |
| C08 | P0 | Cannot suspend Admin or Super Admin accounts — action hidden or disabled for those roles |
| C09 | P0 | "Delete account" action is NOT present for Admin (deletion is Super Admin only) |
| C10 | P1 | DSAR "Export user data" button generates a ZIP (JSON metadata + media links) |
| C11 | P1 | DSAR "Right to erasure" queues 30-day purge with confirmation + audit entry |
| C12 | P1 | All user-management actions logged to audit trail |

### C07 — DOM-level read-only enforcement (defence in depth)
- **Refs:** FR-ADM-USR-004, AC-ADM-010, AC-ADM-023.
- **Steps:** open user financial view for `@pho_pro`. Run `document.querySelectorAll('input, textarea, select, [contenteditable="true"]').length` in DevTools console.
- **Expected:** returns `0`. Read-only must be enforced in the DOM, not just disabled via CSS.
- **Pass:** zero editable elements; network panel shows only GET requests on page load.

### C10 / C11 — DSAR flows
- **Refs:** `Security_Compliance_Privacy.md` §3.1 (GDPR), §2.1/2.2 (DPDPA).
- **Steps:** Open `@pho_starter` user detail → Privacy → Export data. Separately, submit erasure request.
- **Expected (export):** ZIP download contains `profile.json`, `galleries.json`, `contacts.json`, `media_links.json`, `audit_excerpt.json`. Mailpit receives confirmation email.
- **Expected (erasure):** 30-day grace countdown starts; `users.deletion_scheduled_at` set; audit entry `dsar.erasure.scheduled`; Admin cannot cancel (only Super Admin or user themselves).

---

## Module D — Support Centre & SLA (D01–D08)

| ID | P | Title | Ref |
|---|---|---|---|
| D01 | P0 | Ticket list supports status/priority/assignment filters | FR-ADM-SUP-001 |
| D02 | P0 | SLA timers show green / amber / red correctly | FR-ADM-SUP-002 |
| D03 | P0 | Breached-SLA tickets display red timer and auto-escalate flag | AC-ADM-011 |
| D04 | P1 | Bulk assignment form shows workload per assignee |
| D05 | P1 | Ticket resolution triggers notification to the user |
| D06 | P1 | Escalation to Super Admin requires a reason category + ≥ 20-character description | FR-ADM-SUP-003, AC-ADM-012 |
| D07 | P1 | SLA compliance dashboard shows first-response & resolution-time percentiles |
| D08 | P1 | "Privacy Support" ticket category is available (DPDPA §2.1.3 grievance redressal) |

---

## Module E — Moderation Centre (E01–E10)

| ID | P | Title |
|---|---|---|
| E01 | P0 | Queue sorted by severity DESC then age ASC |
| E02 | P0 | Every moderation action (approve/warn/remove/suspend/escalate) requires a reason from list |
| E03 | P0 | "Remove content" needs explicit confirmation dialog |
| E04 | P0 | After any action, next queue item auto-loads |
| E05 | P0 | Every moderation action creates an immutable audit entry |
| E06 | P1 | Keyboard shortcuts: A/W/R/S/E match moderation action bar |
| E07 | P1 | Marketplace moderation queue separated from content queue |
| E08 | P1 | Communication abuse reports queue available and actionable |
| E09 | P1 | Moderation history page filterable by moderator + action + date |
| E10 | P1 | AI-detected flags (upload abuse screening) show the detection signal + confidence |

### E05 — Audit immutability check
- **Refs:** BR-ADM-MOD-001, AC-ADM-025.
- **Steps:** warn a user, then attempt to edit or delete the resulting audit entry through the UI or via `DELETE /api/v1/admin/audit/:id`.
- **Expected:** UI has no edit/delete. API returns 403 with `{code:"AUDIT_IMMUTABLE"}`.

---

## Module F — Dealer oversight (read-only) (F01–F08)

| ID | P | Title |
|---|---|---|
| F01 | P0 | Dealer list shows all dealers with state, status, performance |
| F02 | P0 | Dealer detail financial section displays as read-only text (no edit controls) |
| F03 | P0 | Territory map (`/admin/dealers/territory`) is entirely read-only — **no drag, no reassign** |
| F04 | P0 | Any attempt to edit margin via API is denied |
| F05 | P1 | Dealer application review: approve/reject triggers notification to applicant |
| F06 | P1 | Aggregate dealer performance metrics visible |
| F07 | P1 | Filter dealers by state, by status, by performance band |
| F08 | P1 | Click-through to read-only dealer financial summary |

### F03 — Territory map read-only
- **Refs:** FR-ADM-DLR-001, AC-ADM-016.
- **Steps:** open territory map. Attempt to drag a state label onto another dealer card. Attempt to right-click a state for a menu.
- **Expected:** drag has no effect, no context menu; DevTools shows no `draggable="true"` attributes on state elements. Page contains zero form controls.

---

## Module G — Coupon operations (scoped) (G01–G10)

| ID | P | Title | Ref |
|---|---|---|---|
| G01 | P0 | Create coupon within Super Admin policy limits — succeeds | BR-ADM-CPN-001 |
| G02 | P0 | Create coupon **exceeding** max discount % — blocked with escalation prompt | AC-ADM-018 |
| G03 | P0 | Create coupon **exceeding** max flat amount — blocked | BR-ADM-CPN-002 |
| G04 | P0 | Create coupon **exceeding** total budget cap — blocked | BR-ADM-CPN-003 |
| G05 | P0 | With no coupon policy configured, creation is disabled entirely with clear message | BR-ADM-CPN-004, AC-ADM-019 |
| G06 | P0 | No permanent delete available — only pause/unpause | FR-ADM-CPN-003, AC-ADM-020 |
| G07 | P1 | Coupon detail shows usage analytics (redemptions, attribution, revenue impact) |
| G08 | P1 | Aggregate coupon performance visible |
| G09 | P1 | Coupon codes unique across platform — duplicate rejected |
| G10 | P1 | Coupon attribution source (`source_id`) defaults to the Admin creating it, not a dealer |

### G02 — Exceed policy block
- **Preconditions:** policy says `max_discount_pct=30`.
- **Steps:** create a coupon with 35 %.
- **Expected:** form blocks submit, inline error "exceeds 30 % policy cap", "Escalate to Super Admin" CTA offered. API (if called directly) returns 422 with `{code:"POLICY_LIMIT_EXCEEDED", limit:30, requested:35}`.

---

## Module H — Subscription monitoring (read-only) (H01–H07)

| ID | P | Title |
|---|---|---|
| H01 | P0 | Subscription overview loads with health summary |
| H02 | P0 | Mandate status distribution shown, read-only |
| H03 | P0 | Failed-renewals list with reason codes |
| H04 | P0 | Trial pipeline with conversion indicators |
| H05 | P0 | Billing-hold accounts list |
| H06 | P0 | **No** override, cancel, or modify controls anywhere in subscription pages |
| H07 | P0 | Direct URL to override endpoint shows restricted action modal |

Every row is P0 because the subscription pages sit next to real money — any write capability here would be a compliance incident.

---

## Module I — Analytics (I01–I06)

| ID | P | Title |
|---|---|---|
| I01 | P0 | Signups, engagement, funnel, galleries, features, revenue views all render |
| I02 | P1 | Date range presets (Today, 7d, 30d, Quarter, Custom) |
| I03 | P1 | Export charts to PNG and data to CSV |
| I04 | P0 | Revenue view shows **totals only** — no margin or commission breakdowns | FR-ADM-ANL-003 |
| I05 | P1 | Funnel drop-offs clickable to drill into user list |
| I06 | P1 | Feature adoption rates render per plan tier |

---

## Module J — Audit viewer (operational) (J01–J05)

| ID | P | Title |
|---|---|---|
| J01 | P0 | Operational audit log searchable by date, actor, action, target |
| J02 | P0 | Audit entry detail shows before/after values for state changes |
| J03 | P0 | **Financial audit** entries are NOT visible to Admin — only Super Admin |
| J04 | P1 | Export operational audit to CSV (financial export requires escalation) |
| J05 | P1 | Audit log retention matches compliance policy (≥ 1 year per SOC2) |

---

## Module K — Read-only screens (K01–K07)

Verify every persistently-denied surface behaves as advertised — these are where defensive depth matters most.

| ID | P | Screen | Check |
|---|---|---|---|
| K01 | P0 | Financial Reports | Persistent "View Only" banner; zero form elements in DOM |
| K02 | P0 | Pricing Catalog | Read-only; no Create / Edit buttons |
| K03 | P0 | Payout Viewer | No Approve/Reject/Hold buttons; batch status visible |
| K04 | P0 | Feature Flags | Scoped toggle only; no Create/Delete controls |
| K05 | P0 | AI Provider Settings | Read-only; keys masked; no save button |
| K06 | P1 | State Change Requests | Admin can "Recommend" only, never "Approve" |
| K07 | P1 | Streaming Rate Cards | Read-only; rate values visible, no edit |

---

## Module L — Escalation workflow (L01–L06)

| ID | P | Title |
|---|---|---|
| L01 | P0 | Admin can raise an escalation with reason category + ≥ 20-char description |
| L02 | P0 | Escalation lands in Super Admin queue within 5 s |
| L03 | P1 | Admin sees the escalation in their own "Outbound escalations" list with status |
| L04 | P1 | When Super Admin responds (approve/reject/defer), originating Admin is notified |
| L05 | P1 | Escalation counter on top bar updates in real time |
| L06 | P1 | Escalation lifecycle (create → respond → close) is fully audited |

### L02 — End-to-end escalation smoke [cross-persona]
- **Partners:** Admin tester + Super Admin tester.
- **Steps:** Admin attempts to create a 50 % coupon, hits the policy cap, clicks Escalate, fills reason "growth campaign for new state launch — 50 % short-term cap requested for Q2 test", submits.
- **Expected:** Super Admin escalation queue shows the new item within 5 s. Super Admin can approve → Admin sees "Your escalation was approved" toast + email. Coupon is *not* auto-created — Admin must re-submit within the now-granted exception.

---

## Module M — Restricted actions (negative) (M01–M25)

Every row below corresponds to one **RD-***ID from `Admin-Requirements.md` §9. All are P0. Testing is two-step: (a) try via the UI, (b) try via direct API.

| ID | RD ref | Denied action | UI expected | API expected |
|---|---|---|---|---|
| M01 | RD-001 | Modify margin ratios | No edit controls | 403 |
| M02 | RD-002 | Change commission basis | No edit controls | 403 |
| M03 | RD-003 | Approve payout batch | No Approve button | 403 |
| M04 | RD-004 | Reject/hold payout batch | No buttons | 403 |
| M05 | RD-005 | Reassign state dealer | Map view-only | 403 |
| M06 | RD-006 | Modify subscription pricing | Read-only | 403 |
| M07 | RD-007 | Override financial attribution | No controls | 403 |
| M08 | RD-008 | Create Super Admin account | Role hidden in dropdown | 403 |
| M09 | RD-009 | Assign Super Admin role | Role hidden | 403 |
| M10 | RD-010 | Modify AI provider config | Read-only | 403 |
| M11 | RD-011 | Delete audit log entry | No delete controls | 403 / `AUDIT_IMMUTABLE` |
| M12 | RD-012 | Set global coupon policy | No policy UI | 403 |
| M13 | RD-013 | Create coupon exceeding limits | Form blocks | 422 `POLICY_LIMIT_EXCEEDED` |
| M14 | RD-014 | Permanently delete coupons | No delete button | 403 |
| M15 | RD-015 | Override billing / mandate status | No override | 403 |
| M16 | RD-016 | Cancel subscription | No cancel button | 403 |
| M17 | RD-017 | Modify streaming rate cards | Read-only | 403 |
| M18 | RD-018 | Create feature flag | No create button | 403 |
| M19 | RD-019 | Delete feature flag | No delete button | 403 |
| M20 | RD-020 | Toggle global feature flag | Toggle disabled w/ tooltip | 403 |
| M21 | RD-021 | Approve state change request | Only Recommend available | 403 |
| M22 | RD-022 | Delete user account | No delete button | 403 |
| M23 | RD-023 | Modify SLA configuration | Read-only | 403 |
| M24 | RD-024 | Suspend Admin / Super Admin | Action hidden | 403 |
| M25 | RD-025 | Export financial audit data | Triggers escalation | Requires co-approval |

**All 25 are release gates.** Any leak is a stop-the-line defect.

---

## Module N — Cross-persona flows (N01–N03)

### N01 — [cross-persona] Admin suspends → photographer sees enforcement → Admin reactivates
- Participants: Admin + Photographer testers.
- Admin suspends `@pho_starter` with reason "content violation". Photographer on another session reloads any gallery page → sees "Account suspended" banner and cannot upload or share. Admin reactivates → photographer refreshes → access restored; all prior galleries still visible per BR-ADM-USR-003.

### N02 — [cross-persona] Admin → Super Admin escalation round-trip
- Participants: Admin + Super Admin testers.
- See L02.

### N03 — [cross-persona] Admin resolves a Client support ticket
- Participants: Admin + Client testers.
- Client files a support ticket (via Client UAT `C-SUP-01`). Admin opens the ticket, assigns themselves, resolves with a templated response. Client receives email and sees the resolution in their account.

---

## Regression gate

Run every cycle before sign-off:
- A04 (graceful denial), A05 (structured 403 body)
- C07 (DOM read-only), C08 (cannot suspend peers)
- E05 (audit immutability)
- F03 (territory map read-only)
- G02 / G05 (coupon policy enforcement)
- H06 (no override controls)
- All of Module M (25 restricted actions)

---

## Result log

| Scenario ID | Tester | Build hash | Date | Result | Defect ID | Evidence |
|---|---|---|---|---|---|---|
| A01 |  |  |  |  |  |  |
| … |  |  |  |  |  |  |
| M25 |  |  |  |  |  |  |

---

## Sign-off

| Role | Name | Build hash | Date | Signature |
|---|---|---|---|---|
| Admin UAT Lead |  |  |  |  |
| Head of Operations |  |  |  |  |
| CISO / Compliance Officer |  |  |  |  |
| QA Lead |  |  |  |  |

---

*End of Admin UAT*
