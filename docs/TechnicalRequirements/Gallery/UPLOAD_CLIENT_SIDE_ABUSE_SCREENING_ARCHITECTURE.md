# Technical Requirements: Client-Side Upload Abuse Screening Architecture

**Document Status:** Proposed Architecture v1.0 (2026-04-10)  
**Ownership:** Frontend Platform / Media Infrastructure / Security Engineering  
**Primary Goal:** Stop suspicious image uploads on the client machine before RawDrive begins network transfer or persists originals

---

## 1. Problem Statement

RawDrive currently accepts uploads from the browser uploader and backend finalize paths, then persists the original bytes and creates derivatives.

Verified current entry points:
- Browser upload UI at [frontend/src/app/(dashboard)/upload/page.tsx](../../../frontend/src/app/(dashboard)/upload/page.tsx)
- Browser upload orchestration at [frontend/src/hooks/use-upload.ts](../../../frontend/src/hooks/use-upload.ts)
- Browser file acceptance at [frontend/src/components/upload/upload-dropzone.tsx](../../../frontend/src/components/upload/upload-dropzone.tsx)
- TUS-style chunked upload backend at [backend/internal/handler/chunked_upload.go](../../../backend/internal/handler/chunked_upload.go)
- Direct multipart upload backend at [backend/internal/handler/asset_handler.go](../../../backend/internal/handler/asset_handler.go)
- Original persistence at [backend/internal/service/upload_service.go](../../../backend/internal/service/upload_service.go)
- Derivative generation at [backend/internal/service/thumbnail_service.go](../../../backend/internal/service/thumbnail_service.go)

Today, the uploader validates file type and size, but it does not run a dedicated abuse screen for:
- appended payloads after valid image end markers
- oversized metadata/comment chunks
- polyglot files with embedded ZIP/PDF/EXE signatures
- malformed containers intended to hide non-image payloads
- higher-risk original-preservation uploads where the exact source bytes are retained

The product requirement is:
- detection should happen primarily on the client machine
- suspicious files should be blocked before upload starts
- backend load should remain minimal

This document defines the complete architecture for that model.

---

## 2. Goals

### 2.1 Primary Goals
- Prevent suspicious image files from entering the RawDrive ingest pipeline from the standard uploader.
- Run the heavy screening work locally in the browser or desktop companion.
- Preserve existing chunked upload and resume behavior for legitimate files.
- Keep backend enforcement cheap enough that it does not become a central scanning bottleneck.
- Support a stronger local path for TIFF, HEIC, and camera RAW formats where browser-only inspection is insufficient.

### 2.2 Non-Goals
- This is not a promise of perfect steganography detection.
- This is not a full anti-malware platform.
- This does not attempt to decode every proprietary RAW dialect inside the browser.
- This does not remove the need for a minimal server-side final gate.

---

## 3. Design Principles

1. **Client-first enforcement:** expensive parsing and heuristics happen on the source machine before TUS session creation.
2. **Fail closed for suspicious files:** when the scanner finds a strong signal, upload must not start.
3. **Risk-tiered scanning:** browser-only checks for common web formats, deeper local checks for professional formats.
4. **Minimal backend assertion:** the server verifies that client screening happened and rejects obviously bypassed flows, but does not re-run the full scan.
5. **Original-preservation awareness:** stricter policy applies when RawDrive stores the exact original bytes.
6. **Explainable decisions:** every block reason returned to the user must be concrete and understandable.

---

## 4. Threat Model

### 4.1 In Scope
- Image files with appended archives or binaries.
- JPEG/PNG/WebP/GIF/TIFF/HEIC files carrying hidden payloads in metadata/comment/text sections.
- Polyglot files that are valid images and valid archives/documents at the same time.
- Abuse of RawDrive as a covert file-transfer channel by uploading "images" that intentionally contain hidden non-image content.

### 4.2 Partially In Scope
- Statistical pixel-domain steganography hidden entirely inside image signal data.

This class is expensive and probabilistic. The architecture supports optional local heuristics for it, but structural/container screening is the baseline blocker.

### 4.3 Out of Scope
- Endpoint malware detection beyond upload files.
- Full forensic extraction of hidden payloads.
- Nation-state-grade steganalysis.

---

## 5. Current RawDrive Constraints

### 5.1 Browser Uploader Reality
- The current browser uploader chunks files directly from the `File` object in [frontend/src/hooks/use-upload.ts](../../../frontend/src/hooks/use-upload.ts).
- It creates an upload session first, then PATCHes chunks to `/api/v1/uploads`.
- The current dropzone in [frontend/src/components/upload/upload-dropzone.tsx](../../../frontend/src/components/upload/upload-dropzone.tsx) already limits accepted file families and is the right place to surface local rejection reasons.

### 5.2 Backend Reality
- [backend/internal/handler/chunked_upload.go](../../../backend/internal/handler/chunked_upload.go) finalizes uploads from a local temp file and then writes the original to storage.
- [backend/internal/service/upload_service.go](../../../backend/internal/service/upload_service.go) stores direct multipart uploads without local abuse screening.
- [backend/internal/service/thumbnail_service.go](../../../backend/internal/service/thumbnail_service.go) creates display derivatives after upload, but RawDrive still retains the original exact bytes.

### 5.3 Desktop Direction Already Exists
- RawDrive already has a desktop product surface at [frontend/src/app/(dashboard)/desktop/page.tsx](../../../frontend/src/app/(dashboard)/desktop/page.tsx).
- Source-side heavy processing is already a product principle in [docs/TechnicalRequirements/StreamingDesktop/Studio_Desktop_Companion.md](../StreamingDesktop/Studio_Desktop_Companion.md).

This architecture builds on those realities instead of replacing them.

---

## 6. Solution Overview

RawDrive should implement **three local screening tiers** plus a **minimal server final assertion**.

### 6.1 Tier A: Browser Preflight Worker
For JPEG, PNG, WebP, and GIF, the browser uploader performs a full local structural scan before session creation.

### 6.2 Tier B: Browser + Local Desktop Agent
For TIFF, HEIC, and higher-risk originals, the browser may delegate deep inspection to a locally running RawDrive Desktop agent on the same machine through a loopback interface.

### 6.3 Tier C: Native Desktop/CLI Deep Scan
For high-volume professional ingestion, RAW formats, watched folders, and `strict_original_preservation` workspaces, the RawDrive Desktop companion or CLI performs deep local scans before upload begins.

### 6.4 Tier D: Minimal Backend Final Assertion
The backend only verifies:
- a scan manifest exists
- the manifest matches the file hash and policy version
- the upload mode is allowed for that format
- the client did not bypass mandatory local screening

The backend does **not** perform the full heavy scan in the normal path.

---

## 7. Detailed Architecture

## 7.1 Browser Preflight Worker

### 7.1.1 Execution Model
- Add a dedicated Web Worker, for example `frontend/src/workers/upload-screening.worker.ts`.
- The upload page or hook sends selected `File` objects to the worker before calling `/api/v1/uploads`.
- The worker uses `File.slice()` and `arrayBuffer()` to inspect headers, trailers, and metadata regions without loading the whole batch into the main UI thread.

### 7.1.2 Browser Responsibilities
- Magic-byte validation.
- Extension/MIME/signature consistency checks.
- Format-specific structural parsing.
- End-of-file enforcement.
- Trailer signature detection.
- Metadata budget enforcement.
- Decode sanity checks using `createImageBitmap()` or `ImageDecoder` when available.
- Local hash generation for manifest binding.

### 7.1.3 Result Contract
Each file returns:
- `decision`: `pass`, `block`, `needs_desktop_scan`
- `format`
- `sha256`
- `policy_version`
- `risk_score`
- `findings[]`
- `engine`: `browser-worker`

If `decision !== pass`, `use-upload.ts` must never create a TUS session.

---

## 7.2 Detection Techniques by Format

### 7.2.1 JPEG
The browser worker must:
- validate SOI marker (`FFD8`)
- parse marker stream until EOI (`FFD9`)
- reject non-padding bytes after EOI
- compute total size of `APPn` and `COM` segments
- reject oversized metadata budget by policy
- search trailer and comment bytes for embedded signatures such as `PK\x03\x04`, `%PDF-`, `MZ`, `7z`, `Rar!`
- reject malformed segment lengths or out-of-bounds jumps

### 7.2.2 PNG
The browser worker must:
- validate the PNG signature
- parse chunk stream with length and CRC validation
- reject bytes after `IEND`
- enforce chunk order sanity
- budget-limit `tEXt`, `iTXt`, `zTXt`, and unknown ancillary chunks
- inspect text and trailing bytes for embedded archive/binary signatures

### 7.2.3 WebP
The browser worker must:
- validate RIFF and WEBP headers
- ensure declared RIFF length matches the actual file end
- reject trailing payload after declared end
- budget-limit `EXIF`, `XMP`, and unknown chunks
- inspect chunk payloads for suspicious embedded signatures

### 7.2.4 GIF
The browser worker must:
- validate header and trailer
- reject bytes beyond the logical GIF terminator
- inspect comment/application extension sizes

### 7.2.5 TIFF / DNG
The browser worker should do a bounded container parse:
- validate byte order and first IFD offset
- ensure offset graph remains within file bounds
- enforce metadata and blob size budgets
- reject obvious appended payload

If the parse is incomplete or ambiguous, return `needs_desktop_scan` rather than guessing.

### 7.2.6 HEIC / HEIF
The browser worker should:
- validate ISO BMFF box structure
- enforce known top-level box sanity
- reject trailing payload beyond declared container size

If deep validation is required, escalate to desktop.

### 7.2.7 Camera RAW Formats
For `.cr2`, `.nef`, `.arw`, `.raf`, `.orf`, and similar proprietary formats:
- browser uploader performs only lightweight signature and size sanity checks
- browser result should be `needs_desktop_scan` in strict policy modes
- RawDrive Desktop or CLI performs the authoritative local deep scan before upload

This is necessary because browser-only parsing is not robust enough for all proprietary RAW containers.

---

## 7.3 Optional Statistical Stego Heuristics

This is an optional second-pass local check, not the baseline gate.

Possible heuristics:
- LSB plane variance anomaly
- channel entropy anomalies
- suspicious compression ratio versus decoded dimensions
- unusually noisy least-significant-bit distribution

Rules:
- browser may run only a lightweight heuristic on small to medium JPEG/PNG files
- desktop may run a deeper heuristic on stronger hardware
- statistical suspicion alone should usually produce `needs_review` or `needs_desktop_scan`, not a hard block, unless combined with strong structural findings

---

## 7.4 Client-Side Safe Normalization Mode

RawDrive should support an optional per-workspace or per-gallery upload mode called `safe_normalized_upload`.

### 7.4.1 Behavior
- decode the image locally
- re-encode a sanitized copy locally
- upload sanitized derivative as the primary viewer version
- optionally keep original only when policy allows and local deep scan passed

### 7.4.2 Use Cases
- public client galleries
- proofing galleries
- lower-risk photographer workflows where byte-perfect originals are not required in web delivery

### 7.4.3 Restriction
This mode must not silently replace originals in workflows that promise archival fidelity.

---

## 7.5 RawDrive Desktop Loopback Agent

### 7.5.1 Purpose
Provide a stronger local scan path without moving the work to RawDrive servers.

### 7.5.2 Interface
The desktop companion should expose a localhost-only service, for example:
- `https://127.0.0.1:<port>/scan`
- authenticated with a device-bound handshake initiated from the signed-in browser session

### 7.5.3 Responsibilities
- deep scan TIFF, HEIC, and RAW containers
- run optional statistical heuristics
- maintain consistent policy version with the backend
- sign scan results using a device key stored in OS-secure storage

### 7.5.4 Browser Integration
The browser uploader should:
1. attempt browser worker scan
2. if result is `needs_desktop_scan`, probe the local agent
3. if agent available, offload the scan and continue only on signed `pass`
4. if agent unavailable, block and explain that this file type requires RawDrive Desktop for strict local screening

This preserves the "client machine only" requirement while remaining realistic about browser limits.

---

## 7.6 Upload Scan Manifest

Every successful local screen produces a manifest attached to session creation.

### 7.6.1 Proposed Manifest Shape
```json
{
  "policy_version": "upload-screening/2026-04-10",
  "engine": "browser-worker",
  "engine_version": "1.0.0",
  "file_name": "Wedding (42).jpg",
  "declared_type": "image/jpeg",
  "detected_format": "jpeg",
  "sha256": "abc123...",
  "size_bytes": 7340021,
  "decision": "pass",
  "risk_score": 0.04,
  "findings": [],
  "dimensions": { "width": 6000, "height": 4000 }
}
```

### 7.6.2 Signed Manifest Variant
When produced by RawDrive Desktop:
```json
{
  "...": "...",
  "engine": "desktop-agent",
  "device_id": "dev_123",
  "signature": "base64..."
}
```

---

## 7.7 Backend Final Assertion

The backend must remain cheap, but it cannot trust the browser blindly.

### 7.7.1 Required Server Checks
- reject session creation when required manifest fields are missing
- verify file hash matches manifest at finalize time
- verify policy version is not stale
- verify strict-mode formats came from an allowed local engine
- run a very cheap structural spot-check on the first and last bounded bytes
- reject uploads when manifest says `block` or when manifest is absent in mandatory modes

### 7.7.2 What the Server Must Not Do by Default
- full image parsing on every file
- deep statistical steganalysis
- full re-scan of every uploaded original

### 7.7.3 Why This Is Necessary
Client-side-only enforcement is not a true security boundary because a custom script can bypass browser code and call the API directly.

Therefore:
- **heavy logic stays local**
- **minimal trust verification stays server-side**

This preserves security without creating a central bottleneck.

---

## 8. Policy Modes

RawDrive should support policy modes per workspace, and later per gallery.

### 8.1 `standard`
- Browser worker required for JPEG/PNG/WebP/GIF.
- Desktop agent optional.
- RAW and ambiguous formats may still upload with lightweight checks.

### 8.2 `strict_client_scan`
- Browser worker mandatory.
- TIFF/HEIC/RAW require desktop deep scan.
- Unsigned browser-only manifests not accepted for high-risk formats.

### 8.3 `strict_original_preservation`
- All original-retention uploads require a signed manifest from RawDrive Desktop or CLI.
- Browser uploader may still be used for low-risk web formats, but only if policy allows.

Recommended launch default:
- `standard` for general workspaces
- `strict_client_scan` for professional gallery/original-storage workspaces

---

## 9. Product and UX Changes

## 9.1 Upload Status Model

Extend the upload item state in [frontend/src/components/upload/upload-progress.tsx](../../../frontend/src/components/upload/upload-progress.tsx):
- `screening`
- `blocked`
- `needs_desktop`
- `uploading`
- `complete`
- `error`

## 9.2 User Messages

Rejections must be explicit, for example:
- "Blocked on this device: data found after JPEG end marker."
- "Blocked on this device: embedded ZIP signature found in metadata."
- "This RAW file requires RawDrive Desktop for local deep scan before upload."

## 9.3 Queue Behavior
- screening runs before the item enters the upload queue
- blocked items remain visible with reason and no retry unless the file changes
- `needs_desktop` items include CTA to RawDrive Desktop at [frontend/src/app/(dashboard)/desktop/page.tsx](../../../frontend/src/app/(dashboard)/desktop/page.tsx)

---

## 10. Proposed Implementation Map

### 10.1 Frontend
- `frontend/src/lib/upload-screening/policy.ts`
- `frontend/src/lib/upload-screening/browser-scanner.ts`
- `frontend/src/lib/upload-screening/formats/jpeg.ts`
- `frontend/src/lib/upload-screening/formats/png.ts`
- `frontend/src/lib/upload-screening/formats/webp.ts`
- `frontend/src/lib/upload-screening/formats/tiff.ts`
- `frontend/src/workers/upload-screening.worker.ts`
- update [frontend/src/hooks/use-upload.ts](../../../frontend/src/hooks/use-upload.ts)
- update [frontend/src/components/upload/upload-dropzone.tsx](../../../frontend/src/components/upload/upload-dropzone.tsx)
- update [frontend/src/components/upload/upload-progress.tsx](../../../frontend/src/components/upload/upload-progress.tsx)
- update [frontend/src/components/upload/upload-queue.tsx](../../../frontend/src/components/upload/upload-queue.tsx)

### 10.2 Backend
- new manifest validation service in `backend/internal/service/upload_manifest_validation.go`
- cheap final assertion in [backend/internal/handler/chunked_upload.go](../../../backend/internal/handler/chunked_upload.go)
- cheap final assertion in [backend/internal/handler/asset_handler.go](../../../backend/internal/handler/asset_handler.go)
- policy config in backend config surface for mandatory modes

### 10.3 Desktop
- extend desktop companion architecture in [docs/TechnicalRequirements/StreamingDesktop/Studio_Desktop_Companion.md](../StreamingDesktop/Studio_Desktop_Companion.md)
- local loopback scan agent
- signed manifest generation
- watcher/CLI integration for bulk ingest

---

## 11. Data Model and API Additions

## 11.1 Session Creation Request
Add optional but policy-controlled fields to `POST /api/v1/uploads`:
- `scan_manifest`
- `scan_manifest_signature`
- `scan_engine`
- `scan_policy_version`

## 11.2 Direct Multipart Upload
Add either:
- multipart field `scan_manifest`, or
- companion JSON endpoint before final upload

## 11.3 Asset Metadata
Recommended asset-level fields:
- `upload_scan_status`
- `upload_scan_engine`
- `upload_scan_policy_version`
- `upload_scan_risk_score`
- `upload_scan_findings JSONB`
- `upload_scan_manifest_hash`

These fields allow moderation, audit, and forensic review without storing the whole local file.

---

## 12. Performance Strategy

### 12.1 Browser
- scan only bounded regions unless a full parse is required
- run inside a worker
- parallelize with a small concurrency cap, for example 2 to 4 files
- hash incrementally where possible

### 12.2 Desktop
- use streaming parsers for large files
- support folder-watch batch scanning
- avoid copying files unnecessarily before pass/fail decision

### 12.3 Backend
- no full deep scan on hot path
- bounded header/trailer assertion only
- optional random audit sampling off hot path

---

## 13. Security Posture

### 13.1 What This Architecture Prevents Well
- common hidden archive/file append tricks
- many metadata stuffing tricks
- obvious malformed or polyglot image containers
- casual abuse of RawDrive as a covert image-based transfer mechanism

### 13.2 What Still Requires Care
- a malicious user can bypass a browser-only scanner
- unsigned browser manifests are advisory, not strongly trustworthy
- deeper RAW and HEIC validation needs the desktop agent in strict modes

### 13.3 Final Security Position
Client-side screening is the **primary compute path**.  
Backend assertion is the **minimal integrity backstop**.

---

## 14. Rollout Plan

### Phase 1: Browser Structural Scanner
- JPEG/PNG/WebP/GIF worker
- queue state updates
- manifest generation
- cheap backend manifest requirement in non-strict mode as telemetry-only

### Phase 2: Enforced Browser Gate
- block upload session creation for structural failures
- backend rejects missing manifests for supported browser formats

### Phase 3: Desktop Deep Scan
- local desktop agent
- signed manifests
- strict-mode support for TIFF/HEIC/RAW

### Phase 4: Workspace Policies
- admin/workspace setting for `standard`, `strict_client_scan`, `strict_original_preservation`

### Phase 5: Moderation and Analytics
- reporting on blocked uploads
- false-positive review workflow
- policy tuning by file type and workspace profile

---

## 15. Testing Strategy

### 15.1 Unit Tests
- format parsers for JPEG/PNG/WebP/GIF/TIFF
- trailer detection
- metadata budget logic
- policy mode decisions

### 15.2 Frontend Integration Tests
- uploader blocks suspicious sample before any `/api/v1/uploads` call
- `needs_desktop` state shown for unsupported deep-scan formats
- filenames with spaces and parentheses are preserved

### 15.3 RawDrive-Specific Test Assets
Use the real image files in `tests/photos/` for normal-pass cases, including:
- `Wedding (42).jpg`
- `Wedding (259).jpg`
- `WhatsApp Image *.jpeg`

Suspicious cases should be created as controlled fixtures derived from valid files by:
- appending ZIP/PDF bytes after logical EOF
- inflating JPEG comment blocks
- appending RIFF tail bytes after valid WebP length

### 15.4 E2E
- browser uploader blocks before network
- desktop-required path surfaces install/use guidance
- backend rejects upload when manifest missing in enforced mode

---

## 16. Acceptance Criteria

1. Given a normal JPEG/PNG/WebP file, when the user selects it in the browser uploader, then local screening completes before session creation and the upload proceeds normally.
2. Given a JPEG/PNG/WebP/GIF file with appended payload after logical file end, when the user selects it, then the client blocks upload and shows a concrete reason.
3. Given a file with oversized suspicious metadata blocks, when the user selects it, then the client blocks upload before TUS session creation.
4. Given a TIFF/HEIC/RAW file in `strict_client_scan` mode, when browser-only validation is insufficient, then the file is marked `needs_desktop` and upload does not start from the browser alone.
5. Given RawDrive Desktop is installed and available locally, when a `needs_desktop` file is selected, then the browser can delegate the scan locally and continue only on signed pass.
6. Given a user bypasses the browser and calls the upload API directly, when a mandatory local manifest is missing or invalid, then the backend rejects finalize without running a full central deep scan.
7. Given a workspace uses `strict_original_preservation`, when original-retention uploads are attempted, then only locally screened and policy-compliant files are accepted.

---

## 17. Final Recommendation

RawDrive should adopt the following product position:

- **Browser uploader:** mandatory local structural scan for common image formats
- **Desktop companion:** authoritative deep local scan for TIFF, HEIC, RAW, batch ingest, and strict original-preservation workflows
- **Backend:** cheap final assertion only, not a heavy central scanning service

This is the architecture that best satisfies all three constraints:
- block suspicious files before upload
- keep compute on the client machine
- stay aligned with RawDrive's current browser uploader, Go backend, and desktop companion direction

