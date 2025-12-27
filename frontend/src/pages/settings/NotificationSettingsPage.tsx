/**
 * Notification Settings Page
 * User Story 3: Manage Notification Preferences
 *
 * Allows users to configure notification preferences for:
 * - Email notifications
 * - In-app notifications
 *
 * Categories:
 * - Gallery activity (uploads, comments, selections)
 * - Client interactions (messages, gallery views)
 * - System alerts (security, billing)
 * - Marketing (product updates, promotions)
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Mail, Bell, Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import { NotificationToggleGroup, type NotificationCategory } from '../../components/settings/NotificationToggleGroup';
import { AppButton } from '../../components/ui/AppButton';
import { useNotificationPreferences } from '../../hooks/useUserSettings';
import { useToastActions } from '../../components/ui/Toast';
import type { NotificationPreferences, UpdateNotificationPreferencesRequest } from '../../types/userSettings';

/* =============================================================================
   NotificationSettingsPage

   Page for managing notification preferences across email and in-app channels.
   Features optimistic updates for instant feedback on toggle changes.
   ============================================================================= */

// Notification categories with descriptions
const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  {
    key: 'gallery_activity',
    label: 'Gallery Activity',
    description: 'Get notified about photo uploads, comments, and selection changes.',
  },
  {
    key: 'client_interactions',
    label: 'Client Interactions',
    description: 'Get notified when clients message you or view your galleries.',
  },
  {
    key: 'system_alerts',
    label: 'System Alerts',
    description: 'Important notifications about security, billing, and maintenance.',
  },
  {
    key: 'marketing',
    label: 'Marketing & Updates',
    description: 'Product updates, tips, and promotional offers.',
  },
];

const NotificationSettingsPage: React.FC = () => {
  const { preferences, loading, error, updatePreferences, refetch } = useNotificationPreferences();
  const toast = useToastActions();

  // Optimistic state - local values that update immediately
  const [optimisticValues, setOptimisticValues] = useState<NotificationPreferences | null>(null);
  // Track pending updates for visual feedback
  const [pendingCategories, setPendingCategories] = useState<string[]>([]);

  // Sync optimistic values with server data
  useEffect(() => {
    if (preferences && !optimisticValues) {
      setOptimisticValues(preferences);
    }
  }, [preferences, optimisticValues]);

  // Handle toggle change with optimistic update
  const handleToggleChange = useCallback(
    async (channel: 'email' | 'in_app', category: string, value: boolean) => {
      if (!optimisticValues) return;

      const categoryKey = `${channel}:${category}`;

      // Optimistic update - immediately update local state
      setOptimisticValues((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          [channel]: {
            ...prev[channel],
            [category]: value,
          },
        };
      });

      // Mark as pending
      setPendingCategories((prev) => [...prev, categoryKey]);

      // Build update request
      const updateData: UpdateNotificationPreferencesRequest = {
        [channel]: { [category]: value },
      };

      try {
        await updatePreferences(updateData);
        // Success - update already applied optimistically
      } catch (err) {
        // Rollback optimistic update on failure
        setOptimisticValues((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            [channel]: {
              ...prev[channel],
              [category]: !value, // Revert to original value
            },
          };
        });
        toast.error(err instanceof Error ? err.message : 'Failed to update preference');
      } finally {
        // Remove from pending
        setPendingCategories((prev) => prev.filter((k) => k !== categoryKey));
      }
    },
    [optimisticValues, updatePreferences, toast]
  );

  // Reset all to defaults
  const handleResetToDefaults = useCallback(async () => {
    const defaults: NotificationPreferences = {
      email: {
        gallery_activity: true,
        client_interactions: true,
        system_alerts: true,
        marketing: false,
      },
      in_app: {
        gallery_activity: true,
        client_interactions: true,
        system_alerts: true,
        marketing: true,
      },
    };

    // Optimistic update
    setOptimisticValues(defaults);

    try {
      await updatePreferences(defaults);
      toast.success('Notification preferences reset to defaults');
    } catch (err) {
      // Rollback on failure
      if (preferences) {
        setOptimisticValues(preferences);
      }
      toast.error(err instanceof Error ? err.message : 'Failed to reset preferences');
    }
  }, [preferences, updatePreferences, toast]);

  // Loading state
  if (loading && !optimisticValues) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-text-tertiary" />
      </div>
    );
  }

  // Error state
  if (error && !optimisticValues) {
    return (
      <div className="p-6 bg-error/10 rounded-xl text-center">
        <AlertCircle className="w-12 h-12 mx-auto text-error mb-3" />
        <p className="text-error font-medium">{error.message}</p>
        <AppButton variant="outline" onClick={refetch} className="mt-4">
          Try Again
        </AppButton>
      </div>
    );
  }

  // Use optimistic values or fall back to server data
  const displayValues = optimisticValues || preferences;

  if (!displayValues) {
    return null;
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Notification Settings</h1>
          <p className="text-text-secondary mt-1">
            Choose how and when you want to be notified about activity.
          </p>
        </div>
        <AppButton
          variant="outline"
          size="sm"
          onClick={handleResetToDefaults}
          leftIcon={<RotateCcw className="w-4 h-4" />}
        >
          Reset to Defaults
        </AppButton>
      </div>

      {/* Channel groups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Email notifications */}
        <NotificationToggleGroup
          channel="email"
          title="Email Notifications"
          description="Notifications sent to your email address"
          icon={<Mail className="w-5 h-5" />}
          categories={NOTIFICATION_CATEGORIES}
          values={displayValues.email}
          onChange={(channel, category, value) =>
            handleToggleChange(channel as 'email' | 'in_app', category, value)
          }
          disabled={loading}
          pendingCategories={pendingCategories}
        />

        {/* In-app notifications */}
        <NotificationToggleGroup
          channel="in_app"
          title="In-App Notifications"
          description="Notifications shown within the application"
          icon={<Bell className="w-5 h-5" />}
          categories={NOTIFICATION_CATEGORIES}
          values={displayValues.in_app}
          onChange={(channel, category, value) =>
            handleToggleChange(channel as 'email' | 'in_app', category, value)
          }
          disabled={loading}
          pendingCategories={pendingCategories}
        />
      </div>

      {/* Info text */}
      <div className="p-4 bg-surface-hover rounded-xl text-sm text-text-secondary">
        <p>
          <strong className="text-text-primary">Note:</strong> System alerts about security and
          billing cannot be fully disabled for your account protection. You will always receive
          critical security notifications.
        </p>
      </div>
    </div>
  );
};

export default NotificationSettingsPage;
