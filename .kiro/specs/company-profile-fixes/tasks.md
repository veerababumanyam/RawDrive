# Implementation Plan: Company Profile Critical Fixes

## Overview

This implementation plan addresses critical issues in the Company Profile feature through incremental, testable tasks. The plan is organized into three phases:

- **Phase 1**: Critical Backend Fixes (QR Code URL, vCard improvements, Environment Config)
- **Phase 2**: Frontend UX Improvements (Slug Editor, Copy/Share, Secondary Contacts)
- **Phase 3**: Theme Management and Polish

## Current Implementation Status

**Already Implemented:**
- ✅ QR Code service (backend/src/app/services/qr_service.py)
- ✅ vCard service (backend/src/app/services/vcard_service.py)
- ✅ QR Code API endpoint (GET /api/v1/public/profiles/{slug}/qr-code)
- ✅ vCard API endpoint (GET /api/v1/public/profiles/{slug}/vcard)
- ✅ Frontend QR/vCard download buttons in CompanyProfileForm
- ✅ Frontend QR/vCard buttons on public profile (ProfileCard)
- ✅ Slug editor with inline edit mode
- ✅ Copy URL and Share functionality in frontend

**Issues to Fix:**
- ✅ QR Code URL hardcoded to "lumina.co" instead of "rawdrive.ai" - FIXED
- ✅ QR Code error correction level is 'L' instead of 'H' - FIXED
- ✅ vCard missing logo as BASE64 PHOTO field - FIXED
- ✅ vCard missing E.164 phone formatting - FIXED
- ✅ No environment variable configuration for PUBLIC_URL - FIXED
- ✅ Missing secondary contacts support (database schema + UI) - FIXED
- ✅ Theme management implemented (Theme Selector, Customization UI, Undo/Redo, Accessibility, Help)

## Tasks

### Phase 1: Critical Backend Fixes

- [x] 1. Environment Configuration and URL Management
  - Add PUBLIC_URL environment variable to backend .env (default: https://rawdrive.ai)
  - Update backend/src/app/config/settings.py to include public_url field
  - Update company_profile_service.py generate_public_url() to use settings.public_url
  - Add VITE_PUBLIC_URL environment variable to frontend .env
  - Update docker-compose.yml with PUBLIC_URL environment variable
  - Document environment variables in backend/README.md
  - _Requirements: 9.2, 9.3_

- [x] 2. Fix QR Code Service
  - Update backend/src/app/services/qr_service.py
  - Change error_correction from ERROR_CORRECT_L to ERROR_CORRECT_H
  - Increase box_size to generate minimum 512x512 pixel QR codes
  - Add unit tests for QR code generation with correct error correction
  - _Requirements: 2.5, 2.11, 2.12_

- [x] 3. Enhance vCard Service
  - Update backend/src/app/services/vcard_service.py
  - Add phone number formatting to E.164 standard (use phonenumbers library)
  - Add logo as BASE64-encoded PHOTO field (fetch from logo endpoint)
  - Improve UTF-8 encoding handling for international characters
  - Add unit tests for phone formatting and logo inclusion
  - _Requirements: 3.4, 3.8, 3.11, 3.13_

- [x] 4. Add Rate Limiting to Public Endpoints
  - Add rate limiting middleware to QR code endpoint (100 req/min per IP)
  - Add rate limiting middleware to vCard endpoint (100 req/min per IP)
  - Use Redis for rate limit tracking
  - Return 429 Too Many Requests with Retry-After header
  - _Requirements: 9.11, 9.12_

- [x] 5. Test QR Code and vCard Generation
  - Test QR code scanning with iOS Camera app (verify redirects to rawdrive.ai)
  - Test QR code scanning with Android Camera app
  - Test QR code scanning with dedicated QR reader apps
  - Test vCard import into iOS Contacts (verify all fields including logo)
  - Test vCard import into Android Contacts
  - Test vCard import into Google Contacts
  - Test vCard import into Outlook
  - Verify phone numbers are correctly formatted
  - _Requirements: 2.7, 3.14_

- [x] 6. Checkpoint - Ensure backend fixes tests pass
  - All unit tests pass
  - All integration tests pass
  - QR codes redirect to rawdrive.ai (not lumina.co)
  - vCards include logo and properly formatted phone numbers
  - Rate limiting works correctly


### Phase 2: Frontend UX Improvements and Secondary Contacts

- [x] 7. Database Schema Extensions for Secondary Contacts
  - Create migration to add secondary_emails JSONB column to company_profiles
  - Create migration to add secondary_phones JSONB column to company_profiles
  - Add visibility columns: visibility_secondary_email_1, visibility_secondary_email_2
  - Add visibility columns: visibility_secondary_phone_1, visibility_secondary_phone_2
  - Add visibility columns: visibility_qr_code, visibility_vcard (for public profile buttons)
  - Add indexes for performance
  - Test migration rollback
  - _Requirements: 6.9, 6.14_

- [x] 8. Backend API Updates for Secondary Contacts
  - Update backend/src/app/api/company_profile_schemas.py
  - Add secondary_emails and secondary_phones fields to CreateCompanyProfileRequest
  - Add secondary_emails and secondary_phones fields to UpdateCompanyProfileRequest
  - Add secondary_emails and secondary_phones fields to CompanyProfileResponse
  - Update backend/src/app/services/company_profile_service.py
  - Add validation for email format (RFC 5322) for secondary emails
  - Add validation for phone format (E.164) for secondary phones
  - Update vCard generation to include secondary contacts with TYPE labels
  - Add unit tests for validation logic
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.7, 6.8, 6.9_

- [x] 9. Frontend TypeScript Type Definitions for Secondary Contacts
  - Update frontend/src/types/companyProfile.ts
  - Add SecondaryContact interface: { value: string; label?: string; visible: boolean }
  - Update CompanyProfile interface with secondary_emails and secondary_phones arrays
  - Update CompanyVisibilityConfig interface with secondary contact visibility fields
  - Update CreateCompanyProfileRequest interface
  - Update validation schemas with Zod
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 10. Secondary Contact UI Components in Profile Editor
  - Update frontend/src/components/features/settings/CompanyProfileForm.tsx
  - Create SecondaryContactInput component (or inline implementation)
  - Add "Add Secondary Email" button (max 2 secondary emails)
  - Add "Add Secondary Phone" button (max 2 secondary phones)
  - Add individual visibility toggles for each secondary contact
  - Add delete button for secondary contacts
  - Add labels (Primary, Secondary 1, Secondary 2)
  - Implement validation feedback for email and phone formats
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.12, 6.13_

- [x] 11. Display Secondary Contacts on Public Profile
  - Update frontend/src/components/features/profile/ProfileCard.tsx
  - Display secondary emails with clear labels
  - Display secondary phones with clear labels
  - Maintain consistent styling with primary contacts
  - Respect visibility settings for each secondary contact
  - _Requirements: 6.10, 6.11, 6.15_

- [x] 12. Slug Editor UX Polish (if needed)
  - Review current slug editor implementation in CompanyProfileForm.tsx
  - Verify adequate spacing (48px height, 16-24px margins)
  - Verify URL preview is prominent
  - Verify Edit/Confirm/Cancel buttons are clear
  - Verify validation feedback is positioned correctly
  - Verify tooltips explain slug requirements
  - Verify WCAG 2.1 AA compliance (contrast, focus indicators)
  - Make adjustments if any issues found
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.11, 1.12, 1.14, 1.15_

- [x] 13. Checkpoint - Ensure frontend UX tests pass
  - All component tests pass
  - Slug editor is user-friendly
  - Copy/share functionality works across browsers
  - Secondary contacts display correctly on public profile
  - Secondary contacts can be added/removed in editor
  - Visibility toggles work for secondary contacts


### Phase 3: Theme Management and Polish

- [x] 14. Theme Data Model and Seed Data
  - Create themes table schema (if not exists from migration 0017)
  - Create theme_customizations table schema (if not exists)
  - Seed 5-10 default themes with thumbnails
  - Organize themes by categories (Minimal, Bold, Elegant, Modern, Creative)
  - Add theme metadata (name, description, category)
  - _Requirements: 7.2, 7.5_

- [x] 15. Theme Service Implementation
  - Create or update backend theme service
  - Implement listThemes method
  - Implement getTheme method
  - Implement applyTheme method
  - Add caching for theme data
  - _Requirements: 7.1, 7.3, 7.8_

- [x] 16. Theme API Endpoints
  - Create GET /api/v1/themes endpoint
  - Create GET /api/v1/themes/:theme_id endpoint
  - Create PATCH /api/v1/workspaces/:workspace_id/profile/theme endpoint
  - Add proper error handling
  - Add rate limiting
  - _Requirements: 7.1, 7.8_

- [x] 17. Theme Selector Component
  - Create frontend/src/components/features/settings/ThemeSelector.tsx
  - Display theme thumbnails in grid layout
  - Add category tabs/filters
  - Add style filters (light/dark, warm/cool)
  - Show currently active theme indicator
  - Implement theme selection with immediate preview
  - Add search/filter input
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.12, 7.13_

- [x] 18. Theme Customization UI
  - Create frontend/src/components/features/settings/ThemeCustomization.tsx
  - Add color picker for primary/secondary/accent colors
  - Add font selector for heading/body fonts
  - Add layout options (spacing, style)
  - Show real-time preview of changes
  - Add preset color palettes
  - Add color harmony suggestions
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.7, 8.8, 8.12_

- [x] 19. Theme Undo/Redo and Save
  - Implement undo/redo functionality (last 10 actions)
  - Add undo/redo buttons
  - Implement auto-save with visual confirmation
  - Add "Reset to Default" button
  - Add "Save as Preset" functionality
  - _Requirements: 8.5, 8.6, 8.15_

- [x] 20. Theme Accessibility Validation
  - Implement WCAG 2.1 AA contrast checker
  - Show warnings for contrast violations
  - Suggest accessible color alternatives
  - Validate all theme customizations
  - _Requirements: 8.9_

- [x] 21. Theme Help and Onboarding
  - Create theme customization tour/walkthrough
  - Add tooltips for all customization options
  - Add help button with documentation
  - Show before/after comparison on hover
  - Display "Customized" badge on modified themes
  - _Requirements: 8.10, 8.11, 8.13, 8.14_

- [x] 22. Integration Testing
  - Test complete profile creation flow with all features
  - Test QR code generation and scanning end-to-end
  - Test vCard generation and import end-to-end
  - Test theme selection and customization
  - Test secondary contacts in all contexts
  - Test copy/share functionality across browsers
  - _Requirements: 10.4, 10.5, 10.6_

- [x] 23. Cross-Browser and Device Testing
  - Test on Chrome (desktop and mobile)
  - Test on Firefox (desktop and mobile)
  - Test on Safari (desktop and mobile)
  - Test on Edge (desktop)
  - Test on iOS devices (iPhone, iPad)
  - Test on Android devices (various manufacturers)
  - Test responsive layouts at all breakpoints
  - _Requirements: 10.10, 10.11_

- [x] 24. Accessibility Testing
  - Run axe-core accessibility tests
  - Test keyboard navigation for all features
  - Test screen reader compatibility (NVDA, JAWS, VoiceOver)
  - Verify WCAG 2.1 AA compliance
  - Test with browser zoom up to 200%
  - _Requirements: 10.8_

- [x] 25. Performance Testing and Optimization
  - Measure page load times (target < 2 seconds)
  - Optimize image sizes (QR codes, theme thumbnails)
  - Implement lazy loading for theme thumbnails
  - Add caching for frequently accessed data
  - Measure and optimize API response times
  - _Requirements: 10.9_

- [x] 26. Documentation and Deployment
  - Update API documentation with new endpoints
  - Update user documentation with new features
  - Create deployment checklist
  - Prepare rollback procedures
  - Set up monitoring and alerting
  - Create release notes
  - _Requirements: All_

- [x] 27. Final Checkpoint - Production Readiness
  - All tests pass (unit, integration, E2E)
  - Code coverage > 80%
  - Performance metrics meet targets
  - Accessibility compliance verified
  - Documentation complete
  - Deployment plan approved
  - Rollback procedures tested

## Notes

- Tasks are organized by priority and dependencies
- Each task includes specific requirements references
- Checkpoints ensure quality at each phase
- Testing is integrated throughout implementation
- All changes maintain backward compatibility
- Feature flags should be used for gradual rollout
- Monitor error rates and user feedback after deployment

## Success Criteria

- QR codes redirect to rawdrive.ai URLs (100% success rate)
- vCards import correctly into major contact apps with logo (>90% success rate)
- vCards include properly formatted E.164 phone numbers
- Slug editor task completion time < 30 seconds
- Copy/share feature usage > 20% of profile edits
- Secondary contacts can be added and displayed correctly
- Theme selection engagement > 40% of users (Phase 3)
- Zero critical bugs in production
- User satisfaction score > 4.5/5
- Page load times < 2 seconds
- WCAG 2.1 AA compliance achieved
- Code coverage > 80%
