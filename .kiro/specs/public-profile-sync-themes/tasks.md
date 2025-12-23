# Implementation Plan: Public Profile Sync & Themes Enhancement

## Overview

This implementation plan addresses the synchronization issues between the Company Profile editor preview and live public profile, fixes theme persistence, expands the theme library to 20+ themes with gradients, and adds GPS coordinate support for precise location mapping.

The plan is organized into four phases:
- **Phase 1**: Core Fixes (Theme Sync, Data Flow)
- **Phase 2**: Theme Library Expansion (20+ Themes)
- **Phase 3**: UI Enhancements (Action Buttons, Coordinates)
- **Phase 4**: Testing & Polish

## Tasks

### Phase 1: Core Theme Sync Fixes

- [x] 1. Create ThemeTransformer Utility
  - [x] 1.1 Create `frontend/src/utils/themeTransformer.ts` with unified theme transformation logic
    - Implement `transformThemeForProfileCard()` function
    - Handle both editor theme state and API response format
    - Generate themeColors, themeTypography, themeLayout, and backgroundGradient
    - _Requirements: 1.1, 1.2, 1.6, 10.3_

  - [ ] 1.2 Write property test for theme transformation consistency
    - **Property 1: Preview and Public Profile Visual Parity**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.6**

- [x] 2. Fix PublicProfileView Theme Application
  - [x] 2.1 Update `PublicProfileView.tsx` to use ThemeTransformer
    - Import and use transformThemeForProfileCard
    - Pass transformed theme props to ProfileCard
    - Load fonts from theme typography
    - _Requirements: 1.5, 10.1, 10.2, 10.3_

  - [x] 2.2 Add font loading to PublicProfileView
    - Use fontService to load theme fonts on mount
    - Handle font loading errors gracefully
    - _Requirements: 3.1, 3.2, 10.5_

  - [ ] 2.3 Write property test for font loading and fallback
    - **Property 4: Font Loading and Fallback**
    - **Validates: Requirements 3.1, 3.2, 3.4**

- [x] 3. Fix Theme Persistence
  - [x] 3.1 Verify backend theme save endpoint works correctly
    - Test POST /profile-editor/theme/apply saves theme_id
    - Verify theme_id is stored in company_profiles table
    - _Requirements: 2.1, 2.2_

  - [x] 3.2 Verify public profile API returns theme data
    - Test GET /public/profiles/{slug} includes theme object
    - Verify theme base_colors, typography, layout are included
    - _Requirements: 10.1_

  - [ ] 3.3 Write property test for theme persistence round-trip
    - **Property 2: Theme Data Persistence Round-Trip**
    - **Validates: Requirements 2.1, 2.2, 3.5**

- [x] 4. Checkpoint - Verify theme sync works
  - Test that selecting a theme in editor shows in preview
  - Test that saving and viewing public profile shows the theme
  - Ensure all tests pass, ask the user if questions arise.

### Phase 2: Theme Library Expansion

- [x] 5. Add New Theme Definitions
  - [x] 5.1 Add Minimal category themes (Paper White, Soft Gray)
    - Define base_colors with neutral palettes
    - Configure clean typography (Inter, System UI)
    - Add light and dark variants
    - _Requirements: 5.1, 5.7_

  - [x] 5.2 Add Bold category themes (Electric Pop, Neon Nights)
    - Define vibrant base_colors
    - Configure bold typography (Poppins, Montserrat)
    - Add gradient definitions
    - _Requirements: 5.1, 5.2_

  - [x] 5.3 Add Elegant category themes (Rose Gold, Champagne)
    - Define sophisticated color palettes
    - Configure serif typography (Playfair Display, Cormorant)
    - Add subtle gradients
    - _Requirements: 5.1, 5.2_

  - [x] 5.4 Add Modern category themes (Midnight Blue, Slate Pro)
    - Define professional color palettes
    - Configure modern sans-serif typography
    - Add light and dark variants
    - _Requirements: 5.1, 5.7_

  - [x] 5.5 Add Creative category themes (Cosmic Purple, Sunset Vibes)
    - Define artistic color palettes
    - Configure expressive typography
    - Add multiple gradient definitions
    - _Requirements: 5.1, 5.2_

  - [x] 5.6 Add Gradient category themes (Ocean Breeze, Forest Mist, Peach Sunset, Lavender Haze)
    - Define gradient-focused color palettes
    - Configure complementary typography
    - Add glassmorphism effects
    - _Requirements: 5.1, 5.2, 5.6_

  - [ ] 5.7 Write property test for theme structure validation
    - **Property 6: Theme Structure Validation**
    - **Validates: Requirements 5.4, 5.7**

  - [ ] 5.8 Write property test for WCAG contrast compliance
    - **Property 7: WCAG Contrast Compliance**
    - **Validates: Requirements 5.8**

- [x] 6. Implement Gradient Rendering
  - [x] 6.1 Update ProfileCard to support gradient backgrounds
    - Add backgroundGradient prop handling
    - Apply gradient to header section
    - Validate gradient CSS to prevent injection
    - _Requirements: 6.1, 6.3, 6.4_

  - [ ] 6.2 Write property test for gradient CSS generation
    - **Property 8: Gradient CSS Generation**
    - **Validates: Requirements 6.1, 6.3, 6.4**

- [x] 7. Update ThemeSelector for New Categories
  - [x] 7.1 Add 'gradient' category to ThemeSelector
    - Update category tabs to include gradient
    - Add gradient icon for category
    - _Requirements: 5.4_

  - [x] 7.2 Update theme preview cards to show gradients
    - Render gradient preview in theme cards
    - Show glassmorphism effects in preview
    - _Requirements: 5.5_

- [x] 8. Checkpoint - Verify 20+ themes work
  - Verify all 20+ themes render correctly
  - Test gradient themes display properly
  - Ensure all tests pass, ask the user if questions arise.

### Phase 3: UI Enhancements

- [x] 9. Update Action Buttons for Consistency
  - [x] 9.1 Replace "Save Contact" button with icon button
    - Change from text button to icon-only button
    - Use UserPlus icon matching QR and Share buttons
    - Add tooltip "Save Contact"
    - _Requirements: 4.1, 4.2_

  - [x] 9.2 Add accessibility attributes to all action buttons
    - Add aria-label to Save Contact, QR, Share buttons
    - Add title attributes for tooltips
    - _Requirements: 4.3, 4.4_

  - [ ] 9.3 Write property test for action button accessibility
    - **Property 5: Action Button Accessibility**
    - **Validates: Requirements 4.3, 4.4**

- [x] 10. Add GPS Coordinate Support
  - [x] 10.1 Update AddressStructured type to include coordinates
    - Add latitude and longitude optional fields
    - Update Zod validation schema
    - _Requirements: 9.9_

  - [x] 10.2 Create coordinate input component
    - Add latitude/longitude input fields
    - Add format hints and validation
    - Add "Get Current Location" button
    - _Requirements: 9.1, 9.3, 9.10_

  - [x] 10.3 Implement coordinate validation
    - Validate latitude range [-90, 90]
    - Validate longitude range [-180, 180]
    - Validate precision to 6 decimal places
    - _Requirements: 9.2, 9.12_

  - [ ] 10.4 Write property test for coordinate validation
    - **Property 9: Coordinate Validation**
    - **Validates: Requirements 9.2, 9.12**

  - [x] 10.5 Create map URL generator utility
    - Implement generateMapUrl function
    - Prioritize coordinates over address
    - Fall back to address when no coordinates
    - _Requirements: 9.5, 9.6, 9.8_

  - [ ] 10.6 Write property test for map URL generation
    - **Property 10: Map URL Generation Priority**
    - **Validates: Requirements 9.5, 9.6, 9.8**

  - [x] 10.7 Update ProfileCard location link
    - Use generateMapUrl for location CTA
    - Display address text (not coordinates)
    - _Requirements: 9.7, 9.11_

  - [ ] 10.8 Write property test for coordinate display privacy
    - **Property 11: Coordinate Display Privacy**
    - **Validates: Requirements 9.7, 9.11**

- [x] 11. Add Secondary Contact Support
  - [x] 11.1 Update CompanyProfile type for secondary contacts
    - Add secondary_emails array (max 2)
    - Add secondary_phones array (max 2)
    - Each with label and value fields
    - _Requirements: 11.1, 11.2_

  - [x] 11.2 Add secondary contact inputs to CompanyProfileForm
    - Add expandable sections for additional emails/phones
    - Add custom label inputs
    - Add individual visibility toggles
    - _Requirements: 11.3, 11.4_

  - [x] 11.3 Update ProfileCard to display secondary contacts
    - Render secondary emails with labels
    - Render secondary phones with labels
    - Respect visibility settings
    - _Requirements: 11.3, 11.5_

  - [ ] 11.4 Write property test for secondary contact limits
    - **Property 13: Secondary Contact Limits**
    - **Validates: Requirements 11.1, 11.2**

  - [ ] 11.5 Write property test for contact format validation
    - **Property 15: Contact Format Validation**
    - **Validates: Requirements 11.6, 12.5**

- [x] 12. Expand Social Media Platform Support
  - [x] 12.1 Add new social platforms to constants
    - Add Pinterest, Behance, Dribbble, TikTok, YouTube, WhatsApp
    - Define brand colors for each platform
    - _Requirements: 12.1, 12.2_

  - [x] 12.2 Update social icons in ProfileCard
    - Add icons for new platforms
    - Apply platform-specific brand colors
    - _Requirements: 12.2_

  - [x] 12.3 Add visibility toggles for new platforms
    - Add toggle for each new platform
    - Update visibility config type
    - _Requirements: 12.3_

  - [ ] 12.4 Write property test for social platform brand colors
    - **Property 14: Social Platform Brand Colors**
    - **Validates: Requirements 12.2**

  - [ ] 12.5 Write property test for visibility filtering
    - **Property 12: Visibility Filtering Consistency**
    - **Validates: Requirements 11.5, 12.4**

- [x] 13. Checkpoint - Verify UI enhancements
  - Test action buttons are consistent icons
  - Test coordinate input and map navigation
  - Test secondary contacts display correctly
  - Test new social platforms work
  - Ensure all tests pass, ask the user if questions arise.

### Phase 4: Testing & Polish

- [ ] 14. Integration Testing
  - [ ] 14.1 Test complete theme workflow
    - Select theme → Save → View public profile
    - Verify theme colors, fonts, layout applied
    - _Requirements: 1.5, 2.1, 2.3_

  - [ ] 14.2 Test coordinate workflow
    - Enter coordinates → Save → Click location
    - Verify map opens to correct location
    - _Requirements: 9.5, 9.8_

  - [ ] 14.3 Test visibility workflow
    - Toggle visibility → Save → View public profile
    - Verify hidden fields not displayed
    - _Requirements: 1.4, 11.5, 12.4_

- [ ] 15. Performance Optimization
  - [ ] 15.1 Optimize font loading
    - Add preconnect hints for Google Fonts
    - Implement font-display: swap
    - _Requirements: 8.1, 8.3_

  - [ ] 15.2 Optimize theme preview rendering
    - Memoize theme transformation
    - Debounce rapid theme changes
    - _Requirements: 7.1, 7.2_

- [ ] 16. Cache Invalidation
  - [ ] 16.1 Ensure cache invalidation on theme save
    - Verify Redis cache cleared on theme update
    - Test public profile reflects changes immediately
    - _Requirements: 2.6_

- [ ] 17. Final Checkpoint
  - Run all property tests
  - Run all unit tests
  - Verify all requirements are met
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks including property-based tests are required for comprehensive validation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at each phase
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The implementation maintains backward compatibility with existing profiles

