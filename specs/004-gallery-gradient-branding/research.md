# Research: Gallery Gradient Branding

**Feature Branch**: `004-gallery-gradient-branding`
**Date**: 2025-12-28

## Research Summary

This document captures research findings and decisions for implementing gradient branding in gallery settings.

---

## 1. Storage Strategy for Gradients

### Decision
Store gradient configuration as a JSONB column in the `galleries` table, replacing the current `primary_color` VARCHAR(50) field with a new `gradient_config` JSONB column.

### Rationale
- JSONB supports complex gradient definitions (multiple color stops, directions, preset references)
- Allows future extensibility (radial gradients, animation properties)
- Single column vs normalized tables reduces complexity for per-gallery customization
- PostgreSQL JSONB is well-indexed and fast for read-heavy workloads

### Alternatives Considered
| Alternative | Why Rejected |
|-------------|--------------|
| Separate `gradient_presets` table with FK | Over-engineering for 20 static presets; custom gradients need inline storage anyway |
| Store as CSS string | Less structured; harder to validate and modify programmatically |
| Keep VARCHAR and encode JSON | Type safety issues; JSONB is purpose-built for this |

---

## 2. Gradient Data Structure

### Decision
Use a structured JSON format with explicit color stops and direction:

```json
{
  "type": "linear",
  "preset_id": "sunset-glow",  // null for custom
  "direction": 135,            // degrees (0-359) or keyword
  "colors": [
    { "color": "#FF6B6B", "position": 0 },
    { "color": "#4ECDC4", "position": 100 }
  ]
}
```

### Rationale
- Explicit color stops enable full customization (position as percentage 0-100)
- Numeric direction (degrees) is more flexible than CSS keywords
- `preset_id` allows quick identification without parsing colors
- `type: "linear"` prepares for future radial gradient support

### CSS Generation
Frontend/backend converts this to CSS: `linear-gradient(135deg, #FF6B6B 0%, #4ECDC4 100%)`

---

## 3. Predefined Gradient Presets

### Decision
Define 20 gradient presets as a static constant in both frontend and backend, not in database.

### Rationale
- Presets are fixed and curated by design team
- No need for database queries to display preset grid
- Easy to version/update with code deployments
- Frontend can render instantly without API call

### Preset Categories (20 total)
1. **Warm Tones (5)**: Sunset, Coral, Peach, Fire, Amber
2. **Cool Tones (5)**: Ocean, Arctic, Twilight, Lavender, Mint
3. **Professional (5)**: Steel, Charcoal, Navy, Forest, Slate
4. **Vibrant (5)**: Neon, Candy, Electric, Aurora, Prism

---

## 4. Confirmation UX Pattern

### Decision
Integrate gradient selection into the existing gallery settings panel flow, where changes are staged until "Save Changes" is clicked.

### Rationale
- Maintains consistency with existing settings panel UX
- The original issue was lack of visual feedback on selection, not missing save button
- Panel already has "Save Changes" button at bottom (line 197-204 in GallerySettingsPanel.tsx)
- Add visual selection state + live preview to make confirmation clear

### Implementation
- Replace color picker in `VisualIdentitySettings.tsx` with gradient picker
- Selected gradient shows checkmark overlay
- Preview area shows gradient applied to mock gallery header
- Changes only saved when user clicks existing "Save Changes" button

---

## 5. Responsive Gradient Rendering

### Decision
Apply gradients via CSS background property with percentage-based positioning.

### Rationale
- CSS gradients are resolution-independent (vector, not raster)
- Browser handles all responsive behavior automatically
- No performance overhead (no image downloads)
- Works identically on mobile, tablet, desktop, 4K

### Implementation
- Apply gradient to `.gallery-header` or `.hero-section` elements
- Use `background-size: cover` if needed for consistent appearance
- Test on viewport widths: 320px, 768px, 1024px, 1440px, 2560px

---

## 6. Accessibility Considerations

### Decision
Implement contrast checking for text overlaid on gradients.

### Rationale
- WCAG 2.1 AA requires 4.5:1 contrast for normal text, 3:1 for large text
- Gradients can make text unreadable if colors are too light/saturated
- User should see warning before applying low-contrast gradient

### Implementation
- Calculate contrast ratio at multiple points along gradient
- Show warning icon if any point fails contrast check
- Suggest text shadow or overlay as mitigation
- All 20 presets pre-validated for white text readability

---

## 7. Backend API Changes

### Decision
Extend existing `PATCH /galleries/{gallery_id}` endpoint with `gradient_config` field.

### Rationale
- No new endpoints needed; follows existing update pattern
- Consistent with how `primary_color`, `font_family`, `custom_links` are handled
- Migration adds nullable `gradient_config` JSONB column
- Null means "no gradient" (fallback to workspace default or none)

### Validation
- Backend validates gradient JSON structure using Pydantic schema
- Rejects invalid color formats, out-of-range directions
- Max 5 color stops to prevent abuse

---

## 8. Migration Strategy

### Decision
Add `gradient_config` column alongside `primary_color`, then deprecate `primary_color` in future release.

### Rationale
- Non-breaking change; existing galleries continue working
- `primary_color` can be auto-migrated to simple 2-color gradient on read
- UI shows gradient picker; old color interpreted as single-color gradient
- Clean removal of `primary_color` in v2.0 after all galleries migrated

---

## Unknowns Resolved

| Unknown | Resolution |
|---------|------------|
| Storage format for gradients | JSONB column with structured schema |
| Preset management | Static constants in code, not database |
| Confirmation mechanism | Existing "Save Changes" button + visual feedback |
| Responsive approach | Pure CSS gradients, no special handling needed |
| Contrast accessibility | Client-side contrast checker with warnings |

---

## Next Steps

1. Create `data-model.md` with gradient schema
2. Define OpenAPI contract for gradient update
3. Design gradient picker component
4. Curate 20 preset gradients with hex values
