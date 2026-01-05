# Admin Roles & Platform Management

## Business Value Proposition

The Admin Roles system provides the governance layer for the RawDrive SaaS platform. Unlike Workspace roles which manage content and members within a single tenant, **Platform Roles** facilitate the management of the business itself—ensuring operational stability, customer support, revenue assurance, and safety.

### Key Business Benefits
- **Operational Security**: Least-privilege access for employees (e.g., Support agents cannot change system configs).
- **Scalable Support**: Dedicated roles for Level 1/2 support to view accounts without full administrative power.
- **Revenue Protection**: Strict controls over billing and subscription overrides.
- **Trust & Safety**: Specialized tools and permissions for content moderation and user bans.
- **Auditability**: Every administrative action is logged with the specific admin identity and role context.

> **Reference Documentation**:
> - `docs/Business_Features/09_AUTHENTICATION_AUTHORIZATION.md` - Core Authentication & Workspace RBAC
> - `docs/Business_Features/13_AUDIT_COMPLIANCE.md` - Audit Logging Standards

---

## Role Hierarchy & Architecture

The system implements a **Dual-Scope RBAC** architecture:

1.  **Workspace Scope**: Controls access to a specific customer workspace (e.g., `workspace:read`, `galleries:write`).
2.  **Platform Scope**: Controls access to the SaaS back-office (e.g., `platform:billing:write`, `platform:config:write`).

**A single user can hold roles in both scopes simultaneously.** For example, a Customer Success Manager might have the `Accounts Admin` platform role, but also be an invited `Viewer` in a specific key client's workspace.

### Platform Role Definitions

#### 1. Super Admin
**The "Break Glass" Authority.**
*   **Purpose**: Ultimate authority for system recovery, critical configuration, and managing other admins.
*   **Access Level**: Full wildcard access (`*`) to all platform scopes.
*   **Key Responsibilities**:
    *   Granting/Revoking other admin roles.
    *   Emergency system reconfiguration.
    *   Accessing any workspace data for legal/compliance reasons (via Support Access).
*   **Security Requirement**: Mandatory Hardware 2FA (YubiKey/Passkey) enforced.

#### 2. Platform Admin (DevOps / Engineering)
**The System Maintainer.**
*   **Purpose**: managing the technical infrastructure, feature flags, and system health without accessing customer business data.
*   **Access Level**: Configuration and Observability focused.
*   **Key Responsibilities**:
    *   Managing global system configurations.
    *   Toggling Feature Flags for rollouts.
    *   Monitoring system observability (logs, metrics, health).
*   **Restrictions**: Cannot view specific customer billing details or access workspace content.
*   **Internal Role Name**: `platform_admin`

#### 3. Support Admin (Accounts / CSM)
**The Customer Manager.**
*   **Purpose**: Enabling business operations, handling subscriptions, and providing customer support.
*   **Access Level**: Read-only access to Workspace metadata, Write access to Billing.
*   **Key Responsibilities**:
    *   Searching and viewing Workspace metadata (Owner, Plan, Usage).
    *   Managing Subscriptions (Upgrades, Refunds, Adjustments).
    *   Initiating "Support Access" sessions to troubleshoot as a user.
*   **Restrictions**: Cannot change system configs or view content without explicit "Support Access" grant.
*   **Internal Role Name**: `support_admin`

#### 4. Content Moderator (Trust & Safety)
**The Moderator.**
*   **Purpose**: Enforcing terms of service and responding to abuse reports.
*   **Access Level**: Moderation focused.
*   **Key Responsibilities**:
    *   Reviewing flagged content queues.
    *   Banning abusive users or suspending workspaces.
    *   Generating compliance reports.
*   **Restrictions**: No access to billing or system configuration.
*   **Internal Role Name**: `content_moderator`

### Specialized Platform Roles

In addition to the core administrative roles, the platform defines several specialized roles for specific business functions.

#### 5. Finance Admin
**Purpose**: Full management of invoicing, revenue reporting, and refunds. Includes sensitive financial data access.
**Permissions**: `platform:billing:*`, `platform:finance:*`, `platform:invoices:*`, `platform:refunds:write`.
**Internal Role Name**: `finance_admin`

#### 6. Product Admin
**Purpose**: Managing feature rollouts and beta testing via feature flags.
**Permissions**: `platform:feature_flags:read`, `platform:feature_flags:write`.
**Internal Role Name**: `product_admin`

#### 7. Security Admin
**Purpose**: High-level oversight of system configuration and security audits.
**Permissions**: `platform:config:write`, `platform:observability:read`, `platform:audit:read`.
**Internal Role Name**: `security_admin`

#### 8. Observability Admin
**Purpose**: Read-only access to system health, logs, and metrics for monitoring.
**Permissions**: `platform:observability:read`.
**Internal Role Name**: `observability_admin`

#### 9. Auditor (Read-Only)
**Purpose**: External or internal compliance auditing.
**Permissions**: `platform:audit:read`.
**Internal Role Name**: `auditor_readonly`

---

## Detailed Permission Matrix

The following matrix maps the abstract roles to concrete permissions defined in the `RBACService`.

| Permission Scope | Description | Super Admin | Platform Admin | Accounts Admin | Content Admin |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Admin Management** | | | | | |
| `platform:admins:read` | View list of platform admins | ✅ | ✅ | ✅ | ❌ |
| `platform:admins:write` | Create/Delete platform admins | ✅ | ❌ | ❌ | ❌ |
| **Workspace Operations** | | | | | |
| `platform:workspaces:read` | List/Search all workspaces | ✅ | ✅ | ✅ | ❌ |
| `platform:support_access:start`| Impersonate/Access workspace | ✅ | ❌ | ✅ | ❌ |
| `platform:support_access:stop` | End support session | ✅ | ❌ | ✅ | ❌ |
| **System Configuration** | | | | | |
| `platform:config:write` | Edit global settings | ✅ | ✅ | ❌ | ❌ |
| `platform:feature_flags:read` | View feature flags | ✅ | ✅ | ❌ | ❌ |
| `platform:feature_flags:write` | Toggle feature flags | ✅ | ✅ | ❌ | ❌ |
| **Billing & Revenue** | | | | | |
| `platform:billing:read` | View revenue/invoices | ✅ | ❌ | ✅ | ❌ |
| `platform:billing:write` | Refund/Modify subscriptions | ✅ | ❌ | ✅ | ❌ |
| **Trust & Safety** | | | | | |
| `platform:moderation:read` | View abuse reports | ✅ | ❌ | ❌ | ✅ |
| `platform:moderation:write` | Ban/Suspend entities | ✅ | ❌ | ❌ | ✅ |
| **Observability** | | | | | |
| `platform:observability:read` | View system logs/metrics | ✅ | ✅ | ❌ | ❌ |
| `platform:audit:read` | View comprehensive audit logs | ✅ | ✅ | ✅ | ✅ |
| **Specialized Data** | | | | | |
| `platform:finance:*` | Granular financial record access | ❌ | ❌ | ❌ | ❌ |
| `platform:invoices:*` | Invoice management | ❌ | ❌ | ❌ | ❌ |
| `platform:refunds:write` | Process refunds | ❌ | ❌ | ❌ | ❌ |

> **Note**: Specialized permissions like `platform:finance:*` are currently reserved for the `finance_admin` role and are not granted to general admins by default.

---

## Operational Workflows

### 1. Support Access (Impersonation)
To troubleshoot user issues, **Accounts Admins** and **Super Admins** can initiate a controlled access session.
1.  Admin locates workspace via `platform:workspaces:read`.
2.  Admin requests access via providing a **Reason Code** and **Ticket ID**.
3.  System checks `platform:support_access:start` permission.
4.  **Audit Log** records `SUPPORT_ACCESS_STARTED` with `admin_id`, `target_workspace_id`, and `reason`.
5.  Admin receives a temporary, short-lived session token for that workspace.
6.  All actions performed during this session are logged as `actor: admin_user (on_behalf_of: workspace_user)`.

### 2. Moderation Takedown
When content is flagged (automated or manual report):
1.  **Content Admin** receives notification.
2.  Accesses the specific resource via `platform:moderation:read`.
3.  Determines violation.
4.  Executes `platform:moderation:write` to set status to `SUSPENDED` or `BANNED`.
5.  Triggers email notification to the workspace owner.

### 3. Feature Flag Rollout
For safe deployment of new features:
1.  **Platform Admin** creates a flag in `disabled` state.
2.  Updates flag to `targeted` (enabled for internal dogfooding workspaces).
3.  Verifies metrics via `platform:observability:read`.
4.   Gradually increases rollout percentage (10% -> 50% -> 100%) via `platform:feature_flags:write`.

---

## Database & Implementation

### Core Tables
*   `platform_roles`: Static definition of roles and their permission sets.
*   `user_platform_roles`: Check table linking `user_id` to `role_id` with `granted_at` and `revoked_at` timestamps for history.

### Security Controls
1.  **Immutable Logs**: Admin actions are written to a write-only audit table that cannot be purged by Admins (requires direct DB access by DevOps).
2.  **Session Hardening**: Admin sessions have shorter idle timeouts (15 minutes) compared to regular user sessions.
3.  **Privilege Separation**: The application is designed so that normal runtime operations do not require `Super Admin` privileges; those are reserved for API operations.

## Future Roadmap
- [ ] **Role Scoping by Region**: Restrict Content Admins to specific legal jurisdictions (e.g., "EU Content Admin").
- [ ] **Just-In-Time (JIT) Access**: Request-approval flow for obtaining `Super Admin` write permissions for a limited time window (4 hours).
- [ ] **Admin Activity Dashboard**: Real-time visual view of active admin sessions for the Security team.
