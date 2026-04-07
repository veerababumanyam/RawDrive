# RawDrive Team Member Role — Frontend Requirements Specification

**Version:** 1.0
**Date:** 2026-04-04
**PRD Reference:** `frontend/docs/TechnicalRequirements/PRD.md` (Sections 6.2.5, 9.1, 9.2, 14.1, 13.11)

---

## Table of Contents

1. [Role Overview](#1-role-overview)
2. [Navigation and Layout](#2-navigation-and-layout)
3. [Dashboard and Home Screen](#3-dashboard-and-home-screen)
4. [Feature Access Matrix](#4-feature-access-matrix)
5. [Screens and Page Inventory](#5-screens-and-page-inventory)
6. [UI Components and Patterns](#6-ui-components-and-patterns)
7. [Business Rules and Validation](#7-business-rules-and-validation)
8. [Notifications and Alerts](#8-notifications-and-alerts)
9. [Restricted Actions — Explicit Denials](#9-restricted-actions--explicit-denials)
10. [Cross-References](#10-cross-references)
11. [Acceptance Criteria](#11-acceptance-criteria)

---

## 1. Role Overview

### 1.1 Role Description

The **Team Member** works within a studio workspace with role-limited access. They are hired/contracted team working under a Photographer/Studio Owner's workspace. Their access is entirely scoped by the studio owner's permission grants.

### 1.2 Key Characteristics

- **Invite-only** — cannot self-register as team member
- **Workspace-scoped** — all actions within studio owner's workspace
- **No billing relationship** — uses studio's subscription
- **Permission-based** — access defined by studio owner's role assignments
- Examples: second-shooter, retoucher, studio assistant, album designer

---

## 2. Navigation and Layout

### 2.1 Navigation (Simplified Subset)

```
[Studio Logo / Name]
[Team Member Name]
[Role Badge: "Team Member"]
[Workspace: "ABC Photography Studio"]

— MY WORK —
  Dashboard
  My Assignments

— GRANTED ACCESS — (only shows sections granted by owner)
  Galleries          (if gallery access granted)
  Albums             (if album access granted)
  Uploads            (if upload access granted)
  Clients            (if CRM access granted)
  Proofing           (if proofing access granted)
  Calendar           (if calendar access granted)
  Communication      (if messaging access granted)
  AI Tools           (if AI access granted + plan includes)

— ACCOUNT —
  My Activity
  Profile Settings
  Notification Preferences
```

### 2.2 Layout Principles

**FR-TM-NAV-001**: Only sections granted by studio owner are visible in sidebar.
**FR-TM-NAV-002**: Workspace name always visible: "Working in [Studio Name]".
**FR-TM-NAV-003**: No billing, plan, team management, public profile, or branding sections.
**FR-TM-NAV-004**: Ungrantable sections hidden entirely (not grayed out).

---

## 3. Dashboard and Home Screen

### 3.1 Scoped KPIs

| KPI | Data |
|-----|------|
| Assigned Galleries | Count of galleries assigned to this member |
| Active Tasks | Pending work items |
| Proofing Items | Proofing actions needed on assigned galleries |
| Upcoming Shoots | Scheduled shoots (if calendar access) |
| Unread Messages | Messages in assigned conversations |

### 3.2 Activity Feed

- Tasks assigned to you
- Proofing activity on assigned galleries
- Client messages on assigned conversations
- Calendar reminders (if granted)

### 3.3 Quick Actions (based on grants)

| Action | Condition |
|--------|-----------|
| Upload to Assigned Gallery | If upload access granted |
| Respond to Client Message | If messaging access granted |
| View Calendar | If calendar access granted |

---

## 4. Feature Access Matrix

All access depends on studio owner's permission grants:

| Feature | Access Level | Condition |
|---------|-------------|-----------|
| Assigned Galleries | View/edit | If gallery access granted |
| Create Galleries | Create | Only if explicitly granted |
| Delete Galleries | Delete | Only if explicitly granted |
| Upload (to assigned) | Create | If upload access granted |
| Upload (to unassigned) | DENIED | Always |
| Asset Management | View/edit in scope | Within assigned galleries |
| Client Proofing | Manage | If proofing access granted, on assigned galleries |
| Client CRM | View assigned | If CRM access granted |
| Delete Clients | DENIED | Unless explicitly granted |
| Calendar | View/edit | If calendar access granted |
| Communication | Team + assigned clients | If messaging access granted |
| Albums | Edit assigned | If album access granted |
| Create Albums | Create | Only if explicitly granted |
| AI Features | Use on assigned | If AI access granted + plan includes |
| My Activity Stats | Read | Always |
| Profile Settings | Edit own | Always |
| **Public Profile** | **DENIED** | Studio owner's domain |
| **Freelancer Profile** | **DENIED** | Not applicable |
| **Camera Rentals** | **DENIED** | Not applicable |
| **Live Streaming (create)** | **DENIED** | Cannot create/purchase |
| **Live Streaming (assist)** | View/assist | Only if granted |
| **Billing / Plan** | **DENIED** | Studio owner's responsibility |
| **Team Management** | **DENIED** | Studio owner only |
| **Workspace Settings** | **DENIED** | Studio owner only |
| **Branding** | **DENIED** | Studio owner only |
| **Storage Usage** | **DENIED** | Studio owner only |
| **Analytics (studio-wide)** | **DENIED** | Unless explicitly granted |
| **Downloads/Exports** | Conditional | Only if download permission granted |

---

## 5. Screens and Page Inventory

### 5.1 Core Screens (Always Available)

| Screen ID | Route | Description |
|-----------|-------|-------------|
| TM-DASH-001 | `/workspace/team-dashboard` | Personal overview: assignments, tasks, messages |
| TM-ASN-001 | `/workspace/assignments` | List of all assigned galleries/albums/clients |
| TM-ACT-001 | `/workspace/my-activity` | Personal activity log, contribution stats |
| TM-PRF-001 | `/workspace/profile` | Name, avatar, contact, password, notification prefs |
| TM-NOT-001 | `/workspace/notifications` | Notifications relevant to assignments |

### 5.2 Conditional Screens (Based on Grants)

| Screen ID | Route | Requires Grant | Description |
|-----------|-------|---------------|-------------|
| TM-GAL-001 | `/workspace/galleries` | Gallery access | Assigned galleries list |
| TM-GAL-002 | `/workspace/galleries/:id` | Gallery access | Gallery view/edit within scope |
| TM-UPL-001 | `/workspace/uploads` | Upload access | Upload to assigned galleries only |
| TM-PRF-001 | `/workspace/proofing` | Proofing access | Proofing on assigned galleries |
| TM-CRM-001 | `/workspace/clients` | CRM access | Assigned client list |
| TM-CRM-002 | `/workspace/clients/:id` | CRM access | Client profile (scoped) |
| TM-CAL-001 | `/workspace/calendar` | Calendar access | Calendar view (own shoots) |
| TM-MSG-001 | `/workspace/messages` | Messaging access | Team + assigned client messages |
| TM-ALB-001 | `/workspace/albums` | Album access | Assigned albums |
| TM-ALB-002 | `/workspace/albums/:id` | Album access | Album editor (assigned) |
| TM-AI-001 | `/workspace/ai` | AI access + plan | AI tools on assigned galleries |

**FR-TM-SCR-001**: Non-granted screens return "Access not granted. Contact your studio owner." — not a 403.
**FR-TM-SCR-002**: Gallery list shows only assigned galleries with "Assigned to you" badge.
**FR-TM-SCR-003**: Upload zone accepts only uploads to assigned galleries — dropdown shows only assigned galleries.

---

## 6. UI Components and Patterns

### 6.1 "Assigned to You" Badge
- Visual badge on galleries/albums/clients assigned to this team member
- Differentiates assigned from unassigned content (unassigned not shown)

### 6.2 Permission-Denied Overlay
- Grayed-out sections with message: "This feature requires studio owner approval. Contact [Owner Name]."
- NOT a generic 403 — shows who to contact

### 6.3 Workspace Scope Indicator
- Persistent banner: "Working in [Studio Name]"
- Shows studio owner's branding (logo, name)
- Always visible in top bar or sidebar header

### 6.4 Simplified Navigation
- Only granted sections appear
- Clean, uncluttered sidebar
- Focus on assigned work

### 6.5 Activity Log
- Shows team member's own contributions
- Filterable by: date, action type, gallery/album/client
- Useful for time tracking and work review

### 6.6 Assignment Cards
- Used on My Assignments screen
- Card shows: gallery/album name, assigned date, status, due date (if set), owner notes

---

## 7. Business Rules and Validation

### 7.1 Workspace Scoping

**BR-TM-WS-001**: ALL data access scoped to workspace_id of studio owner.
**BR-TM-WS-002**: Cannot access any data outside assigned workspace.
**BR-TM-WS-003**: Cannot see other team members' assignment details.

### 7.2 Permission Grants

**BR-TM-PM-001**: Access controlled by granular permission flags set by studio owner.
**BR-TM-PM-002**: Permission changes by studio owner take effect immediately (next page load).
**BR-TM-PM-003**: Adding a new permission does NOT require re-invite — it's a live update.

### 7.3 Billing Dependency

**BR-TM-BIL-001**: If studio owner's plan doesn't include team members → team member access blocked with message: "Your studio's current plan does not include team access."
**BR-TM-BIL-002**: If studio owner enters billing-hold → team member also enters read-only mode.
**BR-TM-BIL-003**: If studio owner's team_member_limit is reduced below current count → last-added members may lose access.

### 7.4 Removal

**BR-TM-REM-001**: If team member is removed by studio owner → immediate access revocation.
**BR-TM-REM-002**: Active session must be terminated within 60 seconds of removal.
**BR-TM-REM-003**: Removed team member's contributions remain in the workspace (they don't own the data).

### 7.5 Activity Logging

**BR-TM-LOG-001**: All team member actions logged and visible to studio owner.
**BR-TM-LOG-002**: Logs include: timestamp, action, target entity, team member identity.

### 7.6 Asset Controls

**BR-TM-AST-001**: Cannot export/download assets unless explicitly granted download permission.
**BR-TM-AST-002**: Cannot delete assets unless explicitly granted delete permission.
**BR-TM-AST-003**: Uploads go to assigned galleries only — cannot upload to unassigned.

---

## 8. Notifications and Alerts

| Trigger | Priority | Channel |
|---------|----------|---------|
| New assignment (gallery/album/client) | High | In-app + push |
| Proofing activity on assigned gallery | Medium | In-app |
| Client message on assigned conversation | Medium | In-app + push |
| Calendar reminder (if granted) | Medium | In-app + push |
| Workspace billing-hold affecting access | Critical | In-app + email |
| Removal from workspace | Critical | In-app + email |
| Permission change (new grant or revoke) | High | In-app |
| Studio owner message | Medium | In-app + push |

---

## 9. Restricted Actions — Explicit Denials

| # | Denied Action | Enforcement |
|---|-------------|-------------|
| RD-TM-001 | Self-registration | Invite-only flow |
| RD-TM-002 | Create own workspace | No workspace creation UI |
| RD-TM-003 | View billing/plan info | No billing screens |
| RD-TM-004 | Manage team members | No team management screens |
| RD-TM-005 | Modify workspace settings | No settings screens |
| RD-TM-006 | Modify branding | No branding screens |
| RD-TM-007 | Edit public profile | Studio owner's domain |
| RD-TM-008 | Create freelancer profile | No freelancer screens |
| RD-TM-009 | List camera rentals | No rental screens |
| RD-TM-010 | Purchase streaming credits | No purchase controls |
| RD-TM-011 | View studio-wide analytics (unless granted) | No analytics screens |
| RD-TM-012 | Delete galleries/albums/clients (unless granted) | Delete controls hidden |
| RD-TM-013 | Access other members' assignments | Data scoped to own assignments |
| RD-TM-014 | Upload to unassigned galleries | Gallery dropdown shows assigned only |
| RD-TM-015 | Access admin/dealer/super-admin functions | No access to admin routes |
| RD-TM-016 | Export/download assets (unless granted) | Download buttons hidden |
| RD-TM-017 | Change workspace name or studio identity | No workspace settings |

---

## 10. Cross-References

| PRD Section | Team Member Coverage |
|-------------|---------------------|
| 6.2.5 (Team Member role) | Section 1 |
| 9.1 (Role Hierarchy) | Section 4 (Access Matrix) |
| 9.2 (Registration Rules) | Section 7.4 (invite-only) |
| 14.1 (Team Management) | Section 7.2 (Permission Grants) |
| 13.11 (Entitlement Enforcement) | Section 7.3 (Billing Dependency) |

---

## 11. Acceptance Criteria

### 11.1 Access Control
**AC-TM-001**: Given a team member with gallery access only, when they navigate to `/workspace/clients`, then they see "Access not granted" message (not 403).
**AC-TM-002**: Given a team member, when studio owner revokes their gallery access, then gallery section disappears from sidebar on next page load.
**AC-TM-003**: Given a team member, when they view galleries, then they see ONLY assigned galleries.

### 11.2 Workspace Scoping
**AC-TM-004**: Given a team member, when they make any API call, then all data is scoped to studio owner's workspace_id.
**AC-TM-005**: Given a team member in Studio A, when they navigate to Studio B's workspace URL, then they get access denied.

### 11.3 Upload Scoping
**AC-TM-006**: Given a team member with upload access, when they open upload zone, then gallery dropdown shows only assigned galleries.
**AC-TM-007**: Given a team member, when they attempt to upload to an unassigned gallery via API, then API returns 403.

### 11.4 Billing Dependency
**AC-TM-008**: Given a studio owner entering billing-hold, then team member's workspace becomes read-only.
**AC-TM-009**: Given a studio owner's plan doesn't include team members, then team member sees "Plan does not include team access" message.
**AC-TM-010**: Given a studio owner removing a team member, then access is revoked within 60 seconds.

### 11.5 Activity Logging
**AC-TM-011**: Given a team member editing an assigned gallery, then the action appears in studio owner's activity log.
**AC-TM-012**: Given a team member viewing My Activity, then they see their own contributions only.

### 11.6 Permission Grants
**AC-TM-013**: Given a studio owner granting CRM access to a team member, then CRM section appears in sidebar without re-invite.
**AC-TM-014**: Given a team member with no delete permission, then no delete buttons appear on galleries/albums/clients.

### 11.7 Denials
**AC-TM-015**: Given a team member, when they navigate to `/workspace/billing`, then redirect to dashboard with message.
**AC-TM-016**: Given a team member, when they navigate to `/workspace/team`, then redirect to dashboard with message.
**AC-TM-017**: Given a team member, when they inspect DOM, then no billing, pricing, or team management elements exist.

---

## Requirement Summary

| Category | Count |
|----------|-------|
| Functional Requirements (FR-TM-*) | 8 |
| Business Rules (BR-TM-*) | 16 |
| Restricted Actions (RD-TM-*) | 17 |
| Acceptance Criteria (AC-TM-*) | 17 |
| **Total Testable Requirements** | **58** |

---

*End of Team Member Role Frontend Requirements Specification*
