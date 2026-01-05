# Company Profile & Branding

> **Reference Documentation**:
> - `docs/Features/COMPANY_PROFILE_AND_THEMES.md` - QR codes, vCards, themes
> - `docs/Features/PHOTOGRAPHER_PUBLIC_PROFILE.md` - Public profile features
> - `.kiro/specs/company-profile-branding/` - Branding specifications
> - `.kiro/specs/public-profile-editor/` - Profile editor specs
> - `.kiro/specs/public-profile-sync-themes/` - Theme sync specs
> - `specs/021-public-profile-mobile-responsive-theme/` - Mobile responsive themes

## Business Value Proposition

Company Profile & Branding serves as the central branding authority across all client-facing surfaces in RawDrive. This system provides a single-entry configuration that propagates to galleries, public profiles, headers/footers, and generates vCard/QR codes for business cards while powering AI-generated legal policies and SEO-optimized schema markup.

### Key Business Benefits
- **Brand Consistency**: Single source of truth for all branding
- **Professional Presence**: Beautiful public profile pages
- **Lead Generation**: QR codes and vCards for networking
- **SEO Optimization**: Schema markup for search visibility
- **Time Savings**: Configure once, apply everywhere
- **Client Trust**: Professional, branded experience

---

## User Personas

### Primary Users
1. **Photographer/Studio Owner**
   - Configures company profile and branding
   - Customizes public profile appearance
   - Generates QR codes and vCards
   - Manages theme and colors

2. **Marketing Manager**
   - Updates social media links
   - Manages testimonials and portfolio
   - Optimizes SEO settings
   - Tracks profile analytics

3. **Client/Visitor**
   - Views public profile
   - Downloads vCard
   - Scans QR code
   - Contacts photographer

---

## Key Capabilities

### 1. Company Profile Management

**Identity Fields**
- Company/studio name
- Tagline/slogan
- Custom URL slug (/p/{slug})
- Logo (multiple sizes)
- Favicon

**Contact Information**
- Primary email and phone
- Secondary contacts (up to 2 each)
- Website URL
- Physical address (multi-line)
- Timezone

**Social Media Links**
- Instagram, Facebook, WhatsApp
- TikTok, LinkedIn, YouTube
- Twitter (X), Snapchat, Spotify
- Per-platform visibility toggles

**Custom Links**
- Label, URL, optional logo
- Unlimited custom links
- Drag-drop reordering

### 2. Public Profile Page

**Automatic Generation**
- Public URL: `/p/{slug}`
- SEO-optimized meta tags
- Mobile-responsive design
- Accessible (WCAG 2.1 AA)

**Content Sections**
- Hero with logo and tagline
- About/bio section
- Contact information
- Social media links
- Portfolio gallery
- Testimonials
- Custom links

**Visibility Controls**
- Per-field visibility toggles
- Per-social-platform toggles
- Hidden fields excluded from public view
- No placeholders for hidden content

### 3. Theme System

**Theme Categories**
- **Minimal**: Clean, whitespace-focused
- **Bold**: Strong colors and typography
- **Elegant**: Sophisticated, refined
- **Modern**: Contemporary, sleek
- **Creative**: Artistic, unique

**Default Themes**
- Classic Light (Minimal)
- Modern Dark (Modern)
- Elegant Gold (Elegant)
- Bold Vibrant (Bold)
- Creative Gradient (Creative)

**Theme Customization**
- **Colors**: Primary, secondary, accent, background, text
- **Fonts**: Heading font, body font (20+ options)
- **Layout**: Spacing (compact/comfortable/spacious)
- **Hero Style**: Card or full-bleed
- **Section Layout**: Single or two-column

**Custom Fonts**
- Upload custom fonts (.woff2, .ttf)
- Map to heading/body roles
- Automatic fallback fonts
- Performance-optimized loading

### 4. Live Preview

**Multi-Device Preview**
- Phone (narrow)
- Tablet (medium)
- Desktop (full width)

**Real-Time Updates**
- Instant preview on any change
- Same components as live profile
- Read-only preview mode
- Accurate responsive rendering

### 5. Team Representation ("Meet the Team")

**Team Showcase**
- Display workspace members on public profile
- Build trust by showing the human side of the studio
- Customizable section title (e.g., "Our Team", "The Photographers")

**Member Details**
- Avatar (from user profile)
- Display Name
- Job Title (customizable context for the public)
- Bio snippet

**Visibility Controls**
- Global section toggle (On/Off)
- Per-member visibility (Select which team members to show)
- Automatic update when team members change details

### 5. QR Code Generation

**Features**
- Error correction level H (30% recovery)
- Minimum 512x512 pixels
- PNG format with transparent background
- Logo embedding option
- Brand color customization

**Usage**
- Business cards
- Event signage
- Marketing materials
- Print collateral

**API**
```
GET /api/v1/public/profiles/{slug}/qr-code
```

### 6. vCard Generation

**RFC 6350 Compliant (vCard 3.0)**
- E.164 phone number formatting
- Logo as BASE64 PHOTO field
- Secondary contacts with TYPE labels
- UTF-8 encoding for international characters

**Compatibility**
- iOS Contacts
- Android Contacts
- Outlook
- Google Contacts

**API**
```
GET /api/v1/public/profiles/{slug}/vcard
```

### 7. SEO & Schema Markup

**JSON-LD Schema**
- ProfessionalService schema type
- PostalAddress for location
- ContactPoint for contact info
- SocialMediaProfile links

**Meta Tags**
- Open Graph for social sharing
- Twitter Card support
- Canonical URL
- Description and keywords

### 8. Gallery Branding Integration

**Studio Defaults**
- Apply branding to new galleries automatically
- Bulk update existing galleries
- Preserve gallery-specific customizations

**Branding Elements**
- Logo in gallery headers
- Brand colors for accents
- Typography consistency
- Contact info in footers
- Social links in headers

### 9. Color Palette Builder

**Features**
- Primary, secondary, accent, neutral slots
- Logo color extraction
- Harmony suggestions (complementary, analogous, triadic)
- Save multiple palettes
- Export as CSS variables or JSON

**WCAG Contrast Validation**
- Real-time contrast checking
- AA compliance (4.5:1 for text)
- AAA compliance (7:1 for enhanced)
- Visual warnings for non-compliant combinations
- Suggested alternative colors

---

## Integration Points

### With Other Features

| Feature | Integration |
|---------|-------------|
| **Gallery Management** | Branding applied to galleries; logo in headers |
| **Invitations** | Branded invitations with company identity |
| **Client CRM** | Company info in client communications |
| **Customer Portal** | Branded client experience |
| **Authentication** | Profile linked to workspace |
| **Analytics** | Profile view tracking |
| **AI Features** | AI-generated profile descriptions |
| **Team Management** | Display team members on public profile |

---

## Technical Architecture

### Backend Services

```
company_profile_service.py      - Profile CRUD operations
profile_editor_service.py       - Editor functionality
theme_service.py                - Theme management
qr_code_service.py              - QR code generation
vcard_service.py                - vCard generation
portfolio_service.py            - Portfolio management
testimonial_service.py          - Testimonial management
seo_service.py                  - Schema markup generation
```

### API Endpoints

**Public Profile**
```
GET    /api/v1/public/profiles/{slug}        - Get public profile
GET    /api/v1/public/profiles/{slug}/qr-code - Download QR code
GET    /api/v1/public/profiles/{slug}/vcard   - Download vCard
```

**Profile Management**
```
GET    /api/v1/workspaces/{id}/profile       - Get workspace profile
PUT    /api/v1/workspaces/{id}/profile       - Update profile
POST   /api/v1/workspaces/{id}/profile/logo  - Upload logo
DELETE /api/v1/workspaces/{id}/profile/logo  - Remove logo
```

**Theme Management**
```
GET    /api/v1/themes                        - List all themes
GET    /api/v1/themes/{id}                   - Get theme details
POST   /api/v1/workspaces/{id}/profile/theme - Apply theme
PATCH  /api/v1/workspaces/{id}/profile/customization/colors - Update colors
PATCH  /api/v1/workspaces/{id}/profile/customization/fonts  - Update fonts
PATCH  /api/v1/workspaces/{id}/profile/customization/layout - Update layout
```

**Visibility**
```
GET    /api/v1/workspaces/{id}/profile/visibility    - Get visibility settings
PUT    /api/v1/workspaces/{id}/profile/visibility    - Update visibility
```

**Portfolio & Testimonials**
```
GET    /api/v1/workspaces/{id}/portfolio     - List portfolio items
POST   /api/v1/workspaces/{id}/portfolio     - Add portfolio item
DELETE /api/v1/workspaces/{id}/portfolio/{id} - Remove item

GET    /api/v1/workspaces/{id}/testimonials  - List testimonials
POST   /api/v1/workspaces/{id}/testimonials  - Add testimonial
DELETE /api/v1/workspaces/{id}/testimonials/{id} - Remove testimonial
```

### Database Schema

**Core Tables**
```sql
company_profiles             - Company identity and contact
├── profile_id (UUID)
├── workspace_id (UUID)
├── name (VARCHAR)
├── tagline (VARCHAR)
├── slug (VARCHAR UNIQUE)
├── logo_url (VARCHAR)
├── favicon_url (VARCHAR)
├── email (VARCHAR)
├── phone (VARCHAR)
├── website (VARCHAR)
├── address (JSONB)
├── timezone (VARCHAR)
├── social_links (JSONB)
├── custom_links (JSONB)
├── secondary_emails (JSONB)
├── secondary_phones (JSONB)
└── updated_at (TIMESTAMP)

company_visibility           - Field visibility settings
├── visibility_id (UUID)
├── profile_id (UUID)
├── field_visibility (JSONB)
├── social_visibility (JSONB)
└── updated_at (TIMESTAMP)

themes                       - Theme definitions
├── theme_id (UUID)
├── name (VARCHAR)
├── description (TEXT)
├── category (VARCHAR)
├── is_popular (BOOLEAN)
├── is_premium (BOOLEAN)
├── colors (JSONB)
├── fonts (JSONB)
├── layout (JSONB)
├── thumbnail_url (VARCHAR)
└── created_at (TIMESTAMP)

theme_customizations         - Per-workspace customizations
├── customization_id (UUID)
├── workspace_id (UUID)
├── theme_id (UUID)
├── colors (JSONB)
├── fonts (JSONB)
├── layout (JSONB)
└── updated_at (TIMESTAMP)

portfolio_items              - Portfolio gallery
├── item_id (UUID)
├── workspace_id (UUID)
├── title (VARCHAR)
├── description (TEXT)
├── image_url (VARCHAR)
├── gallery_id (UUID)
├── position (INTEGER)
└── created_at (TIMESTAMP)

testimonials                 - Client testimonials
├── testimonial_id (UUID)
├── workspace_id (UUID)
├── client_name (VARCHAR)
├── client_title (VARCHAR)
├── content (TEXT)
├── rating (INTEGER)
├── avatar_url (VARCHAR)
├── position (INTEGER)
└── created_at (TIMESTAMP)
```

### Frontend Components

**Pages**
```
CompanyProfilePage          - Profile management
PublicProfilePage           - Public view (/p/{slug})
```

**Settings Components**
```
CompanyProfileForm          - Main profile editor
CompanyProfilePreview       - Live preview with device frames
ThemeSelector               - Theme selection grid
ThemeCustomization          - Color/font/layout editor
UndoRedoControls            - Undo/redo buttons
ThemeHelpTooltip            - Contextual help
VisibilityToggles           - Field visibility controls
```

**Profile Components**
```
ProfileCard                 - Shared profile card display
PublicProfileView           - Public page view
ProfileHero                 - Hero section
ProfileContact              - Contact information
ProfileSocial               - Social media links
ProfilePortfolio            - Portfolio gallery
ProfileTestimonials         - Testimonial display
```

**Utility Components**
```
QRCodeGenerator             - QR code display/download
VCardButton                 - vCard download button
ColorPicker                 - Color selection
FontSelector                - Font selection
ContrastChecker             - WCAG contrast validation
```

---

## Scalability Considerations

### Performance Optimization

**CDN Delivery**
- Profile assets served via Cloudflare CDN
- Logo and images optimized
- Cache headers for static content

**Caching**
- Profile data cached in Redis
- Theme definitions cached
- QR codes cached after generation

**Lazy Loading**
- Portfolio images lazy-loaded
- Testimonials paginated
- Fonts loaded on demand

### Performance Targets
- Public profile load: < 2 seconds
- QR code generation: < 500ms
- vCard generation: < 200ms
- Theme switch: < 100ms

### Rate Limits
| Endpoint | Limit | Window |
|----------|-------|--------|
| QR Code | 100 | 1 minute |
| vCard | 100 | 1 minute |
| Theme API | 60 | 1 minute |

---

## Security & Compliance

### Data Protection
- **Encryption**: Sensitive data encrypted at rest
- **Validation**: All inputs validated (email, phone, URL)
- **Sanitization**: XSS prevention on all fields

### Privacy
- **Visibility Controls**: Granular field-level privacy
- **No PII Exposure**: Hidden fields completely excluded
- **Audit Logging**: Profile changes logged

### Accessibility
- **WCAG 2.1 AA**: All components compliant
- **Keyboard Navigation**: Full support
- **Screen Readers**: ARIA labels and roles
- **Color Contrast**: 4.5:1 minimum for text
- **Zoom Support**: Functional at 200%

---

## Business Metrics

### Key Performance Indicators
- **Profile Completion Rate**: % of users completing profile
- **Public Profile Views**: Views per profile
- **QR Code Downloads**: Downloads per profile
- **vCard Downloads**: Downloads per profile
- **Theme Customization Rate**: % using custom themes

### Success Criteria
- 80%+ profile completion rate
- Public profiles load in < 2 seconds
- QR codes scan successfully 95%+ of time
- vCards import correctly on all major platforms
- Lighthouse score 95+ on public profiles

---

## Future Enhancements

### Planned Features
- **AI Profile Generation**: Generate profile content from prompts
- **Video Backgrounds**: Video hero sections
- **Animated Elements**: CSS animations and transitions
- **A/B Testing**: Test different profile versions
- **Analytics Dashboard**: Detailed profile analytics
- **Custom Domains**: Full custom domain support

### Roadmap
- Q1 2026: AI profile generation
- Q2 2026: Video backgrounds
- Q3 2026: Analytics dashboard
- Q4 2026: Custom domain support
