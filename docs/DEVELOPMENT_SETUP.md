# Development Environment Setup Guide

This guide details how to set up the development environment from scratch, ensuring all shared packages, database schemas, and microservices are correctly configured. Use this when moving to a new computer or onboarding a new developer.

## 🚀 One-Shot Setup (Recommended)

We provide automated scripts to handle the entire setup process (Docker, Database, Seeds, Monorepo Build).

### Windows (PowerShell)
```powershell
.\setup-dev-environment.ps1
```

### Linux / macOS / WSL
```bash
bash scripts/setup-all.sh
```

**What this does:**
1. Starts all Docker containers (PostgreSQL, Redis, Services).
2. Installs backend dependencies (`psycopg2-binary`) inside containers.
3. Runs database migrations (`alembic upgrade head`).
4. Seeds test users and data.
5. **Builds all shared packages** (`pnpm build:packages`).

---

## 📦 Monorepo & Shared Packages

The frontend and backend services rely on shared code located in `packages/`.
- `@rawdrive/shared-types`
- `@rawdrive/shared-constants`
- `@rawdrive/shared-utils`
- `@rawdrive/shared-validation`

### Critical Build Requirement
These packages **MUST** be built before the frontend or other consumers can run. They do NOT transpile on-the-fly in all environments.
The build artifacts (`dist/` folders) must exist on disk.

### Troubleshooting Build Issues
If you see errors like:
- `Cannot find module '@rawdrive/shared-types'`
- `Internal server error: Failed to resolve entry for package "@rawdrive/shared-types"`
- `ReferenceError: exports is not defined`

**Solution:**
1. Verify `pnpm` filters are working (we use `--filter packages/*` for cross-platform support).
2. Force a rebuild of shared packages:

```bash
# From project root
pnpm build:packages
```

3. If artifacts are still missing, check specific package:
```bash
ls packages/shared-types/dist
# If empty/missing:
pnpm --filter @rawdrive/shared-types run build
```

*(Note: We enforce `noEmit: false` in `tsconfig.json` to ensure `dist/` is always generated)*

---

## 🗄️ Database & Migrations

Database management is handled via Alembic (Python) inside the backend container.

### Resetting the Database
If you need to wipe and reset:
```bash
docker compose -f infrastructure/docker/docker-compose.yml down -v
docker compose -f infrastructure/docker/docker-compose.yml up -d
bash scripts/setup-all.sh
```

### Verifying Seeds
Check if users exist:
```bash
docker exec rawdrive-backend python -c "from src.app.core.db import SessionLocal; from src.app.models.user import User; db = SessionLocal(); print(db.query(User).count())"
```

## 🛠️ IDE Configuration (VS Code)

- Open the workspace root.
- Install the **ESLint** and **Prettier** extensions.
- Use the **Workspace TypeScript Version** (Volar/VSCode will ask) to ensure it uses the `typescript` version from `package.json`.

