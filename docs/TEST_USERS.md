# RawDrive Test Users Reference

> **Password for ALL test users:** `Test@123`

All test users are seeded with deterministic UUIDs for reproducible testing. Email is verified by default.

---

## 1. Subscription Tier Test Users

These users test different subscription plans and their limits.

| Email | UUID | Plan | Storage | Galleries | Clients | Team | AI Credits |
|-------|------|------|---------|-----------|---------|------|------------|
| `free@test.rawdrive.in` | `11111111-1111-1111-1111-111111111001` | Free | 1 GB | 3 | 5 | 3 | 50/mo |
| `starter@test.rawdrive.in` | `11111111-1111-1111-1111-111111111002` | Starter | 10 GB | 10 | 20 | 10 | 200/mo |
| `professional@test.rawdrive.in` | `11111111-1111-1111-1111-111111111003` | Professional | 100 GB | 50 | 100 | 50 | 1000/mo |
| `business@test.rawdrive.in` | `11111111-1111-1111-1111-111111111004` | Business | 1 TB | 200 | 500 | 200 | 2500/mo |
| `enterprise@test.rawdrive.in` | `11111111-1111-1111-1111-111111111005` | Enterprise | Unlimited | 10000 | 10000 | 10000 | 10000/mo |

Each tier user owns their own workspace (e.g., `free`, `starter`, etc.) with a 30-day trial subscription.

---

## 2. Platform Admin Test Users

These users have **platform-level** (global) administrative privileges—they do NOT automatically have access to customer workspace data.

| Email | UUID | Role | Permissions | Responsibilities |
|-------|------|------|-------------|------------------|
| `superadmin@test.rawdrive.in` | `22222222-2222-2222-2222-222222222001` | **Super Admin** | `platform:admins:write`, `platform:admins:read`, `platform:workspaces:read`, `platform:config:write`, `platform:audit:read` | Full platform control; manage other admins; view all workspaces; modify platform config; read audit logs |
| `platformadmin@test.rawdrive.in` | `22222222-2222-2222-2222-222222222002` | Platform Admin | `platform:admins:read`, `platform:workspaces:read`, `platform:billing:read`, `platform:feature_flags:write` | View admins/workspaces; read billing; manage feature flags |
| `supportadmin@test.rawdrive.in` | `22222222-2222-2222-2222-222222222003` | Support Admin | `platform:support_access:start`, `platform:support_access:stop`, `platform:workspaces:read` | Start/stop customer support sessions; view workspaces |
| `billingadmin@test.rawdrive.in` | `22222222-2222-2222-2222-222222222004` | Billing Admin | `platform:billing:read`, `platform:billing:write` | View and modify billing/subscription data |
| `contentmod@test.rawdrive.in` | `22222222-2222-2222-2222-222222222005` | Content Moderator | `platform:moderation:read`, `platform:moderation:write` | Review and act on flagged content |
| `securityadmin@test.rawdrive.in` | `22222222-2222-2222-2222-222222222006` | Security Admin | `platform:observability:read`, `platform:config:write`, `platform:audit:read` | Monitor security metrics; update security config; read audit logs |
| `observabilityadmin@test.rawdrive.in` | `22222222-2222-2222-2222-222222222007` | Observability Admin | `platform:observability:read` | View platform metrics/logs |
| `auditor@test.rawdrive.in` | `22222222-2222-2222-2222-222222222008` | Auditor (Read-only) | `platform:audit:read` | Read-only access to audit logs |
| `productadmin@test.rawdrive.in` | `22222222-2222-2222-2222-222222222009` | Product Admin | `platform:feature_flags:write`, `platform:feature_flags:read` | Manage feature flags/rollouts |

---

## 3. Workspace Role Test Users

These users belong to a shared **test-roles-workspace** (`44444444-4444-4444-4444-444444444000`) and demonstrate workspace-level RBAC.

| Email | UUID | Role | Permissions | Responsibilities |
|-------|------|------|-------------|------------------|
| `workspaceowner@test.rawdrive.in` | `33333333-3333-3333-3333-333333333001` | **Owner** | `workspace:write`, `members:write`, `roles:write`, `galleries:write`, `assets:write`, `billing:write`, `audit:read` | Full workspace control; manage members & roles; billing; audit |
| `workspaceadmin@test.rawdrive.in` | `33333333-3333-3333-3333-333333333002` | Admin | `workspace:write`, `members:write`, `roles:write`, `galleries:write`, `assets:write`, `billing:read`, `audit:read` | Manage workspace settings, members, roles; cannot modify billing |
| `staffuser@test.rawdrive.in` | `33333333-3333-3333-3333-333333333003` | Editor | `galleries:write`, `assets:write` | Create/edit galleries and assets |
| `clientviewer@test.rawdrive.in` | `33333333-3333-3333-3333-333333333004` | Viewer | `galleries:read`, `assets:read` | Read-only access to galleries and assets |

---

## Quick Reference

### Login Credentials
```
Email: <any of the above>
Password: Test@123
```

### API Endpoints
```
POST /api/v1/auth/login
{
  "email": "superadmin@test.rawdrive.in",
  "password": "Test@123"
}
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Platform Roles** | Global admin privileges; NO implicit customer data access |
| **Workspace Roles** | Scoped to a single workspace; control galleries/assets/members |
| **Subscription Tiers** | Enforce storage, gallery, client, team, and AI credit limits |
| **Workspace Isolation** | All queries MUST filter by `workspace_id` |

### UUID Patterns
- `11111111-...-111111111001–005` → Tier test users
- `22222222-...-222222222001–009` → Platform admins
- `33333333-...-333333333001–004` → Workspace role users
- `44444444-...-444444444000` → Shared test-roles-workspace
- `aaaaaaaa-...-aaaaaaaaa001–005` → Subscription plans
