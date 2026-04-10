# Technical Requirements: Studio Desktop Companion (Windows & macOS)

**Document Status:** Setera Standard v1.0 (2026-04 aligned)  
**Ownership:** Product / Media Engineering / Frontend Platform  
**Technology Boundary:** Desktop client shell, RawDrive APIs, local file-system access, local encoder integration, Cloudflare Stream ingest, resumable upload workflows

---

## 1. Product Mission
Provide studios and broadcasters with a cross-platform desktop companion for **Windows** and **macOS** that offloads heavy first-mile work to the source machine: live encoding orchestration, local preflight checks, folder watch and sync, large upload reliability, and source-side processing where it improves quality or operator confidence.

The desktop companion is an **operator tool**, not a viewer app. Viewer and shared-client experiences remain browser/PWA-first.

---

## 2. What Already Exists

### 2.1 Verified Existing Product Surfaces
- The frontend is a browser-based application with PWA support in [frontend/package.json](../../../frontend/package.json).
- Application-wide PWA behavior already exists in [frontend/src/contexts/PWAContext.tsx](../../../frontend/src/contexts/PWAContext.tsx).
- A Live Sync workspace page already references a future desktop app session model in [frontend/src/pages/workspace/LiveSyncPage.tsx](../../../frontend/src/pages/workspace/LiveSyncPage.tsx).
- Headless studio automation is already described in [CLI_Tooling_Automation.md](../CLI_Tooling_Automation.md).
- Live-event workflow and Cloudflare Stream ingest are already defined in [LiveStreaming.md](LiveStreaming.md).
- Uploaded-video and replay delivery are already defined in [Video_Transcoding_Delivery.md](Video_Transcoding_Delivery.md).

### 2.2 Grounding Decisions
- This desktop companion must extend the existing browser/PWA product rather than replace it.
- The desktop companion must share the same authentication, entitlements, workspace model, and backend APIs as the web application.
- First-mile live encoding may be source-side, but delivery transcoding for playback remains Cloudflare Stream's responsibility.
- RawDrive application servers must not run customer-video encode, transcode, or live relay jobs as part of the normal media architecture.

---

## 3. Scope and Boundaries

### 3.1 In Scope
- Windows and macOS desktop application for studio operators.
- Source-side live-stream preparation and encoder validation.
- Integration with supported local encoder workflows for RTMPS/SRT broadcasting.
- Folder watch, sync, resumable uploads, retry handling, and large-file operational UX.
- Source-side metadata extraction, checksumming, and optional lightweight preprocessing where policy enables it.
- Desktop notifications, diagnostics, logs, and support bundle export.
- Launch support policy for approved encoder workflows.

### 3.2 Out of Scope
- Viewer-facing playback application.
- iOS/Android native photographer apps.
- Replacing Cloudflare Stream with RawDrive-owned live transcoding or delivery infrastructure.
- Mandatory desktop dependency for simple gallery viewing, proof approval, or public share flows.
- Running RawDrive-managed media transcode or live relay workers on RawDrive application servers.

### 3.3 Product Positioning
- **Browser/PWA remains the default client surface** for public viewers and general studio workflows.
- **Desktop companion is the premium operator surface** for heavy local workflows and source-side processing.
- **CLI remains valid** for power users and automation; the desktop companion complements it rather than replacing it.

---

## 4. User Personas

### 4.1 Broadcaster
- Needs a reliable go-live path on Windows/macOS with encoder preflight, low-friction stream start, and immediate error visibility.

### 4.2 Studio Operator / DIT
- Needs folder watch, high-volume upload stability, crash-safe resume, and operational insight for long-running transfers.

### 4.3 Support / Admin
- Needs logs, diagnostics, session state, and reproducible issue reports when a local workflow fails.

---

## 5. Functional Requirements

### FR-001: Supported Desktop Platforms
**As a** studio operator  
**I want** a supported desktop application on Windows and macOS  
**So that** I can run heavy workflows locally without depending on a browser tab staying alive

**Acceptance Criteria:**
- Given a supported Windows machine, when the signed desktop installer is run, then the application installs and launches successfully.
- Given a supported macOS machine, when the signed desktop installer is run, then the application installs and launches successfully.
- Given an unsupported OS version, when installation is attempted, then the user is blocked with a clear compatibility message.

### FR-002: Shared Authentication and Workspace Context
**As a** studio operator  
**I want** the desktop app to use the same identity and workspace model as the web app  
**So that** permissions and entitlements remain consistent across surfaces

**Acceptance Criteria:**
- Given a valid RawDrive account, when the user signs in through the desktop client, then the session is established using the same backend identity model as the web app.
- Given a multi-workspace user, when the user opens the desktop client, then the client prompts for or restores the correct active workspace context.
- Given revoked access, when the desktop client refreshes authorization state, then restricted actions are blocked without requiring a separate desktop-only role model.

### FR-003: Source-Side Live Encoding Requirement
**As a** broadcaster  
**I want** live encoding to happen on the source machine  
**So that** compute-heavy first-mile video processing uses local hardware and local capture conditions

**Acceptance Criteria:**
- Given a live event, when the broadcaster prepares to go live, then the desktop client requires a supported source-side encoder workflow instead of relying on browser-side live encoding.
- Given a live event configured for Cloudflare Stream, when the desktop client validates the session, then it checks that the outgoing stream is configured for a supported ingest profile.
- Given the source machine lacks a usable encoder path, when the broadcaster attempts to start streaming, then the client blocks go-live and provides a clear remediation path.

### FR-004: Encoder Integration and Preflight
**As a** broadcaster  
**I want** encoder presets and preflight validation  
**So that** I can avoid bad codec, bitrate, keyframe, or credential mistakes before going live

**Acceptance Criteria:**
- Given a scheduled event, when the user opens live setup in the desktop client, then the client displays ingest URL, stream key handling, recommended bitrate, resolution, audio, and protocol guidance.
- Given a local encoder configuration, when preflight runs, then the client validates credentials, selected protocol, and basic stream profile compatibility.
- Given a failed preflight, when validation completes, then the client surfaces actionable fixes and prevents a false “ready” state.

### FR-005: Supported Encoder Stack at Launch
**As a** broadcaster  
**I want** a clearly defined supported encoder stack  
**So that** my studio knows which local tools are officially supported on day one

**Acceptance Criteria:**
- Given a Windows or macOS broadcaster at launch, when they choose a first-class supported workflow, then OBS Studio is treated as the primary supported encoder path.
- Given a Windows broadcaster, when they use vMix or another approved RTMPS/SRT encoder, then the product may support it as a validated secondary workflow according to the published support matrix.
- Given an unsupported encoder workflow, when the user attempts guided setup, then the desktop client labels it unsupported or best-effort instead of implying full support.

### FR-006: Attach or Launch Supported Local Encoder Workflows
**As a** broadcaster  
**I want** RawDrive to work with supported local encoder workflows  
**So that** I can use familiar tools without forcing RawDrive to become a full production switcher

**Acceptance Criteria:**
- Given a supported encoder workflow is installed or available, when the user starts a broadcast from the desktop client, then the client can launch, hand off to, or attach to that workflow according to product policy.
- Given the workflow is already active, when the user returns to the desktop client, then the client reflects current event status and connection health.
- Given the encoder disconnects or fails, when the desktop client receives the local or remote error signal, then the operator is notified immediately.

### FR-007: Folder Watch and Resumable Uploads
**As a** studio operator  
**I want** local folder watch and resumable sync  
**So that** large uploads and batch ingestion remain reliable over long sessions

**Acceptance Criteria:**
- Given a chosen local folder, when the user creates a sync mapping, then the desktop client watches for eligible file changes without requiring constant manual re-selection.
- Given network interruption during upload, when connectivity returns or the app is reopened, then uploads resume from the last safe checkpoint.
- Given a long-running sync, when the operator opens the activity surface, then the client shows progress, file counts, transfer speed, and failure counts.

### FR-008: Source-Side Processing for Upload Workflows
**As a** studio operator  
**I want** heavy pre-upload work to happen locally where useful  
**So that** the source machine handles checksums, validation, and optional preprocessing before cloud delivery

**Acceptance Criteria:**
- Given an upload workflow, when files are prepared locally, then the desktop client computes checksums and basic metadata before or during transfer.
- Given source-side preprocessing is enabled by policy, when the client prepares media, then any generated lightweight artifacts are created locally before upload.
- Given a file fails local validation, when preprocessing runs, then the file is quarantined or flagged before it enters the remote pipeline.

### FR-009: No RawDrive Server-Side Media Processing
**As a** platform owner  
**I want** media-heavy processing kept off RawDrive application servers  
**So that** infrastructure cost and operational complexity stay on client machines and managed media vendors instead of our server fleet

**Acceptance Criteria:**
- Given a live event, when media leaves the broadcaster machine, then RawDrive application servers do not perform live video encoding or live media relay as part of the normal path.
- Given an uploaded video, when ingestion occurs, then RawDrive application servers may validate metadata and orchestrate transfer but do not perform canonical playback transcoding.
- Given a future feature proposal requires server-side media processing, when it is added to planning, then it must be treated as an explicit architecture expansion rather than an implicit behavior of the current platform.

### FR-010: Desktop Notifications and Session Resilience
**As a** studio operator  
**I want** desktop-native notifications and resilient background behavior  
**So that** I can keep working while uploads or live preparation continue

**Acceptance Criteria:**
- Given a sync completes, fails, or stalls, when the event occurs, then the desktop client can notify the operator through OS-supported notifications.
- Given the client is minimized or in the background, when a long-running transfer or live prep continues, then state remains intact without requiring the foreground tab model of a browser.
- Given the application restarts after a crash, when it relaunches, then incomplete sessions are restored or clearly recoverable.

### FR-011: Diagnostics and Support Bundle Export
**As a** support operator  
**I want** exportable logs and diagnostics from the desktop client  
**So that** local failures can be investigated without guessing

**Acceptance Criteria:**
- Given a failed live prep or upload session, when the user requests diagnostics, then the client exports a support bundle containing logs, app version, OS details, and recent session metadata.
- Given a privacy-sensitive environment, when diagnostics are exported, then secrets such as raw stream keys and access tokens are masked or omitted.
- Given a support incident, when the operator opens the diagnostics view, then recent errors are visible without needing developer tools.

### FR-012: Graceful Fallback to Browser Workflows
**As a** studio operator  
**I want** the product to degrade gracefully when the desktop app is unavailable  
**So that** routine workflows can continue from the browser when local heavy tooling is not required

**Acceptance Criteria:**
- Given the desktop client is not installed, when a user accesses routine non-heavy workflows in the browser, then those workflows remain usable.
- Given a workflow specifically benefits from local processing, when the user opens it in the browser, then the app can recommend the desktop companion without blocking unrelated tasks.
- Given a public viewer opens a share link, when the page loads, then no desktop client is required.

---

## 6. Non-Functional Requirements

### NFR-001: Platform Parity
- Core desktop workflows must behave consistently across supported Windows and macOS releases.

### NFR-002: Reliability
- The desktop client must survive network loss, process restart, and machine sleep or wake events without silently corrupting upload or live session state.

### NFR-003: Security
- Desktop authentication tokens must use OS-appropriate secure storage where available.
- Sensitive ingest credentials must be masked by default in the desktop UI.

### NFR-004: Performance
- The desktop client must remain responsive while large uploads, folder scans, or live preflight operations are running.
- Local heavy processing must prefer source-machine resources over browser-tab constraints.

### NFR-005: Server Cost Boundary
- The default architecture must avoid ongoing RawDrive server-side media encode/transcode workloads for live and uploaded video.

### NFR-006: Observability
- Every desktop session must emit enough telemetry, logs, and error context to reconcile local failures with backend activity.

### NFR-007: Accessibility
- Keyboard navigation, readable status states, and accessible error messaging must be supported for core desktop operator tasks.

---

## 7. Architecture Direction
- For **live streaming**, first-mile encoding belongs on the broadcaster's machine using supported local encoder workflows; RawDrive coordinates, validates, and monitors that path.
- For **video uploads**, local preparation may happen on the desktop client, but playback renditions and adaptive delivery remain Cloudflare Stream responsibilities.
- The desktop companion must integrate with the same backend APIs, auth model, and workspace data used by the browser app.
- Initial first-class encoder support should target **OBS Studio** on Windows and macOS; additional workflows such as **vMix** on Windows or other approved RTMPS/SRT-compatible encoders may be added through an explicit support matrix.
- RawDrive application servers remain control-plane and metadata systems; they must not become a default media-processing farm.

---

## 8. Cross-Document Alignment
- Live ingest, prepaid event logic, and replay handoff must align with [LiveStreaming.md](LiveStreaming.md).
- Uploaded-video delivery and cloud playback constraints must align with [Video_Transcoding_Delivery.md](Video_Transcoding_Delivery.md).
- Headless automation and bulk-ingest command-line workflows must align with [CLI_Tooling_Automation.md](../CLI_Tooling_Automation.md).
- Shared-gallery and client-viewer PWA flows must align with [Client_Galleries_PWA.md](../Client_Galleries_PWA.md).
- Client-side upload abuse prevention and deep local scan responsibilities must align with [../Gallery/UPLOAD_CLIENT_SIDE_ABUSE_SCREENING_ARCHITECTURE.md](../Gallery/UPLOAD_CLIENT_SIDE_ABUSE_SCREENING_ARCHITECTURE.md).
