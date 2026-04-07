# Technical Requirements: Creative Workflow Tools

**Document Status:** Setera Standard v1.1 (2026 Ready)  
**Ownership:** Creative Product / Studio Operations  
**Technology:** React (DnD), WASM (wazero), WebSockets, Google Gemini (Layout Gen)

---

## 1. Product Mission
Equip professional studios with high-value design and communication tools that move beyond simple delivery. The **Digital Album Design Studio** and **Transient Messaging** layer streamline the process from post-production to physical print fulfillment.

## 2. Digital Album Design Studio (The Designer)

### 2.1 AI-Assisted "Smart Layouts"
- **Gemini Layout Engine:** High-level AI that analyzes image aspect ratios, color palettes, and event timestamps to suggest the most aesthetic 2-page spreads automatically.
- **Spread-Based Interface:** Drag-and-drop canvas optimized for lay-flat albums.
- **Culling Sync:** Integrated with **AI_Intelligence_Search.md** to prioritize "Must-Have" photos in the design.

### 2.2 Lab Presets & Print Fulfillment
- **Indian Lab Support:** Pre-defined sizes, bleed markers, and color profiles for major Indian labs (e.g., Canvera, Better Photography partners).
- **Material Preview:** Real-time 3D-like rendering of cover textures (Leather, Acrylic, Silk).
- **Export Engine:** High-resolution CMYK PDF export with automated pre-flighting to catch low-res images before printing.

---

## 3. Transient Internal Messaging

### 3.1 The "Project Channel" Model
A built-in, secure communication layer for the studio ecosystem:
- **Automatic Channel Discovery:** Every gallery/lead automatically generates a transient messaging channel (e.g., `#shoot-sharma-wedding`).
- **Transient Data Policy:** Messages and voice notes are stored for 180 days (per plan) to maintain platform "Zero-Bloat" performance.
- **WhatsApp Bridge:** Critical alerts or "Client is online" notifications pushed to the photographer's WhatsApp.

### 3.2 Collaborative Proofing
- **Pinned Comments:** Clients can click specific regions of a spread or photo and leave feedback (e.g., "Remove the fly in the background").
- **Drafting Mode:** Retouchers can share "Half-edited" previews with photographers for internal critique before client exposure.

---

## 4. WASM-Powered Plugin Ecosystem (`wazero`)

### 4.1 Extensible Architecture
RawDrive provides a sandboxed environment for third-party creative plugins:
- **The WASM Bridge:** Use `wazero` for secure, high-performance execution of image processing logic in the Go data plane.
- **Plugin Marketplace:** Independent developers can ship WASM "Filters", "Blemish Removers", or "Watermarker" plugins.
- **Privacy Gating:** Plugins have zero access to the host file system or network; they only receive image buffers.

---

## 5. Review, Approval & Legal Consent

### 5.1 The "Final Print" Sign-off
- **Consent Ledger:** Before an album is sent to the lab, the client must click "Approved for Print". This event is immutable and stored for dispute resolution.
- **Version Pinning:** Once approved, the specific layout version is locked and hashed to prevent silent edits.
- **Approval Notification:** Instant "Client has approved the album" WhatsApp alert for the photographer.
