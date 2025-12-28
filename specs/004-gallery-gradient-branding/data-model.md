# Data Model: Gallery Gradient Branding

**Feature Branch**: `004-gallery-gradient-branding`
**Date**: 2025-12-28

## Entity Overview

```
┌─────────────────────┐
│     galleries       │
├─────────────────────┤
│ ...existing fields  │
│ gradient_config     │──────► JSONB (GradientConfiguration)
│ primary_color       │ (deprecated, read-only for migration)
└─────────────────────┘

┌─────────────────────────────────────────────────────────┐
│               GradientConfiguration (JSONB)             │
├─────────────────────────────────────────────────────────┤
│ type: "linear"                                          │
│ preset_id: string | null                                │
│ direction: number (0-359)                               │
│ colors: ColorStop[]                                     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                    ColorStop                            │
├─────────────────────────────────────────────────────────┤
│ color: string (hex: #RRGGBB)                            │
│ position: number (0-100 percentage)                     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│              GradientPreset (static, in-code)           │
├─────────────────────────────────────────────────────────┤
│ id: string                                              │
│ name: string                                            │
│ category: "warm" | "cool" | "professional" | "vibrant"  │
│ config: GradientConfiguration                           │
└─────────────────────────────────────────────────────────┘
```

---

## Database Schema Changes

### Migration: Add gradient_config column

```sql
-- Migration: 00XX_add_gradient_config.py

ALTER TABLE galleries
ADD COLUMN IF NOT EXISTS gradient_config JSONB;

COMMENT ON COLUMN galleries.gradient_config IS
'JSON configuration for gallery header/hero gradient. Schema: {type, preset_id, direction, colors[]}';

-- Add GIN index for potential JSON queries
CREATE INDEX IF NOT EXISTS idx_galleries_gradient_preset
ON galleries USING GIN ((gradient_config->'preset_id'));
```

### Validation Constraints (Application-Level)

| Field | Constraint |
|-------|------------|
| `type` | Must be `"linear"` (extensible to `"radial"` later) |
| `preset_id` | If present, must match known preset ID |
| `direction` | Integer 0-359 (degrees) |
| `colors` | Array of 2-5 ColorStop objects |
| `colors[].color` | Valid hex color `#RRGGBB` or `#RGB` |
| `colors[].position` | Integer 0-100 |

---

## TypeScript Types

### Frontend Types (`frontend/src/types/gradient.ts`)

```typescript
/**
 * Color stop within a gradient
 */
export interface ColorStop {
  /** Hex color code (#RRGGBB or #RGB) */
  color: string;
  /** Position as percentage (0-100) */
  position: number;
}

/**
 * Complete gradient configuration
 */
export interface GradientConfiguration {
  /** Gradient type (linear only for v1) */
  type: 'linear';
  /** Reference to predefined preset, null for custom */
  preset_id: string | null;
  /** Direction in degrees (0 = to top, 90 = to right, 180 = to bottom) */
  direction: number;
  /** Array of color stops (2-5 stops) */
  colors: ColorStop[];
}

/**
 * Predefined gradient preset (static data)
 */
export interface GradientPreset {
  /** Unique preset identifier */
  id: string;
  /** Display name */
  name: string;
  /** Category for organization */
  category: 'warm' | 'cool' | 'professional' | 'vibrant';
  /** Full gradient configuration */
  config: GradientConfiguration;
}

/**
 * Gradient preset categories
 */
export type GradientCategory = 'warm' | 'cool' | 'professional' | 'vibrant';
```

### Updates to Existing Types

```typescript
// frontend/src/types/gallery.ts - Add to GalleryDetailData
export interface GalleryDetailData {
  // ... existing fields ...
  primary_color?: string;        // Deprecated, kept for migration
  gradient_config?: GradientConfiguration | null;  // NEW
  font_family?: string;
  // ...
}

// frontend/src/types/gallery.ts - Add to GalleryUpdateRequest
export interface GalleryUpdateRequest {
  // ... existing fields ...
  primary_color?: string | null;           // Deprecated
  gradient_config?: GradientConfiguration | null;  // NEW
  font_family?: string | null;
  // ...
}
```

---

## Python Types (Backend)

### Pydantic Schemas (`backend/src/app/api/schemas.py`)

```python
from pydantic import BaseModel, Field, field_validator
from typing import Optional, Literal
import re

class ColorStop(BaseModel):
    """Single color stop in a gradient."""
    color: str = Field(..., description="Hex color code (#RRGGBB or #RGB)")
    position: int = Field(..., ge=0, le=100, description="Position as percentage")

    @field_validator('color')
    @classmethod
    def validate_hex_color(cls, v: str) -> str:
        if not re.match(r'^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$', v):
            raise ValueError('Invalid hex color format')
        return v.upper()

class GradientConfiguration(BaseModel):
    """Complete gradient configuration."""
    type: Literal['linear'] = Field('linear', description="Gradient type")
    preset_id: Optional[str] = Field(None, max_length=50, description="Preset reference")
    direction: int = Field(135, ge=0, lt=360, description="Direction in degrees")
    colors: list[ColorStop] = Field(..., min_length=2, max_length=5)

# Add to GalleryUpdateRequest
class GalleryUpdateRequest(BaseModel):
    # ... existing fields ...
    gradient_config: Optional[GradientConfiguration] = None
    # ...

# Add to GalleryDetailResponse
class GalleryDetailResponse(BaseModel):
    # ... existing fields ...
    gradient_config: Optional[dict] = None  # Returns raw JSONB
    # ...
```

---

## Predefined Gradient Presets (Static Data)

### Preset Definition (`frontend/src/constants/gradientPresets.ts`)

```typescript
import type { GradientPreset } from '../types/gradient';

export const GRADIENT_PRESETS: GradientPreset[] = [
  // === WARM TONES ===
  {
    id: 'sunset-glow',
    name: 'Sunset Glow',
    category: 'warm',
    config: {
      type: 'linear',
      preset_id: 'sunset-glow',
      direction: 135,
      colors: [
        { color: '#FF6B6B', position: 0 },
        { color: '#FFA502', position: 100 }
      ]
    }
  },
  {
    id: 'coral-reef',
    name: 'Coral Reef',
    category: 'warm',
    config: {
      type: 'linear',
      preset_id: 'coral-reef',
      direction: 90,
      colors: [
        { color: '#FF7675', position: 0 },
        { color: '#D63031', position: 100 }
      ]
    }
  },
  // ... (18 more presets - full list in implementation)

  // === COOL TONES ===
  {
    id: 'ocean-breeze',
    name: 'Ocean Breeze',
    category: 'cool',
    config: {
      type: 'linear',
      preset_id: 'ocean-breeze',
      direction: 135,
      colors: [
        { color: '#4ECDC4', position: 0 },
        { color: '#44A3FF', position: 100 }
      ]
    }
  },
  // ...

  // === PROFESSIONAL ===
  {
    id: 'steel-gray',
    name: 'Steel Gray',
    category: 'professional',
    config: {
      type: 'linear',
      preset_id: 'steel-gray',
      direction: 180,
      colors: [
        { color: '#2C3E50', position: 0 },
        { color: '#4A5568', position: 100 }
      ]
    }
  },
  // ...

  // === VIBRANT ===
  {
    id: 'neon-nights',
    name: 'Neon Nights',
    category: 'vibrant',
    config: {
      type: 'linear',
      preset_id: 'neon-nights',
      direction: 135,
      colors: [
        { color: '#A855F7', position: 0 },
        { color: '#EC4899', position: 50 },
        { color: '#F97316', position: 100 }
      ]
    }
  },
  // ...
];
```

---

## State Transitions

### Gradient Configuration States

```
┌─────────────────┐
│  No Gradient    │ ◄── Initial state (gradient_config = null)
│  (null/empty)   │
└────────┬────────┘
         │ User selects preset
         ▼
┌─────────────────┐
│  Preset Active  │ ◄── gradient_config.preset_id = "sunset-glow"
│                 │
└────────┬────────┘
         │ User clicks "Customize"
         ▼
┌─────────────────┐
│ Custom Editing  │ ◄── gradient_config.preset_id = null
│                 │     (colors/direction modified)
└────────┬────────┘
         │ User clicks "Apply"
         ▼
┌─────────────────┐
│  Custom Active  │ ◄── gradient_config saved with null preset_id
│                 │
└─────────────────┘
         │ User clicks "Reset"
         ▼
┌─────────────────┐
│  No Gradient    │ ◄── gradient_config = null
└─────────────────┘
```

---

## Migration Path

### Existing Data Migration

For galleries with `primary_color` but no `gradient_config`:

```python
# Migration helper function
def migrate_primary_color_to_gradient(primary_color: str) -> dict:
    """Convert legacy primary_color to gradient config."""
    return {
        "type": "linear",
        "preset_id": None,
        "direction": 135,
        "colors": [
            {"color": primary_color, "position": 0},
            {"color": primary_color, "position": 100}  # Single color = solid
        ]
    }
```

### Read Logic

```python
# In gallery_service.py get_gallery_detail
if row.get("gradient_config"):
    gradient = row["gradient_config"]
elif row.get("primary_color"):
    # Legacy migration: treat as solid color
    gradient = migrate_primary_color_to_gradient(row["primary_color"])
else:
    gradient = None
```

---

## Validation Rules Summary

| Entity | Field | Rule |
|--------|-------|------|
| GradientConfiguration | type | Must be `"linear"` |
| GradientConfiguration | direction | 0-359 integer |
| GradientConfiguration | colors | 2-5 ColorStop objects |
| GradientConfiguration | preset_id | Nullable, max 50 chars |
| ColorStop | color | Valid hex (#RGB or #RRGGBB) |
| ColorStop | position | 0-100 integer |

---

## Indexes and Performance

| Index | Purpose |
|-------|---------|
| `idx_galleries_gradient_preset` | Fast lookup by preset_id for analytics |

*Note: No heavy querying expected on gradient data. Primary use is per-gallery read/write.*
