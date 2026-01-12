import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
    CheckCircle,
    XCircle,
    Download,
    Loader2,
    Lock,
    AlertTriangle,
} from 'lucide-react';
import { useMutation, UseMutationResult } from '@tanstack/react-query';

import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { Select, Checkbox } from '@/components/ui/FormControls';
import { Turnstile, useTurnstile } from '@/components/ui/Turnstile';
import SEOHead from '@/components/landing/seo/SEOHead';
import { loadInvitationFonts, preloadLanguageFonts } from '@/utils/fontLoader';
import type { TurnstileConfig } from '@/services/invitationService';
import type {
    PublicInvitation,
    SubmitRSVPRequest,
    RSVPSubmitResponse,
} from '@/types/invitations';
import { SUPPORTED_LANGUAGES } from '@/i18n/config';
import { InvitationRenderer } from './InvitationRenderer';

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Calculate relative luminance of a color for WCAG contrast calculations.
 * @see https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function getLuminance(hex: string): number {
    const rgb = hex.replace('#', '').match(/.{2}/g)?.map((c) => {
        const val = parseInt(c, 16) / 255;
        return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
    }) || [0, 0, 0];
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

/**
 * Calculate WCAG contrast ratio between two colors.
 * @see https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */
export function getContrastRatio(color1: string, color2: string): number {
    const l1 = getLuminance(color1);
    const l2 = getLuminance(color2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if a color meets WCAG AA contrast requirements against a background.
 * Returns the color if it passes, or a WCAG-safe fallback if not.
 * @param color - The color to check (hex)
 * @param isDark - Whether we're in dark mode
 * @param minRatio - Minimum contrast ratio (4.5 for normal text, 3 for large text)
 */
export function getWCAGSafeColor(
    color: string,
    isDark: boolean,
    minRatio: number = 4.5
): string {
    const background = isDark ? '#111827' : '#ffffff'; // gray-900 : white
    const ratio = getContrastRatio(color, background);

    if (ratio >= minRatio) {
        return color;
    }

    // Return a safe fallback that meets contrast requirements
    return isDark ? '#93C5FD' : '#1D4ED8'; // blue-300 (light on dark) : blue-700 (dark on light)
}



/**
 * Map language codes to BCP 47 locale tags, font CSS classes, and date scripts.
 * Features: 016-save-the-date, 019-invitation-indian-languages
 */
const DATE_SCRIPT_MAP: Record<string, string> = {
    hi: 'Deva',
    mr: 'Deva',
    ta: 'Taml',
    te: 'Telu',
    kn: 'Knda',
    ml: 'Mlym',
    bn: 'Beng',
    as: 'Beng',
    gu: 'Gujr',
    or: 'Orya',
    pa: 'Guru',
    ur: 'Arab',
};

/**
 * Build LANGUAGE_CONFIG from centralized SUPPORTED_LANGUAGES.
 */
const LANGUAGE_CONFIG: Record<
    string,
    { locale: string; fontClass: string; dateScript?: string; dir: 'ltr' | 'rtl' }
> = Object.fromEntries(
    SUPPORTED_LANGUAGES.map((lang) => [
        lang.code,
        {
            locale: lang.code === 'ur' ? 'ur-PK' : `${lang.code}-IN`,
            fontClass: `font-lang-${lang.code}`,
            dateScript: DATE_SCRIPT_MAP[lang.code],
            dir: lang.dir,
        },
    ])
);

export function getLocaleForLanguage(langCode: string): string {
    return LANGUAGE_CONFIG[langCode]?.locale || 'en-IN';
}

export function getFontClassForLanguage(langCode: string): string {
    return LANGUAGE_CONFIG[langCode]?.fontClass || 'font-lang-en';
}

export function getDirectionForLanguage(langCode: string): 'ltr' | 'rtl' {
    return LANGUAGE_CONFIG[langCode]?.dir || 'ltr';
}

export function formatEventDate(
    datetime: string,
    timezone: string,
    langCode: string = 'en'
): string {
    try {
        const date = new Date(datetime);
        const locale = getLocaleForLanguage(langCode);
        return date.toLocaleDateString(locale, {
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

export function formatEventTime(
    datetime: string,
    timezone: string,
    langCode: string = 'en'
): string {
    try {
        const date = new Date(datetime);
        const locale = getLocaleForLanguage(langCode);
        return date.toLocaleTimeString(locale, {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: timezone,
        });
    } catch {
        return 'Time TBD';
    }
}



// ---------------------------------------------------------------------------
// Password Protection Form (with dark mode)
// ---------------------------------------------------------------------------

interface PasswordFormProps {
    requiresPassword: boolean;
    requiresPin: boolean;
    onSubmit: (password?: string, pin?: string) => void;
    isLoading: boolean;
    error?: string;
    theme: 'light' | 'dark';
}

export const PasswordForm: React.FC<PasswordFormProps> = ({
    requiresPassword,
    requiresPin,
    onSubmit,
    isLoading,
    error,
    theme,
}) => {
    const [password, setPassword] = useState('');
    const [pin, setPin] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(
            requiresPassword ? password : undefined,
            requiresPin ? pin : undefined
        );
    };

    return (
        <div
            data-theme={theme}
            className="
        inv-password-wrapper invitation-container
        bg-gradient-to-br from-slate-50 via-blue-50/50 to-cyan-50/30
        dark:from-gray-950 dark:via-slate-900 dark:to-gray-900
        transition-colors duration-300
      "
        >
            <div className="inv-password-card inv-glass">
                <div className="text-center mb-6">
                    <div
                        className="
              w-16 h-16 rounded-full
              bg-primary-100 dark:bg-primary-900/30
              flex items-center justify-center mx-auto mb-4
            "
                    >
                        <Lock className="w-8 h-8 text-primary-600 dark:text-primary-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                        Protected Invitation
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400">
                        Enter the {requiresPassword && requiresPin ? 'password and PIN' : requiresPassword ? 'password' : 'PIN'} to view this invitation
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {requiresPassword && (
                        <AppInput
                            label="Password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter password"
                            isRequired
                        />
                    )}

                    {requiresPin && (
                        <AppInput
                            label="PIN"
                            type="password"
                            inputMode="numeric"
                            maxLength={6}
                            value={pin}
                            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                            placeholder="Enter PIN"
                            isRequired
                        />
                    )}

                    {error && (
                        <p className="text-sm text-red-600 dark:text-red-400 text-center" role="alert">
                            {error}
                        </p>
                    )}

                    <AppButton type="submit" className="w-full min-h-[44px]" disabled={isLoading}>
                        {isLoading ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Verifying...
                            </>
                        ) : (
                            'View Invitation'
                        )}
                    </AppButton>
                </form>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// RSVP Form Component (with dark mode)
// ---------------------------------------------------------------------------

interface RSVPFormProps {
    invitation: PublicInvitation;
    colors: { primary: string; secondary: string; accent: string };
    onSubmit: (data: SubmitRSVPRequest) => void;
    isSubmitting: boolean;
    submitResult?: RSVPSubmitResponse;
    turnstileConfig?: TurnstileConfig | null;
    isDark: boolean;
}

export const RSVPForm: React.FC<RSVPFormProps> = ({
    invitation,
    colors,
    onSubmit,
    isSubmitting,
    submitResult,
    turnstileConfig,
    isDark,
}) => {
    const [formData, setFormData] = useState<SubmitRSVPRequest>({
        guest_name: '',
        guest_email: '',
        guest_phone: '',
        attending: true,
        party_size: 1,
        party_names: [],
        dietary_preferences: '',
        message: '',
        custom_answers: {},
    });
    const [partyNameInput, setPartyNameInput] = useState('');

    const turnstile = useTurnstile();
    const isTurnstileRequired = turnstileConfig?.enabled && turnstileConfig?.site_key;

    const updateForm = useCallback((updates: Partial<SubmitRSVPRequest>) => {
        setFormData((prev) => ({ ...prev, ...updates }));
    }, []);

    const addPartyName = useCallback(() => {
        const trimmed = partyNameInput.trim();
        if (trimmed && !formData.party_names?.includes(trimmed)) {
            updateForm({ party_names: [...(formData.party_names || []), trimmed] });
            setPartyNameInput('');
        }
    }, [partyNameInput, formData.party_names, updateForm]);

    const removePartyName = useCallback(
        (index: number) => {
            updateForm({
                party_names: (formData.party_names || []).filter((_, i) => i !== index),
            });
        },
        [formData.party_names, updateForm]
    );

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const submitData: SubmitRSVPRequest = {
            ...formData,
            ...(isTurnstileRequired && turnstile.token ? { turnstile_token: turnstile.token } : {}),
        };
        onSubmit(submitData);
    };

    const canSubmit = formData.guest_name &&
        formData.guest_email &&
        !isSubmitting &&
        (!isTurnstileRequired || turnstile.token);

    // Success message
    if (submitResult) {
        return (
            <div
                className="
          p-8 text-center rounded-2xl
          bg-white/70 dark:bg-gray-900/50
          backdrop-blur-xl
          border border-white/50 dark:border-white/10
          shadow-lg
        "
            >
                <div
                    className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                    style={{ backgroundColor: `${colors.primary}20` }}
                >
                    <CheckCircle className="w-8 h-8" style={{ color: getWCAGSafeColor(colors.primary, isDark, 3) }} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                    Thank You!
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">{submitResult.message}</p>
                {submitResult.edit_token && (
                    <p className="text-sm text-gray-500 dark:text-gray-500">
                        You can edit your response using the link sent to your email.
                    </p>
                )}
            </div>
        );
    }

    // RSVP deadline passed
    if (invitation.rsvp_deadline) {
        const deadlineDate = new Date(invitation.rsvp_deadline);
        if (deadlineDate < new Date()) {
            return (
                <div
                    className="
            p-8 text-center rounded-2xl
            bg-white/70 dark:bg-gray-900/50
            backdrop-blur-xl
            border border-white/50 dark:border-white/10
            shadow-lg
          "
                >
                    <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4">
                        <AlertTriangle className="w-8 h-8 text-amber-600 dark:text-amber-400" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                        RSVP Closed
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                        The RSVP deadline has passed. Please contact the host directly.
                    </p>
                </div>
            );
        }
    }

    return (
        <div
            className="
        p-6 md:p-8 rounded-2xl
        bg-white/70 dark:bg-gray-900/50
        backdrop-blur-xl
        border border-white/50 dark:border-white/10
        shadow-lg
      "
        >
            <h3
                className="text-xl font-bold mb-6 text-center"
                style={{ color: getWCAGSafeColor(colors.primary, isDark, 3) }}
            >
                RSVP
            </h3>

            <form onSubmit={handleSubmit} className="space-y-6" aria-label="RSVP form">
                {/* Attendance */}
                <fieldset>
                    <legend className="sr-only">Will you be attending?</legend>
                    <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4" role="radiogroup">
                        {[
                            { value: true, label: 'Attending', icon: CheckCircle },
                            { value: false, label: 'Not Attending', icon: XCircle },
                        ].map(({ value, label, icon: Icon }) => (
                            <button
                                key={String(value)}
                                type="button"
                                onClick={() => updateForm({ attending: value })}
                                role="radio"
                                aria-checked={formData.attending === value}
                                className={`
                  flex items-center justify-center gap-2 px-6 py-4 sm:py-3 rounded-lg border-2 transition-all
                  min-h-[48px] text-base sm:text-sm
                  focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none
                  ${formData.attending === value
                                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-primary-300 dark:hover:border-primary-700'
                                    }
                `}
                            >
                                <Icon className="w-5 h-5" aria-hidden="true" />
                                {label}
                            </button>
                        ))}
                    </div>
                </fieldset>

                {/* Guest Info */}
                <div className="space-y-4">
                    <AppInput
                        label="Your Name"
                        value={formData.guest_name}
                        onChange={(e) => updateForm({ guest_name: e.target.value })}
                        isRequired
                    />

                    <AppInput
                        label="Email Address"
                        type="email"
                        value={formData.guest_email}
                        onChange={(e) => updateForm({ guest_email: e.target.value })}
                        isRequired
                    />

                    {invitation.collect_phone && (
                        <AppInput
                            label="Phone Number"
                            type="tel"
                            value={formData.guest_phone || ''}
                            onChange={(e) => updateForm({ guest_phone: e.target.value })}
                        />
                    )}
                </div>

                {/* Party Size */}
                {formData.attending && invitation.max_party_size > 1 && (
                    <div className="space-y-4">
                        <Select
                            label="Number of Guests (including yourself)"
                            options={Array.from({ length: invitation.max_party_size }, (_, i) => ({
                                value: String(i + 1),
                                label: String(i + 1),
                            }))}
                            value={String(formData.party_size || 1)}
                            onChange={(e) =>
                                updateForm({ party_size: parseInt(e.target.value, 10) })
                            }
                        />

                        {(formData.party_size || 1) > 1 && (
                            <div>
                                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                                    Names of Additional Guests
                                </label>
                                <div className="flex gap-2 mb-2">
                                    <AppInput
                                        placeholder="Enter guest name"
                                        value={partyNameInput}
                                        onChange={(e) => setPartyNameInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                addPartyName();
                                            }
                                        }}
                                        containerClassName="flex-1"
                                    />
                                    <AppButton
                                        type="button"
                                        variant="outline"
                                        onClick={addPartyName}
                                        disabled={!partyNameInput.trim()}
                                        className="min-h-[44px]"
                                    >
                                        Add
                                    </AppButton>
                                </div>
                                {formData.party_names && formData.party_names.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {formData.party_names.map((name, index) => (
                                            <span
                                                key={index}
                                                className="
                          inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm
                          bg-gray-100 dark:bg-gray-800
                          text-gray-700 dark:text-gray-300
                        "
                                            >
                                                {name}
                                                <button
                                                    type="button"
                                                    onClick={() => removePartyName(index)}
                                                    className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 min-w-[24px] min-h-[24px]"
                                                    aria-label={`Remove ${name}`}
                                                >
                                                    ×
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Dietary Preferences */}
                {formData.attending && invitation.collect_dietary && (
                    <AppInput
                        label="Dietary Preferences or Restrictions"
                        placeholder="e.g., Vegetarian, Gluten-free, Allergies..."
                        value={formData.dietary_preferences || ''}
                        onChange={(e) => updateForm({ dietary_preferences: e.target.value })}
                    />
                )}

                {/* Custom Questions */}
                {formData.attending &&
                    invitation.custom_questions.map((q, index) => (
                        <div key={index}>
                            {q.type === 'text' && (
                                <AppInput
                                    label={q.question}
                                    value={formData.custom_answers?.[q.question] || ''}
                                    onChange={(e) =>
                                        updateForm({
                                            custom_answers: {
                                                ...formData.custom_answers,
                                                [q.question]: e.target.value,
                                            },
                                        })
                                    }
                                    isRequired={q.required}
                                />
                            )}
                            {q.type === 'select' && q.options && (
                                <Select
                                    label={q.question}
                                    options={q.options.map((opt) => ({ value: opt, label: opt }))}
                                    value={formData.custom_answers?.[q.question] || ''}
                                    onChange={(e) =>
                                        updateForm({
                                            custom_answers: {
                                                ...formData.custom_answers,
                                                [q.question]: e.target.value,
                                            },
                                        })
                                    }
                                    placeholder="Select an option"
                                />
                            )}
                            {q.type === 'checkbox' && (
                                <Checkbox
                                    label={q.question}
                                    checked={formData.custom_answers?.[q.question] === 'yes'}
                                    onChange={(e) =>
                                        updateForm({
                                            custom_answers: {
                                                ...formData.custom_answers,
                                                [q.question]: e.target.checked ? 'yes' : 'no',
                                            },
                                        })
                                    }
                                />
                            )}
                        </div>
                    ))}

                {/* Message */}
                <div>
                    <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                        Message for the Host (Optional)
                    </label>
                    <textarea
                        value={formData.message || ''}
                        onChange={(e) => updateForm({ message: e.target.value })}
                        placeholder="Send your wishes or a note to the host..."
                        rows={3}
                        className="
              w-full px-3 py-2 rounded-lg
              border border-gray-200 dark:border-gray-700
              bg-white dark:bg-gray-800
              text-gray-900 dark:text-gray-100
              placeholder:text-gray-400 dark:placeholder:text-gray-500
              focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20
              outline-none transition-colors
            "
                    />
                </div>

                {/* Turnstile CAPTCHA */}
                {isTurnstileRequired && turnstileConfig?.site_key && (
                    <div className="flex flex-col items-center gap-2">
                        <Turnstile
                            siteKey={turnstileConfig.site_key}
                            onVerify={turnstile.handleVerify}
                            onError={turnstile.handleError}
                            onExpire={turnstile.handleExpire}
                            theme="auto"
                            size="normal"
                        />
                        {turnstile.error && (
                            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                                {turnstile.error}
                            </p>
                        )}
                    </div>
                )}

                {/* Submit */}
                <AppButton
                    type="submit"
                    className="w-full min-h-[48px]"
                    disabled={!canSubmit}
                    style={{
                        background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
                    }}
                >
                    {isSubmitting ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Submitting...
                        </>
                    ) : (
                        'Submit RSVP'
                    )}
                </AppButton>
            </form>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Main PublicInvitationView Component
// ---------------------------------------------------------------------------

export interface PublicInvitationViewProps {
    invitation: PublicInvitation;
    slug: string;
    turnstileConfig?: TurnstileConfig;
    rsvpMutation: UseMutationResult<RSVPSubmitResponse, Error, SubmitRSVPRequest>;
    submitResult?: RSVPSubmitResponse;
    handleDownloadCalendar: () => void;
    theme: 'light' | 'dark';
    /** If true, certain interactions like RSVP might be disabled or mocked */
    isPreview?: boolean;
}

export const PublicInvitationView: React.FC<PublicInvitationViewProps> = ({
    invitation,
    slug,
    turnstileConfig,
    rsvpMutation,
    submitResult,
    handleDownloadCalendar,
    theme,
    isPreview,
}) => {
    // Derive isDark from theme prop for WCAG color calculations
    const isDark = theme === 'dark';

    // Extract colors with fallbacks
    const colors = {
        primary: (invitation.customization as Record<string, Record<string, string>>)?.colors?.primary || '#6366f1',
        secondary: (invitation.customization as Record<string, Record<string, string>>)?.colors?.secondary || '#8b5cf6',
        accent: (invitation.customization as Record<string, Record<string, string>>)?.colors?.accent || '#f59e0b',
        background: (invitation.customization as Record<string, Record<string, string>>)?.colors?.background || '#ffffff',
    };

    // Get WCAG-safe versions of colors for use in text
    const safeColors = {
        primary: getWCAGSafeColor(colors.primary, isDark, 4.5),
        primaryLarge: getWCAGSafeColor(colors.primary, isDark, 3), // For large text (18px+)
        accent: getWCAGSafeColor(colors.accent, isDark, 4.5),
    };

    const fonts = {
        heading: (invitation.customization as Record<string, Record<string, string>>)?.fonts?.heading || 'Playfair Display',
        body: (invitation.customization as Record<string, Record<string, string>>)?.fonts?.body || 'Inter',
    };

    const primaryLang = invitation.primary_language || 'en';
    const primaryFontClass = getFontClassForLanguage(primaryLang);
    const primaryDirection = getDirectionForLanguage(primaryLang);
    const isRTL = primaryDirection === 'rtl';

    useEffect(() => {
        preloadLanguageFonts(primaryLang);
        const customization = invitation.customization as Record<string, unknown>;
        const customFonts: Array<{ font_id: string; family: string; url: string; format?: string }> = [];
        if (customization?.customFonts && Array.isArray(customization.customFonts)) {
            customFonts.push(...(customization.customFonts as Array<{ font_id: string; family: string; url: string; format?: string }>));
        }
        loadInvitationFonts(fonts.heading, fonts.body, customFonts);
    }, [primaryLang, fonts.heading, fonts.body, invitation.customization]);

    const formattedDate = formatEventDate(
        invitation.event_datetime,
        invitation.event_timezone,
        primaryLang
    );
    const formattedTime = formatEventTime(
        invitation.event_datetime,
        invitation.event_timezone,
        primaryLang
    );

    const seoDescription = useMemo(() => {
        const parts = [];
        if (invitation.host_names.length > 0) {
            parts.push(`Hosted by ${invitation.host_names.join(' & ')}`);
        }
        parts.push(`${formattedDate} at ${formattedTime}`);
        if (invitation.venue?.name) {
            parts.push(`at ${invitation.venue.name}`);
        }
        if (invitation.description) {
            parts.push(invitation.description.slice(0, 100));
        }
        return parts.join('. ');
    }, [invitation, formattedDate, formattedTime]);

    const structuredData = useMemo(() => ({
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: invitation.title,
        description: invitation.description || `You're invited to ${invitation.title}`,
        startDate: invitation.event_datetime,
        endDate: invitation.event_end_datetime || invitation.event_datetime,
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: invitation.venue?.name ? {
            '@type': 'Place',
            name: invitation.venue.name,
            address: {
                '@type': 'PostalAddress',
                streetAddress: invitation.venue.address,
                addressLocality: invitation.venue.city,
                addressRegion: invitation.venue.state,
                addressCountry: invitation.venue.country,
            },
            ...(invitation.venue.latitude && invitation.venue.longitude && {
                geo: {
                    '@type': 'GeoCoordinates',
                    latitude: invitation.venue.latitude,
                    longitude: invitation.venue.longitude,
                },
            }),
        } : undefined,
        organizer: invitation.host_names.length > 0 ? {
            '@type': 'Person',
            name: invitation.host_names.join(' & '),
        } : undefined,
        image: invitation.cover_image_url,
    }), [invitation]);

    const endTime = invitation.event_end_datetime
        ? formatEventTime(invitation.event_end_datetime, invitation.event_timezone, primaryLang)
        : null;

    const venueAddress = [
        invitation.venue.address,
        invitation.venue.city,
        invitation.venue.state,
        invitation.venue.country,
    ]
        .filter(Boolean)
        .join(', ');

    return (
        <div
            data-theme={theme}
            className={`
        invitation-container inv-wrapper ${primaryFontClass} ${isRTL ? 'rtl-container' : ''}
        min-h-screen bg-gray-50 dark:bg-gray-900
        transition-colors duration-300
      `}
            data-lang={primaryLang}
            dir={primaryDirection}
        >
            {/* SEO */}
            {!isPreview && (
                <SEOHead
                    title={invitation.title}
                    description={seoDescription}
                    ogImage={invitation.og_image_url || invitation.cover_image_url || undefined}
                    ogType="website"
                    twitterCard="summary_large_image"
                    structuredData={structuredData}
                    keywords={[
                        invitation.event_type,
                        'invitation',
                        'event',
                        ...(invitation.host_names || []),
                        invitation.venue?.city || '',
                    ].filter(Boolean)}
                    canonicalUrl={`/i/${slug}`}
                />
            )}

            <InvitationRenderer
                invitation={invitation}
                mode={isPreview ? 'preview' : 'public'}
                theme={theme as 'light' | 'dark'}
                className="bg-transparent" // Let wrapper handle background or transparency
            >
                {/* RSVP Section - Passed as children */}
                {invitation.rsvp_enabled && (
                    <div className="mt-8 sm:mt-12">
                        <RSVPForm
                            invitation={invitation}
                            colors={colors}
                            onSubmit={isPreview ? () => { } : rsvpMutation.mutate}
                            isSubmitting={rsvpMutation.isPending}
                            submitResult={submitResult}
                            turnstileConfig={turnstileConfig}
                            isDark={isDark}
                        />
                    </div>
                )}

                {/* Add to Calendar */}
                <div className="mt-8 text-center pb-8">
                    <AppButton
                        variant="outline"
                        onClick={handleDownloadCalendar}
                        className="min-h-[44px]"
                    >
                        <Download className="w-4 h-4 mr-2" />
                        Add to Calendar
                    </AppButton>
                </div>
            </InvitationRenderer>
        </div>
    );
};
