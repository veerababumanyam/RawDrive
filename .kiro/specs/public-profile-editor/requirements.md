# Requirements Document

## Introduction

The Public Profile Editor provides photographers with a powerful, unified interface to create and customize their automatically-generated public profile pages. This system extends the existing `public_profile` technical spec by adding granular per-field visibility control, live multi-device preview, modern theming with deep customization, and professional typography management—all in one cohesive editing experience that updates the public profile in real-time.

**Note**: This specification extends the existing `company_profiles`, `photographer_profiles`, and `branding_profiles` tables from the `public_profile.json` technical spec, adding enhanced editor capabilities and theming features.

## Glossary

- **Public_Profile**: Automatically-generated public-facing page at /p/{slug} showcasing photographer's business information (extends existing public_profile spec)
- **CompanyProfile**: Business profile entity from company_profiles table (existing)
- **PhotographerProfile**: Individual photographer profile from photographer_profiles table (existing)
- **BrandingProfile**: Visual branding configuration from branding_profiles table (existing, to be enhanced)
- **Profile_Editor**: Unified interface combining visibility controls, preview, theming, and typography management (NEW)
- **Visibility_Toggle**: Per-field control determining if information appears on the public profile (NEW)
- **Live_Preview**: Real-time rendering of public profile changes across device breakpoints (NEW)
- **Theme**: Pre-built design template with colors, gradients, layouts, and typography (NEW)
- **Theme_Customization**: Photographer-specific modifications to base themes (colors, fonts, layouts) (NEW)
- **Device_Mode**: Preview breakpoint (Phone, Tablet, Desktop) for responsive testing (NEW)
- **Color_Palette**: Coordinated set of brand colors (primary, secondary, accent, neutral) (NEW)
- **Custom_Font**: User-uploaded brand font files (.woff2, .ttf) for typography (NEW)
- **Brand_Asset**: Logo variants, favicons, and other visual identity elements (NEW)
- **Workspace**: Multi-tenant workspace identifier for data isolation (existing)

## Requirements

### Requirement 1: Per-Field Visibility Controls

**User Story:** As a photographer, I want granular control over which profile fields are publicly visible, so that I can share appropriate business information while maintaining privacy.

#### Acceptance Criteria

1. THE System SHALL provide individual visibility toggles for all profile fields (name, tagline, logo, email, phone, website, address components)
2. WHEN a user toggles field visibility, THE System SHALL update the configuration immediately and reflect changes in the live preview
3. THE System SHALL provide per-platform visibility toggles for each social media platform (Instagram, Facebook, WhatsApp, TikTok, LinkedIn, YouTube)
4. WHEN a social platform visibility is disabled, THE System SHALL completely omit it from public rendering (no placeholders or empty elements)
5. THE System SHALL render visibility toggles as eye icons or switches next to each field input
6. THE System SHALL provide "Show All" and "Hide All" bulk visibility controls
7. THE System SHALL allow creating and saving visibility presets (e.g., "Minimal", "Full", "Business Only")
8. THE System SHALL provide default visibility settings for new profiles (sensible defaults based on field type)
9. WHEN changing themes, THE System SHALL preserve all visibility settings without override
10. THE System SHALL persist visibility settings with the company profile and apply consistently across all themes

### Requirement 2: Live Multi-Device Preview Panel

**User Story:** As a photographer, I want to see a live preview of my public profile across different devices while editing, so that I can ensure my branding looks perfect on all screen sizes.

#### Acceptance Criteria

1. WHEN editing profile, THE System SHALL display a live preview panel showing the automatically-generated public profile
2. THE System SHALL provide three device mode selectors: Phone (375px), Tablet (768px), Desktop (1440px)
3. WHEN switching device modes, THE System SHALL instantly resize the preview frame to the corresponding breakpoint
4. WHEN toggling field visibility, THE System SHALL update the preview in real-time (< 100ms)
5. WHEN changing theme or theme options, THE System SHALL update the preview immediately
6. WHEN editing profile data (name, tagline, logo, links), THE System SHALL reflect changes in the preview instantly
7. THE System SHALL render the preview using the exact same components as the live public profile at /p/{slug}
8. THE System SHALL make the preview read-only to prevent accidental edits within the preview frame
9. THE System SHALL preserve current theme and visibility state when switching device modes
10. THE System SHALL accurately reflect final public profile layout, responsiveness, and interactions
11. THE System SHALL provide split-screen comparison between two themes
12. THE System SHALL allow comparing current live version vs. draft changes
13. THE System SHALL highlight differences between versions in comparison mode

### Requirement 3: Theme Gallery and Selection

**User Story:** As a photographer, I want to browse and select from modern, premium themes, so that I can find the perfect style for my brand quickly.

#### Acceptance Criteria

1. THE System SHALL display a theme gallery with preview thumbnails for all available themes
2. WHEN hovering over a theme thumbnail, THE System SHALL show an enlarged preview
3. THE System SHALL organize themes by categories (Minimal, Bold, Elegant, Modern, Creative)
4. THE System SHALL allow filtering themes by style, color scheme, and layout type
5. THE System SHALL show "Popular" and "Recommended" theme badges based on usage
6. THE System SHALL provide at least 5 pre-built modern themes featuring gradients, layered colors, and glassmorphism
7. WHEN a user selects a theme, THE System SHALL apply it immediately to the live preview and public profile
8. THE System SHALL support both light and dark theme variants where appropriate
9. THE System SHALL allow saving custom theme configurations as personal presets
10. THE System SHALL provide theme templates as starting points for customization

### Requirement 4: Theme Customization System

**User Story:** As a photographer, I want to deeply customize my chosen theme to match my brand, so that my public profile is unique and on-brand.

#### Acceptance Criteria

1. WHEN customizing a theme, THE System SHALL allow setting primary, secondary, and accent colors
2. WHEN customizing a theme, THE System SHALL allow adjusting background gradients, patterns, and intensity
3. WHEN customizing a theme, THE System SHALL allow configuring layout options (compact vs. spacious, card vs. full-bleed hero)
4. THE System SHALL save theme customizations per photographer account
5. THE System SHALL apply customizations only to that photographer's public profile URL
6. THE System SHALL ensure all themes remain responsive and accessible regardless of customization choices
7. THE System SHALL maintain focus states and ARIA attributes across all theme variations
8. WHEN making customizations, THE System SHALL show changes instantly in the live preview
9. THE System SHALL provide "Reset to theme defaults" option for customizations
10. THE System SHALL allow duplicating and modifying existing custom themes

### Requirement 5: Color Palette Management

**User Story:** As a photographer, I want to build and manage brand color palettes, so that my public profile colors are consistent and professional.

#### Acceptance Criteria

1. THE System SHALL provide a color palette builder with primary, secondary, accent, and neutral color slots
2. WHEN uploading a logo, THE System SHALL extract dominant colors and suggest a palette
3. THE System SHALL provide color harmony suggestions (complementary, analogous, triadic schemes)
4. THE System SHALL allow saving multiple color palettes and switching between them
5. THE System SHALL provide color palette export in common formats (CSS variables, JSON)
6. WHEN users pick colors, THE System SHALL enforce automatic contrast checks for WCAG 2.1 AA compliance
7. WHEN color combinations fail readability standards (contrast ratio < 4.5:1), THE System SHALL show warnings and offer adjusted suggestions
8. THE System SHALL provide a color picker with hex, RGB, and HSL input modes
9. THE System SHALL show live preview of color changes across all public profile elements
10. THE System SHALL allow importing color palettes from popular design tools

### Requirement 6: Typography and Font Management

**User Story:** As a photographer, I want to select professional fonts or upload my own brand fonts, so that my public profile typography matches my brand identity perfectly.

#### Acceptance Criteria

1. THE System SHALL provide a curated list of at least 20 high-quality web fonts for heading, body, and accent roles
2. WHEN a user selects fonts, THE System SHALL apply them immediately to the live preview and public profile
3. THE System SHALL allow users to upload custom brand fonts (.woff2, .ttf formats)
4. WHEN uploading custom fonts, THE System SHALL validate file type, size (max 500KB per file), and basic security constraints
5. THE System SHALL generate @font-face configuration scoped to that photographer's public profile only
6. THE System SHALL allow users to map uploaded fonts to roles (heading/body/accent) via dropdowns
7. WHEN custom fonts are applied, THE System SHALL show the effect instantly in the preview
8. THE System SHALL define sensible fallback fonts for all custom fonts (system font stack)
9. THE System SHALL ensure font loading does not cause significant performance degradation (< 200ms)
10. THE System SHALL prevent layout shift on first paint using font-display: swap
11. THE System SHALL sanitize uploaded font files to prevent security vulnerabilities
12. THE System SHALL provide font preview with sample text in multiple sizes
13. THE System SHALL suggest font pairings that work well together
14. THE System SHALL warn when font combinations have poor readability

### Requirement 7: Brand Asset Management

**User Story:** As a photographer, I want to manage multiple logo variants and brand assets, so that my branding looks perfect in different contexts and themes.

#### Acceptance Criteria

1. THE System SHALL allow uploading multiple logo variants (full logo, icon only, light version, dark version)
2. WHEN a theme is applied, THE System SHALL automatically select the appropriate logo variant based on theme background
3. THE System SHALL optimize uploaded logos for web delivery (WebP, AVIF formats with fallbacks)
4. THE System SHALL provide logo usage guidelines (minimum size, clear space recommendations)
5. THE System SHALL maintain a brand asset library accessible across all galleries
6. THE System SHALL track version history for all brand assets (last 10 versions)
7. THE System SHALL allow bulk replacement of logos across all galleries
8. THE System SHALL validate logo file formats (PNG, SVG, JPG) and sizes (max 5MB)
9. THE System SHALL generate favicon automatically from uploaded logo if not provided separately
10. THE System SHALL provide asset preview in different contexts (light/dark backgrounds, various sizes)

### Requirement 8: Unified Editor Layout and UX

**User Story:** As a photographer, I want all profile editing features in one cohesive interface, so that I can efficiently create my perfect public profile without switching between screens.

#### Acceptance Criteria

1. THE System SHALL combine visibility toggles, live preview, theme selection, and font management in one unified screen
2. THE System SHALL organize editor sections with clear visual hierarchy (sidebar for controls, main area for preview)
3. THE System SHALL provide collapsible sections for different editing categories (Visibility, Theme, Typography, Assets)
4. WHEN making any change, THE System SHALL persist it immediately to the photographer's account
5. THE System SHALL provide "Undo" (Ctrl/Cmd+Z) and "Redo" (Ctrl/Cmd+Shift+Z) functionality for recent changes
6. THE System SHALL maintain undo history for at least 20 actions
7. THE System SHALL provide "Reset to defaults" options for visibility, theme, and font settings with confirmation dialog
8. THE System SHALL provide clear visual feedback for all user actions (loading states, success/error messages)
9. THE System SHALL maintain consistent UI patterns across all editor sections
10. THE System SHALL ensure the editor is fully keyboard navigable with logical tab order
11. THE System SHALL provide tooltips and help text for complex features
12. THE System SHALL support responsive editor layout optimized for tablets (768px+)
13. THE System SHALL provide touch-optimized controls for mobile/tablet editing
14. THE System SHALL offer a "Quick Edit" mode for simple changes on mobile devices

### Requirement 9: Preview Sharing and Collaboration

**User Story:** As a photographer, I want to share my public profile preview with clients or team members for feedback, so that I can ensure everyone is happy with the branding before publishing.

#### Acceptance Criteria

1. THE System SHALL generate shareable preview links with configurable expiration (24h, 7d, 30d)
2. WHEN accessing a preview link, THE System SHALL display the profile in preview mode with a banner indicating it's not live
3. THE System SHALL allow adding comments and feedback on specific elements
4. THE System SHALL provide side-by-side comparison of current live version vs. preview
5. THE System SHALL support approval workflow for team/enterprise accounts
6. THE System SHALL notify the owner when feedback is received
7. THE System SHALL allow publishing directly from approved preview
8. THE System SHALL track who viewed the preview and when
9. THE System SHALL allow revoking preview links before expiration
10. THE System SHALL provide password protection option for preview links

### Requirement 10: Profile Backup and Version Control

**User Story:** As a photographer, I want to save versions of my profile and restore previous versions if needed, so that I can experiment safely without losing my work.

#### Acceptance Criteria

1. THE System SHALL automatically create profile snapshots daily
2. THE System SHALL allow creating manual save points before major changes
3. THE System SHALL maintain version history for at least 30 days
4. THE System SHALL allow restoring any previous version with one click
5. THE System SHALL show a diff view comparing current vs. previous versions
6. THE System SHALL allow exporting profile configuration as JSON
7. THE System SHALL allow importing profile configuration from JSON backup
8. THE System SHALL tag versions with timestamps and optional user-provided labels
9. THE System SHALL warn before restoring a version that will overwrite current changes
10. THE System SHALL maintain separate version histories for theme, visibility, and content changes

### Requirement 11: Performance and Optimization

**User Story:** As a user, I want the profile editor and public profile to load quickly and perform smoothly, so that I have a great editing and viewing experience.

#### Acceptance Criteria

1. WHEN loading the profile editor, THE System SHALL achieve initial render in < 1 second
2. WHEN updating the live preview, THE System SHALL reflect changes in < 100ms
3. WHEN loading public profiles, THE System SHALL achieve Lighthouse score 95+ on mobile and desktop
4. THE System SHALL optimize images for fast delivery (< 500ms for logos)
5. THE System SHALL implement lazy loading for theme thumbnails and preview assets
6. THE System SHALL cache theme configurations and font files for instant switching
7. THE System SHALL debounce preview updates during rapid typing (300ms delay)
8. THE System SHALL use CSS transforms for device mode transitions (60fps animations)
9. THE System SHALL preload critical fonts to prevent FOIT (Flash of Invisible Text)
10. THE System SHALL implement service worker caching for offline editor access

### Requirement 12: Accessibility and Compliance

**User Story:** As a user, I want the profile editor and public profile to be fully accessible, so that all users can interact with the system effectively.

#### Acceptance Criteria

1. THE System SHALL comply with WCAG 2.1 AA accessibility standards
2. THE System SHALL be fully keyboard navigable with visible focus indicators
3. THE System SHALL provide screen reader announcements for all interactive elements
4. THE System SHALL support dark mode theming across editor and public profile
5. THE System SHALL provide sufficient color contrast (4.5:1 for text, 3:1 for UI elements)
6. THE System SHALL include ARIA labels and roles for all custom components
7. THE System SHALL support browser zoom up to 200% without breaking layout
8. THE System SHALL provide text alternatives for all images and icons
9. THE System SHALL ensure form inputs have associated labels
10. THE System SHALL test with screen readers (NVDA, JAWS, VoiceOver)

### Requirement 13: Security and Data Protection

**User Story:** As a system administrator, I want robust security measures for the profile editor, so that photographer data is protected and secure.

#### Acceptance Criteria

1. THE System SHALL enforce workspace isolation on all profile operations
2. THE System SHALL validate and sanitize all user inputs to prevent XSS attacks
3. THE System SHALL implement CSRF protection for all profile update endpoints
4. THE System SHALL rate limit profile operations (10 updates per minute per user)
5. THE System SHALL validate uploaded files for malicious content
6. THE System SHALL store custom fonts in isolated storage per workspace
7. THE System SHALL implement Content Security Policy (CSP) headers
8. THE System SHALL log all profile changes for audit trail
9. THE System SHALL encrypt sensitive data at rest and in transit
10. THE System SHALL provide secure preview link generation with cryptographic tokens

### Requirement 14: Analytics and Insights

**User Story:** As a photographer, I want to see how my public profile is performing, so that I can optimize it for better engagement.

#### Acceptance Criteria

1. THE System SHALL track public profile page views with daily/weekly/monthly aggregation
2. THE System SHALL track clicks on social media links and custom links
3. THE System SHALL track vCard downloads and QR code scans
4. THE System SHALL provide geographic distribution of profile visitors
5. THE System SHALL show referrer sources (direct, search, social, etc.)
6. THE System SHALL display analytics in a dashboard within the profile editor
7. THE System SHALL respect user privacy and comply with GDPR/CCPA
8. THE System SHALL allow disabling analytics per photographer preference
9. THE System SHALL provide insights on most popular themes and customizations
10. THE System SHALL track time spent on public profile pages
