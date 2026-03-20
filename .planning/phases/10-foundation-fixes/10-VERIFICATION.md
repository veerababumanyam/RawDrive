---
phase: 10-foundation-fixes
verified: 2026-03-19T23:00:00Z
status: gaps_found
score: 9/10 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 8/10
  gaps_closed:
    - "UnifiedThemeEngine exports applyThemeToContainer and removeThemeFromContainer (FNDTN-03 fully closed)"
  gaps_remaining:
    - "Company R2 pipeline partially closed: service layer wired, API endpoint missing redirect branch"
  regressions: []
gaps:
  - truth: "Avatar uploaded on company profile is stored in R2 and displays correctly after page reload"
    status: partial
    reason: "company_profile_service.py now has full R2 integration (upload_bytes, r2_key columns, get_public_url). However the API endpoint get_public_profile_logo() at company_profile.py lines 166-178 was not updated — it calls get_logo_image_by_slug() and passes the result directly to Response(content=image_data, ...) with len(image_data). When the service returns a redirect dict, this code path fails at runtime: len() on a dict does not return byte length, and no RedirectResponse is issued. The R2 presigned URL is never served to the browser."
    artifacts:
      - path: "backend/src/app/api/v1/company_profile.py"
        issue: "get_public_profile_logo() at lines 166-183 treats service result as raw bytes only — no isinstance(result, dict) check, no RedirectResponse branch"
    missing:
      - "Add redirect branch in get_public_profile_logo(): if isinstance(image_data, dict) and 'redirect_url' in image_data: return RedirectResponse(url=image_data['redirect_url'], status_code=302)"
      - "Guard len(image_data) call to only execute on bytes path"
      - "Add API-layer test covering the R2 redirect response (HTTP 302) from the endpoint"
human_verification:
  - test: "Visit /u/:slug and /p/:slug in dev server after running pnpm dev"
    expected: "Both pages render header, bio, socials, contact sections with correct theme colors and avatar/initials"
    why_human: "Visual correctness of section layout, theme color application, and avatar display cannot be verified programmatically"
  - test: "Upload a new avatar on personal profile editor, then reload the public page"
    expected: "New avatar displays immediately after reload (served from R2 presigned URL)"
    why_human: "Requires live R2 credentials and real file upload flow"
  - test: "Check company logo display on /p/:slug for a company with an existing logo (once API endpoint is fixed)"
    expected: "Logo renders correctly — R2 presigned URL redirect (302) for logos uploaded after migration, PG blob for legacy logos"
    why_human: "Requires live data and a real HTTP client to follow the redirect"
---

# Phase 10: Foundation Fixes Verification Report (Re-Verification)

**Phase Goal:** Broken profile functionality works reliably and shared infrastructure is ready for visual redesign
**Verified:** 2026-03-19
**Status:** gaps_found
**Re-verification:** Yes — after gap closure plan 10-04

## Re-Verification Summary

Previous score: 8/10 (2 gaps). Plan 10-04 addressed both gaps.

- **Gap 2 (FNDTN-03 theme export naming): CLOSED.** UnifiedThemeEngine.ts now exports `applyThemeToContainer` and `removeThemeFromContainer` as primary functions. Deprecated aliases `applyThemeToRoot`/`removeThemeFromRoot` remain for backward compat but no active consumer uses them. All test files and PublicProfileRenderer.tsx reference the new names.

- **Gap 1 (FNDTN-01 company R2 pipeline): PARTIALLY CLOSED.** The service layer is now fully wired — R2Client imported, `upload_bytes` called for all 4 sizes, `r2_key` columns persisted in the INSERT, `get_public_url` called in both `get_logo_image()` and `get_logo_image_by_slug()`. However, the API endpoint `get_public_profile_logo()` was not updated and still treats the service return value as raw bytes, bypassing the R2 redirect entirely at the HTTP boundary.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Personal profile avatar stored in R2 and displays after page reload | VERIFIED | personal_profile_service.py: upload_bytes with key avatars/{workspace_id}/{profile_id}/{size}.webp, r2_key_64 persisted, RedirectResponse on retrieval. Unchanged from initial verification. |
| 2 | Company profile avatar stored in R2 and displays after page reload | PARTIAL | Service layer: R2Client imported (line 24), upload_bytes called (line 301), r2_key columns in INSERT (lines 315-342), get_public_url called (lines 411, 457). API endpoint company_profile.py lines 166-178: no redirect branch — passes dict result directly to Response(content=image_data). R2 redirect never reaches browser. |
| 3 | Avatar failure shows initials, never broken image icon | VERIFIED | AvatarDisplay.tsx: useState(imgError), onError={() => setImgError(true)}, initials fallback. 7 tests. Unchanged. |
| 4 | Legacy PG avatars still serve (lazy migration) | VERIFIED | personal_profile_service.py: R2 redirect when r2_key exists, PG blob fallback when NULL. Company service: same dual-path in get_logo_image_by_slug(). |
| 5 | Theme CSS custom properties applied to scoped container div | VERIFIED | PublicProfileRenderer.tsx line 60: applyThemeToContainer(tokens, el) — element is wrapperRef.current. Scoped to wrapper div. |
| 6 | Legacy theme IDs resolve to nearest PREBUILT | VERIFIED | LEGACY_TO_PREBUILT_MAP: minimal->theme-clean-slate, dark->theme-midnight-noir, pastel->theme-lavender-haze, bold->theme-vivid-impact, cinematic->theme-golden-hour. Unchanged. |
| 7 | Both /u/:slug and /p/:slug use PublicProfileRenderer | VERIFIED | Unchanged from initial verification. |
| 8 | Section registry filters sections by profile type and data availability | VERIFIED | Unchanged from initial verification. |
| 9 | UnifiedThemeEngine exports applyThemeToContainer and removeThemeFromContainer as specified | VERIFIED | Line 167: export function applyThemeToContainer. Line 178: export function removeThemeFromContainer. Lines 186/188: deprecated aliases for old names. PublicProfileRenderer.tsx line 10 imports new names. UnifiedThemeEngine.test.ts imports and calls new names. Zero non-deprecated consumers of old names. |
| 10 | Smoke tests verify both profile pages, avatars, and themes | VERIFIED | profile-pages.test.tsx: 7 tests. Unchanged. |

**Score:** 9/10 truths verified (+1 from previous 8/10)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/migrations/versions/0199_add_company_logo_r2_keys.py` | r2_key columns on company_logo_images | VERIFIED | Adds r2_key_64/128/256/512 as nullable VARCHAR(512). Downgrade drops them. Revision 0199, down_revision 0198. |
| `backend/src/app/services/company_profile_service.py` | R2 upload in upload_logo, R2 redirect in get_logo_image_by_slug | VERIFIED (service layer only) | R2Client import line 24, upload_bytes line 301, r2_key columns in INSERT lines 315-342, get_public_url lines 411/457. API endpoint not updated — see gap. |
| `backend/src/app/api/v1/company_profile.py` | Handle redirect dict from service | STUB | Lines 166-178: calls get_logo_image_by_slug() and passes result to Response(content=image_data) with len(image_data) — no isinstance check, no RedirectResponse branch. |
| `backend/tests/services/test_avatar_r2.py` | R2 tests for personal AND company | VERIFIED | TestCompanyLogoR2 class with 5 tests: upload correct keys, saves r2_keys in SQL, returns R2 redirect, falls back to PG when no r2_key, survives R2 failure. 11 total tests in file. |
| `frontend/src/components/features/profile/shared/UnifiedThemeEngine.ts` | applyThemeToContainer, removeThemeFromContainer as primary exports | VERIFIED | Primary functions at lines 167/178. Deprecated aliases at 186/188. No breaking changes to existing consumers. |
| `frontend/src/components/features/profile/shared/PublicProfileRenderer.tsx` | Imports applyThemeToContainer/removeThemeFromContainer | VERIFIED | Line 10: import { resolveThemeTokens, applyThemeToContainer, removeThemeFromContainer }. Lines 60/65 call new names. |
| `frontend/src/components/features/profile/shared/__tests__/UnifiedThemeEngine.test.ts` | References new export names | VERIFIED | Lines 5/6 import new names. Lines 92/101/117/125 use new names in describe blocks and calls. |
| `frontend/src/components/features/profile/shared/__tests__/PublicProfileRenderer.test.tsx` | Mock keys use new names | VERIFIED | Lines 39/40: mock keys applyThemeToContainer/removeThemeFromContainer. Internal mock variable names (mockApplyThemeToRoot etc.) are implementation detail only — no external impact. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| company_profile_service.py | r2_storage.py | R2Client().upload_bytes() in upload_logo() | WIRED | Line 24 import, line 298 instantiation, line 301 upload_bytes call |
| company_profile_service.py | r2_storage.py | R2Client().get_public_url() in get_logo_image_by_slug() | WIRED | Lines 410-412: r2_client = R2Client(), redirect_url = r2_client.get_public_url(r2_key) |
| company_profile.py API | company_profile_service.py | get_logo_image_by_slug() result handled as redirect or bytes | NOT WIRED | Lines 166-178: result assigned to image_data, passed directly to Response(content=image_data) — no dict check, no RedirectResponse. R2 path never reached at HTTP layer. |
| PublicProfileRenderer.tsx | UnifiedThemeEngine.ts | import applyThemeToContainer | WIRED | Line 10 import, line 60 call |
| UnifiedThemeEngine.ts stale names | (any consumer) | applyThemeToRoot / removeThemeFromRoot | DEPRECATED ONLY | Only exist as @deprecated aliases on lines 186/188. Zero active imports of old names anywhere in frontend/src/ outside of the deprecated lines themselves. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| FNDTN-01 | 10-01, 10-04 | Avatar upload displays correctly on both personal and company profiles with R2 storage pipeline | PARTIAL | Personal: complete. Company: service layer complete, API endpoint missing RedirectResponse branch — R2 presigned URL never served to browser. |
| FNDTN-02 | 10-01 | Avatar has proper fallback (initials/placeholder) when image fails to load | SATISFIED | AvatarDisplay.tsx with onError->initials, 7 passing tests. Unchanged. |
| FNDTN-03 | 10-02, 10-04 | Theme engine consolidated into single UnifiedThemeEngine with CSS custom properties | SATISFIED | applyThemeToContainer/removeThemeFromContainer are primary exports. Deprecated aliases for old names. All consumers updated. |
| FNDTN-04 | 10-02 | Personal and company profiles share a unified PublicProfileRenderer component | SATISFIED | Unchanged from initial verification. |
| FNDTN-05 | 10-03 | Smoke tests verify both profile pages load, avatar displays, and themes render correctly | SATISFIED | Unchanged from initial verification. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/src/app/api/v1/company_profile.py` | 166-178 | get_public_profile_logo() passes service result directly to Response(content=image_data) with no redirect branch | Blocker | When service returns dict with redirect_url, Response(content=dict) produces a runtime error or incorrect response. R2 presigned URL is never issued to browser. Company logo always falls back to PG blob path or fails. |

### Human Verification Required

#### 1. Visual Profile Page Rendering

**Test:** Run `cd frontend && pnpm dev`, then visit `/u/:slug` (personal) and `/p/:slug` (company)
**Expected:** Both pages render with profile sections (header, bio, socials, contact), correct theme colors applied to scoped container, avatar or initials displayed
**Why human:** Section layout, theme visual correctness, and avatar rendering cannot be verified programmatically

#### 2. Personal Avatar Upload Round-Trip

**Test:** Log in, go to personal profile editor, upload a new avatar image, navigate to the public `/u/:slug` page
**Expected:** New avatar displays after upload without requiring a manual cache clear; falls back to initials if R2 fetch fails
**Why human:** Requires live R2 credentials and real file upload/redirect flow

#### 3. Company Logo Display (after API fix)

**Test:** Once the API endpoint redirect branch is added, visit `/p/:slug` for a company with a logo uploaded after migration 0199
**Expected:** HTTP 302 redirect to R2 presigned URL, browser follows redirect and displays logo; for legacy logos (r2_key NULL), PG blob is served as image/webp bytes
**Why human:** Requires live data and real HTTP client to follow the redirect

### Gaps Summary

One gap remains after plan 10-04.

**Gap — company_profile.py API endpoint missing R2 redirect branch (blocks full FNDTN-01)**

Plan 10-04 Task 1 specified modifying `company_profile.py` `get_public_profile_logo()` to handle the dict/bytes dual return from the service. The task description included the exact code pattern to add. However the file was not updated. Lines 166-178 of `company_profile.py` still call `get_logo_image_by_slug()` and pass the result directly to `Response(content=image_data)` with `len(image_data)` — both of which assume raw bytes. At runtime when the service returns `{"redirect_url": "https://..."}`, this will either raise a `TypeError` or produce a corrupted response.

The fix is a single branch insert (8 lines):
```python
if isinstance(image_data, dict) and "redirect_url" in image_data:
    from starlette.responses import RedirectResponse
    return RedirectResponse(url=image_data["redirect_url"], status_code=302)
```
placed before the `Response(content=image_data, ...)` call.

The service layer and migration are complete. This is the only remaining blocker for FNDTN-01.

---

_Verified: 2026-03-19_
_Verifier: Claude (gsd-verifier)_
