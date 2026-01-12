# Authentication Architecture Reference

This document details the authentication and authorization architecture of the RawDrive platform. Use this as the source of truth for understanding how identity, sessions, and permissions are managed.

---

## 1. Overview

RawDrive uses a **Stateless JWT-based Authentication** system with **Stateful Session Tracking** for security and control. This hybrid approach provides the scalability of JWTs with the revocation capabilities of session-based auth.

### Core Components used
*   **Access Tokens:** Short-lived JWTs (JSON Web Tokens) for API access.
*   **Refresh Tokens:** Long-lived, opaque tokens (stored as hashes) for obtaining new access tokens.
*   **Sessions:** Database and Redis records linking a user, device, and refresh token family.
*   **RBAC:** Role-Based Access Control scoped to Workspaces.

---

## 2. Authentication Methods

### 2.1 Local Authentication (Email/Password)
*   **Flow:** User submits email/password -> `AuthService.login_local` -> Validate credentials -> Issue Tokens.
*   **Hashing:** Passwords are hashed using **Argon2id**.
*   **Opacity:** Login errors are opaque ("Invalid email or password") to prevent user enumeration.
*   **Device Tracking:** Captures IP, User-Agent, and Client Fingerprint during login.

### 2.2 Google OAuth 2.0
*   **Flow:** Authorization Code Flow (Server-side).
    1.  Frontend requests auth URL (`/api/v1/auth/oauth/google/start`).
    2.  User approves access on Google.
    3.  Google redirects to Backend Callback (`/api/v1/auth/oauth/google/callback`).
    4.  Backend exchanges code for tokens + fetches user info.
    5.  **Account Linking:** If email exists, links Google identity to existing user (Property 14).
    6.  Backend redirects to Frontend with RawDrive tokens.
*   **State Parameter:** Used to prevent CSRF and persist frontend redirect destination.

---

## 3. Token Management

### 3.1 Access Tokens
*   **Format:** JWT (Signed using EdDSA/RS256).
*   **TTL:** Short-lived (default: 15 minutes).
*   **Payload:**
    *   `sub`: User ID (UUID).
    *   `wids`: List of active Workspace IDs.
    *   `perms`: Scoped permissions for the current context.
    *   `sid`: Session ID (optional in access tokens, critical in refresh).
*   **Validation:** Signature verification + Expiry check. No DB lookup required for validity, but `sid` checks can be performed for critical actions.

### 3.2 Refresh Tokens
*   **Format:** Opaque string (UUID or random bytes), delivered to client.
*   **Storage:** **Hashed (SHA-256)** in Database and Redis. Raw token never stored.
*   **TTL:**
    *   Standard: 7 days.
    *   "Remember Me": 30 days.
*   **Rotation:** **Strict Rotation Enforced**. Every use of a refresh token invalidates it and issues a new one.
*   **Revocation:** Tied to a `Session`. Revoking a session invalidates the refresh token family.

### 3.3 Session Management
*   **Entity:** `Session` (DB Table + Redis Key).
*   **Purpose:** Tracks "logged in" state across multiple devices.
*   **Redis Key:** `session:{session_id}:refresh_hash` (stores current valid refresh token hash).
*   **Logout:** Deletes the Redis key and marks DB session as revoked.

---

## 4. Authorization (RBAC)

Authorization is **Workspace-Scoped**. A user can have different roles in different workspaces.

### 4.1 Permission Structure
Permissions are hierarchical strings: `resource:action`.
*   `billing:read`
*   `galleries:write`
*   `workspace:*` (Wildcard)

### 4.2 Role Assignment
*   **Users** have **Memberships** in **Workspaces**.
*   **Memberships** have **Roles** (e.g., Owner, Admin, Editor).
*   **Roles** contain lists of **Permissions**.

### 4.3 Permission Resolution
1.  **Load:** Fetch all roles for user in valid workspace.
2.  **Flatten:** Union of all permission sets.
3.  **Expand:** Wildcards (e.g., `billing:*`) expand to specific permissions (`billing:read`, `billing:write`).
4.  **Inject:** Permissions injected into Access Token claims (`perms`).

### 4.4 Gatekeepers
*   **API Level:** `require_permissions("galleries:write")` dependency.
*   **Service Level:** RBAC checks inside complex business logic.

---

## 5. Security Measures

*   **Audit Logging:** Critical events (Login, Signup, Refresh, OAuth) are logged with request context (IP, UA) but **PII is scrubbed/hashed** (e.g., email hashes).
*   **Rate Limiting:** Login endpoints protected against brute force.
*   **Token reuse detection:** If an old refresh token is used, the entire session is revoked (possible theft).
*   **CSRF Protection:** OAuth state parameter; usage of `SameSite` cookies where applicable (though API relies on Bearer headers).

## 6. Implementation Reference

| Component | File Path |
| :--- | :--- |
| **Routes** | `backend/src/app/api/v1/auth.py` |
| **Logic (Auth)** | `backend/src/app/services/auth_service.py` |
| **Logic (OAuth)** | `backend/src/app/services/oauth_service.py` |
| **Dependencies** | `backend/src/app/api/dependencies/auth.py` |
| **Schemas** | `backend/src/app/api/schemas/auth.py` |

---

## 7. Client-Side Handling

*   Tokens should be stored securely (e.g., Secure HttpOnly Cookies preferred, or memory/local storage if necessary - *Note: Current implementation returns tokens in body, client must handle storage*).
*   Client intercepts 401 responses to trigger `refresh_token` flow automatically.
*   `access_token` attached to `Authorization: Bearer <token>` header.
