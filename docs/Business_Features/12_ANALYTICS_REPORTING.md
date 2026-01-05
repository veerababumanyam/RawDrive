# Analytics & Reporting

## Business Value Proposition

Analytics & Reporting provides photographers, studios, and enterprises with comprehensive insights into gallery performance, client engagement, revenue metrics, and business trends to drive data-informed decisions.

### Key Business Benefits
- **Business Insights**: Understand business performance
- **Client Engagement**: Track client interactions and engagement
- **Revenue Tracking**: Monitor revenue and growth
- **Trend Analysis**: Identify trends and patterns
- **Decision Making**: Data-driven decision making

> **Reference Documentation**:
> - `docs/Features/SharedDashboard.md` - Shared Dashboard specification
> - `.kiro/steering/product.md` - Success metrics

---

## Key Capabilities

### Dashboard Analytics

**Overview Metrics**:
- Total galleries
- Total photos/videos
- Storage used
- Active clients
- Recent activity

**Quick Stats**:
- Views this week/month
- Downloads this week/month
- New clients
- Revenue (if billing enabled)

### Gallery Analytics

**View Tracking**:
- Total views
- Unique visitors
- Views by day/week/month
- Geographic distribution
- Device breakdown (mobile/desktop)

**Engagement Metrics**:
- Favorites count
- Comments count
- Downloads count
- Average session duration
- Bounce rate

**Share Link Analytics**:
- Link access count
- Gate conversion (PIN/email)
- Expiry tracking
- QR code scans

### Client Analytics

**Activity Tracking**:
- Gallery views per client
- Favorites per client
- Downloads per client
- Comments per client
- Last activity date

**Engagement Score**:
- Calculated from activity
- Identifies engaged clients
- Churn risk indicators

**Lifetime Value**:
- Total revenue per client
- Average order value
- Repeat purchase rate

### Invitation Analytics

**Delivery Metrics**:
- Invitations sent
- Open rate
- Click rate
- Bounce rate

**RSVP Metrics**:
- Response rate
- Yes/No/Maybe breakdown
- Response time distribution
- Guest count tracking

### Revenue Analytics (Business+)

**Subscription Metrics**:
- MRR (Monthly Recurring Revenue)
- ARR (Annual Recurring Revenue)
- Churn rate
- Expansion revenue

**Transaction Metrics**:
- Total revenue
- Revenue by period
- Average transaction value
- Payment success rate

---

## Technical Architecture

### Backend Services

```
analytics_service.py
├── Aggregate analytics
├── Calculate metrics
├── Generate reports
└── Track events

dashboard_service.py
├── Dashboard data aggregation
├── Metrics calculation
├── Chart data generation
└── Cache management

gallery_analytics_service.py
├── Track gallery views
├── Aggregate engagement
├── Calculate trends
└── Generate reports

client_activity_service.py
├── Track client activity
├── Calculate engagement scores
├── Identify trends
└── Generate reports
```

### API Endpoints

```
# Dashboard
GET    /api/v1/dashboard                  # Get dashboard data
GET    /api/v1/dashboard/metrics          # Get key metrics
GET    /api/v1/dashboard/charts           # Get chart data

# Gallery Analytics
GET    /api/v1/galleries/{id}/analytics   # Gallery analytics
GET    /api/v1/galleries/{id}/analytics/views
GET    /api/v1/galleries/{id}/analytics/engagement

# Client Analytics
GET    /api/v1/clients/analytics          # Client analytics
GET    /api/v1/clients/{id}/analytics     # Individual client

# Invitation Analytics
GET    /api/v1/invitations/{id}/analytics # Invitation analytics

# Reports
GET    /api/v1/reports                    # List reports
POST   /api/v1/reports                    # Create report
GET    /api/v1/reports/{id}               # Get report
POST   /api/v1/reports/{id}/export        # Export report

# Data Export
POST   /api/v1/exports                    # Create export
GET    /api/v1/exports/{id}               # Get export status
GET    /api/v1/exports/{id}/download      # Download export
```

### Database Schema

```sql
analytics_events
├── id (UUID)
├── workspace_id (UUID)
├── event_type (VARCHAR)
├── resource_type (VARCHAR)
├── resource_id (UUID)
├── user_id (UUID)
├── visitor_id (UUID)
├── created_at (TIMESTAMPTZ)
└── metadata (JSONB)

gallery_analytics
├── id (UUID)
├── gallery_id (UUID)
├── workspace_id (UUID)
├── total_views (INTEGER)
├── unique_viewers (INTEGER)
├── total_favorites (INTEGER)
├── total_downloads (INTEGER)
├── total_comments (INTEGER)
├── updated_at (TIMESTAMPTZ)
└── metadata (JSONB)

client_analytics
├── id (UUID)
├── client_id (UUID)
├── workspace_id (UUID)
├── total_galleries_viewed (INTEGER)
├── total_favorites (INTEGER)
├── total_downloads (INTEGER)
├── engagement_score (DECIMAL)
├── lifetime_value (DECIMAL)
├── last_activity_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)

custom_reports
├── id (UUID)
├── workspace_id (UUID)
├── name (VARCHAR)
├── report_config (JSONB)
├── schedule (VARCHAR)
├── recipients (TEXT[])
├── created_by (UUID)
└── created_at (TIMESTAMPTZ)
```

---

## Scalability Considerations

- **Batch Aggregation**: Aggregate metrics in batches
- **Caching**: Cache frequently accessed metrics in Redis
- **Pre-computation**: Pre-compute common metrics
- **Pagination**: Paginate large result sets

---

## Integration Points

- **Gallery Management**: Gallery view and engagement tracking
- **Client CRM**: Client activity and engagement
- **Invitations**: Invitation delivery and RSVP tracking
- **Billing**: Revenue and subscription metrics

---

## Implementation Status

- Completed: Basic dashboard, gallery view tracking
- In Progress: Client analytics, engagement scoring
- Planned: Custom reports, scheduled exports
