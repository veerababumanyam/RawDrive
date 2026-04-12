# State Dealer / Distributor — User Acceptance Testing

**Persona:** State Dealer — owns growth for one assigned state/territory
**Requirements source:** `docs/TechnicalRequirements/StateDealer-Requirements.md` (FR-DLR-*, BR-DLR-*, RD-DLR-*, AC-DLR-*)
**Supporting specs:** `Revenue_Dealership_Engine.md`
**Primary handles:** `@dealer_tg` (Telangana — used in most positive tests), `@dealer_mh` (Maharashtra — used to *prove* isolation)
**Build under test:** v0.0.40 (M17 Hardening Wave 5)
**Owner:** Head of Revenue
**Read first:** [`README.md`](README.md)

---

## 1. Two principles that define every test

1. **State isolation is absolute.** A Telangana dealer must never see a single row from any other state. Every list, every search, every API response, every aggregate number is implicitly scoped by `state_code = dealer.state_code`. Cross-contamination is a P0 compliance failure.
2. **Commission math is opaque.** Dealers see resulting amounts, never the rate/percentage that produced them. This is not a presentation preference — it's a governance rule so dealers can't reverse-engineer or litigate the formula.

---

## 2. Pre-flight

Standard environment (see `README.md` §3) plus:
- `@dealer_tg` is assigned to Telangana, `@dealer_mh` to Maharashtra.
- At least 10 photographers seeded in Telangana and 10 in Maharashtra (so isolation tests have data on both sides of the line).
- At least one payout batch in status `draft` and one in status `paid`, both containing line items for `@dealer_tg`.
- Super Admin coupon policy: `max_discount_pct=30`, `max_flat_amount=2000`.

---

## Table of modules

| Module | Area | Scenarios |
|---|---|---|
| [A](#module-a--authentication--session) | Authentication & session | A01–A05 |
| [B](#module-b--dashboard--kpis-state-scoped) | Dashboard & KPIs (state-scoped) | B01–B08 |
| [C](#module-c--territory-data-signups-customers-trials) | Territory data: signups, customers, trials | C01–C07 |
| [D](#module-d--coupon-management-scoped) | Coupon management (scoped) | D01–D10 |
| [E](#module-e--referral-links) | Referral links & WhatsApp share | E01–E06 |
| [F](#module-f--lead-submission) | Lead submission | F01–F05 |
| [G](#module-g--earnings--payouts) | Earnings & payouts | G01–G10 |
| [H](#module-h--payout-disputes) | Payout disputes | H01–H04 |
| [I](#module-i--statements--earnings-calculator) | Statements & earnings simulator | I01–I05 |
| [J](#module-j--account--bank-details) | Account & bank details (OTP-gated) | J01–J06 |
| [K](#module-k--resources-training--support) | Resources, training & support | K01–K04 |
| [L](#module-l--state-isolation-negative) | State isolation (negative) | L01–L08 |
| [M](#module-m--restricted-actions-negative) | Restricted actions (negative) | M01–M15 |
| [N](#module-n--cross-persona-flows) | Cross-persona flows | N01–N03 |

---

## Module A — Authentication & session

| ID | P | Title |
|---|---|---|
| A01 | P0 | Dealer login lands on `/dealer/dashboard` with dealer sidebar |
| A02 | P0 | Sidebar contains only dealer-scope items (no admin, super-admin, photographer items) |
| A03 | P0 | State badge permanently visible in sidebar (e.g. "Telangana") |
| A04 | P1 | Dealer TOTP MFA enrolled and enforced on login |
| A05 | P1 | Logout revokes refresh token immediately |

---

## Module B — Dashboard & KPIs (state-scoped)

| ID | P | Title | Ref |
|---|---|---|---|
| B01 | P0 | All KPIs load within 3 s | AC-DLR-004 |
| B02 | P0 | KPIs: Attributed Signups (MTD), Attributed Signups (Total), Active Paying Customers, Trial Users, Coupon Redemptions (MTD), Conversion Rate, Commission Earned (MTD), Next Payout Estimate |
| B03 | P0 | Every KPI number reflects only Telangana data for `@dealer_tg` | AC-DLR-001 |
| B04 | P1 | Each card shows trend vs previous month |
| B05 | P1 | Click any KPI → corresponding detail screen |
| B06 | P1 | Activity feed shows recent signups, coupon redemptions, trial conversions, payout status changes |
| B07 | P1 | Quick actions visible: Generate Coupon, Submit Lead, View Payouts, Copy Referral Link, Share WhatsApp |
| B08 | P0 | Commission Earned value matches G02 line-item sum |

---

## Module C — Territory data

| ID | P | Title |
|---|---|---|
| C01 | P0 | My Signups page lists photographers attributed to the dealer (via coupon / referral / state default) |
| C02 | P0 | Active Customers page lists only paying photographers in own state |
| C03 | P0 | Trial pipeline shows trial start, days remaining, engagement score |
| C04 | P1 | Filter and search work within own state only |
| C05 | P0 | Export CSV contains **zero** rows from other states |
| C06 | P1 | Trial conversion likelihood indicator (Low/Medium/High) renders |
| C07 | P1 | Drill-down on signup detail shows plan, signup date, attribution source |

---

## Module D — Coupon management (scoped)

| ID | P | Title | Ref |
|---|---|---|---|
| D01 | P0 | Coupon list shows only dealer's own coupons |
| D02 | P0 | Create coupon wizard: Type → Scope (locked to TG) → Validity → Amount → Preview → Confirm |
| D03 | P0 | Scope field is locked to dealer's state — cannot be changed | AC-DLR-006 |
| D04 | P0 | Discount value within Super Admin policy succeeds |
| D05 | P0 | Discount value exceeding policy blocks submit with inline error | AC-DLR-007 |
| D06 | P0 | Coupon codes unique across the platform — duplicate rejected |
| D07 | P0 | Pause / disable own coupons allowed; no permanent delete | BR-DLR-CPN-004, AC-DLR-008 |
| D08 | P1 | Coupon detail shows redemptions, revenue impact |
| D09 | P0 | Redemptions on own coupon appear in coupon detail within 15 min | AC-DLR-009 |
| D10 | P1 | Coupon analytics aggregate performance |

### D05 — Policy cap enforcement
- **Steps:** create a 35 % coupon (policy cap = 30 %).
- **Expected:** form blocks submit; inline error "exceeds 30 % policy cap set by Super Admin"; no API call attempted OR API returns 422 with the same code.

---

## Module E — Referral links & WhatsApp share

| ID | P | Title |
|---|---|---|
| E01 | P0 | Generate a referral link tied to dealer's ID |
| E02 | P0 | Link click → signup registers as attributed to this dealer | AC-DLR-010 |
| E03 | P1 | Copy-to-clipboard button works |
| E04 | P1 | "Share via WhatsApp" opens pre-filled message including the link | AC-DLR-011 |
| E05 | P1 | Referral analytics: total clicks, signups, conversion rate |
| E06 | P1 | QR code downloadable PNG for offline flyers |

---

## Module F — Lead submission

| ID | P | Title |
|---|---|---|
| F01 | P1 | Lead form accepts name, phone, email, city, interest, notes |
| F02 | P1 | Duplicate phone/email warns (does not hard-block) |
| F03 | P1 | Submitted leads appear in dealer's lead list with status |
| F04 | P1 | Lead conversion attributed to dealer |
| F05 | P1 | Follow-up reminder can be set |

---

## Module G — Earnings & payouts

| ID | P | Title | Ref |
|---|---|---|---|
| G01 | P0 | Earnings overview shows: gross attributed revenue, commission earned, TDS withheld, net payable |
| G02 | P0 | Line-item breakdown per attributed transaction: photographer, plan, payment date, gross, commission |
| G03 | P0 | **Commission rate/percentage is NOT visible anywhere in the UI** | BR-DLR-FIN-001, AC-DLR-012 |
| G04 | P0 | Payout history lists batches with status, amount, date |
| G05 | P0 | Payout pipeline visualisation: Pending → Draft → Approved → Processing → Paid → Failed |
| G06 | P0 | Status change to "Paid" triggers email + SMS within 5 min | AC-DLR-013 |
| G07 | P1 | Batch detail shows per-line-item breakdown |
| G08 | P1 | Statements downloadable as PDF with dealer header, period, line items, totals | AC-DLR-015 |
| G09 | P1 | Commission calculation respects `commission_basis` set by Super Admin (net-of-GST / net-of-GST-and-fees) |
| G10 | P1 | TDS withholding shown as read-only deduction |

### G03 — Rate invisibility (governance guardrail)
- **Refs:** BR-DLR-FIN-001, AC-DLR-012, `Revenue_Dealership_Engine.md` §3.2.
- **Steps:** open earnings, inspect:
  1. The rendered page — no "%", "rate", or "basis" label next to commission numbers.
  2. The DOM — `document.body.innerHTML.match(/\b\d+\s*%/)` should only match discount / conversion-rate UI, never commission math.
  3. The network responses from `/api/v1/dealer/earnings/*` — JSON must not include keys like `rate`, `commission_pct`, `margin_ratio`, `basis`.
- **Expected:** dealer only ever sees resulting *amounts* in INR. If the API leaks the rate in any field, that is a P0 defect.

---

## Module H — Payout disputes

| ID | P | Title |
|---|---|---|
| H01 | P0 | Raise dispute form: select transaction, describe issue |
| H02 | P0 | Dispute visible in dealer's own queue with status |
| H03 | P0 | Super Admin resolution notifies dealer | AC-DLR-014 |
| H04 | P1 | Dispute history preserved after resolution |

---

## Module I — Statements & earnings simulator

| ID | P | Title | Ref |
|---|---|---|---|
| I01 | P1 | Monthly and quarterly statement selector |
| I02 | P1 | PDF export contains dealer name, period, line items, totals |
| I03 | P1 | Earnings calculator: "if I get X signups at Y plan, I earn Z" | FR-DLR-SIM-001 |
| I04 | P0 | Calculator displays output amounts only, never the rate used | FR-DLR-SIM-001 |
| I05 | P1 | Calculator disclaimer visible ("this is an estimate") |

---

## Module J — Account & bank details

| ID | P | Title | Ref |
|---|---|---|---|
| J01 | P0 | State field is read-only | AC-DLR-003 |
| J02 | P0 | Change bank details requires phone OTP verification | AC-DLR-016 |
| J03 | P0 | Successful bank change creates audit entry | AC-DLR-017 |
| J04 | P0 | New bank details apply to next payout batch only (not retroactive) | BR-DLR-BNK-003 |
| J05 | P1 | Profile edit (contact info, business name) works |
| J06 | P1 | Notification preferences page lets dealer opt in/out per channel |

---

## Module K — Resources, training & support

| ID | P | Title |
|---|---|---|
| K01 | P1 | Training Center lists onboarding materials, sales playbooks |
| K02 | P1 | Submit support ticket form |
| K03 | P1 | Ticket responses visible in dealer's ticket list |
| K04 | P1 | New training material triggers notification |

---

## Module L — State isolation (negative)

All L-rows are **P0** — state data leakage is a compliance failure.

| ID | Check | Expected |
|---|---|---|
| L01 | Search for a Maharashtra photographer by name from `@dealer_tg` | Zero results | AC-DLR-002 |
| L02 | `GET /api/v1/dealer/signups` from `@dealer_tg` | Response contains only rows where `state_code='TG'` |
| L03 | Attempt to pass `?state_code=MH` query param to any dealer API | Parameter is ignored; server-derived state overrides client-supplied |
| L04 | `GET /api/v1/dealer/customers?search=<known MH photographer email>` | Zero results |
| L05 | Export CSV from Signups view | Zero MH rows |
| L06 | Log into `@dealer_mh` in a second browser profile simultaneously | Each session sees only its own state; no cross-leak |
| L07 | Super Admin reassigns dealer's state → within 5 s dealer session invalidated | Forced re-login; new state data visible after re-auth | BR-DLR-ISO-003 |
| L08 | Dashboard KPIs sum checks: `@dealer_tg` + `@dealer_mh` aggregates == platform-wide totals for those two states (no overlap, no gap) |

### L07 — State reassignment cascade [cross-persona]
See Super Admin UAT E02/E03. When Super Admin reassigns Telangana to a new dealer, `@dealer_tg`'s next request must fail with `401 {code:"SESSION_INVALIDATED"}` and force re-login.

---

## Module M — Restricted actions (negative)

Each row corresponds to an **RD-DLR-***from `StateDealer-Requirements.md` §9. All P0.

| ID | RD | Denied | UI | API |
|---|---|---|---|---|
| M01 | RD-DLR-001 | View other states' data | Frontend filter hides; state badge fixed | API 403 / filter enforced |
| M02 | RD-DLR-002 | Modify margin ratios | No UI | 403 |
| M03 | RD-DLR-003 | Alter platform pricing | No UI | 403 |
| M04 | RD-DLR-004 | Access photographer workspace internals | No UI | 403 |
| M05 | RD-DLR-005 | Approve payouts | No Approve button | 403 |
| M06 | RD-DLR-006 | Create admin/super-admin accounts | No UI | 403 |
| M07 | RD-DLR-007 | Access audit logs | No UI | 403 |
| M08 | RD-DLR-008 | Modify platform settings | No UI | 403 |
| M09 | RD-DLR-009 | Access moderation tools | No UI | 403 |
| M10 | RD-DLR-010 | Create global coupons | Scope locked to state | 403 |
| M11 | RD-DLR-011 | Permanently delete coupons | Only pause / disable | 403 |
| M12 | RD-DLR-012 | See commission rate/percentages | Hidden | JSON fields absent |
| M13 | RD-DLR-013 | Change own state | Read-only | 403 |
| M14 | RD-DLR-014 | Access other dealers' data | N/A | 403 |
| M15 | RD-DLR-015 | Access photographer galleries/content | N/A | 403 |

---

## Module N — Cross-persona flows

### N01 — [cross-persona] Dealer coupon → photographer signup → dealer attribution
- Participants: Dealer + Photographer testers.
- **Steps:**
  1. `@dealer_tg` creates a 15 % coupon `UAT-TG-2026`.
  2. New photographer registers via A01/A02 of Photographer UAT, enters `UAT-TG-2026` at the coupon step, completes onboarding and payment.
  3. `@dealer_tg` refreshes Attributed Signups.
- **Expected:** new signup appears within 15 min, Commission Earned MTD KPI increments, coupon redemption count increments. Audit entries `attribution.signup` and `coupon.redeemed` exist.
- **Pass:** attribution source on the new signup row is `coupon:UAT-TG-2026`.

### N02 — [cross-persona] Payout approval seen by dealer
See Super Admin UAT G03.

### N03 — [cross-persona] Commission dispute
- Participants: Dealer + Super Admin testers.
- Dealer raises dispute on a transaction that appears under-commissioned. Super Admin opens Dispute queue (SA H module), reviews evidence, overrides attribution with audit entry. Dealer receives notification; disputed amount reflects in the next batch.

---

## Regression gate

- A03 (state badge permanent)
- B03 (state-scoped KPIs)
- D03, D05, D07 (coupon scope + policy + no delete)
- G03 (rate invisibility)
- J02, J03 (bank-change OTP + audit)
- All of Module L (isolation) and Module M (restricted)

---

## Result log

| Scenario ID | Tester | Build hash | Date | Result | Defect ID | Evidence |
|---|---|---|---|---|---|---|
| A01 |  |  |  |  |  |  |
| … |  |  |  |  |  |  |
| N03 |  |  |  |  |  |  |

---

## Sign-off

| Role | Name | Build hash | Date | Signature |
|---|---|---|---|---|
| Dealer UAT Lead |  |  |  |  |
| Head of Revenue |  |  |  |  |
| Finance / Commissions Officer |  |  |  |  |
| QA Lead |  |  |  |  |

---

*End of Dealer UAT*
