# Copilot instructions — RawDrive

## What this repo is
- Multi-tenant SaaS for media delivery; **every operation scopes to `workspace_id`** (docs: `docs/Features/HLD.md`).
- Docs/specs-driven: product behavior in `docs/Features/*.md`; canonical contracts in `docs/TechnicalSpecs/*.json` (validated by `_schema.json`). Keep names consistent (`workspace_id`, Share Links, download policies `view_only|web_only|watermarked_only|original_allowed`).
- Major code roots: `frontend/` (React 19 + Vite + Tailwind tokens), `backend/` (FastAPI + SQLAlchemy + Alembic), `ai-service/` (MCP/LLM service), `services/invitations-service/` (microservice).

## Non-negotiable guardrails
- Tenant safety: APIs/queries/events must filter by exactly one `workspace_id`; never trust client-provided IDs.
- RBAC separation: Workspace RBAC ≠ Platform RBAC (see `docs/Features/RBAC_AND_USER_MANAGEMENT.md`).
- Auth: Google OAuth primary; local fallback (see `docs/TechnicalSpecs/auth_rbac.json`, `docs/Features/AUTHENTICATION_AND_SECURITY.md`).
- Client portal & share links: capability-based; respect per-link download policy (see `docs/TechnicalSpecs/galleries_client_portal.json`).
- No secrets in code; use env vars (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `R2_*`, `AI_*`).

## Workflows (from `CLAUDE.md`)
- Start stack: `docker compose -f infrastructure/docker/docker-compose.yml up -d`.
- Frontend: `cd frontend && npm run dev` (vite), tests `npm test` (Vitest), lint `npm run lint`.
- Backend: `cd backend && uvicorn app.main:app --reload --port 8000`; DB `alembic upgrade head`; tests `pytest` (or `pytest --cov=src`); lint `ruff check src && mypy src`.

## Frontend conventions
- Use UI kit components in `frontend/src/components/ui/` (e.g., `AppButton`, `AppInput`, `PhotoGrid`).
- Design tokens live in `frontend/src/index.css`; Tailwind maps tokens in `frontend/tailwind.config.js`. Prefer semantic classes (`text-text-primary`, `bg-surface`, gradients like `from-primary-600`).
- Theme is driven by `data-theme` + CSS vars; `useTheme` hook applies `data-theme` and meta theme-color. Avoid hardcoded colors.

## Backend conventions
- Layout under `backend/src/app`: routes in `api/v1`, services in `services`, repositories in `repositories`. Pattern: **repository → service → API route**; include `workspace_id` in all queries.
- Alembic migrations live in `backend/migrations/versions/`; use `alembic revision --autogenerate` then `upgrade`.
- Background tasks via Celery (see `app/tasks` references); cache via Redis (keyed by entity + workspace).

## Documentation discipline
- When changing behavior, update both the feature doc (`docs/Features/*.md`) and matching tech spec (`docs/TechnicalSpecs/*.json`, update `lastUpdated`).
- Keep terminology consistent with specs (workspace, share link policies, portal capabilities).

## Pointers for agents
- Check `docs/TEST_USERS.md` for seeded accounts; `docs/ERROR_RUNBOOK.md` for ops guidance.
- For AI/LLM or MCP work, see `docs/TechnicalSpecs/developer_platform.json` and `ai-service/`.
- Some scaffolding may be incomplete; verify package manifests before assuming scripts exist.
