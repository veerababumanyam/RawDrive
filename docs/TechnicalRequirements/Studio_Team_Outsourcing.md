# Technical Requirements: Studio Team & Outsourcing

**Document Status:** Setera Standard v1.0  
**Ownership:** Studio Operations / Marketplace  
**Technology:** Elixir (Granular Permissions), Postgres (RBAC), WhatsApp Integration

---

## 1. Product Mission
Simplify the "Human Scaling" of a photography studio. Enable owners to build teams (full-time or freelance), outsource post-production safely, and manage the internal "Collaborator" lifecycle.

## 2. Multi-User Studio Roles (RBAC)

### 2.1 The Team Hierarchy
- **Studio Owner (L1):** Full control over billing, leads, and all project access.
- **Lead Photographer (L2):** Can manage their assigned projects and view client communications for those projects.
- **Associate Photographer (L3):** View-only access to assigned projects; can only upload assets.
- **External Retoucher (L4):** Restricted access specifically for downloading RAWs and uploading finished "Edits". Zero access to client contact info or billing.

### 2.2 Seat Management
- **Subscription Tiering:** Basic plans include X seats; Enterprise plans have unlimited seats.
- **Audit Logs:** Every "Delete" or "Move" action by a team member is logged against their user ID.

---

## 3. Internal Outsourcing Marketplace

### 3.1 The "Find a Teammate" Engine
- **Profile Discovery:** Search for verified "Second Shooters" or "Video Editors" within the RawDrive ecosystem (filtered by city/state).
- **Project Posting:** Studios can post "Help Needed" for a specific date/location.
- **Contractual Safety:** Automated **Work-for-Hire** agreements generated when a teammate is hired, ensuring the Studio Owner retains copyright.

### 3.2 Milestone Payments (Internal)
- **Escrow-light:** The studio can pre-fund a teammate's fee.
- **Release Trigger:** Funds are released once the associate photographer uploads the final cards or the retoucher finishes the gallery.

---

## 4. Collaborative Editor Workflow

### 4.1 Asset Isolation
- **The "Retoucher Handoff":** A dedicated folder or project view where only specific images are shared for editing.
- **High-Res Sync:** Retouchers can upload finished JPEGs/TIFFs directly into the gallery's "Finished" folder without needing the owner's credentials.

### 4.2 Feedback Loop
- **Threaded Comments:** Internal-only comments (non-client visible) for team communication (e.g., "Bump up the exposure on the bride's face in this set").
- **Quality Control (QC):** Studio owners must "Approve" a retoucher's batch before it becomes visible in the Client Gallery.

---

## 5. Mobile Team Coordination
- **WhatsApp Ops:** Automated WhatsApp groups or broadcasts for team members on a specific event day (e.g., "Schedule for Sharma Wedding - Oct 12").
- **Voice Briefing:** Owners can leave voice-note briefings for associates directly inside the project channel.
