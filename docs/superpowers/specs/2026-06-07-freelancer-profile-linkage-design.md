# Freelancer Listing ↔ Photographer Profile Linkage — Design Spec

- **Date:** 2026-06-07
- **Status:** Approved design (ready for implementation plan)
- **Author:** audit-driven remediation (see `docs/audits/freelancer-marketplace-audit-2026-06-07.md`)
- **Related laws:** flag-gated slices / one-unit-per-PR / append-only migrations
  (`AGENTS.md`), B2/E2EE/JWT invariants (unaffected here).

## 1. Problem

`freelancer_listings` (M5, migration `000014`) is a **standalone "free-classified"
re-entry** of data that already lives — more richly — on `photographer_profiles`
(migration `163`). A photographer who fills in a polished profile must **re-type**
their title, specializations, city, rate, description, and pick a portfolio gallery
again to appear in the hire marketplace, and the two drift independently. There is
**no FK** between them today (verified: zero references to `photographer_profiles`
in `marketplace_handler.go` / `freelancer_repo.go` / `marketplace_service.go`).

**Goal:** make `photographer_profiles` the single source of truth; `freelancer_listings`
becomes a thin "this photographer is hireable" link row holding only marketplace
state. Editing the profile updates the marketplace instantly; nothing is re-typed.

## 2. Decisions (confirmed)

1. **Link model:** *Derive via join.* Add `profile_id` FK to `freelancer_listings`;
   drop the duplicated content columns; the marketplace reads display fields by
   joining the profile.
2. **Marketplace presence:** *Explicit opt-in.* An `available_for_hire` toggle on the
   profile controls whether the photographer appears in the hire marketplace.
3. **Migration:** *Backfill + preserve.* Keep `freelancer_listings.id` stable so
   `hire_requests` / `freelancer_reviews` / `marketplace_inquiries` FKs survive; copy
   any existing listing content into the profile before dropping columns.
4. **Geo (decided):** Add canonical `state_id` to the **profile**; browse filters on
   the indexed `profile.state_id` + `primary_city` + `covered_cities[]`. The
   listing's `state_id` and the `states` FK dependency on the listing go away.

## 3. Target data model

### 3.1 `photographer_profiles` — add three columns (additive)
```sql
ALTER TABLE photographer_profiles
  ADD COLUMN IF NOT EXISTS available_for_hire      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS freelance_day_rate_paisa BIGINT,
  ADD COLUMN IF NOT EXISTS state_id                INTEGER REFERENCES states(id);
CREATE INDEX IF NOT EXISTS idx_photographer_profiles_hire
  ON photographer_profiles (state_id, available_for_hire) WHERE available_for_hire = true;
```
- `available_for_hire` — the single control for marketplace presence (the opt-in toggle).
- `freelance_day_rate_paisa` — the second-shooter/hire day rate. Distinct from
  `starting_price` (a wedding *package* starting price). Kept on the profile so the
  rate is also profile-sourced (no local listing entry).
- `state_id` — canonical numeric geo anchor for fast filtering; `state` (text) stays
  for display.

Everything else the marketplace renders already exists on the profile:
`professional_title`, `display_name`, `specializations[]`, `photography_styles[]`,
`primary_city`, `covered_cities[]`, `short_bio`, `long_bio`, `featured_galleries[]`,
`best_work_photos[]`, `average_rating`.

### 3.2 `freelancer_listings` — strip to a link row
**Add:** `profile_id UUID REFERENCES photographer_profiles(profile_id) ON DELETE CASCADE`,
with `UNIQUE (profile_id)` (one listing per profile).

**Keep:** `id` (stable hire/review anchor), `user_id`, `workspace_id`,
`availability_calendar` (live booked/blocked dates — operational, not profile
content), `rating_avg`, `review_count` (aggregate of `freelancer_reviews`),
`is_published`, `created_at`, `updated_at`.

**Drop (after backfill):** `title`, `specializations`, `city`, `description`,
`daily_rate_paisa`, `portfolio_gallery_id`, `state_id`.

`is_published` mirrors `available_for_hire`. The row is **never hard-deleted** on
opt-out (set `is_published=false`) so dependent FKs survive.

### 3.3 Dependents (unchanged)
`hire_requests.listing_id`, `freelancer_reviews.listing_id`,
`marketplace_inquiries.listing_id` continue to reference `freelancer_listings(id)`.
No FK migration needed.

## 4. Read path

`FreelancerRepo.List` / `GetByID` JOIN `photographer_profiles ON
freelancer_listings.profile_id = photographer_profiles.profile_id` and project:

| Marketplace field | Source (profile) |
|---|---|
| title | `professional_title` (fallback `display_name`) |
| specializations | `specializations[]` (+ `photography_styles[]` if desired) |
| city / geo | `primary_city`, `state`, `covered_cities[]`, `state_id` |
| day rate | `freelance_day_rate_paisa` |
| description | `short_bio` (fallback `long_bio`) |
| portfolio | `featured_galleries[]` / `best_work_photos[]` |
| name / avatar | `display_name`, `avatar_cropped_url` |
| rating | listing `rating_avg`/`review_count` (marketplace reviews) |

Browse filtering moves to `profile.state_id` + `primary_city` + `covered_cities[]`.
Only profiles with `available_for_hire = true` AND `status='published'` are listed.
Respect the profile's `visibility_config` where relevant (e.g. `show_pricing`).

## 5. Write path

- **`CreateFreelancerListing` →** requires a `published` profile for the caller; sets
  `photographer_profiles.available_for_hire = true`; upserts the 1:1
  `freelancer_listings` row (`is_published=true`). No content fields accepted.
- **`UpdateFreelancerListing` →** reduces to toggling `available_for_hire` /
  `is_published`. Title/specializations/city/rate/bio are edited **only** on the
  profile editor.
- **`UpdateFreelancerAvailability` →** unchanged (booked/blocked dates on the listing).
- Removes the audit's destructive-PUT (F-B1) and create-only-edit (F-FE2) problems by
  construction — there are no content fields on the listing to overwrite.

## 6. Migration (single forward migration, backfill + preserve)

`NNN_freelancer_listing_profile_link.up.sql` (number assigned at implementation time
against `origin/main`):
1. Add the three `photographer_profiles` columns (§3.1) + index.
2. Add `freelancer_listings.profile_id` (nullable initially).
3. Backfill: for each `freelancer_listings` row, find the
   `photographer_profiles` row by `(user_id=photographer_id, workspace_id)`; if none
   exists, INSERT a minimal `draft` profile copying the listing's
   `title→professional_title`, `specializations`, `city→primary_city`,
   `description→short_bio`, `daily_rate_paisa→freelance_day_rate_paisa`,
   `state_id`. Set `freelancer_listings.profile_id`.
4. For listings with `is_published=true`, set the profile's
   `available_for_hire=true`, copy `daily_rate_paisa→freelance_day_rate_paisa` and
   `state_id` if not already set.
5. Enforce `profile_id NOT NULL` + `UNIQUE(profile_id)`.
6. **Column drop happens in a *follow-up* migration** (slice 3) once read/write no
   longer reference the duplicated columns — not in this migration, so the read slice
   can dual-read safely.

`.down.sql` re-adds the dropped columns (nullable) and the listing `state_id`; the
backfilled profile data is left in place (down is best-effort structural revert).

## 7. Frontend

- Replace the create-only `/marketplace/freelancers/edit` form (audit FE-2) with an
  **"Available for hire"** toggle + **day-rate** field on the **profile editor**
  (`/marketplace/my-profile` / profile settings). These write
  `available_for_hire` + `freelance_day_rate_paisa` on the profile.
- Browse (`/marketplace/freelancers`) and detail (`/marketplace/freelancers/[id]`)
  render derived fields from the joined profile; remove the local title/spec/city/
  rate inputs.
- Retire the orphaned duplicate `/marketplace/my-profile` page or fold it into the
  profile editor (audit FE-3).

## 8. Delivery slices (one PR each, flag-gated)

1. **Schema (additive):** migration §6 steps 1–5 (profile columns + `profile_id` +
   backfill + constraints). No behavior change; columns still present.
2. **Backend read:** join-based `List`/`GetByID` projecting from the profile
   (dual-read; duplicated columns still exist as fallback). Regression test: a
   listing reflects a profile edit with no listing write.
3. **Backend write:** collapse create/update into `available_for_hire`; **follow-up
   migration drops** the duplicated listing columns once read no longer uses them.
4. **Frontend:** profile-editor toggle + day rate; browse/detail read derived;
   retire the standalone edit/my-profile duplicates.

Each slice lands behind the marketplace surface independently; partial merges never
expose a half-built state (a published listing keeps rendering via dual-read until
slice 3's column drop).

## 9. Out of scope / non-goals

- The other audit findings (RLS inertness B-D1/F-D1, review-gating F-D2, `UpdateInquiry`
  IDOR F-B6, availability-on-hire F-B3) are **not** addressed here — separate units.
- Gear listings, messaging, moderation.
- No change to `hire_requests`/`reviews`/`inquiries` schema.

## 10. Acceptance criteria

- A photographer who edits `professional_title`/`specializations`/`primary_city`/
  `freelance_day_rate_paisa`/`short_bio`/`featured_galleries` sees the marketplace
  listing change with **no listing write**.
- Creating/joining the marketplace requires only toggling **Available for hire** — no
  content re-entry; the listing has no content columns.
- Existing `hire_requests`/`freelancer_reviews`/`marketplace_inquiries` rows remain
  valid (listing `id` unchanged).
- Browse state/city filtering returns the same results via profile geo.
- `freelancer_listings` final columns = `{id, profile_id, user_id, workspace_id,
  is_published, availability_calendar, rating_avg, review_count, created_at,
  updated_at}` — zero duplicated profile content.
