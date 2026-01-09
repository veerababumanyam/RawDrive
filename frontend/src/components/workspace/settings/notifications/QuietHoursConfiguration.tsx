/**
 * Quiet Hours Configuration Component
 * Allows users to configure quiet hours when notifications are silenced.
 */

import React, { useCallback } from 'react';
import { Moon, Clock } from 'lucide-react';

import type { QuietHoursConfig, DayOfWeek } from '../../../../types/notificationPreferences';

// =============================================================================
// PROPS
// =============================================================================

interface QuietHoursConfigProps {
    config: QuietHoursConfig;
    isLoading?: boolean;
    onChange: (config: Partial<QuietHoursConfig>) => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DAYS_OF_WEEK: { day: DayOfWeek; label: string; short: string }[] = [
    { day: 0, label: 'Sunday', short: 'S' },
    { day: 1, label: 'Monday', short: 'M' },
    { day: 2, label: 'Tuesday', short: 'T' },
    { day: 3, label: 'Wednesday', short: 'W' },
    { day: 4, label: 'Thursday', short: 'T' },
    { day: 5, label: 'Friday', short: 'F' },
    { day: 6, label: 'Saturday', short: 'S' },
];

// =============================================================================
// COMPONENT
// =============================================================================

export const QuietHoursConfiguration: React.FC<QuietHoursConfigProps> = ({
    config,
    isLoading = false,
    onChange,
}) => {
    const { enabled, start_time, end_time, days } = config;

    const handleToggle = useCallback(() => {
        onChange({ enabled: !enabled });
    }, [enabled, onChange]);

    const handleStartTimeChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            onChange({ start_time: e.target.value + ':00' });
        },
        [onChange]
    );

    const handleEndTimeChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            onChange({ end_time: e.target.value + ':00' });
        },
        [onChange]
    );

    const handleDayToggle = useCallback(
        (day: DayOfWeek) => {
            const newDays = days.includes(day)
                ? days.filter((d) => d !== day)
                : [...days, day].sort((a, b) => a - b);
            onChange({ days: newDays });
        },
        [days, onChange]
    );

    // Format time for input (HH:MM)
    const formatTimeForInput = (time: string) => time.slice(0, 5);

    return (
        <div
            className={`
        rounded-lg border p-4 transition-all duration-200
        ${enabled ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'}
        ${isLoading ? 'opacity-70 pointer-events-none' : ''}
      `}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div
                        className={`
              p-2 rounded-lg
              ${enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}
            `}
                    >
                        <Moon className="h-5 w-5" />
                    </div>
                    <div>
                        <h3 className="font-medium text-foreground">Quiet Hours</h3>
                        <p className="text-sm text-muted-foreground">
                            Silence notifications during specific hours
                        </p>
                    </div>
                </div>

                {/* Toggle Switch */}
                <button
                    onClick={handleToggle}
                    className={`
            relative inline-flex h-6 w-11 items-center rounded-full transition-colors
            ${enabled ? 'bg-primary' : 'bg-muted'}
          `}
                    aria-label={`${enabled ? 'Disable' : 'Enable'} quiet hours`}
                >
                    <span
                        className={`
              inline-block h-4 w-4 transform rounded-full bg-white transition-transform
              ${enabled ? 'translate-x-6' : 'translate-x-1'}
            `}
                    />
                </button>
            </div>

            {/* Settings (shown when enabled) */}
            {enabled && (
                <div className="space-y-4 pt-4 border-t border-border/50">
                    {/* Time Range */}
                    <div className="flex items-center gap-4">
                        <div className="flex-1">
                            <label className="text-sm font-medium text-foreground mb-1 block">
                                Start Time
                            </label>
                            <div className="relative">
                                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <input
                                    type="time"
                                    value={formatTimeForInput(start_time)}
                                    onChange={handleStartTimeChange}
                                    className="
                    w-full pl-10 pr-3 py-2 rounded-lg border border-border bg-background
                    text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50
                  "
                                />
                            </div>
                        </div>
                        <span className="text-muted-foreground mt-6">to</span>
                        <div className="flex-1">
                            <label className="text-sm font-medium text-foreground mb-1 block">
                                End Time
                            </label>
                            <div className="relative">
                                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <input
                                    type="time"
                                    value={formatTimeForInput(end_time)}
                                    onChange={handleEndTimeChange}
                                    className="
                    w-full pl-10 pr-3 py-2 rounded-lg border border-border bg-background
                    text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50
                  "
                                />
                            </div>
                        </div>
                    </div>

                    {/* Days Selection */}
                    <div>
                        <label className="text-sm font-medium text-foreground mb-2 block">
                            Active Days
                        </label>
                        <div className="flex gap-1">
                            {DAYS_OF_WEEK.map(({ day, label, short }) => (
                                <button
                                    key={day}
                                    onClick={() => handleDayToggle(day)}
                                    className={`
                    w-9 h-9 rounded-full text-sm font-medium transition-colors
                    ${days.includes(day)
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                        }
                  `}
                                    aria-label={`${days.includes(day) ? 'Remove' : 'Add'} ${label}`}
                                    title={label}
                                >
                                    {short}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default QuietHoursConfiguration;
