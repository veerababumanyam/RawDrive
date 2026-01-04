# Documentation Update Summary

This document summarizes the changes made to the project documentation to ensure it accurately reflects the current codebase architecture.

## 1. Project Structure (`structure.md`)

- **Frontend Organization**: Updated the directory tree to show the **Feature-Sliced Design** pattern implementation in `frontend/src/components/features/` (e.g., `gallery/`, `profile/`, `invitations/`).
- **Backend Organization**: Completely rewrote the backend structure to match the **Python/FastAPI** application layout (`backend/src/app/`) instead of the previous Node.js structure.
- **Microservices**: Added the `ai-service` directory structure.
- **Architecture Layers**: Clarified the backend service layer organization (API Routes -> Services -> Raw SQL/Repositories).
- **Import Examples**: Updated code snippets to show correct Python absolute imports (e.g., `from src.app.services...`) and frontend path aliases.

## 2. Technology Stack (`tech.md` & `docs/project/01-TECH_STACK.md`)

- **Backend Stack**: Corrected the backend stack description to **Python 3.11+, FastAPI, and asyncpg** (Raw SQL). Removed incorrect references to Node.js, Express, and SQLAlchemy ORM.
- **Database**: Updated database tools to reflect **Alembic** for migrations and **asyncpg** for high-performance async driver usage.
- **Testing**: Updated testing tools to **Pytest** (backend) and **Vitest** (frontend).
- **Development Workflow**: Updated run commands to use `uvicorn` and `npm run dev`.

## 3. Data Model (`docs/project/04-DATA_MODEL.md`)

- **Syntax Update**: Converted the data model definitions from TypeScript interfaces/mixed pseudo-code to **Python Pydantic Models**, which more accurately represents the backend schema definitions.
- **ORM Clarification**: Removed references to SQLAlchemy ORM (`Mapped`, `Base`) as the codebase primarily uses raw SQL with `asyncpg`.

## 4. Key Files

- Updated the "Key Files" tables to point to the correct entry points:
    - Backend: `backend/src/app/main.py`
    - Frontend: `frontend/src/App.tsx`
    - Config: `backend/src/app/core/config.py`

These updates ensure that the documentation now serves as a reliable source of truth for the current state of the architecture.
