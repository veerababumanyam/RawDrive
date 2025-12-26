# Magic Link Feature - Technical Specification

## Overview

Magic Links provide secure, shareable URLs for photographers to distribute galleries to clients. Each link can target the entire gallery, a sub-gallery (section), or an individual photo. This specification covers the complete implementation including QR code generation and client-side face discovery ("Find My Photos").

---

## Table of Contents

1. [Business Requirements](#1-business-requirements)
2. [Architecture Design](#2-architecture-design)
3. [Database Schema](#3-database-schema)
4. [API Specification](#4-api-specification)
5. [QR Code Generation](#5-qr-code-generation)
6. [Face Discovery Feature](#6-face-discovery-feature)
7. [Security Model](#7-security-model)
8. [Implementation Plan](#8-implementation-plan)
9. [Quality Assurance](#9-quality-assurance)

---

## 1. Business Requirements

### 1.1 Magic Link Structure and Sharing Options

1. For each gallery, the system must allow the photographer to generate **Magic Links** at three levels of granularity:

   - **Root gallery link** – gives access to the entire gallery.
     - URL pattern: `/g/{token}`
   - **Sub-gallery (folder) link** – limits access to a specific section within the gallery (e.g., "Ceremony", "Reception").
     - URL pattern: `/g/{token}/s/{subGalleryId}`
   - **Individual media link** – opens a single photo or video in focus, while still allowing navigation if permitted.
     - URL pattern: `/g/{token}/p/{photoId}`

2. The photographer must be able to generate, copy, and share each of these link types directly from a **Share / Magic Link** area inside Gallery Settings (or a dedicated ShareModal for that gallery).

3. When sharing a sub-gallery or single media link, the client's initial view must be **scoped to that target**:
   - Sub-gallery links open with that section highlighted or active.
   - Photo links open directly in the viewer, with the rest of the gallery still available if permissions allow.

### 1.2 Global Sharing Control (Master Switch)

4. Each gallery must have a **master sharing toggle** (e.g., "Share gallery on / off").

5. When sharing is turned **off** for a gallery:
   - All Magic Links (root, sub-gallery, and media) should effectively behave as **private or offline**:
     - Clients following the links should see a clear "Private / Not available" state (e.g., 404 or private message).
   - Any quick-share buttons for that gallery should indicate that sharing is disabled.

6. When sharing is turned **on**, links must respect any additional privacy gates defined below (PIN, email, expiry, permissions).

### 1.3 Privacy Gates & Security Behavior

7. The photographer must be able to configure a **PIN / access code** (4–6 digits) for a gallery.

8. When a PIN is enabled:
   - Clients who click any Magic Link (root, section, or photo) must first see an **Access Code screen**.
   - Only after entering the correct PIN should the client view the gallery content.

9. The photographer must be able to set a **link expiry date** for each gallery:
   - After the configured date/time:
     - Magic Links must stop serving the gallery and instead show a clear "This gallery has expired" message.
     - Sharing controls should reflect the expired state without requiring the photographer to manually disable sharing.

10. Existing **email registration settings** must continue to work with Magic Links:
    - If email registration is enabled, clients should be prompted to enter an email **before** or alongside PIN unlock (as configured), so all subsequent actions (favorites, picks) are tied to an identifiable person.

### 1.4 Client Interaction & Proofing via Magic Links

11. When a client opens a valid Magic Link and passes any privacy gates, they must be able to interact with the gallery using the existing proofing tools:

    - **Favoriting (heart)**:
      - Clients can mark photos they like.
      - Where email registration is enabled, favorites must be associated with that visitor's email so the photographer can see which person liked which images.

    - **Picking / selection for proofing**:
      - Clients can mark photos as "picked" for inclusion in albums, prints, or retouching.
      - The gallery view should clearly distinguish between normal favorites and "picks" intended for production decisions.

    - **Smart selection mode**:
      - Clients can enter a dedicated mode that makes it easier to work with large galleries:
        - Bulk favorite / bulk pick actions.
        - Bulk downloads where downloads are allowed.

12. The photographer must be able to review, after the fact:
    - Which client (by email or known client record) favorited which images.
    - Which images have been picked and how many picks remain if there is a limit on selections.

### 1.5 Professional Delivery Channels for Magic Links

13. For each gallery, the system must provide multiple ways to deliver the Magic Link to clients:

    - A **downloadable, high-resolution QR code** for the gallery:
      - One QR per gallery that resolves to the appropriate Magic Link (usually the root).
      - Photographers can download and use this on printed cards, screens, or signage for quick access at events.

    - **One-click social sharing** options:
      - At minimum: WhatsApp, Facebook, and Email.
      - Especially for WhatsApp, the shared message should include:
        - A preview snippet (gallery title and short description if available).
        - The Magic Link URL.

    - **Custom domain masking**:
      - If the studio has configured a custom domain, the shared links should use that domain instead of the platform's generic domain, reinforcing the photographer's brand.

### 1.6 Permission-Based Experience on Shared Views

14. Magic Link views must respect the gallery's **download permissions**:

    - When downloads are enabled:
      - Clients can download photos individually or in bulk (if allowed).
    - When downloads are disabled:
      - Download buttons and menus must be removed in the shared view.
      - The watermark, if enabled, can appear more prominently to discourage screenshots.

15. Magic Link views must also respect **metadata visibility** settings:

    - When camera info is set to be visible:
      - Clients can access EXIF data (ISO, shutter speed, aperture, etc.) in the shared viewer.
    - When it is hidden:
      - No technical metadata should be shown in the client view.

### 1.7 Client View vs. Admin View

16. The application must clearly distinguish between:

    - **Admin/Dashboard mode** – for photographers managing galleries.
    - **Client view mode** – for clients accessing via Magic Links.

17. When a Magic Link is opened, the system must always render the **client view**, not the admin dashboard, regardless of whether the photographer is logged in or not, unless explicitly overridden.

18. Entering client view mode must:

    - Apply all gallery settings and access rules (PIN, email gate, expiry, permissions).
    - Hide administrative controls (edit, delete, re-order, etc.).

### 1.8 Branding Injection in Client View

19. The client view for a gallery must automatically apply the relevant **branding settings** configured at gallery or studio level:

    - Brand color(s) used for accents, buttons, and highlights.
    - Typography choices for headings and body text.
    - Logo and other visual identity elements where configured.

20. The goal is that **even when a client visits a generic domain**, the Magic Link still presents a fully branded, studio-specific experience that appears distinct from other photographers' galleries.

### 1.9 Overall Behavior and Consistency

21. All Magic Link behavior (routes, privacy gates, permissions, branding) must be **driven by the gallery's settings** so that:

    - Changing settings in Gallery Settings immediately affects any new or existing Magic Links for that gallery.
    - Photographers can rely on one place (Gallery Settings + ShareModal) to control every aspect of how a shared gallery behaves.

22. Magic Links should be durable and predictable:

    - If the photographer does not change settings or delete the gallery, a Magic Link should continue to work reliably until the **expiry date** is reached or the **master sharing toggle** is turned off.

### 1.10 QR Code Requirements (Enhanced)

23. **Dedicated QR Codes**: Every Magic Link must have a dedicated QR code:
    - Root gallery links get a primary QR code
    - Sub-gallery links get unique QR codes
    - Individual photo links get unique QR codes
    - Scanning any QR code opens the specific target

24. **QR Code Formats**: Downloadable in multiple formats:
    - PNG (raster, 1024x1024 default, configurable up to 4096x4096)
    - SVG (vector, scalable)
    - PDF (print-ready with crop marks)

25. **QR Code Customization**:
    - Embed studio logo in center
    - Use brand primary color
    - Error correction level H (30% recovery)
    - Optional caption/label below QR

### 1.11 Face Discovery Feature ("Find My Photos")

26. **Client-Side Face Detection**: Each public gallery must include a "Find My Photos" feature:
    - Accessible via FaceID icon in gallery header
    - Uses device camera to capture face (with permission)
    - All face processing happens client-side (privacy-first)
    - Raw face images never leave the user's device

27. **Face Matching**: After capturing face:
    - Generate 512-dimensional embedding client-side
    - Send only the embedding to server (not the image)
    - Server returns matching photos using pgvector similarity
    - Photos filtered/grouped by match confidence

28. **Privacy & Consent**:
    - Clear consent dialog before camera access
    - Option to manually browse instead
    - No face data stored unless user opts in
    - Face search logs retained only for abuse prevention

---

## 2. Architecture Design

### 2.1 System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Client Applications                            │
├─────────────────────────────────────────────────────────────────────────┤
│  Web App (React)                                                         │
│  ├── PublicGalleryPage.tsx  (Magic Link entry point)                    │
│  ├── ShareDialog.tsx        (QR generation, sharing options)            │
│  ├── FaceDiscovery.tsx      (TensorFlow.js face detection)              │
│  └── PinVerificationModal   (Privacy gate)                              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              API Gateway                                 │
├─────────────────────────────────────────────────────────────────────────┤
│  Rate Limiting: 10 validations/min/IP, 100 face searches/hour/gallery   │
│  CORS: Configured for custom domains                                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
┌──────────────────────┐ ┌──────────────────┐ ┌──────────────────────────┐
│   Backend (FastAPI)  │ │  AI Service      │ │   QR Service (Python)    │
├──────────────────────┤ ├──────────────────┤ ├──────────────────────────┤
│ MagicLinkService     │ │ Face Embedding   │ │ QRCodeService            │
│ ├── generate_token() │ │ Repository       │ │ ├── generate_qr()        │
│ ├── validate_token() │ │ ├── find_similar │ │ ├── generate_with_logo() │
│ ├── revoke_token()   │ │ └── cosine dist  │ │ ├── export_png()         │
│ └── get_link_stats() │ │                  │ │ ├── export_svg()         │
│                      │ │ pgvector         │ │ └── export_pdf()         │
│ PublicGalleryAPI     │ │ (512-dim)        │ │                          │
│ ├── /g/{token}       │ │                  │ │ Dependencies:            │
│ ├── /g/{token}/qr    │ │                  │ │ ├── qrcode               │
│ └── /face-search     │ │                  │ │ ├── pillow               │
└──────────────────────┘ └──────────────────┘ └── reportlab             ─┘
                    │               │
                    └───────┬───────┘
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           PostgreSQL + pgvector                          │
├─────────────────────────────────────────────────────────────────────────┤
│  magic_links           │ magic_link_accesses    │ face_search_logs      │
│  ├── token_hash        │ ├── access_id          │ ├── log_id            │
│  ├── gallery_id        │ ├── link_id            │ ├── gallery_id        │
│  ├── target_type       │ ├── visitor_id         │ ├── visitor_id        │
│  ├── target_id         │ ├── accessed_at        │ ├── matches_count     │
│  ├── expires_at        │ ├── ip_address         │ ├── embedding_hash    │
│  ├── qr_config         │ └── user_agent         │ └── searched_at       │
│  └── status            │                        │                        │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Token Architecture

**Token Format**: URL-safe base64 encoded, 32 bytes (256-bit entropy)

```python
# Token generation
import secrets
import hashlib
import base64

def generate_token() -> tuple[str, str]:
    """Generate token and its hash for storage."""
    raw_token = secrets.token_bytes(32)
    url_token = base64.urlsafe_b64encode(raw_token).decode('utf-8').rstrip('=')
    token_hash = hashlib.sha256(raw_token).hexdigest()
    return url_token, token_hash
```

**Storage**: Only SHA-256 hash stored in database (never plaintext token)

**URL Structure**:
```
https://rawdrive.ai/g/{token}                    # Root gallery
https://rawdrive.ai/g/{token}/s/{sub_gallery_id} # Sub-gallery
https://rawdrive.ai/g/{token}/p/{photo_id}       # Individual photo
https://photos.studio.com/g/{token}              # Custom domain
```

### 2.3 Component Interactions

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Browser    │────▶│  Validate    │────▶│  Load        │
│   /g/{token} │     │  Token       │     │  Gallery     │
└──────────────┘     └──────────────┘     └──────────────┘
                            │                     │
                            ▼                     ▼
                     ┌──────────────┐     ┌──────────────┐
                     │  Check       │     │  Apply       │
                     │  Privacy     │────▶│  Branding    │
                     │  Gates       │     │  Settings    │
                     └──────────────┘     └──────────────┘
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
     ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
     │  Email       │ │  PIN         │ │  Expiry      │
     │  Gate        │ │  Gate        │ │  Check       │
     └──────────────┘ └──────────────┘ └──────────────┘
```

---

## 3. Database Schema

### 3.1 New Tables

```sql
-- Migration: 0031_magic_links_and_qr.sql

-- Magic Links table
CREATE TABLE magic_links (
    link_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id),
    gallery_id UUID NOT NULL REFERENCES galleries(gallery_id) ON DELETE CASCADE,

    -- Token storage (only hash stored)
    token_hash VARCHAR(64) NOT NULL UNIQUE,

    -- Target specification
    target_type VARCHAR(20) NOT NULL DEFAULT 'gallery'
        CHECK (target_type IN ('gallery', 'sub_gallery', 'photo')),
    target_id UUID, -- NULL for root gallery, sub_gallery_id or asset_id otherwise

    -- Link settings
    label VARCHAR(200), -- Optional friendly name
    expires_at TIMESTAMPTZ,
    max_accesses INTEGER, -- NULL = unlimited

    -- QR Code configuration (JSONB)
    qr_config JSONB DEFAULT '{
        "size": 1024,
        "color": null,
        "logo_enabled": true,
        "error_correction": "H"
    }'::jsonb,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'expired', 'revoked')),

    -- Audit
    created_by UUID REFERENCES users(user_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,

    -- Constraints
    CONSTRAINT valid_target CHECK (
        (target_type = 'gallery' AND target_id IS NULL) OR
        (target_type != 'gallery' AND target_id IS NOT NULL)
    )
);

-- Indexes for magic_links
CREATE INDEX idx_magic_links_gallery ON magic_links(gallery_id);
CREATE INDEX idx_magic_links_workspace ON magic_links(workspace_id);
CREATE INDEX idx_magic_links_token ON magic_links(token_hash);
CREATE INDEX idx_magic_links_status ON magic_links(status) WHERE status = 'active';

-- Magic Link Access Logs
CREATE TABLE magic_link_accesses (
    access_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    link_id UUID NOT NULL REFERENCES magic_links(link_id) ON DELETE CASCADE,
    visitor_id UUID REFERENCES visitors(visitor_id),

    -- Access metadata
    accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    referer TEXT,

    -- Gate passage tracking
    passed_email_gate BOOLEAN DEFAULT FALSE,
    passed_pin_gate BOOLEAN DEFAULT FALSE,

    -- Geo data (optional, from IP)
    country_code VARCHAR(2),
    region VARCHAR(100)
);

-- Indexes for access logs
CREATE INDEX idx_link_accesses_link ON magic_link_accesses(link_id);
CREATE INDEX idx_link_accesses_visitor ON magic_link_accesses(visitor_id);
CREATE INDEX idx_link_accesses_time ON magic_link_accesses(accessed_at);

-- Face Search Logs (for abuse prevention, privacy-conscious)
CREATE TABLE face_search_logs (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID NOT NULL REFERENCES galleries(gallery_id) ON DELETE CASCADE,
    visitor_id UUID REFERENCES visitors(visitor_id),

    -- Search metadata (no actual face data)
    embedding_hash VARCHAR(64) NOT NULL, -- Hash of embedding for dedup
    matches_count INTEGER NOT NULL DEFAULT 0,
    top_similarity FLOAT,

    -- Timing
    searched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_ms INTEGER,

    -- Client info
    ip_address INET,
    user_agent TEXT
);

-- Index for rate limiting
CREATE INDEX idx_face_search_gallery_ip ON face_search_logs(gallery_id, ip_address, searched_at);
CREATE INDEX idx_face_search_gallery_time ON face_search_logs(gallery_id, searched_at);

-- Add QR cache column to galleries for quick access
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS
    qr_cache JSONB DEFAULT NULL;

-- Comment
COMMENT ON TABLE magic_links IS 'Shareable links for public gallery access with QR codes';
COMMENT ON TABLE magic_link_accesses IS 'Access log for magic link analytics';
COMMENT ON TABLE face_search_logs IS 'Privacy-conscious face search audit log';
```

### 3.2 Updated Galleries Table

```sql
-- Ensure galleries table has all required columns (most already exist)
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS
    sharing_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE galleries ADD COLUMN IF NOT EXISTS
    default_link_id UUID REFERENCES magic_links(link_id);

-- Index for public gallery lookup
CREATE INDEX IF NOT EXISTS idx_galleries_sharing
    ON galleries(sharing_enabled, status)
    WHERE sharing_enabled = TRUE AND status = 'published';
```

---

## 4. API Specification

### 4.1 Magic Link Endpoints (Backend)

```python
# backend/src/app/api/v1/magic_links.py

from fastapi import APIRouter, Path, Query, Body, Response
from uuid import UUID

router = APIRouter(prefix="/workspaces/{workspace_id}/galleries/{gallery_id}/links")

@router.post("", status_code=201, summary="Create Magic Link")
async def create_magic_link(
    workspace_id: UUID,
    gallery_id: UUID,
    request: CreateMagicLinkRequest,
    workspace_access: WorkspaceAccessDep,
) -> MagicLinkResponse:
    """
    Create a new Magic Link for the gallery.

    Request body:
    - target_type: 'gallery' | 'sub_gallery' | 'photo'
    - target_id: UUID (required if target_type != 'gallery')
    - label: Optional friendly name
    - expires_at: Optional expiry datetime
    - max_accesses: Optional access limit
    - qr_config: Optional QR customization

    Returns:
    - link_id: UUID
    - token: string (only returned once, on creation)
    - url: Full shareable URL
    - qr_preview_url: URL to QR code preview
    """

@router.get("", summary="List Magic Links")
async def list_magic_links(
    workspace_id: UUID,
    gallery_id: UUID,
    workspace_access: WorkspaceAccessDep,
    status: str = Query("active"),
    limit: int = Query(50, le=100),
) -> MagicLinkListResponse:
    """List all magic links for a gallery."""

@router.get("/{link_id}", summary="Get Magic Link Details")
async def get_magic_link(
    workspace_id: UUID,
    gallery_id: UUID,
    link_id: UUID,
    workspace_access: WorkspaceAccessDep,
) -> MagicLinkDetailResponse:
    """Get magic link details including access statistics."""

@router.delete("/{link_id}", summary="Revoke Magic Link")
async def revoke_magic_link(
    workspace_id: UUID,
    gallery_id: UUID,
    link_id: UUID,
    workspace_access: WorkspaceAccessDep,
) -> MessageResponse:
    """Revoke a magic link (immediate effect)."""

@router.get("/{link_id}/qr", summary="Download QR Code")
async def download_qr_code(
    workspace_id: UUID,
    gallery_id: UUID,
    link_id: UUID,
    workspace_access: WorkspaceAccessDep,
    format: str = Query("png", regex="^(png|svg|pdf)$"),
    size: int = Query(1024, ge=256, le=4096),
) -> Response:
    """
    Download QR code in specified format.

    Query params:
    - format: 'png' | 'svg' | 'pdf'
    - size: Pixel size (256-4096, default 1024)

    Returns: Binary file with appropriate content-type
    """

@router.get("/{link_id}/stats", summary="Get Link Analytics")
async def get_link_stats(
    workspace_id: UUID,
    gallery_id: UUID,
    link_id: UUID,
    workspace_access: WorkspaceAccessDep,
    period: str = Query("7d"),
) -> LinkStatsResponse:
    """
    Get access statistics for a magic link.

    Returns:
    - total_accesses: int
    - unique_visitors: int
    - accesses_by_day: dict
    - top_countries: list
    - gate_conversion: dict (email/PIN pass rates)
    """
```

### 4.2 Public Gallery Endpoints

```python
# backend/src/app/api/v1/public_galleries.py (enhanced)

@router.get("/g/{token}", summary="Access Gallery via Magic Link")
async def access_magic_link(
    token: str = Path(..., min_length=32, max_length=64),
    request: Request,
) -> PublicGalleryResponse:
    """
    Main entry point for Magic Link access.

    Flow:
    1. Validate token
    2. Check gallery sharing enabled
    3. Check expiry
    4. Return gallery metadata + required gates

    Returns:
    - gallery: GalleryDetailResponse
    - requires_email: bool
    - requires_pin: bool
    - target: { type, id } for scoped links
    """

@router.post("/g/{token}/face-search", summary="Find Photos by Face")
async def face_search(
    token: str,
    request: FaceSearchRequest,
    client_request: Request,
) -> FaceSearchResponse:
    """
    Find photos matching a face embedding.

    Request body:
    - embedding: list[float] (512 dimensions)
    - threshold: float (default 0.6, range 0.4-0.8)
    - limit: int (default 50, max 200)

    Returns:
    - matches: list[{ asset_id, similarity, thumbnail_url }]
    - total_searched: int
    - processing_ms: int

    Rate limit: 100/hour per gallery per IP
    """

@router.get("/g/{token}/qr", summary="Get QR Code for Link")
async def get_public_qr(
    token: str,
    format: str = Query("png"),
    size: int = Query(512),
) -> Response:
    """Public endpoint to get QR code (limited customization)."""
```

### 4.3 Request/Response Schemas

```python
# backend/src/app/api/schemas.py (additions)

class CreateMagicLinkRequest(BaseModel):
    target_type: Literal["gallery", "sub_gallery", "photo"] = "gallery"
    target_id: UUID | None = None
    label: str | None = Field(None, max_length=200)
    expires_at: datetime | None = None
    max_accesses: int | None = Field(None, ge=1)
    qr_config: QRConfig | None = None

class QRConfig(BaseModel):
    size: int = Field(1024, ge=256, le=4096)
    color: str | None = Field(None, regex="^#[0-9a-fA-F]{6}$")
    logo_enabled: bool = True
    error_correction: Literal["L", "M", "Q", "H"] = "H"
    label: str | None = Field(None, max_length=50)

class MagicLinkResponse(BaseModel):
    link_id: UUID
    token: str | None  # Only on creation
    url: str
    target_type: str
    target_id: UUID | None
    label: str | None
    expires_at: datetime | None
    max_accesses: int | None
    access_count: int
    status: str
    qr_preview_url: str
    created_at: datetime

class FaceSearchRequest(BaseModel):
    embedding: list[float] = Field(..., min_length=512, max_length=512)
    threshold: float = Field(0.6, ge=0.4, le=0.8)
    limit: int = Field(50, ge=1, le=200)

class FaceSearchMatch(BaseModel):
    asset_id: UUID
    similarity: float
    thumbnail_url: str
    filename: str | None

class FaceSearchResponse(BaseModel):
    matches: list[FaceSearchMatch]
    total_searched: int
    processing_ms: int
```

---

## 5. QR Code Generation

### 5.1 QR Code Service

```python
# backend/src/app/services/qr_service.py

import qrcode
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.moduledrawers import RoundedModuleDrawer
from qrcode.image.styles.colormasks import SolidFillColorMask
from PIL import Image
from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
import cairosvg

class QRCodeService:
    """Service for generating customized QR codes."""

    ERROR_CORRECTION_MAP = {
        "L": qrcode.constants.ERROR_CORRECT_L,  # 7%
        "M": qrcode.constants.ERROR_CORRECT_M,  # 15%
        "Q": qrcode.constants.ERROR_CORRECT_Q,  # 25%
        "H": qrcode.constants.ERROR_CORRECT_H,  # 30%
    }

    def __init__(self, storage_service: StorageService):
        self.storage = storage_service

    def generate_qr(
        self,
        url: str,
        size: int = 1024,
        color: str | None = None,
        logo_url: str | None = None,
        error_correction: str = "H",
    ) -> Image.Image:
        """Generate QR code as PIL Image."""
        qr = qrcode.QRCode(
            version=None,  # Auto-size
            error_correction=self.ERROR_CORRECTION_MAP[error_correction],
            box_size=10,
            border=4,
        )
        qr.add_data(url)
        qr.make(fit=True)

        # Apply color if specified
        fill_color = color or "#000000"
        back_color = "#FFFFFF"

        img = qr.make_image(
            image_factory=StyledPilImage,
            module_drawer=RoundedModuleDrawer(),
            color_mask=SolidFillColorMask(
                back_color=back_color,
                front_color=fill_color,
            ),
        )

        # Resize to target size
        img = img.resize((size, size), Image.Resampling.LANCZOS)

        # Add logo if provided
        if logo_url:
            img = self._add_logo(img, logo_url)

        return img

    def _add_logo(self, qr_img: Image.Image, logo_url: str) -> Image.Image:
        """Add centered logo to QR code."""
        logo_data = self.storage.download(logo_url)
        logo = Image.open(BytesIO(logo_data)).convert("RGBA")

        # Logo should be ~20% of QR size
        qr_size = qr_img.size[0]
        logo_size = int(qr_size * 0.2)
        logo = logo.resize((logo_size, logo_size), Image.Resampling.LANCZOS)

        # Create white background circle for logo
        mask_size = int(logo_size * 1.2)
        mask = Image.new("RGBA", (mask_size, mask_size), (255, 255, 255, 255))

        # Paste mask and logo centered
        qr_img = qr_img.convert("RGBA")
        pos = (qr_size - mask_size) // 2
        qr_img.paste(mask, (pos, pos))

        logo_pos = (qr_size - logo_size) // 2
        qr_img.paste(logo, (logo_pos, logo_pos), logo)

        return qr_img

    def export_png(self, img: Image.Image) -> bytes:
        """Export QR code as PNG."""
        buffer = BytesIO()
        img.save(buffer, format="PNG", optimize=True)
        return buffer.getvalue()

    def export_svg(self, url: str, size: int, color: str | None) -> bytes:
        """Generate QR code as SVG."""
        qr = qrcode.QRCode(
            error_correction=qrcode.constants.ERROR_CORRECT_H,
            box_size=10,
            border=4,
        )
        qr.add_data(url)
        qr.make(fit=True)

        # Generate SVG
        from qrcode.image.svg import SvgPathImage
        img = qr.make_image(image_factory=SvgPathImage)

        buffer = BytesIO()
        img.save(buffer)
        svg_content = buffer.getvalue()

        # Apply color transformation if needed
        if color:
            svg_str = svg_content.decode('utf-8')
            svg_str = svg_str.replace('fill="#000000"', f'fill="{color}"')
            svg_content = svg_str.encode('utf-8')

        return svg_content

    def export_pdf(
        self,
        img: Image.Image,
        label: str | None = None,
        include_crop_marks: bool = True,
    ) -> bytes:
        """Export QR code as print-ready PDF."""
        buffer = BytesIO()
        c = canvas.Canvas(buffer, pagesize=A4)

        # Convert PIL to bytes for PDF
        img_buffer = BytesIO()
        img.save(img_buffer, format="PNG")
        img_buffer.seek(0)

        # Center QR on page
        page_width, page_height = A4
        qr_size = 300  # Points (about 4 inches)
        x = (page_width - qr_size) / 2
        y = (page_height - qr_size) / 2 + 50  # Offset for label

        # Draw QR code
        from reportlab.lib.utils import ImageReader
        c.drawImage(ImageReader(img_buffer), x, y, qr_size, qr_size)

        # Add crop marks if requested
        if include_crop_marks:
            self._draw_crop_marks(c, x, y, qr_size)

        # Add label if provided
        if label:
            c.setFont("Helvetica", 14)
            text_width = c.stringWidth(label, "Helvetica", 14)
            c.drawString((page_width - text_width) / 2, y - 30, label)

        c.save()
        return buffer.getvalue()

    def _draw_crop_marks(self, c, x, y, size):
        """Draw crop marks around QR code."""
        mark_len = 20
        offset = 10

        positions = [
            (x - offset, y - offset),  # Bottom-left
            (x + size + offset, y - offset),  # Bottom-right
            (x - offset, y + size + offset),  # Top-left
            (x + size + offset, y + size + offset),  # Top-right
        ]

        c.setStrokeColor("#000000")
        c.setLineWidth(0.5)

        for px, py in positions:
            # Horizontal mark
            c.line(px - mark_len, py, px - 5, py)
            # Vertical mark
            c.line(px, py - mark_len, px, py - 5)
```

### 5.2 QR Code Caching

```python
# backend/src/app/services/magic_link_service.py

class MagicLinkService:
    def get_qr_url(self, link_id: UUID, format: str = "png") -> str:
        """Get cached or generate QR code URL."""
        cache_key = f"qr:{link_id}:{format}"

        # Check cache
        cached_url = await self.redis.get(cache_key)
        if cached_url:
            return cached_url

        # Generate and upload to storage
        link = await self.repo.get(link_id)
        gallery = await self.gallery_repo.get(link.gallery_id)

        url = self._build_link_url(link)
        qr_img = self.qr_service.generate_qr(
            url=url,
            size=link.qr_config.get("size", 1024),
            color=link.qr_config.get("color") or gallery.primary_color,
            logo_url=gallery.company_profile.logo_url if gallery.company_profile else None,
            error_correction=link.qr_config.get("error_correction", "H"),
        )

        # Export and upload
        if format == "png":
            content = self.qr_service.export_png(qr_img)
            content_type = "image/png"
        elif format == "svg":
            content = self.qr_service.export_svg(url, size, color)
            content_type = "image/svg+xml"
        else:
            content = self.qr_service.export_pdf(qr_img, label=link.label)
            content_type = "application/pdf"

        # Upload to storage
        storage_key = f"workspaces/{link.workspace_id}/qr/{link_id}.{format}"
        qr_url = await self.storage.upload(storage_key, content, content_type)

        # Cache for 24 hours
        await self.redis.setex(cache_key, 86400, qr_url)

        return qr_url
```

---

## 6. Face Discovery Feature

### 6.1 Client-Side Face Detection (TensorFlow.js)

```typescript
// frontend/src/components/features/gallery/FaceDiscovery.tsx

import React, { useState, useRef, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as blazeface from '@tensorflow-models/blazeface';
import { Camera, X, Loader2, ScanFace, AlertCircle } from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { AppCard } from '../../ui/AppCard';
import { galleryService } from '../../../services/galleryService';

interface FaceDiscoveryProps {
  galleryToken: string;
  onMatchesFound: (matches: FaceMatch[]) => void;
  onClose: () => void;
  primaryColor?: string;
}

interface FaceMatch {
  asset_id: string;
  similarity: number;
  thumbnail_url: string;
  filename: string;
}

// MobileFaceNet model for generating embeddings
let faceNetModel: tf.GraphModel | null = null;

const loadFaceNetModel = async (): Promise<tf.GraphModel> => {
  if (!faceNetModel) {
    faceNetModel = await tf.loadGraphModel('/models/mobilefacenet/model.json');
  }
  return faceNetModel;
};

export const FaceDiscovery: React.FC<FaceDiscoveryProps> = ({
  galleryToken,
  onMatchesFound,
  onClose,
  primaryColor,
}) => {
  const [step, setStep] = useState<'consent' | 'capture' | 'processing' | 'error'>('consent');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setStep('capture');
    } catch (err) {
      setError('Camera access denied. Please allow camera access to find your photos.');
      setStep('error');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  const captureAndProcess = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setStep('processing');
    setProgress(10);

    try {
      // 1. Capture frame
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d')!;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      stopCamera();
      setProgress(20);

      // 2. Detect face using BlazeFace
      const blazeModel = await blazeface.load();
      setProgress(30);

      const predictions = await blazeModel.estimateFaces(canvas, false);

      if (predictions.length === 0) {
        setError('No face detected. Please ensure your face is clearly visible and try again.');
        setStep('error');
        return;
      }

      setProgress(40);

      // 3. Crop face region
      const face = predictions[0];
      const [x1, y1] = face.topLeft as [number, number];
      const [x2, y2] = face.bottomRight as [number, number];

      const faceWidth = x2 - x1;
      const faceHeight = y2 - y1;

      // Add padding (20%)
      const padding = 0.2;
      const padX = faceWidth * padding;
      const padY = faceHeight * padding;

      const cropX = Math.max(0, x1 - padX);
      const cropY = Math.max(0, y1 - padY);
      const cropW = Math.min(canvas.width - cropX, faceWidth + 2 * padX);
      const cropH = Math.min(canvas.height - cropY, faceHeight + 2 * padY);

      // Create cropped canvas
      const faceCanvas = document.createElement('canvas');
      faceCanvas.width = 112;  // MobileFaceNet input size
      faceCanvas.height = 112;
      const faceCtx = faceCanvas.getContext('2d')!;
      faceCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, 112, 112);

      setProgress(50);

      // 4. Generate embedding with MobileFaceNet
      const faceNetModel = await loadFaceNetModel();
      setProgress(60);

      // Preprocess: normalize to [-1, 1]
      const imageData = faceCtx.getImageData(0, 0, 112, 112);
      const inputTensor = tf.tidy(() => {
        const tensor = tf.browser.fromPixels(imageData);
        const normalized = tensor.toFloat().div(127.5).sub(1);
        return normalized.expandDims(0);
      });

      setProgress(70);

      // Get embedding
      const embedding = await faceNetModel.predict(inputTensor) as tf.Tensor;
      const embeddingArray = await embedding.data();

      // Cleanup tensors
      inputTensor.dispose();
      embedding.dispose();

      setProgress(80);

      // 5. Send embedding to server (NOT the face image)
      const matches = await galleryService.faceSearch(galleryToken, {
        embedding: Array.from(embeddingArray),
        threshold: 0.55,
        limit: 100,
      });

      setProgress(100);

      if (matches.length === 0) {
        setError('No matching photos found. Try again with better lighting or a clearer view of your face.');
        setStep('error');
        return;
      }

      onMatchesFound(matches);

    } catch (err) {
      console.error('Face processing error:', err);
      setError('Failed to process face. Please try again.');
      setStep('error');
    }
  }, [galleryToken, onMatchesFound, stopCamera]);

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <AppCard className="w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <ScanFace className="w-5 h-5" style={{ color: primaryColor }} />
            <h2 className="text-lg font-semibold">Find My Photos</h2>
          </div>
          <AppButton variant="ghost" size="icon" onClick={handleClose}>
            <X className="w-4 h-4" />
          </AppButton>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'consent' && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-surface-hover rounded-full flex items-center justify-center">
                <Camera className="w-8 h-8 text-text-secondary" />
              </div>
              <div>
                <h3 className="text-lg font-medium mb-2">Use Your Camera</h3>
                <p className="text-text-secondary text-sm">
                  We'll use your camera to find photos where you appear.
                  Your face image stays on your device and is never uploaded.
                </p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded-lg text-sm text-blue-700 dark:text-blue-300">
                <strong>Privacy First:</strong> Only a mathematical representation (embedding)
                is sent to find matches. The actual photo of your face never leaves your device.
              </div>
              <div className="flex gap-3 pt-2">
                <AppButton variant="outline" onClick={handleClose} className="flex-1">
                  Browse Instead
                </AppButton>
                <AppButton
                  variant="primary"
                  onClick={startCamera}
                  className="flex-1"
                  style={{ backgroundColor: primaryColor }}
                >
                  Allow Camera
                </AppButton>
              </div>
            </div>
          )}

          {step === 'capture' && (
            <div className="space-y-4">
              <div className="relative aspect-[4/3] bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {/* Face guide overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-48 h-48 border-2 border-white/50 rounded-full" />
                </div>
              </div>
              <p className="text-center text-sm text-text-secondary">
                Position your face within the circle and tap capture
              </p>
              <AppButton
                variant="primary"
                onClick={captureAndProcess}
                className="w-full"
                style={{ backgroundColor: primaryColor }}
              >
                <Camera className="w-4 h-4 mr-2" />
                Capture & Find Photos
              </AppButton>
              <canvas ref={canvasRef} className="hidden" />
            </div>
          )}

          {step === 'processing' && (
            <div className="text-center py-8 space-y-4">
              <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
              <div>
                <p className="font-medium">Finding your photos...</p>
                <p className="text-sm text-text-secondary">
                  {progress < 50 ? 'Analyzing face...' :
                   progress < 80 ? 'Generating embedding...' :
                   'Searching gallery...'}
                </p>
              </div>
              <div className="w-full bg-surface-hover rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%`, backgroundColor: primaryColor }}
                />
              </div>
            </div>
          )}

          {step === 'error' && (
            <div className="text-center py-4 space-y-4">
              <div className="w-16 h-16 mx-auto bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-medium mb-2">Something went wrong</h3>
                <p className="text-text-secondary text-sm">{error}</p>
              </div>
              <div className="flex gap-3">
                <AppButton variant="outline" onClick={handleClose} className="flex-1">
                  Cancel
                </AppButton>
                <AppButton
                  variant="primary"
                  onClick={() => { setError(null); setStep('consent'); }}
                  className="flex-1"
                  style={{ backgroundColor: primaryColor }}
                >
                  Try Again
                </AppButton>
              </div>
            </div>
          )}
        </div>
      </AppCard>
    </div>
  );
};
```

### 6.2 Backend Face Search Service

```python
# backend/src/app/services/face_search_service.py

import hashlib
import time
from uuid import UUID
from typing import Optional

from app.repositories.face_embedding_repository import FaceEmbeddingRepository
from app.repositories.face_search_log_repository import FaceSearchLogRepository
from app.api.exceptions import AppError

class FaceSearchService:
    """Service for searching photos by face embedding."""

    def __init__(
        self,
        embedding_repo: FaceEmbeddingRepository,
        log_repo: FaceSearchLogRepository,
        redis: Redis,
    ):
        self.embedding_repo = embedding_repo
        self.log_repo = log_repo
        self.redis = redis

    async def search_by_embedding(
        self,
        gallery_id: UUID,
        embedding: list[float],
        threshold: float = 0.6,
        limit: int = 50,
        visitor_id: Optional[UUID] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> dict:
        """
        Search for photos matching a face embedding.

        Args:
            gallery_id: Gallery to search within
            embedding: 512-dimensional face embedding
            threshold: Similarity threshold (0.4-0.8)
            limit: Maximum results
            visitor_id: Optional visitor for tracking
            ip_address: Client IP for rate limiting
            user_agent: Client user agent

        Returns:
            dict with matches, total_searched, processing_ms
        """
        start_time = time.time()

        # Validate embedding dimension
        if len(embedding) != 512:
            raise AppError(
                message="Invalid embedding dimension",
                code="INVALID_EMBEDDING",
                status_code=400,
            )

        # Rate limiting
        if ip_address:
            await self._check_rate_limit(gallery_id, ip_address)

        # Compute embedding hash for dedup/logging
        embedding_hash = hashlib.sha256(
            str(embedding).encode()
        ).hexdigest()[:16]

        # Search using pgvector cosine similarity
        results = await self.embedding_repo.find_similar_in_gallery(
            gallery_id=gallery_id,
            embedding=embedding,
            threshold=threshold,
            limit=limit,
        )

        processing_ms = int((time.time() - start_time) * 1000)

        # Log search (privacy-conscious)
        await self.log_repo.create({
            "gallery_id": gallery_id,
            "visitor_id": visitor_id,
            "embedding_hash": embedding_hash,
            "matches_count": len(results),
            "top_similarity": results[0]["similarity"] if results else None,
            "processing_ms": processing_ms,
            "ip_address": ip_address,
            "user_agent": user_agent,
        })

        return {
            "matches": results,
            "total_searched": await self.embedding_repo.count_in_gallery(gallery_id),
            "processing_ms": processing_ms,
        }

    async def _check_rate_limit(self, gallery_id: UUID, ip_address: str):
        """Check rate limit: 100 searches per hour per gallery per IP."""
        key = f"face_search_rate:{gallery_id}:{ip_address}"
        count = await self.redis.incr(key)

        if count == 1:
            await self.redis.expire(key, 3600)  # 1 hour

        if count > 100:
            raise AppError(
                message="Too many face searches. Please wait before trying again.",
                code="RATE_LIMITED",
                status_code=429,
            )
```

### 6.3 Face Embedding Repository Enhancement

```python
# backend/src/app/repositories/face_embedding_repository.py (additions)

async def find_similar_in_gallery(
    self,
    gallery_id: UUID,
    embedding: list[float],
    threshold: float = 0.6,
    limit: int = 50,
) -> list[dict]:
    """
    Find similar faces within a specific gallery.

    Uses cosine distance: 1 - cosine_similarity
    Lower distance = more similar
    Threshold of 0.6 means similarity > 0.4 (1 - 0.6)
    """
    query = """
        SELECT
            fe.asset_id,
            a.filename,
            1 - (fe.embedding <=> $1::vector) as similarity
        FROM face_embeddings fe
        JOIN assets a ON a.asset_id = fe.asset_id
        JOIN gallery_assets ga ON ga.asset_id = a.asset_id
        WHERE ga.gallery_id = $2
          AND a.status = 'available'
          AND 1 - (fe.embedding <=> $1::vector) >= $3
        ORDER BY similarity DESC
        LIMIT $4
    """

    # Convert embedding to pgvector format
    embedding_str = f"[{','.join(str(x) for x in embedding)}]"

    rows = await self.pool.fetch(
        query,
        embedding_str,
        gallery_id,
        threshold,
        limit,
    )

    return [
        {
            "asset_id": str(row["asset_id"]),
            "filename": row["filename"],
            "similarity": round(row["similarity"], 4),
            "thumbnail_url": f"/api/v1/public/galleries/{gallery_id}/assets/{row['asset_id']}/thumbnail",
        }
        for row in rows
    ]

async def count_in_gallery(self, gallery_id: UUID) -> int:
    """Count face embeddings in a gallery."""
    query = """
        SELECT COUNT(DISTINCT fe.asset_id)
        FROM face_embeddings fe
        JOIN gallery_assets ga ON ga.asset_id = fe.asset_id
        WHERE ga.gallery_id = $1
    """
    result = await self.pool.fetchval(query, gallery_id)
    return result or 0
```

---

## 7. Security Model

### 7.1 Token Security

| Aspect | Implementation |
|--------|----------------|
| **Entropy** | 256 bits (32 bytes from `secrets.token_bytes`) |
| **Storage** | SHA-256 hash only (never plaintext) |
| **Transmission** | HTTPS only, URL-safe base64 encoding |
| **Validation** | Constant-time comparison via `hmac.compare_digest` |
| **Expiry** | Configurable, checked on every access |
| **Revocation** | Immediate via status change |

### 7.2 Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| Token validation | 10/min | Per IP |
| Face search | 100/hour | Per gallery per IP |
| QR generation | 20/hour | Per workspace |
| Link creation | 100/day | Per workspace |

### 7.3 Privacy Gates Flow

```
                    ┌─────────────────────┐
                    │   Magic Link Visit  │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │ Validate Token Hash │
                    │ (constant time)     │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │ Check Sharing On    │
                    │ + Not Expired       │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
    ┌─────────▼─────────┐     │      ┌─────────▼─────────┐
    │ Email Required?   │     │      │ PIN Required?     │
    │ Show Email Modal  │     │      │ Show PIN Modal    │
    └─────────┬─────────┘     │      └─────────┬─────────┘
              │               │                │
              └───────────────┼────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │ Load Gallery      │
                    │ Apply Branding    │
                    │ Enforce Permissions│
                    └───────────────────┘
```

### 7.4 Face Discovery Privacy

| Principle | Implementation |
|-----------|----------------|
| **Local processing** | Face detection and embedding via TensorFlow.js in browser |
| **No face upload** | Only 512-dim float array transmitted |
| **Minimal logging** | Hash of embedding, not raw values |
| **Rate limiting** | Prevents brute-force embedding enumeration |
| **Consent required** | Explicit user action to enable camera |
| **No persistence** | Face data cleared after search completes |

---

## 8. Implementation Plan

### 8.1 Phase 1: Core Magic Links (Week 1-2)

#### Commit 1: Database Schema
```
feat(db): add magic_links and access log tables

- Create magic_links table with token_hash, target, expiry
- Create magic_link_accesses for analytics
- Add indexes for token lookup and gallery filtering
- Add sharing_enabled column to galleries

Migration: 0031_magic_links_and_qr.sql
```

#### Commit 2: Magic Link Service
```
feat(backend): implement MagicLinkService

- Token generation with 256-bit entropy
- SHA-256 hash storage (never plaintext)
- Validation with constant-time comparison
- Expiry and revocation logic
- Access logging

Files:
- backend/src/app/services/magic_link_service.py
- backend/src/app/repositories/magic_link_repository.py
```

#### Commit 3: Magic Link API Endpoints
```
feat(api): add magic link CRUD endpoints

- POST /workspaces/{w}/galleries/{g}/links - create
- GET /workspaces/{w}/galleries/{g}/links - list
- GET /workspaces/{w}/galleries/{g}/links/{id} - detail
- DELETE /workspaces/{w}/galleries/{g}/links/{id} - revoke
- GET /workspaces/{w}/galleries/{g}/links/{id}/stats - analytics

Files:
- backend/src/app/api/v1/magic_links.py
- backend/src/app/api/schemas.py (additions)
```

#### Commit 4: Public Access via Token
```
feat(api): implement token-based public gallery access

- GET /g/{token} - validate and return gallery
- Handle sub-gallery and photo scoping
- Integrate with existing PIN/email gates
- Log access with metadata

Files:
- backend/src/app/api/v1/public_galleries.py (enhanced)
```

### 8.2 Phase 2: QR Code Generation (Week 2-3)

#### Commit 5: QR Code Service
```
feat(backend): implement QRCodeService

- Generate QR with customization (color, logo)
- Export PNG, SVG, PDF formats
- Error correction level H (30%)
- PDF with crop marks for print

Dependencies: qrcode, pillow, reportlab, cairosvg

Files:
- backend/src/app/services/qr_service.py
```

#### Commit 6: QR Code Endpoints
```
feat(api): add QR code download endpoints

- GET /workspaces/{w}/galleries/{g}/links/{id}/qr
- GET /g/{token}/qr (public)
- Format and size query params
- Caching via Redis + R2

Files:
- backend/src/app/api/v1/magic_links.py (additions)
```

#### Commit 7: Frontend Share Dialog
```
feat(frontend): implement ShareDialog with QR preview

- QR code preview with download buttons
- Social sharing (WhatsApp, Facebook, Email)
- Link copying with feedback
- Custom domain display

Files:
- frontend/src/components/features/gallery/ShareDialog.tsx
- frontend/src/services/magicLinkService.ts
```

### 8.3 Phase 3: Face Discovery (Week 3-4)

#### Commit 8: Face Search Backend
```
feat(backend): implement face search service

- POST /g/{token}/face-search endpoint
- pgvector cosine similarity search
- Rate limiting (100/hour/gallery/IP)
- Privacy-conscious logging

Files:
- backend/src/app/services/face_search_service.py
- backend/src/app/repositories/face_search_log_repository.py
- backend/src/app/api/v1/public_galleries.py (additions)
```

#### Commit 9: TensorFlow.js Models
```
feat(frontend): add face detection models

- BlazeFace for face detection
- MobileFaceNet for embedding generation
- Model loading with progress indicator
- WebGL backend optimization

Files:
- frontend/public/models/mobilefacenet/model.json
- frontend/public/models/mobilefacenet/weights.bin
- frontend/src/utils/faceModels.ts
```

#### Commit 10: Face Discovery Component
```
feat(frontend): implement FaceDiscovery component

- Camera access with consent dialog
- Real-time face detection guide
- Client-side embedding generation
- Results display with similarity scores

Files:
- frontend/src/components/features/gallery/FaceDiscovery.tsx
- frontend/src/hooks/useFaceDetection.ts
```

#### Commit 11: Face Search Results View
```
feat(frontend): add face match results gallery view

- Filter gallery to matched photos only
- Sort by similarity score
- "Show all photos" toggle
- Match confidence indicator

Files:
- frontend/src/components/features/gallery/FaceMatchResults.tsx
- frontend/src/pages/public/PublicGalleryPage.tsx (integration)
```

### 8.4 Phase 4: Integration & Polish (Week 4-5)

#### Commit 12: Gallery Settings Integration
```
feat(frontend): integrate magic links in gallery settings

- Magic Links tab in settings
- Create/manage links UI
- QR code generation controls
- Analytics dashboard

Files:
- frontend/src/components/features/gallery/MagicLinksSettings.tsx
- frontend/src/pages/gallery/GallerySettingsPage.tsx
```

#### Commit 13: Custom Domain Support
```
feat: implement custom domain for magic links

- Domain validation on workspace settings
- CNAME verification endpoint
- URL generation with custom domain
- Certificate provisioning (Cloudflare)

Files:
- backend/src/app/services/domain_service.py
- backend/src/app/api/v1/workspace_settings.py
```

#### Commit 14: Analytics Dashboard
```
feat(frontend): add magic link analytics

- Access timeline chart
- Geographic distribution
- Device breakdown
- Gate conversion rates

Files:
- frontend/src/components/features/gallery/LinkAnalytics.tsx
```

#### Commit 15: E2E Tests
```
test: add E2E tests for magic link flow

- Token generation and validation
- Privacy gates (PIN, email)
- QR code generation
- Face search flow
- Analytics tracking

Files:
- frontend/e2e/magic-links.spec.ts
- backend/tests/integration/test_magic_links.py
```

---

## 9. Quality Assurance

### 9.1 Unit Tests

```python
# backend/tests/unit/test_magic_link_service.py

import pytest
from unittest.mock import AsyncMock, MagicMock
from app.services.magic_link_service import MagicLinkService

class TestMagicLinkService:

    @pytest.fixture
    def service(self):
        repo = AsyncMock()
        qr_service = MagicMock()
        redis = AsyncMock()
        return MagicLinkService(repo, qr_service, redis)

    async def test_generate_token_returns_43_chars(self, service):
        """Token should be URL-safe base64, 43 chars (32 bytes)."""
        token, hash_ = service._generate_token()
        assert len(token) == 43
        assert all(c.isalnum() or c in '-_' for c in token)

    async def test_token_hash_is_sha256(self, service):
        """Hash should be 64 char hex (SHA-256)."""
        _, hash_ = service._generate_token()
        assert len(hash_) == 64
        assert all(c in '0123456789abcdef' for c in hash_)

    async def test_validate_expired_token_raises(self, service):
        """Expired tokens should raise AppError."""
        service.repo.get_by_hash.return_value = {
            "status": "expired",
            "expires_at": "2020-01-01T00:00:00Z",
        }

        with pytest.raises(AppError) as exc:
            await service.validate_token("some-token")

        assert exc.value.code == "LINK_EXPIRED"

    async def test_validate_revoked_token_raises(self, service):
        """Revoked tokens should raise AppError."""
        service.repo.get_by_hash.return_value = {
            "status": "revoked",
        }

        with pytest.raises(AppError) as exc:
            await service.validate_token("some-token")

        assert exc.value.code == "LINK_REVOKED"

    async def test_access_limit_enforced(self, service):
        """Links with max_accesses should be checked."""
        service.repo.get_by_hash.return_value = {
            "status": "active",
            "expires_at": None,
            "max_accesses": 10,
            "access_count": 10,
        }

        with pytest.raises(AppError) as exc:
            await service.validate_token("some-token")

        assert exc.value.code == "LINK_ACCESS_LIMIT"
```

### 9.2 Integration Tests

```python
# backend/tests/integration/test_magic_links_api.py

import pytest
from httpx import AsyncClient

class TestMagicLinksAPI:

    @pytest.fixture
    async def gallery(self, workspace, db):
        """Create test gallery."""
        return await create_test_gallery(workspace.workspace_id)

    async def test_create_magic_link(self, client: AsyncClient, gallery, auth_headers):
        """Should create magic link and return token once."""
        response = await client.post(
            f"/api/v1/workspaces/{gallery.workspace_id}/galleries/{gallery.gallery_id}/links",
            headers=auth_headers,
            json={"target_type": "gallery"},
        )

        assert response.status_code == 201
        data = response.json()

        assert "link_id" in data
        assert "token" in data  # Only returned on creation
        assert data["url"].startswith("https://")
        assert data["status"] == "active"

    async def test_token_not_in_subsequent_get(self, client: AsyncClient, magic_link, auth_headers):
        """Token should not be returned after creation."""
        response = await client.get(
            f"/api/v1/workspaces/{magic_link.workspace_id}/galleries/{magic_link.gallery_id}/links/{magic_link.link_id}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()

        assert "token" not in data or data["token"] is None

    async def test_public_access_valid_token(self, client: AsyncClient, magic_link):
        """Valid token should return gallery data."""
        response = await client.get(f"/g/{magic_link.token}")

        assert response.status_code == 200
        data = response.json()

        assert "gallery" in data
        assert data["gallery"]["gallery_id"] == str(magic_link.gallery_id)

    async def test_public_access_invalid_token(self, client: AsyncClient):
        """Invalid token should return 404."""
        response = await client.get("/g/invalid-token-here")

        assert response.status_code == 404

    async def test_qr_download_png(self, client: AsyncClient, magic_link, auth_headers):
        """Should download QR as PNG."""
        response = await client.get(
            f"/api/v1/workspaces/{magic_link.workspace_id}/galleries/{magic_link.gallery_id}/links/{magic_link.link_id}/qr",
            headers=auth_headers,
            params={"format": "png", "size": 512},
        )

        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"
        assert len(response.content) > 1000  # Non-trivial PNG
```

### 9.3 E2E Tests

```typescript
// frontend/e2e/magic-links.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Magic Links', () => {
  test('photographer can create and share magic link', async ({ page }) => {
    // Login as photographer
    await page.goto('/login');
    await page.fill('[data-testid="email"]', 'photographer@test.com');
    await page.fill('[data-testid="password"]', 'password123');
    await page.click('[data-testid="submit"]');

    // Navigate to gallery settings
    await page.goto('/dashboard/galleries/test-gallery/settings');
    await page.click('[data-testid="magic-links-tab"]');

    // Create new link
    await page.click('[data-testid="create-link"]');
    await page.fill('[data-testid="link-label"]', 'Wedding Guest Link');
    await page.click('[data-testid="create-link-submit"]');

    // Verify link created
    await expect(page.locator('[data-testid="link-url"]')).toBeVisible();

    // Copy link
    const linkUrl = await page.locator('[data-testid="link-url"]').textContent();
    expect(linkUrl).toContain('/g/');
  });

  test('client can access gallery via magic link', async ({ page, context }) => {
    // Use a known test magic link
    await page.goto('/g/test-magic-token-abc123');

    // Should show gallery (no gates on test gallery)
    await expect(page.locator('[data-testid="gallery-title"]')).toBeVisible();
    await expect(page.locator('[data-testid="photo-grid"]')).toBeVisible();
  });

  test('PIN gate blocks access until correct PIN', async ({ page }) => {
    // Gallery with PIN enabled
    await page.goto('/g/pin-protected-token');

    // Should show PIN modal
    await expect(page.locator('[data-testid="pin-modal"]')).toBeVisible();

    // Enter wrong PIN
    await page.fill('[data-testid="pin-input"]', '0000');
    await page.click('[data-testid="pin-submit"]');
    await expect(page.locator('[data-testid="pin-error"]')).toBeVisible();

    // Enter correct PIN
    await page.fill('[data-testid="pin-input"]', '1234');
    await page.click('[data-testid="pin-submit"]');

    // Should now show gallery
    await expect(page.locator('[data-testid="gallery-title"]')).toBeVisible();
  });

  test('QR code downloads in correct format', async ({ page }) => {
    await page.goto('/dashboard/galleries/test-gallery/settings');
    await page.click('[data-testid="magic-links-tab"]');

    // Download PNG
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-testid="download-qr-png"]'),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.png$/);
  });
});

test.describe('Face Discovery', () => {
  test('face discovery flow with camera mock', async ({ page, context }) => {
    // Grant camera permission
    await context.grantPermissions(['camera']);

    // Mock camera stream
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, 640, 480);
        return canvas.captureStream();
      };
    });

    await page.goto('/g/test-gallery-with-faces');

    // Click Find My Photos
    await page.click('[data-testid="face-discovery-button"]');

    // Consent dialog
    await expect(page.locator('[data-testid="face-consent"]')).toBeVisible();
    await page.click('[data-testid="allow-camera"]');

    // Capture (mocked)
    await page.click('[data-testid="capture-face"]');

    // Should show processing
    await expect(page.locator('[data-testid="face-processing"]')).toBeVisible();
  });
});
```

### 9.4 Security Tests

```python
# backend/tests/security/test_magic_link_security.py

import pytest
from app.services.magic_link_service import MagicLinkService

class TestMagicLinkSecurity:

    async def test_token_entropy(self):
        """Tokens must have sufficient entropy (256 bits)."""
        service = MagicLinkService(...)
        tokens = [service._generate_token()[0] for _ in range(1000)]

        # All unique
        assert len(set(tokens)) == 1000

        # No predictable patterns
        for token in tokens:
            assert len(token) >= 32

    async def test_timing_attack_resistance(self):
        """Token validation should use constant-time comparison."""
        # Measure validation time for valid vs invalid tokens
        # Times should be similar regardless of token validity
        pass

    async def test_rate_limiting(self, client):
        """Excessive requests should be rate limited."""
        for i in range(15):
            response = await client.get("/g/invalid-token")

        # After 10 requests/min, should get 429
        assert response.status_code == 429

    async def test_face_embedding_not_stored(self, db, client):
        """Face embeddings from searches should not be persisted."""
        await client.post("/g/token/face-search", json={
            "embedding": [0.1] * 512,
        })

        # Check logs only have hash, not embedding
        logs = await db.fetch("SELECT * FROM face_search_logs")
        for log in logs:
            assert "embedding" not in log or log["embedding"] is None
            assert log["embedding_hash"] is not None
```

### 9.5 Performance Tests

```python
# backend/tests/performance/test_face_search_performance.py

import pytest
import asyncio
import time

class TestFaceSearchPerformance:

    async def test_face_search_latency(self, client, gallery_with_10k_faces):
        """Face search should complete within 500ms for 10k faces."""
        embedding = [0.1] * 512

        start = time.time()
        response = await client.post(
            f"/g/{gallery_with_10k_faces.token}/face-search",
            json={"embedding": embedding, "limit": 50},
        )
        latency = time.time() - start

        assert response.status_code == 200
        assert latency < 0.5  # 500ms
        assert response.json()["processing_ms"] < 400

    async def test_concurrent_face_searches(self, client, gallery_with_faces):
        """System should handle 50 concurrent face searches."""
        embedding = [0.1] * 512

        async def search():
            return await client.post(
                f"/g/{gallery_with_faces.token}/face-search",
                json={"embedding": embedding},
            )

        responses = await asyncio.gather(*[search() for _ in range(50)])

        success_count = sum(1 for r in responses if r.status_code == 200)
        assert success_count >= 45  # Allow some rate limiting
```

### 9.6 Accessibility Tests

```typescript
// frontend/e2e/a11y-magic-links.spec.ts

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Magic Links Accessibility', () => {
  test('share dialog has no critical a11y violations', async ({ page }) => {
    await page.goto('/dashboard/galleries/test/settings');
    await page.click('[data-testid="share-button"]');

    const results = await new AxeBuilder({ page })
      .include('[data-testid="share-dialog"]')
      .analyze();

    expect(results.violations.filter(v => v.impact === 'critical')).toHaveLength(0);
  });

  test('face discovery modal is keyboard navigable', async ({ page }) => {
    await page.goto('/g/test-token');
    await page.click('[data-testid="face-discovery-button"]');

    // Tab through modal elements
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-testid="allow-camera"]')).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.locator('[data-testid="browse-instead"]')).toBeFocused();

    // Escape closes modal
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="face-consent"]')).not.toBeVisible();
  });

  test('PIN modal announces errors to screen readers', async ({ page }) => {
    await page.goto('/g/pin-protected-token');

    await page.fill('[data-testid="pin-input"]', '0000');
    await page.click('[data-testid="pin-submit"]');

    // Error should have role="alert"
    const error = page.locator('[data-testid="pin-error"]');
    await expect(error).toHaveAttribute('role', 'alert');
  });
});
```

---

## Appendix A: Frontend Type Definitions

```typescript
// frontend/src/types/magicLink.ts

export interface MagicLink {
  link_id: string;
  gallery_id: string;
  target_type: 'gallery' | 'sub_gallery' | 'photo';
  target_id: string | null;
  label: string | null;
  url: string;
  expires_at: string | null;
  max_accesses: number | null;
  access_count: number;
  status: 'active' | 'expired' | 'revoked';
  qr_preview_url: string;
  qr_config: QRConfig;
  created_at: string;
}

export interface QRConfig {
  size: number;
  color: string | null;
  logo_enabled: boolean;
  error_correction: 'L' | 'M' | 'Q' | 'H';
  label: string | null;
}

export interface CreateMagicLinkRequest {
  target_type: 'gallery' | 'sub_gallery' | 'photo';
  target_id?: string;
  label?: string;
  expires_at?: string;
  max_accesses?: number;
  qr_config?: Partial<QRConfig>;
}

export interface MagicLinkWithToken extends MagicLink {
  token: string; // Only present on creation response
}

export interface LinkStats {
  total_accesses: number;
  unique_visitors: number;
  accesses_by_day: Record<string, number>;
  top_countries: Array<{ country: string; count: number }>;
  gate_conversion: {
    email_shown: number;
    email_passed: number;
    pin_shown: number;
    pin_passed: number;
  };
}

export interface FaceSearchRequest {
  embedding: number[];
  threshold?: number;
  limit?: number;
}

export interface FaceMatch {
  asset_id: string;
  similarity: number;
  thumbnail_url: string;
  filename: string | null;
}

export interface FaceSearchResponse {
  matches: FaceMatch[];
  total_searched: number;
  processing_ms: number;
}
```

---

## Appendix B: Environment Variables

```bash
# .env additions for Magic Links

# QR Code generation
QR_CODE_CACHE_TTL=86400          # 24 hours in seconds
QR_CODE_MAX_SIZE=4096            # Max QR pixel size
QR_CODE_DEFAULT_SIZE=1024        # Default QR pixel size

# Face search
FACE_SEARCH_RATE_LIMIT=100       # Per hour per gallery per IP
FACE_SEARCH_DEFAULT_THRESHOLD=0.6
FACE_SEARCH_MAX_RESULTS=200

# Custom domains
CUSTOM_DOMAIN_VERIFICATION_TTL=3600  # 1 hour
CLOUDFLARE_ZONE_ID=                   # For SSL provisioning
CLOUDFLARE_API_TOKEN=                 # For SSL provisioning

# TensorFlow.js models
TFJS_MODEL_BASE_URL=/models           # Static file serving path
```

---

## Appendix C: Monitoring & Observability

### Metrics (Prometheus)

```
# Magic Link metrics
magic_link_created_total{workspace_id, target_type}
magic_link_accessed_total{workspace_id, status}
magic_link_validation_latency_seconds
magic_link_gate_conversion{gate_type, result}

# QR Code metrics
qr_code_generated_total{format, size_bucket}
qr_code_generation_latency_seconds
qr_code_cache_hit_total
qr_code_cache_miss_total

# Face Search metrics
face_search_total{gallery_id}
face_search_latency_seconds
face_search_matches_bucket{le="0", le="10", le="50", le="100"}
face_search_rate_limited_total
```

### Alerts

```yaml
# alerts/magic-links.yaml
groups:
  - name: magic_links
    rules:
      - alert: HighMagicLinkValidationLatency
        expr: histogram_quantile(0.95, rate(magic_link_validation_latency_seconds_bucket[5m])) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: Magic link validation p95 latency > 500ms

      - alert: FaceSearchRateLimitSpike
        expr: rate(face_search_rate_limited_total[5m]) > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: High face search rate limiting (possible abuse)

      - alert: QRCodeGenerationFailures
        expr: rate(qr_code_generation_errors_total[5m]) > 1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: QR code generation failures detected
```

---

## 10. Detailed Implementation Task Kit

This section provides granular, step-by-step implementation tasks that map existing infrastructure to avoid duplicates and ensure seamless integration.

### 10.1 Existing Infrastructure Mapping

The following components ALREADY EXIST and should be extended rather than recreated:

| Component | Location | Reuse Strategy |
|-----------|----------|----------------|
| **QRCodeService** | `backend/src/app/services/qr_service.py` | Extend with SVG/PDF export and logo embedding |
| **GalleryLinkService** | `backend/src/app/services/gallery_link_service.py` | Reference for link patterns; magic links are separate (public tokens vs. client-gallery associations) |
| **FaceDetectionService (Frontend)** | `frontend/src/services/faceDetectionService.ts` | Use for face detection; already loads face-api.js models |
| **FaceApiService (Frontend)** | `frontend/src/services/faceApiService.ts` | Use API patterns for face search integration |
| **VisitorService** | `backend/src/app/services/visitor_service.py` | Already defaults to `source="magic_link"` |
| **Face Embedding Repository** | `backend/src/app/repositories/face_embedding_repository.py` | Add gallery-scoped similarity search |
| **Face Detection Models** | `frontend/public/models/` | Already deployed; contains face_landmark_68 and face_recognition models |
| **ErrorBoundary** | `frontend/src/components/error/ErrorBoundary.tsx` | Use for new components |
| **useErrorHandler** | `frontend/src/hooks/useErrorHandler.ts` | Use for API error handling |
| **Modal** | `frontend/src/components/ui/Modal.tsx` | Use compound modal patterns (responsive sizes) |
| **PublicGalleryPage** | `frontend/src/pages/public/PublicGalleryPage.tsx` | Integrate face discovery and magic link validation |

### 10.2 Mobile-First & Responsive Patterns

All new components MUST follow these patterns already established in the codebase:

```typescript
// Use existing Modal responsive patterns (from Modal.tsx)
const sizeStyles: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',           // Default for FaceDiscovery
  lg: 'max-w-2xl',          // For ShareDialog with QR preview
  xl: 'max-w-4xl',
  full: 'max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)]',
};

// Mobile-first breakpoints (from existing components)
// - Mobile base: w-full, p-4
// - sm: (640px) Side margins, increased padding
// - md: (768px) Modal width constraints, grid columns
// - lg: (1024px) Side-by-side layouts
```

**Component-Specific Requirements:**

| Component | Mobile | Tablet | Desktop |
|-----------|--------|--------|---------|
| ShareDialog | Full-width, stacked | Side-by-side QR/links | lg:max-w-2xl, QR left |
| FaceDiscovery | Full-width, video 4:3 | Same | md:max-w-md |
| PinVerificationModal | Full-width | max-w-sm centered | Same |
| QR Download | Stacked buttons | Grid-2 | Grid-3 |

### 10.3 Error Handling Integration

All new components MUST integrate with existing error patterns:

```typescript
// 1. Wrap page-level components with ErrorBoundary
import { ErrorBoundary } from '@/components/error/ErrorBoundary';

<ErrorBoundary fallback={<GalleryErrorFallback />}>
  <MagicLinkGalleryView />
</ErrorBoundary>

// 2. Use useErrorHandler for API calls
import { useErrorHandler } from '@/hooks/useErrorHandler';

const { handleApiError, handleNetworkError } = useErrorHandler();

try {
  const result = await magicLinkService.validate(token);
} catch (error) {
  if (error instanceof NetworkError) {
    handleNetworkError(error);
  } else {
    handleApiError(error);
  }
}

// 3. Toast notifications for user feedback
import { useToast } from '@/hooks/useToast';

const { showToast } = useToast();
showToast('Link copied to clipboard', 'success');
```

### 10.4 Detailed Implementation Tasks

#### Phase 1: Database & Core Service (Week 1)

**Task 1.1: Create Migration File**
```
File: backend/migrations/versions/0031_magic_links_and_qr.py
Dependencies: 0030_gallery_settings_enhancements.py
Estimated: 1-2 hours

Steps:
1. Read existing migration 0030 to understand current schema
2. Create magic_links table:
   - link_id (UUID, PK)
   - workspace_id (UUID, FK → workspaces)
   - gallery_id (UUID, FK → galleries)
   - token_hash (VARCHAR(64), indexed, unique)
   - target_type (ENUM: gallery, sub_gallery, photo)
   - target_id (UUID, nullable)
   - label (VARCHAR(100), nullable)
   - expires_at (TIMESTAMPTZ, nullable, indexed)
   - max_accesses (INT, nullable)
   - access_count (INT, default 0)
   - status (ENUM: active, expired, revoked)
   - qr_config (JSONB)
   - created_at, updated_at
3. Create magic_link_accesses table for analytics
4. Add sharing_enabled column to galleries table
5. Create face_search_logs table (privacy-conscious)
6. Add indexes:
   - magic_links(workspace_id, gallery_id)
   - magic_links(token_hash) UNIQUE
   - magic_links(expires_at) WHERE status = 'active'
7. Run migration locally, verify schema

Verification:
- [ ] Migration runs without errors
- [ ] Rollback works correctly
- [ ] All indexes created
```

**Task 1.2: Implement MagicLinkRepository**
```
File: backend/src/app/repositories/magic_link_repository.py
Extends: BaseRepository pattern from existing repos
Estimated: 2-3 hours

Steps:
1. Study existing repository patterns (face_repository.py, gallery_repository.py)
2. Implement CRUD methods:
   - create(workspace_id, gallery_id, token_hash, ...)
   - get_by_id(link_id, workspace_id)
   - get_by_hash(token_hash) - for public validation
   - list_by_gallery(workspace_id, gallery_id, pagination)
   - update_status(link_id, workspace_id, status)
   - increment_access_count(link_id)
   - delete(link_id, workspace_id)
3. Add analytics methods:
   - get_access_stats(link_id, date_range)
   - log_access(link_id, metadata)
4. Write unit tests

Verification:
- [ ] All methods work in isolation
- [ ] Workspace scoping enforced
- [ ] Unit tests pass
```

**Task 1.3: Implement MagicLinkService**
```
File: backend/src/app/services/magic_link_service.py
Dependencies: magic_link_repository, qr_service (existing)
Estimated: 3-4 hours

Steps:
1. Study existing service patterns (gallery_link_service.py)
2. Implement token generation:
   - Use secrets.token_bytes(32) for 256-bit entropy
   - Hash with SHA-256 for storage
   - Return token only on creation (never again)
3. Implement validation:
   - Constant-time comparison via hmac.compare_digest
   - Check status, expiry, access limits
   - Verify gallery.sharing_enabled
4. Implement lifecycle management:
   - create_link(workspace_id, gallery_id, options)
   - validate_token(token) → gallery_data or error
   - revoke_link(link_id)
   - get_link_stats(link_id)
5. Integrate with existing QRCodeService for QR generation
6. Add caching for frequently accessed links

Verification:
- [ ] Token entropy is 256 bits
- [ ] Hash storage verified
- [ ] Expiry logic correct
- [ ] Rate limiting works
- [ ] Integration tests pass
```

#### Phase 2: QR Code Enhancement (Week 1-2)

**Task 2.1: Extend QRCodeService**
```
File: backend/src/app/services/qr_service.py (EXTEND, not recreate)
Estimated: 2-3 hours

Steps:
1. Read existing QRCodeService implementation
2. Add color customization:
   - Accept fill_color parameter
   - Support hex color codes
3. Add logo embedding:
   - Accept logo_url parameter
   - Download from storage
   - Center logo with white background
   - Ensure 20% max size for scannability
4. Add SVG export:
   - Use qrcode.image.svg.SvgPathImage
   - Apply color transformation
5. Add PDF export:
   - Use reportlab
   - Add crop marks option
   - Add label option
6. Maintain backward compatibility

Verification:
- [ ] Existing functionality unchanged
- [ ] PNG with logo is scannable
- [ ] SVG renders correctly
- [ ] PDF has correct margins for print
```

**Task 2.2: Add QR Endpoints**
```
File: backend/src/app/api/v1/magic_links.py
Estimated: 2-3 hours

Steps:
1. Create router with workspace auth middleware
2. Implement endpoints:
   - POST /workspaces/{w}/galleries/{g}/links - create
   - GET /workspaces/{w}/galleries/{g}/links - list
   - GET /workspaces/{w}/galleries/{g}/links/{id} - detail
   - DELETE /workspaces/{w}/galleries/{g}/links/{id} - revoke
   - GET /workspaces/{w}/galleries/{g}/links/{id}/qr?format=png&size=1024
   - GET /workspaces/{w}/galleries/{g}/links/{id}/stats
3. Add public endpoint for QR:
   - GET /g/{token}/qr - public download
4. Implement caching for QR images
5. Add rate limiting

Verification:
- [ ] Auth works correctly
- [ ] Workspace scoping enforced
- [ ] QR downloads in all formats
- [ ] Caching reduces generation calls
```

#### Phase 3: Frontend Components (Week 2-3)

**Task 3.1: Create MagicLinkService (Frontend)**
```
File: frontend/src/services/magicLinkService.ts
Pattern: Follow existing galleryService.ts patterns
Estimated: 1-2 hours

Steps:
1. Study galleryService.ts patterns
2. Implement methods:
   - createLink(workspaceId, galleryId, options)
   - listLinks(workspaceId, galleryId)
   - getLink(workspaceId, galleryId, linkId)
   - revokeLink(workspaceId, galleryId, linkId)
   - getLinkStats(workspaceId, galleryId, linkId)
   - downloadQR(workspaceId, galleryId, linkId, format)
3. Add public methods:
   - validateToken(token)
   - faceSearch(token, embedding)
4. Use existing apiClient for requests
5. Add types to frontend/src/types/magicLink.ts

Verification:
- [ ] All methods typed correctly
- [ ] Error handling follows patterns
- [ ] Works with API
```

**Task 3.2: Create ShareDialog Component**
```
File: frontend/src/components/features/gallery/ShareDialog.tsx
Pattern: Use compound Modal from ui/Modal.tsx
Estimated: 3-4 hours

Steps:
1. Study existing Modal compound pattern
2. Create responsive layout:
   - Mobile: Stacked (QR on top, links below)
   - Desktop: Side-by-side (QR left, links right)
3. Implement QR preview:
   - Show QR code image
   - Color picker for customization
   - Size selector
   - Download buttons (PNG, SVG, PDF)
4. Implement link section:
   - Copy button with feedback
   - Social share buttons (WhatsApp, Facebook, Email)
   - Link expiry indicator
5. Wrap with ErrorBoundary
6. Use useErrorHandler for API calls
7. Add keyboard navigation (Tab, Escape)
8. Add ARIA attributes

Verification:
- [ ] Responsive at all breakpoints
- [ ] Copy works on iOS and Android
- [ ] Social share opens correct apps
- [ ] Keyboard accessible
- [ ] Screen reader announces correctly
```

**Task 3.3: Create FaceDiscovery Component**
```
File: frontend/src/components/features/gallery/FaceDiscovery.tsx
Dependencies: faceDetectionService.ts (existing)
Estimated: 4-5 hours

Steps:
1. Study existing faceDetectionService.ts
2. Create state machine:
   - 'consent' → 'capture' → 'processing' → 'results' | 'error'
3. Implement consent screen:
   - Clear privacy explanation
   - Camera permission request
4. Implement capture screen:
   - Video preview with face guide overlay
   - Use getUserMedia with facingMode: 'user'
   - Responsive video container (aspect-[4/3])
5. Implement processing:
   - Use existing face-api.js models
   - Generate 128-dim descriptor
   - Show progress with steps
6. Integrate with backend face search:
   - Note: Backend uses 512-dim, may need adapter
   - Or use face-api.js's 128-dim and update backend
7. Handle errors gracefully:
   - Camera denied
   - No face detected
   - Search failed
8. Wrap with ErrorBoundary
9. Add touch-target sizing (44x44px min)
10. Test on mobile devices

Verification:
- [ ] Camera works on iOS Safari
- [ ] Camera works on Android Chrome
- [ ] Face detection accurate
- [ ] Progress updates smoothly
- [ ] Errors handled gracefully
```

**Task 3.4: Integrate into PublicGalleryPage**
```
File: frontend/src/pages/public/PublicGalleryPage.tsx (MODIFY)
Estimated: 2-3 hours

Steps:
1. Add magic link token validation route
2. Update useEffect to handle /g/{token} routes:
   - Extract token from URL
   - Call magicLinkService.validateToken
   - Handle expired/revoked states
3. Add FaceDiscovery button to header:
   - Only show if gallery has face embeddings
   - Use ScanFace icon from lucide-react
4. Implement face match filtering:
   - Store matched asset IDs in state
   - Filter grid to show only matches
   - Add "Show All" toggle
5. Show match confidence badges on photos
6. Integrate with existing PIN/email modals
7. Add analytics tracking for magic link access

Verification:
- [ ] Token validation works
- [ ] Privacy gates still work
- [ ] Face search filters correctly
- [ ] Can toggle between matched/all views
```

#### Phase 4: Face Search Backend (Week 3)

**Task 4.1: Extend Face Embedding Repository**
```
File: backend/src/app/repositories/face_embedding_repository.py (MODIFY)
Estimated: 2-3 hours

Steps:
1. Study existing repository methods
2. Add find_similar_in_gallery method:
   - Accept gallery_id, embedding, threshold, limit
   - Use pgvector cosine similarity: 1 - (vec <=> query)
   - Filter by gallery_assets join
   - Return asset_id, filename, similarity
3. Add count_in_gallery method
4. Optimize query with EXPLAIN ANALYZE
5. Add index if needed: CREATE INDEX ON face_embeddings USING ivfflat

Verification:
- [ ] Query returns correct results
- [ ] Performance < 500ms for 10k faces
- [ ] Similarity scores are accurate
```

**Task 4.2: Implement FaceSearchService**
```
File: backend/src/app/services/face_search_service.py
Estimated: 2-3 hours

Steps:
1. Implement search_by_embedding method:
   - Validate embedding dimension
   - Check rate limit (Redis)
   - Call repository
   - Log search (privacy-conscious)
2. Implement rate limiting:
   - Key: face_search_rate:{gallery_id}:{ip}
   - Limit: 100/hour
3. Privacy-conscious logging:
   - Hash embedding, never store raw
   - Store match count, top similarity
4. Add to public API:
   - POST /g/{token}/face-search
   - Validate token first
   - Return matches with thumbnails

Verification:
- [ ] Rate limiting works
- [ ] Logging doesn't leak embeddings
- [ ] Search returns correct matches
```

#### Phase 5: Testing & Polish (Week 4)

**Task 5.1: Unit Tests**
```
Files:
- backend/tests/unit/test_magic_link_service.py
- frontend/src/services/__tests__/magicLinkService.test.ts
Estimated: 3-4 hours

Steps:
1. Backend unit tests:
   - Token generation entropy
   - Hash storage
   - Expiry validation
   - Access limit enforcement
2. Frontend unit tests:
   - Service method calls
   - Error handling
   - Type validation

Verification:
- [ ] 90%+ coverage for magic_link_service
- [ ] All edge cases covered
```

**Task 5.2: Integration Tests**
```
File: backend/tests/integration/test_magic_links_api.py
Estimated: 3-4 hours

Steps:
1. Test complete flow:
   - Create link
   - Access via token
   - PIN/email gates
   - QR download
   - Face search
2. Test security:
   - Invalid tokens
   - Expired links
   - Revoked links
   - Rate limiting

Verification:
- [ ] All endpoints tested
- [ ] Security tested
- [ ] Error cases handled
```

**Task 5.3: E2E Tests**
```
File: frontend/e2e/magic-links.spec.ts
Estimated: 3-4 hours

Steps:
1. Test photographer flow:
   - Create link
   - Copy link
   - Download QR
2. Test client flow:
   - Access via link
   - Enter PIN
   - View gallery
   - Face search (mocked)

Verification:
- [ ] Happy paths work
- [ ] Error states handled
- [ ] Mobile tested
```

**Task 5.4: Accessibility Audit**
```
Files: All new components
Estimated: 2-3 hours

Steps:
1. Run Lighthouse accessibility audit
2. Fix any issues:
   - Contrast ratios
   - Focus indicators
   - ARIA labels
3. Test with screen reader (VoiceOver)
4. Test keyboard navigation

Verification:
- [ ] Lighthouse score 90+
- [ ] Screen reader works
- [ ] Keyboard navigable
```

### 10.5 Component Reuse Summary

| New Component | Reuses |
|---------------|--------|
| ShareDialog | Modal, AppButton, AppInput, Toast, ErrorBoundary |
| FaceDiscovery | Modal, AppButton, AppCard, faceDetectionService, useErrorHandler |
| MagicLinksSettings | AppCard, DataTable, AppButton, Toggle |
| FaceMatchResults | PhotoGrid, AppBadge, AppButton |

### 10.6 File Creation Checklist

**Backend (New Files):**
- [ ] `migrations/versions/0031_magic_links_and_qr.py`
- [ ] `src/app/repositories/magic_link_repository.py`
- [ ] `src/app/repositories/face_search_log_repository.py`
- [ ] `src/app/services/magic_link_service.py`
- [ ] `src/app/services/face_search_service.py`
- [ ] `src/app/api/v1/magic_links.py`
- [ ] `tests/unit/test_magic_link_service.py`
- [ ] `tests/integration/test_magic_links_api.py`

**Backend (Modify):**
- [ ] `src/app/services/qr_service.py` (extend)
- [ ] `src/app/repositories/face_embedding_repository.py` (add methods)
- [ ] `src/app/api/v1/public_galleries.py` (add endpoints)
- [ ] `src/app/api/schemas.py` (add types)

**Frontend (New Files):**
- [ ] `src/services/magicLinkService.ts`
- [ ] `src/types/magicLink.ts`
- [ ] `src/components/features/gallery/ShareDialog.tsx`
- [ ] `src/components/features/gallery/FaceDiscovery.tsx`
- [ ] `src/components/features/gallery/FaceMatchResults.tsx`
- [ ] `src/components/features/gallery/MagicLinksSettings.tsx`
- [ ] `src/components/features/gallery/LinkAnalytics.tsx`
- [ ] `e2e/magic-links.spec.ts`

**Frontend (Modify):**
- [ ] `src/pages/public/PublicGalleryPage.tsx`
- [ ] `src/pages/gallery/GallerySettingsPage.tsx`
- [ ] `src/services/galleryService.ts` (add faceSearch)

---

*Last updated: 2025-12-26*
*Version: 2.1.0*
*Authors: RawDrive Engineering Team*
