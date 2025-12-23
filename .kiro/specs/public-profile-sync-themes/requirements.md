# Requirements Document

## Introduction

This specification addresses critical issues with the Public Profile system in RawDrive:

1. **Preview/Live Sync Issue**: The Company Profile editor preview and the actual public profile page (/p/{slug}) display different content and styling
2. **Theme Application Failure**: Themes selected in the Company Profile editor are not being applied to the public profile
3. **Typography Not Updating**: Custom fonts and typography settings are not reflected on the public profile
4. **UI Consistency**: The "Save Contact" button should be replaced with an icon for consistency with QR and Share buttons
5. **Limited Theme Selection**: Only 6 themes exist; need 20+ modern themes with gradient fills and trending colors

## Glossary

- **Public_Profile**: The publicly accessible page at /p/{slug} showing company information
- **Preview_Panel**: The live preview shown in the Company Profile editor
- **Theme**: A pre-built design template with colors, typography, and layout settings
- **Theme_Customization**: User-specific modifications to a base theme
- **ProfileCard**: The shared React component used by both preview and public profile
- **Visibility_Config**: Settings controlling which profile fields are publicly visible

## Requirements

### Requirement 1: Preview and Live Profile Synchronization

**User Story:** As a photographer, I want the preview in my Company Profile editor to exactly match what visitors see on my public profile, so that I can confidently make changes knowing the final result.

#### Acceptance Criteria

1. WHEN the preview panel renders a profile, THE System SHALL use identical data transformation logic as the public profile page
2. WHEN theme colors are applied in preview, THE System SHALL apply the same CSS variables and styles as the public profile
3. WHEN typography settings are configured, THE System SHALL load and apply fonts identically in both preview and public profile
4. WHEN visibility toggles are changed, THE System SHALL reflect the same field visibility in both preview and public profile
5. WHEN the public profile is loaded, THE System SHALL fetch and apply the saved theme_id and theme customizations from the database
6. THE System SHALL ensure the ProfileCard component receives identical props structure from both preview and public profile contexts

### Requirement 2: Theme Persistence and Application

**User Story:** As a photographer, I want my selected theme to be saved and displayed on my public profile, so that visitors see my branded design.

#### Acceptance Criteria

1. WHEN a user selects a theme in the editor, THE System SHALL save the theme_id to the company_profiles table
2. WHEN a user customizes theme colors, THE System SHALL save the customizations to the database
3. WHEN the public profile loads, THE System SHALL retrieve the theme_id and apply the corresponding theme colors
4. WHEN theme base_colors are retrieved, THE System SHALL apply them as CSS variables (--profile-primary, --profile-secondary, --profile-accent)
5. WHEN no theme is selected, THE System SHALL apply default styling
6. THE System SHALL invalidate the public profile cache when theme settings are updated

### Requirement 3: Typography Application

**User Story:** As a photographer, I want my selected fonts to display correctly on my public profile, so that my brand typography is consistent.

#### Acceptance Criteria

1. WHEN a theme with custom typography is selected, THE System SHALL load the specified Google Fonts
2. WHEN the public profile renders, THE System SHALL apply heading_font to headings and body_font to body text
3. WHEN fonts are loaded, THE System SHALL use font-display: swap to prevent layout shift
4. THE System SHALL provide fallback fonts for all custom font selections
5. WHEN typography settings are saved, THE System SHALL store them in the typography_config column
6. THE System SHALL download and serve fonts locally to ensure consistent availability

### Requirement 4: Action Button UI Consistency

**User Story:** As a user viewing a public profile, I want consistent action button styling, so that the interface feels cohesive and professional.

#### Acceptance Criteria

1. THE System SHALL display the Save Contact action as an icon button matching QR and Share button styling
2. WHEN displaying action buttons, THE System SHALL use consistent sizing, spacing, and border styling
3. THE System SHALL provide tooltip text for all icon-only action buttons
4. THE System SHALL maintain accessibility with proper aria-labels for icon buttons

### Requirement 5: Expanded Theme Library

**User Story:** As a photographer, I want access to 20+ modern themes with gradient fills and trending colors, so that I can find a design that matches my brand aesthetic.

#### Acceptance Criteria

1. THE System SHALL provide at least 20 pre-built themes
2. THE System SHALL include themes with gradient backgrounds and fills
3. THE System SHALL include themes using industry-trending color palettes (2024-2025 design trends)
4. THE System SHALL categorize themes into: minimal, bold, elegant, modern, creative, gradient, dark, nature, professional
5. WHEN displaying themes, THE System SHALL show gradient previews accurately
6. THE System SHALL include themes with glassmorphism effects
7. THE System SHALL include themes with both light and dark variants
8. THE System SHALL ensure all themes meet WCAG 2.1 AA contrast requirements

### Requirement 6: Theme Data Structure Enhancement

**User Story:** As a developer, I want a robust theme data structure that supports gradients and advanced styling, so that themes render consistently across all surfaces.

#### Acceptance Criteria

1. THE System SHALL support gradient definitions with type (linear/radial), direction, and color stops
2. THE System SHALL support background patterns and textures in theme definitions
3. WHEN a gradient theme is selected, THE System SHALL apply the gradient to the appropriate profile sections
4. THE System SHALL validate gradient color values to prevent CSS injection
5. THE System SHALL support multiple gradient definitions per theme (header, background, accent)

### Requirement 7: Real-time Theme Preview

**User Story:** As a photographer, I want to see theme changes instantly in the preview, so that I can quickly evaluate different options.

#### Acceptance Criteria

1. WHEN a theme is selected, THE System SHALL update the preview within 100ms
2. WHEN theme customizations are made, THE System SHALL reflect changes immediately in the preview
3. THE System SHALL not require page refresh to see theme changes
4. WHEN switching between themes, THE System SHALL smoothly transition colors and styles

### Requirement 8: Font Loading and Performance

**User Story:** As a visitor to a public profile, I want the page to load quickly with proper fonts, so that I have a good user experience.

#### Acceptance Criteria

1. WHEN loading custom fonts, THE System SHALL use preconnect hints for Google Fonts
2. THE System SHALL lazy-load non-critical fonts after initial render
3. WHEN fonts fail to load, THE System SHALL gracefully fall back to system fonts
4. THE System SHALL cache loaded fonts in the browser
5. THE System SHALL achieve Lighthouse performance score of 90+ with custom fonts

### Requirement 9: Precise Location with Coordinates

**User Story:** As a photographer, I want to enter GPS coordinates for my business location, so that visitors can navigate to my exact location even when address-based mapping is inaccurate.

#### Acceptance Criteria

1. THE System SHALL provide optional latitude and longitude input fields in the Company Profile editor
2. WHEN coordinates are provided, THE System SHALL validate they are within valid ranges (latitude: -90 to 90, longitude: -180 to 180)
3. THE System SHALL provide a user-friendly coordinate input with format hints (e.g., "12.9716, 77.5946")
4. THE System SHALL allow users to pick coordinates from an interactive map widget
5. WHEN the location CTA is clicked, THE System SHALL prioritize coordinates over address for map navigation
6. IF coordinates are not provided, THEN THE System SHALL fall back to address-based map navigation
7. THE System SHALL NOT display raw coordinates on the public profile (coordinates are internal only)
8. WHEN generating the map URL, THE System SHALL use coordinates format: `https://www.google.com/maps?q={lat},{lng}`
9. THE System SHALL store coordinates in the address_structured JSONB field as latitude and longitude properties
10. THE System SHALL provide a "Get Current Location" button to auto-fill coordinates from browser geolocation
11. WHEN displaying the location on public profile, THE System SHALL show the human-readable address text
12. THE System SHALL validate coordinate precision to 6 decimal places for accuracy

### Requirement 10: Theme Loading on Public Profile

**User Story:** As a visitor to a public profile, I want to see the photographer's selected theme applied correctly, so that I experience their intended brand presentation.

#### Acceptance Criteria

1. WHEN the public profile API returns theme data, THE System SHALL include theme_id, base_colors, typography, and layout configuration
2. WHEN the PublicProfileView component mounts, THE System SHALL extract theme data from the API response
3. THE System SHALL transform backend theme data format to match ProfileCard's expected themeColors, themeTypography, and themeLayout props
4. WHEN theme base_colors contain gradients, THE System SHALL apply them to the appropriate profile sections
5. THE System SHALL load Google Fonts specified in the theme typography before rendering text
6. IF theme data is missing or invalid, THEN THE System SHALL gracefully fall back to default styling

### Requirement 11: Secondary Contact Information

**User Story:** As a photographer, I want to add multiple email addresses and phone numbers with custom labels, so that clients can reach me through different channels.

#### Acceptance Criteria

1. THE System SHALL support up to 3 secondary email addresses with custom labels
2. THE System SHALL support up to 3 secondary phone numbers with custom labels
3. WHEN displaying secondary contacts, THE System SHALL show the custom label (e.g., "Bookings", "Support")
4. THE System SHALL provide individual visibility toggles for each secondary contact
5. WHEN a secondary contact is hidden, THE System SHALL not display it on the public profile
6. THE System SHALL validate secondary email and phone formats

### Requirement 12: Social Media Platform Support

**User Story:** As a photographer, I want to link all my social media profiles including newer platforms, so that visitors can follow me across all channels.

#### Acceptance Criteria

1. THE System SHALL support the following social platforms: Instagram, Facebook, Twitter/X, LinkedIn, YouTube, TikTok, WhatsApp, Pinterest, Behance, Dribbble
2. WHEN displaying social icons, THE System SHALL use platform-specific brand colors
3. THE System SHALL provide individual visibility toggles for each social platform
4. WHEN a social link is empty or hidden, THE System SHALL not display its icon
5. THE System SHALL validate social media URLs for correct format

