---
phase: 10-foundation-fixes
verified: 2026-03-19T00:00:00Z
status: gaps_found
score: 8/10 must-haves verified
gaps:
  - truth: "Avatar uploaded on company profile is stored in R2 and displays correctly after page reload"
    status: failed
    reason: "company_profile_service.py has zero R2 integration. upload_logo() stores blobs in company_logo_images table with no R2 upload, no r2_key columns, and no R2 redirect on retrieval. Plan 10-01 Task 3 was not executed."
    artifacts:
      - path: "backend/src/app/services/company_profile_service.py"
        issue: "No R2Client import, no upload_bytes call, no r2_key storage in upload_logo()"
    missing:
      - "R2Client.upload_bytes() call in upload_logo() with key format avatars/{workspace_id}/company/{profile_id}/{size}.webp"
      - "r2_key column(s) in company_logo_images table (Alembic migration)"
      - "R2 redirect in get_logo_image_by_slug() when r2_key exists, PG fallback when NULL"
      - "Company-specific R2 tests in test_avatar_r2.py (currently zero company tests)"

  - truth: "UnifiedThemeEngine.ts exports applyThemeToContainer and removeThemeFromContainer as specified"
    status: partial
    reason: "UnifiedThemeEngine.ts exports applyThemeToRoot/removeThemeFromRoot instead of the plan-specified applyThemeToContainer/removeThemeFromContainer. Functional scoping IS correct — the element is passed and used — but the exported API names diverge from the plan contract. Phase 11 and 12 plans reference applyThemeToContainer and would break on import."
    artifacts:
      - path: "frontend/src/components/features/profile/shared/UnifiedThemeEngine.ts"
        issue: "Exports applyThemeToRoot/removeThemeFromRoot instead of applyThemeToContainer/removeThemeFromContainer"
      - path: "frontend/src/components/features/profile/shared/PublicProfileRenderer.tsx"
        issue: "Imports applyThemeToRoot (consistent with engine but diverges from plan spec)"
    missing:
      - "Rename applyThemeToRoot -> applyThemeToContainer in UnifiedThemeEngine.ts"
      - "Rename removeThemeFromRoot -> removeThemeFromContainer in UnifiedThemeEngine.ts"
      - "Update PublicProfileRenderer.tsx import to use renamed exports"
      - "Update UnifiedThemeEngine.test.ts to reference applyThemeToContainer"
human_verification:
  - test: "Visit /u/:slug and /p/:slug in dev server after running pnpm dev"
    expected: "Both pages render header, bio, socials, contact sections with correct theme colors and avatar/initials"
    why_human: "Visual correctness of section layout, theme color application, and avatar display cannot be verified programmatically"
  - test: "Upload a new avatar on personal profile editor, then reload the public page"
    expected: "New avatar displays immediately after reload (served from R2 presigned URL)"
    why_human: "Requires live R2 credentials and real file upload flow"
  - test: "Check company logo display on /p/:slug for a company with an existing logo"
    expected: "Logo renders correctly (from PG blob path — R2 pipeline is missing for company)"
    why_human: "Requires live data; also confirms PG blob fallback works for company profiles"
---

# Phase 10: Foundation Fixes Verification Report

**Phase Goal:** Broken profile functionality works reliably and shared infrastructure is ready for visual redesign
**Verified:** 2026-03-19
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Personal profile avatar stored in R2 and displays after page reload | VERIFIED | personal_profile_service.py line 495-496: key = f"avatars/{workspace_id}/{profile_id}/{size}.webp" + r2_client.upload_bytes(). r2_key_64 persisted (line 523). RedirectResponse on retrieval. |
| 2 | Company profile avatar stored in R2 and displays after page reload | FAILED | company_profile_service.py: no R2Client import, no upload_bytes, no r2_key columns, no redirect. upload_logo() writes blobs only to company_logo_images. |
| 3 | Avatar failure shows initials, never broken image icon | VERIFIED | AvatarDisplay.tsx: useState(imgError), onError={() => setImgError(true)}, .split(' ').map(w => w[0]) initials. 7 tests covering all cases. |
| 4 | Legacy PG avatars still serve (lazy migration) | VERIFIED | personal_profile_service.py: R2 redirect when r2_key exists, PG blob fallback when NULL. Covered by test_avatar_r2.py. |
| 5 | Theme CSS custom properties applied to scoped container div | VERIFIED | PublicProfileRenderer.tsx calls applyThemeToRoot(tokens, wrapperRef.current) — element passed, so scoped to wrapper div (not document.documentElement). |
| 6 | Legacy theme IDs resolve to nearest PREBUILT | VERIFIED | LEGACY_TO_PREBUILT_MAP: minimal->theme-clean-slate, dark->theme-midnight-noir, pastel->theme-lavender-haze, bold->theme-vivid-impact, cinematic->theme-golden-hour |
| 7 | Both /u/:slug and /p/:slug use PublicProfileRenderer | VERIFIED | PublicPersonalProfilePage imports PublicProfileRenderer with profileType="personal". PublicProfilePage imports with profileType="company". |
| 8 | Section registry filters sections by profile type and data availability | VERIFIED | SectionRegistry.ts exports getSectionsForProfile() filtering by supportedTypes + requiredData, sorted by order. |
| 9 | UnifiedThemeEngine exports use plan-specified names (applyThemeToContainer) | PARTIAL | Engine exists and scoping works. But exports applyThemeToRoot/removeThemeFromRoot — not the plan-specified applyThemeToContainer/removeThemeFromContainer. |
| 10 | Smoke tests verify both profile pages, avatars, and themes | VERIFIED | profile-pages.test.tsx: 7 tests across 3 describe blocks (Personal Profile, Company Profile, Theme Application). console.error spy included. |

**Score:** 8/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/app/services/r2_storage.py` | R2Client with upload_bytes + get_public_url | VERIFIED | class R2Client, boto3.client("s3", region_name="auto"), async upload_bytes via run_in_executor, presigned URL generation |
| `backend/migrations/versions/0197_add_avatar_r2_keys.py` | Adds r2_key columns to personal_profile_avatars | VERIFIED | r2_key_64, r2_key_128, r2_key_256, r2_key_512 as VARCHAR(512) nullable. Downgrade drops them. |
| `frontend/src/components/features/profile/shared/AvatarDisplay.tsx` | Avatar with initials fallback, exported | VERIFIED | export function AvatarDisplay, useState(imgError), onError, .split(' ').map() initials, size sm/md/lg |
| `backend/tests/services/test_avatar_r2.py` | R2 tests for personal AND company | PARTIAL | 4 personal R2 tests. Zero company-specific tests. |
| `frontend/src/components/features/profile/shared/UnifiedThemeEngine.ts` | resolveThemeTokens, applyThemeToContainer, LEGACY_TO_PREBUILT_MAP | PARTIAL | All functions exist and work correctly. Exports applyThemeToRoot/removeThemeFromRoot instead of applyThemeToContainer/removeThemeFromContainer. |
| `frontend/src/components/features/profile/shared/SectionRegistry.ts` | getSectionsForProfile, ProfileType, SectionRegistryEntry | VERIFIED | All three exported. SECTION_REGISTRY with 4 sections. Filters + sorts correctly. |
| `frontend/src/components/features/profile/shared/PublicProfileRenderer.tsx` | Shared renderer, both types, scoped theme | VERIFIED | Imports from both UnifiedThemeEngine + SectionRegistry. useRef scoped container. prefers-color-scheme. removeThemeFromRoot on unmount. |
| `frontend/src/pages/public/PublicPersonalProfilePage.tsx` | Uses PublicProfileRenderer profileType=personal | VERIFIED | Line 15 import, line 119-121 render with profileType="personal" |
| `frontend/src/pages/public/PublicProfilePage.tsx` | Uses PublicProfileRenderer profileType=company | VERIFIED | Line 15 import, line 90-92 render with profileType="company" |
| `frontend/src/tests/smoke/profile-pages.test.tsx` | Smoke tests, 5+ cases, console.error spy | VERIFIED | 7 test cases, profile-smoke tag, vi.spyOn(console, 'error') |
| `frontend/src/components/features/profile/ProfileThemeEngine.ts` | Deleted or re-export stub | VERIFIED | Re-export stub delegating resolveThemeId, resolveThemeTokens, LEGACY_TO_PREBUILT_MAP to UnifiedThemeEngine |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| personal_profile_service.py | r2_storage.py | r2_client.upload_bytes() in upload_avatar | WIRED | Lines 495-496: upload with key avatars/{workspace_id}/{profile_id}/{size}.webp |
| personal_profile_service.py | personal_profile_repository.py | save_avatar_images with r2_key params | WIRED | Line 523: r2_key_64=r2_keys.get(64) |
| company_profile_service.py | r2_storage.py | R2Client.upload_bytes() in upload_logo | NOT WIRED | No R2Client usage anywhere in company_profile_service.py |
| AvatarDisplay.tsx | initials render | onError sets imgError -> conditional render | WIRED | onError={() => setImgError(true)}, renders initials div when avatarUrl missing or imgError |
| PublicProfileRenderer.tsx | UnifiedThemeEngine.ts | resolveThemeTokens + applyThemeToRoot(tokens, el) | WIRED | Calls applyThemeToRoot(tokens, wrapperRef.current) — scoped to wrapper div |
| PublicProfileRenderer.tsx | SectionRegistry.ts | getSectionsForProfile | WIRED | Line 72: getSectionsForProfile(profileType, normalizedData) in useMemo |
| UnifiedThemeEngine.ts | constants/themes.ts | getThemeById / getDefaultTheme | WIRED | Imports both; uses getThemeById with getDefaultTheme() fallback |
| PublicPersonalProfilePage.tsx | PublicProfileRenderer.tsx | import + render profileType='personal' | WIRED | Import line 15, render lines 119-121 |
| PublicProfilePage.tsx | PublicProfileRenderer.tsx | import + render profileType='company' | WIRED | Import line 15, render lines 90-92 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| FNDTN-01 | 10-01 | Avatar upload displays correctly on both personal and company profiles with R2 storage pipeline | BLOCKED | Personal R2 pipeline: complete. Company R2 pipeline: entirely absent. |
| FNDTN-02 | 10-01 | Avatar has proper fallback (initials/placeholder) when image fails to load | SATISFIED | AvatarDisplay.tsx with onError->initials, 7 passing test cases |
| FNDTN-03 | 10-02 | Theme engine consolidated into single UnifiedThemeEngine with CSS custom properties (legacy themes deleted) | PARTIAL | Engine functional. Export names differ from spec. Legacy files kept as re-export stubs (not deleted). |
| FNDTN-04 | 10-02 | Personal and company profiles share a unified PublicProfileRenderer component | SATISFIED | Both pages import and render PublicProfileRenderer. SectionRegistry handles both profile types. |
| FNDTN-05 | 10-03 | Smoke tests verify both profile pages load, avatar displays, and themes render correctly | SATISFIED | profile-pages.test.tsx with 7 tests, covers personal, company, and theme scenarios |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `backend/src/app/services/company_profile_service.py` | upload_logo() stores PG blobs only, no R2 upload | Blocker | Company avatars not on R2; FNDTN-01 goal only half-achieved |
| `frontend/src/components/features/profile/shared/UnifiedThemeEngine.ts` | Exports applyThemeToRoot instead of applyThemeToContainer | Warning | API name diverges from plan spec; Phase 11/12 code referencing applyThemeToContainer will fail to import |

### Human Verification Required

#### 1. Visual Profile Page Rendering

**Test:** Run `cd frontend && pnpm dev`, then visit `/u/:slug` (personal) and `/p/:slug` (company)
**Expected:** Both pages render with profile sections (header, bio, socials, contact), correct theme colors applied to the scoped container, avatar or initials displayed
**Why human:** Section layout, theme visual correctness, and avatar rendering cannot be verified programmatically

#### 2. Personal Avatar Upload Round-Trip

**Test:** Log in, go to personal profile editor, upload a new avatar image, navigate to the public `/u/:slug` page
**Expected:** New avatar displays after upload without requiring a manual cache clear; falls back to initials if R2 fetch fails
**Why human:** Requires live R2 credentials and real file upload/redirect flow

#### 3. Company Logo Display (PG Blob Path)

**Test:** Visit `/p/:slug` for a company that has a logo already uploaded
**Expected:** Logo displays correctly from the PG blob path (R2 pipeline absent — this confirms the fallback still works)
**Why human:** Requires live data; confirms the existing PG path is intact even though R2 was not implemented

---

## Gaps Summary

Two gaps prevent full goal achievement:

**Gap 1 — Company R2 pipeline entirely missing (blocks FNDTN-01)**

Plan 10-01 Task 3 specified implementing the same R2 avatar pipeline for company profiles. Nothing from that task was executed. `company_profile_service.py` stores logos as PostgreSQL blobs in `company_logo_images` with no R2 upload step, no r2_key columns in the table, and no R2 redirect on retrieval. The test file contains four personal-profile R2 tests but zero company-specific tests.

To close this gap: add a migration adding a r2_key column to `company_logo_images`, modify `upload_logo()` to call `R2Client.upload_bytes()` with key format `avatars/{workspace_id}/company/{profile_id}/{size}.webp`, modify `get_logo_image_by_slug()` to redirect to R2 when r2_key exists (PG fallback when NULL), and add at least two company-specific tests to `test_avatar_r2.py`.

**Gap 2 — UnifiedThemeEngine export naming diverges from plan contract (partial FNDTN-03)**

The plan's must_haves artifacts list specifies exports `applyThemeToContainer` and `removeThemeFromContainer`. The implementation exports `applyThemeToRoot` and `removeThemeFromRoot`. Functional scoping behavior is correct — `wrapperRef.current` is passed as the element. However the API naming matters because Phase 11 and 12 plans reference `applyThemeToContainer` by name in their interfaces blocks. This is a small rename-only fix: rename in `UnifiedThemeEngine.ts`, update the import in `PublicProfileRenderer.tsx`, update references in `UnifiedThemeEngine.test.ts`.

These two gaps are independent and can be addressed in a single gap-closure plan for Phase 10.

---

_Verified: 2026-03-19_
_Verifier: Claude (gsd-verifier)_
