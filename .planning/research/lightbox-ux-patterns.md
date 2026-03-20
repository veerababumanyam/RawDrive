# Lightbox / Fullscreen Image Viewer UX Patterns Research

> Research date: 2026-03-20
> Sources: Apple Photos, Google Photos, SmugMug, Pixieset, ShootProof, Pic-Time, Material Design, industry lightbox libraries

---

## 1. Auto-Hide Behavior

### Common Pattern
All major platforms follow the same core pattern: **show controls on interaction, hide after idle timeout**.

| Trigger | Behavior |
|---------|----------|
| **Mouse move** | Controls fade in immediately |
| **Tap (touch)** | Toggle controls on/off |
| **Idle timeout** | Controls fade out after **2-3 seconds** of no mouse movement |
| **Image navigation** | Controls briefly appear, then auto-hide resumes |
| **First open** | Controls shown for ~2-3s, then auto-hide |

### Platform-Specific Notes
- **Apple Photos (macOS)**: Toolbar auto-hides in fullscreen after ~2-3s idle. Moving mouse to top edge reveals toolbar. Tapping/clicking the image toggles controls.
- **Google Photos (web)**: Top bar with date/actions and bottom filmstrip fade out after idle. Mouse movement anywhere reveals them. Recently shifted to a floating toolbar to maximize photo viewing area.
- **SmugMug**: Explicit "Auto Hide Controls" toggle in lightbox settings. When ON, tools at the bottom hide after ~3s idle. Mouse movement reveals them. Configurable ON/OFF but timeout duration is fixed.
- **Pixieset / ShootProof / Pic-Time**: All follow the same 2-3s idle timeout convention. Touch devices use tap-to-toggle.

### Best Practice
- **Idle timeout: 2-3 seconds** (industry standard; shorter feels aggressive, longer clutters the view)
- **Fade duration: 200-300ms** (CSS opacity transition)
- **Re-trigger: any mouse movement, touch, or keyboard input**
- **Cursor hiding**: Hide mouse cursor after the same idle timeout (matches macOS/video player convention)
- **Escape hatch**: Tap/click image always toggles controls (critical for touch devices with no hover)

---

## 2. Button Styling for Visibility Against Varied Backgrounds

### The Scrim Pattern (Industry Standard)
All platforms use some form of **scrim** — a semi-transparent overlay behind controls to guarantee contrast regardless of image content.

| Technique | Description | Used By |
|-----------|-------------|---------|
| **Gradient scrim** | 40-60% black → transparent gradient (top and/or bottom edge) | Google Photos, Apple Photos, SmugMug |
| **Solid scrim bar** | Semi-transparent dark bar (~50-70% opacity black) behind toolbar | Older SmugMug, ShootProof |
| **Pill/backdrop blur** | Frosted glass effect behind individual buttons or button groups | Apple Photos (macOS/iOS), Google Photos (mobile) |
| **Icon shadow/outline** | `text-shadow` or `drop-shadow` on icons for standalone buttons | Navigation arrows on most platforms |
| **Dual-layer icons** | White icon with dark shadow or dark stroke outline | Universal fallback |

### Material Design Guidance
- Scrim gradient: **~40% black to transparent** — enough contrast without being too heavy
- Newer Material Design favors **solid scrims** over gradients for simplicity
- No need to sacrifice image visibility — scrim + white text/icons coexist cleanly

### Best Practice
- **Primary approach**: Gradient scrim at top and bottom edges (where controls live)
- **Standalone controls** (nav arrows): White icon + `drop-shadow(0 1px 3px rgba(0,0,0,0.7))` or dark circular backdrop
- **Never rely on icon color alone** — always pair with shadow, scrim, or backdrop
- **Backdrop blur** (`backdrop-filter: blur(10px)`) for modern glass-morphism style — Apple's approach

---

## 3. Control Layout (Placement Conventions)

### Standard Layout Map

```
┌─────────────────────────────────────────────────┐
│ [←Back]          Title/Date        [Share][Info] │  ← Top bar (gradient scrim)
│                                          [Close] │
│                                                   │
│                                                   │
│  [◄]              IMAGE                    [►]   │  ← Nav arrows (vertically centered)
│                                                   │
│                                                   │
│                                                   │
│ [♡ Fav]  [⬇ Download]  [🛒 Buy]   [1/24]       │  ← Bottom bar (gradient scrim)
│                          [Thumbnails strip]       │
└─────────────────────────────────────────────────┘
```

### Position Conventions

| Control | Position | Notes |
|---------|----------|-------|
| **Close (X)** | Top-right corner | Universal convention. Sometimes top-left on iOS-style UIs. |
| **Back arrow** | Top-left | Alternative to close; returns to gallery grid |
| **Navigation arrows** | Left/right edges, vertically centered | Large hit targets (~48px). Fade in on hover near edges (Google) or always visible (SmugMug). |
| **Image counter** | Bottom-center or top-center | "3 of 24" format |
| **Download** | Bottom bar or top-right toolbar | Icon-only or icon+label |
| **Share** | Top-right toolbar group | Near close button |
| **Info/Details** | Top-right toolbar or bottom bar | Opens side panel or overlay |
| **Favorite/Star** | Bottom-left or top toolbar | Quick action |
| **Buy/Cart** | Bottom bar (prominent) | Photography platforms emphasize this — SmugMug/Pixieset make it the largest button |
| **Thumbnail strip** | Bottom edge | Optional filmstrip for quick navigation; auto-hides with other controls |
| **Zoom controls** | Toolbar or gesture-only | Pinch-to-zoom on touch; scroll-wheel or +/- buttons on desktop |

### Platform-Specific Layout Notes
- **Google Photos**: Top bar (back, date, share, more menu). No visible nav arrows until hover near edges. Bottom filmstrip.
- **Apple Photos**: Minimal top toolbar (close, edit, share). Nav arrows on hover. Bottom thumbnail strip.
- **SmugMug**: Close top-right. Nav arrows always visible or on hover. Bottom toolbar with Buy, Share, Info. "Auto Hide Controls" applies to bottom bar.
- **Pixieset**: Clean minimal overlay. Close top-right. Download, star, rename as quick actions. Navigation arrows on sides.
- **ShootProof**: Close top-right. Bottom bar with download/buy actions. Filmstrip navigation.
- **Pic-Time**: Similar to Pixieset but with more integrated e-commerce controls in lightbox.

---

## 4. Light Mode / Bright Photo Handling

### The Core Problem
Controls must remain visible whether the photo is predominantly dark, light, or mixed.

### Solutions (Ranked by Effectiveness)

1. **Always-dark lightbox background**: Every platform uses a dark (black or near-black) backdrop. This guarantees contrast at the edges where controls live, even for bright photos. This is non-negotiable.

2. **Gradient scrim over image edges**: Even with a dark background, the image itself may be bright at the edges. A gradient scrim (40% black → transparent) over the top and bottom 80-120px ensures controls have contrast against any image content.

3. **Icon shadow / outline**: For controls that float directly over the image (nav arrows), use:
   - `text-shadow: 0 1px 4px rgba(0,0,0,0.6)` on icons
   - Or circular semi-transparent dark backdrop behind each icon

4. **Backdrop blur (glass morphism)**: Apple's approach — `backdrop-filter: blur(16px) saturate(180%)` with a semi-transparent dark fill. Works against both light and dark images because it averages the underlying color.

5. **Never use light/white-themed lightbox**: No major photography platform offers a white-background lightbox. The industry consensus is that dark backgrounds are better for image viewing (reduces eye strain, provides natural contrast for controls, and makes colors appear more vibrant).

### What NOT To Do
- Do not dynamically analyze image brightness to switch control colors (too complex, too slow, jarring when navigating between light/dark images)
- Do not use thin/hairline icons without shadows (invisible on bright images)
- Do not skip the scrim and rely only on icon color (fails on edge cases)

---

## Summary: Recommended Implementation for RawDrive

| Aspect | Recommendation |
|--------|---------------|
| **Background** | Solid black (`#000`) or near-black (`#111`) backdrop |
| **Auto-hide timeout** | 2.5 seconds idle → fade out over 250ms |
| **Re-show trigger** | Mouse move, touch tap, keyboard input |
| **Cursor** | Hide cursor after same idle timeout |
| **Top bar** | Gradient scrim (black 60% → transparent). Contains: back/close (left or right), title, share, info, more menu |
| **Bottom bar** | Gradient scrim. Contains: favorite, download, buy/cart (if applicable), image counter, thumbnail strip |
| **Nav arrows** | Vertically centered on left/right edges. White icons with drop-shadow. Large hit area (48px+). Show on hover near edge or always visible. |
| **Button style** | White icons (24px) on transparent background. Hover state: subtle white circle backdrop. Active state: filled white circle. |
| **Keyboard shortcuts** | Left/Right arrows (navigate), Escape (close), I (info), D (download), F (favorite) |
| **Touch gestures** | Swipe left/right (navigate), pinch (zoom), tap (toggle controls), swipe down (close) |
| **Accessibility** | All controls keyboard-focusable. ARIA labels. Focus trap inside lightbox. |
