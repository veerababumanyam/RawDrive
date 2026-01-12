/**
 * InvitationRenderer: Unified component for invitation display
 *
 * This is the SINGLE SOURCE OF TRUTH for rendering invitations.
 * Used by both:
 * - PublicInvitationView (production public pages)
 * - InvitationPreview (wizard preview)
 *
 * Features:
 * - Mobile-first responsive design
 * - Dark mode support
 * - WCAG-compliant touch targets and contrast
 * - Glassmorphism effects with performance optimization
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
    Calendar,
    MapPin,
    Clock,
    ExternalLink,
    Volume2,
    VolumeX,
} from 'lucide-react';
import type { PublicInvitation, VenueInfo } from '@/types/invitations';
import type { TaglineConfig } from '@/types/invitations';
import { VideoPlayer } from '@/components/features/media/VideoPlayer';
import { loadInvitationFonts, preloadLanguageFonts } from '@/utils/fontLoader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InvitationRendererProps {
    /** Invitation data */
    invitation: PublicInvitation;
    /** Rendering mode */
    mode: 'preview' | 'public';
    /** Theme */
    theme?: 'light' | 'dark';
    /** Custom classes */
    className?: string;
    /** Disable RSVP form (for preview mode) */
    disableRSVP?: boolean;
    /** Children to render after content (e.g., RSVP form from parent) */
    children?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

function getLuminance(hex: string): number {
    const rgb = hex.replace('#', '').match(/.{2}/g)?.map((x) => parseInt(x, 16) / 255) || [0, 0, 0];
    const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(color1: string, color2: string): number {
    const l1 = getLuminance(color1);
    const l2 = getLuminance(color2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

function getWCAGSafeColor(color: string, isDark: boolean, minRatio: number = 4.5): string {
    const bgColor = isDark ? '#0f172a' : '#ffffff';
    const ratio = getContrastRatio(color, bgColor);
    if (ratio >= minRatio) return color;
    return isDark ? '#e2e8f0' : '#1e293b';
}

function formatEventDate(datetime: string, timezone: string): string {
    try {
        return new Date(datetime).toLocaleDateString('en-US', {
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
        return new Date(datetime).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: timezone,
        });
    } catch {
        return 'Time TBD';
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
// Countdown Sub-Component
// ---------------------------------------------------------------------------

interface CountdownProps {
    datetime: string;
    colors: { primary: string; secondary: string };
    isDark: boolean;
}

const Countdown: React.FC<CountdownProps> = ({ datetime, colors, isDark }) => {
    const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

    useEffect(() => {
        const calculate = () => {
            const diff = new Date(datetime).getTime() - Date.now();
            if (diff <= 0) {
                setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0 });
                return;
            }
            setCountdown({
                days: Math.floor(diff / (1000 * 60 * 60 * 24)),
                hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
                minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
                seconds: Math.floor((diff % (1000 * 60)) / 1000),
            });
        };

        calculate();
        const timer = setInterval(calculate, 1000);
        return () => clearInterval(timer);
    }, [datetime]);

    const safeColor = getWCAGSafeColor(colors.primary, isDark, 3);

    return (
        <div className="flex justify-center gap-2 sm:gap-4 py-4 sm:py-6">
            {[
                { value: countdown.days, label: 'Days' },
                { value: countdown.hours, label: 'Hours' },
                { value: countdown.minutes, label: 'Min' },
                { value: countdown.seconds, label: 'Sec' },
            ].map(({ value, label }) => (
                <div
                    key={label}
                    className="
            text-center min-w-[55px] sm:min-w-[65px] p-2 sm:p-3 rounded-xl
            bg-white/70 dark:bg-gray-800/70
            backdrop-blur-sm border border-white/50 dark:border-white/10
            shadow-sm
          "
                >
                    <div
                        className="text-xl sm:text-2xl md:text-3xl font-bold mb-0.5 tabular-nums"
                        style={{ color: safeColor }}
                    >
                        {String(value).padStart(2, '0')}
                    </div>
                    <div className="text-[9px] sm:text-[10px] uppercase tracking-wider font-medium text-gray-600 dark:text-gray-300">
                        {label}
                    </div>
                </div>
            ))}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Hero Sub-Component
// ---------------------------------------------------------------------------

interface HeroProps {
    title: string;
    eventType: string;
    coverImageUrl?: string;
    videoUrl?: string;
    audioUrl?: string;
    colors: { primary: string; secondary: string };
    fonts: { heading: string; body: string };
    tagline?: TaglineConfig;
}

const Hero: React.FC<HeroProps> = ({
    title,
    eventType,
    coverImageUrl,
    videoUrl,
    audioUrl,
    colors,
    fonts,
    tagline,
}) => {
    const [isAudioPlaying, setIsAudioPlaying] = useState(false);
    const audioRef = React.useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (audioRef.current) {
            if (isAudioPlaying) {
                audioRef.current.play().catch(() => { });
            } else {
                audioRef.current.pause();
            }
        }
    }, [isAudioPlaying]);

    const taglineText = tagline?.text || 'You\'re Invited';
    const taglineEmoji = tagline?.type === 'emoji' && tagline?.value ? tagline.value : getEventTypeEmoji(eventType);

    return (
        <div className="relative w-full aspect-[4/3] sm:aspect-[16/9] lg:aspect-[21/9] overflow-hidden">
            {/* Background */}
            {videoUrl ? (
                <VideoPlayer
                    src={videoUrl}
                    poster={coverImageUrl}
                    autoPlay={true}
                    loop={true}
                    muted={true}
                    controls={false}
                    className="w-full h-full object-cover"
                />
            ) : coverImageUrl ? (
                <img src={coverImageUrl} alt={title} className="w-full h-full object-cover" />
            ) : (
                <div
                    className="w-full h-full"
                    style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})` }}
                />
            )}

            {/* Audio Toggle */}
            {audioUrl && (
                <div className="absolute top-3 right-3 z-20">
                    <audio ref={audioRef} src={audioUrl} loop />
                    <button
                        type="button"
                        onClick={() => setIsAudioPlaying(!isAudioPlaying)}
                        className="p-2.5 rounded-full bg-black/30 backdrop-blur-sm text-white hover:bg-black/50 transition-colors min-w-[44px] min-h-[44px]"
                    >
                        {isAudioPlaying ? <Volume2 size={18} /> : <VolumeX size={18} />}
                    </button>
                </div>
            )}

            {/* Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent flex flex-col text-center">
                {/* Safe area spacer for mobile notch - minimum height to clear notch */}
                <div className="h-16 sm:h-0 flex-shrink-0"></div>
                
                {/* Flexible spacer to push content to bottom */}
                <div className="flex-1 min-h-0"></div>
                
                {/* Content area with responsive padding */}
                <div className="px-4 pb-20 sm:px-6 sm:pb-6 md:px-8 md:pb-8 lg:px-12 lg:pb-12 flex-shrink-0 relative z-10">
                    <div className="max-w-4xl mx-auto w-full">
                        <p className="
                            inline-block
                            text-white text-base sm:text-lg mb-3 sm:mb-4 font-semibold
                            px-4 py-2 sm:px-5 sm:py-2.5
                            rounded-full
                            bg-black/40 backdrop-blur-md
                            border border-white/20
                            shadow-[0_4px_12px_rgba(0,0,0,0.3)]
                            drop-shadow-2xl
                        ">
                            {taglineEmoji} {taglineText}
                        </p>
                        <h1
                            className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-tight drop-shadow-lg"
                            style={{ fontFamily: fonts.heading }}
                        >
                            {title}
                        </h1>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Details Cards Sub-Component
// ---------------------------------------------------------------------------

interface DetailsCardsProps {
    invitation: PublicInvitation;
    colors: { primary: string; secondary: string; accent: string };
    fonts: { heading: string; body: string };
    isDark: boolean;
}

const DetailsCards: React.FC<DetailsCardsProps> = ({ invitation, colors, fonts, isDark }) => {
    const formattedDate = formatEventDate(invitation.event_datetime, invitation.event_timezone);
    const formattedTime = formatEventTime(invitation.event_datetime, invitation.event_timezone);
    const endTime = invitation.event_end_datetime
        ? formatEventTime(invitation.event_end_datetime, invitation.event_timezone)
        : null;

    const venueAddress = [
        invitation.venue.address,
        invitation.venue.city,
        invitation.venue.state,
        invitation.venue.country,
    ].filter(Boolean).join(', ');

    const safeColors = {
        primary: getWCAGSafeColor(colors.primary, isDark, 3),
        accent: getWCAGSafeColor(colors.accent, isDark, 3),
    };

    const cardClasses = `
    p-4 sm:p-5 rounded-xl
    bg-white/75 dark:bg-gray-900/60
    backdrop-blur-md
    border border-white/50 dark:border-white/10
    shadow-md
  `;

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 mb-6">
            {/* Date & Time Card */}
            <div className={cardClasses}>
                <div className="flex items-start gap-3">
                    <div
                        className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${colors.primary}20` }}
                    >
                        <Calendar className="w-5 h-5 sm:w-5.5 sm:h-5.5" style={{ color: safeColors.primary }} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3
                            className="font-semibold text-base sm:text-lg mb-1"
                            style={{ fontFamily: fonts.heading, color: safeColors.primary }}
                        >
                            When
                        </h3>
                        <p className="text-gray-900 dark:text-gray-100 text-sm sm:text-base">{formattedDate}</p>
                        <p className="text-gray-600 dark:text-gray-400 text-sm flex items-center gap-1 mt-0.5">
                            <Clock className="w-3.5 h-3.5" />
                            {formattedTime}{endTime && ` - ${endTime}`}
                        </p>
                    </div>
                </div>
            </div>

            {/* Venue Card */}
            <div className={cardClasses}>
                <div className="flex items-start gap-3">
                    <div
                        className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${colors.primary}20` }}
                    >
                        <MapPin className="w-5 h-5 sm:w-5.5 sm:h-5.5" style={{ color: safeColors.primary }} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3
                            className="font-semibold text-base sm:text-lg mb-1"
                            style={{ fontFamily: fonts.heading, color: safeColors.primary }}
                        >
                            Where
                        </h3>
                        {invitation.venue.name && (
                            <p className="text-gray-900 dark:text-gray-100 font-medium text-sm sm:text-base">
                                {invitation.venue.name}
                            </p>
                        )}
                        <p className="text-gray-600 dark:text-gray-400 text-xs sm:text-sm truncate">{venueAddress}</p>
                        {invitation.venue.map_url && (
                            <a
                                href={invitation.venue.map_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs sm:text-sm mt-1.5 hover:underline min-h-[44px] py-2"
                                style={{ color: safeColors.accent }}
                            >
                                Get Directions
                                <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Main InvitationRenderer Component
// ---------------------------------------------------------------------------

export const InvitationRenderer: React.FC<InvitationRendererProps> = ({
    invitation,
    mode,
    theme = 'light',
    className = '',
    disableRSVP = false,
    children,
}) => {
    const isDark = theme === 'dark';

    const colors = useMemo(() => {
        const customColors = invitation.customization?.colors as Record<string, string> | undefined;
        return {
            primary: customColors?.primary || '#6366f1',
            secondary: customColors?.secondary || '#8b5cf6',
            accent: customColors?.accent || '#f59e0b',
            background: customColors?.background || (isDark ? '#0f172a' : '#ffffff'),
        };
    }, [invitation.customization, isDark]);

    const fonts = useMemo(() => {
        const customFonts = invitation.customization?.fonts as Record<string, string> | undefined;
        return {
            heading: customFonts?.heading || 'Playfair Display',
            body: customFonts?.body || 'Inter',
        };
    }, [invitation.customization]);

    // Font Loading
    useEffect(() => {
        const primaryLang = invitation.primary_language || 'en';
        preloadLanguageFonts(primaryLang);

        const customization = invitation.customization as Record<string, unknown>;
        const customFontsList: Array<{ font_id: string; family: string; url: string; format?: string }> = [];

        // Safely extract custom fonts if present
        if (customization?.customFonts && Array.isArray(customization.customFonts)) {
            customFontsList.push(...(customization.customFonts as Array<{ font_id: string; family: string; url: string; format?: string }>));
        }

        loadInvitationFonts(fonts.heading, fonts.body, customFontsList);
    }, [invitation.primary_language, fonts.heading, fonts.body, invitation.customization]);

    const tagline = invitation.customization?.tagline as TaglineConfig | undefined;

    return (
        <div
            data-theme={theme}
            data-mode={mode}
            className={`
        min-h-full w-full overflow-y-auto
        bg-gradient-to-br from-slate-50 via-blue-50/50 to-cyan-50/30
        dark:from-gray-950 dark:via-slate-900 dark:to-gray-900
        transition-colors duration-300
        ${className}
      `}
            style={{ fontFamily: fonts.body }}
        >
            {/* Hero */}
            <Hero
                title={invitation.title}
                eventType={invitation.event_type}
                coverImageUrl={invitation.cover_image_url}
                videoUrl={invitation.video_url}
                audioUrl={invitation.audio_url}
                colors={colors}
                fonts={fonts}
                tagline={tagline}
            />

            {/* Main Content */}
            <div className="max-w-4xl mx-auto px-4 py-5 sm:py-8">
                {/* Countdown */}
                <Countdown datetime={invitation.event_datetime} colors={colors} isDark={isDark} />

                {/* Divider */}
                <div
                    className="h-px max-w-xs mx-auto my-4 sm:my-6"
                    style={{ background: `linear-gradient(90deg, transparent, ${colors.accent}, transparent)` }}
                />

                {/* Description */}
                {invitation.description && (
                    <p className="text-center text-sm sm:text-base md:text-lg leading-relaxed mb-5 sm:mb-6 text-gray-700 dark:text-gray-300 px-2">
                        {invitation.description}
                    </p>
                )}

                {/* Event Details */}
                <DetailsCards invitation={invitation} colors={colors} fonts={fonts} isDark={isDark} />

                {/* Hosts */}
                {invitation.host_names.length > 0 && (
                    <div className="text-center mb-5 sm:mb-6">
                        <p className="text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider mb-1.5">
                            Hosted by
                        </p>
                        <p
                            className="text-lg sm:text-xl"
                            style={{
                                fontFamily: fonts.heading,
                                color: getWCAGSafeColor(colors.primary, isDark, 3),
                            }}
                        >
                            {invitation.host_names.join(' & ')}
                        </p>
                    </div>
                )}

                {/* Gallery Images */}
                {invitation.gallery_images.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 mb-5 sm:mb-6">
                        {invitation.gallery_images.slice(0, 6).map((url, index) => (
                            <div key={index} className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                                <img src={url} alt={`Gallery ${index + 1}`} className="w-full h-full object-cover" />
                            </div>
                        ))}
                    </div>
                )}

                {/* Children (RSVP form, etc.) */}
                {children}
            </div>

            {/* Footer */}
            <div className="text-center py-4 sm:py-6 text-gray-400 dark:text-gray-500 text-xs">
                {mode === 'preview' && (
                    <p className="italic">This is a preview. Save to see the real invitation.</p>
                )}
            </div>
        </div>
    );
};

export default InvitationRenderer;
