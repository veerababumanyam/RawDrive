# Notification Preferences Feature Specification

## Overview

This document specifies the comprehensive notification preferences system that allows photographers/users to manage how and when they receive notifications about workspace activity. The system provides granular control over notification categories, delivery channels, frequency, and individual event types.

## Goals

1. **User Control**: Provide photographers/users with granular control over notification preferences
2. **Category-Based Organization**: Group notifications by logical categories (Gallery, Client Interactions, Asset Processing, RSVP, etc.)
3. **Multi-Channel Support**: Allow users to choose delivery channels (Email, In-App) per category
4. **Frequency Control**: Support instant delivery or digest modes (hourly, daily, weekly) per category
5. **Comprehensive Coverage**: Include all user-requested notification types:
   - Client interactions (gallery published, updated, clients view/select photos)
   - Client activity (log in, download files, submit selections)
   - Asset processing (uploads complete, AI processing finishes)
   - RSVP management (invitation responses, guest activity, selections)
6. **Backend Integration**: Integrate with notifications-service preferences API
7. **Backward Compatibility**: Maintain compatibility with existing notification preferences during migration

## User Requirements

### Notification Categories

Users should be able to control notifications for the following categories:

#### 1. Gallery Activity
- Gallery Published - When a gallery is published or made publicly accessible
- Gallery Updated - When new photos are added to an existing gallery
- Gallery Shared - When someone shares a gallery with another person
- Gallery Expiring Soon - Warning before a gallery expires
- Gallery Expired - Notification when a gallery has expired
- Selection Approved - When photographer approves client selections

#### 2. Client Interactions
- Gallery Commented - When someone comments on a gallery
- Gallery Favorited - When a client favorites photos in a gallery
- Gallery Downloaded - When a client downloads from a gallery
- Selection Submitted - When client submits their photo selections
- Client Registered - When a new client registers
- Client First Login - When a client logs in for the first time
- Client Message - When a client sends a message
- Client Reply - When a client replies to a message
- Client Download Complete - When a client completes a download

#### 3. Asset Processing (New Category)
- Upload Started - When file upload begins
- Upload Complete - When file upload finishes successfully
- Processing Started - When asset processing begins (thumbnails, variants)
- Processing Complete - When asset processing finishes successfully
- Processing Failed - When asset processing encounters an error
- AI Analysis Complete - When AI analysis/processing completes

#### 4. RSVP Management
- RSVP Received - When a guest submits or updates an RSVP
- RSVP Updated - When RSVP information changes
- RSVP Reminder - Reminder to respond to invitation
- RSVP Digest - Summary of RSVP responses

#### 5. Invitations
- Invitation Sent - When an invitation is sent to a recipient
- Invitation Accepted - When an invitation is accepted
- Invitation Declined - When an invitation is declined
- Invitation Expired - When an invitation expires
- Invitation Reminder - Reminder about pending invitation
- Invitation Cancelled - When an invitation is cancelled

#### 6. Billing (Read-Only, Transactional)
- Payment Success - When payment is successfully captured
- Payment Failed - When payment fails after retries
- Subscription Created - When a new subscription is created
- Subscription Renewed - When subscription renews
- Invoice Created - When an invoice is generated
- Invoice Paid - When an invoice is paid
- Invoice Overdue - When an invoice is past due
- Trial Ending - When trial period is ending soon

#### 7. System Alerts (Read-Only, Transactional)
- Security Alerts - Account security notifications
- System Maintenance - Platform maintenance announcements
- Storage Warnings - Storage quota warnings
- Feature Announcements - New feature announcements

### Control Options

For each category (except Billing and System Alerts), users should be able to:

1. **Enable/Disable Category**: Master toggle for entire category
2. **Select Channels**: Choose which channels receive notifications
   - Email notifications
   - In-App notifications
   - (Future: SMS, Push)
3. **Set Frequency**: Choose delivery timing
   - Instant - Deliver immediately
   - Hourly Digest - Batch into hourly digests
   - Daily Digest - Batch into daily digest
   - Weekly Digest - Batch into weekly digest
   - Never - Disable category entirely
4. **Individual Event Toggles**: Enable/disable specific event types within category
5. **Advanced Settings**:
   - Quiet Hours - Define time windows when non-urgent notifications are held
   - Digest Schedule - Set delivery times for daily/weekly digests
   - Timezone - Configure timezone for scheduling

### UI Requirements

1. **Layout**: Category-based cards with expandable sections
2. **Visual Hierarchy**: Clear grouping and indentation
3. **Accessibility**: Keyboard navigation, screen reader support, ARIA labels
4. **Feedback**: Success/error toasts, loading states, optimistic updates
5. **Responsive**: Works on desktop, tablet, and mobile
6. **Consistent Design**: Matches existing design system (glass-card, gradients, etc.)

## Technical Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  WorkspaceNotificationSettingsPanel                    │  │
│  │  - Category-based UI                                    │  │
│  │  - Preference state management                          │  │
│  └───────────────────────────────────────────────────────┘  │
│                         │                                    │
│                         ▼                                    │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  NotificationPreferencesService                        │  │
│  │  - API client for preferences endpoints                │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼ HTTP/REST
┌─────────────────────────────────────────────────────────────┐
│              Traefik API Gateway                             │
│              Route: /api/v1/*/preferences/*                  │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│         Notifications Service (Port 8007)                    │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Preferences API                                       │  │
│  │  GET  /api/v1/workspaces/{id}/preferences/me          │  │
│  │  PATCH /api/v1/workspaces/{id}/preferences/me         │  │
│  │  GET  /api/v1/workspaces/{id}/preferences/effective   │  │
│  │  GET  /api/v1/workspaces/{id}/preferences/event-types │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Event Catalog                                         │  │
│  │  - Event definitions by category                       │  │
│  │  - Category metadata                                    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### API Endpoints

#### Get User Preferences
```
GET /api/v1/workspaces/{workspace_id}/preferences/me
Response: PreferenceResponse
```

#### Update User Preferences
```
PATCH /api/v1/workspaces/{workspace_id}/preferences/me
Request: PreferenceUpdateRequest
Response: PreferenceResponse
```

#### Get Effective Preferences (Merged with Workspace Defaults)
```
GET /api/v1/workspaces/{workspace_id}/preferences/me/effective
Response: MergedPreferences
```

#### Get Available Event Types (New)
```
GET /api/v1/workspaces/{workspace_id}/preferences/event-types
Query Parameters:
  - category: Optional filter by category
Response: {
  categories: {
    gallery_activity: EventTypeInfo[],
    client_interactions: EventTypeInfo[],
    asset_processing: EventTypeInfo[],
    rsvp: EventTypeInfo[],
    invitation: EventTypeInfo[],
    billing: EventTypeInfo[],
    system_alerts: EventTypeInfo[]
  }
}
```

### Data Models

#### NotificationCategory Enum
```python
class NotificationCategory(str, Enum):
    GALLERY_ACTIVITY = "gallery_activity"
    CLIENT_INTERACTIONS = "client_interactions"
    ASSET_PROCESSING = "asset_processing"  # New
    RSVP = "rsvp"  # New
    INVITATION = "invitation"
    BILLING = "billing"
    MARKETING = "marketing"
    SYSTEM_ALERTS = "system_alerts"
```

#### NotificationChannel Enum
```python
class NotificationChannel(str, Enum):
    EMAIL = "email"
    IN_APP = "in_app"
    SMS = "sms"  # Future
    PUSH = "push"  # Future
```

#### DigestFrequency Enum
```python
class DigestFrequency(str, Enum):
    INSTANT = "instant"
    HOURLY = "hourly"
    DAILY = "daily"
    WEEKLY = "weekly"
    NEVER = "never"
```

#### CategoryPreference Model
```python
class CategoryPreference(BaseModel):
    enabled: bool = True
    channels: list[NotificationChannel] = [EMAIL, IN_APP]
    frequency: DigestFrequency = DigestFrequency.INSTANT
```

#### PreferenceResponse Model
```python
class PreferenceResponse(BaseModel):
    preference_id: UUID
    workspace_id: UUID
    user_id: UUID
    
    # Channel toggles
    email_enabled: bool = True
    sms_enabled: bool = False
    in_app_enabled: bool = True
    push_enabled: bool = True
    
    # Category preferences
    gallery_activity: Optional[CategoryPreference]
    client_interactions: Optional[CategoryPreference]
    asset_processing: Optional[CategoryPreference]  # New
    rsvp: Optional[CategoryPreference]  # New
    invitation: Optional[CategoryPreference]
    billing: Optional[CategoryPreference]
    marketing: Optional[CategoryPreference]
    system_alerts: Optional[CategoryPreference]
    
    # Advanced settings
    quiet_hours: Optional[QuietHoursConfig]
    digest_schedule: Optional[DigestSchedule]
    
    # Metadata
    created_at: datetime
    updated_at: datetime
```

#### Event Type Definitions
```python
class EventTypeInfo(BaseModel):
    event_type: str  # e.g., "gallery.published"
    name: str  # e.g., "Gallery Published"
    description: str
    category: NotificationCategory
    is_transactional: bool  # Cannot be disabled
    supports_digest: bool
    default_priority: NotificationPriority
```

### Event Catalog Extensions

#### New Asset Processing Events
```python
ASSET_UPLOAD_STARTED = "asset.upload_started"
ASSET_UPLOAD_COMPLETE = "asset.upload_complete"
ASSET_PROCESSING_STARTED = "asset.processing_started"
ASSET_PROCESSING_COMPLETE = "asset.processing_complete"
ASSET_PROCESSING_FAILED = "asset.processing_failed"
ASSET_AI_ANALYSIS_COMPLETE = "asset.ai_analysis_complete"
```

#### Event Definitions
Each event should have:
- Event type string
- Human-readable name
- Description
- Category mapping
- Priority level
- Transactional flag (for billing/system alerts)
- Digest support flag
- Cooldown period (minutes between similar notifications)
- Required payload fields
- Sample payload for documentation

## Frontend Implementation

### Component Structure

```
WorkspaceNotificationSettingsPanel
├── HeaderSection
│   ├── Title
│   ├── Description
│   └── GlobalChannelToggles (Email, In-App)
├── CategorySections
│   ├── NotificationCategoryCard (Gallery Activity)
│   │   ├── CategoryHeader (icon, name, master toggle)
│   │   ├── ChannelSelector (Email, In-App checkboxes)
│   │   ├── FrequencySelector (Instant, Hourly, Daily, Weekly, Never)
│   │   └── EventTypeList (expandable)
│   │       └── EventTypeToggle[] (individual events)
│   ├── NotificationCategoryCard (Client Interactions)
│   ├── NotificationCategoryCard (Asset Processing)
│   ├── NotificationCategoryCard (RSVP Management)
│   ├── NotificationCategoryCard (Invitations)
│   ├── NotificationCategoryCard (Billing - read-only)
│   └── NotificationCategoryCard (System Alerts - read-only)
└── AdvancedSettings (collapsible)
    ├── QuietHoursConfig
    │   ├── Enable toggle
    │   ├── Start time picker
    │   ├── End time picker
    │   ├── Days selector
    │   └── Timezone selector
    └── DigestScheduleConfig
        ├── Daily digest time picker
        └── Weekly digest day selector
```

### State Management

1. **Hook**: `useNotificationPreferences`
   - Fetches preferences on mount
   - Provides loading/error states
   - Exposes update functions
   - Handles optimistic updates

2. **Local State**:
   - Expanded categories
   - Pending changes (dirty state)
   - UI state (toggles, inputs)

3. **Update Strategy**:
   - Optimistic updates for instant feedback
   - Debounced API calls (500ms after last change)
   - Rollback on error
   - Success toasts on completion

### Service Layer

**NotificationPreferencesService**:
```typescript
class NotificationPreferencesService {
  async getPreferences(workspaceId: string): Promise<NotificationPreferences>
  async updatePreferences(workspaceId: string, updates: Partial<PreferenceUpdateRequest>): Promise<NotificationPreferences>
  async getEffectivePreferences(workspaceId: string): Promise<MergedPreferences>
  async getEventTypes(workspaceId: string, category?: string): Promise<EventTypesResponse>
}
```

## Backend Integration

### Event Publishing Flow

1. **Asset Upload Complete**:
   - Upload service publishes `AssetProcessingEvent` to Kafka
   - Asset event consumer receives event
   - Transforms to `asset.upload_complete` notification event
   - Notification service checks user preferences
   - If enabled, creates notification and queues for delivery

2. **Asset Processing Complete**:
   - Asset processing worker completes processing
   - Publishes processing complete event
   - Notification service receives event
   - Checks preferences for `asset_processing` category
   - Creates notification with appropriate channel/frequency settings

3. **Client Activity** (Gallery views, selections, etc.):
   - Client service publishes activity events
   - Notification service receives events
   - Checks preferences for `client_interactions` category
   - Creates notifications respecting user settings

### Event Consumer

**New File**: `services/notifications-service/src/consumers/asset_event_consumer.py`

Responsibilities:
- Subscribe to asset processing events from upload-service
- Transform Kafka/WebSocket events to notification events
- Map event types correctly (upload_complete → asset.upload_complete)
- Extract workspace_id and user_id from events
- Call notification service to create notifications

### Preference Checking

When creating a notification:
1. Fetch user preferences (or use cached)
2. Check if category is enabled
3. Check if event type is enabled (if individual toggles supported)
4. Check channel preferences (email, in-app)
5. Check frequency settings (instant vs digest)
6. Check quiet hours (if applicable)
7. Create notification with appropriate settings
8. Queue for delivery or batch into digest

## UI/UX Design

### Visual Design

1. **Category Cards**:
   - Glass-card styling with border
   - Category icon on left
   - Category name and description
   - Master toggle switch on right
   - Expandable content below

2. **Event Type List**:
   - Collapsible section (expand/collapse icon)
   - List of individual events
   - Each event has:
     - Checkbox/toggle (enabled/disabled)
     - Event name and description
     - Optional badge for importance

3. **Channel Selector**:
   - Checkbox group
   - Email checkbox
   - In-App checkbox
   - Visual indicator when both selected

4. **Frequency Selector**:
   - Radio buttons or dropdown
   - Options: Instant, Hourly, Daily, Weekly, Never
   - Visual preview of when digest would be sent

5. **Toggle Switches**:
   - Smooth animation
   - Primary color when enabled
   - Gray when disabled
   - Accessible (keyboard, screen reader)

### Interaction Design

1. **Master Toggle**:
   - Toggling category on/off should update all sub-events
   - Visual feedback (dim disabled events)
   - Confirmation dialog if disabling with many enabled events

2. **Individual Event Toggles**:
   - Instant update (optimistic)
   - Debounced API call
   - Success indicator

3. **Channel Selection**:
   - Independent selection per category
   - At least one channel must be selected if category enabled
   - Visual feedback when channels change

4. **Frequency Selection**:
   - Changes apply immediately
   - Digest timing preview
   - Warning if selecting "Never" (explains behavior)

5. **Advanced Settings**:
   - Collapsible section
   - Clear labels and descriptions
   - Time pickers with timezone awareness
   - Save button or auto-save

### Accessibility

1. **Keyboard Navigation**:
   - Tab through all interactive elements
   - Enter/Space to toggle switches
   - Arrow keys for radio buttons
   - Escape to close dialogs

2. **Screen Readers**:
   - Proper ARIA labels
   - Live regions for updates
   - Descriptive button text
   - Form field associations

3. **Visual**:
   - High contrast ratios
   - Clear focus indicators
   - Icon + text labels
   - Color not sole indicator

## Testing Requirements

### Unit Tests

**Backend**:
- Event catalog completeness
- Preference schema validation
- Category preference defaults
- Event type mapping
- Preference merge logic

**Frontend**:
- Component rendering
- State management
- Service API calls
- Preference update logic
- Form validation

### Integration Tests

1. **Full Preference Flow**:
   - User updates preference
   - API receives update
   - Preference persists
   - Notification respects preference

2. **Event Delivery**:
   - Trigger asset processing event
   - Notification service receives event
   - Checks user preferences
   - Creates notification if enabled
   - Respects channel and frequency settings

3. **Digest Batching**:
   - Multiple events within digest window
   - Events batched correctly
   - Digest sent at scheduled time
   - Correct event grouping

### End-to-End Tests

1. **User Journey**:
   - Navigate to settings
   - Toggle category preference
   - Verify save
   - Trigger event
   - Verify notification delivery

2. **Edge Cases**:
   - All preferences disabled
   - Mixed channel preferences
   - Digest timing accuracy
   - Quiet hours enforcement
   - Timezone handling

### Manual Testing Checklist

- [ ] All categories display correctly
- [ ] Master toggles work
- [ ] Individual event toggles work
- [ ] Channel selection works
- [ ] Frequency selection works
- [ ] Quiet hours configuration works
- [ ] Digest schedule configuration works
- [ ] Preferences persist after page reload
- [ ] Optimistic updates feel instant
- [ ] Error handling displays correctly
- [ ] Loading states show appropriately
- [ ] Mobile responsive design works
- [ ] Keyboard navigation works
- [ ] Screen reader announces changes

## Migration Strategy

### Phase 1: Backend Extension (Non-Breaking)
- Add new categories and events to catalog
- Extend preference schemas
- Deploy backend changes
- **No breaking changes**

### Phase 2: Frontend UI (Backward Compatible)
- Deploy new UI components
- Support both old and new APIs
- Feature flag for gradual rollout
- **Backward compatible**

### Phase 3: Data Migration
- Migrate existing preferences to new format
- Default preferences for new categories
- Validation of migrated data
- **Automatic migration**

### Phase 4: Deprecation
- Deprecate legacy notification settings endpoint
- Add deprecation warnings
- Monitor usage
- **Grace period: 3 months**

### Phase 5: Cleanup
- Remove legacy code
- Remove deprecated endpoints
- Update documentation
- **After grace period**

## Success Metrics

1. **Feature Adoption**:
   - % of users who configure preferences
   - % of categories customized
   - Most commonly disabled categories

2. **User Satisfaction**:
   - Time to configure preferences
   - Error rate (failed saves)
   - Support tickets related to notifications

3. **System Performance**:
   - API response times
   - Preference lookup performance
   - Notification filtering efficiency

4. **Notification Delivery**:
   - Notification delivery rate
   - Respect for quiet hours
   - Digest batching efficiency

## Security & Privacy

1. **Access Control**:
   - Users can only view/update their own preferences
   - Workspace admins can set workspace defaults
   - API enforces workspace isolation

2. **Data Privacy**:
   - Preferences stored per user per workspace
   - No cross-workspace data leakage
   - GDPR compliance (export/deletion)

3. **Validation**:
   - Input validation on all preference updates
   - Prevent invalid category/channel combinations
   - Rate limiting on API endpoints

## Future Enhancements

1. **Additional Channels**:
   - SMS notifications
   - Push notifications
   - Slack/Discord integration

2. **Smart Defaults**:
   - ML-based preference suggestions
   - Learning from user behavior
   - Adaptive preferences

3. **Notification Preview**:
   - Preview notification content
   - Test notification delivery
   - Preview digest format

4. **Bulk Operations**:
   - Enable/disable all categories
   - Copy preferences to other workspaces
   - Import/export preferences

5. **Analytics Dashboard**:
   - Notification delivery statistics
   - Engagement metrics
   - Preference usage analytics

## References

- [Notifications Service README](../services/notifications-service/README.md)
- [API and Integrations Documentation](./API_AND_INTEGRATIONS.md)
- [Event Catalog](../services/notifications-service/src/events/catalog.py)
- [Preferences API](../services/notifications-service/src/api/v1/preferences.py)

## Revision History

- **2025-01-XX**: Initial specification document created
- Future revisions will be tracked here
