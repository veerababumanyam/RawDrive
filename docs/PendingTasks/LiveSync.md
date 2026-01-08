RawDrive Live Camera Sync Microservice Build a dedicated microservice designed with a scalable architecture for both development and production environments. 1. Executive Summary RawDrive Live Camera Sync enables wedding photographers to automatically upload photos from tethered cameras or SD card folders directly to client galleries with zero manual intervention. Photos appear in the cloud gallery within seconds of capture, allowing real‑time client collaboration during live events. Primary Value: Transform 3‑day delivery → same‑day proofs during wedding receptions.

## 2. Business Objectives Objective Metric Target Eliminate manual imports Hours saved per wedding 8 hours Enable live client collaboration Galleries updated during events 100% Drive Studio plan adoption Monthly recurring revenue $149 × 2K studios Increase photographer retention Churn reduction 25% Support peak wedding season Concurrent syncing photographers 50K 3. User Personas & Primary Use Cases Primary Persona: Wedding Photographer (Live Events) text Rohan, 32, shoots 15 weddings/month Pain: "Clients wait 3 days for proofs → lost upsell opportunities" Goal: "Show ceremony photos during reception → immediate album orders" Use Case 1: Tethered Live Shooting text 1. Connect Canon R5 to laptop before ceremony 2. Map camera folder → "Ananya Wedding" gallery 3. Shoot 300 ceremony photos → client proofs on phone during reception 4. Client favorites 47 photos → immediate album discussion Use Case 2: SD Card Hot‑Swap text 1. Map SD card slot D:\DCIM → "Rohan Engagement" gallery 2. Insert card 1 (200 photos) → auto‑upload during portraits 3. Swap card 2 during reception → seamless continuation 4. End of night: 847 photos live, client actively proofing Use Case 3: Multi‑Shooter Team text ✅ Shooter 1: Tethered camera → ceremony sub‑gallery ✅ Shooter 2: SD cards → portrait sub‑gallery ✅ Both streams → single client‑viewable gallery

###

###

###

##

##

##

###

##

###

## 4. Functional Requirements 4.1 Folder/Gallery Mapping text R1.1: Photographers map local folders to RawDrive galleries (1:1) R1.2: Support sub‑folder → sub‑gallery mapping R1.3: Multiple folders → single gallery (team shooting) R1.4: Visual confirmation: "C:\Weddings\Ananya ↔ Ananya Wedding Live" 4.2 Real‑Time Synchronization text R2.1: Detect folder changes <2 seconds (add/delete/rename/move) R2.2: New photos auto‑upload to mapped gallery R2.3: Deletions propagate cloud → local (optional) R2.4: Renames sync both directions R2.5: Live status: "247/1,234 photos synced 🔄" 4.6 Camera Tethering Support text R4.6.1: Auto‑detect tethered cameras (Canon/Nikon/Sony) R4.6.2: USB/WiFi/Ethernet connections R4.6.3: Live view monitoring (DCIM folders) R4.6.4: Battery/storage status display 4.7 Business Intelligence text R4.7.1: Sync dashboard (web + desktop) R4.7.2: Monthly stats: GB synced, photos processed R4.7.3: Per‑gallery sync status badges 5. Non‑Functional Requirements 5.1 Performance text NF1.1: 50K photographers syncing simultaneously NF1.2: Photo capture → cloud gallery <10 seconds NF1.3: 99.99% sync success rate NF1.4: Desktop app <100MB RAM idle 5.2 Availability text NF2.1: Offline operation (queue changes locally) NF2.2: Auto‑resume on reconnect NF2.3: Conflict resolution (local wins default) 5.3 Platforms text NF3.1: Windows 10/11, macOS 13+, Ubuntu 22.04+ NF3.2: Camera support: Canon/Nikon/Sony (top 80% market) 6. Microservice Architecture (High‑Level) text Desktop App (Tauri) ↓ Real‑time folder changes Sync Agent Microservice (KEDA autoscaling) ↓ Events to specialized services ├── Upload Microservice (new photos) ├── Gallery Microservice (deletions/metadata) └── Redis (live status dashboard) Autoscaling: KEDA scales Sync Agent based on sync event volume (5→40 pods). 7. Monetization & Business Model text FREE: Manual sync, 5GB/month, 2 folders PRO ($49/mo): Auto‑sync, 500GB/month, 10 folders STUDIO ($149/mo): Unlimited + camera tethering + team sync Expected Revenue: $298K ARR (2K Studio subscribers) 8. Success Metrics & KPIs Metric Target Business Impact Sync success rate 99.99% Trust Capture → cloud latency <10s Live collaboration Studio plan conversion 25% Pro → Studio $100/mo uplift Churn reduction 25% Retention Photos synced/month 10M Scale


## Summary: RawDrive LiveSync Microservice

### Service Rename (2026-01)
The service has been renamed from `sync-service` to `livesync-service` for better clarity and memorability:
- Service directory: `services/livesync-service/`
- API endpoint: `/api/v1/livesync/*`
- Frontend route: `/workspace/livesync`
- Dev script: `scripts/dev-livesync-service.sh`

### Changes Implemented
- **Completed livesync-service microservice implementation** with full Pydantic schemas, repositories, services, and API routers
- **Added requirements.txt** for the livesync-service with all necessary Python dependencies
- **Updated Traefik dynamic configuration** to route `/api/v1/livesync/*` to the livesync-service on port 8007
- **Created dev script** (`scripts/dev-livesync-service.sh`) for local development
- **Fixed port configuration** to use port 8007 (avoiding conflicts with other services)

### Files Modified
- `services/livesync-service/requirements.txt` (created)
- `services/livesync-service/src/config.py` (updated port from 8003 to 8007)
- `infrastructure/docker/traefik/dynamic.yaml` (added livesync-service routing and localhost router)
- `scripts/dev-livesync-service.sh` (created)

### Files From Previous Implementation (Already Complete)
**Backend (livesync-service microservice):**
- `services/livesync-service/src/schemas/` - common.py, mappings.py, sessions.py, events.py
- `services/livesync-service/src/repositories/` - mapping_repository.py, session_repository.py, event_repository.py
- `services/livesync-service/src/services/` - mapping_service.py, session_service.py
- `services/livesync-service/src/api/v1/` - mappings.py, sessions.py, dependencies.py, __init__.py
- Supporting modules: main.py, config.py, database.py, logging/, cache/, middleware/, observability/

**Frontend:**
- `frontend/src/services/liveSyncService.ts` - Full API client
- `frontend/src/pages/workspace/LiveSyncPage.tsx` - Complete UI with tabs, cards, empty states
- `frontend/src/router/routes.tsx` - Added `/workspace/livesync` route

### Verification Status
- All 5 Playwright tests passed:
  - should load livesync page successfully
  - should display livesync page header and description
  - should display tabs for mappings and sessions
  - should display New Sync Mapping button
  - should switch between tabs
- Verification test file deleted after successful verification

### Notes for Developer
1. **Database migrations** for sync tables (0103-0105) already exist but may need to be applied
2. **To start the livesync-service locally**: Run `bash scripts/dev-livesync-service.sh`
3. **Traefik routing** is configured for both production (`api.rawdrive.ai`) and local development
4. **Next steps for full feature completion**:
   - Implement the "Create Sync Mapping" modal dialog in the frontend
   - Implement WebSocket real-time updates for sync progress
   - Build the desktop client (Tauri app) for folder watching
   - Add the livesync-service to Docker Compose configuration