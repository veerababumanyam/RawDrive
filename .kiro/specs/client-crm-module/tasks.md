# Implementation Plan: Client CRM Module

## Overview

This implementation plan breaks down the Client CRM Module into discrete, actionable coding tasks. Each task builds on previous steps and includes references to specific requirements from the requirements document and technical specification.

**Technical Specification**: `docs/TechnicalSpecs/client_crm.json`
**Requirements**: `.kiro/specs/client-crm-module/requirements.md`
**Design**: `.kiro/specs/client-crm-module/design.md`

## Tasks

- [ ] 1. Database Schema and Migrations
  - Create database migrations for all 10 tables
  - Add indexes for performance optimization
  - Add foreign key constraints and check constraints
  - _Requirements: All requirements, Technical Spec: dataModel section_

- [ ] 1.1 Create clients table migration
  - Create `clients` table with all fields from technical spec
  - Add indexes: workspace_id, status, full_name, created_at, referred_by, portal_user
  - Add check constraint for status enum
  - _Requirements: 1, 1A, 6, 7, 8, 21_

- [ ] 1.2 Create client_contacts table migration
  - Create `client_contacts` table with all fields
  - Add indexes: workspace_client, type_value, primary
  - Add unique constraint on (workspace_id, client_id, contact_type, contact_subtype, value)
  - Add check constraint for primary contact uniqueness
  - _Requirements: 2, 3_

- [ ] 1.3 Create client_addresses table migration
  - Create `client_addresses` table with all fields
  - Add indexes: workspace_client, primary
  - _Requirements: 4_

- [ ] 1.4 Create client_tags and client_tag_assignments tables migration
  - Create `client_tags` table with workspace-scoped tags
  - Create `client_tag_assignments` table for many-to-many relationship
  - Add indexes and unique constraints
  - _Requirements: 5_

- [ ] 1.5 Create client_gallery_links table migration
  - Create `client_gallery_links` table
  - Add foreign key to galleries table
  - Add indexes and unique constraint
  - _Requirements: 9_

- [ ] 1.6 Create client_activities table migration
  - Create `client_activities` table with activity_type enum
  - Add indexes on workspace_client_time and workspace_type_time
  - _Requirements: 19_

- [ ] 1.7 Create client_communications table migration
  - Create `client_communications` table
  - Add indexes on workspace_client_time and follow_up
  - _Requirements: 20_

- [ ] 1.8 Create client_preferences table migration
  - Create `client_preferences` table
  - Add unique constraint on workspace_id + client_id
  - _Requirements: 24_

- [ ] 1.9 Create client_smart_lists table migration
  - Create `client_smart_lists` table with jsonb filter_criteria
  - Add GIN index on filter_criteria
  - _Requirements: 22_

- [ ] 1.10 Run migrations and verify schema
  - Execute all migrations in order
  - Verify all tables, indexes, and constraints created
  - Test rollback functionality

- [ ] 2. Backend: Core Client Service
  - Implement ClientService with CRUD operations
  - Add workspace scoping and validation
  - _Requirements: 1, 10, 12, 17, 18_

- [ ] 2.1 Implement ClientService.createClient
  - Validate required fields (full_name, first_name)
  - Generate client_id and set workspace_id
  - Set default values (status=active, created_at)
  - Return created client with computed fields
  - _Requirements: 1.1, 1.4, 12.6_

- [ ] 2.2 Implement ClientService.getClient
  - Query client by workspace_id and client_id
  - Include computed fields (initials, age, avatar_url, counts)
  - Return 404 if not found
  - _Requirements: 11.1, 11.2_

- [ ] 2.3 Implement ClientService.listClients
  - Support pagination (page, limit)
  - Support sorting (name, created_at)
  - Support filtering (status, tags)
  - Return clients with meta (total, page, limit)
  - _Requirements: 10.1, 10.3, 10.4, 10.5_

- [ ] 2.4 Implement ClientService.searchClients
  - Full-text search on full_name, email, phone, organization
  - Use GIN index for performance
  - Return matching clients
  - _Requirements: 10.2, 17.2_

- [ ] 2.5 Implement ClientService.updateClient
  - Validate updates
  - Update only provided fields
  - Update updated_at timestamp
  - Return updated client
  - _Requirements: 1.5, 12_

- [ ] 2.6 Implement ClientService.deleteClient
  - Check for active proofing sessions
  - Delete client and all related records (contacts, addresses, tags)
  - Unlink galleries but preserve gallery data
  - Log deletion event
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_


- [ ] 3. Backend: Contact Service
  - Implement ContactService for managing contact methods
  - Add validation for email, phone, website, social formats
  - _Requirements: 2, 3, 12_

- [ ] 3.1 Implement ContactService.addContact
  - Validate contact format based on type
  - Check for duplicates
  - Handle primary contact logic
  - _Requirements: 2.1, 2.2, 2.3, 12.1, 12.2, 12.3_

- [ ] 3.2 Implement ContactService.updateContact
  - Validate updates
  - Handle primary contact changes
  - _Requirements: 2.4_

- [ ] 3.3 Implement ContactService.deleteContact
  - Prevent deletion of last contact method
  - _Requirements: 2.7, 12.6_

- [ ] 3.4 Implement ContactService.setPrimaryContact
  - Ensure only one primary per type
  - _Requirements: 2.4_

- [ ] 4. Backend: Address Service
  - Implement AddressService for managing addresses
  - Add timezone mapping based on location
  - _Requirements: 4_

- [ ] 4.1 Implement AddressService.addAddress
  - Validate address fields
  - Map timezone from city/country
  - _Requirements: 4.1, 4.2, 4.4, 12.5_

- [ ] 4.2 Implement AddressService.updateAddress
  - Update address fields
  - Re-map timezone if location changed
  - _Requirements: 4.1, 4.2_

- [ ] 4.3 Implement AddressService.deleteAddress
  - Delete address record
  - _Requirements: 4_

- [ ] 5. Backend: Avatar Management
  - Implement avatar upload, crop, and gallery photo selection
  - Generate optimized thumbnails
  - _Requirements: 1A_

- [ ] 5.1 Implement ClientService.uploadAvatar
  - Validate file format (JPEG, PNG, WebP)
  - Validate file size (max 5MB)
  - Validate minimum dimensions (200x200)
  - Upload to storage service
  - Generate thumbnails (64x64, 128x128, 256x256)
  - Store avatar_asset_id and crop_data
  - _Requirements: 1A.1, 1A.2, 1A.3, 1A.4, 1A.8_

- [ ] 5.2 Implement ClientService.selectGalleryPhotoAsAvatar
  - Validate asset belongs to linked gallery
  - Apply crop data
  - Generate thumbnails
  - Store avatar_asset_id and crop_data
  - _Requirements: 1A.5, 1A.6_

- [ ] 5.3 Implement avatar display with initials fallback
  - Display avatar if avatar_asset_id exists
  - Display initials badge if no avatar
  - Use consistent color scheme for initials
  - _Requirements: 1A.7, 10.7_

- [ ] 6. Backend: Gallery Link Service
  - Implement GalleryLinkService for linking clients to galleries
  - Record activities when galleries are linked/unlinked
  - _Requirements: 9_

- [ ] 6.1 Implement GalleryLinkService.linkGallery
  - Validate gallery exists and belongs to workspace
  - Create client_gallery_links record
  - Record gallery_linked activity
  - _Requirements: 9.1, 9.5_

- [ ] 6.2 Implement GalleryLinkService.unlinkGallery
  - Delete client_gallery_links record
  - Preserve gallery data
  - Record activity
  - _Requirements: 9.1, 13.3_

- [ ] 6.3 Implement GalleryLinkService.getLinkedGalleries
  - Query linked galleries for client
  - Include gallery details
  - _Requirements: 9.2, 11.4_


- [ ] 7. Backend: Activity Service
  - Implement ActivityService for tracking client interactions
  - Support timeline queries with pagination
  - _Requirements: 19_

- [ ] 7.1 Implement ActivityService.recordActivity
  - Create client_activities record
  - Store activity_type, related_entity, metadata
  - _Requirements: 19.2, 19.3, 19.4, 19.5, 19.6, 19.7_

- [ ] 7.2 Implement ActivityService.getActivityTimeline
  - Query activities for client
  - Order by created_at DESC
  - Support pagination
  - Support filtering by activity_type
  - _Requirements: 19.1, 19.8_

- [ ] 8. Backend: Communication Service
  - Implement CommunicationService for logging communications
  - Support follow-up reminders
  - _Requirements: 20_

- [ ] 8.1 Implement CommunicationService.logCommunication
  - Create client_communications record
  - Record communication_sent activity
  - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5_

- [ ] 8.2 Implement CommunicationService.getCommunicationHistory
  - Query communications for client
  - Order by created_at DESC
  - Support pagination
  - _Requirements: 20.4, 20.6_

- [ ] 8.3 Implement CommunicationService.getFollowUpReminders
  - Query communications with follow_up_required=true
  - Filter by follow_up_date
  - _Requirements: 20.5_

- [ ] 9. Backend: Tag Service
  - Implement TagService for managing tags and assignments
  - Support tag creation and filtering
  - _Requirements: 5_

- [ ] 9.1 Implement TagService.createTag
  - Create client_tags record
  - Validate unique name per workspace
  - _Requirements: 5.2, 5.6_

- [ ] 9.2 Implement TagService.assignTags
  - Create client_tag_assignments records
  - Prevent duplicate assignments
  - _Requirements: 5.1_

- [ ] 9.3 Implement TagService.removeTags
  - Delete client_tag_assignments records
  - _Requirements: 5.1_

- [ ] 9.4 Implement TagService.filterByTags
  - Query clients with specific tags
  - _Requirements: 5.3_

- [ ] 10. Backend: Duplicate Detection Service
  - Implement duplicate detection and merging
  - _Requirements: 23_

- [ ] 10.1 Implement DuplicateDetectionService.detectDuplicates
  - Check for matching email or phone
  - Calculate confidence score
  - Return potential duplicates
  - _Requirements: 23.1, 23.2_

- [ ] 10.2 Implement DuplicateDetectionService.mergeClients
  - Consolidate all data from duplicate into primary
  - Update all references (gallery links, activities, communications)
  - Archive duplicate client
  - _Requirements: 23.3, 23.4, 23.5_

- [ ] 11. Backend: Smart List Service
  - Implement SmartListService for dynamic client segmentation
  - _Requirements: 22_

- [ ] 11.1 Implement SmartListService.createSmartList
  - Create client_smart_lists record
  - Store filter_criteria as JSONB
  - _Requirements: 22.1_

- [ ] 11.2 Implement SmartListService.evaluateSmartList
  - Parse filter_criteria
  - Build dynamic query
  - Return matching clients
  - _Requirements: 22.2, 22.3_

- [ ] 11.3 Implement pre-built smart lists
  - Recent Clients (last 30 days)
  - Inactive Clients (no activity in 90 days)
  - VIP Clients (tagged as VIP)
  - Clients with Pending Selections
  - _Requirements: 22.4_


- [ ] 12. Backend: Import/Export Service
  - Implement import/export for data migration
  - _Requirements: 14_

- [ ] 12.1 Implement ImportExportService.exportClients
  - Query clients with filters
  - Generate CSV or JSON file
  - Include all client data
  - Return download URL with expiry
  - _Requirements: 14.2_

- [ ] 12.2 Implement ImportExportService.importClients
  - Parse CSV file
  - Validate data
  - Skip duplicates based on email
  - Create client records
  - Return import summary (imported, skipped, errors)
  - _Requirements: 14.1, 14.3, 14.4, 14.5_

- [ ] 13. Backend: Analytics Service
  - Implement AnalyticsService for insights and reporting
  - _Requirements: 27_

- [ ] 13.1 Implement AnalyticsService.getClientAnalytics
  - Calculate total clients, active clients, growth rate
  - _Requirements: 27.1_

- [ ] 13.2 Implement AnalyticsService.getEngagementMetrics
  - Calculate gallery views, selection rates, response times
  - _Requirements: 27.3_

- [ ] 13.3 Implement AnalyticsService.getRevenuePerClient
  - Calculate lifetime value per client
  - _Requirements: 27.4_

- [ ] 13.4 Implement AnalyticsService.getReferralAnalytics
  - Calculate referral sources and rates
  - _Requirements: 27.2_

- [ ] 14. Backend: API Routes and Controllers
  - Implement all 21 API endpoints
  - Add authentication and authorization middleware
  - _Requirements: All, Technical Spec: apis section_

- [ ] 14.1 Implement client CRUD endpoints
  - GET /api/v1/workspaces/{workspace_id}/clients
  - POST /api/v1/workspaces/{workspace_id}/clients
  - GET /api/v1/workspaces/{workspace_id}/clients/{client_id}
  - PATCH /api/v1/workspaces/{workspace_id}/clients/{client_id}
  - DELETE /api/v1/workspaces/{workspace_id}/clients/{client_id}
  - _Requirements: 1, 10, 11, 13_

- [ ] 14.2 Implement avatar management endpoints
  - POST /api/v1/workspaces/{workspace_id}/clients/{client_id}/avatar
  - POST /api/v1/workspaces/{workspace_id}/clients/{client_id}/avatar/from-gallery
  - _Requirements: 1A_

- [ ] 14.3 Implement contact management endpoints
  - POST /api/v1/workspaces/{workspace_id}/clients/{client_id}/contacts
  - PATCH /api/v1/workspaces/{workspace_id}/clients/{client_id}/contacts/{contact_id}
  - DELETE /api/v1/workspaces/{workspace_id}/clients/{client_id}/contacts/{contact_id}
  - _Requirements: 2_

- [ ] 14.4 Implement gallery linking endpoints
  - POST /api/v1/workspaces/{workspace_id}/clients/{client_id}/galleries
  - DELETE /api/v1/workspaces/{workspace_id}/clients/{client_id}/galleries/{gallery_id}
  - _Requirements: 9_

- [ ] 14.5 Implement activity and communication endpoints
  - GET /api/v1/workspaces/{workspace_id}/clients/{client_id}/activities
  - POST /api/v1/workspaces/{workspace_id}/clients/{client_id}/communications
  - GET /api/v1/workspaces/{workspace_id}/clients/{client_id}/communications
  - _Requirements: 19, 20_

- [ ] 14.6 Implement tag management endpoints
  - POST /api/v1/workspaces/{workspace_id}/clients/{client_id}/tags
  - DELETE /api/v1/workspaces/{workspace_id}/clients/{client_id}/tags/{tag_id}
  - _Requirements: 5_

- [ ] 14.7 Implement import/export endpoints
  - GET /api/v1/workspaces/{workspace_id}/clients/export
  - POST /api/v1/workspaces/{workspace_id}/clients/import
  - _Requirements: 14_

- [ ] 14.8 Implement duplicate management endpoints
  - POST /api/v1/workspaces/{workspace_id}/clients/detect-duplicates
  - POST /api/v1/workspaces/{workspace_id}/clients/merge
  - _Requirements: 23_

- [ ] 14.9 Implement analytics endpoint
  - GET /api/v1/workspaces/{workspace_id}/clients/analytics
  - _Requirements: 27_

- [ ] 15. Checkpoint - Backend Complete
  - Ensure all backend services and APIs are implemented
  - Run integration tests
  - Verify all endpoints return correct responses
  - Ask user if questions arise


- [ ] 16. Frontend: Client Service and Types
  - Create TypeScript types and API client
  - _Requirements: All_

- [ ] 16.1 Create client types
  - Define Client, ClientContact, ClientAddress, ClientTag interfaces
  - Define ClientActivity, ClientCommunication interfaces
  - Define API request/response types
  - _Technical Spec: dataModel section_

- [ ] 16.2 Create clientService API client
  - Implement all 21 API methods
  - Add error handling and type safety
  - _Technical Spec: apis section_

- [ ] 17. Frontend: Client List Page
  - Implement client list with search, filter, and pagination
  - _Requirements: 10, 15_

- [ ] 17.1 Create ClientListPage component
  - Display clients in grid or list view
  - Show avatar (or initials), name, primary contact, tags
  - Support pagination
  - _Requirements: 10.1, 10.6, 10.7_

- [ ] 17.2 Add search functionality
  - Search by name, email, phone, organization
  - Debounce search input
  - _Requirements: 10.2, 17.2_

- [ ] 17.3 Add filter controls
  - Filter by status (active/inactive)
  - Filter by tags
  - Filter by date range
  - _Requirements: 10.3_

- [ ] 17.4 Add sort controls
  - Sort by name, creation date, last modified
  - _Requirements: 10.4_

- [ ] 17.5 Display client count and stats
  - Show total clients
  - Show active/inactive counts
  - _Requirements: 10.5_

- [ ] 18. Frontend: Client Detail Page
  - Implement comprehensive client profile view
  - _Requirements: 11_

- [ ] 18.1 Create ClientDetailPage component
  - Display client avatar with edit button
  - Show all client information
  - Organize into sections (Identity, Contact, Social, Address, Dates, Tags, Notes, Galleries)
  - _Requirements: 11.1, 11.2, 11.6_

- [ ] 18.2 Add quick action buttons
  - Email button (opens mailto link)
  - Phone button (opens tel link)
  - WhatsApp button (opens WhatsApp chat)
  - Social media buttons (open profiles)
  - _Requirements: 11.3_

- [ ] 18.3 Display linked galleries
  - Show gallery thumbnails, names, dates
  - Add option to select photo as avatar
  - _Requirements: 11.4_

- [ ] 18.4 Add edit and delete actions
  - Edit button opens edit form
  - Delete button with confirmation
  - _Requirements: 11.5_

- [ ] 19. Frontend: Client Create/Edit Forms
  - Implement forms for creating and editing clients
  - _Requirements: 1, 12_

- [ ] 19.1 Create ClientCreateForm component
  - Form fields: full_name, first_name, last_name, nickname
  - Form fields: job_title, organization
  - Form fields: language, timezone, date_of_birth, anniversary_date
  - Form fields: internal_notes, referred_by_client_id
  - Validation for required fields
  - _Requirements: 1.1, 1.2, 1.3, 12.6_

- [ ] 19.2 Create ClientEditForm component
  - Pre-populate with existing data
  - Allow editing all fields
  - Validation
  - _Requirements: 1.5, 12_

- [ ] 20. Frontend: Avatar Management
  - Implement avatar upload and crop functionality
  - _Requirements: 1A_

- [ ] 20.1 Create AvatarUpload component
  - File input for image upload
  - Validate format (JPEG, PNG, WebP)
  - Validate size (max 5MB)
  - Validate dimensions (min 200x200)
  - _Requirements: 1A.1, 1A.8_

- [ ] 20.2 Create AvatarCropTool component
  - Crop interface with aspect ratio lock (1:1)
  - Zoom, pan, rotation controls
  - Preview cropped result
  - _Requirements: 1A.2, 1A.3_

- [ ] 20.3 Implement gallery photo selection
  - Display linked gallery photos
  - Allow selecting photo as avatar
  - Open crop tool with selected photo
  - _Requirements: 1A.5, 1A.6_

- [ ] 20.4 Display avatar with initials fallback
  - Show avatar if exists
  - Show circular badge with initials if no avatar
  - Use consistent color scheme
  - _Requirements: 1A.7, 10.7_


- [ ] 21. Frontend: Contact Management
  - Implement contact list and forms
  - _Requirements: 2, 3_

- [ ] 21.1 Create ClientContactList component
  - Display all contacts grouped by type
  - Show primary contact indicator
  - Add/edit/delete buttons
  - _Requirements: 2.5_

- [ ] 21.2 Create ContactForm component
  - Form fields: contact_type, contact_subtype, value
  - Validation based on type (email, phone, URL, social handle)
  - Primary contact checkbox
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 12.1, 12.2, 12.3_

- [ ] 21.3 Add social media quick links
  - Generate platform-specific URLs
  - Display social media icons
  - _Requirements: 3.2, 3.3, 3.5_

- [ ] 22. Frontend: Address Management
  - Implement address list and forms
  - _Requirements: 4_

- [ ] 22.1 Create ClientAddressList component
  - Display all addresses
  - Show primary address indicator
  - Add/edit/delete buttons
  - _Requirements: 4.3_

- [ ] 22.2 Create AddressForm component
  - Form fields: address_type, address_line1, address_line2, city, state, country, postal_code
  - Timezone auto-mapping
  - Primary address checkbox
  - _Requirements: 4.1, 4.2, 4.4, 12.5_

- [ ] 23. Frontend: Tag Management
  - Implement tag assignment and filtering
  - _Requirements: 5_

- [ ] 23.1 Create ClientTagManager component
  - Display assigned tags
  - Add/remove tags
  - Create new tags
  - _Requirements: 5.1, 5.2, 5.6_

- [ ] 23.2 Add tag filtering to client list
  - Filter clients by selected tags
  - _Requirements: 5.3_

- [ ] 24. Frontend: Activity Timeline
  - Implement activity timeline display
  - _Requirements: 19_

- [ ] 24.1 Create ClientActivityTimeline component
  - Display activities in reverse chronological order
  - Show activity type, description, timestamp
  - Show related entity (gallery, asset, payment)
  - Support pagination
  - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.8_

- [ ] 24.2 Add manual note entry
  - Form to add manual notes to timeline
  - _Requirements: 19.7_

- [ ] 25. Frontend: Communication History
  - Implement communication logging and history
  - _Requirements: 20_

- [ ] 25.1 Create CommunicationHistoryList component
  - Display communications in chronological order
  - Show type, direction, subject, notes, timestamp
  - Show follow-up indicator
  - _Requirements: 20.4, 20.6_

- [ ] 25.2 Create CommunicationForm component
  - Form fields: communication_type, direction, subject, notes, duration_minutes
  - Follow-up checkbox and date picker
  - _Requirements: 20.1, 20.2, 20.3, 20.5_

- [ ] 26. Frontend: Gallery Linking
  - Implement gallery linking interface
  - _Requirements: 9_

- [ ] 26.1 Create GalleryLinkManager component
  - Display linked galleries
  - Add gallery link button
  - Remove gallery link button
  - _Requirements: 9.1, 9.2_

- [ ] 26.2 Create GalleryLinkDialog component
  - Select gallery from list
  - Select role (primary, secondary, guest)
  - _Requirements: 9.1, 9.5, 9.6_

- [ ] 27. Frontend: Smart Lists
  - Implement smart list creation and evaluation
  - _Requirements: 22_

- [ ] 27.1 Create SmartListManager component
  - Display all smart lists
  - Create/edit/delete smart lists
  - _Requirements: 22.1_

- [ ] 27.2 Create SmartListFilterBuilder component
  - Build filter criteria (status, tags, date range, gallery activity)
  - Preview matching clients
  - _Requirements: 22.1, 22.2_

- [ ] 27.3 Display pre-built smart lists
  - Recent Clients
  - Inactive Clients
  - VIP Clients
  - Clients with Pending Selections
  - _Requirements: 22.4_

- [ ] 27.4 Add bulk operations on smart lists
  - Select all clients in list
  - Apply bulk actions (add tags, change status, export)
  - _Requirements: 22.3, 26_


- [ ] 28. Frontend: Duplicate Detection and Merging
  - Implement duplicate detection UI
  - _Requirements: 23_

- [ ] 28.1 Create DuplicateDetectionDialog component
  - Show potential duplicates when creating client
  - Display confidence score
  - Allow marking as "not duplicate"
  - _Requirements: 23.1, 23.2, 23.5_

- [ ] 28.2 Create ClientMergeDialog component
  - Select primary client
  - Preview merge result
  - Confirm merge
  - _Requirements: 23.3, 23.4_

- [ ] 29. Frontend: Import/Export
  - Implement import/export UI
  - _Requirements: 14_

- [ ] 29.1 Create ClientExportDialog component
  - Select format (CSV, JSON)
  - Select filters (status, tags)
  - Download file
  - _Requirements: 14.2_

- [ ] 29.2 Create ClientImportDialog component
  - Upload CSV file
  - Show validation errors
  - Display import summary
  - _Requirements: 14.1, 14.3, 14.4, 14.5_

- [ ] 30. Frontend: Analytics Dashboard
  - Implement analytics and insights
  - _Requirements: 27_

- [ ] 30.1 Create ClientAnalyticsDashboard component
  - Display total clients, active clients, growth trends
  - Display client acquisition sources
  - Display engagement metrics
  - Display revenue per client
  - Display geographic distribution
  - _Requirements: 27.1, 27.2, 27.3, 27.4, 27.5_

- [ ] 30.2 Add exportable reports
  - Export analytics data
  - _Requirements: 27.6_

- [ ] 31. Frontend: Navigation and Dashboard Integration
  - Add Clients to sidebar and dashboard
  - _Requirements: 15_

- [ ] 31.1 Add Clients menu item to sidebar
  - Add icon and label
  - Highlight when active
  - _Requirements: 15.1, 15.2, 15.3_

- [ ] 31.2 Add client count to dashboard
  - Display total clients
  - Display recent clients
  - Quick link to client list
  - _Requirements: 15.4, 15.5_

- [ ] 32. Frontend: Mobile Responsiveness
  - Ensure all components work on mobile
  - _Requirements: 16_

- [ ] 32.1 Make client list mobile-responsive
  - Use card layout on mobile
  - _Requirements: 16.1, 16.2_

- [ ] 32.2 Make client detail mobile-responsive
  - Stack sections vertically
  - _Requirements: 16.3_

- [ ] 32.3 Make forms mobile-responsive
  - Optimize form inputs for mobile
  - _Requirements: 16.4_

- [ ] 32.4 Add touch gesture support
  - Swipe gestures for navigation
  - _Requirements: 16.5_

- [ ] 33. Checkpoint - Frontend Complete
  - Ensure all frontend components are implemented
  - Test all user flows
  - Verify mobile responsiveness
  - Ask user if questions arise

- [ ] 34. Testing: Unit Tests
  - Write unit tests for all services
  - _Design: Testing Strategy section_

- [ ] 34.1 Write ClientService unit tests
  - Test create, get, list, search, update, delete
  - Test validation and error handling
  - _Design: Property 1, 2, 12_

- [ ] 34.2 Write ContactService unit tests
  - Test add, update, delete, setPrimary
  - Test validation for email, phone, URL formats
  - _Design: Property 3, 11_

- [ ] 34.3 Write GalleryLinkService unit tests
  - Test link, unlink, getLinkedGalleries
  - Test uniqueness constraint
  - _Design: Property 4_

- [ ] 34.4 Write ActivityService unit tests
  - Test recordActivity, getActivityTimeline
  - Test timeline ordering
  - _Design: Property 5_

- [ ] 34.5 Write DuplicateDetectionService unit tests
  - Test detectDuplicates, mergeClients
  - Test data preservation during merge
  - _Design: Property 7, 8_


- [ ]* 35. Testing: Property-Based Tests
  - Write property tests for universal correctness properties
  - Run with minimum 100 iterations per test
  - _Design: Correctness Properties section_

- [ ]* 35.1 Write property test for workspace isolation
  - **Property 1: Workspace Isolation**
  - **Validates: Requirements 18.1, 18.2**
  - Generate random workspaces and clients
  - Verify no cross-workspace data leakage

- [ ]* 35.2 Write property test for client creation uniqueness
  - **Property 2: Client Creation Uniqueness**
  - **Validates: Requirements 1.4**
  - Generate random client creation requests
  - Verify unique client_id generation

- [ ]* 35.3 Write property test for primary contact uniqueness
  - **Property 3: Primary Contact Uniqueness**
  - **Validates: Requirements 2.4**
  - Generate random clients with multiple contacts
  - Verify at most one primary per type

- [ ]* 35.4 Write property test for gallery link uniqueness
  - **Property 4: Gallery Link Uniqueness**
  - **Validates: Requirements 9.1, 9.5**
  - Generate random client-gallery pairs
  - Verify at most one link per pair

- [ ]* 35.5 Write property test for activity timeline ordering
  - **Property 5: Activity Timeline Ordering**
  - **Validates: Requirements 19.8**
  - Generate random activities with timestamps
  - Verify descending order

- [ ]* 35.6 Write property test for tag assignment uniqueness
  - **Property 6: Tag Assignment Uniqueness**
  - **Validates: Requirements 5.1**
  - Generate random client-tag pairs
  - Verify at most one assignment per pair

- [ ]* 35.7 Write property test for duplicate detection consistency
  - **Property 7: Duplicate Detection Consistency**
  - **Validates: Requirements 23.1, 23.2**
  - Generate clients with overlapping emails/phones
  - Verify all duplicates detected

- [ ]* 35.8 Write property test for merge data preservation
  - **Property 8: Merge Data Preservation**
  - **Validates: Requirements 23.4**
  - Generate two clients with data
  - Merge and verify all data preserved

- [ ]* 35.9 Write property test for smart list dynamic updates
  - **Property 9: Smart List Dynamic Updates**
  - **Validates: Requirements 22.2**
  - Generate smart list with criteria
  - Add matching client and verify inclusion

- [ ]* 35.10 Write property test for avatar crop data persistence
  - **Property 10: Avatar Crop Data Persistence**
  - **Validates: Requirements 1A.3, 1A.4**
  - Generate random crop data
  - Upload avatar and verify crop applied

- [ ]* 35.11 Write property test for contact validation
  - **Property 11: Contact Validation**
  - **Validates: Requirements 12.1, 12.2**
  - Generate random email and phone values
  - Verify format validation

- [ ]* 35.12 Write property test for client deletion cleanup
  - **Property 12: Client Deletion Cleanup**
  - **Validates: Requirements 13.2, 13.3**
  - Create client with related data
  - Delete and verify cleanup

- [ ]* 35.13 Write property test for search result relevance
  - **Property 13: Search Result Relevance**
  - **Validates: Requirements 10.2**
  - Generate random search queries
  - Verify all results match query

- [ ]* 35.14 Write property test for export-import round trip
  - **Property 14: Export-Import Round Trip**
  - **Validates: Requirements 14.1, 14.2, 14.3**
  - Generate random clients
  - Export, import, verify equivalence

- [ ]* 35.15 Write property test for communication follow-up tracking
  - **Property 15: Communication Follow-up Tracking**
  - **Validates: Requirements 20.5**
  - Generate communications with follow-ups
  - Verify reminders appear until marked complete

- [ ] 36. Testing: Integration Tests
  - Write integration tests for end-to-end workflows
  - _Design: Testing Strategy section_

- [ ]* 36.1 Write integration test for client creation and gallery linking
  - Create client → Link to gallery → Verify activity recorded

- [ ]* 36.2 Write integration test for proofing workflow
  - Client views gallery → Makes selections → Favorites photos → Verify activities

- [ ]* 36.3 Write integration test for communication tracking
  - Log communication → Set follow-up → Verify reminder appears

- [ ]* 36.4 Write integration test for smart list evaluation
  - Create smart list → Add matching client → Verify client in list

- [ ]* 36.5 Write integration test for duplicate detection and merging
  - Create duplicate → Detect → Merge → Verify data consolidated

- [ ] 37. Final Checkpoint - All Tests Pass
  - Ensure all unit tests pass
  - Ensure all property tests pass (100+ iterations each)
  - Ensure all integration tests pass
  - Verify 80% code coverage
  - Ask user if questions arise

- [ ] 38. Documentation and Deployment
  - Update documentation
  - Prepare for deployment

- [ ] 38.1 Update API documentation
  - Document all 21 endpoints
  - Add examples and error codes

- [ ] 38.2 Update user documentation
  - Create user guide for client management
  - Add screenshots and workflows

- [ ] 38.3 Create deployment checklist
  - Database migrations
  - Environment variables
  - Feature flags
  - Monitoring and alerts

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (minimum 100 iterations)
- Unit tests validate specific examples and edge cases
- Integration tests validate end-to-end workflows
- All tasks reference the technical specification (`docs/TechnicalSpecs/client_crm.json`) for implementation details
