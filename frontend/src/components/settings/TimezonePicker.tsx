import React, { useMemo, useState, useCallback } from 'react';
import { Clock, ChevronDown, Search, Check } from 'lucide-react';

/* =============================================================================
   TimezonePicker Component

   A searchable dropdown for selecting timezones.
   Features:
   - Grouped by region
   - Search/filter functionality
   - Current time preview
   - Keyboard navigation
   ============================================================================= */

interface TimezonePickerProps {
  /** Currently selected timezone (IANA format) */
  value: string;
  /** Callback when timezone changes */
  onChange: (timezone: string) => void;
  /** Label for accessibility */
  label?: string;
  /** Whether the picker is disabled */
  disabled?: boolean;
  /** Error message */
  error?: string;
}

// Common timezones grouped by region
const TIMEZONES: Record<string, { value: string; label: string; offset: string }[]> = {
  'Asia': [
    { value: 'Asia/Kolkata', label: 'India (Kolkata)', offset: '+05:30' },
    { value: 'Asia/Dubai', label: 'Dubai', offset: '+04:00' },
    { value: 'Asia/Singapore', label: 'Singapore', offset: '+08:00' },
    { value: 'Asia/Tokyo', label: 'Japan (Tokyo)', offset: '+09:00' },
    { value: 'Asia/Shanghai', label: 'China (Shanghai)', offset: '+08:00' },
    { value: 'Asia/Hong_Kong', label: 'Hong Kong', offset: '+08:00' },
    { value: 'Asia/Seoul', label: 'South Korea (Seoul)', offset: '+09:00' },
    { value: 'Asia/Bangkok', label: 'Thailand (Bangkok)', offset: '+07:00' },
    { value: 'Asia/Jakarta', label: 'Indonesia (Jakarta)', offset: '+07:00' },
    { value: 'Asia/Manila', label: 'Philippines (Manila)', offset: '+08:00' },
  ],
  'Europe': [
    { value: 'Europe/London', label: 'UK (London)', offset: '+00:00' },
    { value: 'Europe/Paris', label: 'France (Paris)', offset: '+01:00' },
    { value: 'Europe/Berlin', label: 'Germany (Berlin)', offset: '+01:00' },
    { value: 'Europe/Moscow', label: 'Russia (Moscow)', offset: '+03:00' },
    { value: 'Europe/Amsterdam', label: 'Netherlands (Amsterdam)', offset: '+01:00' },
    { value: 'Europe/Rome', label: 'Italy (Rome)', offset: '+01:00' },
    { value: 'Europe/Madrid', label: 'Spain (Madrid)', offset: '+01:00' },
    { value: 'Europe/Stockholm', label: 'Sweden (Stockholm)', offset: '+01:00' },
  ],
  'Americas': [
    { value: 'America/New_York', label: 'US Eastern (New York)', offset: '-05:00' },
    { value: 'America/Chicago', label: 'US Central (Chicago)', offset: '-06:00' },
    { value: 'America/Denver', label: 'US Mountain (Denver)', offset: '-07:00' },
    { value: 'America/Los_Angeles', label: 'US Pacific (Los Angeles)', offset: '-08:00' },
    { value: 'America/Toronto', label: 'Canada (Toronto)', offset: '-05:00' },
    { value: 'America/Vancouver', label: 'Canada (Vancouver)', offset: '-08:00' },
    { value: 'America/Mexico_City', label: 'Mexico City', offset: '-06:00' },
    { value: 'America/Sao_Paulo', label: 'Brazil (São Paulo)', offset: '-03:00' },
    { value: 'America/Buenos_Aires', label: 'Argentina (Buenos Aires)', offset: '-03:00' },
  ],
  'Pacific': [
    { value: 'Pacific/Auckland', label: 'New Zealand (Auckland)', offset: '+12:00' },
    { value: 'Pacific/Fiji', label: 'Fiji', offset: '+12:00' },
    { value: 'Pacific/Honolulu', label: 'Hawaii (Honolulu)', offset: '-10:00' },
  ],
  'Australia': [
    { value: 'Australia/Sydney', label: 'Australia (Sydney)', offset: '+10:00' },
    { value: 'Australia/Melbourne', label: 'Australia (Melbourne)', offset: '+10:00' },
    { value: 'Australia/Perth', label: 'Australia (Perth)', offset: '+08:00' },
    { value: 'Australia/Brisbane', label: 'Australia (Brisbane)', offset: '+10:00' },
  ],
  'Africa': [
    { value: 'Africa/Johannesburg', label: 'South Africa (Johannesburg)', offset: '+02:00' },
    { value: 'Africa/Cairo', label: 'Egypt (Cairo)', offset: '+02:00' },
    { value: 'Africa/Lagos', label: 'Nigeria (Lagos)', offset: '+01:00' },
    { value: 'Africa/Nairobi', label: 'Kenya (Nairobi)', offset: '+03:00' },
  ],
  'Other': [
    { value: 'UTC', label: 'UTC', offset: '+00:00' },
  ],
};

// Get current time for a timezone
const getCurrentTime = (timezone: string): string => {
  try {
    return new Date().toLocaleTimeString('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
};

// Find timezone info by value
const findTimezone = (value: string): { label: string; offset: string } | null => {
  for (const group of Object.values(TIMEZONES)) {
    const tz = group.find((t) => t.value === value);
    if (tz) return { label: tz.label, offset: tz.offset };
  }
  return null;
};

export const TimezonePicker: React.FC<TimezonePickerProps> = ({
  value,
  onChange,
  label = 'Timezone',
  disabled = false,
  error,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter timezones based on search
  const filteredTimezones = useMemo(() => {
    if (!searchQuery.trim()) return TIMEZONES;

    const query = searchQuery.toLowerCase();
    const filtered: Record<string, typeof TIMEZONES['Asia']> = {};

    for (const [region, zones] of Object.entries(TIMEZONES)) {
      const matchingZones = zones.filter(
        (tz) =>
          tz.label.toLowerCase().includes(query) ||
          tz.value.toLowerCase().includes(query) ||
          tz.offset.includes(query)
      );
      if (matchingZones.length > 0) {
        filtered[region] = matchingZones;
      }
    }

    return filtered;
  }, [searchQuery]);

  const selectedTimezone = useMemo(() => findTimezone(value), [value]);
  const currentTime = useMemo(() => getCurrentTime(value), [value]);

  const handleToggle = useCallback(() => {
    if (!disabled) {
      setIsOpen((prev) => !prev);
      setSearchQuery('');
    }
  }, [disabled]);

  const handleSelect = useCallback((timezone: string) => {
    onChange(timezone);
    setIsOpen(false);
    setSearchQuery('');
  }, [onChange]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
    }
  }, []);

  return (
    <div className="relative" onKeyDown={handleKeyDown}>
      {/* Label */}
      <label className="block text-sm font-medium text-text-primary mb-1.5">
        {label}
      </label>

      {/* Trigger Button */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={`
          w-full flex items-center justify-between gap-2 px-4 py-3
          bg-surface border rounded-xl text-left
          transition-all duration-200
          ${error ? 'border-error' : 'border-border hover:border-primary focus:border-primary'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
        `}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Clock className="w-5 h-5 text-text-tertiary flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-text-primary truncate">
              {selectedTimezone?.label || value}
            </div>
            <div className="text-xs text-text-tertiary">
              {currentTime} (UTC{selectedTimezone?.offset})
            </div>
          </div>
        </div>
        <ChevronDown
          className={`w-5 h-5 text-text-tertiary flex-shrink-0 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Error message */}
      {error && (
        <p className="mt-1 text-sm text-error" role="alert">
          {error}
        </p>
      )}

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown content */}
          <div
            className="absolute z-50 mt-2 w-full bg-surface border border-border rounded-xl shadow-lg overflow-hidden"
            role="listbox"
          >
            {/* Search input */}
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search timezones..."
                  className="w-full pl-9 pr-4 py-2 text-sm bg-surface-hover border-none rounded-lg
                    focus:outline-none focus:ring-2 focus:ring-primary"
                  autoFocus
                />
              </div>
            </div>

            {/* Timezone list */}
            <div className="max-h-64 overflow-y-auto">
              {Object.entries(filteredTimezones).map(([region, zones]) => (
                <div key={region}>
                  {/* Region header */}
                  <div className="px-3 py-2 text-xs font-semibold text-text-tertiary uppercase tracking-wider bg-surface-hover">
                    {region}
                  </div>

                  {/* Timezone options */}
                  {zones.map((tz) => (
                    <button
                      key={tz.value}
                      type="button"
                      onClick={() => handleSelect(tz.value)}
                      className={`
                        w-full flex items-center justify-between px-4 py-2.5 text-left
                        hover:bg-surface-hover transition-colors
                        ${value === tz.value ? 'bg-primary/5' : ''}
                      `}
                      role="option"
                      aria-selected={value === tz.value}
                    >
                      <div className="min-w-0">
                        <div className="text-sm text-text-primary truncate">
                          {tz.label}
                        </div>
                        <div className="text-xs text-text-tertiary">
                          UTC{tz.offset}
                        </div>
                      </div>
                      {value === tz.value && (
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              ))}

              {/* No results */}
              {Object.keys(filteredTimezones).length === 0 && (
                <div className="px-4 py-8 text-center text-text-tertiary text-sm">
                  No timezones found matching "{searchQuery}"
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default TimezonePicker;
