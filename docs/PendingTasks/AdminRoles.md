# Admin Roles & Platform Management

## Business Value Proposition The Admin Roles system provides the governance layer for the RawDrive SaaS platform. Unlike Workspace roles which manage content and members within a single tenant, **Platform Roles** facilitate the management of the business itself—ensuring operational stability, customer support, revenue assurance, and safety. ### Key Business Benefits - **Operational Security**: Least-privilege access for employees (e.g., Support agents cannot change system configs). - **Scalable Support**: Dedicated roles for Level 1/2 support to view accounts without full administrative power. - **Revenue Protection**: Strict controls over billing and subscription overrides. - **Trust & Safety**: Specialized tools and permissions for content moderation and user bans. - **Auditability**: Every administrative action is logged with the specific admin identity and role context. > **Status**: Required - Production Ready





---



---

## Implementation Tasks
- [ ] packages/shared-types/src/admin.ts

Create platform admin constants in shared-constants

- [ ] packages/shared-constants/src/admin.ts

### Backend Migrations

Create Alembic migration for platform_roles table

- [ ] Create platform admin types in shared-types package

- [ ] backend/migrations/versions/0106_user_platform_roles.py
- [ ] backend/migrations/versions/0107_admin_audit_logs.py
- [ ] backend/migrations/versions/0108_support_access_sessions.py

### Backend Models

- [ ] backend/src/app/models/platform_role.py
- [ ] backend/src/app/models/user_platform_role.py
- [ ] backend/src/app/models/admin_audit_log.py
- [ ] backend/src/app/models/support_access_session.py
- [ ] backend/src/app/models/__init__.py (update exports)

### Backend Repositories

- [ ] backend/src/app/repositories/platform_admin_repository.py
- [ ] backend/src/app/repositories/admin_audit_repository.py

### Backend Services

- [ ] backend/src/app/services/platform_rbac_service.py
- [ ] backend/src/app/services/platform_admin_service.py
- [ ] backend/src/app/services/support_access_service.py
- [ ] backend/src/app/services/admin_audit_service.py

### Backend API

- [ ] backend/src/app/api/v1/schemas/admin_schemas.py
- [ ] backend/src/app/api/dependencies/platform_admin.py
- [ ] backend/src/app/api/v1/admin.py
- [ ] backend/src/app/api/v1/support_access.py
- [ ] backend/src/app/api/v1/moderation.py
- [ ] backend/src/app/api/v1/__init__.py (register routes)

### Frontend

- [ ] frontend/src/types/admin.ts
- [ ] frontend/src/services/adminService.ts
- [ ] frontend/src/hooks/useAdminAuth.ts
- [ ] frontend/src/contexts/AdminContext.tsx
- [ ] frontend/src/components/layout/AdminLayout.tsx
- [ ] frontend/src/pages/admin/AdminDashboard.tsx
- [ ] frontend/src/components/features/admin/WorkspaceSearch.tsx
- [ ] frontend/src/components/features/admin/SupportAccessPanel.tsx
- [ ] frontend/src/components/features/admin/AdminRolesManager.tsx
- [ ] frontend/src/router/routes.tsx (add routes)

### Scripts & Tests

- [ ] backend/src/app/shared/types/admin.py (generate from TypeScript)
- [ ] backend/scripts/seed_platform_roles.py
- [ ] backend/tests/unit/test_platform_rbac.py
- [ ] Create seed script for default platform roles

backend/scripts/seed_platform_roles.py
Create backend unit tests for platform RBAC

backend/tests/unit/test_platform_rbac.py
Create backend integration tests for admin API

backend/tests/integration/test_admin_api.py