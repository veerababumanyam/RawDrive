# Design Document: Client CRM Module

## Overview

The Client CRM Module is a comprehensive Customer Relationship Management system designed specifically for photographers to maintain professional client databases, track preferences, link clients to galleries for personalized proofing workflows, and manage the complete client lifecycle from acquisition to retention.

This design document provides the technical architecture, component design, data models, API contracts, and testing strategy for implementing the Client CRM Module as specified in:
- Requirements: `.kiro/specs/client-crm-module/requirements.md`
- Technical Specification: `docs/TechnicalSpecs/client_crm.json`

### Key Design Principles

1. **Multi-Tenant Isolation**: All client data is strictly workspace-scoped with mandatory `workspace_id` filtering
2. **Data Quality**: Duplicate detection, validation, and merge capabilities ensure clean data
3. **Relationship Mapping**: Gallery-client links enable personalized proofing workflows
4. **Activity Tracking**: Complete timeline of all client interactions for context
5. **Scalability**: Designed to handle 10,000+ clients per workspace with sub-300ms query times
6. **Extensibility**: Modular design allows easy addition of new features (preferences, smart lists, analytics)

## Architecture

### System Context

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend Layer                           │
│  (React Components, Client List, Client Detail, Forms)      │
└────────────────────┬────────────────────────────────────────┘
                     │ REST API
┌────────────────────▼────────────────────────────────────────┐
│                  Backend API Layer                           │
│  (Express Routes, Controllers, Validation)                   │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                  Service Layer                               │
│  (ClientService, ContactService, ActivityService)           │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┬────────────┐
        │            │            │            │
┌───────▼──┐  ┌──────▼──┐  ┌─────▼──────┐  ┌─▼────────┐
│PostgreSQL│  │  Redis  │  │  Storage   │  │ External │
│(10 tables)│ │ (Cache) │  │ (Avatars)  │  │ Services │
└──────────┘  └─────────┘  └────────────┘  └──────────┘
                                              │
                                    ┌─────────┴─────────┐
                                    │                   │
                              ┌─────▼──────┐    ┌──────▼──────┐
                              │  Galleries │    │ Notifications│
                              │   Module   │    │    Module    │
                              └────────────┘    └──────────────┘
```

### Component Architecture

The Client CRM Module is organized into the following components:

1. **Client Management**: Core CRUD operations for client profiles
2. **Contact Management**: Multiple contact methods (email, phone, social media)
3. **Address Management**: Physical addresses with timezone mapping
4. **Tag Management**: Categorization and filtering
5. **Gallery Linking**: Association between clients and galleries
6. **Activity Tracking**: Timeline of all client interactions
7. **Communication Logging**: History of all communications
8. **Preferences Management**: Client-specific settings for galleries
9. **Smart Lists**: Dynamic client segmentation
10. **Analytics**: Insights and reporting

## Components and Interfaces

### 1. Client Service

**Responsibility**: Manage client profiles, CRUD operations, search, and filtering

**Interface**:
```typescript
interface ClientService {
  // Core CRUD
  listClients(workspaceId: string, filters: ClientFilters, pagination: Pagination): Promise<ClientListResponse>
  getClient(workspaceId: string, clientId: string): Promise<ClientDetailResponse>
  createClient(workspaceId: string, data: CreateClientRequest): Promise<Client>
  updateClient(workspaceId: string, clientId: string, data: UpdateClientRequest): Promise<Client>
  deleteClient(workspaceId: string, clientId: string): Promise<DeleteResponse>
  
  // Search and filtering
  searchClients(workspaceId: string, query: string): Promise<Client[]>
  filterByTags(workspaceId: string, tagIds: string[]): Promise<Client[]>
  filterByStatus(workspaceId: string, status: ClientStatus): Promise<Client[]>
  
  // Avatar management
  uploadAvatar(workspaceId: string, clientId: string, file: File, cropData?: CropData): Promise<AvatarResponse>
  selectGalleryPhotoAsAvatar(workspaceId: string, clientId: string, assetId: string, cropData: CropData): Promise<AvatarResponse>
  
  // Duplicate detection
  detectDuplicates(workspaceId: string, email?: string, phone?: string): Promise<DuplicateDetectionResponse>
  mergeClients(workspaceId: string, primaryClientId: string, duplicateClientId: string): Promise<MergeResponse>
  
  // Import/Export
  exportClients(workspaceId: string, format: ExportFormat, filters?: ClientFilters): Promise<ExportResponse>
  importClients(workspaceId: string, file: File, options: ImportOptions): Promise<ImportResponse>
}
```

**Dependencies**:
- `ContactService` for managing contact methods
- `AddressService` for managing addresses
- `TagService` for tag assignments
- `ActivityService` for recording activities
- `StorageService` for avatar uploads
- `GalleryService` for gallery photo selection

### 2. Contact Service

**Responsibility**: Manage multiple contact methods per client

**Interface**:
```typescript
interface ContactService {
  addContact(workspaceId: string, clientId: string, contact: ContactInput): Promise<Contact>
  updateContact(workspaceId: string, clientId: string, contactId: string, updates: ContactUpdate): Promise<Contact>
  deleteContact(workspaceId: string, clientId: string, contactId: string): Promise<void>
  setPrimaryContact(workspaceId: string, clientId: string, contactId: string, contactType: ContactType): Promise<void>
  getContacts(workspaceId: string, clientId: string): Promise<Contact[]>
  validateContact(contactType: ContactType, value: string): Promise<ValidationResult>
}
```

**Validation Rules**:
- Email: RFC 5322 format validation
- Phone: E.164 format validation with country code
- Website: Valid URL format
- Social: Platform-specific handle validation

### 3. Gallery Link Service

**Responsibility**: Link clients to galleries for proofing workflows

**Interface**:
```typescript
interface GalleryLinkService {
  linkGallery(workspaceId: string, clientId: string, galleryId: string, role: ClientRole): Promise<GalleryLink>
  unlinkGallery(workspaceId: string, clientId: string, galleryId: string): Promise<void>
  getLinkedGalleries(workspaceId: string, clientId: string): Promise<Gallery[]>
  getGalleryClients(workspaceId: string, galleryId: string): Promise<Client[]>
}
```

**Integration with Gallery Module**:
- Validates gallery exists and belongs to workspace
- Records activity when gallery is linked/unlinked
- Enables client selections and favorites tracking
- Allows selecting gallery photos as client avatars

### 4. Activity Service

**Responsibility**: Track complete timeline of client interactions

**Interface**:
```typescript
interface ActivityService {
  recordActivity(workspaceId: string, clientId: string, activity: ActivityInput): Promise<Activity>
  getActivityTimeline(workspaceId: string, clientId: string, filters?: ActivityFilters, pagination?: Pagination): Promise<ActivityListResponse>
  getActivitiesByType(workspaceId: string, activityType: ActivityType): Promise<Activity[]>
}
```

**Activity Types**:
- `gallery_linked`: Client linked to gallery
- `gallery_viewed`: Client viewed gallery
- `selection_made`: Client made photo selection
- `favorite_added`: Client added favorite
- `comment_added`: Client added comment
- `payment_received`: Payment received from client
- `communication_sent`: Communication logged
- `note_added`: Internal note added
- `status_changed`: Client status changed

### 5. Communication Service

**Responsibility**: Log and track all communications with clients

**Interface**:
```typescript
interface CommunicationService {
  logCommunication(workspaceId: string, clientId: string, communication: CommunicationInput): Promise<Communication>
  getCommunicationHistory(workspaceId: string, clientId: string, pagination?: Pagination): Promise<CommunicationListResponse>
  getFollowUpReminders(workspaceId: string, userId: string): Promise<Communication[]>
  markFollowUpComplete(workspaceId: string, communicationId: string): Promise<void>
}
```

**Communication Types**:
- `email`: Email communication
- `phone`: Phone call
- `whatsapp`: WhatsApp message
- `sms`: SMS message
- `in_person`: In-person meeting
- `other`: Other communication method

### 6. Smart List Service

**Responsibility**: Dynamic client segmentation based on filter criteria

**Interface**:
```typescript
interface SmartListService {
  createSmartList(workspaceId: string, name: string, filterCriteria: FilterCriteria): Promise<SmartList>
  updateSmartList(workspaceId: string, listId: string, updates: SmartListUpdate): Promise<SmartList>
  deleteSmartList(workspaceId: string, listId: string): Promise<void>
  evaluateSmartList(workspaceId: string, listId: string): Promise<Client[]>
  getSystemSmartLists(workspaceId: string): Promise<SmartList[]>
}
```

**Pre-built Smart Lists**:
- Recent Clients (created in last 30 days)
- Inactive Clients (no activity in 90 days)
- VIP Clients (tagged as VIP)
- Clients with Pending Selections (galleries with no selections)
- Referral Sources (clients who referred others)

### 7. Analytics Service

**Responsibility**: Provide insights and reporting on client data

**Interface**:
```typescript
interface AnalyticsService {
  getClientAnalytics(workspaceId: string, dateRange?: DateRange): Promise<ClientAnalytics>
  getGrowthTrends(workspaceId: string, groupBy: GroupBy): Promise<GrowthTrends>
  getEngagementMetrics(workspaceId: string): Promise<EngagementMetrics>
  getRevenuePerClient(workspaceId: string): Promise<RevenueMetrics>
  getReferralAnalytics(workspaceId: string): Promise<ReferralAnalytics>
}
```

## Data Models

All data models are defined in the technical specification (`docs/TechnicalSpecs/client_crm.json`). Key entities:

1. **Client** (`clients` table): Core client profile
2. **ClientContact** (`client_contacts` table): Contact methods
3. **ClientAddress** (`client_addresses` table): Physical addresses
4. **ClientTag** (`client_tags` table): Reusable tags
5. **ClientTagAssignment** (`client_tag_assignments` table): Tag assignments
6. **ClientGalleryLink** (`client_gallery_links` table): Gallery associations
7. **ClientActivity** (`client_activities` table): Activity timeline
8. **ClientCommunication** (`client_communications` table): Communication history
9. **ClientPreferences** (`client_preferences` table): Client preferences
10. **ClientSmartList** (`client_smart_lists` table): Smart lists

### Field Classifications

All fields follow the classification system defined in the technical specification:
- **MANDATORY**: Required field, must always have a value
- **OPTIONAL**: Field may be null/undefined
- **COMPUTED**: Derived from other data, not stored directly
- **SYSTEM**: Auto-generated by the system (timestamps, IDs)

### Computed Fields

The following fields are computed at query time:
- `initials`: First letter of first_name + first letter of last_name
- `age`: Calculated from date_of_birth
- `avatar_url`: CDN URL from avatar_asset_id with crop applied
- `linked_galleries_count`: Count from client_gallery_links
- `referrals_count`: Count of clients where referred_by_client_id = this client_id
- `last_contact_date`: Most recent communication from client_communications
- `primary_email`: Primary email from client_contacts
- `primary_phone`: Primary phone from client_contacts

## API Contracts

All API endpoints are defined in the technical specification (`docs/TechnicalSpecs/client_crm.json`). The module provides 21 REST API endpoints:

### Core CRUD Operations
- `GET /api/v1/workspaces/{workspace_id}/clients` - List clients
- `POST /api/v1/workspaces/{workspace_id}/clients` - Create client
- `GET /api/v1/workspaces/{workspace_id}/clients/{client_id}` - Get client
- `PATCH /api/v1/workspaces/{workspace_id}/clients/{client_id}` - Update client
- `DELETE /api/v1/workspaces/{workspace_id}/clients/{client_id}` - Delete client

### Avatar Management
- `POST /api/v1/workspaces/{workspace_id}/clients/{client_id}/avatar` - Upload avatar
- `POST /api/v1/workspaces/{workspace_id}/clients/{client_id}/avatar/from-gallery` - Select gallery photo

### Contact Management
- `POST /api/v1/workspaces/{workspace_id}/clients/{client_id}/contacts` - Add contact
- `PATCH /api/v1/workspaces/{workspace_id}/clients/{client_id}/contacts/{contact_id}` - Update contact
- `DELETE /api/v1/workspaces/{workspace_id}/clients/{client_id}/contacts/{contact_id}` - Delete contact

### Gallery Linking
- `POST /api/v1/workspaces/{workspace_id}/clients/{client_id}/galleries` - Link gallery
- `DELETE /api/v1/workspaces/{workspace_id}/clients/{client_id}/galleries/{gallery_id}` - Unlink gallery

### Activity & Communication
- `GET /api/v1/workspaces/{workspace_id}/clients/{client_id}/activities` - Get activity timeline
- `POST /api/v1/workspaces/{workspace_id}/clients/{client_id}/communications` - Log communication
- `GET /api/v1/workspaces/{workspace_id}/clients/{client_id}/communications` - Get communications

### Tag Management
- `POST /api/v1/workspaces/{workspace_id}/clients/{client_id}/tags` - Add tags
- `DELETE /api/v1/workspaces/{workspace_id}/clients/{client_id}/tags/{tag_id}` - Remove tag

### Import/Export
- `GET /api/v1/workspaces/{workspace_id}/clients/export` - Export clients
- `POST /api/v1/workspaces/{workspace_id}/clients/import` - Import clients

### Duplicate Management
- `POST /api/v1/workspaces/{workspace_id}/clients/detect-duplicates` - Detect duplicates
- `POST /api/v1/workspaces/{workspace_id}/clients/merge` - Merge clients

### Analytics
- `GET /api/v1/workspaces/{workspace_id}/clients/analytics` - Get analytics

All endpoints require `user_jwt` authentication and enforce workspace-scoped access control.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

The following correctness properties must be validated through property-based testing:

### Property 1: Workspace Isolation
*For any* two different workspaces, querying clients in workspace A should never return clients from workspace B.
**Validates: Requirements 18.1, 18.2**

### Property 2: Client Creation Uniqueness
*For any* client creation request, the system should generate a unique client_id that does not conflict with existing clients.
**Validates: Requirements 1.4**

### Property 3: Primary Contact Uniqueness
*For any* client, there should be at most one primary email and at most one primary phone number.
**Validates: Requirements 2.4**

### Property 4: Gallery Link Uniqueness
*For any* client and gallery pair, there should be at most one client_gallery_link record.
**Validates: Requirements 9.1, 9.5**

### Property 5: Activity Timeline Ordering
*For any* client, activities in the timeline should be ordered by created_at in descending order (most recent first).
**Validates: Requirements 19.8**

### Property 6: Tag Assignment Uniqueness
*For any* client and tag pair, there should be at most one client_tag_assignment record.
**Validates: Requirements 5.1**

### Property 7: Duplicate Detection Consistency
*For any* two clients with the same email or phone, the duplicate detection algorithm should identify them as potential duplicates.
**Validates: Requirements 23.1, 23.2**

### Property 8: Merge Data Preservation
*For any* two clients being merged, all gallery links, activities, and communications from both clients should be preserved in the merged client.
**Validates: Requirements 23.4**

### Property 9: Smart List Dynamic Updates
*For any* smart list with filter criteria, adding a client that matches the criteria should include them in the list evaluation.
**Validates: Requirements 22.2**

### Property 10: Avatar Crop Data Persistence
*For any* avatar upload with crop data, retrieving the avatar should apply the same crop coordinates.
**Validates: Requirements 1A.3, 1A.4**

### Property 11: Contact Validation
*For any* email contact, the value should match RFC 5322 format; for any phone contact, the value should match E.164 format.
**Validates: Requirements 12.1, 12.2**

### Property 12: Client Deletion Cleanup
*For any* deleted client, all related records (contacts, addresses, tags, gallery links) should be removed, but gallery data should remain intact.
**Validates: Requirements 13.2, 13.3**

### Property 13: Search Result Relevance
*For any* search query, all returned clients should have the query string in their name, email, phone, or organization.
**Validates: Requirements 10.2**

### Property 14: Export-Import Round Trip
*For any* set of clients, exporting to CSV and then importing should produce equivalent client records.
**Validates: Requirements 14.1, 14.2, 14.3**

### Property 15: Communication Follow-up Tracking
*For any* communication with follow_up_required=true, it should appear in the follow-up reminders list until marked complete.
**Validates: Requirements 20.5**

## Error Handling

### Error Categories

1. **Validation Errors** (400 Bad Request)
   - Invalid email format
   - Invalid phone format
   - Missing required fields
   - Field length violations
   - Invalid enum values

2. **Authorization Errors** (403 Forbidden)
   - Insufficient permissions
   - Cross-workspace access attempt
   - Missing required permission

3. **Not Found Errors** (404 Not Found)
   - Client not found
   - Gallery not found
   - Contact not found
   - Tag not found

4. **Conflict Errors** (409 Conflict)
   - Duplicate client detected
   - Primary contact already exists
   - Gallery already linked
   - Tag already assigned

5. **Business Logic Errors** (422 Unprocessable Entity)
   - Cannot delete last contact method
   - Cannot merge same client
   - Active proofing session prevents deletion
   - Asset not in linked gallery

### Error Response Format

```typescript
interface ErrorResponse {
  error: {
    code: string
    message: string
    details?: Record<string, any>
    field?: string
  }
}
```

### Error Handling Strategy

1. **Input Validation**: Validate all inputs at API layer before processing
2. **Database Constraints**: Rely on database constraints for data integrity
3. **Transaction Management**: Use database transactions for multi-step operations
4. **Graceful Degradation**: Return partial results when possible
5. **Detailed Logging**: Log all errors with context for debugging
6. **User-Friendly Messages**: Provide clear, actionable error messages

## Testing Strategy

### Unit Testing

Unit tests verify specific examples and edge cases:

1. **Client Service Tests**
   - Create client with valid data
   - Create client with missing required fields (should fail)
   - Update client with valid data
   - Delete client and verify cleanup
   - Search clients by name, email, phone
   - Filter clients by status and tags

2. **Contact Service Tests**
   - Add email contact with valid format
   - Add email contact with invalid format (should fail)
   - Set primary contact
   - Attempt to set multiple primary contacts (should fail)
   - Delete last contact method (should fail)

3. **Gallery Link Service Tests**
   - Link client to gallery
   - Link client to same gallery twice (should fail)
   - Unlink gallery and verify activity recorded
   - Get linked galleries for client

4. **Activity Service Tests**
   - Record activity and verify timeline order
   - Filter activities by type
   - Paginate activity timeline

5. **Duplicate Detection Tests**
   - Detect duplicate by email
   - Detect duplicate by phone
   - Merge clients and verify data preservation

### Property-Based Testing

Property tests verify universal properties across all inputs using a property-based testing library (e.g., fast-check for TypeScript, Hypothesis for Python):

1. **Workspace Isolation Property**
   - Generate random workspaces and clients
   - Verify no cross-workspace data leakage

2. **Primary Contact Uniqueness Property**
   - Generate random clients with multiple contacts
   - Verify at most one primary per type

3. **Activity Timeline Ordering Property**
   - Generate random activities with timestamps
   - Verify descending order

4. **Duplicate Detection Property**
   - Generate clients with overlapping emails/phones
   - Verify all duplicates detected

5. **Export-Import Round Trip Property**
   - Generate random clients
   - Export to CSV, import, verify equivalence

### Integration Testing

Integration tests verify end-to-end workflows:

1. **Client Creation and Gallery Linking**
   - Create client → Link to gallery → Verify activity recorded

2. **Proofing Workflow**
   - Client views gallery → Makes selections → Favorites photos → Verify activities

3. **Communication Tracking**
   - Log communication → Set follow-up → Verify reminder appears

4. **Smart List Evaluation**
   - Create smart list → Add matching client → Verify client in list

5. **Duplicate Detection and Merging**
   - Create duplicate → Detect → Merge → Verify data consolidated

### Test Configuration

- **Minimum 100 iterations per property test** (due to randomization)
- **Tag format**: `Feature: client-crm-module, Property {number}: {property_text}`
- **Coverage target**: 80% code coverage for services
- **Performance tests**: Verify P95 latency targets under load

## Performance Considerations

### Caching Strategy

1. **Client List Counts**: Redis cache, 5 minute TTL
2. **Client Stats**: Redis cache, 10 minute TTL
3. **Smart List Results**: Redis cache, 2 minute TTL
4. **Analytics Dashboard**: Redis cache, 15 minute TTL

### Database Optimization

1. **Indexes**: Composite indexes on (workspace_id, status, created_at) for filtered lists
2. **Full-Text Search**: GIN index on full_name for fast client search
3. **Pagination**: Cursor-based pagination for large result sets
4. **Query Optimization**: Use EXPLAIN ANALYZE to optimize slow queries

### Performance Targets

- Client list: < 300ms P95 for up to 10,000 clients
- Client search: < 200ms P95
- Client detail: < 250ms P95
- Activity timeline: < 200ms P95 for 1000 activities
- Smart list evaluation: < 400ms P95 for complex filters

## Security Considerations

### Multi-Tenant Isolation

- All queries MUST include `workspace_id` in WHERE clause
- Row-level security enforced at database level
- API middleware validates workspace access before processing

### Data Privacy

- Internal notes never exposed to clients
- Communication history is staff-only
- Client portal users can only view their own linked galleries
- Export operations are logged for compliance

### Input Validation

- Email format validation (RFC 5322)
- Phone format validation (E.164)
- URL format validation
- File upload size limits (5MB for avatars)
- SQL injection prevention through parameterized queries
- XSS prevention through input sanitization

## Dependencies

The Client CRM Module depends on the following modules (as defined in `docs/TechnicalSpecs/client_crm.json`):

1. **auth_rbac**: Authentication and authorization
2. **galleries_client_portal**: Gallery system integration
3. **proofing_selections_comments**: Selection and favorite tracking
4. **payments_billing_subscriptions**: Payment tracking
5. **notifications**: Communication delivery
6. **i18n_localization**: Language preferences
7. **storage_ingestion_byos**: Avatar storage
8. **media_processing**: Avatar image processing

## Implementation Notes

### Frontend Components

1. **ClientListPage**: Displays paginated list of clients with search and filters
2. **ClientDetailPage**: Shows complete client profile with tabs for contacts, addresses, galleries, activities, communications
3. **ClientCreateForm**: Form for creating new clients with validation
4. **ClientEditForm**: Form for editing client information
5. **ClientAvatarUpload**: Component for uploading and cropping avatars
6. **ClientContactList**: Displays and manages contact methods
7. **ClientAddressList**: Displays and manages addresses
8. **ClientTagManager**: Manages tag assignments
9. **ClientActivityTimeline**: Displays activity timeline
10. **ClientCommunicationHistory**: Displays communication history
11. **ClientGalleryLinks**: Displays linked galleries
12. **ClientAnalyticsDashboard**: Displays analytics and insights

### Backend Services

1. **ClientService**: Core client management
2. **ContactService**: Contact method management
3. **AddressService**: Address management
4. **TagService**: Tag management
5. **GalleryLinkService**: Gallery linking
6. **ActivityService**: Activity tracking
7. **CommunicationService**: Communication logging
8. **PreferencesService**: Client preferences
9. **SmartListService**: Smart list management
10. **AnalyticsService**: Analytics and reporting
11. **DuplicateDetectionService**: Duplicate detection and merging
12. **ImportExportService**: Import/export operations

### Database Migrations

Database migrations should be created in the following order:

1. `001_create_clients_table.sql`
2. `002_create_client_contacts_table.sql`
3. `003_create_client_addresses_table.sql`
4. `004_create_client_tags_table.sql`
5. `005_create_client_tag_assignments_table.sql`
6. `006_create_client_gallery_links_table.sql`
7. `007_create_client_activities_table.sql`
8. `008_create_client_communications_table.sql`
9. `009_create_client_preferences_table.sql`
10. `010_create_client_smart_lists_table.sql`

Each migration should include:
- Table creation with all fields
- Indexes for performance
- Foreign key constraints
- Check constraints
- Default values

## Conclusion

This design provides a comprehensive, production-ready architecture for the Client CRM Module. The modular design, clear interfaces, and comprehensive testing strategy ensure the system is maintainable, scalable, and reliable. The integration with other modules (galleries, payments, notifications) enables powerful workflows for photographers to manage their client relationships effectively.
