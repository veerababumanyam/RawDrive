# Gallery Management & Delivery

> **Reference Documentation**: 
> - `docs/Features/GalleryFeatures.md` - Core gallery specifications
> - `docs/Features/GallerySettings.md` - Detailed settings breakdown
> - `docs/Features/MagicLink.md` - Magic Link & QR code specifications
> - `docs/Features/SharedDashboard.md` - Security & sharing dashboard
> - `.kiro/specs/gallery-crud/` - Gallery CRUD implementation specs

## Business Value Proposition

Gallery Management is the core feature of RawDrive, enabling photographers and studios to deliver beautiful, fast-loading galleries to clients with complete control over sharing, access, and client interactions. Galleries are the primary delivery surface where staff create and curate content inside a **workspace**, then share with clients via a **Client Portal** using **Magic Links** and explicit access policies.

### Key Business Benefits
- **Client Engagement**: Beautiful, mobile-first gallery experience increases client satisfaction
- **Revenue Generation**: Galleries drive album sales and additional services
- **Workflow Efficiency**: Automated sharing and access control reduces manual work
- **Brand Control**: Customizable themes, watermarking, and branding protect photographer identity
- **Client Insights**: Analytics on gallery views and client interactions inform business decisions
- **Proofing Workflows**: Favorites, selections ("picks"), and comments streamline client collaboration
- **Controlled Sharing**: Least privilege access with passwords, expiry, per-link permissions, and per-asset locks
- **Internationalization**: Support for Indian languages and Urdu RTL in the portal

---

## User Personas

### Primary Users
1. **Photographer/Studio Owner**
   - Creates and manages galleries
   - Shares with clients via Magic Links
   - Monitors client engagement and proofing
   - Customizes gallery appearance and branding
   - Reviews client favorites and selections

2. **Studio Editor/Assistant**
   - Uploads and organizes photos into sub-galleries
   - Creates sub-galleries (e.g., "Ceremony", "Reception")
   - Manages client access and share links
   - Tracks client selections and comments
   - Exports selections for album production

3. **Client (Couple/Family)**
   - Views gallery on mobile/desktop via Magic Link
   - Selects favorite photos (heart)
   - Makes picks for proofing (check)
   - Leaves comments and feedback
   - Downloads approved images (based on policy)

4. **Corporate Admin**
   - Creates internal galleries with SSO access
   - Manages team access and permissions
   - Enforces download restrictions and watermarking
   - Tracks usage and compliance

---

## Key Capabilities

### 1. Gallery Organization

**Multi-level Structure**
- **Galleries**: Top-level containers for photo collections
- **Sub-galleries**: Organize content by event segment (e.g., "Ceremony", "Reception", "Portraits")
- **Assets**: Individual photos/videos with metadata and derivatives

**Display Options**
- **Tabs Layout**: Sub-galleries displayed as horizontal tabs
- **Continuous Scroll**: All photos in single scrollable view
- **Masonry Grid**: Responsive grid preserving aspect ratios

**Bulk Operations**
- Upload up to 1,000 files per batch
- Drag-drop folder upload with structure preservation
- Bulk move, tag, visibility, and delete operations
- Smart organization by date or camera model

### 2. Magic Links & Sharing

Magic Links are the primary distribution mechanism for galleries. Each link grants access to a gallery, sub-gallery, or single asset with explicit policies.

**Link Types**
- **Root Gallery Link**: `/g/{token}` - Access entire gallery
- **Sub-gallery Link**: `/g/{token}/s/{subGalleryId}` - Access specific section
- **Individual Photo Link**: `/g/{token}/p/{photoId}` - Direct photo access

**Access Controls**
- **Master Sharing Toggle**: Enable/disable all sharing for a gallery
- **Password/PIN Protection**: 4-6 digit access codes with brute-force protection
- **Email Registration**: Capture visitor emails before access
- **Expiry Dates**: Time-limited access with automatic revocation
- **Per-link Permissions**: View, favorite, select, comment, download

**QR Code Generation**
- Dedicated QR codes for each Magic Link type
- Multiple formats: PNG (up to 4096x4096), SVG, PDF with crop marks
- Logo embedding with brand colors
- Error correction level H (30% recovery)

### 3. Face Discovery ("Find My Photos")

Client-side face detection allows guests to find photos of themselves:
- Uses device camera with explicit consent
- All face processing happens client-side (privacy-first)
- 512-dimensional embeddings sent to server (not raw images)
- pgvector similarity search returns matching photos
- Rate limited: 100 searches/hour per gallery per IP

### 4. Client Proofing Workflow

**Favorites (Heart)**
- Clients mark photos they like
- Associated with visitor email for attribution
- Visible to photographer in dashboard

**Selections/Picks (Check)**
- Clients mark photos for final delivery
- Distinct from favorites for production decisions
- Optional selection limits per gallery

**Smart Selection Mode**
- Bulk favorite/pick actions
- Bulk downloads (where permitted)
- Efficient workflow for large galleries

**Comments & Feedback**
- Per-photo comments
- Edit/retouch requests
- Approval workflows

### 5. Gallery Settings

**Presentation**
- Title, description, cover image
- Theme: light/dark/system
- Layout style: tabs/continuous
- Portal language (per-gallery default)
- Branding profile (logo, colors, typography)

**Access Controls**
- Publish/unpublish toggle
- Password/PIN gate
- Email registration requirement
- Expiry timestamp
- Custom domain mapping (tier-gated)

**Download Policy**
- `view_only`: No downloads
- `web_only`: Web-optimized derivatives only
- `watermarked_only`: Watermarked versions only
- `original_allowed`: Full resolution downloads

**Watermark Configuration**
- Watermark image or brand logo
- Opacity and positioning (center/corners/tile)
- Applied to downloads based on policy

**Metadata Visibility**
- EXIF visibility toggle (default: off for public)
- Camera info, lens, settings display

**AI Policy**
- Per-gallery toggle to disable AI features
- Privacy-sensitive galleries can opt out

### 6. Shared Dashboard (Security & Sharing)

Centralized view of all active share links across workspace:
- Aggregate statistics: active links, views, visitors
- Filter by status, gallery, search
- Bulk revocation ("Kill Switch") for emergency response
- Access timeline with visitor details
- Export for compliance audit

---

## Integration Points

### With Other Features

| Feature | Integration |
|---------|-------------|
| **Client CRM** | Galleries linked to client records; activity tracked |
| **AI & Search** | Photos analyzed for metadata, quality, semantic search |
| **Face Detection** | Faces detected and grouped; face-based filtering |
| **Invitations** | Galleries embedded in digital invitations |
| **Company Profile** | Gallery branding from company profile |
| **Billing** | Storage quota based on subscription tier |
| **Notifications** | Email alerts for client activity |
| **Analytics** | Gallery performance metrics and engagement |
| **Audit** | All operations logged for compliance |

---

## Technical Architecture

### Backend Services

```
gallery_service.py           - Gallery CRUD, publishing, settings
gallery_link_service.py      - Magic Link creation, validation, analytics
magic_link_service.py        - Token generation, QR codes, face search
gallery_story_service.py     - Gallery narrative features
smart_curation_service.py    - AI-powered photo selection
favorites_service.py         - Client favorite tracking
favorites_analytics_service.py - Engagement analysis
asset_service.py             - Asset CRUD, metadata, variants
image_processing_service.py  - Thumbnails, watermarks, optimization
storage_service.py           - Upload handling, signed URLs, CDN
qr_service.py                - QR code generation (PNG, SVG, PDF)
```

### API Endpoints

**Gallery Management**
```
POST   /api/v1/galleries                    - Create gallery
GET    /api/v1/galleries                    - List galleries
GET    /api/v1/galleries/{id}               - Get gallery details
PUT    /api/v1/galleries/{id}               - Update gallery
DELETE /api/v1/galleries/{id}               - Delete gallery
POST   /api/v1/galleries/{id}/publish       - Publish gallery
POST   /api/v1/galleries/{id}/unpublish     - Unpublish gallery
```

**Sub-galleries**
```
POST   /api/v1/galleries/{id}/sub-galleries      - Create sub-gallery
GET    /api/v1/galleries/{id}/sub-galleries      - List sub-galleries
PUT    /api/v1/galleries/{id}/sub-galleries/{subId}   - Update
DELETE /api/v1/galleries/{id}/sub-galleries/{subId}   - Delete
```

**Assets**
```
POST   /api/v1/galleries/{id}/assets        - Upload assets
GET    /api/v1/galleries/{id}/assets        - List assets
PUT    /api/v1/galleries/{id}/assets/{assetId}   - Update asset
DELETE /api/v1/galleries/{id}/assets/{assetId}   - Delete asset
```

**Magic Links**
```
POST   /api/v1/galleries/{id}/links         - Create Magic Link
GET    /api/v1/galleries/{id}/links         - List links
GET    /api/v1/galleries/{id}/links/{linkId}     - Get link details
DELETE /api/v1/galleries/{id}/links/{linkId}     - Revoke link
GET    /api/v1/galleries/{id}/links/{linkId}/qr  - Download QR code
GET    /api/v1/galleries/{id}/links/{linkId}/stats - Link analytics
```

**Public Access**
```
GET    /g/{token}                           - Access via Magic Link
POST   /g/{token}/face-search               - Find photos by face
GET    /g/{token}/qr                        - Get QR code
```

**Shared Dashboard**
```
GET    /api/v1/workspaces/{id}/shared/links      - List all links
GET    /api/v1/workspaces/{id}/shared/stats      - Aggregate stats
POST   /api/v1/workspaces/{id}/shared/bulk-revoke - Kill Switch
GET    /api/v1/workspaces/{id}/shared/export     - Compliance export
```

### Database Schema

**Core Tables**
```sql
galleries                    - Gallery metadata, settings, status
gallery_assets               - Asset-gallery associations, ordering
gallery_asset_favorites      - Client favorites tracking
magic_links                  - Share links with policies
magic_link_accesses          - Access log for analytics
face_search_logs             - Face search audit (privacy-conscious)
gallery_metadata             - Custom key-value metadata
gallery_settings_enhancements - Extended settings
gallery_views                - View tracking
gallery_interactions         - Action tracking (favorite, comment, download)
```

### Frontend Components

**Pages**
```
GalleriesPage               - Gallery list with filters
GalleryDetailPage           - Gallery settings, assets, links
GalleryCreatePage           - Gallery creation wizard
PublicGalleryPage           - Client-facing gallery view
SharedDashboardPage         - Security & sharing dashboard
```

**Feature Components**
```
GalleryGrid                 - Masonry layout with lazy loading
GalleryLightbox             - Full-screen viewer with zoom
GallerySettings             - Theme, watermark, access controls
ShareLinkManager            - Link creation, expiry, analytics
FavoritesPanel              - Favorite list and export
CommentsSection             - Comment display and form
AnalyticsDashboard          - View metrics and engagement
ShareLinkTable              - Shared dashboard link list
BulkRevokeDialog            - Kill Switch confirmation
```

---

## Scalability Considerations

### Handling 5,000+ Concurrent Connections

**Database Optimization**
- Connection pooling: asyncpg with 20-50 connections per pod
- Indexed queries on workspace_id, gallery_id, status
- Cursor-based pagination for large asset lists
- Redis cache for frequently accessed galleries

**Frontend Performance**
- Lazy loading: Assets load on-demand as user scrolls
- Image optimization: Multiple derivatives (thumbnail 512px, web 2048px, original)
- Progressive loading: Low-res placeholder → high-res image
- WebP format with JPEG fallback

**CDN & Delivery**
- Cloudflare CDN: Global edge caching
- Signed URLs: 1-hour TTL with cache headers
- Regional routing to nearest edge location

**Background Processing**
- Async jobs: Image processing in BullMQ workers
- Batch operations: Bulk uploads processed in batches
- Rate limiting: Per-user and per-workspace limits

### Performance Targets
- Gallery load: < 2 seconds on 4G
- Asset load: < 500ms per image
- API response: < 300ms for typical queries
- Concurrent users: 5,000+ per workspace

---

## Security & Compliance

### Data Protection
- **Encryption in Transit**: TLS 1.3 for all connections
- **Encryption at Rest**: AES-256-GCM with workspace-specific keys
- **Signed URLs**: Time-limited access tokens (1-hour TTL)
- **Access Logging**: All gallery access logged with IP, user agent

### Access Control
- **RBAC**: Role-based permissions for gallery management
- **Share Link Capabilities**: Granular per-link permissions
- **Password Protection**: Hashed passwords with brute-force protection
- **Expiry Enforcement**: Automatic access revocation

### Audit & Compliance
- **Audit Logging**: All gallery operations logged
- **Access Tracking**: Who accessed gallery and when
- **Soft Delete**: Recovery window before permanent deletion
- **GDPR/CCPA**: Data export and deletion support

---

## Business Metrics

### Key Performance Indicators
- **Gallery Creation Rate**: % of users creating galleries
- **Share Rate**: % of galleries shared with clients
- **Client Engagement**: % of clients viewing galleries
- **Conversion Rate**: % of gallery views leading to album sales
- **Average Session Duration**: Time spent in gallery
- **Return Rate**: % of clients returning to gallery

### Revenue Metrics
- **Gallery-to-Album Conversion**: % leading to album orders
- **Average Order Value**: Revenue per gallery
- **Lifetime Value**: Total revenue per photographer
- **Churn Rate**: % discontinuing service

---

## Future Enhancements

### Planned Features
- **Video Streaming**: Full video hosting and streaming optimization
- **Advanced Editing**: In-gallery photo editing tools
- **Real-time Collaboration**: Multi-user gallery curation
- **White-label**: Fully customizable gallery experience
- **Developer API**: Public API for custom integrations
- **Webhooks**: Event notifications for external systems

### Roadmap
- Q1 2026: Video streaming optimization
- Q2 2026: Advanced editing tools
- Q3 2026: White-label gallery
- Q4 2026: Developer API and webhooks
