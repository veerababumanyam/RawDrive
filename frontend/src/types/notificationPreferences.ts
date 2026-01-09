/**
 * Notification Preferences Types
 * Comprehensive TypeScript interfaces for the notification preferences feature.
 * Matches backend schemas from notifications-service/src/schemas/preference.py
 */

// =============================================================================
// ENUMS & CONSTANTS
// =============================================================================

export type NotificationChannel = 'email' | 'sms' | 'in_app' | 'push';

export type NotificationCategory =
    | 'gallery_activity'
    | 'client_interactions'
    | 'asset_processing'
    | 'rsvp'
    | 'system_alerts'
    | 'billing'
    | 'marketing'
    | 'invitation';

export type DigestFrequency = 'instant' | 'hourly' | 'daily' | 'weekly';

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // Sunday = 0

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

// =============================================================================
// CATEGORY METADATA
// =============================================================================

export interface CategoryMetadata {
    id: NotificationCategory;
    name: string;
    description: string;
    icon: string;
    isTransactional: boolean;
    supportsDigest: boolean;
}

export const CATEGORY_METADATA: Record<NotificationCategory, CategoryMetadata> = {
    gallery_activity: {
        id: 'gallery_activity',
        name: 'Gallery Activity',
        description: 'Notifications about gallery updates, shares, and access changes',
        icon: 'photo',
        isTransactional: false,
        supportsDigest: true,
    },
    client_interactions: {
        id: 'client_interactions',
        name: 'Client Interactions',
        description: 'Notifications about client engagement like comments, favorites, and downloads',
        icon: 'users',
        isTransactional: false,
        supportsDigest: true,
    },
    asset_processing: {
        id: 'asset_processing',
        name: 'Asset Processing',
        description: 'Notifications about file uploads, processing status, and AI analysis',
        icon: 'upload-cloud',
        isTransactional: false,
        supportsDigest: true,
    },
    rsvp: {
        id: 'rsvp',
        name: 'RSVP Management',
        description: 'Notifications about event RSVPs, responses, and reminders',
        icon: 'calendar-check',
        isTransactional: false,
        supportsDigest: true,
    },
    system_alerts: {
        id: 'system_alerts',
        name: 'System Alerts',
        description: 'Important system notifications including security and maintenance',
        icon: 'shield-alert',
        isTransactional: true,
        supportsDigest: false,
    },
    billing: {
        id: 'billing',
        name: 'Billing',
        description: 'Payment, subscription, and invoice notifications',
        icon: 'credit-card',
        isTransactional: true,
        supportsDigest: false,
    },
    marketing: {
        id: 'marketing',
        name: 'Marketing',
        description: 'Promotional communications and newsletters',
        icon: 'megaphone',
        isTransactional: false,
        supportsDigest: true,
    },
    invitation: {
        id: 'invitation',
        name: 'Invitations',
        description: 'Workspace and collaboration invitation notifications',
        icon: 'mail-plus',
        isTransactional: false,
        supportsDigest: true,
    },
};

// =============================================================================
// CATEGORY PREFERENCE
// =============================================================================

export interface CategoryPreference {
    enabled: boolean;
    channels: NotificationChannel[];
    frequency: DigestFrequency;
}

export const DEFAULT_CATEGORY_PREFERENCE: CategoryPreference = {
    enabled: true,
    channels: ['email', 'in_app'],
    frequency: 'instant',
};

// =============================================================================
// QUIET HOURS
// =============================================================================

export interface QuietHoursConfig {
    enabled: boolean;
    start_time: string; // HH:MM:SS format
    end_time: string;   // HH:MM:SS format
    timezone: string;
    days: DayOfWeek[];
}

export const DEFAULT_QUIET_HOURS: QuietHoursConfig = {
    enabled: false,
    start_time: '22:00:00',
    end_time: '08:00:00',
    timezone: 'UTC',
    days: [0, 1, 2, 3, 4, 5, 6],
};

// =============================================================================
// DIGEST SCHEDULE
// =============================================================================

export interface DigestSchedule {
    enabled: boolean;
    frequency: DigestFrequency;
    time_of_day: string;     // HH:MM:SS format
    timezone: string;
    days_of_week: DayOfWeek[];
}

export const DEFAULT_DIGEST_SCHEDULE: DigestSchedule = {
    enabled: false,
    frequency: 'daily',
    time_of_day: '09:00:00',
    timezone: 'UTC',
    days_of_week: [1, 2, 3, 4, 5], // Monday-Friday
};

// =============================================================================
// FULL PREFERENCES
// =============================================================================

export interface NotificationPreferences {
    preference_id: string;
    workspace_id: string;
    user_id?: string;

    // Channel preferences
    email_enabled: boolean;
    sms_enabled: boolean;
    in_app_enabled: boolean;
    push_enabled: boolean;

    // Category preferences
    gallery_activity: CategoryPreference;
    client_interactions: CategoryPreference;
    asset_processing: CategoryPreference;
    rsvp: CategoryPreference;
    system_alerts: CategoryPreference;
    billing: CategoryPreference;
    marketing: CategoryPreference;
    invitation: CategoryPreference;

    // Advanced settings
    quiet_hours: QuietHoursConfig;
    digest_schedule: DigestSchedule;

    // Localization
    language: string;
    timezone: string;

    // Transactional override
    transactional_email_enabled: boolean;
}

// =============================================================================
// API REQUEST/RESPONSE TYPES
// =============================================================================

export interface UpdatePreferencesRequest {
    email_enabled?: boolean;
    sms_enabled?: boolean;
    in_app_enabled?: boolean;
    push_enabled?: boolean;

    gallery_activity?: Partial<CategoryPreference>;
    client_interactions?: Partial<CategoryPreference>;
    asset_processing?: Partial<CategoryPreference>;
    rsvp?: Partial<CategoryPreference>;
    system_alerts?: Partial<CategoryPreference>;
    billing?: Partial<CategoryPreference>;
    marketing?: Partial<CategoryPreference>;
    invitation?: Partial<CategoryPreference>;

    quiet_hours?: Partial<QuietHoursConfig>;
    digest_schedule?: Partial<DigestSchedule>;

    language?: string;
    timezone?: string;
    transactional_email_enabled?: boolean;
}

export interface PreferencesResponse extends NotificationPreferences {
    created_at: string;
    updated_at: string;
}

// =============================================================================
// EVENT TYPE TYPES
// =============================================================================

export interface EventTypeInfo {
    event_type: string;
    name: string;
    description: string;
    category: NotificationCategory;
    default_channel: NotificationChannel;
    default_priority: NotificationPriority;
    is_transactional: boolean;
    supports_digest: boolean;
    template_code: string;
    required_fields: string[];
    optional_fields: string[];
    tags: string[];
}

export interface CategorySummary {
    category: NotificationCategory;
    name: string;
    description: string;
    event_count: number;
    event_types: string[];
}

export interface EventCatalogResponse {
    categories: CategorySummary[];
    total_events: number;
    transactional_count: number;
    digestable_count: number;
}

export interface EventTypesListResponse {
    events: EventTypeInfo[];
    total: number;
    category_filter?: NotificationCategory;
    transactional_only: boolean;
}

// =============================================================================
// CHANNEL TOGGLE TYPES
// =============================================================================

export interface ChannelToggleRequest {
    channel: NotificationChannel;
    enabled: boolean;
}

export interface CategoryToggleRequest {
    category: NotificationCategory;
    enabled: boolean;
}

// =============================================================================
// HELPER TYPES
// =============================================================================

export type CategoryPreferences = Pick<
    NotificationPreferences,
    | 'gallery_activity'
    | 'client_interactions'
    | 'asset_processing'
    | 'rsvp'
    | 'system_alerts'
    | 'billing'
    | 'marketing'
    | 'invitation'
>;

export type ChannelPreferences = Pick<
    NotificationPreferences,
    'email_enabled' | 'sms_enabled' | 'in_app_enabled' | 'push_enabled'
>;

// Utility to get all category keys
export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
    'gallery_activity',
    'client_interactions',
    'asset_processing',
    'rsvp',
    'system_alerts',
    'billing',
    'marketing',
    'invitation',
];

// Utility to get available channels
export const NOTIFICATION_CHANNELS: NotificationChannel[] = [
    'email',
    'in_app',
    // 'sms',  // Future
    // 'push', // Future
];

export const DIGEST_FREQUENCIES: DigestFrequency[] = [
    'instant',
    'hourly',
    'daily',
    'weekly',
];
