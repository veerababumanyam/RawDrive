# Personal Profile Digital Visiting Card

**Feature**: Personal Profile with Digital Visiting Card  
**Status**: Planned  
**Last Updated**: 2025-01-27  
**Related**: Company Profile Digital Visiting Card, Public Profile Sharing

## Overview

This document describes the implementation plan for personal profile digital visiting cards for photographers. This feature enables photographers to create and share professional personal profiles similar to company profiles, including public sharing, SEO optimization, vCard/QR code generation, and comprehensive customization options.

## Goals

- Enable photographers to create professional personal profiles with digital visiting card functionality
- **Provide AI-powered assistance** to help photographers build compelling profiles that attract clients
- Provide public profile sharing at `/u/{slug}` route pattern
- Support comprehensive personal information display (contact, social media, portfolios, etc.)
- Implement SEO optimization for search engine discovery
- Enable vCard and QR code generation for easy contact sharing
- Support embedded media (TikTok, Spotify playlists)
- Integrate featured galleries from user's portfolio
- **Leverage AI to recommend optimal portfolio selections** based on engagement metrics and client preferences
- Provide booking calendar integration
- Implement visibility controls for privacy-sensitive information

## Non-Goals

- Multi-user profile management (one profile per user per workspace)
- Profile templates marketplace (users customize their own profiles)
- Profile analytics dashboard (can be added in future enhancement)
- Fully automated profile creation (AI assists but user maintains control)
- AI-generated images or avatars (uses existing uploaded photos)
- Automatic competitor analysis (future enhancement)

## Architecture

### Database Schema

The personal profile feature uses a new `personal_profiles` table that is workspace-scoped but user-specific:

```sql
CREATE TABLE personal_profiles (
    profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    
    -- Identity
    display_name VARCHAR(255) NOT NULL,
    profile_title VARCHAR(255), -- e.g., "Wedding Photographer & Filmmaker"
    slug VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    
    -- Bio & Description
    bio TEXT,
    location VARCHAR(255), -- e.g., "Based in Berlin - Available Worldwide"
    
    -- Contact Info
    email VARCHAR(255),
    phone VARCHAR(50),
    website TEXT,
    
    -- Secondary contacts (max 2 each)
    secondary_emails JSONB DEFAULT '[]',
    secondary_phones JSONB DEFAULT '[]',
    
    -- Location & Travel
    address_structured JSONB DEFAULT '{}',
    service_areas TEXT[], -- Array of service areas
    
    -- Social Media Links (JSONB)
    socials JSONB DEFAULT '{}', -- {instagram, facebook, twitter, linkedin, youtube, tiktok, pinterest, behance, dribbble, spotify, etc.}
    
    -- Custom Links (JSONB)
    custom_links JSONB DEFAULT '[]', -- [{label, url, logo_url, type}]
    
    -- Embedded Media (JSONB)
    embedded_media JSONB DEFAULT '{}', -- {tiktok_username, spotify_playlist_id, etc.}
    
    -- Featured Gallery
    featured_gallery_id UUID REFERENCES galleries(gallery_id),
    
    -- Categories/Niches (JSONB)
    categories TEXT[], -- ["Photography", "Videography", "Wedding Services"]
    
    -- Branding
    brand_color VARCHAR(50),
    background_theme VARCHAR(50), -- "dark", "pastel", "bold", etc.
    
    -- Visibility Configuration (JSONB)
    visibility_config JSONB DEFAULT '{}',
    
    -- Public Profile Toggle
    is_public BOOLEAN DEFAULT FALSE,
    
    -- SEO Metadata (JSONB)
    seo_metadata JSONB DEFAULT '{}', -- {meta_title, meta_description, meta_keywords, og_image, etc.}
    
    -- Verification & Badges
    is_verified BOOLEAN DEFAULT FALSE,
    badges TEXT[], -- ["Pro", "Featured"]
    
    -- Calendar Integration
    booking_calendar_url TEXT,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT uq_personal_profiles_slug UNIQUE(slug),
    CONSTRAINT uq_personal_profiles_user_workspace UNIQUE(workspace_id, user_id)
);
```

### Key Constraints

- **Slug Uniqueness**: Slugs are globally unique across all personal profiles
- **User-Workspace Uniqueness**: One personal profile per user per workspace
- **Workspace Scoping**: Profiles belong to a workspace, enabling team collaboration context
- **Public Access**: Only profiles with `is_public = TRUE` are accessible via public routes

## Core Identity Fields

### Required Fields
- `display_name`: User's display name (max 255 chars)
- `slug`: URL-friendly identifier (3-100 chars, alphanumeric + hyphens, globally unique)
- `email`: Primary contact email

### Optional Identity Fields
- `profile_title`: Professional title (e.g., "Wedding Photographer & Filmmaker")
- `avatar_url`: Profile picture/headshot URL
- `bio`: Short biography describing niche and location (max 500 chars)
- `location`: Location string (e.g., "Based in Berlin - Available Worldwide")
- `brand_color`: Hex color code for branding
- `background_theme`: Visual style theme (dark, pastel, bold, etc.)

## Contact Information

### Primary Contacts
- Email (required)
- Phone (optional, E.164 format)
- Website (optional)

### Secondary Contacts
- Up to 2 secondary emails with optional labels
- Up to 2 secondary phone numbers with optional labels

### Structured Address
- Line 1, Line 2
- City, State, Postal Code, Country
- Optional: GPS coordinates (latitude, longitude)

## Social Media Integration

Supported platforms (stored in `socials` JSONB field):
- Instagram
- Facebook
- Twitter/X
- LinkedIn
- YouTube
- TikTok
- Pinterest
- Behance
- Dribbble
- Spotify
- WhatsApp

Each platform stores the profile URL or username for display and linking.

## Custom Links

Custom links allow photographers to add important navigation links:
- Portfolio links (Photo, Video)
- Service pages (Weddings, Commercial Work)
- Contact/Inquiry forms
- Pricing & Packages
- Client Galleries
- Booking pages
- Blog/News
- Proofing platforms (Pixieset, SmugMug, Frame.io)

Link structure:
```json
{
  "label": "Portfolio - Photo",
  "url": "https://example.com/portfolio",
  "logo_url": "https://example.com/icon.png",
  "type": "portfolio"
}
```

## Embedded Media

### TikTok Integration
- Store TikTok username in `embedded_media.tiktok_username`
- Embed TikTok profile preview using TikTok oEmbed API or iframe
- Display BTS clips, before/after edits, or cinematic clips

### Spotify Integration
- Store Spotify playlist ID in `embedded_media.spotify_playlist_id`
- Embed Spotify playlist player using Spotify Embed API
- Share curated playlists for shoots (e.g., "Engagement Session Playlist")

## Featured Gallery

- Link to one featured gallery from user's workspace galleries
- Display gallery thumbnail and title on public profile
- Clicking opens the gallery detail page
- Uses existing gallery service APIs for fetching available galleries

## Categories & Niches

Predefined categories for photographers:
- Photography
- Videography
- Wedding Services
- Commercial Production
- Portrait Photography
- Event Photography
- Creative Services
- Travel Photography

Categories are displayed as tags/badges on the public profile.

## Location & Service Areas

- **Base Location**: Primary location string (e.g., "Based in Berlin")
- **Travel Info**: Additional text (e.g., "Available Worldwide")
- **Service Areas**: Array of specific service areas/locations
- **Address**: Structured address for business location display

## Branding & Themes

### Brand Color
- Hex color code for primary brand color
- Used in profile UI elements, buttons, accents

### Background Theme
- Visual style options: "dark", "pastel", "bold", "cinematic", "minimal"
- Affects overall profile appearance and color scheme

### Theme System Integration
- Reuse existing theme system from company profiles
- Support theme customization and live preview
- Theme selection affects public profile appearance

## Visibility Controls

Visibility configuration (`visibility_config` JSONB) controls which fields are displayed on public profile:

- `display_name`: boolean
- `profile_title`: boolean
- `avatar_url`: boolean
- `bio`: boolean
- `location`: boolean
- `email`: boolean
- `phone`: boolean
- `website`: boolean
- `address`: boolean
- `socials_instagram`: boolean
- `socials_facebook`: boolean
- `socials_twitter`: boolean
- `socials_linkedin`: boolean
- `socials_youtube`: boolean
- `socials_tiktok`: boolean
- `socials_pinterest`: boolean
- `socials_spotify`: boolean
- `custom_links`: boolean
- `featured_gallery`: boolean
- `booking_calendar`: boolean
- `secondary_email_1`: boolean
- `secondary_email_2`: boolean
- `secondary_phone_1`: boolean
- `secondary_phone_2`: boolean
- `qr_code`: boolean
- `vcard`: boolean

## Public Profile Toggle

Master toggle (`is_public`) controls overall profile visibility:
- `false`: Profile is private, not accessible via public routes
- `true`: Profile is public and accessible at `/u/{slug}`

When `is_public = false`, all public API endpoints return 404.

## SEO Optimization

### Meta Tags
Stored in `seo_metadata` JSONB field:
- `meta_title`: Page title (50-60 characters recommended)
- `meta_description`: Meta description (150-160 characters)
- `meta_keywords`: Array of keywords

### Open Graph Tags
- `og_title`: Open Graph title
- `og_description`: Open Graph description
- `og_image`: Open Graph image URL
- `og_type`: Always "profile"

### Twitter Card Tags
- `twitter_card`: "summary" or "summary_large_image"
- `twitter_title`: Twitter card title
- `twitter_description`: Twitter card description
- `twitter_image`: Twitter card image

### Structured Data (JSON-LD)

Automatically generated `schema.org` Person/ProfessionalService schema:
```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "additionalType": "https://schema.org/Photographer",
  "name": "Display Name",
  "image": "avatar_url",
  "description": "bio",
  "url": "website",
  "email": "email",
  "telephone": "phone",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "city",
    "addressRegion": "state",
    "postalCode": "postal_code",
    "addressCountry": "country"
  },
  "sameAs": ["social_media_urls"],
  "jobTitle": "profile_title",
  "knowsAbout": ["categories"]
}
```

## vCard Generation

vCard 3.0 format download endpoint:
- Endpoint: `/api/v1/public/personal-profiles/{slug}/vcard`
- Includes: Name, title, email, phone, website, address, avatar (BASE64 encoded)
- Respects visibility settings (only includes visible fields)
- Filename format: `{display_name}.vcf`

## QR Code Generation

QR code PNG image endpoint:
- Endpoint: `/api/v1/public/personal-profiles/{slug}/qr-code`
- Contains: Public profile URL (`https://rawdrive.ai/u/{slug}`)
- Format: PNG image
- Size: Configurable (default 256x256px)

## Booking Calendar Integration

- Store booking calendar URL in `booking_calendar_url`
- Supports: Google Calendar, Calendly, Acuity Scheduling, or custom booking page
- Displayed as "Book a Call" or "Schedule Consultation" button on public profile
- Opens in new tab/window

## Verification & Badges

### Verification Status
- `is_verified`: Admin-controlled verification status
- Display verified checkmark (✓) on public profile when true

### Badges
- `badges`: Array of badge identifiers (e.g., ["Pro", "Featured"])
- Displayed as visual badges on public profile
- Badge display controlled by platform configuration

## API Endpoints

### Workspace-Scoped Endpoints

**Base Path**: `/api/v1/workspaces/{workspace_id}/personal-profiles`

- `GET /me` - Get current user's personal profile
- `POST /` - Create personal profile (requires user_id in request or inferred from auth)
- `PATCH /me` - Update current user's personal profile
- `POST /me/avatar` - Upload avatar image
- `DELETE /me/avatar` - Delete avatar image
- `GET /me/preview` - Get preview URL for profile

### Public Endpoints

**Base Path**: `/api/v1/public/personal-profiles`

- `GET /{slug}` - Get public profile (returns filtered data + SEO schema)
- `GET /{slug}/vcard` - Download vCard file
- `GET /{slug}/qr-code` - Get QR code PNG image
- `GET /{slug}/avatar/{size}` - Get public avatar at specified size (64, 128, 256, 512)

## Frontend Routes

### Protected Routes (Require Authentication)

- `/settings/personal-profile` - Edit personal profile page
  - Form on left, live preview on right (desktop)
  - Stacked layout on mobile
  - Uses `PersonalProfileForm` and `PersonalProfilePreview` components

### Public Routes

- `/u/{slug}` - Public personal profile page
  - Full-screen profile display
  - SEO meta tags and structured data
  - Share functionality (vCard, QR code)
  - Embedded media rendering
  - Mobile-responsive design

## UI Components

### PersonalProfileForm
Comprehensive form component with sections:
1. Identity (name, title, slug, avatar)
2. Bio & Location
3. Contact Information
4. Social Media Links
5. Custom Links
6. Embedded Media (TikTok, Spotify)
7. Featured Gallery Selection
8. Categories Selection
9. Branding (color, theme)
10. Visibility Controls
11. Public Profile Toggle
12. SEO Metadata
13. Booking Calendar

### PersonalProfilePreview
Live preview component:
- Device preview modes (phone, tablet, desktop)
- Real-time updates as form changes
- Theme preview
- Uses adapted `PublicProfileLayout` component

### PublicPersonalProfilePage
Public-facing profile page:
- Route: `/u/:slug`
- SEO optimized
- Share buttons (vCard, QR code)
- Embedded media rendering
- Featured gallery display
- Booking calendar link

## AI-Powered Profile Builder

To help photographers build compelling public profiles that attract clients, an AI assistant will be integrated to provide intelligent content generation and optimization suggestions.

**Important**: All AI features for personal profiles use the **workspace-level Google Gemini API configuration** (configured in company profile/workspace settings), not individual user API keys. This ensures:
- Consistent AI experience across all workspace members
- Centralized API key management at workspace level
- Workspace admins control AI costs and usage
- Fallback to platform-level keys if workspace not configured

### AI Profile Assistant Features

#### 1. Content Generation
- **Bio Generation**: Generate professional bios based on photographer's existing galleries, categories, and location
- **Tagline Generation**: Create compelling profile titles (e.g., "Wedding Photographer & Filmmaker")
- **Description Optimization**: Refine and optimize bio text for SEO and client appeal
- **SEO Keywords**: Suggest relevant keywords based on categories, location, and specialty
- **Meta Description**: Generate optimized meta descriptions for search engines

**Implementation**:
- Reuse `GalleryStoryService` pattern for narrative generation
- Use Gemini API via `GeminiClientService` with **workspace-level configuration**
- API key resolution: Workspace Gemini settings → Platform fallback
- Context-aware: Analyze user's galleries, categories, location, existing content
- Uses `workspace_id` for Gemini API client resolution (not `user_id`)

#### 2. Portfolio Recommendations

**AI Portfolio Recommendation Engine**:
- Analyze photographer's entire asset library using CLIP embeddings for similarity search
- Score photos based on engagement metrics (views, favorites, downloads, client selections)
- Recommend optimal gallery selections for featured gallery based on:
  - Client type (wedding, commercial, portrait, etc.)
  - Occasion/season (wedding season, corporate events, etc.)
  - Historical conversion data (which galleries lead to bookings)
  - Gallery themes and content analysis
- Contextual recommendations based on:
  - Gallery themes and event types
  - Client profiles and preferences
  - Historical performance metrics
  - A/B testing results

**Implementation**:
- Leverage existing CLIP embeddings from `ai-processing-service`
- Use engagement metrics from `AnalyticsService`
- Integrate with gallery service for portfolio analysis
- Generate ranked recommendations with confidence scores

#### 3. Profile Completeness Analysis
- Analyze profile completeness and provide suggestions
- Highlight missing critical information (bio, portfolio, contact info)
- Score profile quality (0-100) based on completeness and optimization
- Actionable checklist for improvement

#### 4. Content Suggestions Based on Galleries
- Analyze gallery themes to suggest relevant profile categories
- Recommend service areas based on gallery locations
- Suggest custom links based on existing portfolio structure
- Generate category tags based on photo content analysis

#### 5. SEO Optimization Suggestions
- Analyze current SEO metadata and suggest improvements
- Generate keyword-rich descriptions
- Suggest meta tag optimizations
- Recommend OG image selection from portfolio
- Analyze competitor profiles (future enhancement)

#### 6. A/B Testing Support
- Generate multiple profile variations for testing
- Track conversion metrics (profile views → booking clicks)
- Compare performance of different:
  - Bio lengths and styles
  - Featured gallery selections
  - Category combinations
  - Call-to-action placements

### API Endpoints

**Base Path**: `/api/v1/workspaces/{workspace_id}/personal-profiles/ai`

**Authentication & Configuration**:
- All endpoints require workspace access (workspace-scoped)
- **Uses workspace-level Gemini API configuration** (from company profile/workspace AI settings)
- Falls back to platform-level keys if workspace not configured
- Returns `AI_NOT_CONFIGURED` error if neither workspace nor platform keys available

- `POST /generate-content` - Generate bio, tagline, or description
  - Body: `{ type: "bio" | "tagline" | "description", context: {...}, style: "professional" | "casual" | "creative", tone?: string }`
  - Returns: Generated content and confidence score
  - **Uses workspace Gemini API key** via `GeminiClientService.get_client_config(workspace_id)`

- `POST /recommend-portfolio` - Get portfolio recommendations
  - Body: `{ client_type?: string, occasion?: string, max_results?: number }`
  - Returns: Ranked gallery recommendations with engagement scores

- `POST /analyze-completeness` - Analyze profile completeness
  - Returns: Completeness score, missing fields, suggestions

- `POST /optimize-seo` - Generate SEO suggestions
  - Returns: Keyword suggestions, meta tag recommendations, OG image suggestions

- `POST /suggest-categories` - Suggest categories based on galleries
  - Returns: Recommended categories with confidence scores

- `POST /generate-variations` - Generate A/B test variations
  - Body: `{ fields: string[], count?: number }`
  - Returns: Array of profile variations for testing

### UI Integration

#### AI Assistant Panel
- Floating AI assistant button in PersonalProfileForm
- Context-aware suggestions as user fills out form
- One-click generation for bio, tagline, descriptions
- Portfolio recommendation widget in Featured Gallery section
- Profile completeness indicator with suggestions

#### AI-Powered Form Features
- **Auto-fill suggestions**: As user types, show AI-generated alternatives
- **Smart defaults**: Pre-fill categories and service areas based on galleries
- **Real-time optimization**: Show SEO score and suggestions in real-time
- **Portfolio selector**: Show AI-recommended galleries with engagement metrics
- **Content templates**: AI-generated templates based on photographer type

### Data Sources for AI Analysis

1. **User's Gallery Portfolio**:
   - Gallery themes, event types, locations
   - Photo quality scores and engagement metrics
   - Client interaction data (favorites, selections, downloads)
   - Historical booking conversions

2. **Existing Profile Data**:
   - Current bio, tagline, description
   - Selected categories and service areas
   - Featured gallery performance

3. **Workspace Analytics**:
   - Client engagement patterns
   - Popular gallery types
   - Seasonal trends
   - Conversion funnel data

4. **Photo Content Analysis**:
   - CLIP embeddings for visual similarity
   - AI-generated tags and metadata
   - Quality scores (sharpness, exposure, composition)
   - Event type classifications

### Implementation Notes

**AI Configuration**:
- **Use workspace-level Gemini API configuration** (from company profile/workspace settings)
- API client resolution: `get_client_config(workspace_id=workspace_id)` - workspace-scoped, not user-scoped
- Fallback strategy: Workspace Gemini settings → Platform-level keys (if workspace not configured)
- All AI API calls use workspace-level credentials to ensure consistent experience

**Services Integration**:
- Reuse existing `GeminiClientService` for content generation (workspace-scoped)
- Leverage `PhotoQualityService` for photo analysis
- Use `AnalyticsService` for engagement metrics
- Integrate CLIP embeddings from `ai-processing-service` for similarity search
- Cache AI recommendations for performance
- Track AI usage at workspace level for billing and analytics
- Support A/B testing framework for optimization

### Future Enhancements

- **Competitor Analysis**: Compare profile with similar photographers
- **Market Insights**: Suggest trending categories and styles
- **Client Persona Matching**: Optimize profile for specific client types
- **Multi-language Support**: Generate profiles in multiple languages
- **Voice/Audio Analysis**: Analyze photographer's speaking style for video profiles

## Integration Points

### Gallery Service
- Fetch user's galleries for featured gallery dropdown
- Link featured gallery to profile
- Display gallery preview on public profile
- Provide gallery data for AI portfolio recommendations

### AI Services
- **GeminiClientService**: Content generation (bio, tagline, descriptions)
  - **Configuration**: Uses workspace-level Gemini API settings (configured in company profile/workspace settings)
  - **Client Resolution**: `get_client_config(workspace_id=workspace_id)` - workspace-scoped API key resolution
  - **Fallback**: Workspace settings → Platform-level keys
- **PhotoQualityService**: Photo analysis and scoring
- **AnalyticsService**: Engagement metrics for recommendations
- **CLIP Embeddings**: Similarity search for portfolio recommendations
- **GalleryStoryService**: Narrative generation patterns

**Important**: All AI features for personal profiles are **workspace-scoped** and use the workspace's Gemini API configuration, ensuring:
- Centralized API key management at workspace level
- Consistent AI experience for all workspace members
- Workspace admins control AI costs and usage limits
- Simplified configuration (configure once per workspace, not per user)

### Theme System
- Reuse existing theme customization system
- Support theme selection and live preview
- Apply themes to public profile display

### User Profile Settings
- Link to existing user profile settings
- Pre-populate form with existing user data (avatar, bio, etc.)
- Separate from basic profile settings (this is public-facing profile)

## Security Considerations

### Access Control
- Workspace-scoped endpoints require workspace membership
- Public endpoints only accessible when `is_public = TRUE`
- Avatar uploads restricted to authenticated users
- Slug uniqueness enforced globally

### Privacy
- Visibility controls allow fine-grained privacy settings
- Secondary contacts can be hidden individually
- Public profile can be disabled entirely

### Rate Limiting
- Public profile endpoints should be rate-limited
- Avatar generation endpoints should be rate-limited
- vCard/QR code generation should be rate-limited

## Performance Considerations

### Caching
- Public profile responses can be cached (TTL: 5-15 minutes)
- Avatar images cached at CDN level
- SEO schema cached with profile data

### Image Optimization
- Avatar images generated at multiple sizes (64, 128, 256, 512px)
- WebP format for optimal compression
- Lazy loading for embedded media

### Database Indexes
- Index on `slug` for fast public profile lookups
- Index on `is_public` for filtering public profiles
- Index on `workspace_id` and `user_id` for workspace queries

## Migration Strategy

1. Create database migration for `personal_profiles` table
2. Deploy backend API endpoints
3. Deploy frontend components and pages
4. Provide UI for existing users to create personal profiles
5. Optional: Migrate existing user profile data (bio, avatar, etc.) to personal profile if available

## Future Enhancements

### Analytics
- Profile view analytics
- Click tracking on links
- Engagement metrics

### Advanced Features
- Profile templates
- Multi-language support for AI-generated content
- Custom domain support (similar to company profiles)
- Profile comparison tools
- Profile insights dashboard

### AI Enhancements
- Competitor analysis and benchmarking
- Market insights and trending categories
- Client persona matching and optimization
- Multi-language profile generation
- Voice/Audio analysis for video profiles

### Integrations
- Additional booking platforms (Calendly, Acuity, etc.)
- More embedded media platforms
- Email marketing integration
- CRM integration

## Testing Requirements

### Unit Tests
- Service layer methods
- Schema validation
- Slug generation and validation
- Visibility filtering logic

### Integration Tests
- API endpoint testing
- Database operations
- File upload handling
- Public profile retrieval

### E2E Tests
- Profile creation flow
- Profile editing flow
- Public profile viewing
- vCard/QR code generation
- Embedded media rendering

## Related Documentation

- [Company Profile Digital Visiting Card](./COMPANY_PROFILE_AND_THEMES.md)
- [Public Profile Sharing Features](../PUBLIC_PROFILE_SHARING_FEATURES.md)
- [Gallery Features](./GalleryFeatures.md)
- [User Profile Settings](../specs/002-user-profile-settings/data-model.md)

## Implementation Checklist

### Backend
- [ ] Database migration for `personal_profiles` table
- [ ] Pydantic schemas (`personal_profile_schemas.py`)
- [ ] Service layer (`personal_profile_service.py`)
- [ ] API endpoints (`personal_profile.py`)
- [ ] SEO service extension for Person schema
- [ ] vCard service extension for personal profiles
- [ ] Error handling and validation

### Frontend
- [ ] TypeScript types (`personalProfile.ts`)
- [ ] Service class (`personalProfileService.ts`)
- [ ] PersonalProfileForm component
- [ ] PersonalProfilePreview component
- [ ] PersonalProfilePage component
- [ ] PublicPersonalProfilePage component
- [ ] PublicProfileLayout adaptation
- [ ] Routes configuration
- [ ] Navigation integration

### Features
- [ ] Featured gallery integration
- [ ] Embedded media rendering (TikTok, Spotify)
- [ ] Booking calendar integration
- [ ] Categories display
- [ ] Verification and badges display
- [ ] vCard generation
- [ ] QR code generation
- [ ] SEO optimization

### AI Features
- [ ] AI Profile Assistant service (`PersonalProfileAIService`)
- [ ] **Workspace-level Gemini API integration** (use workspace configuration, not user-level)
- [ ] Content generation endpoints (bio, tagline, descriptions) - workspace-scoped API calls
- [ ] Portfolio recommendation engine with CLIP embeddings
- [ ] Profile completeness analysis
- [ ] SEO optimization suggestions
- [ ] Category suggestions based on galleries
- [ ] A/B testing variation generation
- [ ] AI assistant UI panel in PersonalProfileForm
- [ ] Auto-fill suggestions in form fields
- [ ] Portfolio recommendation widget
- [ ] Profile completeness indicator
- [ ] Real-time SEO score display
- [ ] **Workspace AI configuration check/validation** (ensure workspace has Gemini API configured)

### Testing & Documentation
- [ ] Unit tests
- [ ] Integration tests
- [ ] E2E tests
- [ ] API documentation
- [ ] User guide

## Notes

- Personal profiles are workspace-scoped but user-specific (one per user per workspace)
- Slugs are globally unique across all personal profiles
- Public profiles only accessible when `is_public = TRUE`
- Reuse existing theme system from company profiles
- Consider rate limiting on public profile endpoints
- Profile analytics can be added as future enhancement
