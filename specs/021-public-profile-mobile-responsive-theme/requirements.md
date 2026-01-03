# Requirements Document: Public Profile Mobile Responsiveness & Theme Enhancement

> **Spec ID:** 021-public-profile-mobile-responsive-theme
> **Status:** Draft
> **Created:** 2026-01-03
> **Last Updated:** 2026-01-03
> **Owner:** Engineering Team

---

## Overview

This specification addresses critical UX issues with the company public profile page (`/p/{slug}`) that is currently not mobile-first, not responsive, has layout problems, and lacks theme switching capabilities.

### Problem Statement

The current public profile page has several critical issues:

1. **Not Mobile-First:** The design doesn't prioritize mobile experiences
2. **Not Responsive:** Layout doesn't adapt properly to different screen resolutions
3. **Misaligned Elements:** Logo, buttons (QR Code, website link) are poorly positioned and scattered
4. **No Theme Support:** Doesn't adopt system theme preferences (light/dark mode)
5. **No Theme Switcher:** Users cannot manually toggle between light and dark themes

### Impact

These issues severely impact user experience, particularly for mobile users who represent a significant portion of profile visitors. Poor mobile UX leads to:
- High bounce rates
- Poor professional impression
- Reduced engagement with contact actions
- Accessibility concerns

---

## Requirements

### Requirement 1: Mobile-First Responsive Layout

**User Story:** As a visitor accessing a public profile on a mobile device, I want the page to be optimized for mobile viewing, so that I can easily read content and interact with all features.

#### Acceptance Criteria

1. WHEN a visitor accesses the public profile on a mobile device (320px-767px), THE System SHALL display a single-column layout with all content stacked vertically
2. WHEN a visitor accesses the public profile on a tablet (768px-1023px), THE System SHALL display a responsive layout optimized for tablet viewing
3. WHEN a visitor accesses the public profile on desktop (1024px+), THE System SHALL display the full multi-column layout
4. WHEN viewing on any device, THE System SHALL ensure touch targets are at least 44x44px for interactive elements
5. WHEN viewing on mobile, THE System SHALL ensure text is readable without zooming (minimum 16px body text)
6. THE System SHALL use responsive images that adapt to device resolution
7. THE System SHALL ensure smooth animations and transitions work on mobile devices

#### Technical Notes
- Use Tailwind responsive breakpoints: `sm:`, `md:`, `lg:`, `xl:`, `2xl:`
- Apply mobile-first CSS principles (base styles for mobile, enhance for larger screens)
- Test on real devices and browser dev tools

---

### Requirement 2: Proper Element Alignment and Layout

**User Story:** As a visitor, I want to see all profile elements properly aligned and organized, so that I can easily understand the profile structure and take actions.

#### Acceptance Criteria

1. WHEN viewing the hero section, THE System SHALL display the company logo centered above the company name
2. WHEN viewing the hero section, THE System SHALL display action buttons (View Portfolio, Book Session) below the tagline in a row on desktop and stacked on mobile
3. WHEN viewing the contact section, THE System SHALL display the QR Code and vCard download buttons in a horizontal row on desktop and in a grid on mobile
4. WHEN viewing the website link button, THE System SHALL display it below the company name in the StudioInfoCard
5. WHEN viewing custom links/services, THE System SHALL display them in a responsive grid (1 column mobile, 2 columns tablet, 3 columns desktop)
6. THE System SHALL ensure all buttons maintain consistent spacing using Tailwind gap utilities
7. THE System SHALL use proper container widths (`container mx-auto px-4`) for consistent alignment

#### Technical Notes
- Update [HeroGlassCard.tsx](file:///Users/v13478/Desktop/RawDrive/frontend/src/components/features/profile/public/HeroGlassCard.tsx)
- Update [StudioInfoCard.tsx](file:///Users/v13478/Desktop/RawDrive/frontend/src/components/features/profile/public/StudioInfoCard.tsx)
- Update [ContactMethodsCard.tsx](file:///Users/v13478/Desktop/RawDrive/frontend/src/components/features/profile/public/ContactMethodsCard.tsx)
- Update [ServicesGlassGrid.tsx](file:///Users/v13478/Desktop/RawDrive/frontend/src/components/features/profile/public/ServicesGlassGrid.tsx)

---

### Requirement 3: System Theme Detection

**User Story:** As a visitor, I want the public profile to respect my device's color scheme preference, so that the page is comfortable to view in my preferred mode.

#### Acceptance Criteria

1. WHEN a visitor accesses the profile with dark mode system preference, THE System SHALL render the profile in dark theme
2. WHEN a visitor accesses the profile with light mode system preference, THE System SHALL render the profile in light theme
3. WHEN the system theme changes while viewing the profile, THE System SHALL automatically update to match the new preference
4. WHEN rendering in dark mode, THE System SHALL use appropriate dark mode colors from the design system
5. WHEN rendering in light mode, THE System SHALL use appropriate light mode colors from the design system
6. THE System SHALL ensure sufficient contrast ratios (WCAG AA minimum 4.5:1 for text) in both themes
7. THE System SHALL apply dark mode classes using Tailwind's `dark:` variant

#### Technical Notes
- Implement `useMediaQuery` hook to detect `prefers-color-scheme: dark`
- Apply `dark` class to root element when dark mode is preferred
- Use existing Tailwind dark mode variant classes throughout components
- Test contrast ratios using browser dev tools

---

### Requirement 4: Manual Theme Switcher

**User Story:** As a visitor, I want to manually toggle between light and dark themes, so that I can view the profile in my preferred color scheme regardless of system settings.

#### Acceptance Criteria

1. WHEN viewing the public profile, THE System SHALL display a theme toggle button in the header/top-right corner
2. WHEN a visitor clicks the theme toggle button, THE System SHALL switch between light and dark themes
3. WHEN a theme is manually selected, THE System SHALL persist the preference in localStorage
4. WHEN a visitor returns to the profile, THE System SHALL remember and apply their previously selected theme
5. WHEN manually switching themes, THE System SHALL animate the transition smoothly
6. THE theme toggle button SHALL display a sun icon for light mode and moon icon for dark mode
7. THE theme toggle button SHALL be accessible via keyboard (Tab + Enter/Space)
8. THE System SHALL provide visual feedback when hovering/focusing the theme toggle button

#### Technical Notes
- Create a `ThemeToggle` component with sun/moon icons
- Use localStorage key: `rawdrive-theme-preference-public-{slug}`
- Implement smooth transition using Tailwind transition classes
- Position toggle button in top-right corner with fixed positioning
- Ensure toggle works independently from system preference

---

### Requirement 5: Glass Morphism Effects Responsiveness

**User Story:** As a visitor, I want the glass morphism effects to work properly on all devices and themes, so that the visual design remains consistent and appealing.

#### Acceptance Criteria

1. WHEN viewing on mobile, THE System SHALL ensure glass effects don't cause performance issues
2. WHEN viewing in dark mode, THE System SHALL adjust glass effect opacity and backdrop blur for dark backgrounds
3. WHEN viewing in light mode, THE System SHALL use lighter glass effects appropriate for light backgrounds
4. WHEN hovering over glass cards (desktop), THE System SHALL show subtle hover effects
5. THE System SHALL ensure glass borders are visible in both light and dark themes
6. THE System SHALL use appropriate backdrop-blur values that work across browsers
7. THE System SHALL fall back gracefully for browsers that don't support backdrop-filter

#### Technical Notes
- Update CSS variables for glass effects in both themes:
  - `--glass-1`, `--glass-2` for light mode
  - Dark mode equivalents
- Test backdrop-blur browser support
- Use `@supports` for graceful degradation
- Optimize blur radius for mobile performance

---

### Requirement 6: Typography Responsiveness

**User Story:** As a visitor, I want text to be readable and properly sized on all devices, so that I can easily read profile content.

#### Acceptance Criteria

1. WHEN viewing on mobile (< 640px), THE System SHALL use smaller font sizes (text-2xl for h1, text-xl for h2)
2. WHEN viewing on tablet (640px-1024px), THE System SHALL use medium font sizes (text-4xl for h1, text-2xl for h2)
3. WHEN viewing on desktop (> 1024px), THE System SHALL use large font sizes (text-6xl for h1, text-3xl for h2)
4. WHEN theme fonts are applied, THE System SHALL ensure they load properly on all devices
5. WHEN theme fonts fail to load, THE System SHALL fall back to system fonts
6. THE System SHALL ensure line heights are appropriate for readability (1.5-1.6 for body text)
7. THE System SHALL ensure text wraps properly without overflow

#### Technical Notes
- Use Tailwind responsive text classes: `text-2xl sm:text-4xl lg:text-6xl`
- Apply responsive line heights: `leading-tight sm:leading-snug lg:leading-normal`
- Test font loading on slow connections
- Implement font-display: swap for custom fonts

---

### Requirement 7: Action Buttons Responsiveness

**User Story:** As a visitor, I want all action buttons (vCard, QR Code, Book Now, etc.) to be easily accessible and usable on mobile devices.

#### Acceptance Criteria

1. WHEN viewing on mobile, THE System SHALL ensure buttons are at least 44x44px (iOS minimum touch target)
2. WHEN viewing on mobile, THE System SHALL stack buttons vertically or use a proper grid with adequate spacing
3. WHEN viewing on desktop, THE System SHALL display buttons in horizontal rows where appropriate
4. WHEN clicking any button on mobile, THE System SHALL provide clear visual feedback (active state)
5. WHEN buttons contain icons + text, THE System SHALL ensure proper spacing (gap-2) between icon and text
6. THE System SHALL ensure button text doesn't wrap awkwardly on narrow screens
7. THE System SHALL ensure button hover effects work on desktop and touch feedback works on mobile

#### Technical Notes
- Update button components to use `min-h-[44px] min-w-[44px]`
- Use Tailwind active states: `active:scale-95`
- Implement responsive button layouts: `flex flex-col sm:flex-row gap-3`
- Test on touch devices for proper feedback

---

### Requirement 8: Loading and Error States

**User Story:** As a visitor, I want to see appropriate feedback while the profile loads or if an error occurs, with proper styling in both themes.

#### Acceptance Criteria

1. WHEN the profile is loading, THE System SHALL display a loading spinner centered on the page
2. WHEN loading in dark mode, THE spinner SHALL use dark mode colors
3. WHEN loading in light mode, THE spinner SHALL use light mode colors
4. WHEN an error occurs (404, network error), THE System SHALL display an error message with proper theme styling
5. WHEN displaying errors, THE System SHALL provide a "Go Home" button that works on all devices
6. THE System SHALL ensure loading and error states are responsive to screen size
7. THE System SHALL ensure loading spinner is accessible (aria-label)

#### Technical Notes
- Update loading state in [PublicProfileView.tsx](file:///Users/v13478/Desktop/RawDrive/frontend/src/components/features/profile/public/PublicProfileView.tsx)
- Use `dark:bg-gray-900` for dark mode loading background
- Ensure error pages are mobile-responsive
- Add proper ARIA labels for loading states

---

### Requirement 9: Image Optimization

**User Story:** As a visitor, I want images (logo, background) to load quickly and display properly on all devices and screen densities.

#### Acceptance Criteria

1. WHEN viewing on mobile, THE System SHALL load appropriately sized images for mobile screens
2. WHEN viewing on high-DPI screens (Retina), THE System SHALL load 2x resolution images where available
3. WHEN viewing the logo, THE System SHALL display it at appropriate sizes (64px mobile, 96px tablet, 128px desktop)
4. WHEN images are loading, THE System SHALL show a placeholder with proper dimensions
5. WHEN images fail to load, THE System SHALL display a fallback (first letter of company name)
6. THE System SHALL use lazy loading for images below the fold
7. THE System SHALL serve images in modern formats (WebP with JPEG fallback)

#### Technical Notes
- Implement responsive image sizes using srcset
- Add loading="lazy" to images below fold
- Use CSS aspect ratio to prevent layout shift
- Test on various screen densities

---

### Requirement 10: Accessibility Compliance

**User Story:** As a visitor using assistive technology, I want the public profile to be fully accessible, so that I can navigate and interact with all features.

#### Acceptance Criteria

1. WHEN using keyboard navigation, THE System SHALL allow tabbing through all interactive elements in logical order
2. WHEN using a screen reader, THE System SHALL provide meaningful labels for all buttons and links
3. WHEN theme is changed, THE System SHALL announce the change to screen readers
4. WHEN viewing in high contrast mode, THE System SHALL ensure all content is visible
5. THE System SHALL maintain focus indicators visible on all interactive elements
6. THE System SHALL ensure color is not the only means of conveying information
7. THE System SHALL provide skip links to main content sections

#### Technical Notes
- Add aria-labels to all icon-only buttons
- Implement focus-visible styles
- Test with NVDA, JAWS, and VoiceOver
- Ensure WCAG 2.1 AA compliance

---

## Non-Functional Requirements

### Performance
- First Contentful Paint (FCP) < 1.5s on 4G
- Largest Contentful Paint (LCP) < 2.5s on 4G
- Cumulative Layout Shift (CLS) < 0.1
- Time to Interactive (TTI) < 3s on 4G
- Page size < 500KB (uncompressed)

### Browser Support
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- Mobile Safari iOS 14+
- Chrome Android 90+

### Device Support
- iPhone SE (320px width) to iPhone 14 Pro Max
- Android phones (360px width minimum)
- iPads and Android tablets
- Desktop screens up to 4K

---

## Out of Scope

The following items are explicitly out of scope for this specification:

1. Backend API changes (profile data structure remains unchanged)
2. Theme editor/customization UI (this is for viewing only)
3. Profile editor improvements
4. Analytics tracking implementation
5. Social media sharing functionality changes
6. SEO optimization beyond basic meta tags
7. Custom domain support

---

## Dependencies

### Internal Dependencies
- Existing design system tokens and Tailwind configuration
- Font loading service (`fontService.ts`)
- Company profile API endpoints
- Theme transformer utility (`themeTransformer.ts`)

### External Dependencies
- Tailwind CSS v3.x
- React 18.x
- Lucide React icons
- Google Fonts API

---

## Success Metrics

### Key Performance Indicators (KPIs)

1. **Mobile Usability**
   - Mobile bounce rate < 40%
   - Mobile time on page > 45 seconds
   - Mobile action completion rate > 25%

2. **Responsive Design**
   - Zero horizontal scroll issues on any screen size
   - Touch target compliance 100%
   - Layout shift score < 0.1

3. **Theme Adoption**
   - 40%+ of users manually switch theme preference
   - Theme preference retention rate > 80%

4. **Accessibility**
   - Lighthouse accessibility score > 95
   - WCAG 2.1 AA compliance 100%
   - Keyboard navigation success rate 100%

5. **Performance**
   - Lighthouse performance score > 90
   - Mobile LCP < 2.5s
   - Desktop LCP < 2.0s

---

## Testing Strategy

### Unit Tests
- Component rendering in light/dark modes
- Theme switcher functionality
- Responsive utility functions
- localStorage persistence

### Integration Tests
- Theme switching across components
- Responsive layout changes
- Font loading and fallbacks
- Action button functionality

### Visual Regression Tests
- Screenshots at all breakpoints
- Light and dark theme screenshots
- Glass effect rendering
- Typography scaling

### Manual Testing
- Real device testing (iOS, Android)
- Browser compatibility testing
- Screen reader testing
- Keyboard navigation testing

### Performance Testing
- Lighthouse CI on multiple devices
- WebPageTest audits
- Network throttling tests (3G, 4G, WiFi)

---

## Rollout Plan

### Phase 1: Core Responsiveness (Week 1)
- Fix mobile layout issues
- Implement proper responsive breakpoints
- Fix element alignment
- Test on real devices

### Phase 2: Theme System (Week 2)
- Implement system theme detection
- Create theme toggle component
- Add dark mode styles
- Implement localStorage persistence

### Phase 3: Polish & Optimization (Week 3)
- Optimize images and assets
- Improve loading states
- Enhance animations
- Performance optimization

### Phase 4: Testing & Launch (Week 4)
- Comprehensive testing
- Accessibility audit
- Performance audit
- Production deployment

---

## Related Documents

- [docs/Features/COMPANY_PROFILE_AND_THEMES.md](file:///Users/v13478/Desktop/RawDrive/docs/Features/COMPANY_PROFILE_AND_THEMES.md)
- [docs/TechnicalSpecs/public_profile.json](file:///Users/v13478/Desktop/RawDrive/docs/TechnicalSpecs/public_profile.json)
- [.kiro/specs/public-profile-sync-themes/](file:///Users/v13478/Desktop/RawDrive/.kiro/specs/public-profile-sync-themes/)
- [.github/copilot-instructions.md](file:///Users/v13478/Desktop/RawDrive/.github/copilot-instructions.md)

---

## Change Log

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-01-03 | 1.0 | Engineering Team | Initial requirements document |
