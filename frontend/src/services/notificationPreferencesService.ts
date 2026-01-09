/**
 * Notification Preferences Service
 * API client for managing notification preferences via the notifications-service.
 *
 * Endpoints are accessed via:
 * /api/v1/workspaces/{workspace_id}/preferences/...
 * /api/v1/workspaces/{workspace_id}/event-types/...
 */

import { apiClient } from './api';
import type {
    NotificationPreferences,
    PreferencesResponse,
    UpdatePreferencesRequest,
    EventCatalogResponse,
    EventTypesListResponse,
    EventTypeInfo,
    NotificationCategory,
    NotificationChannel,
    CategoryPreference,
    QuietHoursConfig,
    DigestSchedule,
} from '../types/notificationPreferences';

// =============================================================================
// PREFERENCES API
// =============================================================================

/**
 * Get the current user's notification preferences for a workspace.
 */
export async function getMyPreferences(
    workspaceId: string
): Promise<PreferencesResponse> {
    const response = await apiClient.get<PreferencesResponse>(
        `/api/v1/workspaces/${workspaceId}/preferences/me`
    );
    if (response.error) {
        throw new Error(response.error.message || 'Failed to fetch notification preferences');
    }
    if (!response.data) {
        throw new Error('No data returned from notification preferences API');
    }
    return response.data;
}

/**
 * Update the current user's notification preferences.
 */
export async function updateMyPreferences(
    workspaceId: string,
    updates: UpdatePreferencesRequest
): Promise<PreferencesResponse> {
    const response = await apiClient.patch<PreferencesResponse>(
        `/api/v1/workspaces/${workspaceId}/preferences/me`,
        updates
    );
    if (response.error) {
        throw new Error(response.error.message || 'Failed to update notification preferences');
    }
    if (!response.data) {
        throw new Error('No data returned from notification preferences API');
    }
    return response.data;
}

/**
 * Toggle a specific channel on/off for the current user.
 */
export async function toggleChannel(
    workspaceId: string,
    channel: NotificationChannel,
    enabled: boolean
): Promise<PreferencesResponse> {
    const channelKey = `${channel}_enabled` as keyof UpdatePreferencesRequest;
    return updateMyPreferences(workspaceId, {
        [channelKey]: enabled,
    });
}

/**
 * Toggle a specific category on/off for the current user.
 */
export async function toggleCategory(
    workspaceId: string,
    category: NotificationCategory,
    enabled: boolean
): Promise<PreferencesResponse> {
    const currentPrefs = await getMyPreferences(workspaceId);
    const categoryPref = currentPrefs[category] as CategoryPreference;

    return updateMyPreferences(workspaceId, {
        [category]: {
            ...categoryPref,
            enabled,
        },
    });
}

/**
 * Update channels for a specific category.
 */
export async function updateCategoryChannels(
    workspaceId: string,
    category: NotificationCategory,
    channels: NotificationChannel[]
): Promise<PreferencesResponse> {
    const currentPrefs = await getMyPreferences(workspaceId);
    const categoryPref = currentPrefs[category] as CategoryPreference;

    return updateMyPreferences(workspaceId, {
        [category]: {
            ...categoryPref,
            channels,
        },
    });
}

/**
 * Update frequency for a specific category.
 */
export async function updateCategoryFrequency(
    workspaceId: string,
    category: NotificationCategory,
    frequency: 'instant' | 'hourly' | 'daily' | 'weekly'
): Promise<PreferencesResponse> {
    const currentPrefs = await getMyPreferences(workspaceId);
    const categoryPref = currentPrefs[category] as CategoryPreference;

    return updateMyPreferences(workspaceId, {
        [category]: {
            ...categoryPref,
            frequency,
        },
    });
}

/**
 * Update quiet hours configuration.
 */
export async function updateQuietHours(
    workspaceId: string,
    quietHours: Partial<QuietHoursConfig>
): Promise<PreferencesResponse> {
    return updateMyPreferences(workspaceId, {
        quiet_hours: quietHours,
    });
}

/**
 * Update digest schedule configuration.
 */
export async function updateDigestSchedule(
    workspaceId: string,
    digestSchedule: Partial<DigestSchedule>
): Promise<PreferencesResponse> {
    return updateMyPreferences(workspaceId, {
        digest_schedule: digestSchedule,
    });
}

// =============================================================================
// WORKSPACE DEFAULTS (ADMIN)
// =============================================================================

/**
 * Get workspace default preferences (admin only).
 */
export async function getWorkspaceDefaults(
    workspaceId: string
): Promise<PreferencesResponse> {
    const response = await apiClient.get<PreferencesResponse>(
        `/api/v1/workspaces/${workspaceId}/preferences/defaults`
    );
    if (response.error) {
        throw new Error(response.error.message || 'Failed to fetch workspace defaults');
    }
    if (!response.data) {
        throw new Error('No data returned from workspace defaults API');
    }
    return response.data;
}

/**
 * Update workspace default preferences (admin only).
 */
export async function updateWorkspaceDefaults(
    workspaceId: string,
    updates: UpdatePreferencesRequest
): Promise<PreferencesResponse> {
    const response = await apiClient.patch<PreferencesResponse>(
        `/api/v1/workspaces/${workspaceId}/preferences/defaults`,
        updates
    );
    if (response.error) {
        throw new Error(response.error.message || 'Failed to update workspace defaults');
    }
    if (!response.data) {
        throw new Error('No data returned from workspace defaults API');
    }
    return response.data;
}

// =============================================================================
// EVENT TYPES API
// =============================================================================

/**
 * Get the full event catalog grouped by category.
 */
export async function getEventCatalog(
    workspaceId: string
): Promise<EventCatalogResponse> {
    const response = await apiClient.get<EventCatalogResponse>(
        `/api/v1/workspaces/${workspaceId}/event-types/catalog`
    );
    if (response.error) {
        throw new Error(response.error.message || 'Failed to fetch event catalog');
    }
    if (!response.data) {
        throw new Error('No data returned from event catalog API');
    }
    return response.data;
}

/**
 * Get all event types, optionally filtered by category.
 */
export async function getEventTypes(
    workspaceId: string,
    options?: {
        category?: NotificationCategory;
        transactionalOnly?: boolean;
    }
): Promise<EventTypesListResponse> {
    const params = new URLSearchParams();
    if (options?.category) {
        params.append('category', options.category);
    }
    if (options?.transactionalOnly) {
        params.append('transactional_only', 'true');
    }

    const queryString = params.toString();
    const url = `/api/v1/workspaces/${workspaceId}/event-types${queryString ? `?${queryString}` : ''}`;

    const response = await apiClient.get<EventTypesListResponse>(url);
    if (response.error) {
        throw new Error(response.error.message || 'Failed to fetch event types');
    }
    if (!response.data) {
        throw new Error('No data returned from event types API');
    }
    return response.data;
}

/**
 * Get details for a specific event type.
 */
export async function getEventType(
    workspaceId: string,
    eventType: string
): Promise<EventTypeInfo> {
    const response = await apiClient.get<EventTypeInfo>(
        `/api/v1/workspaces/${workspaceId}/event-types/${encodeURIComponent(eventType)}`
    );
    if (response.error) {
        throw new Error(response.error.message || 'Failed to fetch event type');
    }
    if (!response.data) {
        throw new Error('No data returned from event type API');
    }
    return response.data;
}

// =============================================================================
// BULK OPERATIONS
// =============================================================================

/**
 * Enable all notifications for all categories.
 */
export async function enableAllNotifications(
    workspaceId: string
): Promise<PreferencesResponse> {
    return updateMyPreferences(workspaceId, {
        email_enabled: true,
        in_app_enabled: true,
        gallery_activity: { enabled: true, channels: ['email', 'in_app'], frequency: 'instant' },
        client_interactions: { enabled: true, channels: ['email', 'in_app'], frequency: 'instant' },
        asset_processing: { enabled: true, channels: ['in_app'], frequency: 'instant' },
        rsvp: { enabled: true, channels: ['email', 'in_app'], frequency: 'instant' },
        invitation: { enabled: true, channels: ['email', 'in_app'], frequency: 'instant' },
        // Note: system_alerts and billing should always stay enabled (transactional)
    });
}

/**
 * Disable all non-essential notifications.
 */
export async function disableAllNotifications(
    workspaceId: string
): Promise<PreferencesResponse> {
    return updateMyPreferences(workspaceId, {
        gallery_activity: { enabled: false, channels: [], frequency: 'instant' },
        client_interactions: { enabled: false, channels: [], frequency: 'instant' },
        asset_processing: { enabled: false, channels: [], frequency: 'instant' },
        rsvp: { enabled: false, channels: [], frequency: 'instant' },
        marketing: { enabled: false, channels: [], frequency: 'weekly' },
        invitation: { enabled: false, channels: [], frequency: 'instant' },
        // Note: system_alerts and billing cannot be disabled (transactional)
    });
}

// =============================================================================
// SERVICE EXPORT
// =============================================================================

export const notificationPreferencesService = {
    // User preferences
    getMyPreferences,
    updateMyPreferences,
    toggleChannel,
    toggleCategory,
    updateCategoryChannels,
    updateCategoryFrequency,
    updateQuietHours,
    updateDigestSchedule,

    // Workspace defaults
    getWorkspaceDefaults,
    updateWorkspaceDefaults,

    // Event types
    getEventCatalog,
    getEventTypes,
    getEventType,

    // Bulk operations
    enableAllNotifications,
    disableAllNotifications,
};

export default notificationPreferencesService;
