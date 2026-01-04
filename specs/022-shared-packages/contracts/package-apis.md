# Package API Contracts

**Feature**: 022-shared-packages
**Date**: 2026-01-04

## Overview

This document defines the public API contracts for each shared package. These contracts are versioned and follow semantic versioning - breaking changes require a major version bump.

---

## @rawdrive/shared-types

**Version**: 1.0.0
**Stability**: Stable

### Exports

```typescript
// Invitation Domain
export { InvitationStatus } from './invitations';
export type { InvitationStatus } from './invitations';

export { RSVPStatus } from './invitations';
export type { RSVPStatus } from './invitations';

export { EventType } from './invitations';
export type { EventType } from './invitations';

export { TemplateCategory } from './invitations';
export type { TemplateCategory } from './invitations';

export { GuestStatus } from './invitations';
export type { GuestStatus } from './invitations';

// Gallery Domain
export { GalleryStatus } from './gallery';
export type { GalleryStatus } from './gallery';

export { DownloadPolicy } from './gallery';
export type { DownloadPolicy } from './gallery';

export { ThemeMode } from './gallery';
export type { ThemeMode } from './gallery';

export { LayoutStyle } from './gallery';
export type { LayoutStyle } from './gallery';

export { AssetStatus } from './gallery';
export type { AssetStatus } from './gallery';

// Gradient Configuration
export { GradientType } from './gradient';
export type { GradientType } from './gradient';

export type { ColorStop, GradientConfiguration } from './gradient';

// Common Response Types
export type {
  PaginationMeta,
  PaginatedResponse,
  ErrorResponse,
  SuccessResponse,
} from './common';
```

### Usage Contract

```typescript
// Import types
import { InvitationStatus, GalleryStatus } from '@rawdrive/shared-types';
import type { GradientConfiguration, ColorStop } from '@rawdrive/shared-types';

// Use const objects for runtime values
const status = InvitationStatus.DRAFT; // 'draft'
const allStatuses = Object.values(InvitationStatus); // ['draft', 'published', ...]

// Use types for type annotations
function updateGradient(config: GradientConfiguration): void { /* ... */ }
```

### Breaking Change Policy

| Change Type | Version Impact | Example |
|-------------|----------------|---------|
| Add new enum value | Minor | Add `PAUSED` to `InvitationStatus` |
| Add new interface field (optional) | Minor | Add `metadata?: object` to `ColorStop` |
| Remove enum value | Major | Remove `CANCELLED` from `InvitationStatus` |
| Rename enum value | Major | Rename `draft` to `unpublished` |
| Change interface field type | Major | Change `position: number` to `position: string` |
| Add required interface field | Major | Add `id: string` to `ColorStop` |

---

## @rawdrive/shared-constants

**Version**: 1.0.0
**Stability**: Stable

### Exports

```typescript
// API Configuration
export { API_VERSION, API_BASE } from './api';
export { WORKSPACE_PATHS, PUBLIC_PATHS } from './api';

// Storage
export { STORAGE, FILE_LIMITS, STORAGE_KEYS } from './storage';

// Thresholds & Limits
export { AI_THRESHOLDS, PAGINATION, RATE_LIMITS } from './thresholds';
```

### Usage Contract

```typescript
import { API_BASE, WORKSPACE_PATHS, STORAGE, PAGINATION } from '@rawdrive/shared-constants';

// Use constants directly
const url = `${API_BASE}/auth/login`;

// Use path builders
const galleriesUrl = WORKSPACE_PATHS.GALLERIES('workspace-123');
// → '/api/v1/workspaces/workspace-123/galleries'

// Use storage conversions
const maxSize = 100 * STORAGE.MB; // 104857600

// Use pagination defaults
const query = { page: PAGINATION.DEFAULT_PAGE, limit: PAGINATION.DEFAULT_LIMIT };
```

### Breaking Change Policy

| Change Type | Version Impact | Example |
|-------------|----------------|---------|
| Add new constant | Minor | Add `MAX_BATCH_SIZE` |
| Change constant value | Major | Change `API_VERSION` from `v1` to `v2` |
| Remove constant | Major | Remove `STORAGE.TB` |
| Rename constant | Major | Rename `API_BASE` to `API_ROOT` |

---

## @rawdrive/shared-validation

**Version**: 1.0.0
**Stability**: Stable

### Exports

```typescript
// Regex Patterns
export { PATTERNS } from './patterns';

// Validation Functions
export {
  isValidHexColor,
  isValidUUID,
  isValidEmail,
} from './patterns';

// Zod Schemas
export {
  hexColorSchema,
  uuidSchema,
  emailSchema,
  colorStopSchema,
  gradientConfigSchema,
  paginationSchema,
} from './schemas';

// Sanitizers
export {
  sanitizeHtml,
  sanitizeFilename,
  sanitizeSlug,
} from './sanitizers';
```

### Usage Contract

```typescript
import {
  PATTERNS,
  isValidHexColor,
  hexColorSchema,
  sanitizeHtml,
} from '@rawdrive/shared-validation';

// Use patterns directly
const isHex = PATTERNS.HEX_COLOR.test('#FF5733'); // true

// Use validation functions
if (!isValidHexColor(userInput)) {
  throw new Error('Invalid color');
}

// Use Zod schemas
const result = hexColorSchema.safeParse(userInput);
if (!result.success) {
  console.error(result.error.issues);
}

// Use sanitizers
const safeHtml = sanitizeHtml('<script>alert("xss")</script>');
// → '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
```

### Breaking Change Policy

| Change Type | Version Impact | Example |
|-------------|----------------|---------|
| Add new pattern | Minor | Add `PATTERNS.CREDIT_CARD` |
| Add new validator function | Minor | Add `isValidPhone()` |
| Add new Zod schema | Minor | Add `phoneSchema` |
| Change pattern behavior | Major | Make email pattern stricter |
| Remove pattern/function | Major | Remove `isValidEmail` |
| Change function signature | Major | Add required parameter |

---

## @rawdrive/shared-utils

**Version**: 1.0.0
**Stability**: Stable

### Exports

```typescript
// Date Utilities
export {
  formatRelativeDate,
  formatDateISO,
  formatDateTime,
} from './date';

// Format Utilities
export {
  formatFileSize,
  formatNumber,
  formatPercentage,
  truncate,
} from './format';
```

### Usage Contract

```typescript
import {
  formatRelativeDate,
  formatFileSize,
  truncate,
} from '@rawdrive/shared-utils';

// Format relative dates
const relative = formatRelativeDate(new Date('2026-01-03')); // '1 day ago'

// Format file sizes
const size = formatFileSize(1073741824); // '1.00 GB'

// Truncate strings
const short = truncate('Hello World', 8); // 'Hello...'
```

### Breaking Change Policy

| Change Type | Version Impact | Example |
|-------------|----------------|---------|
| Add new utility function | Minor | Add `formatCurrency()` |
| Change output format | Major | Change '2 hours ago' to '2h ago' |
| Remove function | Major | Remove `formatDateTime` |
| Change function signature | Major | Make `locale` required |

---

## Python Interoperability Contract

All TypeScript types with corresponding Python equivalents must satisfy:

1. **Enum Value Parity**: Python `StrEnum` values must exactly match TypeScript const object values
2. **JSON Serialization Parity**: `JSON.stringify(tsValue)` must equal `pydantic_model.model_dump_json()`
3. **Validation Parity**: Regex patterns must accept/reject identical inputs in both languages

### Verification

```bash
# CI runs parity tests on every PR
pnpm test:parity
```

Test failures block merging to ensure cross-language consistency.

---

## Deprecation Policy

1. **Deprecation Notice**: Add `@deprecated` JSDoc tag, keep functionality
2. **Migration Period**: Minimum 2 release cycles (typically 4-6 weeks)
3. **Removal**: Remove in next major version

Example:

```typescript
/**
 * @deprecated Use `InvitationStatus.DRAFT` instead. Will be removed in v2.0.0.
 */
export const INVITATION_STATUS_DRAFT = 'draft';
```
