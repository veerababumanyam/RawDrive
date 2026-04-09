# Technical Requirements: RawDrive Gallery Master Requirements

**Document Status:** Draft v2.0
**Ownership:** Product / UX / Frontend / Backend / Media Platform
**Scope:** Canonical consolidated source of truth for the RawDrive gallery product
**Importnat Npte:** Frontend Design Agents should use Stitch/Figma MC for UI desiginng, Playwrigth and ChroemDevTools MCP for testing. Every UI and Browser test is importnat. Check for the exisitng configurations, reveiw, indetify gaps, analys and fix them.
**Purpose:**   
**Purpose:** This document consolidates gallery, upload, cover design, PWA, AI, proofing, sharing, privacy, analytics, and integration requirements into one master document.

## 1. Consolidation Scope

- GAL-SCOPE-001: This document shall be treated as the single consolidated gallery requirements document for RawDrive.
- GAL-SCOPE-002: This document shall cover the full gallery lifecycle from secure upload to client delivery.
- GAL-SCOPE-003: This document shall include photographer-facing, client-facing, admin-facing, API-facing, and operations-facing gallery requirements where they directly serve the gallery product.
- GAL-SCOPE-004: This document shall consolidate requirements previously distributed across `Asset_Management.md`, `Client_Galleries_PWA.md`, `CoverPhotoSystem.md`, `GALLERY_CANVAS.md`, `GALLERY_DESIGN_ENHANCEMENTS_VERIFICATION.md`, `GALLERY_DESIGN_STUDIO_VERIFICATION.md`, `AI_Intelligence_Search.md`, `Security_Compliance_Privacy.md`, `Photographer-Requirements.md`, `Client-Requirements.md`, `Developer_API_Integrations.md`, `Business_Intelligence_Reporting.md`, `Marketing_Branding.md`, `Creative_Workflow_Tools.md`, and `PRD.md`.
- GAL-SCOPE-005: The gallery product shall remain the heart of RawDrive and must feel like the main purpose of the application rather than an add-on module.
- GAL-SCOPE-006: The target experience shall combine Apple Photos fluidity, Google Photos discoverability, and professional client-gallery delivery quality.
- GAL-SCOPE-007: All requirements in this document shall be written in LLM-friendly bullet form so they can be consumed directly by planning, design, engineering, QA, and automation agents.
- GAL-SCOPE-008: Gallery requirements shall include both end-user features and the backend/platform behaviors needed to make those features real.

## 2. Personas and Roles

- GAL-PER-001: The primary gallery owner persona shall be the Photographer or Studio Owner.
- GAL-PER-002: A Team Member persona shall support delegated curation, proofing review, editing coordination, and gallery operations based on role permissions.
- GAL-PER-003: An Invited Client persona shall support viewing, favoriting, commenting, selecting, approving, downloading, and purchasing where enabled.
- GAL-PER-004: A Family or Guest persona shall support link-based viewing with minimal friction and optional registration.
- GAL-PER-005: A Public Visitor persona shall support public gallery or public profile discovery only for explicitly public surfaces.
- GAL-PER-006: An Admin persona shall support moderation, analytics visibility, dispute review, and security oversight without overriding privacy rules unnecessarily.

## 3. Core Product Mission and Gallery Lifecycle

- GAL-CORE-001: RawDrive shall support the full lifecycle of a gallery as `create -> upload -> process -> curate -> design -> share -> proof -> deliver -> analyze -> archive`.
- GAL-CORE-002: The gallery shall support both private working galleries for photographers and polished client-facing galleries for final delivery.
- GAL-CORE-003: The gallery shall support event galleries, client galleries, album-linked galleries, portfolio galleries, and public showcase galleries.
- GAL-CORE-004: The gallery shall support photographer workflows at high volume, including thousands of assets per gallery and many galleries per workspace.
- GAL-CORE-005: Gallery creation shall support draft state, shared state, expired state, protected state, archived state, and deleted state.
- GAL-CORE-006: Gallery creation shall enforce plan limits and show upgrade prompts when gallery count limits are reached.
- GAL-CORE-007: Gallery settings shall support title, subtitle, description, slug, cover, client name, shoot date, expiry, watermark, download policy, and FaceID availability.
- GAL-CORE-008: The photographer workspace shall expose Galleries, Albums, Uploads, Assets, Proofing, and Analytics as connected gallery-adjacent surfaces.
- GAL-CORE-009: A `View as Client` mode shall render the exact client-facing experience before the gallery is shared.
- GAL-CORE-010: All new galleries shall initialize with safe defaults for privacy, branding, and design.

## 4. Secure Upload and Ingestion

- GAL-UPL-001: All gallery uploads shall use resumable upload behavior.
- GAL-UPL-002: The primary upload protocol shall be TUS 1.0.0.
- GAL-UPL-003: Upload sessions shall survive connection drops, browser refresh, browser restart, and unreliable mobile network conditions.
- GAL-UPL-004: Upload chunk size shall adjust dynamically based on current network throughput.
- GAL-UPL-005: Upload entry points shall include drag-and-drop, browse files, folder selection where supported, and select-from-existing-collection where applicable.
- GAL-UPL-006: Bulk uploads shall support large sessions up to at least 50 GB.
- GAL-UPL-007: The RawDrive CLI shall support concurrent mass ingestion for high-volume users.
- GAL-UPL-008: Upload progress shall display per-file progress, total batch progress, speed, retries, and failure reasons.
- GAL-UPL-009: Upload validation shall block unsupported formats, invalid dimensions, and files that exceed configured limits.
- GAL-UPL-010: Upload integrity shall use checksum or equivalent verification before assets are accepted as complete.
- GAL-UPL-011: Upload flow shall store explicit processing state for each asset so users can see whether thumbnails, metadata, and AI analysis are complete.
- GAL-UPL-012: Upload flow shall support retry, resume, and cancel actions without corrupting gallery state.
- GAL-UPL-013: Upload flow shall enforce storage quota limits before and during upload.
- GAL-UPL-014: If quota is exceeded, upload shall stop safely and show a clear upgrade or cleanup action.
- GAL-UPL-015: Upload permissions shall be role-aware so contributors can be limited to approved event or gallery submission surfaces.
- GAL-UPL-016: Guest contribution upload links shall route contributed assets into moderation or approval queues before they appear publicly.

## 5. Processing Pipeline and Derivative Creation

- GAL-PROC-001: Every accepted upload shall trigger an asynchronous processing pipeline.
- GAL-PROC-002: The processing pipeline shall extract EXIF metadata including camera model, lens, exposure, ISO, aperture, focal length, timestamp, and GPS when present.
- GAL-PROC-003: The processing pipeline shall persist technical and creative metadata to PostgreSQL or equivalent database storage.
- GAL-PROC-004: The processing pipeline shall generate gallery-ready thumbnail derivatives for each asset.
- GAL-PROC-005: Thumbnail generation shall include small, medium, and large derivatives for normal browsing.
- GAL-PROC-006: Cover-image processing shall also generate 1920px, 1280px, and 640px variants for responsive cover rendering.
- GAL-PROC-007: The pipeline shall generate low-quality image placeholders or blur-up previews for progressive loading.
- GAL-PROC-008: The pipeline shall generate web-optimized derivatives separate from original-resolution assets.
- GAL-PROC-009: The pipeline shall generate social-share-optimized preview derivatives where required.
- GAL-PROC-010: The pipeline shall generate watermark-ready preview variants when watermarking is enabled.
- GAL-PROC-011: The pipeline shall generate video poster frames and lightweight preview thumbnails for video assets.
- GAL-PROC-012: The pipeline shall convert HEIC or mobile-native formats into gallery-safe derivatives when browser compatibility requires it.
- GAL-PROC-013: The pipeline shall support AI aesthetic scoring and moment grouping immediately after upload.
- GAL-PROC-014: The pipeline shall group related uploads into bursts, moments, or event clusters using capture time and visual similarity.
- GAL-PROC-015: The pipeline shall store processing status in a way that the UI can expose `uploaded`, `processing`, `ready`, `failed`, and `retrying` states.
- GAL-PROC-016: Processing failures shall not orphan assets and shall expose clear retry and audit information.

## 6. Storage, Database Accounting, and Lifecycle

- GAL-STO-001: Cloudflare R2 shall be the only managed storage backend for photographers and studios on standard RawDrive plans.
- GAL-STO-002: Bring Your Own Storage shall be available only for enterprise customers.
- GAL-STO-003: BYOS activation shall require validation of read, write, and delete permissions against the customer bucket.
- GAL-STO-004: RawDrive shall continue to manage metadata and gallery indexing even when enterprise customers use BYOS.
- GAL-STO-005: Originals, derivatives, thumbnails, and cover assets stored in managed mode shall reside in Cloudflare R2.
- GAL-STO-006: All managed storage shall use encryption at rest.
- GAL-STO-007: All asset delivery shall use signed URLs or equivalent secure delivery controls with configurable expiry.
- GAL-STO-008: Edge delivery shall support thumbnail caching and watermark rendering through Cloudflare-compatible edge services.
- GAL-STO-009: Storage usage calculations shall be real calculations stored in the database rather than guessed UI-only estimates.
- GAL-STO-010: Database storage calculations shall include original files, derivatives, thumbnails, cover assets, retained versions, and deletion grace-period storage where applicable.
- GAL-STO-011: Database storage calculations shall be updated when assets are uploaded, deleted, archived, restored, reprocessed, versioned, or moved between retention states.
- GAL-STO-012: Account details shall show actual used storage, total quota, remaining capacity, and percentage utilization based on database values.
- GAL-STO-013: Photographer account details shall expose capacity utilization clearly enough for users to understand what is consuming space.
- GAL-STO-014: Workspace sidebar, billing pages, and account details pages shall all reflect the same database-backed storage numbers.
- GAL-STO-015: Storage warnings shall turn amber at approximately 80 percent utilization and red at approximately 95 percent utilization.
- GAL-STO-016: Gallery analytics shall show which galleries or asset groups are consuming the most storage.
- GAL-STO-017: Asset lifecycle shall support originals, approved edits, derived exports, archived items, hidden items, recently deleted items, and restored items.
- GAL-STO-018: Non-destructive versioning shall keep original files available for rollback during the retention window.
- GAL-STO-019: Asset storage organization shall use virtual collections and database taxonomy rather than physical folder hierarchy in object storage.
- GAL-STO-020: One physical asset shall be able to appear in multiple collections or client views without duplicating object storage bytes.

## 7. Gallery Organization and Asset Management

- GAL-ORG-001: The gallery shall support timeline browsing grouped by day, month, year, and event moments.
- GAL-ORG-002: The gallery shall support manual albums, smart albums, virtual collections, and sub-galleries.
- GAL-ORG-003: The gallery shall support hierarchical sub-galleries with breadcrumb navigation.
- GAL-ORG-004: The gallery shall support pinned collections and utility groups at the top of the gallery.
- GAL-ORG-005: Utility groups shall include Favorites, Videos, Live or Motion Photos, RAW, Edited, Shared, Duplicates, Recently Added, Hidden, Locked, Archived, and Recently Deleted.
- GAL-ORG-006: The gallery shall support filters for media type, date, event, person, location, camera, lens, AI score, rating, favorites, picks, visibility, and tags.
- GAL-ORG-007: The gallery shall support custom covers, key photos, and manual ordering for albums and collections.
- GAL-ORG-008: The gallery shall support inline editing of title, description, tags, privacy state, and access code metadata.
- GAL-ORG-009: The gallery shall support bulk select, bulk move, bulk delete, bulk download, bulk tag, bulk privacy update, and bulk add-to-album actions.
- GAL-ORG-010: Selection state shall persist across pagination, scrolling, view-mode changes, filters, and sub-gallery navigation.
- GAL-ORG-011: Asset detail view shall expose metadata, version history, related assets, stack membership, duplicate relationships, and usage context.
- GAL-ORG-012: The gallery shall support archive, hide, lock, restore, and purge workflows without confusing users about asset availability.

## 8. Cover Photo System and Gallery Design Studio

- GAL-DES-001: The gallery shall include a dedicated Gallery Design Studio rather than only simple settings forms.
- GAL-DES-002: The design studio route shall be separate from generic gallery management and optimized for creative editing.
- GAL-DES-003: The design studio layout shall use a split-screen architecture with a left control panel and a right live preview canvas.
- GAL-DES-004: Design changes shall update a local draft state first and shall not require API calls for every style tweak.
- GAL-DES-005: Draft changes shall auto-save to browser localStorage every 3 to 5 seconds.
- GAL-DES-006: A prominent Publish action shall commit the draft design to the persisted gallery design configuration.
- GAL-DES-007: On re-entry, the design studio shall offer restore-draft or discard-draft recovery.
- GAL-DES-008: Design changes shall support undo and redo with bounded history.
- GAL-DES-009: Each design section shall support reset-to-default behavior.
- GAL-DES-010: The cover photo system shall support drag-and-drop upload, browse files, and select-from-gallery flows.
- GAL-DES-011: Cover photo upload constraints shall support JPEG, PNG, and WebP with server-side validation.
- GAL-DES-012: Cover photo upload shall enforce a 15 MB maximum file size unless plan policy overrides it.
- GAL-DES-013: Cover photo upload shall enforce minimum quality and dimension checks so poor covers cannot be published accidentally.
- GAL-DES-014: Cover photo upload shall auto-compress or resize excessively large files into optimized delivery variants.
- GAL-DES-015: The cover photo system shall support interactive focal-point adjustment using percentage-based coordinates.
- GAL-DES-016: The cover photo system shall show real-time crop behavior as focal point changes.
- GAL-DES-017: The design studio shall support at least the cover styles already defined for RawDrive, including Center, Left, None, Vintage, Novel, Frame, Stripe, Divider, Journal, Stamp, Outline, Classic, Split, Label, Border, Album, Cliff, Cedar, Breeze, Aero, Surf, Cosmos, Reef, Bondi, West, Oakwood, Edge, Anchor, Joy, and Love.
- GAL-DES-018: Every cover style shall have a visual preview thumbnail in the style picker.
- GAL-DES-019: Cover style thumbnails shall lazy-load to keep the studio fast.
- GAL-DES-020: The design studio shall support typography pairing selection with live font previews.
- GAL-DES-021: The design studio shall support the curated font pairings already defined for RawDrive, including Sans, Serif, Modern, Timeless, Bold, and Subtle.
- GAL-DES-022: The design studio shall support Google Fonts loading only when premium pairings are selected.
- GAL-DES-023: The design studio shall support a theme engine rather than a loose color picker.
- GAL-DES-024: The theme engine shall support at least the curated themes already defined for RawDrive, including Brand, Gold, Neutral, Cyan, Midnight, Rose, Terracotta, Olive, and Sea.
- GAL-DES-025: Each theme shall support light, dark, or system-responsive behavior as appropriate.
- GAL-DES-026: Theme selection shall update semantic CSS tokens instantly in the live preview.
- GAL-DES-027: Accent color override shall be limited to curated swatches per theme to preserve design integrity.
- GAL-DES-028: The design studio shall support grid controls for layout orientation, thumbnail size, spacing, and navigation style.
- GAL-DES-029: Grid options shall include vertical and horizontal arrangements plus regular and large thumbnail sizes.
- GAL-DES-030: The design studio shall support responsive preview modes for mobile, tablet, and desktop.
- GAL-DES-031: The design studio shall support real-time collaborative editing with collaborator presence indicators.
- GAL-DES-032: The design studio shall support section-level locks so one collaborator can edit cover, theme, typography, or grid without collision.
- GAL-DES-033: The design studio shall support active viewer count display.
- GAL-DES-034: Publishing design changes shall broadcast live updates to viewer sessions where safe and appropriate.
- GAL-DES-035: The design studio shall support reusable workspace-scoped templates.
- GAL-DES-036: Template workflows shall support create, save, search, filter, apply, edit, update, soft-delete, and recover where applicable.
- GAL-DES-037: AI-powered design recommendations shall analyze gallery content and suggest cover styles, themes, and font pairings.
- GAL-DES-038: AI recommendations shall show visible reasoning rather than opaque suggestions.
- GAL-DES-039: Design preview latency for simple CSS changes shall target sub-frame responsiveness.
- GAL-DES-040: The cover and design system shall feel premium, polished, and competitive with high-end modern design tools.

## 9. Gallery Canvas, Browsing, and Viewer Experience

- GAL-VIEW-001: The gallery canvas shall support grid and masonry layouts as primary display modes.
- GAL-VIEW-002: The gallery canvas shall support responsive column calculations across mobile, tablet, desktop, and large desktop breakpoints.
- GAL-VIEW-003: The gallery canvas shall support virtual scrolling or equivalent rendering optimization for very large galleries.
- GAL-VIEW-004: The gallery canvas shall support lazy loading, progressive loading, and placeholder states for all assets.
- GAL-VIEW-005: Photo cards shall support selected, hovered, favorite, picked, private, locked, loading, and error states.
- GAL-VIEW-006: Photographer hover actions shall expose edit, delete, download, favorite, pick, privacy toggle, and more actions.
- GAL-VIEW-007: Metadata overlays shall expose filename, dimensions, EXIF, AI tags, upload date, and other useful details on demand.
- GAL-VIEW-008: Watermark overlays shall support configurable position, opacity, logo source, and tiling behavior.
- GAL-VIEW-009: Optional face-detection overlays shall support bounding boxes, labels, and owner-visible confidence indicators.
- GAL-VIEW-010: The full-screen lightbox shall support swipe, previous and next navigation, zoom, pan, and tap-to-toggle UI.
- GAL-VIEW-011: The lightbox shall preserve scroll return state when users exit back to the gallery grid.
- GAL-VIEW-012: The gallery shall support compare mode for selecting the best frame from similar assets.
- GAL-VIEW-013: The gallery shall support filmstrip view and related-assets view inside the lightbox.
- GAL-VIEW-014: The gallery shall support burst expansion, stack expansion, and top-pick display.
- GAL-VIEW-015: The gallery shall support video playback with poster frame, mute or volume control, playback speed, and full-screen support.
- GAL-VIEW-016: Photographer-facing video view shall support trim start and end controls where enabled.
- GAL-VIEW-017: Gesture support shall include pinch-to-zoom, swipe-to-next, swipe-up-to-close where appropriate, and touch-friendly controls.
- GAL-VIEW-018: Keyboard support shall include tab navigation, arrow navigation, select all, escape-to-close, and accessible focus management.
- GAL-VIEW-019: Map view shall be available for geotagged assets when location privacy allows it.
- GAL-VIEW-020: The gallery shall support dense, standard, and spacious browsing densities.

## 10. Client Entry, Sharing, and Access Flows

- GAL-SHR-001: Clients shall be able to enter galleries directly from shared links without forced registration.
- GAL-SHR-002: Optional registration prompts may appear after a delay or on first meaningful interaction such as favorite or comment.
- GAL-SHR-003: Password-protected gallery entry shall show photographer branding and gallery identity.
- GAL-SHR-004: Password entry failure shall use clear but secure messaging and shall not leak whether a gallery exists.
- GAL-SHR-005: Individual assets or sensitive sets may require a secondary PIN separate from the gallery password.
- GAL-SHR-006: Locked assets may appear as blurred or hidden placeholders based on owner configuration.
- GAL-SHR-007: FaceID gallery entry shall require explicit biometric consent before camera or selfie processing begins.
- GAL-SHR-008: FaceID matching shall be scoped to the current gallery only and never link guests across different galleries.
- GAL-SHR-009: FaceID failure shall provide graceful fallback to full manual browsing.
- GAL-SHR-010: Public gallery slugs shall support SEO-friendly URLs.
- GAL-SHR-011: Galleries shall support secure links, email invites, WhatsApp sharing, SMS-friendly links, QR codes, and deep links to a specific asset or album.
- GAL-SHR-012: Magic links shall support optional password, optional PIN, expiry date, max access count, and revocation.
- GAL-SHR-013: Gallery links shall be rotatable and regeneratable without forcing gallery recreation.
- GAL-SHR-014: Social sharing shall support OpenGraph metadata so the correct cover or photo appears in share previews.
- GAL-SHR-015: Client-facing galleries shall support photographer-first branding and plan-aware white-label behavior.
- GAL-SHR-016: Photographers shall be able to hide certain galleries from public or client profile discovery.
- GAL-SHR-017: Public profile and gallery bridge flows shall allow users to move from public profile to public gallery seamlessly.
- GAL-SHR-018: `View as Client` shall mirror access rules, design choices, downloads, and locked-state behavior exactly.
- GAL-SHR-019: Gallery access shall support invite-only, private, unlisted, and public modes.
- GAL-SHR-020: Gallery access logs shall capture who accessed the gallery, from where, when, and via which link type.

## 11. Proofing, Selection, Comments, and Album Approval

- GAL-PRF-001: Clients shall be able to favorite and unfavorite photos where permitted.
- GAL-PRF-002: Clients shall be able to create named selection lists such as Favorites, Must Print, Maybe, Album Picks, or Retouch Requests.
- GAL-PRF-003: Proofing workflows shall support approvals, rejections, holds, and review statuses.
- GAL-PRF-004: Proofing workflows shall support star ratings and color labels when enabled by the photographer.
- GAL-PRF-005: Per-image comments shall support text comments attached to exact assets.
- GAL-PRF-006: Collaborative review shall support pinned comments on exact regions of a photo or spread where applicable.
- GAL-PRF-007: Comment threads shall support back-and-forth discussion history.
- GAL-PRF-008: Owners shall be able to view proofing dashboards showing selections, approvals, comments, and outstanding review requests.
- GAL-PRF-009: Proofing workflows shall support deadlines, reminders, and overdue notifications.
- GAL-PRF-010: Final selection sets shall be exportable to editing, retouching, album design, and reporting workflows.
- GAL-PRF-011: Album design workflows shall support final client approval for print.
- GAL-PRF-012: Final print approval shall create an immutable consent ledger event.
- GAL-PRF-013: Once album approval is granted, the approved version shall be pinned and protected from silent change.
- GAL-PRF-014: Photographers shall receive notification when client proofing, favorites, selections, or final print approval actions occur.

## 12. AI Intelligence, Search, and Smart Curation

- GAL-AI-001: The gallery shall support global search by filename, tag, caption, note, and metadata fields.
- GAL-AI-002: The gallery shall support people and pet grouping through face clustering.
- GAL-AI-003: The gallery shall support object, scene, color, and narrative search.
- GAL-AI-004: The gallery shall support natural-language queries such as event, outfit, mood, and location-based searches.
- GAL-AI-005: The gallery shall support OCR and text-in-image search.
- GAL-AI-006: The gallery shall support color-dominance search for creative and branding workflows.
- GAL-AI-007: The gallery shall support conversational search and follow-up refinement.
- GAL-AI-008: The gallery shall support similarity search from a selected image.
- GAL-AI-009: The gallery shall support duplicate and near-duplicate detection with review workflows.
- GAL-AI-010: The gallery shall support burst grouping and single best-frame recommendation.
- GAL-AI-011: AI culling shall analyze focus, sharpness, blink, expression, composition, and distraction signals.
- GAL-AI-012: AI culling shall allow photographers to toggle between AI suggestions and the full set of grouped images.
- GAL-AI-013: AI-generated tags and captions shall be stored as secondary metadata and shall not destroy original metadata.
- GAL-AI-014: Subjects shall be able to request biometric-data removal where face grouping or face search is used.
- GAL-AI-015: Gallery owners shall be able to disable FaceID for guests on a per-gallery basis.

## 13. Downloads, Delivery, Commerce, and Fulfillment

- GAL-DLV-001: The gallery shall support single-file downloads and bulk ZIP downloads.
- GAL-DLV-002: Download options shall include original, high-resolution, web-size, and social-size variants where enabled.
- GAL-DLV-003: Download center shall show progress, remaining items, and failure recovery for large download jobs.
- GAL-DLV-004: Download permissions shall be configurable independently from view permissions.
- GAL-DLV-005: Watermarking shall be applicable to preview delivery, selected download modes, or all shared assets based on owner policy.
- GAL-DLV-006: The gallery shall support digital product sales, print sales, album sales, bundles, and product-first or photo-first purchase flows.
- GAL-DLV-007: Commerce flows shall support crop previews, size previews, and live product previews.
- GAL-DLV-008: In-gallery commerce shall support coupons, promotions, limited-time offers, and featured sale banners.
- GAL-DLV-009: Cart state shall persist across sessions for authenticated or invited buyers where allowed.
- GAL-DLV-010: Album workflows shall connect proofing-approved selections into album design and print fulfillment.
- GAL-DLV-011: Print exports shall support high-resolution delivery outputs and preflight checks for poor-quality source files.
- GAL-DLV-012: Delivery activity shall log who downloaded what, in which format, and when.
- GAL-DLV-013: Gallery experience shall support seamless bridge flows from invitation or profile experiences into client delivery galleries.

## 14. Privacy, Security, Compliance, and Trust

- GAL-SEC-001: Privacy and security shall be treated as first-class gallery requirements rather than secondary platform concerns.
- GAL-SEC-002: All new galleries shall default to private or protected access unless the owner explicitly chooses a public mode.
- GAL-SEC-003: Purpose limitation shall apply to gallery-collected data and biometric workflows.
- GAL-SEC-004: Consent capture shall support separate opt-ins for core terms, notifications, marketing, and biometric search.
- GAL-SEC-005: Consent withdrawal shall trigger the appropriate deletion, archival, or privacy workflow.
- GAL-SEC-006: Consent notices and privacy notices shall support multilingual presentation appropriate for Indian-market use.
- GAL-SEC-007: PII and gallery metadata for Indian users shall follow residency requirements where applicable.
- GAL-SEC-008: Biometric guest selfies shall be ephemeral and shall be deleted immediately after matching unless saved with explicit permission.
- GAL-SEC-009: Face embeddings shall never link a person across photographers or across unrelated galleries.
- GAL-SEC-010: All gallery-sensitive read, write, share, download, delete, restore, and permission events shall be logged immutably with user identity, IP, timestamp, and target resource.
- GAL-SEC-011: Security logs shall support at least one-year retention in tamper-resistant storage.
- GAL-SEC-012: Transport security shall require TLS for all gallery delivery traffic.
- GAL-SEC-013: Root key and certificate management shall use strong key-management practices appropriate for enterprise trust.
- GAL-SEC-014: MFA shall be mandatory for photographers and staff accessing sensitive gallery management features.
- GAL-SEC-015: Least privilege and role-based access control shall govern gallery viewing, editing, deletion, proofing review, and billing-sensitive actions.
- GAL-SEC-016: Galleries shall support metadata stripping on shared or downloaded copies, including location and EXIF removal where configured.
- GAL-SEC-017: Right-click disabling and similar discouragement features may be provided as soft protections but shall never be marketed as absolute security.
- GAL-SEC-018: DSAR workflows shall support export-my-data and delete-my-data experiences for gallery-related personal data.
- GAL-SEC-019: Confirmed PII breach procedures shall support legal notification obligations and internal incident workflows.
- GAL-SEC-020: Gallery moderation shall support flagged-content review, viewer blocking, contributor moderation, and access revocation.

## 15. PWA, Performance, Reliability, and Accessibility

- GAL-NFR-001: The gallery shall behave like a premium installable PWA on supported browsers.
- GAL-NFR-002: PWA installation shall support gallery-specific branding and re-entry into the same gallery context.
- GAL-NFR-003: Offline shell behavior shall show meaningful branding and clear reconnect messaging.
- GAL-NFR-004: Service workers shall cache metadata, thumbnails, and selected shell assets to improve repeat performance.
- GAL-NFR-005: Thumbnail caching strategy shall prioritize fast landing-grid rendering and instant revisit behavior.
- GAL-NFR-006: Largest Contentful Paint for shared gallery landings shall target approximately 1.2 to 1.5 seconds on 4G-class networks.
- GAL-NFR-007: Interaction latency shall remain low enough for smooth scrolling, immediate selection, and lightbox navigation.
- GAL-NFR-008: Layout shift shall be minimized through reserved aspect-ratio placeholders and predictable media boxes.
- GAL-NFR-009: Search latency shall target sub-second behavior for large galleries and near-instant behavior for common metadata filters.
- GAL-NFR-010: The gallery platform shall support thousands of concurrent upload streams and large sustained ingress volumes.
- GAL-NFR-011: Gallery delivery endpoints shall target high availability appropriate for customer-facing production delivery.
- GAL-NFR-012: The gallery shall degrade gracefully on slow networks by reducing preview fidelity before sacrificing core usability.
- GAL-NFR-013: The gallery shall meet WCAG 2.2 AA expectations for keyboard support, focus handling, semantics, contrast, and screen-reader compatibility.
- GAL-NFR-014: Mobile touch targets shall remain usable and large enough for real client use on phones.
- GAL-NFR-015: The gallery shall support multilingual UI, localized date and number formatting, and RTL-safe rendering where required.
- GAL-NFR-016: The design studio shall target instant-feeling preview for CSS-driven theme updates and fast layout swaps for cover-style changes.
- GAL-NFR-017: Error states shall expose actionable retry and recovery behavior rather than generic failures.

## 16. Analytics, Account Details, and User Visibility

- GAL-ANL-001: Photographers shall have a per-gallery analytics view showing views, unique visitors, downloads, favorites, comments, selections, and purchase activity.
- GAL-ANL-002: Per-asset analytics shall show favorites, downloads, hover or engagement signals where captured, and proofing activity.
- GAL-ANL-003: Gallery analytics shall expose top albums, top photos, top searches, and zero-result searches.
- GAL-ANL-004: Gallery analytics shall expose device breakdown across mobile, desktop, and PWA usage.
- GAL-ANL-005: Gallery analytics shall expose download velocity so photographers understand when clients are completing delivery.
- GAL-ANL-006: Share analytics shall expose link clicks, unique viewers, QR usage, and invite performance.
- GAL-ANL-007: Storage analytics shall expose actual used storage and the highest-consuming galleries and assets.
- GAL-ANL-008: Workspace dashboard shall surface storage used versus quota, recent uploads, proofing pending, and gallery views.
- GAL-ANL-009: Account details shall clearly show capacity utilization, plan limit, used amount, remaining amount, and next warning threshold.
- GAL-ANL-010: Last-accessed timestamps shall be stored and surfaced for relevant gallery and asset views.
- GAL-ANL-011: Photographer-facing dashboard views shall reflect real database-backed numbers rather than delayed placeholders where avoidable.
- GAL-ANL-012: Admin and studio analytics shall support gallery usage, sharing activity, and storage consumption reporting.

## 17. APIs, Webhooks, Integrations, and Operational Requirements

- GAL-API-001: RawDrive shall expose secure API resources for galleries and asset metadata.
- GAL-API-002: Upload APIs may remain separate operationally, but the gallery product shall expose coherent end-to-end states for uploaded assets.
- GAL-API-003: API authentication shall support scoped API keys and enterprise OAuth where required.
- GAL-API-004: API and webhook surfaces shall support rate limiting and abuse protection.
- GAL-API-005: Supported gallery events shall include gallery created, updated, published, viewed, asset added, asset removed, download completed, proofing submitted, and album approved.
- GAL-API-006: Webhook payloads shall support signed delivery with HMAC verification or equivalent anti-spoofing controls.
- GAL-API-007: Webhook delivery shall support retry, backoff, and dead-letter visibility for failed integrations.
- GAL-API-008: Studios shall be able to inspect recent API and webhook activity related to galleries.
- GAL-API-009: Gallery operations shall support standardized error responses with machine-readable codes, human-readable messages, request IDs, and timestamps.
- GAL-API-010: Public gallery endpoints shall use consistent authorization, validation, and error formatting behavior.
- GAL-API-011: Gallery service architecture shall support integration with upload services, AI services, notifications, and billing-aware plan enforcement.
- GAL-API-012: Operational monitoring shall include health checks, request tracing, and failure visibility for gallery-critical flows.

## 18. Explicit Must-Haves That Cannot Be Left Out

- GAL-MUST-001: Secure resumable upload is mandatory.
- GAL-MUST-002: Thumbnail creation and progressive image delivery are mandatory.
- GAL-MUST-003: Cloudflare R2 managed storage for photographers is mandatory.
- GAL-MUST-004: BYOS being restricted to enterprise customers only is mandatory.
- GAL-MUST-005: Real storage calculations stored in the database are mandatory.
- GAL-MUST-006: Storage utilization shown clearly in user account details is mandatory.
- GAL-MUST-007: Cover photo system and design studio are mandatory.
- GAL-MUST-008: Client sharing, proofing, favorites, selections, and downloads are mandatory.
- GAL-MUST-009: Password, PIN, lock, and privacy controls are mandatory.
- GAL-MUST-010: PWA-quality mobile gallery experience is mandatory.
- GAL-MUST-011: AI search, FaceID entry, and smart curation are strategic differentiators and shall remain first-class gallery features.
- GAL-MUST-012: Gallery analytics and owner visibility into engagement and storage are mandatory.
