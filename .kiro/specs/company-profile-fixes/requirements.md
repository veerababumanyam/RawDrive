# Requirements Document: Company Profile Critical Fixes

## Introduction

This specification addresses critical usability, functionality, and user experience issues in the existing Company Profile feature. The fixes focus on improving the public slug editor UX, correcting QR code redirection, fixing vCard export accuracy, adding URL copy/share functionality, displaying QR/vCard on public profiles, supporting secondary contact information, and implementing proper theme preview and management.

These fixes are essential for providing a professional, user-friendly experience that meets industry standards and user expectations.

## Glossary

- **Public_Slug**: URL-friendly identifier for the public profile (e.g., "acme-photo" in rawdrive.ai/p/acme-photo)
- **QR_Code**: Machine-readable code that encodes the public profile URL
- **vCard**: Digital business card format (VCF file) containing contact information
- **Theme**: Visual design template applied to the public profile
- **Visibility_Toggle**: UI control to show/hide specific profile fields
- **Secondary_Contact**: Additional email or phone number beyond the primary contact
- **Public_Profile**: Customer-facing profile page accessible at /p/{slug}
- **Profile_Editor**: Administrative interface for managing profile settings
- **Web_Share_API**: Browser API for native sharing functionality
- **Clipboard_API**: Browser API for copying text to clipboard

## Requirements

### Requirement 1: Public Slug Editor UX Improvements

**User Story:** As a photographer, I want an intuitive and user-friendly interface for editing my public slug, so that I can easily customize my profile URL without confusion.

#### Acceptance Criteria

1. THE System SHALL provide adequate vertical and horizontal space for the public slug input field (minimum 48px height, full width)
2. THE System SHALL display the full public URL preview (e.g., "https://rawdrive.ai/p/your-slug") prominently above or below the input
3. THE System SHALL use a clear visual hierarchy with proper labels, spacing, and typography
4. THE System SHALL provide an inline edit mode with distinct "Edit", "Confirm", and "Cancel" buttons
5. WHEN in read-only mode, THE System SHALL display the slug with an "Edit" icon button
6. WHEN in edit mode, THE System SHALL show the input field with "Confirm" (checkmark) and "Cancel" (X) buttons
7. THE System SHALL provide real-time validation feedback with clear success (green checkmark) and error (red X) indicators
8. THE System SHALL display validation messages below the input field (e.g., "Slug is available", "This slug is already taken")
9. THE System SHALL prevent accidental slug changes by requiring explicit confirmation for existing profiles
10. THE System SHALL auto-generate slugs from company name for new profiles only, not for existing profiles
11. THE System SHALL display helpful tooltips explaining slug format requirements (lowercase, numbers, hyphens only)
12. THE System SHALL maintain consistent spacing (16-24px) and alignment with other form fields
13. THE System SHALL support full keyboard navigation (Tab, Enter, Escape keys)
14. THE System SHALL provide clear visual distinction between editable and read-only states using background colors and borders
15. THE System SHALL follow WCAG 2.1 AA accessibility standards for contrast and focus indicators

### Requirement 2: QR Code Correct URL Redirection

**User Story:** As a photographer, I want my QR code to redirect to my public profile on rawdrive.ai, so that people can easily access my profile by scanning the code.

#### Acceptance Criteria

1. WHEN a QR code is generated, THE System SHALL encode the correct public profile URL (https://rawdrive.ai/p/{slug})
2. WHEN a QR code is scanned, THE System SHALL redirect to the photographer's public profile page on rawdrive.ai
3. THE System SHALL NOT redirect to unknown, incorrect, or placeholder websites
4. THE System SHALL validate the QR code URL before generation to ensure it matches the expected format
5. THE System SHALL include the full domain (rawdrive.ai) in the QR code, not relative paths or localhost URLs
6. THE System SHALL use HTTPS protocol for secure connections
7. THE System SHALL test QR code generation with multiple QR code readers (iOS Camera, Android Camera, dedicated QR apps) to ensure compatibility
8. THE System SHALL provide a preview of the QR code destination URL in the profile editor
9. THE System SHALL handle URL encoding correctly for special characters in slugs (though slugs should only contain alphanumeric and hyphens)
10. THE System SHALL log QR code generation and scan events for analytics purposes
11. THE System SHALL generate QR codes with appropriate error correction level (M or H) for reliability
12. THE System SHALL generate QR codes with sufficient size (minimum 256x256 pixels) for scanning

### Requirement 3: vCard Accurate Contact Export

**User Story:** As a photographer, I want my vCard to export accurate and complete contact information, so that clients can save my details correctly to their contacts.

#### Acceptance Criteria

1. WHEN a vCard is generated, THE System SHALL include all visible contact fields (name, email, phone, website, address, social media)
2. WHEN a vCard is downloaded, THE System SHALL format data according to vCard 3.0 specification for maximum compatibility
3. THE System SHALL include the company name in the FN (Formatted Name) and ORG (Organization) fields
4. THE System SHALL include the primary email in the EMAIL field with TYPE=INTERNET
5. THE System SHALL include the primary phone in the TEL field with TYPE=WORK,VOICE
6. THE System SHALL include the website in the URL field
7. THE System SHALL include structured address data in the ADR field (street, city, state, postal code, country)
8. THE System SHALL include the company logo as a PHOTO field with proper encoding (BASE64) and MIME type
9. THE System SHALL include social media URLs as additional URL fields with labels (e.g., URL;TYPE=Instagram:https://...)
10. THE System SHALL include the public profile URL as a URL field with label "Profile"
11. THE System SHALL format phone numbers according to international standards (E.164 format with country code)
12. THE System SHALL respect visibility settings and only include visible fields in the vCard
13. THE System SHALL provide proper character encoding (UTF-8) for international characters and special symbols
14. THE System SHALL test vCard compatibility with major contact apps (iOS Contacts, Android Contacts, Google Contacts, Outlook)
15. THE System SHALL include the tagline in the TITLE or NOTE field if visible
16. THE System SHALL set proper MIME type (text/vcard) and file extension (.vcf) for downloads

### Requirement 4: Public URL Copy and Share Functionality

**User Story:** As a photographer, I want to easily copy and share my public profile URL, so that I can distribute my profile link across various platforms.

#### Acceptance Criteria

1. THE System SHALL provide a "Copy URL" button with a copy icon next to the public slug field in the profile editor
2. WHEN the "Copy URL" button is clicked, THE System SHALL copy the full public URL (https://rawdrive.ai/p/{slug}) to the clipboard
3. THE System SHALL display a success toast notification ("URL copied to clipboard!") after successful copying
4. THE System SHALL handle clipboard API errors gracefully with fallback methods (select and copy)
5. THE System SHALL provide a "Share" button with a share icon in the profile editor header
6. WHEN the "Share" button is clicked on supported devices, THE System SHALL open the native share dialog using Web Share API
7. THE System SHALL include the profile name and URL in the share data (title, text, url)
8. THE System SHALL provide fallback share options (copy link, email) for browsers that don't support Web Share API
9. THE System SHALL display the full public URL prominently in the profile editor (e.g., in a read-only input or info box)
10. THE System SHALL allow copying the URL from the public profile page itself with a "Copy Link" button
11. THE System SHALL track URL copy and share actions for analytics purposes
12. THE System SHALL provide keyboard shortcuts for copying (Ctrl/Cmd+C when slug field is focused)
13. THE System SHALL ensure the copy button is accessible via keyboard navigation
14. THE System SHALL provide clear visual feedback (button state change) when copy is successful

### Requirement 5: QR Code and vCard Visibility on Public Profile

**User Story:** As a photographer, I want QR code and vCard download options visible on my public profile, so that visitors can easily save my contact information.

#### Acceptance Criteria

1. THE System SHALL display a "Save Contact" button with a download icon on the public profile page
2. WHEN the "Save Contact" button is clicked, THE System SHALL download the vCard file with proper filename ({slug}-contact.vcf)
3. THE System SHALL display a "QR Code" button with a QR icon on the public profile page
4. WHEN the "QR Code" button is clicked, THE System SHALL display a modal with the QR code image and download option
5. THE System SHALL provide visibility toggles for vCard and QR code buttons in the profile editor settings
6. WHEN vCard visibility is disabled, THE System SHALL hide the "Save Contact" button on the public profile
7. WHEN QR code visibility is disabled, THE System SHALL hide the "QR Code" button on the public profile
8. THE System SHALL style the buttons consistently with the active profile theme
9. THE System SHALL position the buttons prominently in the profile header or action bar
10. THE System SHALL provide mobile-optimized button sizes (minimum 44x44px touch targets) and spacing
11. THE System SHALL track button clicks (vCard downloads, QR code views) for analytics purposes
12. THE System SHALL display the QR code in a modal with options to download or share
13. THE System SHALL include the profile URL below the QR code in the modal for reference
14. THE System SHALL provide a "Close" button to dismiss the QR code modal
15. THE System SHALL ensure buttons are accessible via keyboard navigation and screen readers

### Requirement 6: Secondary Contact Information with Visibility Controls

**User Story:** As a photographer, I want to add secondary email and phone numbers with individual visibility controls, so that I can provide alternative contact methods while maintaining privacy.

#### Acceptance Criteria

1. THE System SHALL allow adding up to 3 email addresses (1 primary, 2 secondary)
2. THE System SHALL allow adding up to 3 phone numbers (1 primary, 2 secondary)
3. THE System SHALL provide individual visibility toggles for each email address
4. THE System SHALL provide individual visibility toggles for each phone number
5. THE System SHALL label contacts clearly as "Primary Email", "Secondary Email 1", "Secondary Email 2"
6. THE System SHALL label contacts clearly as "Primary Phone", "Secondary Phone 1", "Secondary Phone 2"
7. THE System SHALL validate all email addresses for correct format (RFC 5322 compliant)
8. THE System SHALL validate all phone numbers for correct format (international format with country code)
9. THE System SHALL include visible secondary contacts in vCard exports with appropriate TYPE labels
10. THE System SHALL display secondary contacts on the public profile when visible, with clear labels
11. THE System SHALL maintain consistent styling for primary and secondary contacts (same icon, spacing, layout)
12. THE System SHALL allow removing secondary contacts with a delete button
13. THE System SHALL provide "Add Secondary Email" and "Add Secondary Phone" buttons when slots are available
14. THE System SHALL save secondary contact information to the database with proper schema
15. THE System SHALL respect visibility settings for secondary contacts in all contexts (public profile, vCard, QR code modal)

### Requirement 7: Theme Preview and Selection in Profile Editor

**User Story:** As a photographer, I want to see and change themes directly in the profile editor with immediate preview, so that I can customize my profile appearance efficiently.

#### Acceptance Criteria

1. THE System SHALL display a "Theme" section in the profile editor with a theme selector
2. THE System SHALL show theme previews with thumbnail images (minimum 200x300px) for each available theme
3. WHEN a theme is selected, THE System SHALL apply it immediately to the live preview panel
4. THE System SHALL display the currently active theme with a visual indicator (checkmark, border, or badge)
5. THE System SHALL organize themes by categories (Minimal, Bold, Elegant, Modern, Creative) with category tabs or filters
6. THE System SHALL allow filtering themes by style (light/dark) and color scheme (warm/cool/neutral)
7. THE System SHALL provide a "Preview on Public Page" button to open the actual public profile in a new tab
8. THE System SHALL save theme selection automatically without requiring form submission
9. THE System SHALL show theme customization options (colors, fonts, layout) after theme selection
10. THE System SHALL provide a "Reset to Default" button to revert theme customizations
11. THE System SHALL display theme metadata (name, description, category) on hover or selection
12. THE System SHALL support keyboard navigation for theme selection (arrow keys, Enter to select)
13. THE System SHALL provide a search/filter input to find themes by name or keyword
14. THE System SHALL show a loading indicator while applying theme changes
15. THE System SHALL persist theme selection across page reloads and sessions

### Requirement 8: Logical and User-Friendly Theme Management

**User Story:** As a photographer, I want an intuitive theme management interface, so that I can easily customize my profile appearance without technical knowledge.

#### Acceptance Criteria

1. THE System SHALL organize theme controls in a logical hierarchy: Theme Selection → Color Customization → Font Customization → Layout Options → Preview
2. THE System SHALL provide clear section headers and descriptions for each customization category
3. THE System SHALL use visual controls (color pickers, font dropdowns, toggle switches) instead of text inputs where appropriate
4. THE System SHALL show real-time preview of theme changes in the live preview panel as they are made
5. THE System SHALL provide undo/redo buttons for theme changes (last 10 actions)
6. THE System SHALL save theme changes automatically with visual confirmation (success toast or checkmark animation)
7. THE System SHALL provide preset color palettes (5-10 options) for quick customization
8. THE System SHALL suggest complementary colors based on brand color selection using color theory algorithms
9. THE System SHALL validate theme customizations for accessibility (WCAG 2.1 AA contrast ratios) and show warnings for violations
10. THE System SHALL provide a "Tour" or "Help" button that explains theme customization features for first-time users
11. THE System SHALL display before/after comparison when hovering over theme options
12. THE System SHALL group related customization options together (e.g., all color options in one section)
13. THE System SHALL provide tooltips explaining what each customization option affects
14. THE System SHALL show a "Customized" badge on themes that have been modified from defaults
15. THE System SHALL allow saving custom theme configurations as presets for future use

### Requirement 9: Backend API Corrections

**User Story:** As a system administrator, I want the backend APIs to generate correct URLs and data, so that the frontend can display accurate information to users.

#### Acceptance Criteria

1. THE System SHALL use the correct production domain (rawdrive.ai) in QR code generation, not localhost or placeholder domains
2. THE System SHALL use environment variables for domain configuration (VITE_PUBLIC_URL, API_BASE_URL)
3. THE System SHALL validate environment variables on application startup and log errors if missing or invalid
4. THE System SHALL generate vCard data with all visible fields correctly formatted according to vCard 3.0 specification
5. THE System SHALL include proper MIME types and headers for vCard downloads (Content-Type: text/vcard)
6. THE System SHALL include proper MIME types and headers for QR code downloads (Content-Type: image/png)
7. THE System SHALL set Content-Disposition headers for file downloads with appropriate filenames
8. THE System SHALL validate slug format on the backend before generating URLs (alphanumeric and hyphens only)
9. THE System SHALL return proper error responses (400, 404, 500) with descriptive messages for invalid requests
10. THE System SHALL log all QR code and vCard generation requests for debugging and analytics
11. THE System SHALL implement rate limiting for QR code and vCard generation endpoints (100 requests per minute per IP)
12. THE System SHALL cache generated QR codes and vCards for 1 hour to improve performance
13. THE System SHALL invalidate cache when profile data is updated
14. THE System SHALL support both GET and POST methods for vCard and QR code generation where appropriate
15. THE System SHALL include proper CORS headers for public profile endpoints

### Requirement 10: Testing and Quality Assurance

**User Story:** As a quality assurance engineer, I want comprehensive tests for all profile features, so that we can ensure reliability and prevent regressions.

#### Acceptance Criteria

1. THE System SHALL have unit tests for slug validation logic (format, availability checking)
2. THE System SHALL have unit tests for QR code URL generation with various slug inputs
3. THE System SHALL have unit tests for vCard generation with all field combinations
4. THE System SHALL have integration tests for the complete profile creation and update flow
5. THE System SHALL have end-to-end tests for QR code scanning and URL redirection
6. THE System SHALL have end-to-end tests for vCard download and import into contact apps
7. THE System SHALL have visual regression tests for theme preview and public profile rendering
8. THE System SHALL have accessibility tests (axe-core) for all profile editor and public profile pages
9. THE System SHALL have performance tests ensuring page load times < 2 seconds
10. THE System SHALL have cross-browser tests (Chrome, Firefox, Safari, Edge) for all features
11. THE System SHALL have mobile device tests (iOS, Android) for responsive layouts and touch interactions
12. THE System SHALL have tests for clipboard API functionality with fallbacks
13. THE System SHALL have tests for Web Share API functionality with fallbacks
14. THE System SHALL have tests for theme customization persistence across sessions
15. THE System SHALL achieve minimum 80% code coverage for all profile-related modules

### Requirement 11: Profile Preview Before Publishing

**User Story:** As a photographer, I want to preview my profile changes before publishing, so that I can ensure everything looks correct and avoid embarrassing mistakes.

#### Acceptance Criteria

1. THE System SHALL provide a "Preview Changes" button in the profile editor
2. WHEN the preview button is clicked, THE System SHALL open the public profile in a new tab with draft changes applied
3. THE System SHALL display a prominent banner on preview pages indicating "Preview Mode - Not Live"
4. THE System SHALL provide a "Publish" button on the preview page to make changes live
5. THE System SHALL provide a "Back to Editor" button on the preview page
6. THE System SHALL show a side-by-side comparison view (current live vs. draft)
7. THE System SHALL highlight differences between current and draft versions
8. THE System SHALL prevent search engines from indexing preview pages (noindex meta tag)
9. THE System SHALL expire preview sessions after 24 hours
10. THE System SHALL track preview views for analytics purposes

### Requirement 12: Profile Completeness Score

**User Story:** As a photographer, I want to see how complete my profile is, so that I can ensure I've filled in all important information.

#### Acceptance Criteria

1. THE System SHALL calculate a profile completeness score (0-100%)
2. THE System SHALL display the completeness score prominently in the profile editor
3. THE System SHALL show a checklist of completed and missing elements
4. THE System SHALL include these elements in the score: logo (20%), tagline (10%), social media (20%), address (15%), theme customization (15%), secondary contacts (10%), custom links (10%)
5. THE System SHALL update the score in real-time as fields are filled
6. THE System SHALL provide actionable suggestions for improving the score
7. THE System SHALL show a visual progress indicator (progress bar or circular gauge)
8. THE System SHALL celebrate 100% completion with a success message
9. THE System SHALL allow dismissing the completeness widget
10. THE System SHALL track completeness scores for analytics and insights

### Requirement 13: Smart Slug Suggestions

**User Story:** As a photographer, I want intelligent slug suggestions, so that I can quickly find an available and memorable URL.

#### Acceptance Criteria

1. WHEN a user enters a company name, THE System SHALL generate 3-5 slug suggestions
2. THE System SHALL check availability for all suggestions in real-time
3. THE System SHALL show only available slugs in the suggestions list
4. THE System SHALL generate suggestions based on: company name variations, industry keywords, location (if provided)
5. THE System SHALL prioritize shorter, more memorable slugs
6. THE System SHALL allow clicking a suggestion to auto-fill the slug field
7. THE System SHALL provide a "Suggest More" button to generate additional options
8. THE System SHALL highlight the recommended suggestion
9. THE System SHALL show character count for each suggestion
10. THE System SHALL reserve common slugs (admin, api, www, help, support, etc.) to prevent squatting

### Requirement 14: Profile Analytics Dashboard

**User Story:** As a photographer, I want to see analytics for my public profile, so that I can understand how people are engaging with my profile.

#### Acceptance Criteria

1. THE System SHALL display a profile analytics card in the editor
2. THE System SHALL show profile views for last 7 days and last 30 days
3. THE System SHALL show QR code scan count
4. THE System SHALL show vCard download count
5. THE System SHALL show top 5 referrer sources
6. THE System SHALL show geographic distribution of visitors (top 5 countries/cities)
7. THE System SHALL update analytics data every 5 minutes
8. THE System SHALL provide a "View Detailed Analytics" link to full dashboard
9. THE System SHALL show trend indicators (up/down arrows with percentages)
10. THE System SHALL allow exporting analytics data as CSV

### Requirement 15: Environment Configuration and Error Handling

**User Story:** As a system administrator, I want proper environment configuration and error handling, so that the system is maintainable and debuggable.

#### Acceptance Criteria

1. THE System SHALL use environment variables for all configuration (PUBLIC_URL, QR_CODE_SIZE, VCARD_VERSION)
2. THE System SHALL validate environment variables on application startup
3. THE System SHALL log errors with descriptive messages and error codes
4. THE System SHALL use standardized error codes (PROFILE_001 for slug taken, PROFILE_002 for invalid format, etc.)
5. THE System SHALL provide user-friendly error messages for all error scenarios
6. THE System SHALL log all errors to monitoring system (Sentry/GlitchTip)
7. THE System SHALL set up alerts for critical errors (QR generation failures > 5%, vCard failures > 5%)
8. THE System SHALL provide detailed error context for debugging (user ID, workspace ID, timestamp)
9. THE System SHALL implement graceful degradation for non-critical failures
10. THE System SHALL document all error codes and their meanings

## Notes

- All requirements are critical for providing a professional, user-friendly company profile experience
- Requirements 1-8 focus on frontend UX improvements
- Requirement 9 focuses on backend API corrections
- Requirement 10 ensures quality and reliability through comprehensive testing
- Requirements 11-14 add high-value features that improve user experience and engagement
- Requirement 15 ensures system maintainability and debuggability
- Implementation should prioritize Requirements 1, 2, 3, 4, and 11 as they address the most critical user-facing issues
- Requirements 12-14 can be implemented in parallel with core fixes
- Theme-related requirements (7-8) can be implemented in a later phase if needed
- All changes must maintain backward compatibility with existing profiles
- All changes must follow existing code patterns and architecture
