# RBAC and User Management

> Terminology: See [`GLOSSARY.md`](GLOSSARY.md) (canonical terms for Workspace, Asset, Share Link, Trial, etc.).

## Overview

RawDrive implements a comprehensive Role-Based Access Control (RBAC) system to manage user permissions across the platform. The system supports multiple user roles with distinct capabilities, subscription tiers that determine feature access, and granular permission controls for photographers managing their galleries and clients.

## Purpose

The RBAC system serves to:
- **Enforce Security**: Restrict access to sensitive operations and data
- **Enable Multi-Tenancy**: Isolate photographer data and prevent cross-account access
- **Support Subscription Tiers**: Limit features based on subscription level
- **Manage Team Access**: Allow photographers to invite team members with specific roles
- **Audit Compliance**: Track who performed what actions for compliance and support

## Architecture

### Roles and scopes

RawDrive uses **two RBAC scopes**:

1) **Workspace RBAC (customer-facing)**
- Evaluated within the active `workspace_id`.
- Backed by workspace membership (`workspace_memberships`) and workspace roles (`roles`).
- Applies to Studio App + Client Portal + Corporate Workspace UI.

2) **Platform RBAC (RawDrive Ops / Admin Console)**
- Evaluated outside any single workspace.
- Used for RawDrive internal administration (support, billing ops, moderation, security).
- **Does not automatically grant access to customer content**. Any customer data access must be explicitly granted and audited (see “Support Access” below).

### Workspace roles (customer-facing)

RawDrive defines workspace roles (examples; exact sets can vary by workspace type):

#### Workspace Owner (primary account)
The top-level admin within a workspace (often the “photographer/studio owner” in self-serve workspaces).

**Capabilities:**
- Create and manage galleries
- Upload and organize photos/videos
- Manage clients and access permissions
- Configure gallery settings and branding
- Access AI features (within tier limits)
- Invite team members
- View analytics and reports
- Manage subscription and billing (unless restricted by policy)
- Download and export data
- Manage workspace settings
- Create/update workspace roles (if enabled)

**Notes:**
- There is typically exactly one Workspace Owner per workspace.

**Tier-Based Limitations:**
- Storage quota (1 GB - Unlimited)
- Gallery count (3 - Unlimited)
- Client count (5 - Unlimited)
- AI credits per month (10 - 10,000)
- Team members (1 - Unlimited)

#### Workspace Admin
Delegated admin within a workspace.

**Common capabilities (policy-driven):**
- Manage members and invitations
- Assign workspace roles to members
- Manage workspace settings
- Manage billing **only if permitted** (many enterprise workspaces restrict billing)

#### Studio roles (typical templates)

These are recommended **workspace role templates** for photographer/studio workspaces:

- **Manager**: can manage members and day-to-day ops; cannot delete workspace.
- **Editor**: can upload/organize/edit metadata; cannot manage roles/billing.
- **Viewer**: read-only access to internal galleries/tools.
- **Finance**: billing and invoices; cannot access media beyond what billing screens require.

#### Client / External Guest (end recipient)
External identity that views or interacts with shared content (often via Share Link + invite).

**Capabilities:**
- View assigned galleries
- Mark photos as favorites (if enabled)
- Select photos for proofing (if enabled)
- Download photos (if enabled)
- View gallery metadata and EXIF data
- Access slideshow and zoom features
- Provide feedback via comments (if enabled)

**Limitations:**
- Read-only access to galleries
- Cannot modify or delete content
- Cannot access other clients' galleries
- Cannot access photographer settings
- Cannot invite other users

### Platform admin roles (RawDrive Ops)

Platform admins operate the multi-tenant SaaS via an internal **Admin Console**.

#### Platform admin role templates (recommended)

| Template | Role ID | Intended use | Can manage platform admins? | Default customer content access |
|---|---|---|---|---|
| Super Admin | `super_admin` | Full control plane + break-glass | ✅ Yes | ❌ No (requires explicit support access + audit) |
| Platform Admin | `platform_admin` | Platform monitoring, incident response coordination | ❌ No | ❌ No |
| Support Admin | `support_admin` | Customer support & troubleshooting | ❌ No | ❌ No (requires explicit support access + audit) |
| Billing Admin | `billing_admin` | Subscription, invoices, refunds | ❌ No | ❌ No |
| Content Moderator | `content_moderator` | Abuse/content moderation queues | ❌ No | ❌ No (moderation views are scoped/minimized) |
| Security Admin | `security_admin` | Security policy, investigations, incident tooling | ❌ No | ❌ No |
| Observability Admin | `observability_admin` | Logs/metrics/traces access and alert ops | ❌ No | ❌ No |
| Auditor (Read-only) | `auditor_readonly` | Read-only audits/log exports | ❌ No | ❌ No |
| Product Admin | `product_admin` | Feature flags, pricing experiments, rollouts | ❌ No | ❌ No |

Notes:
- “Default customer content access” is **No** for all templates; any cross-workspace inspection requires a scoped support session with audit.
- Templates are **system-defined**. Super Admin may assign multiple templates to one admin user for least privilege.

#### Super Admin (missing piece — now defined)

Super Admin is the only platform role that can **create/manage other platform admins** and **assign specific admin role templates**.

**Super Admin capabilities:**
- Create/disable platform admin accounts (or grant platform roles to existing users)
- Assign/revoke platform role templates (least privilege)
- Manage break-glass controls (who can start support access, required approvals)
- Manage platform configuration, feature flags, and global policies
- View/export platform audit logs

**Hard rules:**
- All platform role grants/revocations must be audited.
- Platform admins must use MFA.
- Platform roles do not automatically grant access to customer media; support access is separate.

#### Support access (cross-workspace, auditable)

When a platform admin needs to inspect a specific workspace for support:
- Start a **time-boxed support access session** scoped to a `workspace_id`.
- Require a reason (ticket ID) and record an audit event.
- Optionally require approval by Workspace Owner/Admin (enterprise default).

### Subscription Tiers

Subscription tiers determine feature availability and resource limits:

| Tier | Storage | Galleries | Clients | Team Members | Features |
|------|---------|-----------|---------|--------------|----------|
| **Free** | 1 GB | 3 | 5 | 1 | Basic sharing, AI (10 credits) |
| **Starter** | 10 GB | 10 | 20 | 1 | Custom branding, downloads, face recognition, video |
| **Professional** | 100 GB | 50 | 100 | 1 | Custom domain, print designer, priority support |
| **Business** | 1 TB | 200 | 500 | 5 | API access, multi-user, advanced analytics |
| **Enterprise** | Unlimited | Unlimited | Unlimited | Unlimited | White label, dedicated support, custom integrations |

### Permission Model

Permissions are organized hierarchically:

```
Platform Level (Admin Only)
├── User Management
│   ├── Create users
│   ├── Delete users
│   ├── Modify subscriptions
│   └── View user data
├── System Configuration
│   ├── Configure features
│   ├── Manage settings
│   ├── View logs
│   └── Access analytics
└── Billing & Revenue
    ├── View revenue reports
    ├── Manage payments
    └── Configure pricing

Photographer Level
├── Gallery Management
│   ├── Create gallery
│   ├── Edit gallery settings
│   ├── Delete gallery
│   ├── Upload photos
│   ├── Organize photos
│   └── Configure branding
├── Client Management
│   ├── Invite clients
│   ├── Manage access
│   ├── View client activity
│   └── Remove clients
├── Team Management
│   ├── Invite team members
│   ├── Assign roles
│   ├── Revoke access
│   └── View team activity
├── AI Features
│   ├── Analyze photos
│   ├── Generate captions
│   ├── Detect faces
│   └── Generate stories
└── Account Management
    ├── Update profile
    ├── Change password
    ├── Manage subscription
    └── View billing

Client Level
├── Gallery Viewing
│   ├── View assigned galleries
│   ├── View photos
│   └── View metadata
├── Photo Interaction
│   ├── Mark favorites
│   ├── Select for proofing
│   ├── Download (if enabled)
│   └── View slideshow
└── Feedback
    ├── Leave comments
    └── Provide ratings
```

## Data Isolation

### Workspace-Scoped Architecture (Multi-tenant)

RawDrive is a **multi-tenant SaaS**. A **workspace** is the unit of tenancy and billing.

**Rules:**
- Every customer-data record is scoped to exactly one workspace via `workspace_id` (legacy alias: `tenant_id` — avoid in new schemas/docs).
- Users belong to one or more workspaces; roles/permissions are evaluated **within the active workspace**.
- A “single-company / single-photographer” experience is simply **one workspace** (one studio = one workspace).

**Note on ownership:** within a workspace, resources can still have an `ownerUserId` (often the photographer) for attribution and studio workflows. Ownership is not used as the isolation boundary.

### Access Control Rules

**Photographer Access:**
```typescript
// Always scope reads/writes to the active workspace first.
// Ownership/assignment checks then apply within that workspace.
const canAccessGallery = (
  userId: string,
  activeWorkspaceId: string,
  gallery: { workspaceId: string; ownerUserId: string }
): boolean => {
  if (gallery.workspaceId !== activeWorkspaceId) return false;
  return userId === gallery.ownerUserId;
};

// Photographer can access team member's galleries if they have permission
const canAccessTeamGallery = (
  userId: string,
  activeWorkspaceId: string,
  gallery: { workspaceId: string; ownerUserId: string },
  teamMembers: TeamMember[]
): boolean => {
  if (gallery.workspaceId !== activeWorkspaceId) return false;
  return userId === gallery.ownerUserId || teamMembers.some(tm => tm.userId === userId && tm.hasAccess);
};
```

**Client Access:**
```typescript
// Client can only access galleries they're invited to
const canAccessGallery = (clientId: string, galleryId: string, invitations: Invitation[]): boolean => {
  return invitations.some(inv => 
    inv.clientId === clientId && 
    inv.galleryId === galleryId && 
    inv.isActive
  );
};

// Client cannot access other clients' galleries
const canAccessClientData = (clientId: string, targetClientId: string): boolean => {
  return clientId === targetClientId;
};
```

**Admin Access:**
```typescript
type PlatformRole =
  | 'super_admin'
  | 'platform_admin'
  | 'support_admin'
  | 'billing_admin'
  | 'content_moderator'
  | 'security_admin'
  | 'observability_admin'
  | 'auditor_readonly'
  | 'product_admin';

// Platform roles grant access to the Admin Console.
const hasPlatformConsoleAccess = (roles: PlatformRole[]): boolean => roles.length > 0;

// Customer content access requires an explicit, time-boxed support access session.
const canAccessWorkspaceForSupport = (input: {
  platformRoles: PlatformRole[];
  supportAccessSession: { workspaceId: string; expiresAt: Date } | null;
  targetWorkspaceId: string;
}): boolean => {
  if (!hasPlatformConsoleAccess(input.platformRoles)) return false;
  if (!input.supportAccessSession) return false;
  if (input.supportAccessSession.workspaceId !== input.targetWorkspaceId) return false;
  return input.supportAccessSession.expiresAt > new Date();
};

// All platform actions and support access must be audited.
const logPlatformAudit = (actorUserId: string, action: string, metadata: Record<string, any>) => {
  // Write to platform audit trail (immutable)
};
```

## Team Management

### Team Member Roles

Photographers can invite team members with specific roles:

#### Editor
- Can upload and organize photos
- Can edit photo metadata
- Can manage clients
- Cannot delete gallery
- Cannot change settings
- Cannot manage team

#### Viewer
- Can view gallery and photos
- Can view client list
- Cannot upload or edit
- Cannot delete
- Cannot manage team

#### Manager
- Can do everything except delete gallery
- Can manage team members
- Can change settings
- Can manage clients
- Cannot delete gallery

#### Owner
- Full access (only photographer)
- Can delete gallery
- Can manage all settings
- Can manage team

### Team Member Invitation Flow

```typescript
interface TeamMemberInvitation {
  id: string;
  workspaceId: string;
  invitedByUserId: string;
  email: string;
  role: 'editor' | 'viewer' | 'manager';
  status: 'pending' | 'accepted' | 'rejected';
  invitedAt: Date;
  expiresAt: Date;
  acceptedAt?: Date;
}

// Invitation process:
// 1. Photographer invites team member by email
// 2. Invitation sent with unique token
// 3. Team member clicks link and accepts/rejects
// 4. If accepted, team member account created or linked
// 5. Permissions granted based on role
```

## Client Access Management

### Client Invitation

Photographers can invite clients to view galleries:

```typescript
interface ClientInvitation {
  id: string;
  galleryId: string;
  clientEmail: string;
  accessLevel: 'view' | 'select' | 'download';
  passwordProtected: boolean;
  accessCode?: string;
  expiresAt?: Date;
  status: 'pending' | 'accepted' | 'viewed';
  invitedAt: Date;
}
```

### Access Levels

**View Only**
- Can view photos and metadata
- Cannot download
- Cannot select for proofing
- Cannot modify anything

**Select**
- Can view photos
- Can mark favorites
- Can select for proofing
- Cannot download
- Cannot modify

**Download**
- Can view photos
- Can mark favorites
- Can select for proofing
- Can download photos
- Cannot modify

### Password Protection

Galleries can be password-protected:

```typescript
interface GalleryAccess {
  isPasswordProtected: boolean;
  password?: string; // Hashed on backend
  accessCode?: string; // Unique per-photo access codes
  emailRegistration: boolean; // Require email before viewing
  expiryDate?: Date; // Auto-disable after date
}
```

## Permission Enforcement

### Backend Enforcement

All permission checks must be enforced on the backend:

```typescript
// ✅ Good: Backend enforces permissions
app.get('/api/galleries/:id', async (req, res) => {
  const gallery = await Gallery.findById(req.params.id);
  
  // Check if user has access
  if (!canUserAccessGallery(req.user.id, gallery.id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  return res.json(gallery);
});

// ❌ Bad: Frontend-only permission check
const canAccess = user.role === 'photographer'; // Not secure!
```

### Frontend Permission Display

Frontend should reflect backend permissions:

```typescript
// Show/hide UI based on permissions
const GalleryActions = ({ gallery, user }: Props) => {
  const canEdit = hasPermission(user, 'edit_gallery', gallery);
  const canDelete = hasPermission(user, 'delete_gallery', gallery);
  
  return (
    <div>
      {canEdit && <AppButton>Edit</AppButton>}
      {canDelete && <AppButton variant="destructive">Delete</AppButton>}
    </div>
  );
};
```

## Tier-Based Feature Access

### Feature Availability by Tier

```typescript
interface TierFeatures {
  // Note: Trial is an account state (30-day) and is not modeled as its own paid tier.
  // During trial, treat the workspace as Business-tier for feature access and limits.
  starter: {
    customBranding: true,
    customDomain: false,
    clientDownloads: true,
    printDesigner: false,
    faceRecognition: true,
    videoSupport: true,
    apiAccess: false,
    teamMembers: 1,
  },
  professional: {
    customBranding: true,
    customDomain: true,
    clientDownloads: true,
    printDesigner: true,
    faceRecognition: true,
    videoSupport: true,
    apiAccess: false,
    teamMembers: 1,
  },
  business: {
    customBranding: true,
    customDomain: true,
    clientDownloads: true,
    printDesigner: true,
    faceRecognition: true,
    videoSupport: true,
    apiAccess: true,
    teamMembers: 5,
  },
  enterprise: {
    customBranding: true,
    customDomain: true,
    clientDownloads: true,
    printDesigner: true,
    faceRecognition: true,
    videoSupport: true,
    apiAccess: true,
    teamMembers: Infinity,
  },
}
```

### Enforcing Tier Limits

```typescript
// Check if feature is available for tier
const isFeatureAvailable = (tier: SubscriptionTier, feature: string): boolean => {
  return tierFeatures[tier][feature] === true;
};

// Check if user has reached quota
const hasReachedQuota = (user: User, resource: string): boolean => {
  const limit = tierLimits[user.tier][resource];
  const current = getUserResourceCount(user.id, resource);
  return current >= limit;
};

// Enforce quota before action
const createGallery = async (userId: string, galleryData: GalleryData) => {
  const user = await User.findById(userId);
  
  if (hasReachedQuota(user, 'galleries')) {
    throw new Error('Gallery limit reached for your tier');
  }
  
  // Always set workspace scope on created records.
  // In a personal/studio workspace, creator is typically also the owner.
  return Gallery.create({
    ...galleryData,
    workspaceId: user.workspaceId,
    ownerUserId: userId
  });
};
```

## Standard Test Users

### Platform Administrators

1. **Super Admin**
   - Email: `superadmin@rawdrive.com`
   - Password: `Test@123`
   - Access: Full platform administration

2. **Platform Admin**
   - Email: `admin@rawdrive.com`
   - Password: `Test@123`
   - Access: Platform management

3. **Product Manager**
   - Email: `productmanager@rawdrive.com`
   - Password: `Test@123`
   - Access: Subscription management

### Test Photographers (One per Tier)

1. **Trial (30-day Business trial)**: `trial@photographer.com` / `Test@123`
2. **Starter Tier**: `starter@photographer.com` / `Test@123`
3. **Professional Tier**: `professional@photographer.com` / `Test@123`
4. **Business Tier**: `business@photographer.com` / `Test@123`
5. **Enterprise Tier**: `enterprise@photographer.com` / `Test@123`

**Note:** These credentials are LOCKED. See `.kiro/steering/standard-test-users-locked.md` for change process.

## Implementation Patterns

### Permission Checking Hook

```typescript
// Frontend hook for checking permissions
const usePermission = (resource: string, action: string) => {
  const { user } = useAuth();
  
  const hasPermission = useMemo(() => {
    if (!user) return false;

    // Platform admins authenticate into a separate Admin Console (separate RBAC model).
    // They should not “auto-pass” permissions inside customer workspace surfaces.
    if (user.authRealm === 'platform_admin') return false;
    
    // Check tier-based permissions
    if (!isFeatureAvailable(user.tier, resource)) return false;
    
    // Check resource-specific permissions
    return checkResourcePermission(user, resource, action);
  }, [user, resource, action]);
  
  return hasPermission;
};

// Usage
const { canEdit } = usePermission('gallery', 'edit');
```

### Permission Guard Component

```typescript
interface PermissionGuardProps {
  resource: string;
  action: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

const PermissionGuard: React.FC<PermissionGuardProps> = ({
  resource,
  action,
  fallback,
  children
}) => {
  const hasPermission = usePermission(resource, action);
  
  if (!hasPermission) {
    return fallback || <div>You don't have permission to access this.</div>;
  }
  
  return <>{children}</>;
};

// Usage
<PermissionGuard resource="gallery" action="delete">
  <AppButton variant="destructive">Delete Gallery</AppButton>
</PermissionGuard>
```

### Tier Limit Check

```typescript
const useTierLimit = (resource: string) => {
  const { user } = useAuth();
  const [current, setCurrent] = useState(0);
  
  useEffect(() => {
    const fetchCount = async () => {
      const count = await api.getUserResourceCount(user.id, resource);
      setCurrent(count);
    };
    
    fetchCount();
  }, [user.id, resource]);
  
  const limit = tierLimits[user.tier][resource];
  const remaining = limit - current;
  const isAtLimit = current >= limit;
  
  return { current, limit, remaining, isAtLimit };
};

// Usage
const { remaining, isAtLimit } = useTierLimit('galleries');

if (isAtLimit) {
  return <div>You've reached your gallery limit. Upgrade to create more.</div>;
}
```

## Audit Logging

All sensitive operations should be logged:

```typescript
interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  changes?: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  status: 'success' | 'failure';
  errorMessage?: string;
}

// Log important actions
const logAuditEvent = async (
  userId: string,
  action: string,
  resource: string,
  resourceId: string,
  changes?: Record<string, any>
) => {
  await AuditLog.create({
    userId,
    action,
    resource,
    resourceId,
    changes,
    ipAddress: getClientIp(),
    userAgent: getUserAgent(),
    timestamp: new Date(),
    status: 'success'
  });
};

// Log on sensitive operations
const deleteGallery = async (userId: string, workspaceId: string, galleryId: string) => {
  const gallery = await Gallery.findById(galleryId);
  
  // Check permissions
  // Always enforce workspace boundary first.
  if (gallery.workspaceId !== workspaceId) {
    throw new Error('Unauthorized');
  }

  // Minimal example: only the owner can delete (RBAC can broaden this to managers/admins)
  if (gallery.ownerUserId !== userId) {
    throw new Error('Unauthorized');
  }
  
  // Delete
  await Gallery.deleteById(galleryId);
  
  // Log
  await logAuditEvent(userId, 'delete', 'gallery', galleryId, {
    title: gallery.title,
    photoCount: gallery.photos.length
  });
};
```

## Security Best Practices

### Do's
- ✅ Always check permissions on backend
- ✅ Use role-based access control
- ✅ Enforce tier limits on backend
- ✅ Log all sensitive operations
- ✅ Use secure session management
- ✅ Validate all user inputs
- ✅ Use HTTPS for all requests
- ✅ Implement rate limiting

### Don'ts
- ❌ Don't trust frontend permission checks
- ❌ Don't expose sensitive data in API responses
- ❌ Don't allow users to modify their own tier
- ❌ Don't skip audit logging
- ❌ Don't use hardcoded permissions
- ❌ Don't expose user IDs in URLs without validation
- ❌ Don't allow direct database access from frontend
- ❌ Don't cache sensitive data in localStorage

## Related Files

- `backend/src/config/tier-limits.ts` - Tier limit definitions
- `backend/src/db/migrations/039_standard_test_users.sql` - Test user migration
- `backend/src/db/seeds/standard-test-users.ts` - Test user seed script
- `USER_CREDENTIALS_AND_TIERS.md` - User credentials documentation
- `.kiro/steering/tier-limits-locked.md` - Locked tier specifications
- `.kiro/steering/standard-test-users-locked.md` - Locked test user credentials
- `types.ts` - Type definitions (User, Role, SubscriptionTier)

## Last Updated

2025-12-17
