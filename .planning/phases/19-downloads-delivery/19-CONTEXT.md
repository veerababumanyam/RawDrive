# Phase 19: Downloads & Delivery - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement batch ZIP downloads with server-side generation, download size options (web/print/original), gallery expiration with reminder emails, and download tracking dashboard. The only phase with significant new backend work.

</domain>

<decisions>
## Implementation Decisions

### Download Architecture
- ZIP generation: server-side async via Celery worker, upload result to R2, return download link
- Size variants: on-demand resize via Pillow at download time with R2 cache — web(1920px)/print(4000px)/original
- Download policy: backend enforces per gallery settings (view_only, web_only, watermarked_only, original_allowed)
- Progress tracking: Redis key per download job, polled via API endpoint, SSE for real-time updates to frontend

### Expiration & Tracking
- Gallery expiration: `expires_at` column on galleries table, middleware check on access, expired galleries show "Gallery expired" page
- Reminder emails: notifications-service Celery beat task scanning for upcoming expirations (7d, 1d, expired)
- Download tracking: `gallery_downloads` table logging visitor/asset/size/timestamp, dashboard view in photographer's gallery detail
- Download UI: modal with size selector (web/print/original based on policy), progress bar, completion notification with download link

### Claude's Discretion
- ZIP file naming convention
- Download size exact pixel dimensions and quality settings
- Expiration grace period (if any)
- Download rate limiting strategy
- Email template design for expiration reminders

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `services/gallery-service/src/services/r2_service.py` — R2 upload/download with presigned URLs
- `backend/src/app/workers/` — existing Celery worker infrastructure
- `services/notifications-service/` — email sending with templates
- `services/gallery-service/src/schemas/gallery.py` — DownloadRequest schema exists but ZIP generation not implemented
- Gallery download_policy already in gallery model

### Integration Points
- New Celery task in gallery-service for ZIP generation
- New API endpoint for download job status polling
- New migration for expires_at and gallery_downloads table
- Frontend download modal integrates with GalleryInteractionContext
- Expiration check middleware in public gallery route

</code_context>

<specifics>
## Specific Ideas

- Research flagged ZIP worker architecture as needing research before planning — using Celery (already in stack)
- `client-zip` was considered for client-side but server-side is better for large galleries
- Download tracking feeds into Phase 20's gallery analytics

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
