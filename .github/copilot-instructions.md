# Copilot instructions — RawDrive

## Big picture (what this repo is)
- RawDrive is a multi-tenant SaaS (photography + corporate media delivery) organized around **workspaces**; the canonical scoping key is `workspace_id`.
- This repo is **docs + specs driven**: feature behavior lives in `docs/Features/` and canonical technical contracts live in `docs/TechnicalSpecs/*.json` (validated by `docs/TechnicalSpecs/_schema.json`).
- Code scaffolding exists (not fully wired via package manifests in this repo snapshot):
  - `frontend/` (React + Tailwind design system)
  - `backend/` (service skeleton directories)
  - `ai-service/` (service skeleton directories)

## Product/architecture rules that must stay consistent
- **Tenant safety:** any API, query, event, or tool must be scoped to exactly one `workspace_id` (see `docs/Features/HLD.md`).
- **RBAC scopes:** keep **Workspace RBAC** separate from **Platform RBAC**; platform roles never imply customer-content access (see `docs/Features/RBAC_AND_USER_MANAGEMENT.md`).
- **Direct-user auth:** Google OAuth (OIDC) is primary; local users are supported as a fallback (see `docs/TechnicalSpecs/auth_rbac.json`, `docs/Features/AUTHENTICATION_AND_SECURITY.md`).
- **Galleries + portal:** access is capability-based via Share Links with per-link policies; portal actions are policy-gated (see `docs/TechnicalSpecs/galleries_client_portal.json`).
- **MCP readiness:** MCP is exposed as a hosted endpoint (SSE) using a FastAPI + FastMCP reference architecture (docs-only) (see `docs/TechnicalSpecs/developer_platform.json`, `docs/Features/DEVELOPER_TOOLS_AND_PROTOCOLS.md`).

## How to make changes (repo-specific workflow)
- When you change product behavior, update **both**:
  - the feature doc in `docs/Features/*.md`, and
  - the corresponding technical spec in `docs/TechnicalSpecs/*.json` (keep `lastUpdated` current).
- Keep naming consistent across docs/specs: `workspace_id`, Share Links, download policies (`view_only|web_only|watermarked_only|original_allowed`).

## Frontend conventions (discoverable in this repo)
- Use the centralized UI kit in `frontend/src/components/ui/` (e.g., `AppButton`, `AppCard`, `AppInput`, `PhotoGrid`).
- Styling uses Tailwind tokens mapped to CSS variables:
  - tokens defined in `frontend/src/index.css`
  - Tailwind mappings in `frontend/tailwind.config.js`
- Do not hardcode colors; prefer Tailwind semantic tokens (e.g., `text-text-primary`, `bg-surface`, `from-primary-600`).

## Commands / verification
- The intended dev workflow is documented in `CLAUDE.md` (npm scripts, Docker, tests). In this repo snapshot, verify package manifests exist before assuming commands will run.
