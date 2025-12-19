# Requirements Document

## Introduction

This document specifies the requirements for RawDrive's Gallery CRUD (Create, Read, Update, Delete) feature within the workspace. Galleries are the core delivery surface where photographers create, organize, and curate photo collections before sharing them with clients via the Client Portal.

The gallery management interface enables staff users to:
- Create and manage galleries with custom titles and settings
- Organize photos into sub-galleries (e.g., "Ceremony", "Reception")
- Upload photos via drag-drop with R2 signed URLs and automatic thumbnail generation
- View photos in a masonry grid with lightbox preview
- Manage favorites and selections from clients
- Configure gallery settings (branding, download policies, access controls)

**Scope:**
- Gallery list view (workspace dashboard)
- Gallery creation flow
- Gallery detail/edit view with photo management
- Sub-gallery management (tabs navigation)
- Photo upload with drag-drop and progress
- Masonry grid display with lightbox
- Favorites and selections management
- Gallery settings configuration

**Out of Scope:**
- Client Portal (separate spec)
- Share Links management (separate spec)
- Album Designer (separate spec)
- AI-powered features (separate spec)

## Glossary

- **Gallery**: A collection of photos/videos created by staff for client delivery, always workspace-scoped
- **Sub-Gallery**: A subdivision within a gallery for organizing content (e.g., "Ceremony", "Reception")
- **Asset**: A photo or video file stored in the system
- **Gallery Asset**: The association between an asset and a gallery, including sort order and visibility
- **Masonry Grid**: A responsive grid layout where items have varying heights but consistent widths
- **Lightbox**: A modal overlay for viewing photos at full size with navigation
- **Favorites**: Photos marked by clients as liked (heart icon)
- **Selections/Picks**: Photos selected by clients for final delivery (checkmark icon)
- **Draft**: Gallery status where staff can edit but clients cannot access
- **Published**: Gallery status where clients can access via Share Links
- **Archived**: Gallery status that is read-only for staff and blocked for clients

## Requirements

### Requirement 1: Gallery List View

**User Story:** As a staff user, I want to see all my galleries in a clear list, so that I can quickly find and manage them.

#### Acceptance Criteria

1. WHEN a staff user navigates to the Galleries page THEN the System SHALL display a list of all galleries in the workspace with title, cover image, status badge, photo count, and creation date
2. WHEN displaying galleries THEN the System SHALL sort galleries by creation date (newest first) with options to sort by title or status
3. WHEN a staff user clicks "Create Gallery" THEN the System SHALL open the gallery creation flow
4. WHEN a staff user clicks on a gallery card THEN the System SHALL navigate to the gallery detail view
5. WHEN displaying gallery status THEN the System SHALL show distinct visual badges for draft (gray), published (green), and archived (amber) states
6. WHEN the gallery list is empty THEN the System SHALL display an empty state with illustration and "Create your first gallery" CTA

### Requirement 2: Gallery Creation

**User Story:** As a staff user, I want to create a new gallery with a title and optional description, so that I can start organizing photos for my client.

#### Acceptance Criteria

1. WHEN a staff user initiates gallery creation THEN the System SHALL display a form with title (required), description (optional), and client name fields
2. WHEN a staff user submits the gallery creation form THEN the System SHALL validate that title is non-empty and create the gallery in draft status
3. WHEN gallery creation succeeds THEN the System SHALL navigate to the gallery detail view for immediate photo upload
4. WHEN gallery creation fails THEN the System SHALL display inline error messages without losing form data
5. WHEN creating a gallery THEN the System SHALL associate the gallery with the current workspace_id and created_by_user_id

### Requirement 3: Gallery Detail View Header

**User Story:** As a staff user, I want to see gallery information and quick actions at the top of the gallery view, so that I can understand context and take common actions.

#### Acceptance Criteria

1. WHEN viewing a gallery THEN the System SHALL display a header with gallery title, client name, creation date, and status badge
2. WHEN viewing a gallery THEN the System SHALL display a toolbar with actions: "View as Client", "Find People", "AI Story", "Share", Settings (gear icon), and "Upload"
3. WHEN viewing a gallery THEN the System SHALL display statistics showing total items count and favorites count
4. WHEN a staff user clicks the gallery title THEN the System SHALL allow inline editing of the title
5. WHEN a staff user clicks "Back to All Galleries" THEN the System SHALL navigate to the gallery list view

### Requirement 4: Sub-Gallery Navigation

**User Story:** As a staff user, I want to organize photos into sub-galleries displayed as tabs, so that I can structure content logically (e.g., Ceremony, Reception).

#### Acceptance Criteria

1. WHEN viewing a gallery THEN the System SHALL display sub-galleries as horizontal tabs below the header
2. WHEN a staff user clicks "+ New Sub-Gallery" THEN the System SHALL create a new sub-gallery with an editable name
3. WHEN a staff user clicks a sub-gallery tab THEN the System SHALL filter the photo grid to show only photos in that sub-gallery
4. WHEN displaying sub-galleries THEN the System SHALL show "Root Gallery" as the first tab containing unassigned photos
5. WHEN a staff user drags a sub-gallery tab THEN the System SHALL allow reordering of sub-galleries
6. WHEN a staff user right-clicks a sub-gallery tab THEN the System SHALL show a context menu with rename, delete, and visibility options

### Requirement 5: World-Class Photo Upload with Metadata, Optimization, and Security

**User Story:** As a staff user, I want a world-class upload experience inspired by Dropbox, Google Photos, and YouTube, with automatic metadata extraction, image optimization, resumable uploads, and enterprise-grade security, so that the gallery loads fast, I have rich metadata for search, uploads never fail even on poor connections, and customer data is protected with encryption and access controls.

#### Acceptance Criteria

##### Core Upload Functionality
1. WHEN a staff user clicks "Upload" button in gallery header or drags files onto the gallery THEN the System SHALL accept image files (JPEG, PNG, WebP, HEIC, RAW formats: CR2, CR3, NEF, ARW, RAF, ORF, RW2, DNG) and video files (MP4, MOV, AVI)
2. WHEN files are selected THEN the System SHALL organize uploads by gallery_id and sub_gallery_id in R2 storage path: `galleries/{gallery_id}/sub_galleries/{sub_gallery_id}/` or `galleries/{gallery_id}/root/` for unassigned photos
3. WHEN multiple files are uploaded THEN the System SHALL support bulk upload of up to 1000 files per batch with drag-drop or folder selection
4. WHEN uploading THEN the System SHALL process uploads in parallel (max 3 concurrent for standard connections, adaptive for slow connections) with a queue for remaining files

##### Comprehensive Metadata Extraction
5. WHEN uploading THEN the System SHALL extract and store comprehensive metadata organized into categories:
   - **File Info (MANDATORY)**: filename, file_size, mime_type, sha256_checksum, created_at, modified_at
   - **Image Dimensions (MANDATORY)**: width, height, orientation, aspect_ratio
   - **Camera Info (OPTIONAL)**: make, model, serial_number, firmware_version
   - **Lens Info (OPTIONAL)**: lens_make, lens_model, lens_serial, focal_length, focal_length_35mm_equiv, max_aperture
   - **Exposure Settings (OPTIONAL)**: aperture (f-stop), shutter_speed, iso, exposure_compensation, exposure_mode, metering_mode, flash_fired, flash_mode
   - **Focus Info (OPTIONAL)**: focus_mode, focus_distance, depth_of_field, af_point_used
   - **Color Info (OPTIONAL)**: white_balance, color_space, color_profile, color_temperature
   - **Date/Time (OPTIONAL)**: date_taken, date_digitized, timezone, subsec_time
   - **Location (OPTIONAL - Privacy Controlled)**: latitude, longitude, altitude, gps_accuracy, location_name, country, city
   - **Copyright (OPTIONAL)**: artist, copyright, credit, source, instructions
   - **Technical (OPTIONAL)**: software, compression, bits_per_sample, samples_per_pixel
6. WHEN extracting metadata from Canon cameras THEN the System SHALL extract Canon-specific fields: picture_style, highlight_tone_priority, auto_lighting_optimizer, lens_id, af_area_mode, dust_delete_data
7. WHEN extracting metadata from Sony cameras THEN the System SHALL extract Sony-specific fields: creative_style, dynamic_range_optimizer, focus_area, face_detection_info, real_time_tracking
8. WHEN extracting metadata from Nikon cameras THEN the System SHALL extract Nikon-specific fields: picture_control, active_d_lighting, vr_mode, focus_tracking, high_iso_noise_reduction
9. WHEN extracting metadata from Fujifilm cameras THEN the System SHALL extract Fuji-specific fields: film_simulation, grain_effect, color_chrome_effect, dynamic_range, highlight_tone, shadow_tone
10. WHEN extracting metadata from other cameras (Panasonic, Olympus, Leica, Hasselblad, Phase One) THEN the System SHALL extract available EXIF/XMP/IPTC fields

##### Client Tagging During Upload
11. WHEN uploading photos THEN the System SHALL allow the photographer to tag photos with existing clients from the workspace CRM
12. WHEN uploading photos THEN the System SHALL allow the photographer to create a new client inline by entering name and optional email
13. WHEN bulk uploading THEN the System SHALL allow applying the same client tag to all photos in the batch or individual tagging
14. WHEN client tags are applied THEN the System SHALL store the association in gallery_asset_clients junction table for filtering and delivery

##### Image Processing and Variants
15. WHEN uploading THEN the System SHALL generate and store three encrypted image variants in R2:
    - **Original**: Full quality, original format (or converted from RAW to high-quality JPEG/TIFF)
    - **WebP Preview**: 2048px max dimension, quality 85, for lightbox viewing
    - **WebP Thumbnail**: 512px max dimension, quality 80, for grid display
16. WHEN processing RAW files THEN the System SHALL use embedded JPEG preview for immediate display while generating full-quality conversion in background

##### User-Friendly Upload Progress (Inspired by Dropbox, Google Photos, YouTube)
17. WHEN uploading THEN the System SHALL display a comprehensive upload panel showing:
    - Overall progress (X of Y files, percentage, estimated time remaining)
    - Per-file progress with stages: Queued → Uploading (%) → Processing → Generating Thumbnail → Generating Preview → Encrypting → Complete
    - Local thumbnail preview generated client-side before upload
    - Upload speed indicator (MB/s) with connection quality indicator (Excellent/Good/Slow)
    - Pause/Resume all button
    - Cancel individual file or cancel all button
18. WHEN upload completes for a file THEN the System SHALL immediately show the thumbnail in the gallery grid without requiring page refresh (real-time update via WebSocket)
19. WHEN all uploads complete THEN the System SHALL show success notification with summary (X photos uploaded, Y failed, Z skipped as duplicates)

##### Low-Bandwidth Optimization
20. WHEN uploading on slow connections (detected < 1 Mbps) THEN the System SHALL:
    - Reduce concurrent uploads to 1
    - Enable chunked upload with smaller chunk sizes (256KB instead of 5MB)
    - Show "Slow connection detected" indicator with estimated time
    - Prioritize thumbnail generation for immediate feedback
21. WHEN network connection is interrupted THEN the System SHALL:
    - Pause affected uploads automatically
    - Show "Connection lost - will resume when online" message
    - Resume uploads automatically when connection is restored
    - Use TUS protocol for resumable uploads to continue from last successful chunk
22. WHEN uploading large files (>50MB) THEN the System SHALL use chunked multipart upload with resume capability

##### Background Upload and Browser Protection
23. WHEN uploads are in progress and user attempts to close browser/tab THEN the System SHALL show warning dialog: "X uploads in progress. Are you sure you want to leave? Uploads will be lost."
24. WHEN uploads are in progress THEN the System SHALL continue uploading in background while user navigates to other pages within the application
25. WHEN browser is minimized or tab is inactive THEN the System SHALL continue uploads using Web Workers and show browser notification when complete
26. WHEN user returns to upload page THEN the System SHALL restore upload queue state and show current progress

##### Duplicate Detection
27. WHEN uploading THEN the System SHALL detect duplicates by SHA256 checksum and offer options: Skip, Replace, or Keep Both
28. WHEN duplicate is detected THEN the System SHALL show side-by-side comparison with existing photo metadata

##### Gallery Display Integration
29. WHEN a staff user views the gallery THEN the System SHALL display WebP thumbnail images in the grid for fast loading
30. WHEN a staff user clicks a photo in the grid THEN the System SHALL display the WebP preview image in the lightbox
31. WHEN a staff user downloads a photo THEN the System SHALL provide options to download either the WebP preview or the original image based on gallery download_policy

##### Security (Encryption and Access Control)
32. WHEN files are uploaded to R2 THEN the System SHALL encrypt all files at rest using AES-256-GCM encryption with workspace-specific encryption keys
33. WHEN files are transmitted THEN the System SHALL use TLS 1.3 for all data in transit and enforce HTTPS-only connections
34. WHEN a user requests a photo THEN the System SHALL generate time-limited signed URLs (1-hour TTL) that expire automatically
35. WHEN a user accesses a photo THEN the System SHALL verify workspace_id and user permissions before serving the file
36. WHEN a user downloads a photo THEN the System SHALL log the download action with timestamp, user_id, asset_id, and IP address for audit compliance

##### Data Management and Compliance
37. WHEN a gallery is deleted THEN the System SHALL securely delete all associated assets using cryptographic erasure
38. WHEN a workspace is deleted THEN the System SHALL securely delete all workspace data within 30 days per GDPR
39. WHEN sensitive EXIF data (GPS) is extracted THEN the System SHALL respect workspace privacy settings to strip or redact GPS data
40. WHEN files are stored THEN the System SHALL maintain immutable audit logs for SOC2 compliance
41. WHEN encryption keys are rotated THEN the System SHALL re-encrypt all existing assets without data loss

##### World-Class Upload UX (Inspired by Dropbox, Google Photos, YouTube)
42. WHEN the upload panel is displayed THEN the System SHALL show a minimizable floating panel (like YouTube) that persists across page navigation within the workspace
43. WHEN the upload panel is minimized THEN the System SHALL show a compact progress indicator in the corner with overall percentage and file count
44. WHEN hovering over a file in the upload queue THEN the System SHALL show detailed status including current stage, bytes transferred, and estimated time for that file
45. WHEN an upload fails THEN the System SHALL show a clear error message with retry button and option to skip, without blocking other uploads
46. WHEN retrying a failed upload THEN the System SHALL resume from the last successful chunk (TUS protocol) rather than restarting from the beginning
47. WHEN the upload queue has errors THEN the System SHALL group failed uploads at the bottom with a "Retry All Failed" button
48. WHEN uploads are paused THEN the System SHALL persist the queue state to localStorage so it survives page refresh
49. WHEN the user returns to a page with persisted upload state THEN the System SHALL offer to resume pending uploads with a "Resume X uploads" prompt
50. WHEN drag-dropping a folder THEN the System SHALL recursively scan and queue all supported files while preserving folder structure as sub-galleries (optional)
51. WHEN folder structure is detected THEN the System SHALL offer options: "Create sub-galleries from folders" or "Upload all to current location"
52. WHEN uploading THEN the System SHALL show a real-time upload speed graph (like YouTube) showing bandwidth utilization over the last 30 seconds
53. WHEN connection quality changes THEN the System SHALL dynamically adjust concurrent uploads and chunk sizes without user intervention
54. WHEN all uploads complete successfully THEN the System SHALL play a subtle success sound (configurable) and show a celebratory animation
55. WHEN uploads complete while the tab is inactive THEN the System SHALL send a browser notification: "Upload complete: X photos added to [Gallery Name]"
56. WHEN the upload panel is open THEN the System SHALL show keyboard shortcuts: Space (pause/resume), Escape (minimize), Delete (cancel selected)

##### Smart Upload Features
57. WHEN photos are selected for upload THEN the System SHALL analyze EXIF date_taken and offer to auto-organize by date into sub-galleries
58. WHEN photos from multiple cameras are detected THEN the System SHALL offer to group by camera model into separate sub-galleries
59. WHEN uploading THEN the System SHALL detect and warn about potentially low-quality images (resolution < 1MP, blur detection, exposure issues)
60. WHEN low-quality images are detected THEN the System SHALL allow the user to review and exclude them before upload with a "Review Quality Issues" dialog
61. WHEN uploading RAW+JPEG pairs THEN the System SHALL detect matching pairs and offer options: "Keep both", "Keep RAW only", "Keep JPEG only"
62. WHEN the same photo exists in multiple formats THEN the System SHALL show a comparison dialog with file sizes and recommend the best option

##### Upload Queue Management
63. WHEN multiple files are queued THEN the System SHALL allow drag-drop reordering of the upload queue to prioritize specific files
64. WHEN files are queued THEN the System SHALL allow selecting multiple files for bulk actions: cancel, move to top, move to bottom
65. WHEN the upload queue exceeds 100 files THEN the System SHALL show a virtualized list for performance with smooth scrolling
66. WHEN uploading THEN the System SHALL show estimated storage usage and warn if approaching workspace quota
67. WHEN workspace quota would be exceeded THEN the System SHALL pause uploads and show a clear message with upgrade options

##### Accessibility and Internationalization
68. WHEN the upload panel is displayed THEN the System SHALL be fully keyboard navigable with proper ARIA labels and focus management
69. WHEN upload status changes THEN the System SHALL announce status changes to screen readers using ARIA live regions
70. WHEN displaying upload progress THEN the System SHALL use localized number formatting for file sizes and percentages based on user locale

### Requirement 16: SOC2 Compliance

**User Story:** As a workspace admin, I want the system to meet SOC2 Type II requirements, so that I can demonstrate security controls to enterprise clients and auditors.

#### Acceptance Criteria

1. WHEN any user accesses, modifies, or deletes media THEN the System SHALL create an immutable audit log entry with timestamp, user_id, action, resource_id, IP address, and user_agent (CC7.2 - System Operations)
2. WHEN audit logs are created THEN the System SHALL store them in append-only storage with cryptographic integrity verification and 7-year retention (CC7.2)
3. WHEN a user authenticates THEN the System SHALL enforce MFA for workspace admins and support MFA for all users (CC6.1 - Logical Access)
4. WHEN a session is created THEN the System SHALL enforce session timeout after 15 minutes of inactivity and absolute timeout after 24 hours (CC6.1)
5. WHEN encryption keys are managed THEN the System SHALL use HSM-backed key storage for production environments and implement key rotation every 90 days (CC6.1)
6. WHEN data is transmitted THEN the System SHALL enforce TLS 1.3 minimum with strong cipher suites and certificate pinning for mobile apps (CC6.6 - Encryption)
7. WHEN data is stored THEN the System SHALL encrypt all PII and media using AES-256-GCM with workspace-isolated keys (CC6.7 - Encryption at Rest)
8. WHEN system changes occur THEN the System SHALL maintain change management logs with approval workflows for production deployments (CC8.1 - Change Management)
9. WHEN security incidents occur THEN the System SHALL detect anomalies within 5 minutes and alert security team within 15 minutes (CC7.3 - Incident Response)
10. WHEN third-party integrations are used THEN the System SHALL validate vendor SOC2 compliance and implement least-privilege API access (CC9.2 - Vendor Management)
11. WHEN backups are created THEN the System SHALL encrypt backups with separate keys and test restoration quarterly (A1.2 - Availability)
12. WHEN system availability is monitored THEN the System SHALL maintain 99.9% uptime SLA with automated failover (A1.1 - Availability)

### Requirement 17: GDPR Compliance

**User Story:** As a data subject (user or client), I want my personal data protected according to GDPR, so that my privacy rights are respected and I have control over my data.

#### Acceptance Criteria

1. WHEN personal data is collected THEN the System SHALL obtain explicit consent with clear purpose specification and record consent timestamp (Article 6, 7 - Lawful Basis)
2. WHEN a user requests their data THEN the System SHALL provide complete data export in machine-readable format (JSON/CSV) within 30 days including all photos, metadata, comments, and activity logs (Article 15, 20 - Right of Access, Data Portability)
3. WHEN a user requests data deletion THEN the System SHALL delete all personal data within 30 days and provide deletion confirmation certificate (Article 17 - Right to Erasure)
4. WHEN personal data is processed THEN the System SHALL maintain a Record of Processing Activities (ROPA) documenting data categories, purposes, recipients, and retention periods (Article 30)
5. WHEN data is transferred outside EU/EEA THEN the System SHALL use Standard Contractual Clauses (SCCs) or ensure adequacy decisions exist for destination countries (Article 46)
6. WHEN a data breach occurs THEN the System SHALL notify supervisory authority within 72 hours and affected users without undue delay if high risk (Article 33, 34)
7. WHEN processing high-risk data THEN the System SHALL conduct Data Protection Impact Assessments (DPIA) and document risk mitigation measures (Article 35)
8. WHEN designing features THEN the System SHALL implement privacy by design with data minimization, purpose limitation, and storage limitation (Article 25)
9. WHEN displaying privacy information THEN the System SHALL provide clear, accessible privacy notices in user's language (Article 12, 13, 14)
10. WHEN a user withdraws consent THEN the System SHALL stop processing and delete data unless another lawful basis exists (Article 7)
11. WHEN automated decisions are made THEN the System SHALL provide human review option and explain decision logic (Article 22)
12. WHEN children's data is processed THEN the System SHALL obtain parental consent for users under 16 (Article 8)

### Requirement 18: Data Security and Privacy

**User Story:** As a photographer handling client photos, I want enterprise-grade data security, so that my clients' sensitive images are protected from unauthorized access and breaches.

#### Acceptance Criteria

1. WHEN media files are stored THEN the System SHALL use AES-256-GCM encryption with unique IV per file and workspace-derived keys
2. WHEN encryption keys are derived THEN the System SHALL use HKDF-SHA256 with master key stored in environment variables (dev) or HSM (production)
3. WHEN media is accessed THEN the System SHALL generate signed URLs with 1-hour TTL, workspace scope, and permission verification
4. WHEN signed URLs are validated THEN the System SHALL verify signature, expiry, workspace membership, and user permissions before serving content
5. WHEN direct R2 access is attempted THEN the System SHALL return encrypted (unusable) content as bucket is private with no public access
6. WHEN cross-workspace access is attempted THEN the System SHALL reject with 403 Forbidden as workspace keys are cryptographically isolated
7. WHEN brute-force attacks are detected THEN the System SHALL implement rate limiting (100 requests/minute per IP) and progressive delays after failed attempts
8. WHEN SQL injection is attempted THEN the System SHALL use parameterized queries exclusively and sanitize all user inputs
9. WHEN XSS attacks are attempted THEN the System SHALL implement Content Security Policy (CSP), sanitize HTML output, and use HttpOnly cookies
10. WHEN CSRF attacks are attempted THEN the System SHALL validate CSRF tokens on all state-changing requests and use SameSite cookie attribute
11. WHEN file uploads are processed THEN the System SHALL validate file headers (magic bytes), scan for malware, and reject polyglot files
12. WHEN API requests are made THEN the System SHALL validate JWT tokens, check token expiry, and verify workspace membership on every request
13. WHEN sensitive operations occur THEN the System SHALL require re-authentication for password changes, key rotation, and bulk deletions
14. WHEN PII is logged THEN the System SHALL redact or hash sensitive fields (email, IP) in application logs while preserving audit trail integrity
15. WHEN database connections are made THEN the System SHALL use TLS encryption, connection pooling with limits, and least-privilege database users

### Requirement 19: Access Control and Authorization

**User Story:** As a workspace admin, I want granular access controls, so that I can ensure users only access resources they're authorized to view.

#### Acceptance Criteria

1. WHEN a user accesses a gallery THEN the System SHALL verify workspace membership and role-based permissions (viewer, editor, admin)
2. WHEN a client accesses via share link THEN the System SHALL verify link validity, expiry, password (if set), and allowed actions
3. WHEN bulk operations are performed THEN the System SHALL verify permissions for each resource and reject partial failures atomically
4. WHEN admin actions are performed THEN the System SHALL require admin role and log action with admin user_id
5. WHEN API tokens are used THEN the System SHALL enforce scope limitations and workspace restrictions
6. WHEN permissions are checked THEN the System SHALL use deny-by-default with explicit allow rules
7. WHEN role changes occur THEN the System SHALL invalidate cached permissions immediately and log the change
8. WHEN workspace isolation is enforced THEN the System SHALL include workspace_id in all database queries as mandatory filter

### Requirement 20: Incident Response and Monitoring

**User Story:** As a security administrator, I want comprehensive monitoring and incident response capabilities, so that I can detect and respond to security threats quickly.

#### Acceptance Criteria

1. WHEN security events occur THEN the System SHALL log to centralized SIEM with correlation IDs for tracing
2. WHEN anomalies are detected THEN the System SHALL alert security team via PagerDuty/Slack within 15 minutes
3. WHEN failed login attempts exceed threshold THEN the System SHALL lock account temporarily and notify user via email
4. WHEN unusual access patterns occur THEN the System SHALL flag for review (e.g., bulk downloads, off-hours access, new IP/device)
5. WHEN incidents are confirmed THEN the System SHALL follow documented incident response playbook with defined escalation paths
6. WHEN post-incident review occurs THEN the System SHALL document root cause, impact, and remediation in incident report

### Requirement 6: Photo Grid Display

**User Story:** As a staff user, I want to view photos in a responsive masonry grid, so that I can see all content at a glance with proper aspect ratios.

#### Acceptance Criteria

1. WHEN displaying photos THEN the System SHALL render a masonry grid layout that preserves photo aspect ratios
2. WHEN displaying photos THEN the System SHALL show CDN-optimized thumbnails with lazy loading for performance
3. WHEN a photo has client favorites THEN the System SHALL display a heart icon overlay with "FAVORITE" badge
4. WHEN a photo is marked as private/locked THEN the System SHALL display a lock icon overlay with "PRIVATE" badge
5. WHEN a video asset is displayed THEN the System SHALL show a play icon overlay and duration badge
6. WHEN hovering over a photo THEN the System SHALL display action buttons (favorite toggle, selection checkbox, more options)
7. WHEN the grid has many photos THEN the System SHALL implement virtualized scrolling for performance

### Requirement 7: Photo Lightbox

**User Story:** As a staff user, I want to view photos in a full-screen lightbox with navigation, so that I can review photos in detail.

#### Acceptance Criteria

1. WHEN a staff user clicks a photo in the grid THEN the System SHALL open a lightbox modal with the full-resolution image
2. WHEN viewing the lightbox THEN the System SHALL display navigation arrows for previous/next photo
3. WHEN viewing the lightbox THEN the System SHALL support keyboard navigation (arrow keys, Escape to close)
4. WHEN viewing the lightbox THEN the System SHALL display photo metadata (filename, dimensions, date taken if available)
5. WHEN viewing the lightbox THEN the System SHALL provide zoom controls and pan functionality
6. WHEN viewing the lightbox THEN the System SHALL show favorite/selection status and allow toggling

### Requirement 8: Favorites and Selections Management

**User Story:** As a staff user, I want to view and filter photos by client favorites and selections, so that I can see what the client has chosen.

#### Acceptance Criteria

1. WHEN viewing a gallery THEN the System SHALL display filter buttons for "Picks" and "Favorites" in the toolbar
2. WHEN "Favorites" filter is active THEN the System SHALL display only photos that clients have favorited, grouped in a "FAVORITES" section
3. WHEN "Picks" filter is active THEN the System SHALL display only photos that clients have selected for delivery
4. WHEN displaying favorites section THEN the System SHALL show the section header with count (e.g., "♥ FAVORITES")
5. WHEN a staff user clicks "Select All" THEN the System SHALL select all visible photos for bulk operations
6. WHEN photos are selected THEN the System SHALL display a bulk action bar with options (move to sub-gallery, delete, download)

### Requirement 9: Gallery Settings

**User Story:** As a staff user, I want to configure gallery settings, so that I can customize the client experience and access controls.

#### Acceptance Criteria

1. WHEN a staff user clicks the settings gear icon THEN the System SHALL open a settings panel or modal
2. WHEN configuring settings THEN the System SHALL allow editing: title, description, theme (light/dark/system), layout style (tabs/continuous)
3. WHEN configuring access THEN the System SHALL allow setting: password protection, email registration requirement, expiry date
4. WHEN configuring downloads THEN the System SHALL allow selecting download policy: view_only, web_only, watermarked_only, original_allowed
5. WHEN configuring branding THEN the System SHALL allow selecting a branding profile (logo, colors) from workspace presets
6. WHEN settings are saved THEN the System SHALL persist changes and display success confirmation

### Requirement 10: Gallery Status Management

**User Story:** As a staff user, I want to publish, unpublish, or archive galleries, so that I can control client access.

#### Acceptance Criteria

1. WHEN a gallery is in draft status THEN the System SHALL display a "Publish" button in the header
2. WHEN a staff user clicks "Publish" THEN the System SHALL validate the gallery has at least one photo and change status to published
3. WHEN a gallery is published THEN the System SHALL display "Unpublish" option to revert to draft status
4. WHEN a staff user archives a gallery THEN the System SHALL change status to archived and make it read-only
5. WHEN publishing fails due to empty gallery THEN the System SHALL display an error message explaining the requirement

### Requirement 11: Photo Organization

**User Story:** As a staff user, I want to organize photos within the gallery, so that I can control the presentation order and grouping.

#### Acceptance Criteria

1. WHEN viewing the photo grid THEN the System SHALL allow drag-and-drop reordering of photos
2. WHEN a staff user drags a photo to a sub-gallery tab THEN the System SHALL move the photo to that sub-gallery
3. WHEN a staff user selects multiple photos THEN the System SHALL allow bulk move to a different sub-gallery
4. WHEN a staff user deletes a photo THEN the System SHALL remove it from the gallery (soft delete) with undo option
5. WHEN reordering photos THEN the System SHALL persist the new sort_order to the backend

### Requirement 12: View Mode Toggle

**User Story:** As a staff user, I want to switch between grid and list view modes, so that I can choose the best way to review photos.

#### Acceptance Criteria

1. WHEN viewing a gallery THEN the System SHALL display view mode toggle buttons (grid icon, list icon) in the toolbar
2. WHEN grid mode is active THEN the System SHALL display photos in masonry layout
3. WHEN list mode is active THEN the System SHALL display photos in a table with columns: thumbnail, filename, dimensions, date, favorites, selections
4. WHEN switching view modes THEN the System SHALL preserve the current filter and selection state

### Requirement 13: Search and Filter

**User Story:** As a staff user, I want to search and filter photos within a gallery, so that I can quickly find specific content.

#### Acceptance Criteria

1. WHEN viewing a gallery THEN the System SHALL display a search input in the toolbar
2. WHEN a staff user types in the search input THEN the System SHALL filter photos by filename match
3. WHEN filtering THEN the System SHALL support combining search with favorites/picks filters
4. WHEN no results match THEN the System SHALL display an empty state with clear filter option

### Requirement 14: Responsive Design

**User Story:** As a staff user on mobile or tablet, I want the gallery interface to work well on smaller screens, so that I can manage galleries on the go.

#### Acceptance Criteria

1. WHEN viewing on mobile THEN the System SHALL collapse the toolbar into a menu with essential actions visible
2. WHEN viewing on mobile THEN the System SHALL display sub-gallery tabs as a horizontal scrollable list
3. WHEN viewing on mobile THEN the System SHALL adjust the masonry grid to fewer columns (2 on mobile, 3-4 on tablet)
4. WHEN viewing on mobile THEN the System SHALL support touch gestures for photo selection and lightbox navigation
5. WHEN viewing on mobile THEN the System SHALL ensure all interactive elements have minimum 48px touch targets

### Requirement 15: Performance

**User Story:** As a staff user, I want the gallery to load quickly even with many photos, so that I can work efficiently.

#### Acceptance Criteria

1. WHEN loading a gallery THEN the System SHALL display the first 50 photos within 1 second (P95)
2. WHEN scrolling THEN the System SHALL lazy-load additional photos as they approach the viewport
3. WHEN displaying thumbnails THEN the System SHALL use CDN-optimized images with appropriate sizing
4. WHEN uploading THEN the System SHALL not block the UI and allow continued browsing during upload

