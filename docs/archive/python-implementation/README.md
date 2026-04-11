# Archived: Python prototype documentation

**Status:** archived — DO NOT read as current technical reference
**Archived on:** 2026-04-11 (brownfield fix wave)
**Audit reference:** F-022 in `docs/audits/rawdrive-v0.0.35-m16-360-audit-2026-04-10.md:264`
**Reconstruction plan reference:** `docs/superpowers/plans/2026-04-11-m1-m16-reconstruction-kickoff.md` §1.1
**Current implementation:** Go monolith in `backend/` + Next.js in `frontend/`

---

## Why these files exist

This repository (RawDriveCobolt) is the **Go + Next.js** production
implementation of RawDrive. It is a monolith — not a microservices
architecture — with:

- Backend in Go at `backend/internal/` (Chi router, pgvector, JWT)
- Frontend in Next.js 15 at `frontend/` (pnpm, Tailwind v4)
- Face detection / AI in Go at `backend/internal/ai/` using the
  Google Gemini / Cloud Vision client in `gemini_client.go`

The files in this archive describe an **earlier Python
implementation** of the same product that lived in a sibling
repository, organised as microservices under a
`services/` directory with a `gallery-service`, `billing-service`,
`upload-service`, `client-service`, `llm-service`, and so on. That
Python implementation was not the path forward; the Go monolith
replaced it. The documentation drifted along with that decision
and was left in `docs/TechnicalRequirements/` where it was
actively misleading anyone (human or AI reviewer) who tried to
read requirements against the current codebase.

**What the fixes in these Python docs describe — the fixed code —
does not exist in this repository.** The file paths they cite
(`services/gallery-service/src/config.py`,
`backend/src/app/services/face_detection_service.py`,
`backend/src/app/api/v1/public_galleries.py`, etc.) are all
relative to the Python prototype's source tree. None of those
files are present in `backend/` here.

Deleting them outright would lose historical context that may
still be useful for understanding design intent — for example,
the Google Cloud Vision face-detection spec captures a lot of
conceptual architecture that survives the Python-to-Go port. So
they are archived here, out of the live requirements tree, rather
than deleted. If a future reader has a good reason to consult any
of them, they can — with the clear warning that the file paths
and code examples are from a different codebase.

## Audit finding F-022 (closing)

The `rawdrive-v0.0.35-m16-360-audit-2026-04-10.md` audit at line
264 flagged:

> **F-022 | P3 | Documentation | `docs/TechnicalRequirements/
> Gallery/GALLERY_DESIGN_STUDIO_VERIFICATION.md:485-490` | Some
> "verification" docs still describe a Python service layout that
> does not exist in this repo. | Rewrite or archive drifted docs
> and keep one canonical implementation-status source. | S**

The recommended action was "Rewrite or archive drifted docs." We
chose archive (not rewrite) because the Python-flavoured content
cannot be mechanically translated to Go — the function signatures,
module layout, and ORM patterns are all wrong, and a partial
rewrite would be worse than the original because it would lie
about API surface. The authoritative current reference is the Go
source code itself at `backend/internal/` plus the real
RawDrive requirement docs in the parent
`docs/TechnicalRequirements/` directory (which do describe the
Go stack — see `Asset_Management.md:Technology: Golang, TUS 1.0.0,
Cloudflare R2, pgvector`).

This archive is F-022's resolution.

## What is in this archive

### Python prototype fix-status reports (11 files)

Historical fix reports describing work done against the Python
microservices prototype. None of the "✅ Fixed" items in these
reports map to code in this Go repository.

| File | Original purpose |
|---|---|
| `GALLERY_FIXES_SUMMARY.md` | Summary of Gallery service fixes in the Python prototype. Contains the `llm-service (chat completions)` line that triggered this archive sweep — RawDrive-Cobolt uses **Google Gemini** (`backend/internal/ai/gemini_client.go`) for photo intelligence, not an OpenAI-style chat-completion LLM service. |
| `GALLERY_FIXES_STATUS.md` | Per-issue fix status table |
| `GALLERY_FIXES_PROGRESS_SUMMARY.md` | Progress snapshot |
| `GALLERY_FIXES_FINAL_REPORT.md` | Final close-out report |
| `GALLERY_FIXES_DEPLOYMENT_READY.md` | Pre-deployment sign-off |
| `GALLERY_ISSUES_REPORT.md` | Issues-in-flight inventory |
| `GALLERY_SERVICE_ERROR_STANDARDIZATION_SUMMARY.md` | Error-response standardisation in `services/gallery-service/` |
| `GALLERY_PERFORMANCE_DEPLOYMENT.md` | Performance optimisation deployment guide citing `gallery-service/src/config.py`, `backend/src/app/api/v1/media.py`, and `gallery_service.py` |
| `UPLOAD_SERVICE_DEPLOYMENT_GUIDE.md` | Deployment guide for the Python upload-service |
| `GALLERY_DESIGN_STUDIO_VERIFICATION.md` | Design Studio verification report (the exact file F-022 cites at lines 485-490) |
| `GALLERY_DESIGN_ENHANCEMENTS_VERIFICATION.md` | Enhancement verification report citing Python migration filenames like `0103_design_control_locks.py` |

### Python prototype technical spec (1 file)

| File | Original purpose |
|---|---|
| `GOOGLE_CLOUD_VISION_FACEID_TECH_SPEC.md` | 876-line spec for the Face ID feature, written against `backend/src/app/services/face_detection_service.py` and similar Python files. Code examples throughout are Python (dict syntax for job payloads, `TaskPriority.NORMAL` enums, `create_upload_session` function names). The conceptual architecture (upload → R2 → enqueue face_detection job → update asset status) is still a useful reference for how the feature is meant to work; the code and file paths are not. **For the actual Go implementation, read `backend/internal/ai/face_service.go`, `face_worker.go`, `face_repo.go`, `gemini_client.go`, and `handler.go`.** |

## What is NOT in this archive (kept in the live tree)

These Gallery-adjacent docs describe the real Go + Next.js
RawDrive and remain in `docs/TechnicalRequirements/` and
`docs/TechnicalRequirements/Gallery/`:

- `Asset_Management.md` — explicitly "Technology: Golang, TUS 1.0.0,
  Cloudflare R2, pgvector"
- `Client_Galleries_PWA.md`
- `GALLERY_FEATURE_REQUIREMENTS.md` — master consolidated
  requirements for the RawDrive gallery
- `GALLERY_CANVAS.md`
- `CoverPhotoSystem.md`
- `UPLOAD_CLIENT_SIDE_ABUSE_SCREENING_ARCHITECTURE.md`
- `COVER_SYSTEM_REVIEW_AND_PLAN.md`

If any of these later turn out to also be contaminated, add them
to this archive and update this README.

## How to navigate if you actually need the information

| Topic | Authoritative current source |
|---|---|
| Face detection architecture | `backend/internal/ai/` — start at `handler.go`, follow into `face_service.go`, `face_worker.go`, `face_repo.go`, `gemini_client.go`. Tests in the same directory show the shapes. |
| Face detection requirements | `docs/TechnicalRequirements/Gallery/GALLERY_FEATURE_REQUIREMENTS.md` (master), plus the non-archived `PRD.md`. |
| Upload flow | `backend/internal/handler/chunked_upload.go` + `backend/internal/service/` |
| Gallery service | `backend/internal/handler/gallery_handler.go` + `backend/internal/repository/` |
| Error standardisation | `backend/internal/handler/*_handler.go` error paths |
| Performance / caching | `backend/internal/download/`, `backend/internal/storage/` |
| Face detection rate limiting | `backend/internal/middleware/` rate-limit middleware |
| API contracts | `docs/api/openapi.yaml` (canary-critical surface, hand-written) |
| Database schema | `docs/db/schema.sql` (refreshed via `scripts/refresh-schema.sh`) + `backend/internal/database/migrations/` |

## Reversibility

This archive was created via `git mv`, not `git rm`. Every file
is retrievable by its full history via `git log --follow`. If the
archive decision needs to be reverted, `git mv` the files back to
`docs/TechnicalRequirements/Gallery/` (or the parent
`TechnicalRequirements/` for `GOOGLE_CLOUD_VISION_FACEID_TECH_SPEC.md`)
and update the reconstruction plan's references.
