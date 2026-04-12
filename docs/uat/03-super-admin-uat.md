# Super Admin (Governance) — User Acceptance Testing

**Persona:** Super Admin — platform governance, pricing, commissions, payouts, dealer territory
**Requirements source:** `docs/TechnicalRequirements/SuperAdmin-Requirements.md` (FR-SA-*, BR-SA-*, AC-SA-*)
**Supporting specs:** `Revenue_Dealership_Engine.md`, `Razorpay_Payment_Gateway_Integration.md`, `Security_Compliance_Privacy.md`, `Contracts_Billing_GST.md`
**Primary handle:** `@super_admin`
**Build under test:** v0.0.40 (M17 Hardening Wave 5)
**Owner:** Founder / CTO
**Read first:** [`README.md`](README.md)

---

## 1. Why this persona's UAT is different

Super Admin actions are **irreversible** or **financially load-bearing**. Every test here has three defensive layers:

1. **Before** — UI must display impact before the action can be taken.
2. **At confirmation** — 2FA challenge is mandatory on financial and privilege changes.
3. **After** — an immutable audit entry must exist with actor identity, before/after snapshot, and timestamp.

If any of the three layers is missing on a P0 scenario, mark it as a **release blocker**.

---

## 2. Pre-flight

Standard environment (see `README.md` §3) plus:
- `@super_admin` has TOTP enrolled and at least one valid recovery code.
- IP allowlist (if configured in staging) permits the tester's IP.
- `margin_rules`, `commission_basis`, `plan_catalog`, `streaming_rate_cards`, `coupon_policies` tables populated with seed values.
- At least one pending payout batch in `payout_batches` with status `draft` and line items.
- At least one pending dealer application and one pending state-change request.
- At least one Admin escalation in the queue (can be created by Admin tester per L02 of Admin UAT).

---

## Table of modules

| Module | Area | Scenarios |
|---|---|---|
| [A](#module-a--authentication-session-security) | Auth, session, IP allowlist, 2FA | A01–A07 |
| [B](#module-b--dashboard--executive-kpis) | Dashboard & executive KPIs | B01–B09 |
| [C](#module-c--escalation-queue) | Escalation queue | C01–C05 |
| [D](#module-d--user-governance) | User governance (incl. Super Admin creation + deletion) | D01–D12 |
| [E](#module-e--dealer--territory) | Dealer & territory (interactive map) | E01–E10 |
| [F](#module-f--margin-configuration-versioned) | Margin configuration (versioned) | F01–F09 |
| [G](#module-g--payout-management) | Payout management & approval | G01–G10 |
| [H](#module-h--dispute-resolution) | Dispute resolution & attribution override | H01–H05 |
| [I](#module-i--pricing-catalog-versioned) | Pricing catalog (versioned) | I01–I08 |
| [J](#module-j--coupon-policy--coupons) | Coupon policy & global coupons | J01–J08 |
| [K](#module-k--subscription-oversight-with-override) | Subscription oversight with override | K01–K06 |
| [L](#module-l--streaming-rate-cards--storage-quota) | Streaming rate cards & storage quota | L01–L06 |
| [M](#module-m--analytics--heatmaps) | Executive analytics & state heatmaps | M01–M06 |
| [N](#module-n--audit-centre-incl-financial) | Audit centre incl. financial audit | N01–N07 |
| [O](#module-o--feature-flags--ai-provider) | Feature flags & AI provider | O01–O08 |
| [P](#module-p--maintenance--security) | Maintenance mode & security settings | P01–P06 |
| [Q](#module-q--cross-persona-flows) | Cross-persona flows | Q01–Q04 |

---

## Module A — Authentication, session, security

| ID | P | Title | Ref |
|---|---|---|---|
| A01 | P0 | Super Admin login requires 2FA step-up (no TOTP = blocked) | §1.3 |
| A02 | P0 | Lands on `/superadmin/dashboard` with full sidebar and no "View Only" badges | AC-SA-001/002 |
| A03 | P0 | Session idle timeout forces re-login after 30 min of inactivity | §1.3 |
| A04 | P1 | IP allowlist violation returns clear 403 + audit entry |
| A05 | P1 | Every login event logged to audit (`auth.super_admin.login`) |
| A06 | P0 | JWT access token carries `role=super_admin` AND `mfa_verified=true` | AGENTS Auth Model |
| A07 | P0 | Refresh rotation preserves `mfa_verified` — refresh never silently downgrades session |

---

## Module B — Dashboard & executive KPIs

| ID | P | Title |
|---|---|---|
| B01 | P0 | MRR, ARR, Active Subscribers, Signups Today, Dealer Perf Index, Churn, Trial Pipeline, Pending Escalations all render |
| B02 | P1 | Each card shows period comparison + trend arrow |
| B03 | P1 | Click-through on any KPI navigates to the relevant detail screen |
| B04 | P1 | KPI cards show loading skeletons while fetching (never blank state) | FR-SA-DASH-003 |
| B05 | P0 | Revenue anomaly alert fires when daily revenue deviates > 20 % from 7-day avg |
| B06 | P0 | Critical alerts (security, billing spike) are persistent until acknowledged | FR-SA-DASH-004 |
| B07 | P1 | Dismissed alerts write an audit entry |
| B08 | P1 | Quick-action shortcut `Ctrl+E` jumps to oldest pending escalation |
| B09 | P1 | Quick-action shortcut `Ctrl+P` jumps to oldest pending payout batch |

---

## Module C — Escalation queue

| ID | P | Title |
|---|---|---|
| C01 | P0 | Queue lists all Admin escalations newest-first with reason + urgency |
| C02 | P0 | Opening an escalation shows Admin's full context + recommended action |
| C03 | P0 | Approve / Reject / Defer each write an audit entry and notify originating Admin |
| C04 | P1 | Response notes are visible to the originating Admin | FR-SA-NOT-002 |
| C05 | P1 | Escalation lifecycle time shown in the queue (age + resolution time) |

---

## Module D — User governance

| ID | P | Title | Ref |
|---|---|---|---|
| D01 | P0 | Search users across all fields (name/email/phone/ID/state/dealer) | FR-SA-USR-001 |
| D02 | P0 | User detail shows complete cross-service profile |
| D03 | P0 | Role dropdown includes **Super Admin** option (hidden for Admin role) |
| D04 | P0 | Create new Super Admin requires 2FA + "New Super Admin Account" mail notification to all existing Super Admins | §1.3 |
| D05 | P0 | Assign Super Admin role writes audit entry with actor + target |
| D06 | P0 | Delete account requires 2FA + typed confirmation of email; preview shows purge scope | FR-SA-USR-002 |
| D07 | P0 | Deletion triggers 30-day purge and marks `users.deletion_scheduled_at` |
| D08 | P0 | State change requests: approve shows Admin recommendation + financial impact | FR-SA-USR-003/004 |
| D09 | P0 | State change approval: future attribution updated, historical attribution preserved | AC-SA-016 |
| D10 | P1 | Bulk user operations (export, notify, suspend) work without timeouts on 1k+ users |
| D11 | P1 | Suspend user action writes audit + notifies user |
| D12 | P1 | Reactivate user restores pre-suspension visibility state |

### D06 — Destructive action safeguard
- **Refs:** FR-SA-USR-002, §7.2 irreversible actions.
- **Steps:** choose `@pho_trial` user → Delete account.
- **Expected:** dialog lists scope: "This will permanently delete galleries (N), clients (N), albums (N), media files (M), sessions, and all PII within 30 days." Tester must type the full email address AND pass a 2FA challenge. Cancel at any step aborts with no side effects.
- **Pass:** after confirm, `users.deletion_scheduled_at` set, audit entry `user.deletion.scheduled` created with typed-confirmation evidence.

### D09 — State change attribution math
- **Refs:** BR-SA-SC-001 to -003, AC-SA-016.
- **Preconditions:** `@pho_pro` currently mapped to Telangana. State change request to Maharashtra filed by photographer.
- **Steps:** open request → Admin recommendation visible → impact preview shows "3 historical transactions retain TG attribution; all future transactions switch to MH". Approve with 2FA.
- **Expected:** `users.state_code` flips to MH on the effective date. A snapshot row is written into `attribution_snapshots`. No historical `payout_line_items` are modified. Audit entry `user.state.change` captures before/after.

---

## Module E — Dealer & territory

| ID | P | Title |
|---|---|---|
| E01 | P0 | Dealer list shows all dealers with state, status, performance |
| E02 | P0 | Interactive India territory map: click a state → view/assign/reassign |
| E03 | P0 | Reassign dealer shows impact: affected photographer count, commission recalc, payout implications |
| E04 | P0 | Reassign requires 2FA + audit entry | FR-SA-DLR-003 |
| E05 | P0 | One primary dealer per state enforced by default, with explicit override option |
| E06 | P0 | Dealer application approve/reject fires notification + creates audit entry |
| E07 | P1 | Dealer financials full view with commissions, payouts, TDS |
| E08 | P1 | Territory map colour coding: green assigned / grey unassigned / red disputed |
| E09 | P1 | Dealer performance comparisons across states |
| E10 | P1 | Cross-state reassignment blocked without explicit confirmation dialog |

### E02/E03 — Territory reassignment [cross-persona]
- Participants: Super Admin + Dealer tester.
- **Steps:** on territory map, click Maharashtra (currently `@dealer_mh`). Reassign to a seeded alternate dealer. Review impact (5 active photographers, ~₹12k MTD commission). 2FA → confirm.
- **Expected:** `@dealer_mh` loses access within ~5 s (session invalidated per BR-DLR-ISO-003), dashboards now empty. New dealer gains access. Audit entry written with before/after.

---

## Module F — Margin configuration (versioned)

| ID | P | Title | Ref |
|---|---|---|---|
| F01 | P0 | Create margin rule: state, plan, product type, channel, dealer %, platform %, effective dates | FR-SA-FIN-001 |
| F02 | P0 | Real-time validation: dealer % + platform % must sum to exactly 100 | FR-SA-UI-009 |
| F03 | P0 | Editing a rule creates a new version; previous version gets `effective_to = new.effective_from` | FR-SA-FIN-002, AC-SA-005 |
| F04 | P1 | Side-by-side version comparison highlights changed fields in amber | FR-SA-UI-003 |
| F05 | P0 | Commission basis configurable: `gross`, `net_of_gst`, `net_of_gst_and_fees` | FR-SA-FIN-005 |
| F06 | P0 | Commission basis change requires 2FA | §7.1 |
| F07 | P1 | Preview panel shows 3 sample calculations using the configured rule | FR-SA-UI-010 |
| F08 | P0 | Margin rule effective dates cannot overlap for the same state+plan+product key |
| F09 | P0 | Rule expiry warning fires 7 days before `effective_to` |

### F03 — Versioning
- **Steps:** create a Telangana/monthly/subscription rule at 20 % dealer. Then edit it to 25 %.
- **Expected:** two rows in `margin_rules_history`; the original has `effective_to` set to the new effective date, and the new version is active. Audit entry `margin.rule.version_created`.

---

## Module G — Payout management

| ID | P | Title | Ref |
|---|---|---|---|
| G01 | P0 | Payout batch list shows pipeline: Pending Accrual → Draft → Approved → Processing → Paid → Failed / Reversed |
| G02 | P0 | Batch detail shows total amount, dealer count, basis used, rule version per line item | FR-SA-FIN-004 |
| G03 | P0 | Approve batch requires 2FA | FR-SA-FIN-005, AC-SA-006 |
| G04 | P0 | After approval: all affected dealers see updated status + audit entry written | AC-SA-007 |
| G05 | P0 | Approved batch cannot be edited or deleted |
| G06 | P0 | "Paid" status cannot be reversed through UI — reversal requires a separate workflow | §7.2 |
| G07 | P1 | Kanban pipeline cards are draggable only along valid transitions | FR-SA-UI-007 |
| G08 | P1 | Failed batch shows failure reason + retry affordance |
| G09 | P1 | Batch export (CSV) includes GSTIN, PAN, TDS per dealer |
| G10 | P1 | TDS calculation correct per `commission_basis = net_of_gst_and_fees` |

### G03 — Payout approval round trip [cross-persona]
- Participants: Super Admin + Dealer tester.
- **Steps:** open a draft batch → review → Approve → 2FA.
- **Expected (Super Admin):** batch moves to Approved; audit entry `payout.batch.approved`.
- **Expected (Dealer):** payout history shows the new batch status within 15 min; dealer receives email + SMS on status change to Paid.
- **Pass:** the rule version used for each line item matches what the Super Admin saw at approval time — *not* the current rule (because rules may change mid-cycle).

---

## Module H — Dispute resolution

| ID | P | Title | Ref |
|---|---|---|---|
| H01 | P0 | Dispute queue shows attribution disputes with evidence from both parties | FR-SA-FIN-006 |
| H02 | P0 | Override attribution writes a new audit entry referencing the original (never mutates history) | BR-SA-FO-002 |
| H03 | P0 | Override requires 2FA | §7.1 |
| H04 | P1 | Dispute resolution outcome notifies both parties |
| H05 | P1 | Override reason is mandatory and stored in the audit entry |

---

## Module I — Pricing catalog (versioned)

| ID | P | Title |
|---|---|---|
| I01 | P0 | Plan CRUD: name, billing cycle, storage, limits, features, effective date |
| I02 | P0 | Plan changes versioned — old plan continues for existing subscribers until renewal |
| I03 | P0 | Entitlement editor: `storage_bytes`, `gallery_limit`, `client_limit`, `team_member_limit` |
| I04 | P0 | Entitlement changes propagate to active subscribers via background sync with progress | AC-SA-013 |
| I05 | P0 | Acceptance of new plan requires effective date and versioned row in `plans_history` |
| I06 | P1 | Version comparison highlights changed fields |
| I07 | P1 | Delete plan only allowed when no active subscribers reference it |
| I08 | P1 | Plan catalog exports to CSV for ops handoff |

---

## Module J — Coupon policy & coupons

| ID | P | Title | Ref |
|---|---|---|---|
| J01 | P0 | Set max discount % / max flat / max total budget / allowed types for Admin & Dealer roles | FR-SA-CPN-002 |
| J02 | P0 | Policy limits immediately enforced on Admin coupon creation (see Admin UAT G02) | AC-SA-014 |
| J03 | P0 | Super Admin can create global, state-scoped, dealer-scoped, plan-scoped, campaign-scoped coupons | FR-SA-CPN-001 |
| J04 | P0 | Coupon analytics show usage, attribution, revenue impact, abuse detection |
| J05 | P1 | Coupon budget threshold alert at 80 % consumption |
| J06 | P1 | Coupon policy versioned (changes apply to future coupons only) |
| J07 | P1 | Delete coupon permitted for Super Admin (unlike Admin) |
| J08 | P1 | Coupon attribution `source_id` correctly tagged per hierarchy (Global / State / Studio) |

---

## Module K — Subscription oversight with override

| ID | P | Title | Ref |
|---|---|---|---|
| K01 | P0 | Billing health overview: renewal status, mandate status distribution, failure spikes |
| K02 | P0 | Override billing status (e.g., extend trial, waive hold) requires audit entry | FR-SA-SUB-001 |
| K03 | P0 | Override requires 2FA |
| K04 | P1 | Override reason captured and shown in user's audit timeline |
| K05 | P1 | Mandate re-auth flow can be triggered from subscription detail |
| K06 | P1 | Dual-provider support: both PhonePe and Razorpay subscriptions visible with gateway badge | Razorpay doc §4.2 |

---

## Module L — Streaming rate cards & storage quota

| ID | P | Title |
|---|---|---|
| L01 | P0 | Create / edit / delete streaming rate cards with duration, viewer cap, price |
| L02 | P0 | Rate card changes apply only to future purchases — historical retain original |
| L03 | P1 | Activation / deactivation toggles visible |
| L04 | P1 | Storage quota policies CRUD: per plan, enforcement settings |
| L05 | P1 | Quota policy changes versioned |
| L06 | P1 | Storage analytics show platform-wide and per-tenant consumption |

---

## Module M — Analytics & heatmaps

| ID | P | Title | Ref |
|---|---|---|---|
| M01 | P0 | Executive dashboard shows gross margin = revenue − total dealer commissions | FR-SA-ANL-002 |
| M02 | P0 | Drill-down: national → state → dealer → plan → transaction, aggregates correct at each level | AC-SA-008 |
| M03 | P1 | India map heatmap by users / revenue / churn | FR-SA-ANL-003 |
| M04 | P1 | Funnel analytics with drop-off % between stages | FR-SA-ANL-004 |
| M05 | P1 | Product analytics feature adoption by plan tier |
| M06 | P1 | All views export to CSV + PNG |

---

## Module N — Audit centre (incl. financial)

| ID | P | Title | Ref |
|---|---|---|---|
| N01 | P0 | Full audit log searchable by date, actor, action, target, result | FR-SA-AUD-001 |
| N02 | P0 | Financial audit entries show before/after values for any changed financial field | FR-SA-AUD-002 |
| N03 | P0 | Every Super Admin action writes an audit entry within 1 s | AC-SA-019 |
| N04 | P0 | Audit entries are immutable — **even Super Admin** has no UI to edit/delete | FR-SA-AUD-004, AC-SA-020 |
| N05 | P1 | Filtered export with date range + category selection |
| N06 | P1 | State change history readable |
| N07 | P1 | Audit log retention ≥ 1 year per SOC2 / 7 years for financial per tax law |

### N04 — Audit immutability (hard gate)
- **Steps:** attempt `DELETE /api/v1/superadmin/audit/:id` with a valid Super Admin token.
- **Expected:** `403 {code:"AUDIT_IMMUTABLE"}`. No row deleted.

---

## Module O — Feature flags & AI provider

| ID | P | Title |
|---|---|---|
| O01 | P0 | Create feature flag with scope (global, state:XX, plan:Y, user:Z) |
| O02 | P0 | Toggle global flag — propagates within 30 s |
| O03 | P0 | Scoped flag affects only matched audience (verify with a state-scoped flag) |
| O04 | P1 | Delete feature flag |
| O05 | P0 | AI provider config: Gemini/Cloud Vision API keys editable, stored encrypted |
| O06 | P0 | AI provider switchover routes new jobs to the new provider without touching in-flight jobs |
| O07 | P1 | AI usage meters visible per provider |
| O08 | P1 | Config reads `platform_settings` first, env second, else feature disabled (no hardcoded fallbacks) |

### O08 — Config precedence
- **Refs:** AGENTS.md §No Hardcoded Credentials.
- **Steps:** temporarily unset `GEMINI_API_KEY` in `platform_settings` AND in env vars. Trigger an AI culling job.
- **Expected:** job fails gracefully with `"AI provider not configured"` and disables the feature; no silent fallback. Audit log shows the degradation event.

---

## Module P — Maintenance & security

| ID | P | Title |
|---|---|---|
| P01 | P0 | Toggle maintenance mode — non-admin users see maintenance page | AC-SA-021 |
| P02 | P0 | Maintenance toggle requires 2FA |
| P03 | P1 | Scheduled maintenance windows announced in advance |
| P04 | P1 | 2FA policy settings (enforce for roles) |
| P05 | P1 | Session timeout configuration |
| P06 | P1 | IP allowlists management |

---

## Module Q — Cross-persona flows

### Q01 — [cross-persona] Dealer reassignment cascade
See E02/E03 above. Cross-reference with Dealer UAT §D-T-01.

### Q02 — [cross-persona] Payout approval seen by Dealer
See G03 above.

### Q03 — [cross-persona] Admin escalation resolution
See Admin UAT L02. Super Admin side: approve → Admin is notified → Admin re-attempts original action within granted exception.

### Q04 — [cross-persona] Plan pricing change → active subscriber experience
- Participants: Super Admin + Photographer testers.
- **Steps:** Super Admin raises Professional plan price by ₹200/mo effective next cycle. Active `@pho_pro` photographer should see current invoice unchanged, next renewal reflects new price in `/billing/upgrade` preview.

---

## Regression gate

Every cycle before sign-off:
- A01 (2FA on login), A06/A07 (`mfa_verified` claim)
- D04, D06 (Super Admin creation / deletion safeguards)
- E04 (dealer reassign 2FA + audit)
- F02, F03 (margin math + versioning)
- G03, G05 (payout approval + immutability)
- J02 (coupon policy enforcement)
- N03, N04 (audit write + immutability)
- O08 (no hardcoded credentials fallback)
- P01/P02 (maintenance mode gate)

---

## Result log

| Scenario ID | Tester | Build hash | Date | Result | Defect ID | Evidence |
|---|---|---|---|---|---|---|
| A01 |  |  |  |  |  |  |
| … |  |  |  |  |  |  |
| Q04 |  |  |  |  |  |  |

---

## Sign-off

| Role | Name | Build hash | Date | Signature |
|---|---|---|---|---|
| Super Admin UAT Lead |  |  |  |  |
| Founder / CEO |  |  |  |  |
| CTO |  |  |  |  |
| CFO / Finance Officer |  |  |  |  |
| CISO / Compliance Officer |  |  |  |  |
| QA Lead |  |  |  |  |

---

*End of Super Admin UAT*
