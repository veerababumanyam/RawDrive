# Requirements Document

## Introduction

The CompanyProfile system serves as the central branding authority across all client-facing surfaces in RawDrive. This system consolidates and extends existing branding functionality by providing a single-entry configuration that propagates to galleries, public profiles, headers/footers, and generates vCard/QR codes for business cards while powering AI-generated legal policies and SEO-optimized schema markup.

**Note**: This specification consolidates and extends existing `company_profiles` and `branding_profiles` tables from the public_profile spec, providing a unified branding system.

## Glossary

- **CompanyProfile**: Enhanced central branding configuration entity containing business identity, contact, and visibility settings (extends existing company_profiles table)
- **Workspace**: Multi-tenant workspace identifier for data isolation (replaces legacy tenant_id references)
- **Studio_Defaults**: Pre-configured branding settings applied to new galleries (extends existing branding_profile_id functionality)
- **Visibility_Filter**: System that controls which profile fields are publicly displayed
- **vCard**: Digital business card format for contact sharing
- **Schema_Markup**: JSON-LD structured data for SEO optimization
- **Branding_Engine**: The complete system managing brand consistency across surfaces
- **Legacy_BrandingProfile**: Existing branding_profiles table to be consolidated into enhanced CompanyProfile

## Requirements

### Requirement 1: Enhanced Company Profile Data Management

**User Story:** As a photographer/studio owner, I want to configure my business profile once with enhanced branding capabilities, so that my branding appears consistently across all client-facing surfaces with full control over visibility.

#### Acceptance Criteria

1. WHEN a user creates or updates a company profile, THE System SHALL store all identity fields (name, tagline, slug, logoUrl, faviconUrl) extending existing company_profiles table
2. WHEN a user provides contact information, THE System SHALL validate and store email, phone, website, and complete structured address
3. WHEN a user adds social media links, THE System SHALL store them as a key-value record with platform validation
4. WHEN a user adds custom links, THE System SHALL store them as an array with label, URL, and optional logo
5. THE System SHALL enforce workspace isolation by requiring workspace_id on all profile operations (consistent with existing patterns)
6. WHEN a user updates any profile field, THE System SHALL update the updated_at timestamp
7. THE System SHALL consolidate existing branding_profiles functionality into the enhanced CompanyProfile system

### Requirement 2: Enhanced Visibility Control System

**User Story:** As a business owner, I want granular control over which profile information is publicly visible including per-platform social media toggles, so that I can maintain privacy while sharing appropriate business details.

#### Acceptance Criteria

1. WHEN a user toggles field visibility, THE System SHALL update the companyVisibility configuration immediately
2. WHEN rendering public content, THE System SHALL filter profile data based on visibility settings
3. WHEN visibility is disabled for a field, THE System SHALL exclude it from all public surfaces
4. THE System SHALL provide default visibility settings for new profiles (all fields visible except private data)
5. WHEN exporting data (vCard, schema), THE System SHALL respect visibility settings
6. WHEN a user toggles social media visibility, THE System SHALL store per-platform boolean flags (socialVisibility.instagram, socialVisibility.facebook, etc.)
7. WHEN rendering social media icons, THE System SHALL only display platforms with visibility enabled
8. THE System SHALL provide individual visibility toggles for each supported social platform (Instagram, Facebook, WhatsApp, TikTok, LinkedIn, YouTube)
9. WHEN a social platform is hidden, THE System SHALL omit it completely from public rendering (no placeholders or empty schema entries)
10. WHEN changing themes, THE System SHALL preserve all visibility settings without override

### Requirement 3: Enhanced Studio Defaults Integration

**User Story:** As a photographer, I want to apply my enhanced studio branding to new galleries automatically, so that I don't have to configure branding for each gallery manually while leveraging existing branding_profile_id functionality.

#### Acceptance Criteria

1. WHEN creating a new gallery, THE System SHALL offer to apply studio defaults using enhanced CompanyProfile data
2. WHEN applying studio defaults, THE System SHALL populate gallery branding with visible profile fields and maintain compatibility with existing branding_profile_id references
3. WHEN studio profile is updated, THE System SHALL allow bulk update of existing galleries that reference the profile
4. THE System SHALL preserve gallery-specific customizations when applying defaults
5. WHEN no company profile exists, THE System SHALL prompt user to create one
6. THE System SHALL maintain backward compatibility with existing galleries using branding_profile_id

### Requirement 4: Public Profile Generation

**User Story:** As a business owner, I want a public profile page accessible via custom URL, so that clients can discover my business and contact information.

#### Acceptance Criteria

1. WHEN a company profile is created, THE System SHALL generate a public profile at /p/{slug}
2. WHEN accessing the public profile, THE System SHALL render only visible profile fields
3. THE System SHALL ensure slug uniqueness across all tenants
4. WHEN slug is invalid, THE System SHALL reject with validation error
5. THE System SHALL generate SEO-optimized meta tags from profile data

### Requirement 5: vCard and QR Code Generation

**User Story:** As a business owner, I want to generate digital business cards and QR codes, so that clients can easily save my contact information.

#### Acceptance Criteria

1. WHEN requesting vCard export, THE System SHALL generate valid vCard 3.0 format with visible fields
2. WHEN generating QR code, THE System SHALL encode the public profile URL
3. THE System SHALL include all visible contact fields in vCard (name, email, phone, address)
4. WHEN downloaded, THE vCard SHALL be compatible with iOS and Android contact apps
5. THE System SHALL generate high-resolution QR codes suitable for print materials

### Requirement 6: SEO Schema Markup

**User Story:** As a business owner, I want structured data markup on my public profile, so that search engines can properly index my business information.

#### Acceptance Criteria

1. WHEN rendering public profile, THE System SHALL include JSON-LD schema markup
2. THE System SHALL use ProfessionalService schema type for photography businesses
3. WHEN address is visible, THE System SHALL include PostalAddress schema
4. THE System SHALL validate schema markup against Google Structured Data guidelines
5. THE System SHALL include business name, address, and contact information in schema

### Requirement 7: AI Policy Integration

**User Story:** As a business owner, I want AI-generated legal policies that include my business details, so that I have compliant terms of service and privacy policies.

#### Acceptance Criteria

1. WHEN generating legal policies, THE AI_Service SHALL use company name as legal entity
2. WHEN generating contact sections, THE AI_Service SHALL use visible contact information
3. THE System SHALL pass company profile data to AI policy generation service
4. WHEN company details change, THE System SHALL offer to regenerate policies
5. THE AI_Service SHALL generate policies compliant with local jurisdiction based on address

### Requirement 8: Gallery Branding Integration and Migration

**User Story:** As a photographer, I want my enhanced company branding to appear in client galleries, so that my brand is consistently represented during client interactions while maintaining compatibility with existing gallery branding systems.

#### Acceptance Criteria

1. WHEN displaying gallery headers, THE System SHALL show company logo and name if visible, integrating with existing gallery branding systems
2. WHEN rendering gallery footers, THE System SHALL include visible contact information
3. WHEN social links are visible, THE System SHALL display social media icons in gallery headers
4. THE System SHALL apply brand colors and styling consistently across gallery surfaces
5. WHEN custom links are configured, THE System SHALL display them as call-to-action buttons
6. THE System SHALL provide migration path for existing galleries using legacy branding_profile_id to enhanced CompanyProfile system
7. THE System SHALL maintain backward compatibility during transition period

### Requirement 9: Data Validation, Security, and Migration

**User Story:** As a system administrator, I want robust data validation, workspace isolation, and smooth migration from existing systems, so that company profiles are secure, properly formatted, and maintain continuity with existing functionality.

#### Acceptance Criteria

1. WHEN creating profiles, THE System SHALL validate all fields using Zod schemas
2. THE System SHALL enforce workspace isolation on all profile operations (consistent with existing workspace_id patterns)
3. WHEN validating email, THE System SHALL ensure valid email format
4. WHEN validating phone, THE System SHALL accept international phone number formats
5. WHEN validating URLs, THE System SHALL ensure proper URL format and HTTPS preference
6. THE System SHALL provide migration utilities to consolidate existing company_profiles and branding_profiles data
7. THE System SHALL maintain data integrity during migration from legacy systems

### Requirement 10: Performance and Accessibility

**User Story:** As a user, I want fast-loading, accessible company profiles, so that all users can interact with business information effectively.

#### Acceptance Criteria

1. WHEN loading public profiles, THE System SHALL achieve Lighthouse score 95+ on mobile and desktop
2. THE System SHALL comply with WCAG 2.1 AA accessibility standards
3. WHEN loading logos, THE System SHALL optimize images for fast delivery (<500ms)
4. THE System SHALL support dark mode theming across all profile surfaces
5. THE System SHALL be fully keyboard navigable and screen reader compatible


### Requirement 11: Live Multi-Device Public Profile Preview

**User Story:** As a photographer, I want to see a live preview of my automatically-generated public profile across different devices while editing, so that I can ensure my branding looks perfect on all screen sizes before it goes live.

#### Acceptance Criteria

1. WHEN editing company profile, THE System SHALL display a live preview frame showing the automatically-generated public profile
2. THE System SHALL support three device preview modes: Phone (narrow), Tablet (medium), Desktop (full width)
3. WHEN switching device modes, THE System SHALL instantly resize the preview frame to the corresponding breakpoint
4. WHEN toggling field visibility, THE System SHALL update the public profile preview in real time
5. WHEN changing theme or theme options, THE System SHALL update the public profile preview immediately
6. WHEN editing profile data (name, tagline, logo, links), THE System SHALL reflect changes in the public profile preview instantly
7. THE System SHALL render the preview using the same components as the actual public profile URL (/p/{slug})
8. THE System SHALL make the preview read-only to prevent accidental edits
9. THE System SHALL preserve current theme and visibility state when switching device modes
10. THE System SHALL accurately reflect final public profile layout and responsiveness in all device modes
11. THE System SHALL automatically apply all changes to the live public profile when saved

### Requirement 12: Modern Theming System for Automatic Public Profile

**User Story:** As a photographer, I want to choose from modern, premium themes and customize them to match my brand, so that my automatically-generated public profile stands out and reflects my unique style.

#### Acceptance Criteria

1. THE System SHALL provide multiple pre-built modern themes featuring gradients, layered colors, and glassmorphism for the public profile
2. WHEN a user selects a theme, THE System SHALL apply it immediately to the live preview and automatically to the public profile (/p/{slug})
3. THE System SHALL support both light and dark theme variants where appropriate
4. WHEN customizing a theme, THE System SHALL allow users to set primary, secondary, and accent colors that automatically apply to the public profile
5. WHEN customizing a theme, THE System SHALL allow users to adjust background gradients, patterns, and intensity for the public profile
6. WHEN customizing a theme, THE System SHALL allow users to configure layout options (compact vs. spacious, card vs. full-bleed hero) for the public profile
7. THE System SHALL save theme customizations per photographer account and automatically apply them to their public profile
8. THE System SHALL apply customizations only to that photographer's public profile URL
9. WHEN users pick colors, THE System SHALL enforce automatic contrast checks for WCAG 2.1 AA compliance on the public profile
10. WHEN color combinations fail readability standards, THE System SHALL show warnings and offer adjusted suggestions
11. THE System SHALL ensure all themes remain responsive and accessible on the public profile regardless of customization choices
12. THE System SHALL maintain focus states and ARIA attributes across all theme variations on the public profile
13. THE System SHALL provide a color palette builder with primary, secondary, accent, and neutral color slots
14. WHEN uploading a logo, THE System SHALL extract dominant colors and suggest a palette
15. THE System SHALL provide color harmony suggestions (complementary, analogous, triadic schemes)
16. THE System SHALL allow saving multiple color palettes and switching between them
17. THE System SHALL provide color palette export in common formats (CSS variables, JSON)

### Requirement 13: Typography and Custom Font Management for Public Profile

**User Story:** As a photographer, I want to select professional fonts or upload my own brand fonts, so that my automatically-generated public profile typography matches my brand identity perfectly.

#### Acceptance Criteria

1. THE System SHALL provide a curated list of high-quality web fonts for heading, body, and optional accent/navigation roles on the public profile
2. WHEN a user selects fonts, THE System SHALL apply them immediately to the live preview and automatically to the public profile
3. THE System SHALL allow users to upload custom brand fonts (.woff2, .ttf formats) for use on their public profile
4. WHEN uploading custom fonts, THE System SHALL validate file type, size, and basic security constraints
5. THE System SHALL generate @font-face configuration scoped to that photographer's public profile only
6. THE System SHALL allow users to map uploaded fonts to roles (heading/body) via dropdowns
7. WHEN custom fonts are applied, THE System SHALL show the effect instantly in the preview and automatically on the public profile
8. THE System SHALL define sensible fallback fonts for all custom fonts on the public profile
9. THE System SHALL ensure font loading does not cause significant performance degradation on the public profile
10. THE System SHALL prevent layout shift on first paint when loading custom fonts on the public profile
11. THE System SHALL limit custom font file sizes to prevent performance issues on the public profile
12. THE System SHALL sanitize uploaded font files to prevent security vulnerabilities

### Requirement 14: Unified Profile Editor with Automatic Public Profile Updates

**User Story:** As a photographer, I want all profile editing features (visibility, preview, theming, fonts) in one cohesive interface that automatically updates my public profile, so that I can efficiently create my perfect public presence without switching between multiple screens.

#### Acceptance Criteria

1. THE System SHALL combine per-field visibility toggles, live preview, theme selection, and font management in one unified editor screen
2. WHEN making any change, THE System SHALL persist it to the photographer's account and automatically update the public profile
3. THE System SHALL provide "Undo" functionality for recent changes
4. THE System SHALL provide "Reset to defaults" options for visibility, theme, and font settings
5. THE System SHALL ensure all changes affect only the public profile presentation layer
6. WHEN visibility is toggled off, THE System SHALL keep private data stored but hidden from the public profile
7. THE System SHALL provide clear visual feedback for all user actions
8. THE System SHALL maintain consistent UI patterns across all editor sections
9. THE System SHALL ensure the editor is fully keyboard navigable
10. THE System SHALL provide tooltips and help text for complex features
11. THE System SHALL automatically create a public profile at /p/{slug} when a company profile is first created
12. THE System SHALL automatically update the public profile in real-time as changes are made in the editor
