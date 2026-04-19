# RawDrive_Testing.xlsx — Triage Report

Source: `RawDrive_Testing.xlsx` (882 KB) — extracted on 2026-04-19.
Total issues: **112** across Photographer (42), Admin (30), Super Admin (40).

## Outcome

| Bucket | Count | Action |
|---|---|---|
| ALREADY-FIXED (in PRs #19-#28) | 105 | None — verified against current code |
| TRULY-OPEN (fixed in PR #29) | 2 | Closed by https://github.com/merupuai/RawDrive/pull/29 |
| NEEDS-MANUAL-REPRO | 5 | Deferred; static-code check insufficient |

## TRULY-OPEN (closed in PR #29)

### T-068 — Global (Admin)
- **Issue**: Setting page gets to 404 page not found
- **Evidence**: No /settings/page.tsx file exists. Settings uses nested routes only: /settings/profile, /settings/business, /settings/security, /settings/storage, /settings/packages. Navigating to /settings root retu
- **Files**: `['frontend/src/app/(dashboard)/layout.tsx:215-222', 'frontend/src/app/(dashboard)/settings/ (directory listing shows no root page)']`

### T-093 — Audit Log (Super Admin)
- **Issue**: The search filter for From Date/To Date does not have a time field option
- **Evidence**: Date filter in audit-logs/page.tsx uses type='date' (lines 203, 210), not datetime-local. CSV #61 claims RFC3339 + datetime-local shipped in 0993841, but current code shows date-only inputs. Time comp
- **Files**: `['frontend/src/app/(dashboard)/admin/audit-logs/page.tsx:203-214']`

## NEEDS-MANUAL-REPRO (carry-forward)

### T-009 — Studio CRM / Dashboard (Photographer)
- **Issue**: Duplicate client names are allowed in the system.
- **Why deferred**: No database-level uniqueness constraint or UI validation for duplicate contact names found in static code. Requires manual repro or backend verification.

### T-010 — Gallery (Photographer)
- **Issue**: Duplicate gallery names are allowed in the system.
- **Why deferred**: No explicit validation in frontend/src/app/(dashboard)/galleries/page.tsx. Duplicate handling check needed. May be database-level validation.

### T-011 — Studio CRM - Projects (Photographer)
- **Issue**: Duplicate Project names are allowed in the system.
- **Why deferred**: No frontend validation for duplicate project names in frontend/src/app/(dashboard)/crm/projects/page.tsx. Requires backend verification or manual test.

### T-064 — Global (Admin)
- **Issue**: After the screen remains inactive for some time, the data does not load properly, and an error is displayed, as shown in the screenshot.
- **Why deferred**: No specific inactive-session error handler found in current code. Code uses authFetch wrapper (3685d4e) for 401 resilience and attempts refresh, but session timeout recovery during long-idle scenarios

### T-070 — Get Started (Admin)
- **Issue**: On the Get Started page, it displays a message stating “Please refresh and then start”, but there is no refresh option available on the page. Even after manually reloading the page, the same message continues to appear.
- **Why deferred**: Onboarding page exists (frontend/src/app/(dashboard)/onboarding/page.tsx) with state_selection, profile, complete steps. No hardcoded 'Please refresh and then start' message found. Need to verify if e

## Methodology

1. Extracted all 112 issue rows from xlsx via openpyxl.
2. Auto-matched against `docs/QA/RawDrive-QA-69-issues-resolution.csv` (PR #23) and `RawDrive_NewUniqueIssues.xlsx` (PRs #24-#28) using normalized text + screen-overlap similarity (threshold 0.55).
3. Dispatched 3 parallel Explore agents (one per sheet) to verify the 48 unmatched OPEN items against current code: read referenced files, checked `git log`, cross-referenced resolution CSV.
4. Final buckets above.

## Trust caveats

- "ALREADY-FIXED" classifications cite a commit SHA but were not all replayed against a running stack.
- The 5 NEEDS-MANUAL-REPRO items are real candidates for additional bugs — particularly T-009/T-010/T-011 (duplicate-name handling), which are a class with the workspace-uniqueness fix in PR #25 as a known precedent.
