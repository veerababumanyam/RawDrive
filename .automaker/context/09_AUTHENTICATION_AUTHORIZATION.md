# Authentication & Authorization (RBAC)

## Business Value Proposition

Authentication & Authorization provides secure user management, workspace isolation, and role-based access control (RBAC) to ensure data security, compliance, and proper access management across the platform.

### Key Business Benefits
- **Data Security**: Protect customer data with secure authentication
- **Multi-Tenancy**: Complete workspace isolation for each customer
- **Access Control**: Granular permissions for different user roles
- **Compliance**: Meet security and regulatory requirements
- **Audit Trail**: Track all access and changes
- **Enterprise SSO**: Support for enterprise single sign-on

> **Reference Documentation**:
> - `docs/Features/AUTHENTICATION_AND_SECURITY.md` - Authentication technical specification
> - `docs/Features/RBAC_AND_USER_MANAGEMENT.md` - RBAC documentation

---

## Key Capabilities

### User Authentication

**Primary Methods**:
- **Google OAuth (OIDC)**: Primary signup/login method
- **Email/Password**: Local authentication for users without Google
- **Account Linking**: Google and local using verified email

**Password Security**:
- Minimum 8 characters with complexity requirements
- Argon2id hashing (recommended) or bcrypt (12 rounds)
- Password history (cannot reuse last 5)
- Account lockout after 5 failed attempts (15 minutes)

**Token Signing (JWT)**:
- Algorithm: EdDSA with Ed25519 keypair
- Access token: 15-minute expiry
- Refresh token: 7-day expiry in httpOnly cookie

### Two-Factor Authentication (2FA)

**Supported Methods**:
- TOTP (Google Authenticator, Authy)
- Email (6-digit code, 10-minute expiry)
- Backup Codes (10 one-time use codes)

### Enterprise SSO

**Supported Protocols**:
- SAML 2.0
- OIDC (OpenID Connect)
- Azure AD (first-class support)

**Features**:
- Just-in-Time (JIT) provisioning
- Group-to-role mapping
- Attribute mapping

### Workspace Management

- Each customer operates in isolated workspace
- Complete data isolation via workspace_id
- URL-friendly slug for workspace identification
- Multi-workspace support per user

### Role-Based Access Control (RBAC)

**Built-in Roles**:
| Role | Description |
|------|-------------|
| Owner | Full access, billing, deletion |
| Admin | User management, settings |
| Editor | Create/edit galleries, clients |
| Viewer | Read-only access |

**Permission Caching**: Redis cache with invalidation on changes

### Audit Logging

All operations logged with user attribution, IP tracking, and compliance reporting.

---

## Technical Architecture

### Backend Services

- `auth_service.py` - User authentication, token management
- `rbac_service.py` - Permission checking, role assignment
- `oauth_service.py` - Google OAuth integration
- `workspace_service.py` - Workspace management
- `sso_service.py` - SAML/OIDC integration

### Database Schema

Core tables: users, user_identities, workspaces, user_workspaces, roles, permissions, role_permissions, sessions, sso_configurations, audit_events

---

## Security & Compliance

- **Encryption**: TLS 1.3, Argon2id password hashing
- **Threat Prevention**: Rate limiting, CSRF protection, SQL injection prevention
- **Compliance**: GDPR, CCPA, SOC 2, OWASP Top 10

---

## Implementation Status

- Completed: Email/password auth, Google OAuth, JWT tokens, workspace management, basic RBAC
- In Progress: Two-factor authentication
- Planned: Enterprise SSO, SCIM provisioning
