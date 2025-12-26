# Shared Dashboard - Security & Sharing Dashboard

> **Route:** `/workspace/shared`
> **Status:** Proposed
> **Priority:** High
> **Technical Spec:** [shared_dashboard.json](../TechnicalSpecs/shared_dashboard.json)

## Overview

A centralized Security & Sharing Dashboard that provides photographers with a single view of **all active share links** across their workspace. Instead of hunting through individual galleries to see what is public, this view lists all active Magic Links.

### Product Principles

| Principle | How We Address It |
|-----------|-------------------|
| **Trust and control** | Users see every active link with full visibility into access policies |
| **Audit & compliance** | Complete record of who accessed what and when |
| **Security-first** | Kill Switch capability for immediate bulk revocation |

## Architecture

### Leveraging Existing Infrastructure

The good news: **No new database tables required**. The existing `magic_links` and `magic_link_accesses` tables provide all the data we need. The dashboard is an aggregation view.

```
┌─────────────────────────────────────────────────────────────┐
│                    Shared Dashboard                         │
│  /workspace/shared                                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Active: 12  │  │ Views: 847  │  │ Visitors: 234│        │
│  │   links     │  │   (30d)     │  │    (30d)     │        │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Filter: [Active ▼]  Gallery: [All ▼]  🔍 Search...     ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ ☑ │ Gallery        │ Label    │ Policy │ Views │ Exp   ││
│  │───┼────────────────┼──────────┼────────┼───────┼───────││
│  │ ☐ │ Smith Wedding  │ Family   │ 🔒📧   │ 234   │ 7d    ││
│  │ ☐ │ Johnson Corp   │ Preview  │ 📧     │ 89    │ Never ││
│  │ ☐ │ Nature Shots   │ Print QR │ -      │ 1,203 │ 30d   ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  [Revoke Selected]  [Export]                    Page 1 of 3 │
└─────────────────────────────────────────────────────────────┘
```

### Database Changes

Only new **indexes** needed for efficient aggregation:

```sql
-- Fast filtering of active links across workspace
CREATE INDEX idx_magic_links_workspace_status
ON magic_links(workspace_id, status);

-- Efficient sorting by creation date for dashboard
CREATE INDEX idx_magic_links_workspace_created
ON magic_links(workspace_id, created_at DESC);
```

## API Design

### New Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/workspaces/{id}/shared/links` | List all magic links across workspace |
| `GET` | `/api/v1/workspaces/{id}/shared/stats` | Aggregate sharing statistics |
| `POST` | `/api/v1/workspaces/{id}/shared/bulk-revoke` | Kill Switch - revoke multiple links |
| `GET` | `/api/v1/workspaces/{id}/shared/links/{link_id}` | Detailed link info with access log |
| `DELETE` | `/api/v1/workspaces/{id}/shared/links/{link_id}` | Revoke single link |
| `GET` | `/api/v1/workspaces/{id}/shared/export` | Export for compliance audit |

### Key Response Shape: List Links

```typescript
interface SharedLinksResponse {
  data: {
    link_id: string;
    gallery_id: string;
    gallery_title: string;
    label: string | null;
    status: 'active' | 'expired' | 'revoked';
    expires_at: string | null;
    access_count: number;
    last_accessed_at: string | null;
    access_policy: {
      password_protected: boolean;
      pin_protected: boolean;
      email_required: boolean;
      download_policy: DownloadPolicy;
    };
    recent_visitors: {
      email: string | null;
      country_code: string | null;
      device_type: string;
      accessed_at: string;
    }[];
    created_at: string;
  }[];
  meta: {
    total: number;
    active_count: number;
    expired_count: number;
    revoked_count: number;
  };
}
```

## Frontend Components

### Component Tree

```
SharedDashboardPage
├── ShareStatsOverview
│   ├── StatCard (Active Links)
│   ├── StatCard (Total Views)
│   ├── StatCard (Unique Visitors)
│   └── MiniChart (Trend)
├── ShareLinkFilters
│   ├── StatusFilter
│   ├── GalleryFilter
│   └── SearchInput
├── ShareLinkTable
│   ├── TableHeader (sortable)
│   ├── ShareLinkRow[]
│   │   ├── Checkbox
│   │   ├── GalleryInfo
│   │   ├── AccessPolicyBadge
│   │   ├── ViewCount
│   │   ├── ExpiryBadge
│   │   └── RowActions
│   └── Pagination
├── BulkActionBar (when items selected)
│   └── BulkRevokeDialog
└── ShareLinkDetail (sidebar/modal)
    ├── LinkInfo
    ├── GalleryContext
    ├── AccessTimeline
    └── QuickActions
```

### New Files to Create

**Pages:**
- `frontend/src/pages/workspace/SharedDashboardPage.tsx`

**Components:**
- `frontend/src/components/features/shared/ShareLinkTable.tsx`
- `frontend/src/components/features/shared/ShareLinkRow.tsx`
- `frontend/src/components/features/shared/ShareLinkDetail.tsx`
- `frontend/src/components/features/shared/ShareStatsOverview.tsx`
- `frontend/src/components/features/shared/ShareLinkFilters.tsx`
- `frontend/src/components/features/shared/BulkRevokeDialog.tsx`
- `frontend/src/components/features/shared/AccessPolicyBadge.tsx`

**Hooks:**
- `frontend/src/hooks/useSharedLinks.ts`
- `frontend/src/hooks/useShareStats.ts`

**Services:**
- `frontend/src/services/sharedService.ts`

## Key Features

### P0 - Must Have

| Feature | Description |
|---------|-------------|
| **Aggregated Link View** | See all magic links across all galleries in one table |
| **Status Filtering** | Filter by active, expired, revoked |
| **Single Revocation** | Revoke individual links with confirmation |
| **Bulk Revocation** | Kill Switch - select and revoke multiple links |
| **Access Policy Display** | Show 🔒📧🔑 icons for password, email, PIN |

### P1 - Should Have

| Feature | Description |
|---------|-------------|
| **Gallery Filtering** | Filter links by specific gallery |
| **Search** | Search by link label or gallery title |
| **Expiry Warnings** | Visual indicators for links expiring soon |
| **Statistics Overview** | Aggregate views, visitors, device breakdown |

### P2 - Nice to Have

| Feature | Description |
|---------|-------------|
| **Recent Visitors Preview** | Show last 3 visitors inline |
| **Access Timeline** | Detailed access log in detail panel |
| **Export** | Download sharing data as CSV/JSON |

## UX Flows

### 1. Audit All Active Links

1. User navigates to `/workspace/shared`
2. Dashboard loads with "Active" filter selected by default
3. Stats overview shows total active links, views, visitors
4. Table displays all active links sorted by creation date
5. User can click column headers to sort
6. User can use search to find specific links

### 2. Emergency Bulk Revocation (Kill Switch)

1. User identifies compromised or unwanted links
2. User selects multiple links via checkboxes
3. User clicks "Revoke Selected" button
4. Confirmation dialog appears:
   > **Revoke 5 links?**
   > This will immediately stop access to these galleries via these links.
   > This action cannot be undone.
5. User confirms action
6. Links are immediately revoked
7. Toast: "5 links revoked successfully"
8. Table updates to show revoked status

### 3. Investigate Link Activity

1. User clicks on a link row in the table
2. Detail panel slides in from right
3. Panel shows:
   - Link label and gallery context
   - Access policy (password, PIN, email, download)
   - Statistics (total views, unique visitors)
   - Access timeline with visitor details
4. User can copy link URL, view gallery, or revoke

## Implementation Phases

### Phase 1: Core Dashboard (3-4 days)

**Backend:**
- `GET /shared/links` endpoint with filtering, sorting, pagination
- `DELETE /shared/links/{link_id}` revocation

**Frontend:**
- `SharedDashboardPage` component
- `ShareLinkTable` with basic columns
- Status filter dropdown
- Single link revocation

### Phase 2: Kill Switch & Stats (2-3 days)

**Backend:**
- `POST /shared/bulk-revoke` endpoint
- `GET /shared/stats` aggregate statistics

**Frontend:**
- Bulk selection UI
- `BulkRevokeDialog` confirmation
- `ShareStatsOverview` component

### Phase 3: Detail View & Polish (2-3 days)

**Backend:**
- `GET /shared/links/{link_id}` with access log

**Frontend:**
- `ShareLinkDetail` panel
- Access timeline component
- Gallery filter, search
- Mobile responsive layout

### Phase 4: Export & Extras (1-2 days)

**Backend:**
- `GET /shared/export` endpoint

**Frontend:**
- Export button and format selector
- Expiry warning badges
- Testing and bug fixes

## Security Considerations

- All endpoints require authentication
- Workspace isolation enforced at API layer
- Bulk revocation limited to 100 links per request
- Audit log entries for all revocations
- Rate limiting on list endpoints (100 req/min)
- No PII in logs (user IDs only)

## Accessibility Requirements

- All interactive elements keyboard accessible
- Proper ARIA labels for table, buttons, filters
- Focus management when opening/closing detail panel
- Screen reader announcements for bulk actions
- Color contrast meeting WCAG 2.1 AA for status badges
- Touch targets minimum 44x44px on mobile

## Related Documentation

- [Magic Link Technical Spec](./MagicLink.md)
- [Gallery API Documentation](../api/galleries.md)
- [Design System](../../.claude/skills/design-system/SKILL.md)
