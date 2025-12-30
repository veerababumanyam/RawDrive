# Feature Spec: Client Selection Sync to Photographer Gallery

**Feature Branch**: `015-client-selection-sync`
**Date**: 2025-12-30
**Priority**: P1 (High - Critical Business Value)
**Status**: Draft

---

## Executive Summary

Enable photographers to see real-time aggregated client activity (favorites and picks) directly in their gallery dashboard. When clients interact with photos via Magic Link, photographers should immediately know which photos are most popular and which ones clients have selected for delivery - without needing to manually check or wait for client communication.

---

## Problem Statement

### Current Pain Points

1. **Blind Photographer Workflow**: Photographers create and share galleries but have no visibility into client preferences until clients explicitly communicate their choices.

2. **Lost Revenue Opportunity**: Without knowing which photos resonate most, photographers miss opportunities for targeted upselling (prints, albums, additional edits).

3. **Delayed Delivery Pipeline**: Photographers must wait for clients to email their selections, causing delays in the proofing-to-delivery workflow.

4. **Multi-Client Confusion**: When galleries are shared with multiple stakeholders (bride, groom, family members), there's no aggregated view of consensus favorites.

5. **No Engagement Metrics**: Photographers can't tell if clients have even looked at their galleries, leading to follow-up guesswork.

### Current State

- **Data EXISTS but is siloed**: `visitor_favorites`, `visitor_selections`, and `client_interactions` tables store all client activity
- **Flags are binary**: `gallery_assets.is_favorited` and `is_selected` show IF something was interacted with, but not BY HOW MANY or BY WHOM
- **No real-time updates**: Photographers must refresh to see changes
- **No aggregation dashboard**: No centralized view of client activity across photos

---

## Proposed Solution

### Core Concept: "Client Activity Dashboard"

Create a unified system that:
1. **Aggregates** selections/favorites across all visitors per gallery
2. **Displays** real-time activity indicators on photo thumbnails
3. **Notifies** photographers of new client activity
4. **Provides** a dedicated analytics view for client engagement

---

## User Stories

### US1: See Aggregated Selection Counts on Photos (P1)
**As a** photographer viewing my gallery
**I want to** see how many clients have favorited or selected each photo
**So that** I can quickly identify the most popular shots

**Acceptance Criteria:**
- [ ] Each photo thumbnail displays a favorites count badge (e.g., "3 ❤️")
- [ ] Each photo thumbnail displays a picks count badge (e.g., "2 ✓")
- [ ] Badges only appear when count > 0
- [ ] Counts update when page refreshes
- [ ] Badges are visible in all view modes (grid, masonry, list)

### US2: Sort/Filter by Client Popularity (P1)
**As a** photographer reviewing client selections
**I want to** sort photos by most favorited/picked
**So that** I can quickly see client consensus favorites

**Acceptance Criteria:**
- [ ] New sort option: "Most Favorited"
- [ ] New sort option: "Most Picked"
- [ ] Sort is available in gallery toolbar
- [ ] Default sort remains "Custom Order"

### US3: See Which Clients Selected Each Photo (P2)
**As a** photographer
**I want to** see which specific clients favorited/picked each photo
**So that** I can understand individual client preferences

**Acceptance Criteria:**
- [ ] Clicking on favorites count shows popover/tooltip with client names
- [ ] Clicking on picks count shows popover/tooltip with client names
- [ ] Shows timestamp of when each client made the selection
- [ ] Anonymous visitors show as "Anonymous Visitor" or email if registered

### US4: Receive Notifications for New Client Activity (P2)
**As a** photographer
**I want to** be notified when clients mark new favorites/picks
**So that** I know when clients are actively reviewing my work

**Acceptance Criteria:**
- [ ] In-app notification when client favorites/picks a photo
- [ ] Notification batched (not per-photo) - "Client [name] selected 5 photos"
- [ ] Notification links to gallery with selections highlighted
- [ ] Can configure notification preferences (immediate, daily digest, off)

### US5: View Client Activity Timeline (P3)
**As a** photographer
**I want to** see a timeline of all client activity on my gallery
**So that** I can track engagement over time

**Acceptance Criteria:**
- [ ] New "Activity" tab in gallery detail page
- [ ] Shows chronological list of client interactions
- [ ] Includes: views, favorites, picks, downloads
- [ ] Can filter by client, interaction type, date range

### US6: Gallery-Level Activity Summary (P1)
**As a** photographer
**I want to** see overall client engagement stats for my gallery
**So that** I can quickly assess gallery performance

**Acceptance Criteria:**
- [ ] GalleryStats component shows: "5 Client Picks" badge
- [ ] GalleryStats shows: "12 Client Favorites" badge
- [ ] Shows unique visitor count: "3 Clients Viewed"
- [ ] Stats update on page refresh

---

## Technical Requirements

### Backend Requirements

#### B1: New Aggregation Endpoint
```
GET /v1/workspaces/{workspace_id}/galleries/{gallery_id}/client-activity/summary
```
Returns:
```json
{
  "total_unique_visitors": 5,
  "total_favorites": 23,
  "total_picks": 12,
  "assets": [
    {
      "asset_id": "uuid",
      "favorites_count": 3,
      "picks_count": 2,
      "favorited_by": ["visitor1_name", "visitor2_name", "Anonymous"],
      "picked_by": ["visitor1_name"]
    }
  ]
}
```

#### B2: Enhance Assets List Response
Extend `GET /v1/workspaces/{workspace_id}/galleries/{gallery_id}/assets` response:
```json
{
  "items": [
    {
      "asset_id": "uuid",
      "client_favorites_count": 3,  // NEW: aggregated across visitors
      "client_picks_count": 2,       // NEW: aggregated across visitors
      // ... existing fields
    }
  ]
}
```

#### B3: Real-Time Updates (WebSocket)
Emit events when client activity occurs:
```json
{
  "event": "gallery:client_activity",
  "data": {
    "gallery_id": "uuid",
    "asset_id": "uuid",
    "type": "favorite" | "pick",
    "action": "added" | "removed",
    "visitor_name": "John Doe",
    "new_count": 3
  }
}
```

#### B4: Activity Timeline Endpoint
```
GET /v1/workspaces/{workspace_id}/galleries/{gallery_id}/client-activity/timeline
```
Returns paginated list of `client_interactions` with visitor info.

#### B5: Materialized View for Performance
Extend or create materialized view for fast aggregation queries:
- Pre-compute favorites/picks counts per asset per gallery
- Refresh on write or periodically (every 5 minutes)

### Frontend Requirements

#### F1: Photo Card Badges
- Add `ClientActivityBadge` component to `PhotoCard`
- Show favorites count with heart icon
- Show picks count with checkmark icon
- Position: top-right, stacked vertically
- Only show if count > 0

#### F2: Gallery Stats Enhancement
- Update `GalleryStats` component to show:
  - Client favorites count (heart icon)
  - Client picks count (check icon)
  - Unique visitors count (users icon)

#### F3: Sort Options
- Add to `GalleryToolbar`:
  - Sort by "Most Favorited"
  - Sort by "Most Picked"

#### F4: Client Details Popover
- Clicking on favorites/picks badge opens popover
- Shows list of clients who made that selection
- Shows timestamp for each selection

#### F5: Activity Tab (Optional P3)
- New tab in gallery detail page
- Infinite scroll timeline of interactions
- Filter by type, client, date

### Database Changes

#### D1: New Columns on gallery_assets (optional denormalization)
```sql
ALTER TABLE gallery_assets ADD COLUMN client_favorites_count INTEGER DEFAULT 0;
ALTER TABLE gallery_assets ADD COLUMN client_picks_count INTEGER DEFAULT 0;
```

#### D2: Update Materialized View
```sql
CREATE OR REPLACE MATERIALIZED VIEW gallery_client_activity_summary AS
SELECT
  ga.gallery_id,
  ga.asset_id,
  COUNT(DISTINCT CASE WHEN ci.type = 'favorite' THEN ci.actor->>'visitor_id' END) as favorites_count,
  COUNT(DISTINCT CASE WHEN ci.type = 'select' THEN ci.actor->>'visitor_id' END) as picks_count
FROM gallery_assets ga
LEFT JOIN client_interactions ci ON ga.gallery_id = ci.gallery_id AND ga.asset_id = ci.asset_id
GROUP BY ga.gallery_id, ga.asset_id;
```

---

## UI/UX Design

### Photo Card with Activity Badges

```
┌─────────────────────────────────┐
│  [checkbox]           ❤️ 3  ✓ 2│  ← Client activity badges (top-right)
│                                 │
│                                 │
│         [Photo]                 │
│                                 │
│                                 │
│─────────────────────────────────│
│ [View] [Download] [Share] [...]│  ← Action bar (on hover)
└─────────────────────────────────┘
```

### Gallery Stats Bar

```
[📷 124 Photos] [❤️ 23 Favorites] [✓ 12 Picks] [👥 5 Clients] [✨ 95% AI Tagged]
```

### Sort Dropdown

```
Sort by:
├─ Custom Order (default)
├─ Newest First
├─ Oldest First
├─ Filename A-Z
├─ Most Favorited     ← NEW
└─ Most Picked        ← NEW
```

### Client Activity Popover

```
┌─────────────────────────────────┐
│ ❤️ Favorited by 3 clients       │
├─────────────────────────────────┤
│ 👤 Sarah Johnson     Dec 29     │
│ 👤 Mike Smith        Dec 28     │
│ 👤 Anonymous         Dec 27     │
└─────────────────────────────────┘
```

---

## Performance Considerations

1. **Materialized View**: Use PostgreSQL materialized view for aggregation queries to avoid expensive JOINs on every page load.

2. **Incremental Updates**: When client toggles favorite/pick, update materialized view incrementally rather than full refresh.

3. **Caching**: Cache activity summary in Redis for 1 minute to reduce database load.

4. **Pagination**: Timeline endpoint uses cursor-based pagination for infinite scroll.

5. **WebSocket Efficiency**: Batch WebSocket notifications - don't emit per-photo, emit per-session after 5-second debounce.

---

## Security Considerations

1. **Workspace Isolation**: All queries MUST filter by workspace_id to prevent cross-tenant data leakage.

2. **Visitor Privacy**: Only show visitor names to photographers if visitor registered with email. Otherwise show "Anonymous Visitor".

3. **Rate Limiting**: Activity timeline endpoint rate-limited to prevent abuse.

---

## Migration Strategy

### Phase 1: Backend Infrastructure (Week 1)
- Create materialized view
- Add aggregation endpoint
- Extend assets list response

### Phase 2: Frontend Display (Week 1-2)
- Add activity badges to PhotoCard
- Update GalleryStats
- Add sort options

### Phase 3: Real-Time Updates (Week 2)
- Implement WebSocket events
- Add in-app notifications

### Phase 4: Activity Timeline (Week 3 - Optional)
- Create activity tab
- Implement timeline endpoint

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Photographer engagement | +20% gallery revisits | Analytics |
| Client-photographer response time | -50% time to first selection review | Time tracking |
| Feature adoption | 60% of active galleries | Usage analytics |
| API performance | < 100ms aggregation query | APM monitoring |

---

## Out of Scope

- Email notifications (future enhancement)
- SMS notifications
- Export client selections to PDF/CSV
- Automated delivery workflow based on picks
- Client comparison view (side-by-side)

---

## Dependencies

- Existing `client_interactions` table (Migration 0002)
- Existing `visitors` table (Migration 0023)
- Existing `favorite_lists` infrastructure (Migration 0055)
- WebSocket infrastructure (existing)

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Performance degradation with large galleries | Medium | High | Materialized view + caching |
| Real-time sync delays | Low | Medium | Optimistic UI updates |
| Privacy concerns | Low | High | Clear visitor consent, anonymization |

---

## References

- Research: `specs/015-client-selection-sync/research.md`
- Existing migrations: 0002, 0011, 0023, 0055
- Related feature: 012-client-favorites
- Related fix: 014-fix-magic-link-grid
