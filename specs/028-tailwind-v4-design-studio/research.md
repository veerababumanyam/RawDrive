# Research: Tailwind v4 Upgrade & Gallery Design Studio

**Branch**: `028-tailwind-v4-design-studio`
**Date**: 2026-01-22
**Status**: Complete

---

## Research Areas

### 1. Tailwind CSS v4 Migration Strategy

**Decision**: Use the `@tailwindcss/vite` plugin for Vite integration with CSS-first configuration

**Rationale**:
- Tailwind v4 provides a first-party Vite plugin (`@tailwindcss/vite`) that offers better performance than PostCSS
- CSS-first configuration using `@theme` block replaces `tailwind.config.js`
- Native container query support eliminates need for `@tailwindcss/container-queries` plugin
- Automatic PostCSS handling means `postcss.config.js` and `autoprefixer` are no longer needed

**Alternatives Considered**:
- **Continue with PostCSS approach**: Rejected - Vite plugin is recommended for Vite projects and offers better performance
- **Gradual migration**: Rejected - Breaking changes in v4 make a clean upgrade safer than incremental changes

**Migration Steps**:
1. Run `npx @tailwindcss/upgrade` to automate most migration tasks
2. Install `@tailwindcss/vite` and remove old dependencies
3. Update `vite.config.ts` to use the Vite plugin
4. Convert `tailwind.config.js` to `@theme` block in `index.css`
5. Delete `postcss.config.js` (no longer needed)
6. Update dark mode configuration to use `@custom-variant`

---

### 2. CSS Variables Migration

**Decision**: Migrate all design tokens to CSS variables within `@theme` block

**Rationale**:
- Tailwind v4 uses CSS variables internally (e.g., `var(--color-red-500)` instead of `theme(colors.red.500)`)
- RawDrive already uses CSS variables extensively (`--color-primary-*`, `--color-accent-*`, etc.)
- This approach aligns with v4's native patterns and simplifies the migration

**Key Mappings**:
| v3 Config | v4 @theme |
|-----------|-----------|
| `colors.primary.500` | `--color-primary-500` |
| `fontFamily.sans` | `--font-sans` |
| `spacing.4.5` | `--spacing-4_5` (note: dots become underscores) |
| `borderRadius.button` | `--radius-button` |
| `boxShadow.card` | `--shadow-card` |

**Alternatives Considered**:
- **Keep tailwind.config.js with v4 compatibility layer**: Rejected - CSS-first is the recommended approach and simplifies maintenance

---

### 3. Dark Mode Configuration

**Decision**: Use `@custom-variant` directive for `[data-theme="dark"]` selector

**Rationale**:
- RawDrive currently uses `darkMode: ['selector', '[data-theme="dark"]']` in tailwind.config.js
- Tailwind v4 equivalent: `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));`
- This maintains exact same behavior with no breaking changes to existing dark mode implementation

**Configuration**:
```css
@import "tailwindcss";

@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));
```

---

### 4. Custom Utilities Migration

**Decision**: Convert custom plugin utilities to `@utility` directives in CSS

**Rationale**:
- Tailwind v4 replaces JavaScript plugin-based utilities with CSS `@utility` directives
- Cleaner, more maintainable code that lives alongside other CSS

**Utilities to Migrate**:

| Current Plugin Utility | v4 @utility |
|------------------------|-------------|
| `.touch-target` | `@utility touch-target { min-height: 44px; min-width: 44px; }` |
| `.focus-ring` | `@utility focus-ring { &:focus-visible { ... } }` |
| `.glass` | `@utility glass { ... }` |
| `.glass-dark` | `@utility glass-dark { ... }` |
| `.glass-photo` | `@utility glass-photo { ... }` |
| `.scrollbar-thin` | `@utility scrollbar-thin { ... }` |
| `.scrollbar-hide` | `@utility scrollbar-hide { ... }` |
| `.text-gradient` | `@utility text-gradient { ... }` |
| `.text-gradient-gold` | `@utility text-gradient-gold { ... }` |

---

### 5. Container Queries Support

**Decision**: Use native Tailwind v4 container query syntax (`@container`, `@sm:`, `@lg:`)

**Rationale**:
- Tailwind v4 has built-in container query support - no plugin needed
- Syntax: `@container` to define container, `@sm:` / `@md:` / `@lg:` for breakpoints
- Perfect for Design Studio preview canvas responsive simulation

**Implementation Pattern**:
```html
<div class="@container">
  <div class="grid grid-cols-1 @sm:grid-cols-2 @lg:grid-cols-3">
    <!-- Content adapts to container size, not viewport -->
  </div>
</div>
```

**Alternatives Considered**:
- **@tailwindcss/container-queries plugin**: Rejected - Now built into v4 core, plugin is obsolete

---

### 6. Existing Design Studio Infrastructure

**Decision**: Build upon existing components and hooks

**Rationale**:
Codebase analysis reveals substantial existing infrastructure:

**Existing Components** (`frontend/src/components/features/gallery/design/`):
- `DesignControlsPanel.tsx` - Control sidebar with sections
- `DesignPreviewCanvas.tsx` - Preview rendering canvas
- `CoverStyleGrid.tsx` - Cover style selection grid
- `FocalPointPicker.tsx` - Image focal point selector
- `CollaboratorPresence.tsx` - Real-time collaboration indicators
- `ControlLockIndicator.tsx` - Section locking for collaboration
- `TemplateLibrary.tsx` - Design templates
- `AssetPickerModal.tsx` - Asset selection modal

**Existing Hooks**:
- `useDesignDraft.ts` - Draft state management with undo/redo
- `useDesignCollaboration.ts` - WebSocket collaboration

**Existing Constants**:
- `galleryThemes.ts` - All 9 themes fully defined with light/dark tokens
- `coverStyleCatalog.ts` - All 28 cover styles cataloged

**Existing Page**:
- `GalleryDesignStudioPage.tsx` - Full split-screen layout implemented

**Key Finding**: Design Studio is largely implemented. Primary work is:
1. Tailwind v4 migration (infrastructure)
2. Container query integration for responsive preview
3. ThemeEngine utility for CSS variable injection
4. ThemeSelector component (visual grid UI)

---

### 7. Theme Engine Architecture

**Decision**: Create lightweight ThemeEngine utility for CSS variable injection

**Rationale**:
- Existing `themeUtils.ts` provides `applyThemeTokens()` and `setupThemeWithSystemPreference()`
- Need to ensure these work with new Tailwind v4 CSS variable structure
- Theme tokens from `galleryThemes.ts` already match CSS variable naming

**Implementation Approach**:
```typescript
// ThemeEngine maps ThemeId → CSS variables → injects into preview container
const applyThemeToContainer = (
  container: HTMLElement,
  themeId: ThemeId,
  mode: ThemeMode
) => {
  const theme = GALLERY_THEMES[themeId];
  const tokens = mode === 'dark' ? theme.dark : theme.light;

  Object.entries(tokens).forEach(([key, value]) => {
    container.style.setProperty(`--${camelToKebab(key)}`, value);
  });
};
```

---

### 8. Performance Considerations

**Decision**: Debounce rapid theme changes, use CSS transitions

**Rationale**:
- Theme switching should feel instant (< 100ms perceived)
- CSS variable changes trigger repaint but not reflow - efficient
- Multiple rapid clicks should not cause visual flickering

**Approach**:
- Theme changes update CSS variables directly on container element
- CSS transitions on color properties provide smooth visual transition
- Debounce user input at 50ms to prevent excessive updates

---

## Dependency Changes Summary

### To Install
- `tailwindcss@4` (upgrade from ^3.3.6)
- `@tailwindcss/vite` (new Vite plugin)

### To Remove
- `postcss` (handled by Vite plugin)
- `autoprefixer` (handled by Vite plugin)

### To Keep (unchanged)
- `typescript`
- `vite`
- All other dependencies

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| @apply directive changes | Medium | Medium | Use utility classes directly; minimal @apply usage in codebase |
| Custom color names conflict | Low | Low | Existing CSS variables use consistent naming |
| Animation keyframes change | Low | Low | Keyframes defined in CSS, not config - should migrate cleanly |
| Font loading issues | Low | Medium | Font families use CSS variables already - compatible |

---

## Research Conclusions

1. **Migration is well-defined**: Tailwind provides upgrade tool and clear documentation
2. **Existing infrastructure is solid**: Most Design Studio work is already done
3. **Container queries enable key feature**: Native v4 support enables responsive preview
4. **CSS-first approach aligns**: RawDrive's CSS variable usage aligns well with v4 patterns
5. **Risk is manageable**: Visual regression testing will catch any issues

**Recommendation**: Proceed with implementation using the migration path defined above.
