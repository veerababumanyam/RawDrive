# Phase 18: Client Interactions & Gallery UX - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire existing backend proofing APIs to new frontend UI for client favorites/selections/comments in public galleries, add WebSocket real-time sync, and implement gallery management UX improvements (AI tooltips, bulk actions, settings presets, sub-gallery permissions).

</domain>

<decisions>
## Implementation Decisions

### Client Interactions
- Heart icon overlay on each photo (in gallery grid and player) with optimistic toggle via GalleryInteractionContext
- Selection quota: progress bar below gallery header showing "12 of 50 selected" with color change at 90%
- Comments: inline panel in GalleryPlayer (slide from right), per-photo threaded comments
- WebSocket: use existing LiveSync WebSocket infrastructure from notifications-service for real-time favorite/selection sync
- Backend APIs already exist (proofing service refactored in Phase 15) — this is frontend wiring only

### Gallery UX (GALUX)
- AI tooltips: tooltip on hover (desktop) / long-press (mobile) with 1-2 sentence description for each AI tool
- Bulk action toolbar: sticky bottom bar appearing when ≥1 photo selected, with batch edit/tag/download/delete buttons
- Gallery settings presets: one-click preset buttons (Proofing, Delivery, Sharing, Premium Delivery) configuring access+downloads+watermark
- Sub-gallery permissions: badge showing "Inherits from parent" with override toggle per sub-gallery

### Claude's Discretion
- Comment threading depth (flat vs nested)
- Bulk action confirmation patterns
- Preset configuration values for each preset type
- WebSocket event payload structure
- Animation timing for interaction feedback

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/contexts/GalleryInteractionContext.tsx` — already has favorites/selections state from Phase 15
- `services/gallery-service/src/services/proofing_service.py` — visitor-scoped proofing with upsert (Phase 15)
- `services/gallery-service/src/api/v1/public/proofing.py` — proofing API endpoints
- `frontend/src/components/features/gallery/player/GalleryPlayer.tsx` — player from Phase 17
- Existing WebSocket infrastructure in livesync-service and notifications-service

### Integration Points
- GalleryInteractionContext.toggleFavorite() → proofing API → WebSocket broadcast
- GalleryPlayer panel slot for comments
- Gallery settings page for presets and sub-gallery permissions
- AI toolbar in gallery management view for tooltips

</code_context>

<specifics>
## Specific Ideas

- Research confirmed all proofing backend APIs exist — zero new endpoints needed for favorites/selections
- Comments may need a new API endpoint in proofing service
- Bulk actions build on existing multi-select patterns in gallery management

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
