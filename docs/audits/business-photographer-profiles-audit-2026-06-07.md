# Business Profile & Photographer Profile — End-to-End Audit, Data Model & Recommendations

- **Date:** 2026-06-07
- **Scope:** The two identity systems end-to-end — the **business profile** (studio
  identity on the `workspaces` table; `settings/business`) and the **photographer
  profile** (public link-in-bio on `photographer_profiles`; `settings/profile` →
  `/p/{slug}`) — across database/data-model, backend handlers/repos, API, security/
  privacy, routing/slugs, integrations, and frontend. Also maps the **wider identity
  surface** (the legacy `user_profiles`, the transient `onboarding_statuses`, and the
  B2B `dealers` profile) because they overlap.
- **Why this matters:** these profiles are the **identity backbone** the three prior
  audits all want to derive from. This audit assesses whether they are actually fit to
  be that single source of truth.
- **Companion docs:** `docs/audits/{freelancer-marketplace,camera-rentals-gear,chat-messaging}-audit-2026-06-07.md`
  and `docs/superpowers/specs/2026-06-07-freelancer-profile-linkage-design.md`.
- **Type:** Read-only documentation audit (no live boot). Every claim cites `file:line`;
  the highest-severity items (bank-detail exposure, public-PII enforcement path, missing
  RLS, identity-table overlap) were re-verified directly. **One sub-audit false positive
  was caught and corrected** — see §4.1.

---

## 1. Executive summary

The two profiles are **functionally rich and mostly well-built** — notably the
photographer profile, which correctly enforces public-PII visibility *server-side* and
has no IDOR. But underneath sit **two real problems**:

1. **A business-profile authorization gap (High).** The studio's **bank account number,
   IFSC, PAN, GSTIN, and UPI** live on `workspaces` and are returned **unmasked to any
   workspace member** (not owner-only) and are **overwritable by any member** via
   `PUT /workspaces/current/profile` — no role gate, no validation, no audit log.
   Verified: `WorkspaceProfileHandler.GetProfile/UpdateProfile` gate only on
   `getWorkspaceID(r)` (`:105,:210`). A contractor invited to a workspace can read the
   owner's payout account and silently change it to their own — invoices then render the
   attacker's bank details.

2. **Identity sprawl (Med-High).** Studio/photographer identity is duplicated across
   **five tables** — `user_profiles` (006, **dead**), `onboarding_statuses` (transient),
   `workspaces` (business, source of truth for invoicing), `photographer_profiles`
   (public), and `dealers` (B2B) — with `business_name`/`gstin`/`city`/`address`/`logo`/
   `pan`/`bank` repeated. Reconciliation is **one-way, read-time only**
   (`applyWorkspaceBusinessProfile`): the workspace wins, the photographer's own
   `business_name`/`gst_number`/`business_address` are effectively shadow copies, and
   there is **no write-back**. This is exactly why the gear/freelancer/chat audits
   couldn't cleanly "derive from the profile" — the profile is a *reader* of identity,
   not its owner.

The photographer profile is the strong part: public read is gated on
`status='published' AND is_public` and **filtered through `sanitizePublicProfile`**, so
visibility toggles (`show_email`/`show_phone`/`show_pricing`/…) are enforced **in the
API**, GST + payment methods are **always** redacted, and owner endpoints are correctly
scoped by `(photographer_id, workspace_id)` (no IDOR). The main caveat is that this is
**app-layer-only** — `photographer_profiles` has **no RLS** — so the safety depends on
every read path going through the sanitizer.

### Severity snapshot

| # | Area | Finding | Severity |
|---|------|---------|----------|
| P-1 | Business / security | **Bank acct #, IFSC, PAN, GSTIN, UPI readable AND writable by any workspace member** (no owner/role gate, no mask, no audit). Member can hijack the payout account. | **High** |
| P-2 | Data model | **Five overlapping identity tables**; `user_profiles` (006) is **dead code**; one-way read-time reconciliation only; no write-back; drift between workspace and photographer business fields. | **Med-High** |
| P-3 | Business / validation | **No format validation** on GSTIN (length-only), PAN, IFSC, email, phone, postal code — invalid tax/bank data flows straight into invoices. | **Med** |
| P-4 | Photographer / security | `photographer_profiles` has **no RLS** — public-PII safety is **app-layer-only** (every read must go through `sanitizePublicProfile`); one non-sanitizing read path = leak. | **Med** |
| P-5 | Routing | **Two slug systems** (`workspaces.business_profile_slug+unique_code` subdomain vs `photographer_profiles.url_slug` `/p/{slug}`) + a now-removed `galleries.subdomain_slug`; subdomain slug exists but is **not editable in the UI** and a `GetByBusinessUniqueCode` lookup is **dead**. | **Med** |
| P-6 | Photographer / schema | **~10 `photographer_profiles` columns are orphaned** (in DDL, absent from the Go struct: `best_work_photos`, `memberships`, `social_twitter`, `company_registration`, `brand_font`, `conversion_rate`, `top_traffic_sources`, …). | **Low-Med** |
| P-7 | Both / gating | **No plan-tier gating** on any profile/branding feature (custom logo, brand color, link-in-bio, custom subdomain) — free tier gets everything. | **Low** (verify intent) |
| P-8 | Photographer / analytics | View tracking is **naive** — increments on every hit, no bot filtering, trusts `X-Forwarded-For`. | **Low** |
| P-9 | Business / KYC | GSTIN/PAN/bank are **self-attested, never verified**; KYC (`047`) is **dealer-only** and unlinked to the business profile. | **Low** |
| P-10 | Privacy / retention | `onboarding_statuses` rows (with `business_name`/`gstin`) are **never archived** after workspace creation. | **Low** |

---

## 2. What each profile is

| | Business profile | Photographer profile |
|---|---|---|
| **Table** | `workspaces` (cols from `068`+`073`+`080`+`121`) | `photographer_profiles` (`163`+`166`) |
| **Key** | one per workspace | `UNIQUE(workspace_id, photographer_id)` |
| **Editor** | `settings/business` | `settings/profile` (EditForm) |
| **Purpose** | invoicing identity + studio branding + gallery defaults + subdomain | public link-in-bio / portfolio at `/p/{slug}` |
| **Holds** | name, brand_name, GSTIN, address, phone, email, website, **bank_*, PAN, UPI**, invoice_terms/footer, logo, brand color, gallery_branding_defaults, subdomain slug+code | display_name, title, bio, contact (email/phone/whatsapp), location, pricing/packages, portfolio (featured_galleries[]), avatar/logo/cover, rating, SEO (url_slug/meta_*), `visibility_config`, status, analytics |
| **Public?** | No (internal; feeds invoices/galleries) | **Yes** (`/p/{slug}`, gated by status+is_public, PII filtered) |
| **RLS** | ✅ live (`workspaces_isolation` on `app.workspace_id`) | ❌ **none** (app-layer sanitization only) |

---

## 3. Business profile — findings

- **F-3.1 (High) Sensitive-data exposure & tamper.** `GET/PUT /api/v1/workspaces/current/profile` gate only on `getWorkspaceID(r)` (`workspace_profile_handler.go:104-116, 209-349`); **no owner/role check.** The GET returns `bank_account_number`, `bank_ifsc`, `pan_number`, `gstin`, `upi_id` **unmasked**; the PUT lets any member overwrite them. Invoices embed the bank account (`invoice_handler.go`), so a tampered account silently redirects client payments. Workspace *isolation* is solid (RLS + `TenantContext` blocks cross-workspace), so this is an **intra-workspace privilege** gap, not cross-tenant — but for a multi-member studio it's the highest-impact finding here.
- **F-3.2 (Med) No validation.** Only `brand_accent_color` (hex) and a length-15 GSTIN check exist; **PAN, IFSC, email, phone, postal code are free-text** (`onboarding.go` + the PUT handler). No GSTIN checksum. Garbage flows into tax invoices.
- **F-3.3 (Med) Dead routing code.** `business_profile_slug`+`business_unique_code` are stored, indexed, and returned read-only, but **not editable in the UI** and the `GetByBusinessUniqueCode` resolver appears unused (public studio-subdomain endpoints return 410). Either finish the per-studio subdomain product or remove the columns/indexes.
- **F-3.4 (Low) No plan gating / no KYC.** All branding + tax/bank fields are available on every tier; GSTIN/PAN are self-attested with no verification (`kyc_documents` is dealer-scoped only).
- **F-3.5 (Low) No business public page.** There is no `/b/{studio}` studio page — only the photographer `/p/{slug}`. The "one studio identity" promise is realized for invoices/galleries but not as a public brand page.

**Recommendations:** gate bank/PAN/UPI/GSTIN read+write behind an **owner/admin role**; **mask** the account number in GET (`****3210`) with an audit-logged reveal; **validate** PAN/IFSC/GSTIN(+checksum)/email/phone/PIN; audit-log changes to financial fields; decide the subdomain product (finish or drop).

## 4. Photographer profile — findings

### 4.1 Public PII is enforced server-side (verified — corrects a sub-audit false positive)
`GET /api/v1/profile/{slug}` → `GetPublic` (`:726`) calls `GetPublishedBySlug` (requires `status='published' AND is_public`) then **`sanitizePublicProfile(profile, visibility)`** (`:734`), which **nulls** `primary_email`/`secondary_email` when `show_email=false` (`:1077-1078`), phone when `show_phone=false`, whatsapp, pricing, location, equipment, services per their toggles, and **always** blanks `gst_number` + `payment_methods` (`:1130-1131`). The public page `frontend/src/app/p/[slug]/page.tsx` consumes this via `getPublicPhotographerProfile(slug)` — the **same sanitized endpoint** — so a sub-audit's claim that the page "renders email/phone unconditionally → privacy bug" is a **false positive**: those fields arrive **empty** when toggled off; the frontend conditionals are belt-and-suspenders, not the enforcement point. **No PII leak.**

### 4.2 Real findings
- **F-4.1 (Med) No RLS on `photographer_profiles`** — verified. Public-PII safety is **entirely app-layer** (the sanitizer). Any future read path that selects the table without sanitizing (an admin export, a join, a new endpoint) would leak raw email/phone. Add a defense-in-depth RLS policy (published+public OR owner OR same-workspace).
- **F-4.2 (Low-Med) Schema debt.** ~10 columns exist in `163`/`166` DDL but are **absent from the Go struct** (`best_work_photos`, `memberships`, `social_twitter`, `company_registration`, `invoice_logo_url`, `brand_font`, `background_photo_url`, `button_style`, `avg_click_through_rate`, `conversion_rate`, `top_traffic_sources`) — stored, never read/written. Either wire or drop.
- **F-4.3 (Low) Naive analytics.** `RecordView` increments on every hit, recomputes `unique_visitors` via `COUNT(DISTINCT visitor_hash)` each time, **no bot filtering**, and trusts `X-Forwarded-For` (spoofable). Vanity-inflatable; mildly expensive.
- **Strengths:** owner endpoints scoped by `(photographer_id, workspace_id)` → **no IDOR**; slug is globally unique (`UNIQUE(lower(url_slug))`), validated (3–100, DNS-label, no `--`), reserved words guarded, collision-suffixed; publish gate requires last_name + slug + photo + a visible contact + a featured gallery; avatar/logo are intentionally public plaintext WebP with 1-hour presigned URLs.

## 5. The identity-table sprawl (data model)

Five tables carry overlapping identity:

| Table | Role | Status |
|---|---|---|
| `user_profiles` (006) | original onboarding profile (business_name, gstin, city, logo) | **DEAD** — zero Go references; never migrated forward |
| `onboarding_statuses` (067) | signup-progress buffer (business_name, gstin, state_id) | transient; **never archived** post-workspace-creation |
| `workspaces` (068/073/080/121) | **business identity / invoicing source of truth** | live; RLS on |
| `photographer_profiles` (163/166) | **public identity / link-in-bio** | live; **no RLS** |
| `dealers` (026) | B2B channel-partner identity (business_name, gstin, pan, bank_account JSONB) | live; RLS on; KYC-gated |

**Duplicated fields** (✓ = present): `business_name` (all 5), `gstin/gst_number` (all 5), `city/primary_city` (user_profiles, workspaces, photographer), `address` (workspaces 2-line, photographer 1-field), `logo` (user_profiles, workspaces `logo_url`, photographer `business_logo_url`), `pan_number` (workspaces, dealers), `bank` (workspaces 4-col, dealers JSONB), `state` (onboarding/workspaces/dealers `state_id` vs photographer `state` text).

**Reconciliation:** `applyWorkspaceBusinessProfile` (`photographer_profile_repo.go:453-496`) runs on **every** profile read and overrides the photographer's `business_name`(brand_name>name>profile)/`gst_number`(workspace>profile)/`business_address`/`payment_terms`/pricing from the workspace. This is good *display* behavior but means the photographer's stored business fields are **write-shadowed dead weight**, and there is **no reverse sync** (editing the profile never updates the workspace). Drift is invisible because the read always re-derives.

## 6. Routing identities

Three coexisting URL schemes (verified): the per-studio subdomain
`https://<business_profile_slug>-<business_unique_code>.rawdrive.in/<gallery.slug>`
(`workspaces`, `121`); the photographer link-in-bio `/p/<url_slug>` (`photographer_profiles`);
and per-workspace gallery `slug`. The old per-gallery `galleries.subdomain_slug`
(`120`) was **cleanly removed** (`122`) — a good deprecation example. The two slug
systems don't collide technically but are **conceptually confusing** (a studio brand URL
vs a person's portfolio URL), and the subdomain half is half-shipped (not editable, dead
resolver).

## 7. Integrations (what consumes the profiles)

- **Invoices** read **only** `workspaces` (name/GSTIN/address/bank/terms) — no fallback to photographer profile. ✅ correct source, but no graceful degradation.
- **Galleries** read `workspaces.brand_name`/`gallery_branding_defaults`/logo for public branding. ✅
- **Public profile** reads `photographer_profiles` + featured galleries.
- **Marketplace (freelancer/gear)** **should** derive from `photographer_profiles` but **don't** (per the gear + freelancer audits) — the linkage design exists, unbuilt.
- **CRM/dealer/KYC** are separate; the business profile doesn't feed dealer onboarding or KYC.

**This is the crux for the other three audits:** the profile is currently a *read-time aggregator*, not an *owned source of truth*. To let gear/freelancer/chat derive identity cleanly, the profile needs to become the canonical, writable owner of the photographer's public identity, with the workspace owning only the legal/financial identity.

## 8. Frontend findings
- `settings/business` edits all business fields incl. **bank account in a plain text input (no masking)**; subdomain slug is **not** exposed; single bulk Save.
- `settings/profile` EditForm is comprehensive; pricing + business name/address are shown as **read-only "linked" cards** pointing back to Business settings (good — avoids re-typing) but the user can still set a separate display `business_name`.
- `marketplace/my-profile` is **not** a duplicate of `settings/profile` — it edits the *freelancer listing*, not the photographer profile (consistent with the freelancer audit).
- Design-law compliance is **good** here (GlassButton throughout, tokens, labelled inputs, 44px targets) — the cleanest frontend of the audited domains.
- Logo/avatar crop UX is solid (server-side WebP crop, pan/zoom, free-aspect logo vs square avatar).

## 9. Target data model (recommended)

All additive; drops in follow-up slices after dual-read (append-only migration law).

```sql
-- 9.1 Lock down financial PII on the business profile (no schema change to gate;
-- add an audited reveal + mask in the handler, and an owner/admin role check on read+write).
-- Optional: column-level encryption / external vault for bank_account_number, pan_number.

-- 9.2 Defense-in-depth RLS on the public profile table
ALTER TABLE photographer_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY photographer_profiles_access ON photographer_profiles FOR SELECT USING (
     (status = 'published' AND is_public = true)
  OR photographer_id::text = current_setting('app.user_id', true)        -- (requires setting app.user_id — see chat audit)
  OR workspace_id::text   = current_setting('app.current_workspace_id', true)
);

-- 9.3 Retire dead schema
-- DROP TABLE user_profiles;                 -- 006, zero references (archive first if desired)
-- Decide subdomain: finish (make business_profile_slug editable + wire resolver) OR
-- DROP COLUMN business_profile_slug, business_unique_code + their indexes.
-- Wire OR drop the ~10 orphaned photographer_profiles columns (§F-4.2).

-- 9.4 Make the profile the canonical owner of PUBLIC photographer identity
-- (so gear/freelancer/chat can derive). Keep workspace as owner of LEGAL/FINANCIAL identity.
ALTER TABLE photographer_profiles
  ADD COLUMN IF NOT EXISTS state_id INTEGER REFERENCES states(id);   -- canonical geo (also needed by freelancer/gear linkage)
-- Treat workspace as the single source for invoicing identity; treat photographer_profiles
-- as the single source for public identity; keep applyWorkspaceBusinessProfile as the ONE
-- read-time bridge; stop persisting duplicate business_name/gst_number/business_address on
-- the profile (drop after dual-read) so there is nothing to drift.

-- 9.5 Add format validation (handler-level) + GSTIN checksum; audit-log financial-field writes.
```

**Routing/identity hierarchy (recommended):**
```
 users
   └─ workspaces (BUSINESS identity: legal name, GSTIN, address, bank/PAN/UPI, invoice, subdomain)
        ├─ invoices         ← bank/GSTIN/address (owner/admin only; masked; audited)
        ├─ galleries        ← brand_name, logo, gallery_branding_defaults, subdomain
        └─ photographer_profiles (PUBLIC identity: name, avatar, bio, portfolio, contact+visibility, url_slug, rating)
             ├─ /p/{url_slug}        (sanitized public read; RLS-backed)
             ├─ freelancer_listings  ← derive (linkage design) ── NOT built
             ├─ gear_listings        ← derive (gear audit)      ── NOT built
             └─ chat/enquiries       ← hydrate participant identity (chat audit) ── NOT built
 DEAD: user_profiles (006).   TRANSIENT: onboarding_statuses (archive post-create).   SEPARATE: dealers (B2B+KYC).
```

## 10. Remediation roadmap (flag-gated, one-unit-per-PR; track on Project #2)

**Phase 0 — Security (do first)**
1. Owner/admin role gate + **masking** + audit-log on business-profile financial fields (read & write). *(P-1)*
2. Defense-in-depth **RLS on `photographer_profiles`**. *(P-4)*

**Phase 1 — Data integrity**
3. Format validation (PAN/IFSC/GSTIN+checksum/email/phone/PIN). *(P-3)*
4. Retire `user_profiles`; archive `onboarding_statuses` post-create. *(P-2, P-10)*

**Phase 2 — Make the profile the source of truth (unblocks the other 3 audits)**
5. Add `photographer_profiles.state_id`; designate workspace=legal identity, profile=public identity; keep `applyWorkspaceBusinessProfile` as the only bridge; drop duplicated profile business columns after dual-read. *(P-2)*

**Phase 3 — Cleanup & product**
6. Decide the subdomain product (finish editable slug + resolver, or drop columns/indexes). *(P-5)*
7. Wire or drop the ~10 orphaned profile columns. *(P-6)*
8. Bot-filter + de-spoof profile view analytics. *(P-8)*
9. Decide plan-tier gating for branding/link-in-bio/custom subdomain. *(P-7)*

## 11. Evidence appendix (primary citations)

- **Bank/PII exposure (no role gate):** `backend/internal/handler/workspace_profile_handler.go:104-116,142-149,209-349` (gate only on `getWorkspaceID`); invoice embed `invoice_handler.go`.
- **Public PII enforced server-side (verified):** `photographer_profile_handler.go:726-767` (`GetPublic`→`GetPublishedBySlug`→`sanitizePublicProfile`), `:1058-1133` (field nulling), `:1130-1131` (GST/payment always blank); frontend consumes the sanitized endpoint via `getPublicPhotographerProfile` (`frontend/src/app/p/[slug]/page.tsx:5,40`).
- **No RLS on photographer_profiles (verified):** grep of migrations — no `ENABLE ROW LEVEL SECURITY` on the table.
- **Read-time reconciliation:** `photographer_profile_repo.go:453-496` (`applyWorkspaceBusinessProfile`); tests `photographer_profile_business_link_test.go:33-81`.
- **Schema:** `006_create_profiles` (dead `user_profiles`), `067_onboarding_statuses`, `068_workspace_business_profile`, `073_crm_enhancements` (PAN/UPI/state_code), `080_studio_identity_public_sharing` (brand), `121_workspaces_business_profile_subdomain` (slug/code), `163_photographer_profiles`, `166_photographer_business_logo`, `120→122` galleries.subdomain_slug add/drop, `026_create_m6_dealer_tables`, `047_kyc_documents`.
- **Routing/subdomain:** `backend/internal/workspace/business_subdomain.go`; `workspace/repo.go`.
- **Frontend:** `settings/business/page.tsx`, `settings/profile/page.tsx` + `_components/{edit-form,avatar-crop,logo-crop,live-preview}.tsx`, `p/[slug]/page.tsx`.
- **Companions:** the gear, freelancer, and chat audits dated 2026-06-07.

---

*Prepared as a read-only audit. No source files were modified and the application was not
booted. All `file:line` references were verified against the working tree at the time of
writing (branch `main`). Sub-domain detail was gathered by parallel sub-audits; structural
and security findings were re-verified directly — including catching and correcting a
sub-audit false positive about public-PII leakage (§4.1).*
