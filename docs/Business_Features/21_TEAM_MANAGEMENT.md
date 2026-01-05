# Team Management & Multi-User Workspaces

> **Reference Documentation**:
> - `docs/Business_Features/09_AUTHENTICATION_AUTHORIZATION.md` - Core RBAC
> - `docs/Business_Features/13_AUDIT_COMPLIANCE.md` - Audit Logging

## Business Value Proposition

RawDrive is designed for studios of all sizes, from solo freelancers to large agencies with editors, shooters, and assistants. The Team Management module allows workspace owners to invite collaborators, assign granular roles, and maintain security through activity monitoring. This enables businesses to scale their operations securely without sharing passwords.

### Key Business Benefits
- **Operational Scalability**: Delegate tasks (editing, uploading, client comms) to staff.
- **Security**: Eliminate password sharing; each member has their own credentials.
- **Access Control**: Restrict sensitive areas (Billing, Deletion) to authorized personnel only.
- **Accountability**: Audit logs track exactly *who* performed an action.
- **Flexible Workflow**: Support for permanent staff and temporary freelancers.

---

## User Personas

1.  **Studio Owner**
    *   Has full control.
    *   Invites and removes members.
    *   Concerned with security and billing visibility.

2.  **Studio Manager**
    *   Manages day-to-day operations (galleries, clients).
    *   Needs broad access but perhaps not billing.

3.  **Editor / Associate Photographer**
    *   Task-focused: Creating galleries, uploading, curating.
    *   Does not need access to client CRM or business settings.

4.  **Freelancer**
    *   Temporary access to specific projects (Future roadmap feature).

---

## Key Capabilities

### 1. Invitation System
*   **Email Invitations**: Secure magic links sent to the invitee's email.
*   **Role Selection**: Assign role at time of invitation.
*   **Expiry**: Invitations expire in 7 days security.
*   **Revocation**: Pending invitations can be cancelled.
*   **Resend**: Ability to resend lost invitations.

### 2. Role-Based Access Control (RBAC)

The platform supports a fixed set of workspace-level roles:

| Role | Description | Key Permissions |
| :--- | :--- | :--- |
| **Owner** | The legal owner of the workspace. Cannot be removed. | `*` (All Access), Billing, Workspace Deletion. |
| **Admin** | High-level manager. | User Management, Settings, All Gallery Ops. No Billing/Delete Workspace. |
| **Editor** | Day-to-day creative work. | Create/Edit/Delete Galleries, Upload. No User Management or Settings. |
| **Viewer** | Read-only internal access. | View Galleries, Analytics. No Edit capabilities. |

### 3. Member Management
*   **List View**: See all active members and pending invitations.
*   **Role Updates**: Promote or demote members (e.g., Editor -> Admin).
*   **Suspension**: Temporarily disable access without deleting the account.
*   **Removal**: Permanently revoke access.
    *   *Safe Removal*: System prompts to reassign ownership of assets if necessary (though assets belong to workspace, not user).

### 4. Audit & Security
*   **Activity Logs**: "User X invited User Y", "User X changed User Y's role".
*   **MFA Enforcement**: Owners can enforce 2FA for all team members (Enterprise feature).
*   **Session Revocation**: Admins can force-logout a member if compromised.

---

## Integration with Company Profile
Team members can be optionally displayed on the public **Company Profile** page to build trust with clients.
*   **"Meet the Team" Section**: Auto-populated from Team Management.
*   **Profile Fields**: Avatar, Name, Job Title (e.g., "Senior Photographer").
*   **Visibility Toggle**: Each member can be hidden/shown publicly.

---

## Technical Architecture

### Backend Services

```
team_service.py             - Manages team membership (UserWorkspace)
invitation_service.py       - Handles email invites & token validation
rbac_service.py             - Enforces permission checks
audit_service.py            - Logs member activities
```

### API Endpoints

```
GET /api/v1/workspace/{id}/members
    - List all members and invites.

POST /api/v1/workspace/{id}/invitations
    - Send invite. Logic: Create token -> Email -> Store in DB.

PUT /api/v1/workspace/{id}/members/{user_id}/role
    - Update role.

DELETE /api/v1/workspace/{id}/members/{user_id}
    - Remove member.
```

### Database Schema

*   `user_workspaces`: Join table `(user_id, workspace_id, role)`.
*   `workspace_invitations`: `(email, workspace_id, role, token, expires_at)`.

---

## Future Enhancements
*   **Granular/Custom Roles**: Allow defining custom permission sets (e.g., "Finance Only").
*   **Project-Level Access**: Restrict Freelancers to specific Galleries only.
*   **Team Groups**: Organize large teams into "Editing Team", "Shooting Team".
