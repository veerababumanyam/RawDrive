/**
 * usePreviewData Hook
 * 
 * Converts InvitationPreviewProps to PublicInvitation format
 * for unified rendering in preview mode.
 * 
 * Feature: invitation-responsive-redesign
 */

import { useMemo } from 'react';
import type {
    PublicInvitation,
    VenueInfo,
    RSVPSettings,
    TaglineConfig,
    EventType
} from '@/types/invitations';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PreviewDataInput {
    title?: string;
    description?: string;
    eventType?: string;
    eventDatetime?: string;
    eventEndDatetime?: string;
    timezone?: string;
    venue?: Partial<VenueInfo>;
    hostNames?: string[];
    coverImageUrl?: string;
    videoUrl?: string;
    audioUrl?: string;
    mainCardUrl?: string;
    customization?: {
        colors?: Record<string, string>;
        fonts?: Record<string, string>;
        layout_config?: unknown;
        tagline?: TaglineConfig;
    };
    rsvpSettings?: RSVPSettings;
    primaryLanguage?: string;
}

// ---------------------------------------------------------------------------
// Default Preview Data
// ---------------------------------------------------------------------------

const DEFAULT_VENUE: VenueInfo = {
    name: 'The Grand Estate',
    address: '123 Vineyard Lane',
    city: 'Napa Valley',
    state: 'CA',
    country: 'USA',
    postal_code: '94558',
    latitude: undefined,
    longitude: undefined,
    map_url: undefined,
};

const DEFAULT_PREVIEW_DATA: PreviewDataInput = {
    title: "Sarah & Thomas's Wedding",
    description: "Together with their families, Sarah and Thomas invite you to join them as they celebrate their marriage. We can't wait to share this special day with you.",
    eventDatetime: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days from now
    eventType: 'wedding',
    venue: DEFAULT_VENUE,
    hostNames: ['Sarah Jenkins', 'Thomas Meyer'],
    timezone: 'America/New_York',
    customization: {
        colors: {
            primary: '#6366f1',
            secondary: '#8b5cf6',
            accent: '#f59e0b',
            background: '#ffffff',
        },
        fonts: {
            heading: 'Playfair Display',
            body: 'Inter',
        },
    },
    rsvpSettings: {
        enabled: true,
        max_party_size: 4,
        collect_dietary: true,
        collect_phone: false,
        custom_questions: [],
    },
};

// ---------------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------------

/**
 * Converts preview props to PublicInvitation structure for unified rendering.
 * Merges provided data with sensible defaults to ensure preview always looks good.
 */
export function usePreviewData(input: PreviewDataInput): PublicInvitation {
    return useMemo(() => {
        // Merge with defaults
        const title = input.title || DEFAULT_PREVIEW_DATA.title!;
        const description = input.description || DEFAULT_PREVIEW_DATA.description;
        const eventType = (input.eventType || DEFAULT_PREVIEW_DATA.eventType) as EventType;
        const eventDatetime = input.eventDatetime || DEFAULT_PREVIEW_DATA.eventDatetime!;
        const timezone = input.timezone || DEFAULT_PREVIEW_DATA.timezone || 'UTC';
        const hostNames = input.hostNames?.length ? input.hostNames : DEFAULT_PREVIEW_DATA.hostNames!;

        // Merge venue with defaults
        const venue: VenueInfo = {
            name: input.venue?.name || DEFAULT_VENUE.name,
            address: input.venue?.address || DEFAULT_VENUE.address,
            city: input.venue?.city || DEFAULT_VENUE.city,
            state: input.venue?.state || DEFAULT_VENUE.state,
            country: input.venue?.country || DEFAULT_VENUE.country,
            postal_code: input.venue?.postal_code || DEFAULT_VENUE.postal_code,
            latitude: input.venue?.latitude,
            longitude: input.venue?.longitude,
            map_url: input.venue?.map_url,
        };

        // Merge customization
        const colors = {
            ...DEFAULT_PREVIEW_DATA.customization?.colors,
            ...input.customization?.colors,
        };
        const fonts = {
            ...DEFAULT_PREVIEW_DATA.customization?.fonts,
            ...input.customization?.fonts,
        };

        return {
            // Required fields
            invitation_id: 'preview',
            title,
            event_type: eventType,
            event_datetime: eventDatetime,
            event_timezone: timezone,
            venue,
            host_names: hostNames,

            // Optional fields
            description,
            event_end_datetime: input.eventEndDatetime,
            cover_image_url: input.coverImageUrl,
            video_url: input.videoUrl,
            audio_url: input.audioUrl,
            og_image_url: undefined,

            // Customization
            customization: {
                colors,
                fonts,
                layout_config: input.customization?.layout_config || {},
                tagline: input.customization?.tagline,
            },

            // RSVP settings
            rsvp_enabled: input.rsvpSettings?.enabled ?? true,
            max_party_size: input.rsvpSettings?.max_party_size ?? 1,
            collect_dietary: input.rsvpSettings?.collect_dietary ?? false,
            collect_phone: input.rsvpSettings?.collect_phone ?? false,
            rsvp_deadline: undefined,
            custom_questions: input.rsvpSettings?.custom_questions || [],

            // Gallery
            gallery_images: [],

            // Language
            primary_language: input.primaryLanguage || 'en',
            content_i18n: {},
        } as PublicInvitation;
    }, [
        input.title,
        input.description,
        input.eventType,
        input.eventDatetime,
        input.eventEndDatetime,
        input.timezone,
        input.venue,
        input.hostNames,
        input.coverImageUrl,
        input.videoUrl,
        input.audioUrl,
        input.customization,
        input.rsvpSettings,
        input.primaryLanguage,
    ]);
}

// ---------------------------------------------------------------------------
// Default Export
// ---------------------------------------------------------------------------

export default usePreviewData;
