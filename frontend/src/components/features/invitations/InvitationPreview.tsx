/**
 * InvitationPreview: Real-time preview of the digital invitation
 *
 * Features:
 * - Mobile/desktop view toggle
 * - Dynamic rendering based on customization
 * - Template layout rendering
 * - Countdown display
 *
 * Feature: 016-save-the-date
 */

import React, { useMemo } from 'react';
import {
  Calendar,
  MapPin,
  Clock,
  Users,
  Smartphone,
  Monitor,
  ExternalLink,
} from 'lucide-react';

import { AppButton } from '@/components/ui/AppButton';
import type { VenueInfo, RSVPSettings, TemplateLayout } from '@/types/invitations';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InvitationPreviewProps {
  /** Event title */
  title: string;
  /** Event description */
  description?: string;
  /** Event type */
  eventType: string;
  /** Event datetime (ISO string) */
  eventDatetime: string;
  /** Event end datetime (ISO string) */
  eventEndDatetime?: string;
  /** Event timezone */
  timezone: string;
  /** Venue information */
  venue: VenueInfo;
  /** Host names */
  hostNames: string[];
  /** Cover image URL */
  coverImageUrl?: string;
  /** Template layout configuration */
  templateLayout?: TemplateLayout;
  /** Custom colors/fonts */
  customization: {
    colors?: Record<string, string>;
    fonts?: Record<string, string>;
  };
  /** RSVP settings */
  rsvpSettings?: RSVPSettings;
  /** View mode: mobile or desktop */
  viewMode?: 'mobile' | 'desktop';
  /** Callback to change view mode */
  onViewModeChange?: (mode: 'mobile' | 'desktop') => void;
  /** Optional className */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

function formatEventDate(datetime: string, timezone: string): string {
  try {
    const date = new Date(datetime);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: timezone,
    });
  } catch {
    return 'Date TBD';
  }
}

function formatEventTime(datetime: string, timezone: string): string {
  try {
    const date = new Date(datetime);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
    });
  } catch {
    return 'Time TBD';
  }
}

function getCountdown(datetime: string): { days: number; hours: number; minutes: number } | null {
  try {
    const eventDate = new Date(datetime);
    const now = new Date();
    const diff = eventDate.getTime() - now.getTime();

    if (diff <= 0) return null;

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return { days, hours, minutes };
  } catch {
    return null;
  }
}

function getEventTypeEmoji(eventType: string): string {
  const emojis: Record<string, string> = {
    wedding: '💒',
    birthday: '🎂',
    anniversary: '💑',
    baby_shower: '👶',
    engagement: '💍',
    festival: '🎉',
    corporate: '🏢',
    other: '✨',
  };
  return emojis[eventType] || '✨';
}

// ---------------------------------------------------------------------------
// Countdown Component
// ---------------------------------------------------------------------------

interface CountdownProps {
  datetime: string;
  primaryColor: string;
  secondaryColor: string;
}

const Countdown: React.FC<CountdownProps> = ({
  datetime,
  primaryColor,
  secondaryColor,
}) => {
  const countdown = useMemo(() => getCountdown(datetime), [datetime]);

  if (!countdown) return null;

  return (
    <div className="flex justify-center gap-4 py-6">
      {[
        { value: countdown.days, label: 'Days' },
        { value: countdown.hours, label: 'Hours' },
        { value: countdown.minutes, label: 'Minutes' },
      ].map(({ value, label }) => (
        <div key={label} className="text-center">
          <div
            className="text-3xl font-bold mb-1"
            style={{ color: primaryColor }}
          >
            {value}
          </div>
          <div className="text-xs uppercase tracking-wider" style={{ color: secondaryColor }}>
            {label}
          </div>
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const InvitationPreview: React.FC<InvitationPreviewProps> = ({
  title,
  description,
  eventType,
  eventDatetime,
  eventEndDatetime,
  timezone,
  venue,
  hostNames,
  coverImageUrl,
  customization,
  rsvpSettings,
  viewMode = 'mobile',
  onViewModeChange,
  className = '',
}) => {
  // Extract colors with fallbacks
  const colors = {
    primary: customization.colors?.primary || '#6366f1',
    secondary: customization.colors?.secondary || '#8b5cf6',
    accent: customization.colors?.accent || '#f59e0b',
    background: customization.colors?.background || '#ffffff',
  };

  // Extract fonts with fallbacks
  const fonts = {
    heading: customization.fonts?.heading || 'Playfair Display',
    body: customization.fonts?.body || 'Inter',
  };

  const formattedDate = formatEventDate(eventDatetime, timezone);
  const formattedTime = formatEventTime(eventDatetime, timezone);
  const endTime = eventEndDatetime
    ? formatEventTime(eventEndDatetime, timezone)
    : null;

  const venueDisplay = [venue.name, venue.city, venue.state]
    .filter(Boolean)
    .join(', ');

  return (
    <div className={className}>
      {/* View Mode Toggle */}
      {onViewModeChange && (
        <div className="flex justify-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => onViewModeChange('mobile')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
              viewMode === 'mobile'
                ? 'bg-primary text-white'
                : 'bg-surface-hover text-text-secondary'
            }`}
            aria-pressed={viewMode === 'mobile'}
          >
            <Smartphone className="w-4 h-4" />
            Mobile
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('desktop')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
              viewMode === 'desktop'
                ? 'bg-primary text-white'
                : 'bg-surface-hover text-text-secondary'
            }`}
            aria-pressed={viewMode === 'desktop'}
          >
            <Monitor className="w-4 h-4" />
            Desktop
          </button>
        </div>
      )}

      {/* Preview Frame */}
      <div
        className={`mx-auto border border-border rounded-xl overflow-hidden shadow-lg transition-all duration-300 ${
          viewMode === 'mobile' ? 'max-w-[375px]' : 'max-w-[768px]'
        }`}
        style={{ backgroundColor: colors.background }}
      >
        {/* Cover Image / Hero */}
        <div className="relative aspect-[16/9] overflow-hidden">
          {coverImageUrl ? (
            <img
              src={coverImageUrl}
              alt={title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full"
              style={{
                background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
              }}
            />
          )}

          {/* Overlay with title */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end p-6">
            <p
              className="text-white/80 text-sm mb-2"
              style={{ fontFamily: fonts.body }}
            >
              {getEventTypeEmoji(eventType)} You&apos;re Invited
            </p>
            <h1
              className="text-white text-2xl md:text-3xl font-bold leading-tight"
              style={{ fontFamily: fonts.heading }}
            >
              {title || 'Your Event Title'}
            </h1>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Countdown */}
          {eventDatetime && (
            <Countdown
              datetime={eventDatetime}
              primaryColor={colors.primary}
              secondaryColor={colors.secondary}
            />
          )}

          {/* Divider */}
          <div
            className="h-px"
            style={{
              background: `linear-gradient(90deg, transparent, ${colors.accent}, transparent)`,
            }}
          />

          {/* Description */}
          {description && (
            <p
              className="text-center text-sm leading-relaxed"
              style={{ fontFamily: fonts.body, color: colors.secondary }}
            >
              {description}
            </p>
          )}

          {/* Event Details */}
          <div className="space-y-4">
            {/* Date & Time */}
            <div className="flex items-start gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${colors.primary}15` }}
              >
                <Calendar className="w-5 h-5" style={{ color: colors.primary }} />
              </div>
              <div>
                <p
                  className="font-medium"
                  style={{ fontFamily: fonts.heading, color: colors.primary }}
                >
                  {formattedDate}
                </p>
                <p
                  className="text-sm flex items-center gap-1"
                  style={{ color: colors.secondary }}
                >
                  <Clock className="w-3.5 h-3.5" />
                  {formattedTime}
                  {endTime && ` - ${endTime}`}
                </p>
              </div>
            </div>

            {/* Venue */}
            {venueDisplay && (
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${colors.primary}15` }}
                >
                  <MapPin className="w-5 h-5" style={{ color: colors.primary }} />
                </div>
                <div>
                  <p
                    className="font-medium"
                    style={{ fontFamily: fonts.heading, color: colors.primary }}
                  >
                    {venue.name || 'Venue'}
                  </p>
                  <p className="text-sm" style={{ color: colors.secondary }}>
                    {[venue.address, venue.city, venue.state, venue.country]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                  {venue.map_url && (
                    <a
                      href={venue.map_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs mt-1 hover:underline"
                      style={{ color: colors.accent }}
                    >
                      View on Map
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Hosts */}
            {hostNames.length > 0 && (
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${colors.primary}15` }}
                >
                  <Users className="w-5 h-5" style={{ color: colors.primary }} />
                </div>
                <div>
                  <p
                    className="font-medium"
                    style={{ fontFamily: fonts.heading, color: colors.primary }}
                  >
                    Hosted by
                  </p>
                  <p className="text-sm" style={{ color: colors.secondary }}>
                    {hostNames.join(' & ')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* RSVP Button */}
          {rsvpSettings?.enabled && (
            <div className="pt-4">
              <button
                type="button"
                className="w-full py-3 px-6 rounded-lg font-medium text-white transition-opacity hover:opacity-90"
                style={{
                  background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
                  fontFamily: fonts.body,
                }}
              >
                RSVP Now
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 text-center text-xs"
          style={{
            backgroundColor: `${colors.primary}08`,
            color: colors.secondary,
            fontFamily: fonts.body,
          }}
        >
          Made with ❤️ on RawDrive
        </div>
      </div>
    </div>
  );
};

export default InvitationPreview;
