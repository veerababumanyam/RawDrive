# Customer Web Portal & Client Experience

## Business Value Proposition

The Customer Web Portal is the primary touchpoint for client engagement, providing a seamless, branded experience for viewing galleries, selecting favorites, providing feedback, and interacting with photographers. This feature directly impacts client satisfaction, engagement, and conversion.

### Key Business Benefits
- **Client Satisfaction**: Beautiful, intuitive interface increases client satisfaction
- **Engagement**: Interactive features (favorites, comments, ratings) increase client engagement
- **Conversion**: Drive album sales and additional services through positive experience
- **Retention**: Positive experience increases client retention and referrals
- **Mobile-First**: Optimized for mobile viewing (80%+ of client access)
- **Branded Experience**: Consistent branding from company profile

> **Reference Documentation**:
> - `docs/Features/MagicLink.md` - Magic Link technical specification
> - `docs/Features/SharedDashboard.md` - Security & Sharing Dashboard
> - `docs/Features/GalleryFeatures.md` - Gallery features
> - `.kiro/specs/gallery-crud/` - Gallery implementation specs

---

## User Personas

### Primary Users
1. **Client (Couple/Family)**
   - Views gallery on mobile/desktop
   - Selects favorite photos
   - Leaves comments and feedback
   - Downloads approved images
   - Shares gallery with family/friends

2. **Guest/Family Member**
   - Views shared gallery via Magic Link
   - Browses photos
   - Uses "Find My Photos" face discovery
   - Provides feedback

3. **Corporate Employee**
   - Views internal galleries via SSO
   - Accesses company media
   - Downloads approved assets
   - Provides feedback

---

## Key Capabilities

### Magic Link Access System

**Multi-Level Access**:
- **Root Gallery Link**: `/g/{token}` - Full gallery access
- **Sub-Gallery Link**: `/g/{token}/s/{subGalleryId}` - Section-specific access
- **Individual Photo Link**: `/g/{token}/p/{photoId}` - Single photo focus

**Privacy Gates**:
- **PIN/Access Code**: 4-6 digit protection
- **Email Registration**: Capture visitor identity
- **Expiry Enforcement**: Automatic access revocation
- **Master Sharing Toggle**: Gallery-level on/off control

**QR Code Integration**:
- Dedicated QR code per Magic Link
- Multiple formats: PNG (up to 4096x4096), SVG, PDF (print-ready)
- Studio logo embedding
- Brand color customization
- Error correction level H (30% recovery)

### Face Discovery ("Find My Photos")

**Client-Side Face Detection**:
- Accessible via FaceID icon in gallery header
- Uses device camera with permission
- All face processing happens client-side (privacy-first)
- Raw face images never leave user's device

**Face Matching**:
- Generate 512-dimensional embedding client-side
- Send only embedding to server (not image)
- Server returns matching photos using pgvector similarity
- Photos filtered/grouped by match confidence

**Privacy & Consent**:
- Clear consent dialog before camera access
- Option to manually browse instead
- No face data stored unless user opts in
- Face search logs retained only for abuse prevention

### Gallery Viewing Experience

**Responsive Design**:
- Mobile-first optimization
- Tablet and desktop layouts
- Progressive image loading
- Masonry grid layout

**Lightbox Viewer**:
- Full-screen image viewing
- Zoom controls (pinch/scroll)
- Swipe navigation
- Keyboard shortcuts
- Slideshow mode with auto-play

**Performance**:
- Lazy loading with intersection observer
- Multiple image derivatives (thumbnail, web, full)
- Progressive loading (low-res → high-res)
- WebP format with fallback
- CDN delivery via Cloudflare

### Client Interaction Features

**Favorites System**:
- Heart icon to mark favorites
- Favorites panel with count
- Export favorites list
- Share favorites with photographer
- Email association for tracking

**Proofing & Selection**:
- "Pick" mode for album/print selection
- Selection limits (configurable)
- Bulk selection mode
- Clear distinction between favorites and picks
- Selection summary for photographer

**Comments & Feedback**:
- Per-photo comments
- General gallery feedback
- Edit request submissions
- Retake requests
- Feedback form with categories

**Ratings**:
- 1-5 star rating per photo
- Rating aggregation
- Rating distribution display

### Download & Sharing

**Download Controls** (Policy-Based):
- Individual photo download
- Bulk download (ZIP)
- Resolution options (web, full, original)
- Watermark enforcement when enabled
- Download tracking

**Social Sharing**:
- WhatsApp (optimized preview)
- Facebook
- Email
- Copy link
- Custom domain masking

### Branding Integration

**Automatic Branding Application**:
- Brand colors for accents, buttons, highlights
- Typography choices (headings, body)
- Logo placement
- Visual identity elements
- Consistent with company profile settings

---

## Integration Points

### With Other Features

**Gallery Management**:
- Displays galleries created by photographers
- Respects gallery settings and customization
- Enforces access controls
- Tracks client interactions

**Face Detection**:
- "Find My Photos" feature
- Browse photos by person
- Face-based recommendations
- People-based filtering

**Client CRM**:
- Client activity tracked
- Interactions logged
- Preferences stored
- Communication history

**Digital Invitations**:
- Access galleries via invitation
- RSVP integration
- Guest list management
- Event-specific galleries

**Company Profile**:
- Branded gallery experience
- Company logo and colors
- Photographer information
- Contact information

**Notifications**:
- Email notifications for client actions
- In-app notifications
- Reminder emails
- Update notifications

**Analytics & Reporting**:
- Client engagement metrics
- View tracking
- Interaction analytics
- Conversion tracking

---

## Technical Architecture

### Backend Services

```
public_gallery_service.py
├── Serve public galleries via Magic Link
├── Validate tokens and privacy gates
├── Track views and engagement
└── Apply branding settings

magic_link_service.py
├── Generate secure tokens (256-bit entropy)
├── Validate token hash
├── Manage link expiry
├── Track access statistics

face_search_service.py
├── Receive client-side embeddings
├── Query pgvector for matches
├── Return matching photos
└── Log searches for abuse prevention

favorites_service.py
├── Manage client favorites
├── Track by visitor/email
├── Export favorites list
└── Analytics integration

comments_service.py
├── Manage photo comments
├── Comment moderation
├── Notification triggers
└── Comment analytics

client_portal_service.py
├── Portal customization
├── Client preferences
├── Session management
└── Portal analytics
```

### API Endpoints

```
# Magic Link Access
GET    /api/v1/g/{token}                    # Access gallery via Magic Link
POST   /api/v1/g/{token}/verify-pin         # Verify PIN gate
POST   /api/v1/g/{token}/register-email     # Register email gate
GET    /api/v1/g/{token}/qr                 # Get QR code for link

# Face Discovery
POST   /api/v1/g/{token}/face-search        # Find photos by face embedding
       Rate limit: 100/hour per gallery per IP

# Client Interactions
POST   /api/v1/client/favorites             # Add favorite
GET    /api/v1/client/favorites             # List favorites
DELETE /api/v1/client/favorites/{assetId}   # Remove favorite

POST   /api/v1/client/comments              # Add comment
GET    /api/v1/client/comments              # List comments
PUT    /api/v1/client/comments/{id}         # Update comment
DELETE /api/v1/client/comments/{id}         # Delete comment

POST   /api/v1/client/ratings               # Add rating
GET    /api/v1/client/ratings               # List ratings

POST   /api/v1/client/downloads             # Track download
GET    /api/v1/client/downloads             # List downloads

POST   /api/v1/client/feedback              # Submit feedback
GET    /api/v1/client/preferences           # Get preferences
PUT    /api/v1/client/preferences           # Update preferences
```

### Database Schema

```sql
-- Magic Links (from MagicLink.md spec)
magic_links
├── link_id (UUID)
├── workspace_id (UUID)
├── gallery_id (UUID)
├── token_hash (VARCHAR 64) - SHA-256 hash only
├── target_type (VARCHAR) - 'gallery', 'sub_gallery', 'photo'
├── target_id (UUID) - NULL for root gallery
├── label (VARCHAR 200)
├── expires_at (TIMESTAMPTZ)
├── max_accesses (INTEGER)
├── qr_config (JSONB)
├── status (VARCHAR) - 'active', 'expired', 'revoked'
├── created_by (UUID)
├── created_at (TIMESTAMPTZ)
└── revoked_at (TIMESTAMPTZ)

-- Magic Link Access Logs
magic_link_accesses
├── access_id (UUID)
├── link_id (UUID)
├── visitor_id (UUID)
├── accessed_at (TIMESTAMPTZ)
├── ip_address (INET)
├── user_agent (TEXT)
├── referer (TEXT)
├── passed_email_gate (BOOLEAN)
├── passed_pin_gate (BOOLEAN)
├── country_code (VARCHAR 2)
└── region (VARCHAR 100)

-- Face Search Logs (privacy-conscious)
face_search_logs
├── log_id (UUID)
├── gallery_id (UUID)
├── visitor_id (UUID)
├── embedding_hash (VARCHAR 64) - Hash for dedup
├── matches_count (INTEGER)
├── top_similarity (FLOAT)
├── searched_at (TIMESTAMPTZ)
├── processing_ms (INTEGER)
├── ip_address (INET)
└── user_agent (TEXT)

-- Gallery Views
gallery_views
├── id (UUID)
├── gallery_id (UUID)
├── link_id (UUID)
├── visitor_id (UUID)
├── viewed_at (TIMESTAMPTZ)
├── duration_seconds (INTEGER)
├── device_type (VARCHAR)
├── browser (VARCHAR)
└── metadata (JSONB)

-- Client Favorites
gallery_asset_favorites
├── id (UUID)
├── gallery_id (UUID)
├── asset_id (UUID)
├── visitor_id (UUID)
├── client_email (VARCHAR)
├── created_at (TIMESTAMPTZ)
└── metadata (JSONB)

-- Asset Comments
asset_comments
├── id (UUID)
├── asset_id (UUID)
├── gallery_id (UUID)
├── visitor_id (UUID)
├── client_email (VARCHAR)
├── comment_text (TEXT)
├── created_at (TIMESTAMPTZ)
├── updated_at (TIMESTAMPTZ)
└── metadata (JSONB)

-- Asset Ratings
asset_ratings
├── id (UUID)
├── asset_id (UUID)
├── gallery_id (UUID)
├── visitor_id (UUID)
├── rating (INTEGER) - 1-5
├── created_at (TIMESTAMPTZ)
└── metadata (JSONB)

-- Client Preferences
client_preferences
├── id (UUID)
├── visitor_id (UUID)
├── workspace_id (UUID)
├── notification_enabled (BOOLEAN)
├── email_notifications (BOOLEAN)
├── language (VARCHAR)
├── created_at (TIMESTAMPTZ)
├── updated_at (TIMESTAMPTZ)
└── metadata (JSONB)
```

### Frontend Components

```
pages/public/
├── PublicGalleryPage.tsx
│   ├── Magic Link entry point
│   ├── Privacy gate handling
│   ├── Gallery grid display
│   └── Branding application
├── PinVerificationModal.tsx
│   └── PIN/access code entry
├── EmailRegistrationModal.tsx
│   └── Email capture form
└── FaceDiscoveryModal.tsx
    ├── Camera permission request
    ├── Face capture interface
    └── Match results display

components/features/client-portal/
├── GalleryGrid.tsx
│   ├── Masonry layout
│   ├── Lazy loading
│   ├── Infinite scroll
│   └── Responsive design
├── Lightbox.tsx
│   ├── Full-screen viewer
│   ├── Navigation controls
│   ├── Zoom controls
│   ├── Download button
│   └── Share button
├── FavoritesPanel.tsx
│   ├── Favorites list
│   ├── Favorite count
│   ├── Export option
│   └── Share with photographer
├── CommentsSection.tsx
│   ├── Comment display
│   ├── Comment form
│   └── Comment notifications
├── FaceDiscovery.tsx
│   ├── TensorFlow.js integration
│   ├── Camera capture
│   ├── Embedding generation
│   └── Results display
└── ShareDialog.tsx
    ├── QR code display
    ├── Social sharing buttons
    └── Copy link
```

---

## Scalability Considerations

### Handling 5,000+ Concurrent Connections

**Frontend Performance**:
- Lazy loading with intersection observer
- Image optimization (WebP, multiple derivatives)
- Progressive loading (blur-up technique)
- Browser caching with proper headers
- Service worker for offline support

**Backend Performance**:
- Connection pooling (asyncpg)
- Query optimization with indexes
- Redis caching for frequently accessed data
- Cursor-based pagination
- Rate limiting per IP and gallery

**CDN & Delivery**:
- Cloudflare CDN for global edge caching
- Signed URLs with 1-hour TTL
- Proper cache-control headers
- Regional routing to nearest edge

**Concurrent Connections**:
- Load balancing across pods
- Connection pooling and reuse
- Async request processing
- Circuit breaker for failures

### Performance Targets
- **Gallery Load**: < 2 seconds on 4G
- **Image Load**: < 500ms per image
- **API Response**: < 300ms for typical queries
- **Face Search**: < 2 seconds for results
- **Concurrent Users**: 5,000+ per workspace

---

## Security & Compliance

### Data Protection
- **Encryption in Transit**: TLS 1.3 for all connections
- **Signed URLs**: Time-limited access tokens (1-hour TTL)
- **Access Logging**: All access logged for audit
- **Privacy-First Face Search**: No face images stored

### Access Control
- **Magic Link Validation**: Token hash verification
- **Privacy Gates**: PIN, email, expiry enforcement
- **Download Restrictions**: Policy-based controls
- **Watermarking**: Automatic when enabled

### Compliance
- **GDPR Compliance**: Right to access, deletion, portability
- **CCPA Compliance**: Consumer privacy rights
- **Data Retention**: Configurable retention policies
- **Consent Management**: Clear consent for face search

---

## Business Metrics

### Key Performance Indicators
- **Portal Engagement**: % of clients accessing portal
- **Session Duration**: Average time in portal
- **Favorite Rate**: % of photos marked as favorite
- **Comment Rate**: % of galleries with comments
- **Download Rate**: % of photos downloaded
- **Share Rate**: % of galleries shared
- **Return Rate**: % of clients returning to portal
- **Face Search Usage**: % of clients using "Find My Photos"

### Revenue Metrics
- **Conversion Rate**: % of portal views leading to sales
- **Average Order Value**: Revenue per client
- **Repeat Purchase Rate**: % of clients making repeat purchases
- **Lifetime Value**: Total revenue per client

---

## Implementation Status

### Completed
- ✅ Magic Link generation and validation
- ✅ Gallery viewing with masonry grid
- ✅ Lightbox viewer with navigation
- ✅ Favorites system
- ✅ Basic comments
- ✅ Download controls
- ✅ Branding integration

### In Progress
- 🔄 Face Discovery ("Find My Photos")
- 🔄 QR code generation
- 🔄 Shared Dashboard

### Planned
- 📋 Advanced proofing workflows
- 📋 Video streaming support
- 📋 Mobile app
- 📋 Offline access

---

## Related Documentation

- `docs/Features/MagicLink.md` - Magic Link technical specification
- `docs/Features/SharedDashboard.md` - Security & Sharing Dashboard
- `docs/Features/GalleryFeatures.md` - Gallery features
- `docs/Features/FaceDetectionIdentification.md` - Face detection
- `.kiro/specs/gallery-crud/` - Gallery implementation specs
