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

### Requirement 2: Visibility Control System

**User Story:** As a business owner, I want to control which profile information is publicly visible, so that I can maintain privacy while sharing appropriate business details.

#### Acceptance Criteria

1. WHEN a user toggles field visibility, THE System SHALL update the companyVisibility configuration immediately
2. WHEN rendering public content, THE System SHALL filter profile data based on visibility settings
3. WHEN visibility is disabled for a field, THE System SHALL exclude it from all public surfaces
4. THE System SHALL provide default visibility settings for new profiles (all fields visible except private data)
5. WHEN exporting data (vCard, schema), THE System SHALL respect visibility settings

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