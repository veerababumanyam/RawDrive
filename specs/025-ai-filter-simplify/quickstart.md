# Quickstart: One-Click AI Analysis & Filtering

**Branch**: `025-ai-filter-simplify` | **Spec**: [spec.md](./spec.md)

This guide shows how to run, validate, and demo the unified AI analyze + filter flow that replaces the tabbed AI Tools UI.

## 1) Spin up the stack

- From repo root: start infra with Docker Compose (`infrastructure/docker/docker-compose.yml`).
- Backend: `cd backend && uvicorn app.main:app --reload --port 8000` (ensure Alembic migrations are applied).
- Frontend: `cd frontend && npm install && npm run dev` (Vite). Ensure `.env` points to the local API base (`VITE_API_BASE=http://localhost:8000/api/v1`).
- Seed data: use `docs/TEST_USERS.md` accounts or existing fixtures to access galleries with photos.

## 2) Backend touchpoints

- Start analysis: `POST /api/v1/workspaces/{workspace_id}/smart-tagging/galleries/{gallery_id}/analyze` (body: `{ reanalyzeAll?: boolean }`).
- Poll progress: `GET /api/v1/workspaces/{workspace_id}/smart-tagging/galleries/{gallery_id}/analyze/progress` (shows percent + stage).
- Fetch summary: `GET /api/v1/workspaces/{workspace_id}/smart-tagging/galleries/{gallery_id}/analyze/summary`.
- Filtered assets: `GET /api/v1/workspaces/{workspace_id}/smart-tagging/galleries/{gallery_id}/ai-filter` with quality/blur/content/similarity params.
- Sub-gallery creation: `POST /api/v1/workspaces/{workspace_id}/galleries/{gallery_id}/create-from-filter` with `asset_ids[]` and name.

_All endpoints must include `workspace_id` from the authenticated context; never trust client-provided IDs._

## 3) Frontend flow to verify

1. Open a gallery → new "Analyze Gallery" button kicks off analysis; show progress indicator.
2. After completion, confirm summary card (analyzed counts, quality distribution, blur stats).
3. Exercise filters:
   - Quality tiers (Excellent/Good/Fair/All) and thresholds.
   - Blur: Hide Blurry + Show Artistic Blur (bokeh).
   - Content: Event type, Activity, Mood, Lighting.
   - Technical sliders: sharpness/exposure/composition.
4. Toggle Smart Collections: Highlights, Portraits, Event Coverage; ensure presets adjust filters.
5. Similarity modes: None → Stack Similar → Hide Duplicates; verify group expand/representative swap.
6. Click "Apply Filters" updates gallery grid; "Reset" clears state; real-time match count appears before apply.
7. "Save as Gallery" creates sub-gallery containing current filtered assets (<=500 asset fast path).
8. Open separate "AI Create" panel (Story/Captions/Hashtags) to confirm create tools remain independent.

## 4) Testing & quality bars

- Backend: `pytest` (add coverage for new endpoints, progress polling, workspace scoping). Run `ruff check` and `mypy`.
- Frontend: `npm test` (Vitest) for filter hooks/components; `npm run lint` for ESLint/TSC.
- Accessibility: verify keyboard nav + screen reader labels on new controls; no hardcoded colors (use design tokens/UI kit); visible focus rings.
- Performance: filter apply <2s for ≤5k photos; progress updates every ≤5s; sub-gallery creation <3s for ≤500 assets.
- Observability: structured logs with workspace_id, requestId; no PII in logs; audit analysis start/finish and sub-gallery creation.

## 5) Demo script (happy path)

1. Click **Analyze Gallery** on a gallery with unanalyzed photos.
2. Watch progress reach 100% with stage transitions; reload page to confirm persistence.
3. Apply **Excellent + Hide Blurry + Show Artistic Blur** and observe grid update + match count badge.
4. Choose **Highlights** preset, then **Save as Gallery** → confirm new sub-gallery appears with correct count.
5. Switch to **AI Create** panel, generate captions for selected photos, close panel; verify filters remain intact.

## 6) Rollout notes

- Keep feature-flagged until parity is validated; leave old tabs available for fallback during QA.
- Ensure server filtering path is used automatically for galleries ≥5k assets; client path otherwise.
- Document any preset tweaks in `curation_presets` migration and keep `docs/TechnicalSpecs/*` in sync.
