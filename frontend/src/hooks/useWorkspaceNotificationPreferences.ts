/**
 * useWorkspaceNotificationPreferences Hook
 * React Query hook for managing notification preferences with optimistic updates.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';


import { notificationPreferencesService } from '../services/notificationPreferencesService';
import type {
    NotificationPreferences,
    PreferencesResponse,
    UpdatePreferencesRequest,
    EventCatalogResponse,
    NotificationCategory,
    NotificationChannel,
    CategoryPreference,
    QuietHoursConfig,
    DigestSchedule,
} from '../types/notificationPreferences';

// =============================================================================
// QUERY KEYS
// =============================================================================

export const notificationPreferencesKeys = {
    all: ['notificationPreferences'] as const,
    my: (workspaceId: string) =>
        [...notificationPreferencesKeys.all, 'my', workspaceId] as const,
    defaults: (workspaceId: string) =>
        [...notificationPreferencesKeys.all, 'defaults', workspaceId] as const,
    eventCatalog: (workspaceId: string) =>
        [...notificationPreferencesKeys.all, 'eventCatalog', workspaceId] as const,
    eventTypes: (workspaceId: string, category?: NotificationCategory) =>
        [...notificationPreferencesKeys.all, 'eventTypes', workspaceId, category] as const,
};

// =============================================================================
// MAIN HOOK
// =============================================================================

export function useWorkspaceNotificationPreferences(workspaceId: string) {
    const queryClient = useQueryClient();

    // ---------------------------------------------------------------------------
    // Queries
    // ---------------------------------------------------------------------------

    const preferencesQuery = useQuery({
        queryKey: notificationPreferencesKeys.my(workspaceId),
        queryFn: () => notificationPreferencesService.getMyPreferences(workspaceId),
        enabled: !!workspaceId,
        staleTime: 30000, // 30 seconds
        gcTime: 5 * 60 * 1000, // 5 minutes
    });

    const eventCatalogQuery = useQuery({
        queryKey: notificationPreferencesKeys.eventCatalog(workspaceId),
        queryFn: () => notificationPreferencesService.getEventCatalog(workspaceId),
        enabled: !!workspaceId,
        staleTime: 5 * 60 * 1000, // 5 minutes (catalog rarely changes)
        gcTime: 30 * 60 * 1000, // 30 minutes
    });

    // ---------------------------------------------------------------------------
    // Mutations
    // ---------------------------------------------------------------------------

    const updatePreferencesMutation = useMutation({
        mutationFn: (updates: UpdatePreferencesRequest) =>
            notificationPreferencesService.updateMyPreferences(workspaceId, updates),
        onMutate: async (updates) => {
            // Cancel any outgoing refetches
            await queryClient.cancelQueries({
                queryKey: notificationPreferencesKeys.my(workspaceId),
            });

            // Snapshot the previous value
            const previousPrefs = queryClient.getQueryData<PreferencesResponse>(
                notificationPreferencesKeys.my(workspaceId)
            );

            // Optimistically update to the new value
            if (previousPrefs) {
                queryClient.setQueryData<PreferencesResponse>(
                    notificationPreferencesKeys.my(workspaceId),
                    {
                        ...previousPrefs,
                        ...updates,
                    } as PreferencesResponse
                );
            }

            return { previousPrefs };
        },
        onError: (_err, _updates, context) => {
            // Roll back to the previous value
            if (context?.previousPrefs) {
                queryClient.setQueryData(
                    notificationPreferencesKeys.my(workspaceId),
                    context.previousPrefs
                );
            }
            // Error is exposed via updateError state - component can show toast
        },
        onSuccess: () => {
            // Success - component can show confirmation if needed
        },
        onSettled: () => {
            // Refetch to ensure we have the latest data
            queryClient.invalidateQueries({
                queryKey: notificationPreferencesKeys.my(workspaceId),
            });
        },
    });

    // ---------------------------------------------------------------------------
    // Convenience methods
    // ---------------------------------------------------------------------------

    const toggleChannel = useCallback(
        async (channel: NotificationChannel, enabled: boolean) => {
            const channelKey = `${channel}_enabled` as keyof UpdatePreferencesRequest;
            return updatePreferencesMutation.mutateAsync({
                [channelKey]: enabled,
            });
        },
        [updatePreferencesMutation]
    );

    const toggleCategory = useCallback(
        async (category: NotificationCategory, enabled: boolean) => {
            const currentPrefs = preferencesQuery.data;
            if (!currentPrefs) return;

            const categoryPref = currentPrefs[category] as CategoryPreference;
            return updatePreferencesMutation.mutateAsync({
                [category]: {
                    ...categoryPref,
                    enabled,
                },
            });
        },
        [preferencesQuery.data, updatePreferencesMutation]
    );

    const updateCategoryChannels = useCallback(
        async (category: NotificationCategory, channels: NotificationChannel[]) => {
            const currentPrefs = preferencesQuery.data;
            if (!currentPrefs) return;

            const categoryPref = currentPrefs[category] as CategoryPreference;
            return updatePreferencesMutation.mutateAsync({
                [category]: {
                    ...categoryPref,
                    channels,
                },
            });
        },
        [preferencesQuery.data, updatePreferencesMutation]
    );

    const updateCategoryFrequency = useCallback(
        async (
            category: NotificationCategory,
            frequency: 'instant' | 'hourly' | 'daily' | 'weekly'
        ) => {
            const currentPrefs = preferencesQuery.data;
            if (!currentPrefs) return;

            const categoryPref = currentPrefs[category] as CategoryPreference;
            return updatePreferencesMutation.mutateAsync({
                [category]: {
                    ...categoryPref,
                    frequency,
                },
            });
        },
        [preferencesQuery.data, updatePreferencesMutation]
    );

    const updateQuietHours = useCallback(
        async (quietHours: Partial<QuietHoursConfig>) => {
            return updatePreferencesMutation.mutateAsync({
                quiet_hours: quietHours,
            });
        },
        [updatePreferencesMutation]
    );

    const updateDigestSchedule = useCallback(
        async (digestSchedule: Partial<DigestSchedule>) => {
            return updatePreferencesMutation.mutateAsync({
                digest_schedule: digestSchedule,
            });
        },
        [updatePreferencesMutation]
    );

    const enableAllNotifications = useCallback(async () => {
        return notificationPreferencesService.enableAllNotifications(workspaceId);
    }, [workspaceId]);

    const disableAllNotifications = useCallback(async () => {
        return notificationPreferencesService.disableAllNotifications(workspaceId);
    }, [workspaceId]);

    // ---------------------------------------------------------------------------
    // Return
    // ---------------------------------------------------------------------------

    return {
        // Data
        preferences: preferencesQuery.data,
        eventCatalog: eventCatalogQuery.data,

        // Loading states
        isLoading: preferencesQuery.isLoading,
        isLoadingCatalog: eventCatalogQuery.isLoading,
        isUpdating: updatePreferencesMutation.isPending,

        // Error states
        error: preferencesQuery.error,
        catalogError: eventCatalogQuery.error,
        updateError: updatePreferencesMutation.error,

        // Actions
        updatePreferences: updatePreferencesMutation.mutateAsync,
        toggleChannel,
        toggleCategory,
        updateCategoryChannels,
        updateCategoryFrequency,
        updateQuietHours,
        updateDigestSchedule,
        enableAllNotifications,
        disableAllNotifications,

        // Refetch
        refetch: preferencesQuery.refetch,
        refetchCatalog: eventCatalogQuery.refetch,
    };
}

// =============================================================================
// WORKSPACE DEFAULTS HOOK (ADMIN)
// =============================================================================

export function useWorkspaceNotificationDefaults(workspaceId: string) {
    const queryClient = useQueryClient();

    const defaultsQuery = useQuery({
        queryKey: notificationPreferencesKeys.defaults(workspaceId),
        queryFn: () => notificationPreferencesService.getWorkspaceDefaults(workspaceId),
        enabled: !!workspaceId,
        staleTime: 60000, // 1 minute
    });

    const updateDefaultsMutation = useMutation({
        mutationFn: (updates: UpdatePreferencesRequest) =>
            notificationPreferencesService.updateWorkspaceDefaults(workspaceId, updates),
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: notificationPreferencesKeys.defaults(workspaceId),
            });
            // Success - component can show confirmation
        },
        onError: () => {
            // Error is exposed via error state
        },
    });

    return {
        defaults: defaultsQuery.data,
        isLoading: defaultsQuery.isLoading,
        isUpdating: updateDefaultsMutation.isPending,
        error: defaultsQuery.error,
        updateDefaults: updateDefaultsMutation.mutateAsync,
        refetch: defaultsQuery.refetch,
    };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default useWorkspaceNotificationPreferences;
