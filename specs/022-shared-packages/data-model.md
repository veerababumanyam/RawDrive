# Data Model: Shared Packages Infrastructure

**Feature**: 022-shared-packages
**Date**: 2026-01-04
**Status**: Complete

## Overview

This feature does not introduce database changes. The "data model" defines the shared type definitions that will be the single source of truth across all services.

## Type Definitions

### Package: @rawdrive/shared-types

#### Invitation Domain

```typescript
// packages/shared-types/src/invitations.ts

/**
 * Status of a digital invitation
 */
export const InvitationStatus = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
} as const;
export type InvitationStatus = typeof InvitationStatus[keyof typeof InvitationStatus];

/**
 * RSVP response status from a guest
 */
export const RSVPStatus = {
  PENDING: 'pending',
  ATTENDING: 'attending',
  NOT_ATTENDING: 'not_attending',
  MAYBE: 'maybe',
} as const;
export type RSVPStatus = typeof RSVPStatus[keyof typeof RSVPStatus];

/**
 * Type of event within an invitation
 */
export const EventType = {
  CEREMONY: 'ceremony',
  RECEPTION: 'reception',
  AFTER_PARTY: 'after_party',
  MEHNDI: 'mehndi',
  SANGEET: 'sangeet',
  HALDI: 'haldi',
  COCKTAIL: 'cocktail',
  REHEARSAL_DINNER: 'rehearsal_dinner',
  BRUNCH: 'brunch',
  OTHER: 'other',
} as const;
export type EventType = typeof EventType[keyof typeof EventType];

/**
 * Category of invitation template
 */
export const TemplateCategory = {
  WEDDING: 'wedding',
  ENGAGEMENT: 'engagement',
  BIRTHDAY: 'birthday',
  BABY_SHOWER: 'baby_shower',
  CORPORATE: 'corporate',
  RELIGIOUS: 'religious',
  OTHER: 'other',
} as const;
export type TemplateCategory = typeof TemplateCategory[keyof typeof TemplateCategory];

/**
 * Guest invitation status
 */
export const GuestStatus = {
  INVITED: 'invited',
  VIEWED: 'viewed',
  RESPONDED: 'responded',
  CHECKED_IN: 'checked_in',
} as const;
export type GuestStatus = typeof GuestStatus[keyof typeof GuestStatus];
```

#### Gallery Domain

```typescript
// packages/shared-types/src/gallery.ts

/**
 * Status of a gallery
 */
export const GalleryStatus = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
} as const;
export type GalleryStatus = typeof GalleryStatus[keyof typeof GalleryStatus];

/**
 * Download policy for gallery assets
 */
export const DownloadPolicy = {
  NONE: 'none',
  WATERMARKED: 'watermarked',
  ORIGINAL: 'original',
  BOTH: 'both',
} as const;
export type DownloadPolicy = typeof DownloadPolicy[keyof typeof DownloadPolicy];

/**
 * Theme mode for gallery display
 */
export const ThemeMode = {
  LIGHT: 'light',
  DARK: 'dark',
  AUTO: 'auto',
} as const;
export type ThemeMode = typeof ThemeMode[keyof typeof ThemeMode];

/**
 * Layout style for gallery grid
 */
export const LayoutStyle = {
  GRID: 'grid',
  MASONRY: 'masonry',
  CAROUSEL: 'carousel',
  SLIDESHOW: 'slideshow',
} as const;
export type LayoutStyle = typeof LayoutStyle[keyof typeof LayoutStyle];

/**
 * Asset processing status
 */
export const AssetStatus = {
  UPLOADING: 'uploading',
  PROCESSING: 'processing',
  AVAILABLE: 'available',
  FAILED: 'failed',
  DELETED: 'deleted',
} as const;
export type AssetStatus = typeof AssetStatus[keyof typeof AssetStatus];
```

#### Gradient Configuration

```typescript
// packages/shared-types/src/gradient.ts

/**
 * A single color stop in a gradient
 */
export interface ColorStop {
  /** Hex color value (e.g., '#FF5733') */
  color: string;
  /** Position from 0 to 100 */
  position: number;
}

/**
 * Gradient type - currently only linear supported
 */
export const GradientType = {
  LINEAR: 'linear',
} as const;
export type GradientType = typeof GradientType[keyof typeof GradientType];

/**
 * Configuration for gradient styling
 */
export interface GradientConfiguration {
  /** Type of gradient */
  type: GradientType;
  /** Reference to preset or null for custom */
  preset_id: string | null;
  /** Direction in degrees (0-360) */
  direction: number;
  /** Color stops defining the gradient */
  colors: ColorStop[];
}
```

#### Common Response Types

```typescript
// packages/shared-types/src/common.ts

/**
 * Pagination metadata for list responses
 */
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

/**
 * Standard paginated response wrapper
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

/**
 * Standard error response format
 */
export interface ErrorResponse {
  error: string;
  message: string;
  details?: Array<{
    field: string;
    message: string;
  }>;
  request_id?: string;
}

/**
 * Standard success response wrapper
 */
export interface SuccessResponse<T> {
  data: T;
  message?: string;
}
```

---

### Package: @rawdrive/shared-constants

```typescript
// packages/shared-constants/src/api.ts

/**
 * API version and base path
 */
export const API_VERSION = 'v1';
export const API_BASE = `/api/${API_VERSION}`;

/**
 * Workspace-scoped API paths
 */
export const WORKSPACE_PATHS = {
  GALLERIES: (workspaceId: string) => `${API_BASE}/workspaces/${workspaceId}/galleries`,
  ASSETS: (workspaceId: string) => `${API_BASE}/workspaces/${workspaceId}/assets`,
  UPLOADS: (workspaceId: string) => `${API_BASE}/workspaces/${workspaceId}/uploads`,
  INVITATIONS: (workspaceId: string) => `${API_BASE}/workspaces/${workspaceId}/digital-invitations`,
  FACE_GROUPS: (workspaceId: string) => `${API_BASE}/workspaces/${workspaceId}/face-groups`,
  MEMBERS: (workspaceId: string) => `${API_BASE}/workspaces/${workspaceId}/members`,
  ROLES: (workspaceId: string) => `${API_BASE}/workspaces/${workspaceId}/roles`,
} as const;

/**
 * Public API paths (no auth required)
 */
export const PUBLIC_PATHS = {
  GALLERY: (slug: string) => `${API_BASE}/public/galleries/${slug}`,
  INVITATION: (token: string) => `${API_BASE}/public/invitations/${token}`,
} as const;
```

```typescript
// packages/shared-constants/src/storage.ts

/**
 * Storage size constants
 */
export const STORAGE = {
  KB: 1024,
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
  TB: 1024 * 1024 * 1024 * 1024,
} as const;

/**
 * File size limits
 */
export const FILE_LIMITS = {
  /** Maximum photo upload size (100MB) */
  MAX_PHOTO_SIZE: 100 * STORAGE.MB,
  /** Maximum video upload size (500MB) */
  MAX_VIDEO_SIZE: 500 * STORAGE.MB,
  /** Maximum document upload size (50MB) */
  MAX_DOCUMENT_SIZE: 50 * STORAGE.MB,
  /** Maximum avatar size (5MB) */
  MAX_AVATAR_SIZE: 5 * STORAGE.MB,
} as const;

/**
 * Storage key prefixes
 */
export const STORAGE_KEYS = {
  WORKSPACE_PREFIX: 'workspaces',
  ASSETS: 'assets',
  AVATARS: 'avatars',
  INVITATIONS: 'invitations',
  THUMBNAILS: 'derived/thumbnails',
  ORIGINALS: 'original',
} as const;
```

```typescript
// packages/shared-constants/src/thresholds.ts

/**
 * AI/ML thresholds
 */
export const AI_THRESHOLDS = {
  /** Minimum confidence for face detection (0-1) */
  FACE_DETECTION_CONFIDENCE: 0.7,
  /** Minimum similarity for face clustering (0-1) */
  FACE_CLUSTERING_SIMILARITY: 0.6,
  /** Minimum confidence for auto-tagging (0-1) */
  AUTO_TAG_CONFIDENCE: 0.8,
} as const;

/**
 * Pagination defaults
 */
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

/**
 * Rate limiting
 */
export const RATE_LIMITS = {
  /** API requests per minute */
  API_REQUESTS_PER_MINUTE: 100,
  /** Auth attempts per 15 minutes */
  AUTH_ATTEMPTS_PER_15_MIN: 5,
  /** Uploads per hour per workspace */
  UPLOADS_PER_HOUR: 1000,
  /** AI operations per minute per workspace */
  AI_OPS_PER_MINUTE: 30,
} as const;
```

---

### Package: @rawdrive/shared-validation

```typescript
// packages/shared-validation/src/patterns.ts

/**
 * Validation regex patterns
 */
export const PATTERNS = {
  /** Hex color: #RGB or #RRGGBB */
  HEX_COLOR: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,

  /** UUID v4 format */
  UUID_V4: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,

  /** Email format (RFC 5322 simplified) */
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,

  /** Phone number (international format) */
  PHONE: /^\+?[1-9]\d{1,14}$/,

  /** URL (http/https) */
  URL: /^https?:\/\/[^\s/$.?#].[^\s]*$/i,

  /** Slug (lowercase alphanumeric with hyphens) */
  SLUG: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
} as const;

/**
 * Validate hex color
 */
export function isValidHexColor(value: string): boolean {
  return PATTERNS.HEX_COLOR.test(value);
}

/**
 * Validate UUID v4
 */
export function isValidUUID(value: string): boolean {
  return PATTERNS.UUID_V4.test(value);
}

/**
 * Validate email
 */
export function isValidEmail(value: string): boolean {
  return PATTERNS.EMAIL.test(value);
}
```

```typescript
// packages/shared-validation/src/schemas.ts

import { z } from 'zod';
import { PATTERNS } from './patterns';

/**
 * Hex color schema
 */
export const hexColorSchema = z.string().regex(PATTERNS.HEX_COLOR, 'Invalid hex color format');

/**
 * UUID v4 schema
 */
export const uuidSchema = z.string().uuid('Invalid UUID format');

/**
 * Email schema
 */
export const emailSchema = z.string().email('Invalid email format');

/**
 * Color stop schema for gradients
 */
export const colorStopSchema = z.object({
  color: hexColorSchema,
  position: z.number().min(0).max(100),
});

/**
 * Gradient configuration schema
 */
export const gradientConfigSchema = z.object({
  type: z.literal('linear'),
  preset_id: z.string().nullable(),
  direction: z.number().min(0).max(360),
  colors: z.array(colorStopSchema).min(2).max(10),
});

/**
 * Pagination query schema
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
```

```typescript
// packages/shared-validation/src/sanitizers.ts

/**
 * Sanitize string for XSS prevention
 * Escapes HTML entities
 */
export function sanitizeHtml(input: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };
  return input.replace(/[&<>"'/]/g, (char) => map[char]);
}

/**
 * Sanitize filename for storage
 * Removes path traversal and special characters
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .substring(0, 255);
}

/**
 * Sanitize URL path segment
 */
export function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
```

---

### Package: @rawdrive/shared-utils

```typescript
// packages/shared-utils/src/date.ts

/**
 * Format a date as relative time (e.g., "2 hours ago")
 */
export function formatRelativeDate(date: Date | string | number): string {
  const now = Date.now();
  const timestamp = new Date(date).getTime();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return `${years} year${years > 1 ? 's' : ''} ago`;
  if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`;
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'just now';
}

/**
 * Format date as ISO string (YYYY-MM-DD)
 */
export function formatDateISO(date: Date | string | number): string {
  return new Date(date).toISOString().split('T')[0];
}

/**
 * Format date with time (locale-aware)
 */
export function formatDateTime(
  date: Date | string | number,
  locale: string = 'en-US',
): string {
  return new Date(date).toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
```

```typescript
// packages/shared-utils/src/format.ts

import { STORAGE } from '@rawdrive/shared-constants';

/**
 * Format bytes as human-readable file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes < STORAGE.KB) return `${bytes} B`;
  if (bytes < STORAGE.MB) return `${(bytes / STORAGE.KB).toFixed(1)} KB`;
  if (bytes < STORAGE.GB) return `${(bytes / STORAGE.MB).toFixed(1)} MB`;
  if (bytes < STORAGE.TB) return `${(bytes / STORAGE.GB).toFixed(2)} GB`;
  return `${(bytes / STORAGE.TB).toFixed(2)} TB`;
}

/**
 * Format number with thousands separators
 */
export function formatNumber(num: number, locale: string = 'en-US'): string {
  return num.toLocaleString(locale);
}

/**
 * Format percentage
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.substring(0, maxLength - 3)}...`;
}
```

---

## Generated Python Equivalents

The following Pydantic models will be auto-generated from the TypeScript definitions:

```python
# packages/shared-types/generated/python/types.py (GENERATED - DO NOT EDIT)

from enum import StrEnum
from pydantic import BaseModel, Field
from typing import Optional, List, Generic, TypeVar

T = TypeVar('T')


class InvitationStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class RSVPStatus(StrEnum):
    PENDING = "pending"
    ATTENDING = "attending"
    NOT_ATTENDING = "not_attending"
    MAYBE = "maybe"


class EventType(StrEnum):
    CEREMONY = "ceremony"
    RECEPTION = "reception"
    AFTER_PARTY = "after_party"
    MEHNDI = "mehndi"
    SANGEET = "sangeet"
    HALDI = "haldi"
    COCKTAIL = "cocktail"
    REHEARSAL_DINNER = "rehearsal_dinner"
    BRUNCH = "brunch"
    OTHER = "other"


class GalleryStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class ColorStop(BaseModel):
    color: str = Field(..., pattern=r"^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$")
    position: float = Field(..., ge=0, le=100)


class GradientConfiguration(BaseModel):
    type: str = Field(default="linear")
    preset_id: Optional[str] = None
    direction: float = Field(..., ge=0, le=360)
    colors: List[ColorStop] = Field(..., min_length=2, max_length=10)


class PaginationMeta(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int


class PaginatedResponse(BaseModel, Generic[T]):
    data: List[T]
    pagination: PaginationMeta


class ErrorDetail(BaseModel):
    field: str
    message: str


class ErrorResponse(BaseModel):
    error: str
    message: str
    details: Optional[List[ErrorDetail]] = None
    request_id: Optional[str] = None
```

---

## Cross-Language Parity Tests

Each shared type will have a parity test ensuring TypeScript and Python produce identical JSON. Tests use fixture files to avoid shell command injection:

```typescript
// packages/shared-types/tests/parity.test.ts

import { readFileSync } from 'fs';
import { join } from 'path';
import { InvitationStatus, GradientConfiguration } from '../src';

describe('TypeScript-Python Parity', () => {
  // Fixture file generated by Python test setup
  const fixturesDir = join(__dirname, 'fixtures');

  it('InvitationStatus values match Python fixture', () => {
    const tsValues = Object.values(InvitationStatus);
    // Fixture generated by: python -c "import json; from types import InvitationStatus; print(json.dumps([e.value for e in InvitationStatus]))"
    const pyValues = JSON.parse(readFileSync(join(fixturesDir, 'invitation_status.json'), 'utf-8'));
    expect(tsValues).toEqual(pyValues);
  });

  it('GradientConfiguration serializes identically to Python fixture', () => {
    const config: GradientConfiguration = {
      type: 'linear',
      preset_id: null,
      direction: 45,
      colors: [
        { color: '#FF5733', position: 0 },
        { color: '#33FF57', position: 100 },
      ],
    };
    const tsJson = JSON.stringify(config);
    const pyJson = readFileSync(join(fixturesDir, 'gradient_config.json'), 'utf-8');

    expect(JSON.parse(tsJson)).toEqual(JSON.parse(pyJson));
  });
});
```

```python
# packages/shared-types/tests/generate_fixtures.py
# Run this script to generate test fixtures for cross-language parity tests

import json
from pathlib import Path
from generated.python.types import InvitationStatus, GradientConfiguration, ColorStop

fixtures_dir = Path(__file__).parent / "fixtures"
fixtures_dir.mkdir(exist_ok=True)

# Generate InvitationStatus fixture
with open(fixtures_dir / "invitation_status.json", "w") as f:
    json.dump([e.value for e in InvitationStatus], f)

# Generate GradientConfiguration fixture
config = GradientConfiguration(
    type="linear",
    preset_id=None,
    direction=45,
    colors=[
        ColorStop(color="#FF5733", position=0),
        ColorStop(color="#33FF57", position=100),
    ]
)
with open(fixtures_dir / "gradient_config.json", "w") as f:
    f.write(config.model_dump_json())

print(f"Generated fixtures in {fixtures_dir}")
```

---

## Migration Notes

### Existing Type Locations (to be deprecated)

| Type | Current Location | New Location |
|------|------------------|--------------|
| InvitationStatus | frontend/src/types/invitations.ts | @rawdrive/shared-types |
| InvitationStatus | backend/src/app/api/invitation_schemas.py | generated from shared-types |
| InvitationStatus | services/invitations-service/src/schemas/guest.py | generated from shared-types |
| GalleryStatus | frontend/src/types/gallery.ts | @rawdrive/shared-types |
| GalleryStatus | backend/src/app/api/schemas.py | generated from shared-types |
| ColorStop | frontend/src/types/gradient.ts | @rawdrive/shared-types |
| ColorStop | backend/src/app/api/schemas.py | generated from shared-types |
| API_BASE | frontend/src/constants/api.ts | @rawdrive/shared-constants |
| STORAGE.GB | frontend/src/constants/gallery.ts | @rawdrive/shared-constants |
| hexColorSchema | frontend/src/validation/profileEditor.ts | @rawdrive/shared-validation |
| formatRelativeDate | frontend/src/utils/date.ts | @rawdrive/shared-utils |

All existing locations will re-export from shared packages during migration to maintain backward compatibility.
