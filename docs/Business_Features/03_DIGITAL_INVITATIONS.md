# Digital Invitations & Save-the-Date

> **Reference Documentation**:
> - `docs/Features/DIGITAL_INVITATIONS.md` - Security & RSVP hardening
> - `specs/016-save-the-date/` - Save-the-Date specifications
> - `specs/017-digital-wedding-invitations/` - Wedding invitation specs
> - `specs/018-invitations-production-readiness/` - Production readiness
> - `specs/019-invitation-indian-languages/` - Multi-language support
> - `specs/020-invitation-rsvp-hardening/` - RSVP security hardening

## Business Value Proposition

Digital Invitations is a comprehensive event invitation system designed for Indian photographers and event organizers to create, share, and manage beautiful digital invitations for weddings, festivals, and cultural events. The system integrates with RawDrive's gallery infrastructure to leverage workspace-scoped assets, share links, and the centralized design system.

### Key Business Benefits
- **Time Savings**: Create professional invitations in under 5 minutes
- **Cost Reduction**: Eliminate printing and postage costs
- **Guest Management**: Centralized RSVP tracking and guest list management
- **Analytics**: Real-time engagement tracking and response rates
- **Cultural Relevance**: Templates and content for Indian cultural events
- **Multi-language**: Support for 12 Indian languages including RTL Urdu
- **Integration**: Seamless connection with galleries and client CRM

---

## User Personas

### Primary Users
1. **Photographer/Event Planner**
   - Creates invitations for clients
   - Manages multiple events simultaneously
   - Tracks RSVP responses
   - Exports guest lists for event planning

2. **Couple/Host**
   - Customizes invitation design
   - Manages guest list
   - Monitors RSVP responses
   - Sends reminders to non-responders

3. **Guest**
   - Views invitation on any device
   - Submits RSVP response
   - Adds event to calendar
   - Updates response if needed

---

## Key Capabilities

### 1. Invitation Creation

**Step-by-Step Wizard**
1. **Event Details**: Type, title, host names, date/time, venue
2. **Template Selection**: Culturally-appropriate templates by event type
3. **Media & Publishing**: Upload images, customize, publish

**Event Types Supported**
- Wedding (multi-day with sub-events)
- Birthday
- Diwali, Holi, Pongal, Onam, Navratri
- Anniversary
- Baby Shower
- Corporate Events
- Custom

**Template System**
- 30+ gradient-based templates at launch
- Categories: Traditional Indian, Modern Minimalist, Luxury Cinematic, Boho/Organic
- Real-time customization: colors, fonts, layouts
- Regional fonts for all Indian scripts

**Media Handling**
- 1-10 images per invitation (JPEG, PNG, WebP)
- 10MB max per image
- Video support (60-90 seconds, max 100MB)
- Cover image selection for social previews
- Smart cropping based on layout

### 2. Multi-Event Support

Indian weddings commonly span multiple days with distinct events:
- **Mehndi**: Henna ceremony
- **Sangeet**: Music and dance celebration
- **Ceremony**: Main wedding ritual
- **Reception**: Post-wedding celebration

Each event has:
- Individual date, time, venue
- Separate countdown timer
- Optional individual RSVP
- Reorderable display sequence

### 3. RSVP Management

**Guest Response Collection**
- Attendance status: Attending, Not Attending, Maybe
- Plus-one count (configurable max, default: 20)
- Dietary preferences (vegetarian, vegan, allergies)
- Optional message to host (max 500 characters)
- Contact info (email or phone)

**Duplicate Prevention**
- Atomic handling of simultaneous submissions
- Email-based duplicate detection
- Edit token for response updates
- Clear messaging for existing RSVPs

**Host Dashboard**
- Summary cards: Total, Attending, Not Attending, Maybe
- Filterable guest list
- Export to CSV and PDF
- Real-time response rate calculation

**Security Hardening**
- Workspace isolation on all queries
- No PII in application logs
- Audit logging for all RSVP operations
- Rate limiting: 10 submissions/minute per IP

### 4. QR Code & Calendar Integration

**QR Codes**
- Dedicated QR for each invitation
- Multiple formats: PNG, SVG, PDF
- Logo embedding with brand colors
- Error correction level H (30% recovery)
- Print-ready with crop marks

**Calendar Integration (.ics)**
- Compatible with Google Calendar, Apple Calendar, Outlook
- Event title, date, time, location
- Link back to invitation
- Reminder settings (1 day before)
- Venue coordinates for navigation

### 5. Sharing & Distribution

**WhatsApp Optimization**
- Open Graph meta tags for rich previews
- Cover image optimized (1200x630px, <300KB)
- Pre-filled share message with URL

**Social Media**
- Instagram Stories format (1080x1920)
- Facebook share preview
- Direct sharing links

**Email Invitations**
- Bulk send to guest list (up to 500)
- Personalized with guest name
- Delivery tracking (queued/sent/failed)
- Automatic retry with exponential backoff

**Custom Domain**
- Studio branding on invitation URLs
- Custom domain mapping (tier-gated)

### 6. Multi-Language Support

**Supported Languages (12 Indian + English)**
| Language | Native Name | Code | Direction |
|----------|-------------|------|-----------|
| English | English | en | LTR |
| Hindi | हिन्दी | hi | LTR |
| Telugu | తెలుగు | te | LTR |
| Tamil | தமிழ் | ta | LTR |
| Kannada | ಕನ್ನಡ | kn | LTR |
| Malayalam | മലയാളം | ml | LTR |
| Assamese | অসমীয়া | as | LTR |
| Bengali | বাংলা | bn | LTR |
| Gujarati | ગુજરાતી | gu | LTR |
| Marathi | मराठी | mr | LTR |
| Odia | ଓଡ଼ିଆ | or | LTR |
| Punjabi | ਪੰਜਾਬੀ | pa | LTR |
| Urdu | اردو | ur | RTL |

**Features**
- Independent invitation language from UI language
- AI content generation in all languages
- Culturally appropriate phrasing
- Proper font rendering for all scripts
- RTL layout support for Urdu

### 7. AI-Powered Features

**Content Generation**
- AI-generated titles and descriptions
- Multiple style options (professional, casual, poetic)
- 3-5 suggestions per generation
- "Generated by AI" indicator
- Culturally appropriate for each language

**Background Generation** (Future)
- Custom backgrounds from text prompts
- Automatic overlay adjustments for readability
- Integration with Gemini/Imagen

### 8. Analytics & Insights

**View Tracking**
- Total views and unique visitors
- Device breakdown (mobile/tablet/desktop)
- Geographic distribution
- Views by time period (day/week/month)

**RSVP Analytics**
- Response rate percentage
- Attendance breakdown
- Guest count totals
- Trend over time

**Caching**
- Analytics cached for 10 minutes
- Reduces database load
- Near real-time updates

### 9. Data Retention & Privacy

**Auto-Deletion**
- Default: 7 days after event date
- Extendable on paid plans
- Warning emails: 7 days and 24 hours before
- All associated data deleted (images, QR codes, RSVPs)

**Privacy Compliance**
- GDPR and DPDP (India) compliant
- Data export before deletion
- No PII in logs
- Workspace isolation

---

## Integration Points

### With Other Features

| Feature | Integration |
|---------|-------------|
| **Gallery Management** | Galleries embedded in invitations; guest access via invitation |
| **Client CRM** | Guests become clients; activity tracked |
| **Face Detection** | Identify guests in event photos |
| **Company Profile** | Branded invitations with studio identity |
| **Notifications** | RSVP notifications, reminders, warnings |
| **Analytics** | Invitation engagement metrics |
| **Billing** | Invitation limits per subscription tier |

---

## Technical Architecture

### Backend Services

```
invitation_service.py           - Invitation CRUD, publishing
invitation_rsvp_service.py      - RSVP submission, validation
invitation_guest_service.py     - Guest list management
invitation_analytics_service.py - View and RSVP analytics
invitation_email_service.py     - Email delivery, bulk send
invitation_ai_service.py        - AI content generation
invitation_template_service.py  - Template management
invitation_qr_service.py        - QR code generation
invitation_calendar_service.py  - .ics file generation
invitation_export_service.py    - CSV/PDF export
```

### API Endpoints

**Invitation Management**
```
POST   /api/v1/invitations                  - Create invitation
GET    /api/v1/invitations                  - List invitations
GET    /api/v1/invitations/{id}             - Get invitation
PUT    /api/v1/invitations/{id}             - Update invitation
DELETE /api/v1/invitations/{id}             - Delete invitation
POST   /api/v1/invitations/{id}/publish     - Publish invitation
POST   /api/v1/invitations/{id}/duplicate   - Duplicate invitation
```

**RSVP Management**
```
POST   /api/v1/invitations/{id}/rsvp        - Submit RSVP (public)
GET    /api/v1/invitations/{id}/rsvps       - List RSVPs (host)
PUT    /api/v1/invitations/{id}/rsvps/{rsvpId} - Update RSVP
DELETE /api/v1/invitations/{id}/rsvps/{rsvpId} - Delete RSVP
GET    /api/v1/invitations/{id}/rsvps/export   - Export RSVPs
```

**Guest Management**
```
POST   /api/v1/invitations/{id}/guests      - Add guest
GET    /api/v1/invitations/{id}/guests      - List guests
PUT    /api/v1/invitations/{id}/guests/{guestId} - Update guest
DELETE /api/v1/invitations/{id}/guests/{guestId} - Delete guest
POST   /api/v1/invitations/{id}/guests/import   - Import CSV
POST   /api/v1/invitations/{id}/guests/bulk-invite - Bulk email
```

**Public Access**
```
GET    /i/{slug}                            - View invitation
POST   /i/{slug}/rsvp                       - Submit RSVP
GET    /i/{slug}/calendar                   - Download .ics
GET    /i/{slug}/qr                         - Get QR code
```

**Analytics**
```
GET    /api/v1/invitations/{id}/analytics   - View analytics
GET    /api/v1/invitations/{id}/analytics/rsvp - RSVP stats
GET    /api/v1/invitations/{id}/analytics/views - View stats
```

**AI Features**
```
POST   /api/v1/invitations/ai/generate-content - Generate content
POST   /api/v1/invitations/ai/generate-background - Generate background
```

### Database Schema

**Core Tables**
```sql
invitations                  - Invitation metadata, settings
invitation_events            - Multi-event support
invitation_templates         - Template definitions
invitation_images            - Uploaded images
invitation_guests            - Guest list
invitation_rsvps             - RSVP responses
invitation_check_ins         - Event-day attendance
invitation_qr_codes          - Generated QR codes
invitation_drafts            - Auto-saved drafts
invitation_views             - View tracking
invitation_analytics         - Aggregated analytics
```

### Frontend Components

**Pages**
```
InvitationsPage             - Invitation list
InvitationCreatePage        - Creation wizard
InvitationDetailPage        - Invitation management
InvitationRSVPPage          - RSVP dashboard
PublicInvitationPage        - Guest-facing view
```

**Feature Components**
```
InvitationWizard            - Step-by-step creation
TemplateGallery             - Template selection
TemplateCustomizer          - Color, font, layout editing
EventManager                - Multi-event management
GuestManager                - Guest list CRUD
RSVPDashboard               - Response tracking
RSVPForm                    - Guest RSVP submission
QRCodeGenerator             - QR code creation/download
CalendarButton              - Add to calendar
SharePanel                  - Social sharing options
AnalyticsDashboard          - Engagement metrics
LanguageSelector            - Language selection
AIContentGenerator          - AI content modal
```

---

## Scalability Considerations

### Handling Large Guest Lists

**Database Optimization**
- Indexed queries on invitation_id, workspace_id
- Pagination for guest lists (25, 50, 100 per page)
- Batch operations for bulk actions

**Email Delivery**
- Queue-based processing with BullMQ
- Rate limiting per workspace
- Retry with exponential backoff
- Delivery status tracking

**Analytics**
- Cached aggregations (10-minute TTL)
- Pre-computed statistics
- Efficient view deduplication

### Performance Targets
- Invitation creation: < 5 minutes end-to-end
- RSVP submission: < 500ms response time
- Public page load: < 3 seconds on 4G (LCP < 2.5s)
- Bulk invite (500 guests): < 30 seconds queuing
- Analytics load: < 2 seconds with cache

---

## Security & Compliance

### Data Protection
- **Encryption**: TLS 1.3 in transit, AES-256 at rest
- **XSS Prevention**: HTML-escaped user content in emails
- **CSRF Protection**: Token validation on all forms
- **Rate Limiting**: 10 RSVP submissions/minute per IP

### Privacy
- **No PII in Logs**: Only anonymized identifiers
- **Workspace Isolation**: All queries scoped by workspace_id
- **Audit Logging**: All RSVP operations logged
- **Data Retention**: Configurable auto-deletion

### Compliance
- **GDPR**: Data export, deletion rights
- **DPDP (India)**: Local data protection compliance
- **SOC2**: Audit trail, access controls

---

## Business Metrics

### Key Performance Indicators
- **Creation Rate**: % of users creating invitations
- **RSVP Response Rate**: % of guests responding (target: 80%)
- **Time to First RSVP**: Average time from send to first response
- **Guest Engagement**: % of guests viewing invitation
- **Calendar Add Rate**: % of guests adding to calendar (target: 75%)

### Success Criteria
- Users complete invitation creation in < 5 minutes
- 80% RSVP response rate for invitations with RSVP enabled
- RSVP submission completes in < 60 seconds
- Public pages load within 3 seconds on 4G
- QR codes scan successfully 95% of the time
- WhatsApp previews display correctly 100% of the time

---

## Future Enhancements

### Planned Features
- **AI Theme Generation**: Generate custom themes from prompts
- **AI Text Suggestions**: Smart content recommendations
- **Background Music**: Audio playback on invitations
- **Animated Elements**: CSS transitions and animations
- **Seating Charts**: Table assignment management
- **Guest Reminders**: Automated follow-up for non-responders
- **Ticketing/Payments**: Paid event support

### Roadmap
- Q1 2026: AI theme generation
- Q2 2026: Animated elements
- Q3 2026: Seating chart management
- Q4 2026: Ticketing integration
