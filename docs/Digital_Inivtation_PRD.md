# RawBox - Digital Invitation Service PRD
## Product Requirements Document for Indian Event Invitation Platform

---

## EXECUTIVE SUMMARY

**Product Name:** Digital Invitation Service (RawBox Invitations)

**Description:** A comprehensive digital invitation creation and sharing platform specifically designed for Indian users to create, customize, and distribute digital invitation cards for weddings, festivals (Diwali, Holi, Pongal, Onam), birthdays, and cultural events. The service enables quick invitation creation (< 2 minutes), leverages QR codes for instant calendar integration, and provides public sharing URLs optimized for WhatsApp and social media platforms popular in India.

**Target Audience:** 
- Primary: Indian users organizing weddings, festivals, and family events
- Secondary: Professional event planners, photographers (existing RawBox users)
- Geographic Focus: India (Mumbai-hosted infrastructure for 4G optimization)

**Core Mission:** "Simplify Indian event invitations through beautiful, culturally-relevant digital cards with instant sharing and RSVP tracking"

**Integration Strategy:** Extends RawBox platform as a new microservice, leveraging existing Auth, Media, and Storage infrastructure

---

## SECTION 1: SERVICE ARCHITECTURE OVERVIEW

### 1.1 Service Position in RawBox Ecosystem

**Digital Invitation Service** is the **seventh microservice** in the RawBox platform, complementing the existing services:

| Service | Port | Primary Function | Invitation Service Integration |
|---------|------|------------------|-------------------------------|
| Auth Service | 8001 | Authentication & Billing | User authentication, tenant management |
| Gallery Service | 8002 | Photo management | Potential integration for event photos |
| Media Service | 8003 | Image processing | AI processing, upscaling, background removal |
| Website Service | 8004 | Portfolio builder | Optional invitation embedding on photographer websites |
| Studio Service | 8005 | CRM & Booking | Event management integration |
| Store Service | 8006 | E-commerce | Premium template marketplace |
| **Invitation Service** | **8007** | **Digital Invitations** | **New service** |

### 1.2 Technology Stack

**Follows RawBox Standards:**
- **Backend:** Laravel 11 (PHP 8.3)
- **Database:** PostgreSQL 16 (dedicated: `rawbox_invitation`)
- **Cache:** Redis 7
- **Queue:** RabbitMQ 3 (event-driven communication)
- **Storage:** MinIO (S3-compatible) + Google Drive API support
- **Frontend:** Next.js (React 18) with Tailwind CSS
- **Container:** Docker / Kubernetes deployment

### 1.3 Core Capabilities

1. **Invitation Creation** - Multi-step wizard with template selection
2. **Image Management** - Upload 5-10 photos with AI enhancements
3. **Customization** - Regional templates, multi-language fonts, Indian aesthetics
4. **QR Code Generation** - Scannable codes with embedded calendar (.ics) files
5. **Public Sharing** - Expiring URLs optimized for WhatsApp/social media
6. **RSVP Tracking** - Guest management and attendance analytics
7. **Auto-Deletion** - Automatic cleanup 7 days post-event (GDPR/DPDP compliant)

---

## SECTION 2: OBJECTIVES AND SUCCESS METRICS

### 2.1 Product Objectives

1. **Speed:** Enable invitation creation in under 2 minutes
2. **Engagement:** Achieve 80% RSVP completion rate via QR/URL sharing
3. **Adoption:** Reach 100K active invitations in first 6 months
4. **Satisfaction:** Maintain 4.5+ star rating from users
5. **Calendar Integration:** 75% of recipients add events to calendar via QR scan
6. **Compliance:** DPDP/GDPR compliant with <5% data retention issues
7. **Performance:** Optimized for India's 4G networks (< 3sec page load)

### 2.2 Key Performance Indicators (KPIs)

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Time to Create Invitation | < 2 minutes | Analytics tracking |
| RSVP Completion Rate | 80% | RSVP data / Invitations sent |
| Calendar QR Scan Rate | 75% | QR tracking analytics |
| User Satisfaction | 4.5+ stars | In-app ratings |
| Active Invitations | 100K in 6 months | Database count |
| Page Load Time (4G) | < 3 seconds | Performance monitoring |
| Auto-Deletion Success | < 5% errors | Cron job logs |

---

## SECTION 3: USER PERSONAS

### 3.1 Priya - Urban Professional

**Demographics:**
- Age: 28, Mumbai
- Occupation: Software Engineer
- Tech-savvy, uses WhatsApp extensively

**Use Case:** Telugu Wedding Invitation
- Needs bilingual invitation (English + Telugu)
- Wants family-friendly QR code for Google Calendar
- Shares via WhatsApp groups and family chat
- Tracks who confirmed attendance

**Pain Points:**
- Traditional printed cards expensive and slow
- Coordinating RSVPs across multiple platforms
- Language barrier with elderly relatives

**How RawBox Helps:**
- Telugu language template with culturally appropriate designs
- One-click QR code generation for calendar
- WhatsApp-optimized sharing links
- Real-time RSVP dashboard

### 3.2 Ramesh - Business Owner

**Demographics:**
- Age: 45, Hyderabad
- Occupation: Restaurant Owner
- Moderate tech proficiency

**Use Case:** Diwali Festival Event Invitation
- Corporate Diwali party invitation
- Needs professional design with branding
- Wants RSVP tracking for catering planning
- Plans to send reminders

**Pain Points:**
- Managing guest list manually
- No visibility into who's attending
- Last-minute attendance changes

**How RawBox Helps:**
- Professional Diwali-themed templates
- Automated RSVP collection
- Analytics dashboard showing confirmation rate
- Reminder functionality via public URL updates

### 3.3 Anita - Homemaker

**Demographics:**
- Age: 35, Delhi
- Occupation: Homemaker
- Basic smartphone usage

**Use Case:** Birthday Party Invitation
- Child's birthday party invitation
- Needs simple, colorful design
- Wants to print QR code on paper invites
- Limited tech knowledge

**Pain Points:**
- Complexity of design tools
- Printing logistics
- Sharing with parents who don't use apps

**How RawBox Helps:**
- Pre-designed birthday templates
- Simple 3-step creation process
- Downloadable QR code for printing
- No-app-required public viewing link

---

## SECTION 4: CORE FEATURES AND REQUIREMENTS

### 4.1 Invitation Creation & Management

#### Collection Dashboard

**Display Format:**
- Grid view of all invitations with cover images
- Information per invitation:
  - Event title and date
  - Status (Draft / Published / Expired)
  - View count and RSVP count
  - QR scan analytics
  - Public URL status

**Filtering & Sorting:**
- Filter by Status (Draft, Published, Expired)
- Filter by Event Type (Wedding, Birthday, Festival, Other)
- Filter by Date Range
- Sort by Created Date, Event Date, Views

**Quick Actions:**
- Create New Invitation
- Edit / Duplicate / Delete
- View Analytics
- Download QR Code
- Copy Public URL

#### Creation Wizard (3-Step Process)

**Step 1: Event Details**
- Event type selection (Wedding, Birthday, Diwali, Holi, Pongal, Onam, Custom)
- Event title (required)
- Host name(s) (required)
- Event date and time (required)
- Venue name and address
- Google Maps link integration
- Event description (optional)
- Language selection (English, Hindi, Tamil, Telugu, Kannada, Malayalam)

**Step 2: Template & Customization**
- Template gallery with preview
  - Regional templates (Telugu wedding, Tamil pongal, North Indian sangeet, etc.)
  - Festival templates (Diwali, Holi, Navratri, etc.)
  - Generic templates (Birthday, Corporate event, etc.)
- Customization options:
  - Primary color picker
  - Font selection (including regional language fonts)
  - Layout style (modern, traditional, minimal)
  - Background pattern (mandalas, floral, geometric)
  - Animation effects (fade, slide, none)

**Step 3: Images & Publishing**
- Upload 1-10 images (drag-drop or file picker)
- AI Enhancement options:
  - Auto-upscale for quality improvement
  - Background removal (for portrait photos)
  - Smart cropping and framing
  - Collage generation from multiple photos
- Cover image selection
- Privacy settings:
  - Public (anyone with link)
  - Password protected
  - Expiry date (defaults to event_date + 7 days)
- Publish immediately or save as draft

### 4.2 Image Upload & AI Processing

**Upload Specifications:**
- **File Formats:** JPEG, PNG, WebP
- **File Size:** Up to 10MB per image
- **Total Images:** 1-10 images per invitation
- **Upload Method:** Drag-drop, file picker, or mobile camera

**Storage Strategy:**
- **Primary:** MinIO bucket: `invitations/{user_id}/{invitation_id}/images/`
- **Alternative:** Google Drive integration (if user enabled)
- **Retention:** Auto-delete on `auto_delete_at` date (event + 7 days)

**AI Enhancement Pipeline** (via Media Service):

1. **User Uploads Image** → Invitation Service stores in MinIO
2. **Publish Event** → `InvitationImageUploaded` event to RabbitMQ
3. **Media Service Consumes** → Processes image:
   - Generate thumbnails (300px, 800px, 1920px)
   - AI upscaling if requested
   - Background removal if requested
   - Format optimization (WebP)
   - EXIF data extraction
4. **Media Service Publishes** → `ImageProcessingComplete` event
5. **Invitation Service Updates** → Mark image as processed

**Event Schema:**
```json
{
  "event": "InvitationImageUploaded",
  "payload": {
    "invitation_id": 123,
    "image_id": 456,
    "user_id": 789,
    "storage_path": "invitations/789/123/original/image1.jpg",
    "processing_options": {
      "upscale": true,
      "remove_background": false,
      "generate_thumbnails": true,
      "optimize_webp": true
    }
  }
}
```

### 4.3 Template System

#### Pre-Built Templates (Launch: 15+ Templates)

**Regional Wedding Templates:**
1. **Telugu Wedding** - Traditional Kalash, peacock motifs, gold accents
2. **Tamil Wedding** - Kolam patterns, jasmine flowers, maroon/gold palette
3. **North Indian Wedding** - Mandala designs, red/gold, paisley patterns
4. **Punjabi Wedding** - Phulkari embroidery-inspired, vibrant colors
5. **South Indian Traditional** - Temple architecture, banana leaf motifs

**Festival Templates:**
6. **Diwali** - Diya lamps, rangoli, warm orange/yellow gradients
7. **Holi** - Colorful splashes, gulal powder effects
8. **Pongal** - Sugarcane, pongal pot, yellow/green theme
9. **Onam** - Pookalam (flower carpet), Kerala boat, white/gold
10. **Navratri** - Dandiya sticks, garba patterns, bright colors

**Generic Templates:**
11. **Birthday - Kids** - Balloons, cake, playful fonts
12. **Birthday - Adult** - Elegant, minimal, sophisticated
13. **Corporate Event** - Professional, clean, branded
14. **Anniversary** - Romantic, floral, elegant
15. **Baby Shower** - Pastel colors, cute illustrations

#### Template Customization Engine

**Editable Elements:**
- Text content (all fields)
- Font family and size
- Color scheme (primary, secondary, accent, text)
- Background (solid color, gradient, pattern, image)
- Layout structure (header, body, footer arrangement)
- Animation effects (entry, scroll, hover)

**Preview System:**
- Live preview during editing
- Mobile responsive preview
- Desktop preview
- Share preview before publishing

### 4.4 QR Code & Calendar Integration

#### QR Code Generation

**QR Code Types:**
1. **Invitation URL QR** - Scans to public invitation page
2. **Calendar QR** - Scans to download .ics file directly
3. **Combined QR** - Smart detection (iOS/Android calendar app or web browser)

**QR Code Specifications:**
- **Library:** `endroid/qr-code` (Laravel package)
- **Format:** PNG, SVG (for print scalability)
- **Size:** 300x300px default, up to 1000x1000px for printing
- **Error Correction:** High (30% redundancy for damaged codes)
- **Branding:** Optional logo/icon in center
- **Tracking:** Unique tracking ID embedded for scan analytics

**Generation Flow:**
1. User clicks "Generate QR Code" in invitation editor
2. System generates unique tracking ID
3. Creates .ics calendar file
4. Stores .ics in MinIO: `invitations/{user_id}/{invitation_id}/calendar/event.ics`
5. Generates QR code image pointing to:
   - Option A: Direct .ics download URL
   - Option B: Smart redirect (detects device, shows calendar or web view)
6. Stores QR image in MinIO: `invitations/{user_id}/{invitation_id}/qr/invitation_qr.png`
7. Returns QR URL to frontend for display/download

#### Calendar File (.ics) Structure

**Standard:** iCalendar (RFC 5545)

**Content:**
```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//RawBox//Invitation Service//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:{Event Title}
X-WR-TIMEZONE:Asia/Kolkata

BEGIN:VEVENT
UID:{unique-id}@invitations.rawbox.com
DTSTAMP:{creation_timestamp}
DTSTART:{event_start_datetime}
DTEND:{event_end_datetime}
SUMMARY:{Event Title} - {Host Name}
DESCRIPTION:{Event Description}\n\nRSVP: {Public URL}
LOCATION:{Venue Name}, {Address}
GEO:{latitude};{longitude}
URL:{Public Invitation URL}
STATUS:CONFIRMED
TRANSP:OPAQUE
SEQUENCE:0
BEGIN:VALARM
TRIGGER:-P1D
DESCRIPTION:Reminder: {Event Title} tomorrow
ACTION:DISPLAY
END:VALARM
END:VEVENT

END:VCALENDAR
```

**Platform Compatibility:**
- ✅ Google Calendar (Web, Android, iOS)
- ✅ Apple Calendar (iOS, macOS, iCloud)
- ✅ Microsoft Outlook (365, Desktop, Mobile)
- ✅ Android native calendar apps
- ✅ Yahoo Calendar

**Testing Requirements:**
- Test import on all major calendar platforms
- Verify timezone handling (Asia/Kolkata)
- Confirm reminder triggers correctly
- Validate URL links in calendar event

### 4.5 Public URL Sharing System

#### URL Structure & Generation

**URL Format:**
- **Primary:** `https://rawbox.com/i/{slug}`  (SEO-friendly)
- **Short:** `https://rbx.in/{short-id}` (optional URL shortener)

**Slug Generation:**
- Format: `{event-type}-{user-name}-{random-string}`
- Example: `wedding-priya-karthik-a3b9c1`
- Validation: Unique, URL-safe, no profanity
- Length: 15-30 characters

**URL Features:**
- ✅ Unique per invitation
- ✅ SEO-optimized (event details in meta tags)
- ✅ No login required for viewing
- ✅ Optional password protection
- ✅ Automatic expiry after event date
- ✅ Analytics tracking (views, shares, RSVP clicks)

#### Public Invitation Page (Client-Facing)

**Server-Side Rendering (Next.js SSR):**
- Pre-render invitation data for SEO
- Open Graph tags for WhatsApp/Facebook previews
- Fast initial load optimized for 4G

**Page Structure:**

**Header Section:**
- Large cover image (hero)
- Event title (prominent, regional font)
- Host name(s)
- Event date with countdown timer
- Venue with Google Maps link

**Image Gallery:**
- Responsive grid layout
- Lightbox for full-screen view
- Lazy loading for performance
- Swipe gestures on mobile

**Event Details Card:**
- Date and time (formatted for locale)
- Venue name and address
- Google Maps integration (embedded or link)
- Directions link
- Contact host button (optional)

**RSVP Section:**
- Prominent RSVP button
- RSVP form (name, email/phone, attendance status, guest count, message)
- Confirmation message after submission
- Option to change RSVP (using unique token)

**Footer:**
- Share buttons (WhatsApp, Facebook, Instagram, Copy Link)
- Download calendar button (.ics)
- View QR code button
- "Powered by RawBox" branding
- Privacy notice

#### WhatsApp Share Preview Optimization

**Open Graph Meta Tags:**
```html
<meta property="og:title" content="{Event Title} - {Host Name}" />
<meta property="og:description" content="You're invited! {Event Description}" />
<meta property="og:image" content="{Cover Image URL}" />
<meta property="og:url" content="{Public URL}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="RawBox Invitations" />
```

**WhatsApp Preview Best Practices:**
- Image aspect ratio: 1.91:1 (1200x630px recommended)
- Title: Max 55 characters for mobile preview
- Description: Max 200 characters
- Image size: < 300KB for fast WhatsApp caching

**Testing:**
- Test preview on WhatsApp Web and mobile
- Verify Facebook share preview
- Check Instagram story sharing
- Validate email client rendering

#### Security & Privacy

**Access Control:**
- Public URLs accessible without login
- Optional password protection (bcrypt hashed)
- IP rate limiting (100 views/hour per IP to prevent scraping)
- CSRF protection on RSVP submissions

**Expiry Management:**
- Default expiry: `event_date + 7 days`
- User can customize expiry date
- Expired invitations show "Event has ended" message
- Auto-delete triggered by cron job post-expiry

**Analytics Tracking (Privacy-Compliant):**
- Page views (no personal data)
- QR scans (tracking ID only)
- RSVP count (aggregated)
- Share clicks (platform only)
- Geographic region (city-level, not precise location)
- No third-party analytics (Google Analytics, etc.)

### 4.6 RSVP Management

#### RSVP Form (Public-Facing)

**Required Fields:**
- Guest name (text, required)
- Contact (email OR phone, at least one required)
- Attendance status (radio: "Attending", "Not Attending", "Maybe")
- Guest count (number, default: 1)

**Optional Fields:**
- Message to host (textarea, max 500 characters)
- Dietary preferences (if enabled by host)
- Plus-one details (if enabled)

**Form Validation:**
- Email format validation (if provided)
- Phone format validation (India: +91 10-digit)
- XSS protection on text inputs
- Honeypot field for bot detection

**Submission Flow:**
1. Guest fills RSVP form on public invitation page
2. Frontend validates input
3. POST to `/api/i/{slug}/rsvp`
4. Backend validates and stores in `invitation_rsvps` table
5. Sends confirmation email/SMS to guest (optional)
6. Sends notification to invitation owner
7. Returns success message with unique RSVP ID
8. Guest can edit RSVP using unique link (sent via email)

#### Host Dashboard - RSVP Management

**RSVP List View:**
- Table showing all RSVPs
- Columns: Name, Contact, Status, Guest Count, Date, Message
- Filters: By status (Attending, Not Attending, Maybe, All)
- Search: By name or contact
- Export: Download as CSV or PDF

**Analytics Widget:**
- Total invitations sent (based on views)
- Total RSVPs received
- Attendance breakdown (pie chart):
  - Attending: X guests
  - Not Attending: Y guests
  - Maybe: Z guests
  - No Response: W
- Response rate percentage
- Most recent RSVPs

**Notification Settings:**
- Email notification on new RSVP
- Daily digest of RSVPs
- WhatsApp notification (future feature)

### 4.7 Multi-Language Support

#### Supported Languages

**Phase 1 (Launch):**
1. **English** (en) - Default
2. **Hindi** (hi) - Devanagari script
3. **Tamil** (ta) - Tamil script
4. **Telugu** (te) - Telugu script
5. **Kannada** (kn) - Kannada script
6. **Malayalam** (ml) - Malayalam script

**Phase 2 (Future):**
- Marathi, Bengali, Gujarati, Punjabi

#### Implementation

**Backend Localization:**
- Laravel localization files: `/lang/{locale}/`
- Translation keys for all UI strings
- API returns localized strings based on `Accept-Language` header

**Frontend Localization:**
- Next.js i18n support
- Language selector in invitation editor
- Template text rendered in selected language
- Regional date/time formatting

**Font Support:**
- **English:** Inter, Roboto, Playfair Display, Montserrat
- **Hindi:** Noto Sans Devanagari, Poppins (supports Devanagari)
- **Tamil:** Noto Sans Tamil, Mukta Malar
- **Telugu:** Noto Sans Telugu, Ramabhadra
- **Kannada:** Noto Sans Kannada, Nudi
- **Malayalam:** Noto Sans Malayalam, Manjari

**Regional Templates:**
- Templates designed for specific cultures
- Region-appropriate color palettes
- Cultural symbols and motifs
- Festival-specific designs

### 4.8 Auto-Deletion & Data Retention

#### Deletion Policy (GDPR/DPDP Compliance)

**Default Retention:**
- Invitations auto-delete **7 days after event date**
- `auto_delete_at = event_date + 7 days`
- User can extend retention (max 30 days post-event on paid plans)

**Deletion Scope:**
- Invitation record (database row)
- All uploaded images (MinIO/Google Drive)
- QR code images
- Calendar .ics files
- RSVP records (unless user exports before deletion)
- Analytics data (aggregated data retained for platform analytics)

**User Notifications:**
- Email 3 days before auto-deletion
- Email 1 day before auto-deletion
- Option to export RSVP data before deletion
- Option to extend retention (paid feature)

#### Cron Job Implementation

**Scheduler:** Laravel Task Scheduling

**Daily Cron (runs at 2:00 AM IST):**
```php
// app/Console/Kernel.php
protected function schedule(Schedule $schedule)
{
    $schedule->command('invitations:auto-delete')
             ->dailyAt('02:00')
             ->timezone('Asia/Kolkata');
}
```

**Command Logic:**
```php
// Delete invitations past auto_delete_at date
$invitations = Invitation::where('auto_delete_at', '<=', now())
                         ->where('status', '!=', 'deleted')
                         ->get();

foreach ($invitations as $invitation) {
    // Delete images from MinIO
    // Delete QR codes
    // Delete calendar files
    // Mark invitation as deleted
    // Publish InvitationDeleted event
}
```

**Event-Driven Cleanup:**
- Publish `InvitationDeleted` event to RabbitMQ
- Media Service consumes event and cleans up processed images
- Analytics Service archives aggregated data

---

## SECTION 5: TECHNICAL ARCHITECTURE

### 5.1 Database Schema

**Database:** `rawbox_invitation` (PostgreSQL 16)

**Schema Design:** See Implementation Plan (Section 5.2)

**Key Tables:**
1. `invitations` - Core invitation data
2. `invitation_images` - Uploaded images with processing status
3. `invitation_templates` - Pre-built and custom templates
4. `invitation_rsvps` - Guest RSVP responses
5. `invitation_analytics` - Event tracking data
6. `invitation_qr_codes` - QR code and calendar file references

### 5.2 API Endpoints

**Documentation:** RESTful API following RawBox standards

**Authentication:** JWT tokens via Auth Service (Laravel Sanctum)

**Base URL:** `/api/invitations` (authenticated) and `/i/{slug}` (public)

**Endpoints:** See Implementation Plan for complete API specification

### 5.3 Integration Architecture

#### Authentication Integration (Auth Service)

**Pattern:** JWT token validation
- Frontend obtains JWT from Auth Service on login
- Invitation Service validates JWT on every authenticated request
- Extracts `user_id` and `tenant_id` from token
- Enforces tenant isolation (user can only access own invitations)

#### Image Processing Integration (Media Service)

**Pattern:** Event-driven via RabbitMQ
- Async image processing for non-blocking uploads
- Media Service handles all image manipulation
- Reduces Invitation Service complexity
- Scalable processing pipeline

#### Storage Integration (MinIO / Google Drive)

**Pattern:** Abstracted storage layer
- Laravel Filesystem abstraction
- Support both MinIO (default) and Google Drive
- User preference-based storage selection
- Consistent API regardless of backend

---

## SECTION 6: FRONTEND SPECIFICATIONS

### 6.1 User Interface Components

**New Routes in Next.js:**
```
/invitations                  # Invitation dashboard
/invitations/create           # Creation wizard
/invitations/{id}/edit        # Edit invitation
/invitations/{id}/analytics   # View analytics & RSVPs
/i/{slug}                     # Public invitation view (SSR)
```

**React Components:**
1. `InvitationDashboard.tsx` - Grid view with filters
2. `InvitationWizard.tsx` - Multi-step creation flow
3. `TemplateGallery.tsx` - Template selection with preview
4. `InvitationEditor.tsx` - Customization interface
5. `ImageUploadZone.tsx` - Drag-drop image uploader
6. `PublicInvitationPage.tsx` - SSR client-facing page
7. `RSVPFormWidget.tsx` - RSVP form component
8. `QRCodeViewer.tsx` - QR code display & download
9. `AnalyticsDashboard.tsx` - Charts and RSVP table

### 6.2 Design System Integration

**Follows RawBox Design System:**
- Tailwind CSS utility classes
- Consistent color palette
- Typography scale
- Spacing system
- Component library

**New Design Tokens:**
- Invitation-specific color themes
- Regional font stacks
- Indian cultural color palettes (gold, maroon, orange, etc.)
- Festival-themed gradients

### 6.3 Mobile Responsiveness

**Breakpoints:**
- Mobile: < 640px
- Tablet: 640px - 1024px
- Desktop: > 1024px

**Mobile-First Design:**
- Touch-optimized buttons (min 44x44px)
- Swipe gestures for image gallery
- Collapsible sections on small screens
- Bottom navigation for wizard steps
- Fast loading on 3G/4G networks

---

## SECTION 7: PERFORMANCE & OPTIMIZATION

### 7.1 India-Specific Optimizations

**Mumbai Hosting:**
- Primary server location: Mumbai, India
- CDN edge locations: Mumbai, Delhi, Bangalore, Hyderabad
- MinIO storage in Mumbai region

**4G Optimization:**
- Image compression (WebP format, 80% quality)
- Lazy loading for images
- Preload critical assets
- Minimize JavaScript bundle size
- Server-side rendering for fast initial load

**Performance Targets:**
- First Contentful Paint (FCP): < 1.5s
- Largest Contentful Paint (LCP): < 2.5s
- Time to Interactive (TTI): < 3s
- Total Page Size: < 500KB (initial load)

### 7.2 Caching Strategy

**Multi-Layer Caching:**
1. **Browser Cache:** Static assets (1 year)
2. **CDN Cache:** Images, QR codes (7 days)
3. **Redis Cache:** Public invitations (15 min), templates (1 hour)
4. **Database Query Cache:** PostgreSQL automatic

**Cache Invalidation:**
- Invitation update → Clear Redis cache for that invitation
- Image processing complete → Clear image CDN cache
- Template update → Clear template cache

### 7.3 Scalability Considerations

**Horizontal Scaling:**
- Stateless Invitation Service (multiple replicas)
- Load balancer (Traefik) distributes traffic
- Database connection pooling (PgBouncer)

**Queue-Based Processing:**
- Image uploads → Async processing via RabbitMQ
- QR generation → Queued job (non-blocking)
- Auto-deletion → Scheduled background job

**Database Optimization:**
- Indexes on frequently queried columns
- Partitioning by date for analytics table
- Read replicas for heavy analytics queries

---

## SECTION 8: SECURITY & COMPLIANCE

### 8.1 Data Protection

**Encryption:**
- TLS 1.3 for all connections
- Database encryption at rest
- Password hashing (bcrypt)
- Sensitive data (phone, email) encrypted

**Access Control:**
- Tenant isolation (row-level security)
- Public URLs rate-limited
- CSRF protection on forms
- XSS prevention (input sanitization)

### 8.2 Privacy Compliance

**GDPR & DPDP (India):**
- ✅ Data minimization (only collect necessary data)
- ✅ Right to deletion (auto-delete + manual delete)
- ✅ Data export (RSVP CSV export)
- ✅ Consent management (RSVP submission = consent)
- ✅ Data localization (India-hosted for Indian users)
- ✅ Transparent privacy policy

**Data Retention:**
- Invitations: Auto-delete after 7 days post-event
- Analytics: Aggregated data retained (no PII)
- Backups: 30-day retention, then purged

---

## SECTION 9: PRICING & MONETIZATION

### 9.1 Free Tier

**Included:**
- Unlimited invitations (with auto-deletion)
- 3 basic templates
- 5 images per invitation
- QR code generation
- Public URL sharing
- Basic analytics
- Standard fonts

### 9.2 Paid Features (Future)

**Premium Templates:**
- 50+ exclusive designs
- Animated templates
- Video backgrounds

**Extended Storage:**
- Keep invitations for 30+ days post-event
- Archive invitations permanently

**Advanced Features:**
- AI-powered design suggestions
- RSVP reminders (automated)
- WhatsApp integration
- Custom branding removal
- Advanced analytics

---

## SECTION 10: LAUNCH PLAN

### 10.1 Phased Rollout

**Phase 1: Beta (Month 1)**
- Deploy to staging environment
- Invite 100 beta testers
- Collect feedback and iterate
- Fix bugs and performance issues

**Phase 2: Soft Launch (Month 2)**
- Deploy to production
- Release to existing RawBox users
- Limited marketing
- Monitor performance and errors

**Phase 3: Public Launch (Month 3)**
- Full marketing campaign
- Press releases
- Social media promotion
- Influencer partnerships

**Phase 4: Optimization (Month 4-6)**
- Analyze usage data
- Add most-requested features
- Performance optimization
- Template library expansion

### 10.2 Success Criteria

**Launch Goals:**
- 1,000 invitations created in first month
- 4.0+ star rating
- < 1% error rate
- < 3s page load time

**6-Month Goals:**
- 100,000 invitations created
- 4.5+ star rating
- 75% QR scan-to-calendar conversion
- 80% RSVP completion rate

---

## SECTION 11: RISKS & MITIGATION

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Low adoption by users | High | Medium | Marketing campaign, partnerships with event planners |
| Performance issues on 4G | High | Medium | Extensive optimization, CDN usage, image compression |
| Calendar integration failures | Medium | Low | Thorough testing on all platforms, fallback options |
| Data retention compliance issues | High | Low | Automated deletion, audit logs, legal review |
| Template design not culturally appropriate | Medium | Medium | User research, cultural consultants, A/B testing |
| QR code scanning failures | Medium | Low | High error correction, testing on multiple devices |

---

## APPENDIX

### Feature Comparison Table

| Feature | Description | Priority | AI Enhancement |
|---------|-------------|----------|----------------|
| Image Upload & Hosting | 5-10 photos; MinIO/Mumbai storage, auto-delete event +7 days | High | AI upscale, background removal, collages |
| Card Customization | Drag-drop editor, India templates (mandalas, floral), animations, multi-language fonts | High | AI layouts by event/photos |
| Event Details & Scheduling | Names, title, host, Maps venue, date; countdowns, reminders | High | OCR, auto-translation |
| Public URL Quicklinks | Unique expiring URLs for app-free viewing/RSVP on WhatsApp/SMS; analytics on clicks | High | N/A |
| QR Code Generation | Dynamic QR for invites; one-scan adds to Google/Apple/Outlook calendars via .ics; printable, branded, trackable scans | High | AI event detail extraction for QR |
| Sharing & RSVP | Links/QR to WhatsApp/Facebook; guest messaging, attendance prediction, UPI gifts | High | AI nudges, predictions |
| Privacy & Compliance | E2E encryption, OTP auth, auto-purge; DPDP/GDPR with India data localization | High | N/A |

---

**Document Version:** 2.0  
**Last Updated:** December 5, 2024  
**Author:** RawBox Product Team  
**Status:** Ready for Implementation
