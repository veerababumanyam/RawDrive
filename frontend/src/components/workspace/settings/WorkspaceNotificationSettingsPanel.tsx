/**
 * Workspace Notification Settings Panel
 * Comprehensive notification preferences management with category cards,
 * channel toggles, frequency selectors, and quiet hours configuration.
 */

import React, { useState, useCallback } from 'react';
import { Bell, Mail, Loader2, AlertCircle } from 'lucide-react';

import { useWorkspaceNotificationPreferences } from '../../../hooks/useWorkspaceNotificationPreferences';
import { NotificationCategoryCard } from './notifications/NotificationCategoryCard';
import { QuietHoursConfiguration } from './notifications/QuietHoursConfiguration';

import type {
    NotificationCategory,
    NotificationChannel,
    DigestFrequency,
    QuietHoursConfig,
    CategoryPreference,
} from '../../../types/notificationPreferences';
import {
    NOTIFICATION_CATEGORIES,
    CATEGORY_METADATA,
    DEFAULT_CATEGORY_PREFERENCE,
} from '../../../types/notificationPreferences';

// =============================================================================
// PROPS
// =============================================================================

interface WorkspaceNotificationSettingsPanelProps {
    workspaceId: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export const WorkspaceNotificationSettingsPanel: React.FC<
    WorkspaceNotificationSettingsPanelProps
> = ({ workspaceId }) => {
    const {
        preferences,
        isLoading,
        isUpdating,
        error,
        toggleCategory,
        updateCategoryChannels,
        updateCategoryFrequency,
        updateQuietHours,
    } = useWorkspaceNotificationPreferences(workspaceId);

    const [expandedCategories, setExpandedCategories] = useState<Set<NotificationCategory>>(
        new Set()
    );

    // ---------------------------------------------------------------------------
    // Handlers
    // ---------------------------------------------------------------------------

    const handleCategoryToggle = useCallback(
        (category: NotificationCategory, enabled: boolean) => {
            toggleCategory(category, enabled);
        },
        [toggleCategory]
    );

    const handleChannelChange = useCallback(
        (category: NotificationCategory, channels: NotificationChannel[]) => {
            updateCategoryChannels(category, channels);
        },
        [updateCategoryChannels]
    );

    const handleFrequencyChange = useCallback(
        (category: NotificationCategory, frequency: DigestFrequency) => {
            updateCategoryFrequency(category, frequency);
        },
        [updateCategoryFrequency]
    );

    const handleExpandToggle = useCallback((category: NotificationCategory) => {
        setExpandedCategories((prev) => {
            const next = new Set(prev);
            if (next.has(category)) {
                next.delete(category);
            } else {
                next.add(category);
            }
            return next;
        });
    }, []);

    const handleQuietHoursChange = useCallback(
        (config: Partial<QuietHoursConfig>) => {
            updateQuietHours(config);
        },
        [updateQuietHours]
    );

    // ---------------------------------------------------------------------------
    // Loading State
    // ---------------------------------------------------------------------------

    if (isLoading && !preferences) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // ---------------------------------------------------------------------------
    // Error State
    // ---------------------------------------------------------------------------

    if (error && !preferences) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] text-destructive">
                <AlertCircle className="w-12 h-12 mb-4" />
                <h2 className="text-lg font-medium">Failed to load notification settings</h2>
                <p className="text-sm text-muted-foreground mt-2">
                    Please try refreshing the page.
                </p>
            </div>
        );
    }

    if (!preferences) {
        return null;
    }

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------

    // Separate categories into transactional and configurable
    const transactionalCategories: NotificationCategory[] = ['system_alerts', 'billing'];
    const configurableCategories = NOTIFICATION_CATEGORIES.filter(
        (cat) => !transactionalCategories.includes(cat)
    );

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-semibold text-foreground flex items-center gap-3">
                    <Bell className="w-7 h-7 text-primary" />
                    Notification Preferences
                </h1>
                <p className="text-muted-foreground mt-1">
                    Control how and when you receive notifications from RawDrive.
                </p>
            </div>

            {/* Global Channel Controls */}
            <div className="bg-card rounded-xl border border-border p-6">
                <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Mail className="w-5 h-5" />
                    Delivery Channels
                </h2>
                <div className="flex flex-wrap gap-4">
                    <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-background">
                        <input
                            type="checkbox"
                            id="email-enabled"
                            checked={preferences.email_enabled}
                            onChange={() => {
                                // Toggle email - would need to add this to hook
                            }}
                            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                        />
                        <label htmlFor="email-enabled" className="text-sm font-medium text-foreground">
                            Email Notifications
                        </label>
                    </div>
                    <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-background">
                        <input
                            type="checkbox"
                            id="in-app-enabled"
                            checked={preferences.in_app_enabled}
                            onChange={() => {
                                // Toggle in-app - would need to add this to hook
                            }}
                            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                        />
                        <label htmlFor="in-app-enabled" className="text-sm font-medium text-foreground">
                            In-App Notifications
                        </label>
                    </div>
                </div>
            </div>

            {/* Configurable Categories */}
            <div className="space-y-4">
                <h2 className="text-lg font-semibold text-foreground">Notification Categories</h2>
                <p className="text-sm text-muted-foreground">
                    Configure which notifications you want to receive and how.
                </p>

                <div className="grid gap-4">
                    {configurableCategories.map((category) => {
                        const categoryPref = (preferences[category] as CategoryPreference) ||
                            DEFAULT_CATEGORY_PREFERENCE;

                        return (
                            <NotificationCategoryCard
                                key={category}
                                category={category}
                                preference={categoryPref}
                                isTransactional={false}
                                isExpanded={expandedCategories.has(category)}
                                isLoading={isUpdating}
                                onToggle={handleCategoryToggle}
                                onChannelChange={handleChannelChange}
                                onFrequencyChange={handleFrequencyChange}
                                onExpandToggle={handleExpandToggle}
                            />
                        );
                    })}
                </div>
            </div>

            {/* Transactional Categories (Read-only) */}
            <div className="space-y-4">
                <h2 className="text-lg font-semibold text-foreground">Required Notifications</h2>
                <p className="text-sm text-muted-foreground">
                    These notifications are required for account security and service operation.
                </p>

                <div className="grid gap-4">
                    {transactionalCategories.map((category) => {
                        const categoryPref = (preferences[category] as CategoryPreference) ||
                            DEFAULT_CATEGORY_PREFERENCE;

                        return (
                            <NotificationCategoryCard
                                key={category}
                                category={category}
                                preference={categoryPref}
                                isTransactional={true}
                                isExpanded={false}
                                isLoading={isUpdating}
                                onToggle={handleCategoryToggle}
                                onChannelChange={handleChannelChange}
                                onFrequencyChange={handleFrequencyChange}
                            />
                        );
                    })}
                </div>
            </div>

            {/* Quiet Hours */}
            <div className="space-y-4">
                <h2 className="text-lg font-semibold text-foreground">Advanced Settings</h2>
                <QuietHoursConfiguration
                    config={preferences.quiet_hours}
                    isLoading={isUpdating}
                    onChange={handleQuietHoursChange}
                />
            </div>
        </div>
    );
};

export default WorkspaceNotificationSettingsPanel;
