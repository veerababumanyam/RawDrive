# Design System

> Auto-generated from design-tokens.json. Do not edit token tables directly.

## Brand

**Name:** RawDrive
**Tagline:** The Operating System for Professional Photography in India
**Logo:** frontend/public/logo/android-chrome-512x512.png

## Theme System

**Active theme:** `liquid-glass-dark`

## Theme: liquid-glass

Default light theme. iOS 26 inspired Liquid Glass: cool blue-opal content surfaces, floating glass controls, logo-derived electric-blue/cyan/champagne-gold tinting, and contrast-safe text.
**Mode:** `light`

### Surface

| Token | Value | Notes |
|-------|-------|-------|
| `base` | `#f6f9fd` | Primary page background with a neutral opal cast |
| `elevated` | `#ffffff` | Cards, modals, raised elements |
| `sunken` | `#edf2f9` | Secondary backgrounds, inset areas |
| `overlay` | `rgba(255, 255, 255, 0.78)` | Frosted modal/dialog backdrop |
| `container` | `#e8eef7` | Grouped content containers |
| `containerLow` | `#f2f6fb` | Low-emphasis grouped surfaces |
| `containerHigh` | `#dee7f2` | Raised grouped surfaces |
| `containerHighest` | `#d2deee` | Highest light-mode container before borders |
| `variant` | `#d8e4f5` | Subtle glass tint carrier |
| `bright` | `#ffffff` | Brightest solid surface |
| `dim` | `#c6d2e2` | Dim surface for separators and pressed wells |
| `scrim` | `rgba(20, 30, 45, 0.28)` | Media scrim for legible text over imagery |
| `scrimStrong` | `rgba(8, 14, 22, 0.95)` | Near-opaque shell for immersive media viewers (lightbox, video) |

### Text

| Token | Value | Notes |
|-------|-------|-------|
| `primary` | `#151f2a` | High-contrast headers, body text |
| `secondary` | `#44515f` | Subheaders, descriptive text |
| `tertiary` | `#51606c` | Captions, timestamps, metadata |
| `inverse` | `#fbfdff` | Text on dark/accent backgrounds |
| `media` | `#ffffff` | Text over photographic/video media scrims |

### Accent

| Token | Value | Notes |
|-------|-------|-------|
| `default` | `#1456b8` | Primary logo electric-blue accent; 6.9:1 against white (AA+) |
| `hover` | `#0f47a1` | Accent hover state |
| `active` | `#0c3a85` | Accent pressed state |
| `subtle` | `rgba(20, 86, 184, 0.10)` | Accent background wash (10% opacity) |
| `muted` | `rgba(20, 86, 184, 0.20)` | Accent background medium (20% opacity) |
| `primary` | `#1a66c9` | Lifted electric blue for primary emphasis and charts; white text passes AA |
| `secondary` | `#0a7191` | Logo cyan deepened for AA on light surfaces |
| `tertiary` | `#8a6516` | Champagne gold (logo aperture blade) for selective warmth; AA on white |

### Semantic

| Token | Value | Notes |
|-------|-------|-------|
| `success` | `#1b6f4d` | Positive actions, confirmations |
| `warning` | `#94630f` | Caution states, pending actions |
| `destructive` | `#a33d43` | Errors, destructive actions, critical alerts |
| `info` | `#0a7191` | Informational states, tips |

### Border

| Token | Value | Notes |
|-------|-------|-------|
| `default` | `rgba(100, 122, 145, 0.34)` | Default visible glass/content border |
| `strong` | `rgba(72, 92, 112, 0.52)` | Emphasized borders, dividers |
| `subtle` | `rgba(100, 122, 145, 0.18)` | Subtle borders, hairlines |
| `focus` | `#0f5dba` | High-contrast focus ring |
| `outlineVariant` | `#92a3bd` | Outline color used by translucent glass edges |

### Glass

| Token | Value | Notes |
|-------|-------|-------|
| `blur` | `24px` | Regular Liquid Glass backdrop blur |
| `saturation` | `185%` | backdrop-saturate for glass vibrancy |
| `borderOpacity` | `0.22` | Border opacity for glass edges |
| `surfaceOpacity` | `0.76` | Regular glass fill opacity |
| `clearSurfaceOpacity` | `0.38` | Clear glass over media only; requires scrim |
| `highlightOpacity` | `0.72` | Specular highlight intensity |
| `rimOpacity` | `0.42` | Bright rim lensing edge |
| `refractionOpacity` | `0.18` | Inner lens/refraction layer |
| `tintOpacity` | `0.20` | Selective primary action tint opacity |
| `reducedTransparencyOpacity` | `0.94` | Fallback fill when reduced transparency is preferred |
| `increasedContrastBorderOpacity` | `0.70` | Fallback edge opacity when increased contrast is preferred |

## Theme: liquid-glass-dark

Cinematic dark Liquid Glass aligned to the RawDrive aperture logo: deep ink-indigo surfaces from the logo's indigo-violet blades, indigo→royal-blue→turquoise aurora lensing mirroring the rim gradient, and a thin champagne-gold luxury accent for the single gold blade. 2026 gradient-glow aesthetic, WCAG AA verified.
**Mode:** `dark`

### Surface

| Token | Value | Notes |
|-------|-------|-------|
| `base` | `#070a1f` | Primary page background — the logo's indigo-violet blade taken to near-black |
| `elevated` | `#0b1229` | Cards, modals, raised elements |
| `sunken` | `#030514` | Secondary backgrounds, inset areas |
| `overlay` | `rgba(7, 10, 31, 0.88)` | Modal/dialog backdrop |
| `container` | `#101a38` | Grouped content containers |
| `containerLow` | `#0a112b` | Low-emphasis grouped surfaces |
| `containerHigh` | `#16234a` | Raised grouped surfaces |
| `containerHighest` | `#1c2d5e` | Highest dark-mode container before borders |
| `variant` | `#141f48` | Subtle glass tint carrier — indigo cast |
| `bright` | `#2a3f86` | Bright dark-mode surface — logo indigo-blue, dimmed |
| `dim` | `#030514` | Dim dark-mode surface |
| `scrim` | `rgba(3, 5, 17, 0.78)` | Media scrim for legible text over imagery |
| `scrimStrong` | `rgba(1, 2, 10, 0.96)` | Near-opaque shell for immersive media viewers (lightbox, video) |

### Text

| Token | Value | Notes |
|-------|-------|-------|
| `primary` | `#f7faff` | High-contrast headers, body text |
| `secondary` | `#d5e0fa` | Subheaders, descriptive text |
| `tertiary` | `#b3c3ec` | Captions, timestamps, metadata |
| `inverse` | `#070a1f` | Text on light/accent backgrounds |
| `media` | `#ffffff` | Text over photographic/video media scrims |

### Accent

| Token | Value | Notes |
|-------|-------|-------|
| `default` | `#1ee7ff` | Exact brand cyan (logo blade); 12.9:1 on base |
| `hover` | `#84f1ff` | Accent hover state |
| `active` | `#19a7d3` | Exact brand teal (logo blade) as pressed state; 4.7:1+ on all containers |
| `subtle` | `rgba(30, 231, 255, 0.12)` | Brand-cyan accent background wash |
| `muted` | `rgba(139, 148, 255, 0.24)` | Indigo accent background medium |
| `primary` | `#8b94ff` | Brand indigo #2C36D4 tone-lifted for dark surfaces (raw value is 2.4:1 — fails AA); AA on all containers |
| `secondary` | `#1ee7ff` | Brand cyan glass tint for secondary emphasis |
| `tertiary` | `#cfa867` | Exact brand gold/bronze (logo's single gold blade) — thin luxury accent, used sparingly; 5.9:1+ everywhere |

### Semantic

| Token | Value | Notes |
|-------|-------|-------|
| `success` | `#4ee0a8` | Positive actions |
| `warning` | `#f0c668` | Caution states |
| `destructive` | `#ff8fa0` | Errors, destructive actions |
| `info` | `#1ee7ff` | Informational states — brand cyan |

### Border

| Token | Value | Notes |
|-------|-------|-------|
| `default` | `rgba(138, 152, 235, 0.28)` | Default border color — indigo cast |
| `strong` | `rgba(30, 231, 255, 0.45)` | Emphasized borders — brand-cyan lensing |
| `subtle` | `rgba(138, 152, 235, 0.14)` | Subtle borders |
| `focus` | `#84f1ff` | Focus ring — luminous brand cyan, 3:1+ on all dark surfaces |
| `outlineVariant` | `#34479e` | Outline color used by translucent glass edges — indigo |

### Glass

| Token | Value | Notes |
|-------|-------|-------|
| `blur` | `26px` | Slightly stronger blur on dark for contrast |
| `saturation` | `165%` | Slightly richer saturation for cinematic aurora glow |
| `borderOpacity` | `0.24` | Softer glass edges in dark |
| `surfaceOpacity` | `0.82` | Regular glass fill opacity |
| `clearSurfaceOpacity` | `0.44` | Clear glass over media only; requires scrim |
| `highlightOpacity` | `0.55` | Specular highlight intensity |
| `rimOpacity` | `0.48` | Bright rim lensing edge |
| `refractionOpacity` | `0.22` | Inner lens/refraction layer |
| `tintOpacity` | `0.24` | Selective primary action tint opacity |
| `reducedTransparencyOpacity` | `0.96` | Fallback fill when reduced transparency is preferred |
| `increasedContrastBorderOpacity` | `0.78` | Fallback edge opacity when increased contrast is preferred |

## Theme: midnight

AMOLED Liquid Glass aligned to the aperture logo: true-black canvas with the logo's indigo cast, luminous indigo→royal-blue→turquoise aurora controls mirroring the rim gradient, and a rare champagne-gold luxury glint for long editing and proofing sessions.
**Mode:** `dark`

### Surface

| Token | Value | Notes |
|-------|-------|-------|
| `base` | `#030412` | Near-black base with the logo's indigo cast — AMOLED friendly |
| `elevated` | `#080c21` | Slightly lifted cards |
| `sunken` | `#00020a` | True black insets |
| `overlay` | `rgba(3, 4, 18, 0.94)` | Modal backdrop |
| `container` | `#0b132e` | Grouped content containers |
| `containerLow` | `#060a1c` | Low-emphasis grouped surfaces |
| `containerHigh` | `#121f4a` | Raised grouped surfaces |
| `containerHighest` | `#182b66` | Highest midnight container before borders |
| `variant` | `#0f1c44` | Subtle glass tint carrier — indigo cast |
| `bright` | `#234494` | Bright midnight surface — logo indigo-blue, dimmed |
| `dim` | `#00020a` | Dim midnight surface |
| `scrim` | `rgba(0, 2, 10, 0.90)` | Media scrim for legible text over imagery |
| `scrimStrong` | `rgba(0, 1, 6, 0.97)` | Near-opaque shell for immersive media viewers (lightbox, video) |

### Text

| Token | Value | Notes |
|-------|-------|-------|
| `primary` | `#ffffff` | White for maximum dark-dashboard readability |
| `secondary` | `#e2eafd` | Near-white secondary text |
| `tertiary` | `#b8c5ee` | Subdued metadata |
| `inverse` | `#030412` | Text on accent backgrounds |
| `media` | `#ffffff` | Text over photographic/video media scrims |

### Accent

| Token | Value | Notes |
|-------|-------|-------|
| `default` | `#5af0ff` | Brand cyan #1EE7FF gently lifted for AMOLED luminosity |
| `hover` | `#9df7ff` | Accent hover |
| `active` | `#19a7d3` | Exact brand teal (logo blade) as pressed state |
| `subtle` | `rgba(90, 240, 255, 0.10)` | Brand-cyan wash |
| `muted` | `rgba(149, 160, 255, 0.22)` | Indigo medium wash |
| `primary` | `#95a0ff` | Brand indigo #2C36D4 tone-lifted luminous for AMOLED emphasis and charts |
| `secondary` | `#5af0ff` | Brand-cyan glass tint for secondary emphasis |
| `tertiary` | `#cfa867` | Exact brand gold/bronze (logo's single gold blade) — thin luxury glint, used sparingly; 6:1+ everywhere |

### Semantic

| Token | Value | Notes |
|-------|-------|-------|
| `success` | `#5fe7b4` | Cyan-green success |
| `warning` | `#f3ca6a` | Gold-amber warning, distinct from the champagne accent |
| `destructive` | `#ff8fa0` | Muted red for dark context |
| `info` | `#5af0ff` | Brand cyan info |

### Border

| Token | Value | Notes |
|-------|-------|-------|
| `default` | `rgba(130, 148, 240, 0.28)` | Default border — indigo cast |
| `strong` | `rgba(90, 240, 255, 0.48)` | Emphasized borders — brand-cyan lensing |
| `subtle` | `rgba(130, 148, 240, 0.12)` | Barely visible borders |
| `focus` | `#9df7ff` | Brand-cyan focus ring |
| `outlineVariant` | `#2c3f96` | Outline color used by translucent glass edges — indigo |

### Glass

| Token | Value | Notes |
|-------|-------|-------|
| `blur` | `28px` | Heavy blur for dramatic depth |
| `saturation` | `135%` | Controlled saturation for AMOLED clarity |
| `borderOpacity` | `0.20` | Near-invisible glass edges |
| `surfaceOpacity` | `0.86` | Regular glass fill opacity |
| `clearSurfaceOpacity` | `0.48` | Clear glass over media only; requires scrim |
| `highlightOpacity` | `0.48` | Specular highlight intensity |
| `rimOpacity` | `0.50` | Bright rim lensing edge |
| `refractionOpacity` | `0.24` | Inner lens/refraction layer |
| `tintOpacity` | `0.26` | Selective primary action tint opacity |
| `reducedTransparencyOpacity` | `0.98` | Fallback fill when reduced transparency is preferred |
| `increasedContrastBorderOpacity` | `0.82` | Fallback edge opacity when increased contrast is preferred |

## Typography

- **Display:** system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif
- **Sans:** system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif
- **Mono:** ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace

### Type Scale

| Size | Value | Line height | Usage |
|------|-------|-------------|-------|
| `2xs` | `0.625rem` | `0.875rem` | Micro labels: badges, safe-zone chips, counters |
| `xs` | `0.75rem` | `1rem` | Caption, metadata, badges |
| `sm` | `0.875rem` | `1.25rem` | Secondary text, form labels |
| `base` | `1rem` | `1.5rem` | Body text, paragraphs |
| `lg` | `1.125rem` | `1.75rem` | Card titles, emphasized body |
| `xl` | `1.25rem` | `1.75rem` | Section subheadings |
| `2xl` | `1.5rem` | `2rem` | Section headings (h2) |
| `3xl` | `1.875rem` | `2.25rem` | Page titles (h1) |
| `4xl` | `clamp(2.25rem, 2rem + 1.1vw, 2.75rem)` | `1.12` | Hero headings — fluid; minimum equals previous fixed 2.25rem |
| `5xl` | `clamp(3rem, 2.55rem + 2vw, 3.75rem)` | `1.08` | Landing page hero — fluid; minimum equals previous fixed 3rem |
| `6xl` | `clamp(3.5rem, 2.8rem + 3vw, 4.75rem)` | `1.05` | Display headlines on large marketing surfaces |
| `7xl` | `clamp(4rem, 3rem + 4.5vw, 6rem)` | `1.02` | Maximum display size — hero statements only |

### Type Weights

| Token | Value | Notes |
|-------|-------|-------|
| `normal` | `400` |  |
| `medium` | `500` |  |
| `semibold` | `600` |  |
| `bold` | `700` |  |

### Letter Spacing

| Token | Value | Notes |
|-------|-------|-------|
| `default` | `0` | Do not tighten letter spacing; preserves readability and Indic script shaping |

## Spacing

**Base unit:** 4px

| Size | Value |
|------|-------|
| `0` | `0` |
| `1` | `0.25rem` |
| `2` | `0.5rem` |
| `3` | `0.75rem` |
| `4` | `1rem` |
| `5` | `1.25rem` |
| `6` | `1.5rem` |
| `8` | `2rem` |
| `10` | `2.5rem` |
| `12` | `3rem` |
| `16` | `4rem` |
| `20` | `5rem` |
| `24` | `6rem` |
| `32` | `8rem` |
| `0.5` | `0.125rem` |
| `1.5` | `0.375rem` |

## Border Radius

| Size | Value | Usage |
|------|-------|-------|
| `none` | `0` |  |
| `sm` | `0.25rem` | Badges, chips |
| `md` | `0.375rem` | Inputs, small buttons |
| `lg` | `0.625rem` | Cards, dialogs |
| `xl` | `0.875rem` | Large cards, modals |
| `2xl` | `1.25rem` | Hero cards, feature sections |
| `3xl` | `1.5rem` | Floating glass sheets and large media overlays |
| `full` | `9999px` | Pills, avatars, circular elements |

## Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `sm` | `0 1px 2px rgba(22, 34, 42, 0.07), 0 1px 1px rgba(22, 34, 42, 0.04)` | Subtle elevation (badges, tooltips) |
| `md` | `0 8px 18px rgba(22, 34, 42, 0.10), 0 2px 5px rgba(22, 34, 42, 0.06)` | Medium elevation (dropdowns) |
| `glass` | `0 18px 44px rgba(22, 34, 42, 0.16), 0 6px 14px rgba(22, 34, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.54)` | PRIMARY - glassmorphism controls, navbar, modals |
| `lg` | `0 24px 60px rgba(22, 34, 42, 0.18), 0 8px 18px rgba(22, 34, 42, 0.08)` | High elevation (popovers, floating panels) |
| `xl` | `0 34px 90px rgba(22, 34, 42, 0.24), 0 12px 28px rgba(22, 34, 42, 0.10)` | Max elevation (full modals, lightbox) |
| `inner` | `inset 0 1px 0 rgba(255, 255, 255, 0.42), inset 0 -1px 0 rgba(22, 34, 42, 0.08)` | Sunken inputs, inset areas |
| `glow` | `0 0 0 1px rgba(255, 255, 255, 0.36), 0 0 34px rgba(20, 140, 220, 0.20)` | Selective illuminated active controls — logo blue-cyan aurora |

## Motion

### Durations

| Token | Value | Notes |
|-------|-------|-------|
| `instant` | `0ms` | Reduced motion fallback |
| `fast` | `140ms` | Micro-interactions (hover, focus) |
| `normal` | `260ms` | Component transitions (expand, collapse, modal) |
| `slow` | `420ms` | Page transitions, large layout shifts |
| `shimmer` | `1500ms` | Skeleton loading shimmer (infinite) |

### Easing

| Token | Value | Notes |
|-------|-------|-------|
| `default` | `cubic-bezier(0.2, 0, 0, 1)` | Standard easing - most transitions |
| `in` | `cubic-bezier(0.3, 0, 1, 1)` | Elements leaving view |
| `out` | `cubic-bezier(0, 0, 0, 1)` | Elements entering view |
| `spring` | `cubic-bezier(0.16, 1, 0.3, 1)` | Liquid press/release, sheets, floating controls |
| `bounce` | `cubic-bezier(0.22, 1.28, 0.36, 1)` | Contained spring feedback |


## Accessibility

### Contrast Contract

| Token | Value | Notes |
|-------|-------|-------|
| `normalText` | `4.5:1` | SC 1.4.3 AA |
| `largeText` | `3:1` | SC 1.4.3 AA |
| `uiComponent` | `3:1` | SC 1.4.11 AA |
| `focusIndicator` | `3:1` | SC 2.4.13 AAA |

### Touch Targets

| Token | Value | Notes |
|-------|-------|-------|
| `minimum` | `44px` | Apple-recommended default control size for iOS/iPadOS and RawDrive icon buttons |
| `wcagMinimum` | `24px` | SC 2.5.8 AA |
| `gap` | `12px` | Preferred spacing around touch targets |

### User Preferences

| Token | Value | Notes |
|-------|-------|-------|
| `reduceTransparency` | `supported` | Use theme glass.reducedTransparencyOpacity and suppress clear glass |
| `increaseContrast` | `supported` | Use theme glass.increasedContrastBorderOpacity and stronger solid fills |
| `reduceMotion` | `supported` | Use motion.duration.instant and remove elastic transforms |
| `differentiateWithoutColor` | `supported` | Status components must include icon/shape/text, not color alone |

## Components

### navbar

| Token | Value | Notes |
|-------|-------|-------|
| `height` | `64px` |  |
| `heightMobile` | `56px` |  |
| `blur` | `{themes.{active}.glass.blur}` | themes.{active}.glass.blur |
| `background` | `{themes.{active}.surface.overlay}` | themes.{active}.surface.overlay |
| `shadow` | `{shadows.glass}` | shadows.glass |
| `zIndex` | `{zIndex.sticky}` | zIndex.sticky |

### card

| Token | Value | Notes |
|-------|-------|-------|
| `background` | `{themes.{active}.surface.elevated}` | themes.{active}.surface.elevated |
| `border` | `{themes.{active}.border.default}` | themes.{active}.border.default |
| `borderRadius` | `{radii.xl}` | radii.xl |
| `shadow` | `{shadows.glass}` | shadows.glass |
| `hoverScale` | `1.01` |  |
| `hoverTransition` | `{motion.duration.normal}` | motion.duration.normal |
| `padding` | `{spacing.scale.6}` | spacing.scale.6 |

### button

| Token | Value | Notes |
|-------|-------|-------|
| `primaryBg` | `{themes.{active}.accent.default}` | themes.{active}.accent.default |
| `primaryHoverBg` | `{themes.{active}.accent.hover}` | themes.{active}.accent.hover |
| `primaryActiveBg` | `{themes.{active}.accent.active}` | themes.{active}.accent.active |
| `primaryText` | `{themes.{active}.text.inverse}` | themes.{active}.text.inverse |
| `borderRadius` | `{radii.xl}` | radii.xl |
| `paddingX` | `{spacing.scale.4}` | spacing.scale.4 |
| `paddingY` | `{spacing.scale.3}` | spacing.scale.3 |
| `height` | `44px` |  |
| `heightSm` | `36px` |  |
| `heightLg` | `52px` |  |
| `transition` | `{motion.duration.fast}` | motion.duration.fast |

### glassIconButton

iOS 26 liquid glass circular icon button. Component: frontend/src/components/ui/glass-icon-button.tsx. MANDATORY for all icon-only interactive elements.
| Token | Value | Notes |
|-------|-------|-------|
| `sizeSm` | `36px` | Compact toolbar buttons |
| `sizeMd` | `44px` | Standard - meets Apple default control size and WCAG target guidance |
| `sizeLg` | `52px` | Prominent actions (lightbox nav, proofing) |
| `borderRadius` | `{radii.full}` | radii.full |
| `backdropBlur` | `{themes.{active}.glass.blur}` | themes.{active}.glass.blur |
| `backdropSaturate` | `{themes.{active}.glass.saturation}` | themes.{active}.glass.saturation |
| `borderOpacity` | `{themes.{active}.glass.borderOpacity}` | themes.{active}.glass.borderOpacity |
| `bgOpacity` | `0.18` | Background opacity for glass variant |
| `bgOpacityHover` | `0.28` | Background opacity on hover |
| `bgOpacityActive` | `0.36` | Background opacity when active/pressed |
| `foreground` | `{themes.{active}.text.primary}` | Default icon foreground. Must contrast against light glass surfaces. |
| `foregroundMuted` | `{themes.{active}.text.secondary}` | Muted icon foreground for ghost/inactive controls on regular surfaces. |
| `foregroundOnMedia` | `{themes.{active}.text.media}` | Icon foreground over dark/photo/video/media surfaces. |
| `foregroundDisabledOpacity` | `0.42` | Disabled icon opacity while preserving visible disabled affordance. |
| `pressScale` | `0.94` | Scale on press - spring animation |
| `transition` | `{motion.duration.fast}` | motion.duration.fast |
| `shadow` | `{shadows.glass}` | Subtle elevation |
| `shadowHover` | `{shadows.glow}` | Elevated on hover |
| `iconStrokeWidth` | `1.5` | SF Symbols-style stroke weight |
| `iconViewBox` | `0 0 24 24` | Standard 24x24 icon grid |

### input

| Token | Value | Notes |
|-------|-------|-------|
| `background` | `{themes.{active}.surface.containerLow}` | themes.{active}.surface.containerLow |
| `border` | `{themes.{active}.border.default}` | themes.{active}.border.default |
| `borderFocus` | `{themes.{active}.border.focus}` | themes.{active}.border.focus |
| `borderRadius` | `{radii.xl}` | radii.xl |
| `height` | `44px` |  |
| `paddingX` | `{spacing.scale.3}` | spacing.scale.3 |
| `placeholderColor` | `{themes.{active}.text.tertiary}` | themes.{active}.text.tertiary |

### modal

| Token | Value | Notes |
|-------|-------|-------|
| `background` | `{themes.{active}.surface.elevated}` | themes.{active}.surface.elevated |
| `overlay` | `{themes.{active}.surface.overlay}` | themes.{active}.surface.overlay |
| `borderRadius` | `{radii.3xl}` | radii.3xl |
| `shadow` | `{shadows.xl}` | shadows.xl |
| `blur` | `{themes.{active}.glass.blur}` | themes.{active}.glass.blur |
| `zIndex` | `{zIndex.modal}` | zIndex.modal |
| `maxWidth` | `32rem` |  |

### sidebar

| Token | Value | Notes |
|-------|-------|-------|
| `widthExpanded` | `240px` |  |
| `widthCollapsed` | `64px` |  |
| `background` | `{themes.{active}.surface.elevated}` | themes.{active}.surface.elevated |
| `border` | `{themes.{active}.border.subtle}` | themes.{active}.border.subtle |

### toast

| Token | Value | Notes |
|-------|-------|-------|
| `zIndex` | `{zIndex.toast}` | zIndex.toast |
| `borderRadius` | `{radii.lg}` | radii.lg |
| `shadow` | `{shadows.lg}` | shadows.lg |
| `autoDismiss` | `5000ms` |  |

### viewport

Concrete browser chrome theme colors for metadata and PWA surfaces. Meta tags require concrete color strings, so these are centralized here instead of hardcoded in layouts/providers.
| Token | Value | Notes |
|-------|-------|-------|
| `appDarkThemeColor` | `{themes.liquid-glass-dark.surface.base}` | themes.liquid-glass-dark.surface.base |
| `publicGalleryThemeColor` | `{themes.liquid-glass.accent.primary}` | themes.liquid-glass.accent.primary |

### gallery

| Token | Value | Notes |
|-------|-------|-------|
| `gridGap` | `{spacing.scale.3}` | spacing.scale.3 |
| `columnsMobile` | `1` |  |
| `columnsTablet` | `2` |  |
| `columnsDesktop` | `3-4` |  |
| `imageRadius` | `{radii.lg}` | radii.lg |
| `hoverOverlayBg` | `hsla(0, 0%, 0%, 0.4)` |  |
| `staggerDelay` | `50ms` |  |

### mediaCover

Readability tokens for photographic cover heroes and the Cover & Design editor. These values keep text legible over busy imagery without per-page hardcoded rgba formulas.
| Token | Value | Notes |
|-------|-------|-------|
| `heroMinHeight` | `60vh` |  |
| `heroMaxHeight` | `85vh` |  |
| `textBackdropRadius` | `{radii.xl}` | radii.xl |
| `textBackdropPadding` | `0.12em 0.26em` |  |
| `textShadow` | `var(--cover-text-shadow)` |  |
| `scrimAuto` | `var(--cover-scrim-auto)` |  |
| `scrimDark` | `var(--cover-scrim-dark)` |  |
| `presetColors` | `{"textMedia":"#ffffff","warmTitle":"#fffaf0","warmSubtitle":"#e6c36a","haldiTitle":"#fff8e7","haldiSubtitle":"#f5c84b","warmAccent":"#B7791F","editorialTitle":"#172033","editorialSubtitle":"#344054","receptionSubtitle":"#dbeafe"}` |  |

### qrCode

QR export colors. QR modules stay fixed high-contrast for scanner reliability rather than theme-dependent.
| Token | Value | Notes |
|-------|-------|-------|
| `dark` | `#000000` |  |
| `light` | `#ffffff` |  |

### skeleton

| Token | Value | Notes |
|-------|-------|-------|
| `baseColor` | `{themes.{active}.surface.sunken}` | themes.{active}.surface.sunken |
| `shimmerDuration` | `{motion.duration.shimmer}` | motion.duration.shimmer |
| `shimmerEasing` | `linear` |  |

### focusRing

| Token | Value | Notes |
|-------|-------|-------|
| `width` | `3px` |  |
| `offset` | `3px` |  |
| `color` | `{themes.{active}.border.focus}` | themes.{active}.border.focus |
| `style` | `solid` |  |

### touchTarget

| Token | Value | Notes |
|-------|-------|-------|
| `minimum` | `44px` | Apple default touch target; exceeds WCAG 2.5.8 minimum |
| `gap` | `12px` | Preferred gap between touch targets |

## Preferences

- **Dark mode default:** false
- **Mobile first:** N/A
- **UI library:** N/A
- **Design variance:** 5
- **Visual density:** 5
- **Allow raw colors:** false
