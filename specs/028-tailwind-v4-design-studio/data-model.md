# Data Model: Tailwind v4 Upgrade & Gallery Design Studio

**Branch**: `028-tailwind-v4-design-studio`
**Date**: 2026-01-22
**Status**: Complete

---

## Overview

This feature is primarily a frontend infrastructure upgrade with UI component additions. The data model focuses on the **client-side state** for the Design Studio rather than new database entities, as the backend entities (`GalleryDesignConfig`) already exist.

---

## Existing Entities (Reference)

These entities are already defined and stored in the database. No schema changes required.

### GalleryDesignConfig (Persisted)

```typescript
interface GalleryDesignConfig {
  cover: CoverConfig;
  typography: TypographyConfig;
  theme: ThemeConfig;
  grid: GridConfig;
}
```

**Storage**: PostgreSQL via gallery-service, linked to Gallery entity by `gallery_id`

---

## Client-Side State Models

### DesignDraftState

**Purpose**: Manages unsaved changes and edit history in the Design Studio

```typescript
interface DesignDraftState {
  // Current configuration being edited
  config: GalleryDesignConfig;

  // Edit state tracking
  isDirty: boolean;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  publishStatus: 'idle' | 'publishing' | 'published' | 'error';
  lastSavedAt: Date | null;
  error?: string;
}
```

**Location**: `frontend/src/types/gallery-design.ts` (already defined)
**Hook**: `useDesignDraft.ts` (already implemented)

---

### DesignHistoryState

**Purpose**: Tracks undo/redo capability for design edits

```typescript
interface DesignHistoryState {
  canUndo: boolean;
  canRedo: boolean;
  historySize: number;
}
```

**Location**: `frontend/src/types/gallery-design.ts` (already defined)
**Implementation**: Part of `useDesignDraft` hook

---

### ThemeEngineState

**Purpose**: Runtime state for theme preview application

```typescript
interface ThemeEngineState {
  activeThemeId: ThemeId;
  activeMode: ThemeMode;
  accentOverride?: string;
  cleanupFn: (() => void) | null;
}
```

**Location**: NEW - Internal to `ThemeEngine.ts` utility

**Validation Rules**:
- `activeThemeId` must be one of 9 valid ThemeId values
- `activeMode` must be 'light' | 'dark' | 'system'
- `accentOverride` must be valid hex color or undefined

---

### ViewportMode

**Purpose**: Tracks the preview viewport simulation state

```typescript
interface ViewportMode {
  type: 'mobile' | 'tablet' | 'desktop';
  width?: number;   // For custom width override
  height?: number;  // Optional height constraint
}
```

**Location**: `frontend/src/pages/workspace/GalleryDesignStudioPage.tsx` (partially defined)

**Validation Rules**:
- `type` must be one of the three preset values
- `width` must be positive integer if provided
- Common presets: mobile=375px, tablet=768px, desktop=full-width

---

## Theme Data Structure

### GalleryTheme (Static Configuration)

**Purpose**: Defines a complete color theme with light/dark mode variants

```typescript
interface GalleryTheme {
  id: ThemeId;                          // 'brand' | 'gold' | ... 9 total
  name: string;                         // Display name
  description: string;                  // Theme description
  light: GalleryThemeTokens;           // Light mode colors
  dark: GalleryThemeTokens;            // Dark mode colors
  accentSwatches: GalleryThemeAccentSwatch[];  // 5 accent color options
  preview?: {
    gradient?: string;
    thumbnail: string;
  };
}
```

**Location**: `frontend/src/constants/galleryThemes.ts` (already defined with all 9 themes)

---

### GalleryThemeTokens

**Purpose**: Semantic color tokens for a single theme mode

```typescript
interface GalleryThemeTokens {
  bgPrimary: string;        // Main background
  bgSecondary: string;      // Secondary background
  bgTertiary: string;       // Tertiary/accent background
  textPrimary: string;      // Primary text color
  textSecondary: string;    // Secondary text color
  textTertiary: string;     // Muted text color
  accentPrimary: string;    // Primary accent/brand color
  accentSecondary: string;  // Secondary accent color
  borderDefault: string;    // Default border color
  borderHover: string;      // Hover border color
}
```

**CSS Variable Mapping**:
| Property | CSS Variable |
|----------|--------------|
| `bgPrimary` | `--bg-primary` |
| `bgSecondary` | `--bg-secondary` |
| `textPrimary` | `--text-primary` |
| `accentPrimary` | `--accent-primary` |
| `borderDefault` | `--border-default` |

---

## Cover Style Data Structure

### CoverStyleMetadata (Static Configuration)

**Purpose**: Defines metadata for a cover style variant

```typescript
interface CoverStyleMetadata {
  id: CoverStyleId;                               // 28 style IDs
  name: string;                                   // Display name
  description: string;                            // Style description
  category: 'basic' | 'text' | 'advanced' | 'premium';
  thumbnail: string;                              // Preview image path
  premium: boolean;                               // Requires paid plan
}
```

**Location**: `frontend/src/constants/coverStyleCatalog.ts` (already defined with all 28 styles)

**Statistics**:
- Basic: 3 styles (free)
- Text: 8 styles (free)
- Advanced: 5 styles (free)
- Premium: 12 styles (paid)
- Total: 28 styles

---

## CSS Configuration Model (Tailwind v4)

### @theme Block Structure

**Purpose**: Defines how design tokens are organized in the CSS-first configuration

```css
@theme {
  /* Color Scales */
  --color-primary-*: /* 50-950 scale */
  --color-accent-*: /* 50-950 scale */
  --color-gold-*: /* 50-950 scale */
  --color-neutral-*: /* 50-950 scale */

  /* Semantic Colors */
  --color-background: /* value */
  --color-surface: /* value */
  --color-text-primary: /* value */
  --color-border: /* value */

  /* Typography */
  --font-sans: /* font stack */
  --font-serif: /* font stack */
  --font-mono: /* font stack */

  /* Spacing Extensions */
  --spacing-4_5: 1.125rem;
  --spacing-5_5: 1.375rem;
  /* ... additional spacing values ... */

  /* Border Radius */
  --radius-button: /* value */
  --radius-input: /* value */
  --radius-card: /* value */
  --radius-modal: /* value */

  /* Shadows */
  --shadow-card: /* value */
  --shadow-card-hover: /* value */
  --shadow-primary: /* value */

  /* Z-Index */
  --z-dropdown: /* value */
  --z-modal: /* value */
  --z-tooltip: /* value */

  /* Layout */
  --sidebar-width: /* value */
  --header-height: /* value */

  /* Animations */
  --ease-out: /* timing function */
  --ease-bounce: /* timing function */
}
```

---

## Entity Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                        Design Studio                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐      ┌──────────────────┐                  │
│  │ DesignDraftState│──────│GalleryDesignConfig│                  │
│  │ (client state)  │      │ (persisted)       │                  │
│  └─────────────────┘      └──────────────────┘                  │
│          │                        │                              │
│          │                        ▼                              │
│          │              ┌──────────────────┐                     │
│          │              │    ThemeConfig   │                     │
│          │              │  ├─ ThemeId      │                     │
│          │              │  ├─ ThemeMode    │                     │
│          │              │  └─ accentOverride│                    │
│          │              └──────────────────┘                     │
│          │                        │                              │
│          ▼                        ▼                              │
│  ┌─────────────────┐      ┌──────────────────┐                  │
│  │ ThemeEngine     │──────│ GalleryTheme     │                  │
│  │ (runtime)       │      │ (static data)    │                  │
│  └─────────────────┘      │  ├─ light tokens │                  │
│          │                │  ├─ dark tokens  │                  │
│          │                │  └─ swatches     │                  │
│          ▼                └──────────────────┘                  │
│  ┌─────────────────┐                                            │
│  │ Preview Canvas  │                                            │
│  │ (CSS variables  │                                            │
│  │  applied here)  │                                            │
│  └─────────────────┘                                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Validation Rules Summary

| Entity | Field | Rule |
|--------|-------|------|
| ThemeConfig | id | Must be valid ThemeId (9 options) |
| ThemeConfig | mode | Must be 'light' \| 'dark' \| 'system' |
| ThemeConfig | accentOverride | Valid hex color or undefined |
| CoverConfig | style | Must be valid CoverStyleId (28 options) |
| CoverConfig | focalPoint.x | 0 <= x <= 100 |
| CoverConfig | focalPoint.y | 0 <= y <= 100 |
| CoverConfig | overlayOpacity | 0 <= opacity <= 1 |
| GridConfig | style | 'vertical' \| 'horizontal' |
| GridConfig | size | 'sm' \| 'md' \| 'lg' |
| GridConfig | spacing | 'sm' \| 'md' \| 'lg' |

---

## State Transitions

### DesignDraftState Transitions

```
                    ┌──────────┐
                    │   idle   │
                    └────┬─────┘
                         │ User makes change
                         ▼
                    ┌──────────┐
       ┌───────────│  dirty   │───────────┐
       │           └────┬─────┘           │
       │ Auto-save      │ Publish         │ Error
       │ triggers       │ clicked         │
       ▼                ▼                 ▼
┌──────────┐     ┌────────────┐     ┌──────────┐
│  saving  │     │ publishing │     │  error   │
└────┬─────┘     └─────┬──────┘     └────┬─────┘
     │                 │                 │
     │ Success         │ Success         │ Retry
     ▼                 ▼                 │
┌──────────┐     ┌────────────┐          │
│  saved   │     │ published  │◄─────────┘
└──────────┘     └────────────┘
```

---

## No Database Migrations Required

This feature does not require database schema changes because:

1. **GalleryDesignConfig** already exists in the database
2. **All theme/cover data** is static configuration stored in TypeScript constants
3. **Draft state** is managed client-side with localStorage persistence
4. **Tailwind configuration** is build-time only, not runtime data

**Note**: If future features require persisting additional design metadata (e.g., user-created themes), a migration would be needed at that time.
