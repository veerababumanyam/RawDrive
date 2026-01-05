# Client CRM & Relationship Management

> **Reference Documentation**:
> - `.kiro/specs/client-crm-module/` - CRM module specifications
> - `docs/DatabaseSchemas/clients.md` - Client database schema
> - `docs/Features/CLIENT_FACING_FEATURES.md` - Client-facing features

## Business Value Proposition

The Client CRM Module is a lightweight Customer Relationship Management system designed specifically for photographers to maintain a professional database of their customers, track preferences, and link clients to specific photo galleries for personalized delivery experiences. This module serves as the foundation for the proofing workflow, enabling photographers to track client selections, favorites, and manage all client-related communications from a centralized location.

### Key Business Benefits
- **Centralized Management**: All client information in one place
- **Relationship Tracking**: Complete history of interactions
- **Workflow Integration**: Link clients to galleries and invitations
- **Lead Generation**: Capture visitor data from galleries
- **Business Insights**: Client analytics and lifetime value
- **Efficiency**: Reduce manual data entry and lookup time

---

## User Personas

### Primary Users
1. **Photographer/Studio Owner**
   - Manages client database
   - Reviews client activity and history
   - Tracks referrals and lifetime value
   - Exports client data for marketing

2. **Studio Manager/Assistant**
   - Creates and updates client profiles
   - Links clients to galleries
   - Manages communication history
   - Handles bulk imports/exports

3. **Sales/Marketing**
   - Segments clients for campaigns
   - Tracks referral sources
   - Analyzes client metrics
   - Creates smart lists

---

## Key Capabilities

### 1. Client Profile Management

**Identity Fields**
- Full name, first name, last name
- Nickname (optional)
- Job title and organization
- Avatar (upload or from gallery photo)

**Avatar Management**
- Upload images (JPEG, PNG, WebP)
- Crop and resize tool (1:1 aspect ratio)
- Zoom, pan, rotation controls
- Multiple sizes generated (64x64, 128x128, 256x256)
- Select from linked gallery photos
- Default avatar with initials

**Contact Information**
- Multiple emails with labels (Work, Personal)
- Multiple phones with labels (Primary, Secondary, Home, Main)
- Primary contact designation
- Website URLs
- Physical address (multi-line, city, state, country, postal code)
- Timezone (auto-detected from location)

**Social Media**
- Instagram, Facebook, WhatsApp
- TikTok, LinkedIn, YouTube
- Twitter (X), Snapchat, Spotify
- Direct links to profiles
- WhatsApp chat link generation

### 2. Client Organization

**Tags & Labels**
- Multiple tags per client
- Reusable tags across workspace
- Pre-built tags: VIP, Returning, Wedding, Corporate, Referral
- Custom tag creation
- Filter by tags

**Status Management**
- Active/Inactive status
- Visual distinction for inactive clients
- Retain historical data when inactive

**Internal Notes**
- Private notes visible only to workspace members
- Rich text support
- Timestamped entries

### 3. Important Dates

**Date Tracking**
- Date of birth (with age calculation)
- Anniversary date
- Custom important dates with labels
- Locale-aware date formatting

**Reminders** (Future)
- Birthday reminders
- Anniversary notifications
- Custom date alerts

### 4. Gallery-Client Linking

**Associations**
- Link multiple galleries to a client
- Link gallery to multiple clients (couples, families)
- View all linked galleries from client profile
- View linked client from gallery

**Proofing Integration**
- Track client picks and favorites
- Associate selections with client profile
- View proofing history

### 5. Activity Timeline

**Tracked Events**
- Gallery links created
- Gallery views
- Selections and favorites
- Gallery link sends
- Payments received
- Manual notes added

**Timeline Display**
- Reverse chronological order
- Event type icons
- Timestamps
- Related resource links

### 6. Communication History

**Logged Communications**
- Email sends (subject, timestamp)
- Phone calls (notes, duration)
- WhatsApp messages
- Gallery link shares

**Follow-up Management**
- Add follow-up reminders
- Last contact date display
- Communication frequency tracking

### 7. Client Search & Filtering

**Search Capabilities**
- Search by name, email, phone
- Search by company
- Search by tags
- Full-text search

**Filtering Options**
- Filter by status (active/inactive)
- Filter by tags
- Filter by date ranges
- Filter by gallery activity

**Sorting**
- Sort by name
- Sort by creation date
- Sort by last modified
- Sort by last contact

### 8. Smart Lists

**Pre-built Lists**
- Recent Clients
- Inactive Clients
- VIP Clients
- Clients with Pending Selections

**Custom Smart Lists**
- Multiple filter criteria
- Dynamic updates
- Bulk actions on list
- Share with team members

### 9. Referral Tracking

**Referral Management**
- "Referred By" field linking to existing client
- View all referred clients
- Referral statistics on dashboard
- Referral notes and rewards tracking

### 10. Bulk Operations

**Supported Actions**
- Add/remove tags
- Change status
- Export selected
- Delete selected

**Import/Export**
- CSV import with validation
- CSV export with all fields
- Template file for import
- Duplicate detection on import

### 11. Client Preferences

**Gallery Preferences**
- Preferred gallery style (grid, masonry, slideshow)
- Preferred file formats and resolutions
- Watermark settings

**Delivery Preferences**
- Color grading preferences
- Editing notes
- Print preferences (sizes, finishes)

### 12. Client Portal Access

**Portal Features**
- Unique login for clients
- View all linked galleries
- See selections and order history
- Update contact information (with approval)

**Notifications**
- Email when new galleries added
- Activity notifications
- Disable portal access per client

### 13. Multi-Language Support

**Supported Languages**
- English, Hindi, Bengali, Telugu
- Marathi, Tamil, Gujarati, Kannada
- Malayalam, Punjabi, Urdu (RTL)

**Language Preferences**
- Per-client language setting
- Applied to gallery sharing and notifications

---

## Integration Points

### With Other Features

| Feature | Integration |
|---------|-------------|
| **Gallery Management** | Galleries linked to clients; activity tracked |
| **Invitations** | Guests become clients; invitation history |
| **Face Detection** | Identify clients in photos |
| **Billing** | Client lifetime value; payment history |
| **Notifications** | Client communications |
| **Analytics** | Client engagement metrics |
| **Customer Portal** | Client self-service access |

---

## Technical Architecture

### Backend Services

```
client_service.py               - Client CRUD operations
client_activity_service.py      - Activity tracking
client_avatar_service.py        - Avatar management
communication_service.py        - Communication logging
visitor_service.py              - Visitor tracking
client_import_service.py        - CSV import/export
client_search_service.py        - Search and filtering
smart_list_service.py           - Smart list management
```

### API Endpoints

**Client Management**
```
POST   /api/v1/clients                      - Create client
GET    /api/v1/clients                      - List clients
GET    /api/v1/clients/{id}                 - Get client details
PUT    /api/v1/clients/{id}                 - Update client
DELETE /api/v1/clients/{id}                 - Delete client
```

**Avatar Management**
```
POST   /api/v1/clients/{id}/avatar          - Upload avatar
DELETE /api/v1/clients/{id}/avatar          - Remove avatar
POST   /api/v1/clients/{id}/avatar/from-gallery - Set from gallery
```

**Activity & Communication**
```
GET    /api/v1/clients/{id}/activity        - Get activity timeline
POST   /api/v1/clients/{id}/activity        - Add manual activity
GET    /api/v1/clients/{id}/communications  - Get communications
POST   /api/v1/clients/{id}/communications  - Log communication
```

**Gallery Linking**
```
POST   /api/v1/clients/{id}/galleries       - Link gallery
DELETE /api/v1/clients/{id}/galleries/{galleryId} - Unlink gallery
GET    /api/v1/clients/{id}/galleries       - List linked galleries
```

**Search & Lists**
```
GET    /api/v1/clients/search               - Search clients
GET    /api/v1/clients/smart-lists          - List smart lists
POST   /api/v1/clients/smart-lists          - Create smart list
GET    /api/v1/clients/smart-lists/{id}     - Get smart list clients
```

**Import/Export**
```
POST   /api/v1/clients/import               - Import CSV
GET    /api/v1/clients/export               - Export CSV
GET    /api/v1/clients/import/template      - Download template
```

**Bulk Operations**
```
POST   /api/v1/clients/bulk/tags            - Bulk add/remove tags
POST   /api/v1/clients/bulk/status          - Bulk change status
DELETE /api/v1/clients/bulk                 - Bulk delete
```

### Database Schema

**Core Tables**
```sql
clients                      - Client profiles
├── client_id (UUID)
├── workspace_id (UUID)
├── full_name (VARCHAR)
├── first_name (VARCHAR)
├── last_name (VARCHAR)
├── nickname (VARCHAR)
├── job_title (VARCHAR)
├── organization (VARCHAR)
├── avatar_url (VARCHAR)
├── status (VARCHAR)         - active, inactive
├── language (VARCHAR)
├── timezone (VARCHAR)
├── notes (TEXT)
├── tags (TEXT[])
├── referred_by_id (UUID)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)

client_contacts              - Contact information
├── contact_id (UUID)
├── client_id (UUID)
├── type (VARCHAR)           - email, phone, website
├── value (VARCHAR)
├── label (VARCHAR)
├── is_primary (BOOLEAN)
└── created_at (TIMESTAMP)

client_social_links          - Social media handles
├── link_id (UUID)
├── client_id (UUID)
├── platform (VARCHAR)
├── handle (VARCHAR)
└── created_at (TIMESTAMP)

client_addresses             - Physical addresses
├── address_id (UUID)
├── client_id (UUID)
├── address_line1 (VARCHAR)
├── address_line2 (VARCHAR)
├── city (VARCHAR)
├── state (VARCHAR)
├── country (VARCHAR)
├── postal_code (VARCHAR)
└── created_at (TIMESTAMP)

client_important_dates       - Important dates
├── date_id (UUID)
├── client_id (UUID)
├── date_type (VARCHAR)      - birthday, anniversary, custom
├── date_value (DATE)
├── label (VARCHAR)
└── created_at (TIMESTAMP)

client_activities            - Activity timeline
├── activity_id (UUID)
├── client_id (UUID)
├── workspace_id (UUID)
├── activity_type (VARCHAR)
├── description (TEXT)
├── resource_type (VARCHAR)
├── resource_id (UUID)
├── metadata (JSONB)
└── created_at (TIMESTAMP)

client_communications        - Communication history
├── communication_id (UUID)
├── client_id (UUID)
├── type (VARCHAR)           - email, phone, whatsapp
├── subject (VARCHAR)
├── notes (TEXT)
├── duration_minutes (INT)
├── performed_by (UUID)
└── created_at (TIMESTAMP)

client_gallery_links         - Gallery associations
├── link_id (UUID)
├── client_id (UUID)
├── gallery_id (UUID)
├── linked_by (UUID)
└── created_at (TIMESTAMP)

client_preferences           - Client preferences
├── preference_id (UUID)
├── client_id (UUID)
├── gallery_style (VARCHAR)
├── file_format (VARCHAR)
├── resolution (VARCHAR)
├── watermark_enabled (BOOLEAN)
├── editing_notes (TEXT)
└── updated_at (TIMESTAMP)

smart_lists                  - Smart list definitions
├── list_id (UUID)
├── workspace_id (UUID)
├── name (VARCHAR)
├── criteria (JSONB)
├── created_by (UUID)
└── created_at (TIMESTAMP)

visitors                     - Gallery visitors
├── visitor_id (UUID)
├── workspace_id (UUID)
├── email (VARCHAR)
├── name (VARCHAR)
├── client_id (UUID)         - Linked client if identified
├── first_visit (TIMESTAMP)
├── last_visit (TIMESTAMP)
└── visit_count (INTEGER)
```

### Frontend Components

**Pages**
```
ClientsPage                 - Client list view
ClientDetailPage            - Client profile view
ClientCreatePage            - New client form
ClientEditPage              - Edit client form
```

**Feature Components**
```
ClientList                  - Paginated client list
ClientCard                  - Client preview card
ClientProfile               - Full profile display
ClientForm                  - Create/edit form
ClientAvatar                - Avatar display/upload
AvatarCropper               - Crop tool
ContactEditor               - Contact management
SocialLinksEditor           - Social media editor
ActivityTimeline            - Activity display
CommunicationHistory        - Communication log
GalleryLinker               - Link galleries
TagManager                  - Tag management
SmartListBuilder            - Smart list creation
ImportExportPanel           - CSV import/export
BulkActionsBar              - Bulk operations
```

---

## Scalability Considerations

### Performance Optimization

**Database**
- Indexed queries on workspace_id, name, email
- Pagination (25, 50, 100 per page)
- Full-text search indexes

**Caching**
- Client counts cached in Redis
- Dashboard statistics cached
- Smart list results cached

### Performance Targets
- Client list load: < 300ms for 10,000 clients
- Search results: < 200ms
- Profile load: < 500ms
- Export (1,000 clients): < 5 seconds

---

## Security & Compliance

### Data Protection
- **Encryption**: Sensitive data encrypted at rest
- **Workspace Isolation**: All queries scoped by workspace_id
- **Access Control**: RBAC for client data access

### Privacy
- **PII Protection**: No PII in logs
- **Data Export**: GDPR-compliant export
- **Data Deletion**: Complete removal on request

### Audit
- **Access Logging**: All client data access logged
- **Modification Tracking**: Changes tracked with timestamps
- **Deletion Logging**: Soft delete with audit trail

---

## Business Metrics

### Key Performance Indicators
- **Client Database Size**: Total clients per workspace
- **Profile Completion Rate**: % of clients with complete profiles
- **Activity Rate**: % of clients with recent activity
- **Referral Rate**: % of clients from referrals
- **Lifetime Value**: Average revenue per client

### Success Criteria
- Client list loads in < 300ms for 10,000 clients
- Search returns results in < 200ms
- 80%+ profile completion rate
- CSV import handles 1,000 clients without errors

---

## Future Enhancements

### Planned Features
- **Email Marketing Integration**: Connect with email platforms
- **Automated Workflows**: Trigger actions on client events
- **Client Scoring**: Lead scoring based on activity
- **Duplicate Merging UI**: Visual merge tool
- **Client Segments**: Advanced segmentation
- **API Access**: Public API for CRM integration

### Roadmap
- Q1 2026: Email marketing integration
- Q2 2026: Automated workflows
- Q3 2026: Client scoring
- Q4 2026: Public API
