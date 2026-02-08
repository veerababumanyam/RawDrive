# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2025-01-27

### Added
- **Gallery Preview Feature**: New "View as Client" preview functionality that allows workspace users to preview galleries exactly as clients see them
  - New `GalleryPreviewPage` component that renders full public gallery view without workspace sidebar
  - Preview route `/workspace/galleries/:id/preview` opens in new tab
  - Works even when gallery is not published/shared
  - Full public gallery UI with hero section, workflow tabs, and asset grid
- **Security Enhancements**: 
  - UUID validation to prevent gallery ID exposure in public URLs
  - Client-side detection and warning for insecure gallery ID usage
  - Backend validation rejects UUIDs as magic link tokens
- **Documentation**:
  - `docs/SECURITY_GALLERY_ID_EXPOSURE.md` - Security analysis of gallery ID exposure risks
  - `docs/TEST_RESULTS_MAGIC_LINKS.md` - Test results for magic link fixes

### Fixed
- **Magic Link Creation**: Fixed 500 error when creating magic links
  - Added missing `album_title` field to `CreateMagicLinkRequest` schema
  - Improved error handling and logging for database issues
- **Magic Link Validation**: Fixed 404/422 errors when accessing public galleries
  - Corrected frontend to use magic link token instead of gallery ID
  - Added token validation before accessing gallery data
  - Fixed URL parameter naming (`galleryId` → `token`)
- **QR Code Generation**: Fixed 401 error when fetching QR codes
  - Added Authorization header to QR code API requests
- **Public Gallery Page**: Fixed multiple runtime errors
  - Fixed `galleryId is not defined` error in FaceDiscovery component
  - Fixed `Cannot read properties of undefined (reading 'total_photos')` error
  - Added default stats initialization and proper stats updates
  - Added missing fields (`created_by_user_id`, `created_at`, `sub_galleries`)
- **Dashboard Page**: Fixed syntax error (extra closing parenthesis)
- **API Validation**: Fixed 422 error in preview page
  - Corrected `listGalleryAssets` limit parameter (max 100 instead of 1000)

### Changed
- **Route Configuration**: Moved preview route from workspace routes to public routes
  - Preview page now renders without workspace sidebar (authenticated but public-style UI)
  - Still requires authentication via `ProtectedRoute`
- **"View as Client" Behavior**: Changed from creating magic links to opening preview page
  - All "View as Client" buttons now open `/workspace/galleries/:id/preview` in new tab
  - Preview works independently of public sharing status
- **Magic Link URL Generation**: Improved base URL detection in development
  - Prioritizes frontend origin (`localhost:5173`) over backend URL in development
  - Better handling of `Origin` and `Referer` headers

### Security
- **Gallery ID Exposure Prevention**: 
  - Backend rejects UUIDs passed as magic link tokens (400 error)
  - Frontend detects and warns users about insecure gallery ID usage
  - Documentation of security risks (OWASP, SOC 2, NIST, GDPR/CCPA compliance)

## [0.2.9] - Previous Release

### Added
- FastAPI 204 error handling improvements
- Database migration fixes and verification
- System stability enhancements

## [0.2.8] - Previous Release

### Added
- AI Filter Simplify feature
- HEIC-to-JPEG conversion for preview generation

## [0.2.6] - Previous Release

Previous version baseline.
