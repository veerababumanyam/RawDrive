/**
 * InvitationPreview: Real-time preview of the digital invitation
 *
 * Features:
 * - Mobile/desktop view toggle
 * - Device frames (iPhone / MacBook)
 * - Real preview via iframe (if slug available)
 * - Simulated preview fallback (using InvitationRenderer)
 * - PostMessage sync for live updates
 */

import React, { useState, useRef, useEffect } from 'react';
import { Smartphone, Monitor } from 'lucide-react';

import { InvitationRenderer } from '@/components/features/invitations/InvitationRenderer';
import { usePreviewData, type PreviewDataInput } from '@/hooks/usePreviewData';
import type { VenueInfo, RSVPSettings, LayoutConfig, TaglineConfig, PublicInvitation } from '@/types/invitations';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InvitationPreviewProps {
  /** Event title */
  title: string;
  /** Event description */
  description?: string;
  /** Legacy prop, might be used in simulation */
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
  /** Video URL */
  videoUrl?: string;
  /** Audio URL */
  audioUrl?: string;
  /** Main card image URL (for card-only/hybrid modes) */
  mainCardUrl?: string;
  /** Customization settings */
  customization: {
    colors?: Record<string, string>;
    fonts?: Record<string, string>;
    layout_config?: LayoutConfig;
    tagline?: TaglineConfig;
  };
  /** RSVP settings */
  rsvpSettings?: RSVPSettings;
  /** View mode (controlled) */
  viewMode?: 'mobile' | 'desktop';
  /** On view mode change */
  onViewModeChange?: (mode: 'mobile' | 'desktop') => void;
  /** Compact mode (for smaller containers) */
  compact?: boolean;
  /** Class name */
  className?: string;
  /** Invitation slug (if available, uses iframe) */
  invitationSlug?: string;
}

// ---------------------------------------------------------------------------
// Preview Content (Uses InvitationRenderer)
// ---------------------------------------------------------------------------

const PreviewContent: React.FC<InvitationPreviewProps> = (props) => {
  // Convert props to PreviewDataInput format
  const previewInput: PreviewDataInput = {
    title: props.title,
    description: props.description,
    eventType: props.eventType,
    eventDatetime: props.eventDatetime,
    eventEndDatetime: props.eventEndDatetime,
    timezone: props.timezone,
    venue: props.venue,
    hostNames: props.hostNames,
    coverImageUrl: props.coverImageUrl,
    videoUrl: props.videoUrl,
    audioUrl: props.audioUrl,
    mainCardUrl: props.mainCardUrl,
    customization: props.customization,
    rsvpSettings: props.rsvpSettings,
  };

  // Convert to PublicInvitation format using hook (handles defaults)
  const invitation = usePreviewData(previewInput);

  return (
    <InvitationRenderer
      invitation={invitation}
      mode="preview"
      theme="light"
      disableRSVP={true}
      className="h-full bg-white"
    />
  );
};

// ---------------------------------------------------------------------------
// Device Frame Components
// ---------------------------------------------------------------------------

const DeviceFrame: React.FC<{
  children: React.ReactNode;
  viewMode: 'mobile' | 'desktop';
  compact?: boolean;
}> = ({ children, viewMode, compact }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Calculate scale for desktop view
  useEffect(() => {
    if (viewMode !== 'desktop') {
      setScale(1);
      return;
    }

    const updateScale = () => {
      if (containerRef.current) {
        const parentWidth = containerRef.current.offsetWidth;
        // Target width for desktop simulation (e.g. 1024px for standard laptop view in compact preview)
        // Adjusted from 1280px to prevent excessive shrinking in small preview areas
        const targetWidth = compact ? 800 : 1024;

        // Don't scale up, only down
        const newScale = Math.min(parentWidth / targetWidth, 1);
        setScale(newScale);
      }
    };

    // Initial calculation
    updateScale();

    const observer = new ResizeObserver(updateScale);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [viewMode, compact]);

  if (viewMode === 'mobile') {
    return (
      <div
        className="relative mx-auto rounded-[3rem] border-[8px] border-gray-900 bg-gray-900 shadow-xl"
        style={{
          width: 'min(100%, 375px)', // Fluid width max 375px
          height: '100%',
          maxHeight: '800px',
          aspectRatio: '9/19.5'
        }}
      >
        {/* Notch */}
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-1/3 h-7 bg-black rounded-b-xl z-20 flex items-center justify-center">
          <div className="w-16 h-1 bg-gray-800 rounded-full opacity-30 mt-1"></div>
        </div>

        {/* Screen Content */}
        <div className="w-full h-full rounded-[2.2rem] overflow-hidden bg-white relative">
          {children}
        </div>

        {/* Side buttons (cosmetic) */}
        <div className="absolute top-24 -right-[10px] w-1 h-10 bg-gray-800 rounded-r-md"></div>
        <div className="absolute top-24 -left-[10px] w-1 h-7 bg-gray-800 rounded-l-md"></div>
        <div className="absolute top-36 -left-[10px] w-1 h-14 bg-gray-800 rounded-l-md"></div>
      </div>
    );
  }

  // Desktop (MacBook style) simulation
  const baseAspectRatio = 16 / 10;
  const targetWidth = compact ? 800 : 1024;

  return (
    <div
      ref={containerRef}
      className={`relative mx-auto ${compact ? 'w-full' : 'w-full'}`}
      style={{
        aspectRatio: `${baseAspectRatio}` // Keep aspect ratio for frame
      }}
    >
      <div
        className="origin-top-left absolute top-0 left-0 bg-gray-900 rounded-t-xl shadow-2xl overflow-hidden border-[12px] border-gray-900 border-b-0"
        style={{
          width: `${targetWidth}px`,
          height: `${targetWidth / baseAspectRatio}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left', // Scale from top left
        }}
      >
        {/* Camera Dot */}
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-20 h-4 bg-black rounded-b-lg z-20 flex items-center justify-center">
          <div className="w-1.5 h-1.5 rounded-full bg-gray-800/80"></div>
        </div>

        {/* Screen Content */}
        <div className="w-full h-full bg-white overflow-hidden relative">
          {children}
        </div>
      </div>

      {/* MacBook Bottom Base (visual only, scaled with container width effectively by being outside the transform) */}
      {/* Note: This part is tricky with scale. Better to just put it below the scaled container 
          but we need to know the scaled height. For simplicity, we'll omit the complex base 
          or just treat the screen as the main thing. 
          Let's verify if we need a base using the scale.
      */}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Exported Component
// ---------------------------------------------------------------------------

export const InvitationPreview: React.FC<InvitationPreviewProps> = (props) => {
  const {
    invitationSlug,
    viewMode = 'mobile',
    onViewModeChange,
    className = '',
  } = props;

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Sync data to iframe via postMessage
  useEffect(() => {
    if (!invitationSlug || !iframeRef.current) return;

    // Convert props to PublicInvitation structure (partial) for preview
    const previewPayload: Partial<PublicInvitation> = {
      title: props.title,
      description: props.description,
      event_type: props.eventType as any,
      event_datetime: props.eventDatetime,
      event_end_datetime: props.eventEndDatetime,
      event_timezone: props.timezone,
      venue: props.venue,
      host_names: props.hostNames,
      cover_image_url: props.coverImageUrl,
      rsvp_enabled: props.rsvpSettings?.enabled ?? false,
      max_party_size: props.rsvpSettings?.max_party_size ?? 1,
      collect_dietary: props.rsvpSettings?.collect_dietary ?? false,
      collect_phone: props.rsvpSettings?.collect_phone ?? false,
      custom_questions: props.rsvpSettings?.custom_questions ?? [],
      customization: props.customization as any,
      video_url: props.videoUrl,
      audio_url: props.audioUrl,
      gallery_images: [],
      primary_language: 'en',
    };

    const sendMessage = () => {
      iframeRef.current?.contentWindow?.postMessage({
        type: 'PREVIEW_UPDATE',
        invitation: previewPayload,
      }, '*');
    };

    // Send immediately and on load
    sendMessage();
    iframeRef.current.addEventListener('load', sendMessage);
    return () => iframeRef.current?.removeEventListener('load', sendMessage);
  }, [props, invitationSlug]);

  return (
    <div className={`flex flex-col items-center gap-6 ${className}`}>
      {/* View Mode Toggle */}
      {onViewModeChange && (
        <div className="flex justify-center gap-2 bg-white/50 dark:bg-gray-800/50 p-1.5 rounded-xl backdrop-blur-sm border border-gray-200 dark:border-gray-700 shadow-sm">
          <button
            type="button"
            onClick={() => onViewModeChange('mobile')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === 'mobile'
              ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-300 shadow-sm'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            aria-pressed={viewMode === 'mobile'}
          >
            <Smartphone className="w-4 h-4" />
            <span className="hidden sm:inline">Mobile</span>
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('desktop')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === 'desktop'
              ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-300 shadow-sm'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            aria-pressed={viewMode === 'desktop'}
          >
            <Monitor className="w-4 h-4" />
            <span className="hidden sm:inline">Desktop</span>
          </button>
        </div>
      )}

      {/* Device Frame */}
      <DeviceFrame viewMode={viewMode} compact={props.compact}>
        {invitationSlug ? (
          <iframe
            ref={iframeRef}
            src={`/i/${invitationSlug}?preview=true`}
            className="w-full h-full border-0 bg-white"
            title="Invitation Preview"
            allow="autoplay; encrypted-media"
          />
        ) : (
          <PreviewContent {...props} />
        )}
      </DeviceFrame>

      {/* Hint */}
      {!invitationSlug && (
        <p className="text-xs text-center text-gray-500 max-w-xs mx-auto">
          This is a simulated preview. Save a draft to see the real invitation.
        </p>
      )}
    </div>
  );
};

export default InvitationPreview;
