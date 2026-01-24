/**
 * Notification Category Card Component
 * Displays a category with its description, toggle, channel selection, and frequency.
 */

import React, { useCallback } from 'react';
import {
    Bell,
    BellOff,
    Mail,
    MessageSquare,
    ChevronDown,
    ChevronUp,
    Image,
    Users,
    UploadCloud,
    CalendarCheck,
    ShieldAlert,
    CreditCard,
    Megaphone,
    MailPlus,
} from 'lucide-react';

import type {
    NotificationCategory,
    CategoryPreference,
    NotificationChannel,
    DigestFrequency,
} from '../../../../types/notificationPreferences';
import { CATEGORY_METADATA } from '../../../../types/notificationPreferences';

// =============================================================================
// PROPS
// =============================================================================

interface NotificationCategoryCardProps {
    category: NotificationCategory;
    preference: CategoryPreference;
    isTransactional?: boolean;
    isExpanded?: boolean;
    isLoading?: boolean;
    onToggle: (category: NotificationCategory, enabled: boolean) => void;
    onChannelChange: (category: NotificationCategory, channels: NotificationChannel[]) => void;
    onFrequencyChange: (category: NotificationCategory, frequency: DigestFrequency) => void;
    onExpandToggle?: (category: NotificationCategory) => void;
}

// =============================================================================
// ICON MAP
// =============================================================================

const CATEGORY_ICONS: Record<NotificationCategory, React.ComponentType<{ className?: string }>> = {
    gallery_activity: Image,
    client_interactions: Users,
    asset_processing: UploadCloud,
    rsvp: CalendarCheck,
    system_alerts: ShieldAlert,
    billing: CreditCard,
    marketing: Megaphone,
    invitation: MailPlus,
};

// =============================================================================
// COMPONENT
// =============================================================================

export const NotificationCategoryCard: React.FC<NotificationCategoryCardProps> = ({
    category,
    preference,
    isTransactional = false,
    isExpanded = false,
    isLoading = false,
    onToggle,
    onChannelChange,
    onFrequencyChange,
    onExpandToggle,
}) => {
    const metadata = CATEGORY_METADATA[category];
    const IconComponent = CATEGORY_ICONS[category];
    const { enabled, channels, frequency } = preference;

    const handleToggle = useCallback(() => {
        if (!isTransactional) {
            onToggle(category, !enabled);
        }
    }, [category, enabled, isTransactional, onToggle]);

    const handleChannelToggle = useCallback(
        (channel: NotificationChannel) => {
            const newChannels = channels.includes(channel)
                ? channels.filter((c) => c !== channel)
                : [...channels, channel];
            onChannelChange(category, newChannels);
        },
        [category, channels, onChannelChange]
    );

    const handleFrequencyChange = useCallback(
        (e: React.ChangeEvent<HTMLSelectElement>) => {
            onFrequencyChange(category, e.target.value as DigestFrequency);
        },
        [category, onFrequencyChange]
    );

    const handleExpandClick = useCallback(() => {
        onExpandToggle?.(category);
    }, [category, onExpandToggle]);

    return (
        <div
            className={`
        rounded-lg border transition-all duration-200
        ${enabled ? 'border-primary/30 bg-primary/5 backdrop-blur-md' : 'glass-card'}
        ${isLoading ? 'opacity-70 pointer-events-none' : ''}
      `}
        >
            {/* Header */}
            <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                    <div
                        className={`
              p-2 rounded-lg
              ${enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}
            `}
                    >
                        <IconComponent className="h-5 w-5" />
                    </div>
                    <div>
                        <h3 className="font-medium text-foreground">{metadata.name}</h3>
                        <p className="text-sm text-muted-foreground">{metadata.description}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Toggle Switch */}
                    <button
                        onClick={handleToggle}
                        disabled={isTransactional}
                        className={`
              relative inline-flex h-6 w-11 items-center rounded-full transition-colors
              ${enabled ? 'bg-primary' : 'bg-muted'}
              ${isTransactional ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
            `}
                        aria-label={`${enabled ? 'Disable' : 'Enable'} ${metadata.name}`}
                        title={isTransactional ? 'Required notifications cannot be disabled' : undefined}
                    >
                        <span
                            className={`
                inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                ${enabled ? 'translate-x-6' : 'translate-x-1'}
              `}
                        />
                    </button>

                    {/* Expand/Collapse Button */}
                    {!isTransactional && onExpandToggle && (
                        <button
                            onClick={handleExpandClick}
                            className="p-1 rounded hover:bg-muted transition-colors"
                            aria-label={isExpanded ? 'Collapse' : 'Expand'}
                        >
                            {isExpanded ? (
                                <ChevronUp className="h-5 w-5 text-muted-foreground" />
                            ) : (
                                <ChevronDown className="h-5 w-5 text-muted-foreground" />
                            )}
                        </button>
                    )}
                </div>
            </div>

            {/* Expanded Content */}
            {enabled && isExpanded && !isTransactional && (
                <div className="px-4 pb-4 space-y-4 border-t border-border/50 pt-4">
                    {/* Channel Selection */}
                    <div>
                        <label className="text-sm font-medium text-foreground mb-2 block">
                            Delivery Channels
                        </label>
                        <div className="flex gap-2">
                            <button
                                onClick={() => handleChannelToggle('email')}
                                className={`
                  flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors
                  ${channels.includes('email')
                                        ? 'border-primary bg-primary/10 text-primary'
                                        : 'border-white/10 bg-white/5 text-muted-foreground hover:border-primary/50'
                                    }
                `}
                            >
                                <Mail className="h-4 w-4" />
                                <span className="text-sm">Email</span>
                            </button>
                            <button
                                onClick={() => handleChannelToggle('in_app')}
                                className={`
                  flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors
                  ${channels.includes('in_app')
                                        ? 'border-primary bg-primary/10 text-primary'
                                        : 'border-white/10 bg-white/5 text-muted-foreground hover:border-primary/50'
                                    }
                `}
                            >
                                <MessageSquare className="h-4 w-4" />
                                <span className="text-sm">In-App</span>
                            </button>
                        </div>
                    </div>

                    {/* Frequency Selection */}
                    {metadata.supportsDigest && (
                        <div>
                            <label className="text-sm font-medium text-foreground mb-2 block">
                                Delivery Frequency
                            </label>
                            <select
                                value={frequency}
                                onChange={handleFrequencyChange}
                                className="
                  w-full px-3 py-2 rounded-lg border border-border bg-white/5
                  text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50
                "
                            >
                                <option value="instant">Instant</option>
                                <option value="hourly">Hourly Digest</option>
                                <option value="daily">Daily Digest</option>
                                <option value="weekly">Weekly Digest</option>
                            </select>
                        </div>
                    )}
                </div>
            )}

            {/* Transactional Notice */}
            {isTransactional && (
                <div className="px-4 pb-4 text-sm text-muted-foreground flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4" />
                    <span>Required notifications cannot be disabled</span>
                </div>
            )}
        </div>
    );
};

export default NotificationCategoryCard;
