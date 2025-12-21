# Implementation Plan: CompanyProfile Branding System

## Overview

This implementation plan converts the CompanyProfile branding system design into a series of incremental coding tasks. The approach consolidates existing branding functionality while adding enhanced features like visibility controls, vCard/QR generation, and AI policy integration. Each task builds on previous work and maintains backward compatibility with existing gallery branding systems.

The plan is organized into three phases:
- **Phase 1**: Core MVP (Database, API, Basic Frontend)
- **Phase 2**: Enhanced Features (vCard, QR, SEO, Public Profiles)
- **Phase 3**: Advanced Features (AI Integration, Observability, Documentation)

## Tasks

### Phase 1: Core MVP Foundation

- [x] 1. Database Schema Enhancement and Migration
  - Extend existing company_profiles table with new fields (tagline, slug, favicon_url, brand_color, brand_font, socials, custom_links, company_visibility)
  - Create address_structured JSONB field to replace flat address field
  - Add indexes for new fields (slug, workspace_id + slug)
  - Add rollback procedures for database migrations
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 9.7_

- [x] 1.1 Write property test for database schema migration
  - **Property 1: Profile Data Persistence**
  - **Validates: Requirements 1.1**

- [x] 1.2 Add migration rollback procedures
  - Create rollback scripts for schema changes
  - Add data validation and integrity checks
  - _Requirements: 9.7_

- [x] 2. Legacy Data Migration and Consolidation
  - Create migration script to consolidate branding_profiles data into enhanced company_profiles
  - Implement gradual migration with feature flags
  - Add data validation and integrity checks post-migration
  - Update existing galleries to reference enhanced CompanyProfile system
  - _Requirements: 3.6, 8.6, 9.7_

- [x] 2.1 Write integration tests for migration process
  - Test data consolidation from branding_profiles to company_profiles
  - Test backward compatibility with existing galleries
  - _Requirements: 3.6, 8.6, 9.7_

- [x] 3. Enhanced CompanyProfile Data Models and Validation
  - Create enhanced CompanyProfile Pydantic model with all new fields
  - Implement Zod-equivalent validation schemas using Pydantic validators
  - Create CompanyVisibilityConfig model for visibility settings
  - Add validation for email, phone, URL formats
  - Implement slug format validation (kebab-case, uniqueness)
  - Add input sanitization for security
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 9.1_

- [x] 3.1 Write property test for contact information validation
  - **Property 2: Contact Information Validation and Storage**
  - **Validates: Requirements 1.2**

- [x] 3.2 Write property test for social media links storage
  - **Property 3: Social Media Links Storage**
  - **Validates: Requirements 1.3**

- [x] 3.3 Write property test for custom links array storage
  - **Property 4: Custom Links Array Storage**
  - **Validates: Requirements 1.4**

- [x] 4. Visibility Filter Service Implementation
  - Create VisibilityFilterService class with filterVisible method
  - Implement getDefaultVisibility method for new profiles
  - Add updateVisibility method for configuration changes
  - Create utility functions for visibility-based data filtering
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 4.1 Write property test for visibility configuration updates
  - **Property 7: Visibility Configuration Updates**
  - **Validates: Requirements 2.1**

- [x] 4.2 Write property test for consistent visibility filtering
  - **Property 8: Consistent Visibility Filtering**
  - **Validates: Requirements 2.2, 2.3**

- [x] 5. Enhanced CompanyProfile Service Layer
  - Extend existing CompanyProfileService with new CRUD operations
  - Implement workspace isolation enforcement in all methods
  - Add timestamp management for updated_at field
  - Implement slug uniqueness validation across workspaces
  - Add rate limiting for profile operations
  - _Requirements: 1.5, 1.6, 4.3, 9.2_

- [x] 5.1 Write property test for workspace isolation enforcement
  - **Property 5: Workspace Isolation Enforcement**
  - **Validates: Requirements 1.5, 9.2**

- [x] 5.2 Write property test for timestamp updates
  - **Property 6: Timestamp Update on Field Changes**
  - **Validates: Requirements 1.6**

- [x] 5.3 Write property test for slug uniqueness constraint
  - **Property 11: Slug Uniqueness Constraint**
  - **Validates: Requirements 4.3**

- [x] 6. CompanyProfile API Endpoints
  - Implement POST /api/v1/workspaces/{workspace_id}/company-profile (create/update)
  - Implement GET /api/v1/workspaces/{workspace_id}/company-profile (read)
  - Implement PATCH /api/v1/workspaces/{workspace_id}/company-profile/visibility (visibility management)
  - Implement GET /api/v1/workspaces/{workspace_id}/company-profile/studio-defaults (for gallery integration)
  - Add proper error handling and validation
  - Implement CSRF protection for profile update endpoints
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 9.1_

- [x] 6.1 Write unit tests for API endpoints
  - Test CRUD operations with various input combinations
  - Test error conditions and validation failures
  - Test security measures (CSRF, rate limiting)
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1_

- [x] 6.2 Implement graceful degradation for service failures
  - Add fallback mechanisms for external service failures
  - Implement retry logic with exponential backoff
  - _Requirements: Error handling strategy_

- [x] 7. Checkpoint - Ensure core profile management tests pass
  - Ensure all tests pass, ask the user if questions arise.

### Phase 2: Enhanced Features

- [x] 8. vCard Generation Service
  - Create VCardService class with generateVCard method
  - Implement vCard 3.0 format generation with visible fields only
  - Add exportVCard method for file download
  - Implement validateVCardData for input validation
  - Create API endpoint GET /api/v1/public/profiles/{slug}/vcard
  - Add graceful degradation for vCard generation failures
  - _Requirements: 5.1, 5.4_

- [x] 8.1 Write property test for vCard format validation
  - **Property 12: vCard Format Validation**
  - **Validates: Requirements 5.1**

- [x] 9. QR Code Generation Service
  - Create QRCodeService class with generateQRCode method
  - Implement generateProfileQR for public profile URLs
  - Add API endpoint GET /api/v1/public/profiles/{slug}/qr-code
  - Configure QR code options (size, error correction)
  - Add caching for generated QR codes
  - _Requirements: 5.2_

- [x] 9.1 Write property test for QR code URL encoding
  - **Property 13: QR Code URL Encoding**
  - **Validates: Requirements 5.2**

- [x] 10. SEO Schema Service Implementation
  - Create SEOSchemaService class with generateBusinessSchema method
  - Implement ProfessionalService schema type for photography businesses
  - Add generateBreadcrumbSchema method for navigation
  - Implement validateSchema method for schema validation
  - _Requirements: 6.1, 6.2, 6.4_

- [x] 10.1 Write property test for SEO schema markup inclusion
  - **Property 14: SEO Schema Markup Inclusion**
  - **Validates: Requirements 6.1**

- [x] 10.2 Write property test for professional service schema type
  - **Property 15: Professional Service Schema Type**
  - **Validates: Requirements 6.2**

- [x] 11. Public Profile Integration with Caching
  - Extend existing public profile endpoints to use enhanced CompanyProfile
  - Implement GET /api/v1/public/profiles/{slug} with visibility filtering
  - Add SEO metadata generation for public profiles
  - Integrate vCard and QR code endpoints
  - Implement caching layer for public profile rendering (Redis/memory cache)
  - Add input sanitization for public profile rendering
  - _Requirements: 4.1, 4.2, 6.1, 6.4_

- [x] 11.1 Write property test for public profile URL generation
  - **Property 10: Public Profile URL Generation**
  - **Validates: Requirements 4.1**

- [x] 11.2 Write load tests for public profile performance
  - Test public profile loading under various loads
  - Validate caching effectiveness
  - _Requirements: 10.1_

- [x] 12. Gallery Branding Integration
  - Extend existing gallery service to support enhanced CompanyProfile
  - Implement POST /api/v1/workspaces/{workspace_id}/company-profile/apply-to-gallery/{gallery_id}
  - Add studio defaults application with visibility filtering
  - Maintain backward compatibility with existing branding_profile_id references
  - Update gallery header/footer rendering to use CompanyProfile data
  - Add bulk operations for gallery branding updates
  - _Requirements: 3.2, 3.4, 3.6, 8.1, 8.6_

- [x] 12.1 Write property test for studio defaults application
  - **Property 9: Studio Defaults Application**
  - **Validates: Requirements 3.2**

- [x] 12.2 Write property test for conditional branding display
  - **Property 17: Conditional Branding Display**
  - **Validates: Requirements 8.1**

- [x] 13. Frontend CompanyProfile Form Component
  - Create CompanyProfileForm React component with all profile fields
  - Implement visibility toggle controls for each field
  - Add form validation using existing validation patterns
  - Create social media links management interface
  - Add custom links array management with add/remove functionality
  - Implement WCAG 2.1 AA compliance for profile forms
  - Add keyboard navigation for all profile interactions
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1_

- [-] 13.1 Write unit tests for CompanyProfile form component
  - Test form validation and submission
  - Test visibility toggle functionality
  - Test accessibility compliance
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1_

- [x] 14. Gallery Settings Integration
  - Extend existing BrandingSettings component to use CompanyProfile
  - Add "Apply Studio Defaults" button functionality
  - Implement studio defaults preview before application
  - Maintain compatibility with existing gallery branding workflow
  - _Requirements: 3.1, 3.2, 3.4_

- [x] 15. Enhanced Public Profile Frontend
  - Extend existing PublicProfile component with enhanced CompanyProfile data
  - Add vCard download functionality
  - Add QR code display and download
  - Implement SEO metadata rendering
  - Add social media icons and custom links display
  - Add RTL support for Urdu language profiles
  - Implement lazy loading for social media icons and custom links
  - _Requirements: 4.1, 4.2, 5.1, 5.2, 6.1, 8.2, 8.5_

- [ ] 16. Checkpoint - Ensure enhanced features tests pass
  - Ensure all tests pass, ask the user if questions arise.

### Phase 3: Advanced Features and Observability

- [x] 17. AI Policy Integration Service
  - Create AIPolicyIntegration class with generateLegalPolicy method
  - Implement policy generation using company name as legal entity
  - Add regeneratePolicies method for bulk policy updates
  - Integrate with existing AI service infrastructure
  - Add retry logic and fallback mechanisms for AI service integration
  - _Requirements: 7.1, 7.2, 7.4_

- [x] 17.1 Write property test for AI policy company name usage
  - **Property 16: AI Policy Company Name Usage**
  - **Validates: Requirements 7.1**

- [x] 18. Observability and Monitoring
  - Implement metrics collection for profile operations
  - Add logging for vCard/QR generation and AI policy integration
  - Create dashboards for monitoring profile usage and performance
  - Add alerting for service failures and performance issues
  - _Requirements: Observability strategy_

- [x] 18.1 Write property test for field validation with Zod schemas
  - **Property 18: Field Validation with Zod Schemas**
  - **Validates: Requirements 9.1**

- [x] 19. Security and Performance Testing
  - Add security testing for workspace isolation and data leakage prevention
  - Implement load testing for all public endpoints
  - Test rate limiting and CSRF protection
  - Validate caching performance and invalidation
  - _Requirements: 9.2, 10.1, 10.2_

- [x] 20. Final Integration and Cross-System Testing
  - Implement end-to-end workflow testing
  - Test cross-system integration (galleries, public profiles, AI services)
  - Validate performance requirements for public profile loading
  - Test workspace isolation across all components
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 20.1 Write integration tests for cross-system functionality
  - Test gallery branding application workflow
  - Test public profile rendering with all features
  - Test vCard and QR code generation workflow
  - _Requirements: 3.2, 4.1, 4.2, 5.1, 5.2_

- [x] 21. Documentation and Developer Experience
  - Create API documentation with OpenAPI specs
  - Add developer guide for CompanyProfile integration
  - Create troubleshooting guide for common issues
  - Document migration procedures and rollback steps
  - _Requirements: Developer experience_

- [x] 22. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Property-based tests are **required** for correctness validation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at each phase
- The implementation maintains backward compatibility with existing gallery branding systems
- Migration tasks ensure smooth transition from legacy branding_profiles to enhanced CompanyProfile system
- Security, performance, and accessibility are integrated throughout the implementation
- Observability and monitoring are built-in from the start