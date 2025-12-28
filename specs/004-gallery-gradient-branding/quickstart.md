# Quickstart: Gallery Gradient Branding

**Feature Branch**: `004-gallery-gradient-branding`
**Date**: 2025-12-28

## Overview

This feature replaces the solid color picker in gallery branding settings with a modern gradient selection interface featuring 20 predefined gradients and custom gradient editing.

---

## Getting Started

### 1. Switch to Feature Branch

```bash
git checkout 004-gallery-gradient-branding
```

### 2. Run Database Migration

```bash
# From project root
cd backend
DATABASE_URL="postgresql://rawdrive:rawdrive@localhost:5432/rawdrive" \
  PYTHONPATH=src alembic upgrade head
```

### 3. Start Development Servers

```bash
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev

# Terminal 3: Docker services (if not running)
npm run docker:dev:up
```

---

## Key Files to Modify

### Frontend

| File | Purpose |
|------|---------|
| `frontend/src/types/gradient.ts` | NEW: Gradient type definitions |
| `frontend/src/constants/gradientPresets.ts` | NEW: 20 predefined gradient presets |
| `frontend/src/components/features/gallery/GradientPicker.tsx` | NEW: Gradient selection grid component |
| `frontend/src/components/features/gallery/GradientEditor.tsx` | NEW: Custom gradient editor |
| `frontend/src/components/features/gallery/VisualIdentitySettings.tsx` | MODIFY: Replace color picker with gradient picker |
| `frontend/src/types/gallery.ts` | MODIFY: Add `gradient_config` to types |
| `frontend/src/utils/gradientUtils.ts` | NEW: CSS generation, contrast checking |

### Backend

| File | Purpose |
|------|---------|
| `backend/migrations/versions/00XX_add_gradient_config.py` | NEW: Migration for gradient_config column |
| `backend/src/app/api/schemas.py` | MODIFY: Add GradientConfiguration schema |
| `backend/src/app/services/gallery_service.py` | MODIFY: Handle gradient_config in CRUD |

---

## Testing the Feature

### Manual Testing Checklist

1. **Open Gallery Settings**
   - Navigate to any gallery → Settings → Branding tab
   - Verify gradient picker is displayed instead of color picker

2. **Select Preset Gradient**
   - Click on any gradient thumbnail
   - Verify selection highlight appears
   - Verify preview updates
   - Click "Save Changes"
   - Reload page and verify gradient persists

3. **Customize Gradient**
   - Click "Customize" button
   - Modify color stops
   - Change direction with slider
   - Verify live preview updates
   - Save and verify

4. **View Public Gallery**
   - Open gallery public link
   - Verify gradient appears in header/hero area
   - Test on mobile viewport

5. **Reset Gradient**
   - Click "Remove Gradient" or "Reset"
   - Verify gradient is removed
   - Save and verify

### API Testing

```bash
# Get gallery with gradient
curl -X GET \
  "http://localhost:8000/api/v1/workspaces/{workspace_id}/galleries/{gallery_id}" \
  -H "Authorization: Bearer $TOKEN"

# Update with preset gradient
curl -X PATCH \
  "http://localhost:8000/api/v1/workspaces/{workspace_id}/galleries/{gallery_id}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "gradient_config": {
      "type": "linear",
      "preset_id": "sunset-glow",
      "direction": 135,
      "colors": [
        {"color": "#FF6B6B", "position": 0},
        {"color": "#FFA502", "position": 100}
      ]
    }
  }'

# Remove gradient
curl -X PATCH \
  "http://localhost:8000/api/v1/workspaces/{workspace_id}/galleries/{gallery_id}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"gradient_config": null}'
```

---

## Component Architecture

```
GallerySettingsPanel
└── BrandingSettings
    └── VisualIdentitySettings
        ├── GradientPicker (grid of presets)
        │   ├── GradientPreview (thumbnail)
        │   └── Selected indicator
        ├── GradientEditor (customization modal)
        │   ├── ColorStopEditor
        │   ├── DirectionSlider
        │   └── LivePreview
        └── GradientPreviewPanel (shows selected gradient in context)
```

---

## Utility Functions

### Generate CSS from Gradient Config

```typescript
// frontend/src/utils/gradientUtils.ts
export function gradientToCss(config: GradientConfiguration): string {
  const colorStops = config.colors
    .map(stop => `${stop.color} ${stop.position}%`)
    .join(', ');
  return `linear-gradient(${config.direction}deg, ${colorStops})`;
}

// Usage:
const css = gradientToCss(gallery.gradient_config);
// Returns: "linear-gradient(135deg, #FF6B6B 0%, #FFA502 100%)"
```

### Check Contrast Ratio

```typescript
export function checkGradientContrast(
  config: GradientConfiguration,
  textColor: string = '#FFFFFF'
): { passes: boolean; minRatio: number } {
  // Calculate contrast at each color stop
  const ratios = config.colors.map(stop =>
    calculateContrastRatio(stop.color, textColor)
  );
  const minRatio = Math.min(...ratios);
  return {
    passes: minRatio >= 4.5, // WCAG AA for normal text
    minRatio
  };
}
```

---

## Design Tokens

Use existing RawDrive design system tokens:

```css
/* Gradient picker grid */
.gradient-picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: var(--spacing-3);
}

/* Gradient thumbnail */
.gradient-thumbnail {
  aspect-ratio: 16/9;
  border-radius: var(--radius-card);
  border: 2px solid var(--color-border);
  cursor: pointer;
  transition: all 150ms ease;
}

.gradient-thumbnail:hover {
  border-color: var(--color-accent);
  transform: scale(1.05);
}

.gradient-thumbnail.selected {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(var(--color-primary-rgb), 0.2);
}
```

---

## Common Issues

### Issue: Gradient not saving

**Cause**: `gradient_config` not added to `GalleryUpdateRequest` schema
**Fix**: Ensure backend schema includes the field

### Issue: Migration fails

**Cause**: Column already exists from previous attempt
**Fix**: Use `ADD COLUMN IF NOT EXISTS` in migration

### Issue: Preview not updating

**Cause**: React state not properly linked to preview
**Fix**: Ensure `onChange` handler passes full GradientConfiguration object

---

## Related Documentation

- [Feature Specification](./spec.md)
- [Data Model](./data-model.md)
- [API Contract](./contracts/gallery-gradient-api.yaml)
- [Research Decisions](./research.md)
