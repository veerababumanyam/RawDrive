# Visual Regression Testing Guide

## Feature: 021-public-profile-mobile-responsive-theme

This document describes the visual regression testing requirements for the Public Profile mobile responsiveness and theme enhancement feature.

## Test Scenarios

### 1. Breakpoint Screenshots

Capture screenshots at each responsive breakpoint in both light and dark themes:

| Viewport | Width | Description |
|----------|-------|-------------|
| Mobile XS | 320px | iPhone SE / Small Android |
| Mobile SM | 375px | iPhone 12/13/14 |
| Mobile MD | 414px | iPhone Plus / Large Android |
| Tablet | 768px | iPad Portrait |
| Tablet LG | 1024px | iPad Landscape |
| Desktop | 1280px | Standard Desktop |
| Desktop LG | 1440px | Large Desktop |

### 2. Theme States

For each breakpoint, capture:
- **Light mode** (system preference: light)
- **Dark mode** (system preference: dark)
- **Manual toggle** from light → dark
- **Manual toggle** from dark → light

### 3. Component States

#### Loading State
- URL: `/p/test-slug` (with loading delay)
- Verify spinner is centered
- Verify glass container background
- Verify theme toggle is visible

#### Error State
- URL: `/p/nonexistent-slug`
- Verify 404 error card styling
- Verify "Try Again" and "Go Home" buttons
- Verify glass morphism effect

#### Full Profile View
- URL: `/p/demo-studio`
- Components to verify:
  - HeroGlassCard (logo, name, tagline, CTAs)
  - ContactMethodsCard (email, phone, address, socials)
  - ServicesGlassGrid (custom links)
  - FooterGlassStrip (copyright, branding)
  - ThemeToggle (fixed position)

### 4. Interactive States

Capture hover/focus states for:
- [ ] Theme toggle button (hover, focus-visible)
- [ ] CTA buttons in hero (hover, focus-visible, active)
- [ ] Contact method cards (hover, lift effect)
- [ ] Social media icons (hover, scale effect)
- [ ] Service link cards (hover, sweep effect)
- [ ] Footer links (hover, underline)

### 5. Animation States

Verify animations work correctly:
- [ ] Background orbs gentle floating (motion-reduce: disabled)
- [ ] Theme toggle icon rotation
- [ ] Card lift effects on hover
- [ ] Scroll indicator pulse

### 6. Reduced Motion

Test with `prefers-reduced-motion: reduce`:
- [ ] All animations should be disabled
- [ ] Static states should still look correct
- [ ] Transitions should be minimal/instant

## Manual Testing Checklist

### Mobile Testing (Real Devices)

#### iOS Safari
- [ ] iPhone SE (320px) - Light mode
- [ ] iPhone SE (320px) - Dark mode
- [ ] iPhone 14 Pro (393px) - Light mode
- [ ] iPhone 14 Pro (393px) - Dark mode
- [ ] iPad (768px portrait) - Both themes
- [ ] Verify touch targets are 44px minimum
- [ ] Test theme toggle tap response

#### Android Chrome
- [ ] Samsung Galaxy S21 (360px) - Light mode
- [ ] Samsung Galaxy S21 (360px) - Dark mode
- [ ] Pixel 7 (412px) - Both themes
- [ ] Android tablet - Both themes

### Desktop Testing

#### Chrome
- [ ] 1280px - Light mode
- [ ] 1280px - Dark mode
- [ ] 1440px - Both themes
- [ ] 1920px - Both themes

#### Firefox
- [ ] 1280px - Light mode
- [ ] 1280px - Dark mode

#### Safari (macOS)
- [ ] 1280px - Light mode
- [ ] 1280px - Dark mode

#### Edge
- [ ] 1280px - Light mode
- [ ] 1280px - Dark mode

### Accessibility Testing

- [ ] Run Lighthouse accessibility audit (target: 95+)
- [ ] Test keyboard-only navigation
- [ ] Test with VoiceOver (macOS)
- [ ] Test with NVDA (Windows)
- [ ] Verify focus indicators are visible
- [ ] Verify color contrast ratios (4.5:1 for text)

### Glass Effect Testing

Browsers without backdrop-filter support should fall back gracefully:
- [ ] Verify solid background appears
- [ ] Verify content remains readable
- [ ] No visual artifacts

## Baseline Image Requirements

Store baseline images in:
```
/tests/visual-regression/baselines/public-profile/
├── mobile-xs-light.png
├── mobile-xs-dark.png
├── mobile-sm-light.png
├── mobile-sm-dark.png
├── tablet-light.png
├── tablet-dark.png
├── desktop-light.png
├── desktop-dark.png
├── loading-light.png
├── loading-dark.png
├── error-light.png
└── error-dark.png
```

## Playwright Test Example

```typescript
// tests/visual/public-profile.spec.ts
import { test, expect } from '@playwright/test';

const breakpoints = [
  { name: 'mobile-xs', width: 320, height: 568 },
  { name: 'mobile-sm', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
];

const themes = ['light', 'dark'];

test.describe('Public Profile Visual Regression', () => {
  for (const breakpoint of breakpoints) {
    for (const theme of themes) {
      test(`${breakpoint.name}-${theme}`, async ({ page }) => {
        await page.setViewportSize({
          width: breakpoint.width,
          height: breakpoint.height,
        });

        // Set color scheme
        await page.emulateMedia({ colorScheme: theme });

        await page.goto('/p/demo-studio');
        await page.waitForLoadState('networkidle');

        await expect(page).toHaveScreenshot(
          `public-profile-${breakpoint.name}-${theme}.png`,
          { fullPage: true }
        );
      });
    }
  }
});
```

## Pass/Fail Criteria

- **Pixel difference threshold**: 0.1% (1000 pixels on 1M pixel image)
- **Anti-aliasing tolerance**: Enabled
- **Layout shift tolerance**: 1 pixel

## CI Integration Notes

For CI/CD integration:
1. Install Playwright: `npm i -D @playwright/test`
2. Add to GitHub Actions workflow
3. Store baselines in LFS or separate repo
4. Configure failure notifications

## Known Issues

1. **Backdrop-filter rendering**: May differ slightly between browsers
2. **Font rendering**: Anti-aliasing varies by OS
3. **Animation frames**: Disable animations for consistent snapshots

## Related Files

- [GlassContainer.tsx](../GlassContainer.tsx)
- [HeroGlassCard.tsx](../HeroGlassCard.tsx)
- [ContactMethodsCard.tsx](../ContactMethodsCard.tsx)
- [ServicesGlassGrid.tsx](../ServicesGlassGrid.tsx)
- [FooterGlassStrip.tsx](../FooterGlassStrip.tsx)
- [usePublicProfileTheme.ts](../../../../../hooks/usePublicProfileTheme.ts)
