# Technical Requirements: Foundation & Governance

**Document Status:** Draft v1.1 (Operational Priority)  
**Ownership:** Backend / Platform Architecture  
**Technology:** Elixir (Ash Framework), PostgreSQL (Multi-tenancy), Casbin (RBAC)

---

## 1. Product Mission
Provide a bulletproof security and multi-tenancy foundation that ensures data isolation, granular access control, and territorial governance (State-First).

## 2. Multi-Tenant Architecture

### 2.1 Virtual Isolation
- **Workspace-Level Separation:** All data (assets, clients, leads) is scoped at the `workspace_id` level.
- **Ash Framework Domains:** Using Ash-level multitenancy to enforce isolation at the resource level.
- **Global IDs:** Unique identifiers for consistent resource lookup across the platform.

### 2.2 Role-Based Access Control (RBAC)
- **Super Admin:** Global control (RawDrive team).
- **Admin:** Workspace owner (Photographer).
- **Editor:** Can manage assets and galleries.
- **Viewer:** Read-only access for team members.
- **Client:** Limited access to shared galleries.

---

## 3. The "State Gate" (Mandatory Onboarding)

### 3.1 The Onboarding Rule
To ensure correct attribution for the **Revenue_Dealership_Engine.md**, RawDrive enforces a "State Gate":
1.  **Selection:** During signup, photographers **MUST** select their primary operating state in India (e.g., Telangana, Maharashtra).
2.  **Validation:** State selection is mandatory before any workspace is created or assets uploaded.
3.  **Irreversibility:** Once selected, the `selected_state_id` is locked to the workspace to prevent margin-sharing fraud.

---

## 4. State Management (The "State" of the App)

### 4.1 Global State Store
- **Persistence:** Using Redis or PostgreSQL for transient session state and long-term workspace configuration.
- **Edge Caching:** State-level configuration cached at the edge (Cloudflare) for low latency.

---

## 5. Security & Audit Governance
- **Activity Logs:** Immutable record of "Who did What and When" (e.g., "Editor A deleted Gallery B").
- **Audit Trails:** For every financial transaction or attribution event in the **Revenue_Dealership_Engine.md**.
- **GDPR / Indian Data Protection Compliance:** Tools to export or delete customer data upon request.

---

## 6. Monitoring & Health
- **Tenant Metrics:** Real-time visibility into storage usage and API limits per workspace.
- **Alerting:** Notifications for "Suspicious Activity" (e.g., bulk downloads from an unknown IP).
