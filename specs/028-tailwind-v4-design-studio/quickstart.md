# Quickstart: Tailwind v4 Upgrade & Gallery Design Studio

**Branch**: `028-tailwind-v4-design-studio`
**Date**: 2026-01-22

---

## Prerequisites

- Node.js 20+ (required for Tailwind v4 upgrade tool)
- pnpm (workspace package manager)
- Git (for branch management)

---

## Quick Setup

```bash
# 1. Checkout the feature branch
git checkout 028-tailwind-v4-design-studio

# 2. Install dependencies (includes new Tailwind v4 packages)
cd frontend
pnpm install

# 3. Start development server
pnpm dev
```

---

## Feature Access

### Design Studio
1. Log in with test credentials: `free@test.rawdrive.in` / `Test@123`
2. Navigate to **Galleries** in the sidebar
3. Select any gallery you own
4. Click the **"Design"** button in the gallery toolbar
5. Design Studio opens at `/workspace/galleries/:id/design`

### Theme Switching
1. In Design Studio, look at the **Theme** section in the left panel
2. Click any theme swatch to see real-time preview changes
3. Toggle light/dark mode with the mode selector

### Container Query Preview
1. Use the viewport buttons (📱 🖥️) in the top toolbar
2. Or drag the preview panel divider to resize
3. Preview content adapts to container size, not window size

---

## Key Files

### Tailwind v4 Migration Files

| File | Purpose |
|------|---------|
| `frontend/vite.config.ts` | Vite plugin configuration |
| `frontend/src/index.css` | CSS-first configuration with @theme block |
| `frontend/package.json` | Updated dependencies |

### Design Studio Components

| File | Purpose |
|------|---------|
| `frontend/src/pages/workspace/GalleryDesignStudioPage.tsx` | Main page component |
| `frontend/src/components/features/gallery/design/DesignControlsPanel.tsx` | Left sidebar controls |
| `frontend/src/components/features/gallery/design/DesignPreviewCanvas.tsx` | Right preview canvas |
| `frontend/src/utils/themeUtils.ts` | Theme application utilities |

### Configuration Constants

| File | Purpose |
|------|---------|
| `frontend/src/constants/galleryThemes.ts` | 9 theme definitions |
| `frontend/src/constants/coverStyleCatalog.ts` | 28 cover style metadata |
| `frontend/src/types/gallery-design.ts` | TypeScript types |

---

## Development Commands

```bash
# Run frontend dev server
cd frontend && pnpm dev

# Run frontend tests
cd frontend && pnpm test

# Build for production (validates Tailwind migration)
cd frontend && pnpm build

# Run type checking
cd frontend && npx tsc --noEmit

# Lint check
cd frontend && pnpm lint
```

---

## Verification Checklist

### After Tailwind v4 Migration

- [ ] `pnpm build` completes without errors
- [ ] `pnpm test` passes all existing tests
- [ ] Dashboard page looks identical to before migration
- [ ] Gallery list page looks identical to before migration
- [ ] Dark mode toggle works correctly
- [ ] Glass effects render correctly on modals
- [ ] Gradient buttons display properly
- [ ] Custom shadows render correctly

### Design Studio Features

- [ ] Design Studio loads within 2 seconds
- [ ] Theme selector shows 9 theme options
- [ ] Clicking a theme updates preview instantly (< 100ms)
- [ ] Light/dark mode toggle works in preview
- [ ] Mobile viewport simulation works
- [ ] Cover style selection updates preview
- [ ] Publish button saves design configuration

---

## Troubleshooting

### Build Fails After Migration

```bash
# Clear node_modules and reinstall
rm -rf node_modules
pnpm install

# Clear Vite cache
rm -rf node_modules/.vite

# Rebuild
pnpm build
```

### CSS Variables Not Applying

1. Check that `@import "tailwindcss";` is at the top of `index.css`
2. Verify `@theme` block syntax (no trailing commas)
3. Ensure Vite plugin is configured in `vite.config.ts`

### Container Queries Not Working

1. Verify parent has `@container` class
2. Check browser support (Chrome 105+, Safari 16+, Firefox 110+)
3. Use `@sm:`, `@md:`, `@lg:` prefixes (not `sm:`, `md:`, `lg:`)

### Theme Not Updating in Preview

1. Check browser console for errors
2. Verify `previewContainerRef` is attached to the correct element
3. Check that theme tokens are being applied via `style.setProperty()`

---

## Architecture Notes

### CSS-First Configuration

Tailwind v4 uses CSS-first configuration instead of `tailwind.config.js`:

```css
/* OLD (tailwind.config.js) */
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: '#0066CC'
      }
    }
  }
}

/* NEW (index.css) */
@import "tailwindcss";

@theme {
  --color-primary: #0066CC;
}
```

### Container Queries

Native container queries replace the `@tailwindcss/container-queries` plugin:

```html
<!-- Container definition -->
<div class="@container">
  <!-- Responsive to container, not viewport -->
  <div class="grid grid-cols-1 @sm:grid-cols-2 @lg:grid-cols-3">
    ...
  </div>
</div>
```

### Theme Isolation

Themes are applied to the preview container only, not the entire page:

```typescript
// Theme tokens applied via inline styles to container element
previewContainer.style.setProperty('--bg-primary', theme.light.bgPrimary);
previewContainer.style.setProperty('--text-primary', theme.light.textPrimary);
// ...
```

This ensures the Design Studio chrome remains unchanged while only the preview reflects theme changes.

---

## API Endpoints (Existing)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/galleries/{id}/design` | Get current design config |
| PUT | `/api/v1/galleries/{id}/design` | Update design config (save draft) |
| POST | `/api/v1/galleries/{id}/design/publish` | Publish design to live gallery |

---

## Related Documentation

- [Tailwind CSS v4 Upgrade Guide](https://tailwindcss.com/docs/upgrade-guide)
- [Container Queries Docs](https://tailwindcss.com/docs/responsive-design#container-queries)
- [Feature Specification](./spec.md)
- [Research Findings](./research.md)
- [Data Model](./data-model.md)
