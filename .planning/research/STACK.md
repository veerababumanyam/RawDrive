# Technology Stack

**Project:** RawDrive v1.1 — Profile & Public Page Modernization
**Researched:** 2026-03-19
**Scope:** Additions to existing stack only for profile/public page modernization. Existing core stack (React 18, TailwindCSS v4, FastAPI, PostgreSQL) is NOT re-evaluated.

## Existing Stack Already Sufficient

These are already installed and cover most needs. Listed to prevent redundant additions.

| Technology | Version | Covers |
|------------|---------|--------|
| framer-motion | ^11.0.0 | All animations, micro-interactions, layout transitions, stagger effects, spring physics |
| @dnd-kit/core + @dnd-kit/sortable | ^6.3.1 / ^10.0.0 | Drag-and-drop link ordering, bento grid reordering |
| tailwindcss | ^4.0.0 | Container queries (@container), glassmorphism (backdrop-blur-*), opacity syntax (bg-white/30), aspect-ratio, scroll-snap |
| react-easy-crop | ^5.5.6 | Avatar cropping with zoom/pan (broken integration, not broken library) |
| @use-gesture/react | ^10.3.1 | Touch gestures, swipe, pinch-zoom for mobile interactions |
| lucide-react | ^0.294.0 | Icons for social links, UI elements |
| qrcode.react | ^4.2.0 | QR code generation for profile sharing |
| react-hook-form | ^7.69.0 | Form state for profile editor fields |
| zod | ^4.3.5 | Validation for profile data, color values, URLs |

## Recommended Addition (1 package only)

### Gradient Color Picker

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| react-best-gradient-color-picker | ^3.0.14 | Visual gradient + solid color picker for theme backgrounds | The existing ColorPaletteBuilder uses raw hex inputs. For Linktree/Bento-level theme customization, users need a visual gradient picker that outputs CSS gradient strings directly. This is the only maintained React library with linear/radial gradient support, eyedropper tool, and a useColorPicker hook for programmatic control. 28K+ weekly downloads. |

**Confidence:** MEDIUM (npm verified, GitHub active, no Context7 entry)

**Integration point:** Replace hex color inputs in the theme editor with this picker. It accepts and outputs CSS gradient strings (e.g., `linear-gradient(45deg, #ff0000, #0000ff)`), which maps directly to `ProfileTheme.colors.background`. The `useColorPicker` hook provides HSL/RGB/hex values for individual color slots.

```bash
cd frontend && pnpm add react-best-gradient-color-picker@^3.0.14
```

## Capabilities From Existing Stack (No New Libraries)

### Container Queries — Tailwind v4 Built-in

Tailwind CSS v4 ships first-class container queries. No plugin needed (the old `@tailwindcss/container-queries` is unnecessary). Use `@container` on parent, `@sm:` / `@md:` / `@lg:` on children. Use for profile cards that adapt to container width in both editor preview panel and public page.

```html
<div class="@container">
  <div class="flex flex-col @md:flex-row @lg:grid @lg:grid-cols-2 gap-4">
```

**Browser support:** Chrome 105+, Firefox 110+, Safari 16+ (Baseline 2023). Safe to use.

### Glassmorphism — Tailwind v4 Built-in

Already in use via GlassContainer.tsx, HeroGlassCard.tsx, FooterGlassStrip.tsx. The theme engine already has an `effects.glassmorphism` boolean and `effects.blur` field. Standardize blur levels across components:

```html
<!-- Light glass -->  bg-white/10 backdrop-blur-md border border-white/15
<!-- Medium glass --> bg-white/15 backdrop-blur-lg border border-white/20
<!-- Heavy glass -->  bg-white/20 backdrop-blur-xl border border-white/25 shadow-xl
```

### Advanced Animations — Framer Motion ^11

All premium animation effects are achievable with the installed version:

| Effect | Framer Motion API | Use Case |
|--------|-------------------|----------|
| Shared-element transitions | `layoutId` | Editor card <-> public page card |
| Page transitions | `AnimatePresence` + variants | Route changes in profile sections |
| Micro-interactions | `whileHover`, `whileTap` | Buttons, links, social icons |
| Stagger entrance | `staggerChildren` in variants | Bento grid cards appearing sequentially |
| Spring physics | `type: "spring"` in transition | Drag-and-drop snap-back, toggle bounces |
| Parallax scroll | `useScroll` + `useTransform` | Profile hero background depth effect |
| Gesture animations | `useDragControls` | Mobile swipe interactions |
| Morphing | `animate` with `borderRadius`, `scale` | Theme switching transitions |

### Drag-and-Drop — @dnd-kit Already Installed

`@dnd-kit/sortable@^10.0.0` handles all reordering needs:
- Custom link ordering in profile editor
- Bento grid block repositioning
- Social link priority ordering

Combine with Framer Motion for animated drag feedback (spring transitions on drop).

### Modern CSS Techniques (Zero Libraries)

| Technique | Browser Support | Use Case |
|-----------|----------------|----------|
| `color-mix()` | Baseline 2023 | Dynamic theme color tints/shades without JS |
| CSS `has()` | Baseline 2024 | Parent styling based on child state (e.g., focused input) |
| `scroll-snap` | Baseline 2019 | Horizontal gallery preview carousel on profiles |
| `aspect-ratio` | Baseline 2021 | Consistent bento grid card proportions |
| `@starting-style` | Chrome 117+, Safari 17.5+ | CSS-only entry animations (progressive enhancement) |
| CSS `text-wrap: balance` | Baseline 2024 | Balanced heading text on profile pages |
| Subgrid | Baseline 2023 | Aligned bento grid content across cards |

### Client-Side Avatar Optimization (Canvas API)

No Sharp or server library needed. Resize avatars on client before R2 upload:

```typescript
// Generate 3 sizes from crop output
const sizes = [64, 200, 400]; // thumbnail, standard, high-res
sizes.forEach(size => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(croppedImage, 0, 0, size, size);
  canvas.toBlob(blob => uploadToR2(blob, `avatar-${size}.webp`), 'image/webp', 0.9);
});
```

## Anti-Recommendations (DO NOT Add)

| Library/Tech | Why NOT | What to Use Instead |
|-------------|---------|-------------------|
| `motion@^12` (upgrade framer-motion) | API is identical. Migration risk for zero gain mid-milestone. | Keep framer-motion@^11. Migrate in v1.2. |
| React `<ViewTransition>` | Requires React 19 (canary/experimental). Project uses React 18.3. | Framer Motion `layoutId` + `AnimatePresence` |
| @casoon/tailwindcss-glass | Tailwind v4 has all needed utilities built-in. Existing Glass components work. | Tailwind native `backdrop-blur-*`, `bg-*/opacity` |
| react-cropper / react-advanced-cropper | react-easy-crop is already installed and correct for avatars. Issue is integration bug, not library. | Fix react-easy-crop integration |
| Cloudflare Image Resizing | Paid add-on ($0.50/1K transforms). Overkill for avatars displayed at fixed sizes. | Client-side canvas resize before R2 upload |
| Sharp (server-side) | Requires native binaries, complicates Docker. Backend has Pillow already. | Canvas API (client) or Pillow (server) |
| GSAP / anime.js | Framer Motion covers all needed animations with better React integration. | framer-motion |
| react-color / @rc-component/color-picker | No gradient support. Only solid colors. | react-best-gradient-color-picker |
| react-beautiful-dnd | Deprecated. Unmaintained since 2022. | @dnd-kit (already installed) |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Gradient picker | react-best-gradient-color-picker | react-gcolor-picker | Fewer features, less active maintenance, no useColorPicker hook |
| Gradient picker | react-best-gradient-color-picker | react-colorify | Newer but far fewer downloads (unproven), less documentation |
| Animation | framer-motion (keep) | motion@12 | Same API, unnecessary migration churn during feature work |
| DnD | @dnd-kit (keep) | react-dnd | Heavier, less accessible, worse touch support |

## Sources

- [Motion official site](https://motion.dev/) — framer-motion rebranding, v12.36.0 latest
- [Motion upgrade guide](https://motion.dev/docs/react-upgrade-guide) — confirms API compatibility
- [react-best-gradient-color-picker npm](https://www.npmjs.com/package/react-best-gradient-color-picker) — v3.0.14, 28K weekly downloads
- [Tailwind CSS v4 blog](https://tailwindcss.com/blog/tailwindcss-v4) — container queries built-in, no plugin
- [Tailwind CSS backdrop-filter docs](https://tailwindcss.com/docs/backdrop-filter-blur) — glassmorphism utilities
- [React ViewTransition docs](https://react.dev/reference/react/ViewTransition) — confirms experimental/React 19+ only
- [React Labs blog post](https://react.dev/blog/2025/04/23/react-labs-view-transitions-activity-and-more) — ViewTransition still in canary
- [MDN View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API) — browser support reference
- [Cloudflare Image Resizing architecture](https://developers.cloudflare.com/reference-architecture/diagrams/content-delivery/optimizing-image-delivery-with-cloudflare-image-resizing-and-r2/) — pricing
- [@dnd-kit/sortable npm](https://www.npmjs.com/package/@dnd-kit/sortable) — v10.0.0 confirmed
- [Epic Web Dev glassmorphism guide](https://www.epicweb.dev/tips/creating-glassmorphism-effects-with-tailwind-css) — Tailwind-native approach
