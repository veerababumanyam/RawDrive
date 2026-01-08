# Galleries (Studio + Client Portal)

> Terminology: See [`GLOSSARY.md`](GLOSSARY.md) (canonical terms for Workspace, Asset, Share Link, Trial, etc.).

## Overview

Galleries are the core delivery surface in RawDrive: staff create and curate galleries inside a **workspace**, then share them with clients via a **Client Portal** using **Share Links** and explicit access policies.

This document describes product behavior and configuration. It intentionally avoids referencing specific frontend component filenames (implementation is expected to evolve).

## Goals

- Fast, mobile-first gallery browsing for photos and videos.
- Proofing workflows: favorites, selections (“picks”), and comments.
- Controlled sharing with least privilege: passwords, expiry, per-link permissions, and per-asset locks.
- Tenant safety: every operation is scoped to a single `workspace_id`.
- Internationalization: support Indian languages and Urdu RTL in the portal.

## Non-goals

- Album designer features (see `DigitalAlbumFeatures.md`).
- Enterprise governance features beyond what’s needed for secure sharing (see governance specs).

## Core concepts

### Tenancy and scoping

- **Galleries are always workspace-scoped**.
- The Client Portal resolves access via **Share Link tokens** or authenticated workspace membership.
- Portal endpoints must never allow cross-workspace access, even if a caller guesses IDs.

### Gallery lifecycle

- `draft`: staff can edit; portal access is blocked.
- `published`: portal access allowed per Share Link policy.
- `archived`: read-only for staff; portal typically blocked (policy-driven).

### Sub-galleries

Sub-galleries are first-class entities used to organize content (e.g., “Ceremony”, “Reception”).

- Can be displayed as **tabs** or in a **continuous** scroll layout.
- Have ordering, cover image, and visibility.

### Share Links (capability-based access)

Share Links are the primary distribution mechanism.

- A Share Link grants access to a **gallery**, **sub-gallery**, or **single asset**.
- Each link carries an explicit **policy** (expiry, password, allowed actions, etc.).
- Links must be revocable and auditable.

## Gallery settings (staff-controlled)

Settings are per-gallery and can override workspace defaults.

### Presentation

- Title, description
- Theme: `light` / `dark` / `system`
- Layout style: `tabs` / `continuous`
- Portal language: per-gallery default (overridden by per-link language)
- Branding profile selection (logo, colors, typography)

### Access controls

- Publish/unpublish (controls portal availability)
- Password/PIN gate (hash stored)
- Email registration required (lead capture + attribution)
- Expiry timestamp (hard stop for portal)
- Optional custom domain mapping (tier-gated)

### Download + watermark policy

Downloads are governed by a **download policy** (also enforced per-link).

Recommended enumeration (aligned with `galleries_client_portal` spec):
- `view_only`
- `web_only` (web-optimized derivatives only)
- `watermarked_only`
- `original_allowed`

Watermark configuration (when enabled):
- watermark image (or brand logo)
- opacity and positioning (center/corners/tile)

### Metadata visibility

- EXIF visibility toggle (default: off for public viewers unless enabled)

### AI policy (privacy-sensitive galleries)

Per gallery, admins may disable AI-derived metadata (captions/tags/faces) when appropriate.

## Staff (admin) capabilities

### Organization + curation

- Create galleries and sub-galleries
- Upload assets and organize into sub-galleries
- Reorder assets and sub-galleries
- Bulk operations: move, tag, visibility, delete (subject to role permissions)

### Proofing workflow management

- View client favorites, selections, comments
- Export selections (CSV/JSON/ZIP workflows are tier-gated)
- Optional submission/approval flow (see proofing spec)

### Audit and activity log

Record events such as:
- publish/unpublish
- setting changes
- share link creation/revocation
- downloads and policy denials

## Client Portal experience

### Entry and access

Clients can access the portal via:
- Share Link token (most common)
- Authenticated membership (internal viewers)

Portal must support:
- password gate (if required)
- email registration (if required)
- clear “expired/unavailable” UX with next actions

### Browsing and interaction

- Grid/masonry presentation (implementation detail), with fast paging and CDN thumbnails
- Lightbox viewer with zoom and slideshow
- Favorites (heart)
- Selections/Picks (check)
- Comments (if enabled)

### Private / locked assets

Per-asset locks support sensitive photos without splitting galleries.

- Locked assets must not reveal content until unlocked.
- Access codes are **hashed** and protected against brute force.
- Unlock attempts are rate-limited.

### Downloads

Download behavior depends on both:
- gallery download policy, and
- share link policy (per-link overrides / further restrictions)

Support:
- single download
- bulk download (ZIP generation; async job if large)
- watermarked download vs originals (based on policy)

## Sharing

### Share link management

Workspace staff can:
- list active links for a gallery
- create scoped links (gallery/sub-gallery/asset)
- set per-link policies:
  - expiry
  - password gate
  - email registration required
  - allowed actions: view / favorite / select / comment / download
  - optional download variant restriction (web-only vs original)
- revoke links at any time

### QR codes

QR codes are derived from share links (no separate access mechanism) and must reflect link revocation/expiry.

## Security, abuse prevention, and privacy

- Signed/CDN URLs for asset delivery; never expose public bucket access.
- Public portal endpoints use stricter rate limits and abuse detection.
- Password/access-code brute-force protection.
- Policy decisions are logged with the deciding factors (share link id, gallery id, reason).
- Client interaction data minimization:
  - allow anonymous viewing where policy permits
  - require email (or identity) for actions if the workspace wants attribution

## RBAC and tier gating (high level)

- Staff capabilities are governed by **workspace RBAC** (Owner/Admin/Editor/etc.).
- Feature availability is additionally governed by **subscription tier**, commonly:
  - custom domains
  - advanced analytics
  - API integrations
  - higher download limits / watermark options

See `RBAC_AND_USER_MANAGEMENT.md` for role scope and `PRD.md` for tier definitions.

## i18n and accessibility

- Support portal language fallback order (per-link → per-gallery → workspace default → browser).
- Urdu (`ur-IN`) is RTL.
- Keyboard navigation and screen reader support are required for the portal.

## Related documents

- `docs/TechnicalSpecs/galleries_client_portal.json` (canonical technical spec)
- `docs/Features/CLIENT_FACING_FEATURES.md` (portal UX details)
- `docs/Features/RBAC_AND_USER_MANAGEMENT.md` (roles and permissions)
- `docs/TechnicalSpecs/share_links_access.json`
- `docs/TechnicalSpecs/downloads_watermarking.json`
- `docs/TechnicalSpecs/proofing_selections_comments.json`
- `docs/TechnicalSpecs/i18n_localization.json`

## Last Updated

2025-12-17
