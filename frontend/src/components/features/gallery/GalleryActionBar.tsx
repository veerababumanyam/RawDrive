/**
 * GalleryActionBar Component
 * Modern action bar with color-coded buttons using centralized CSS classes
 * WCAG 2.1 AA compliant - accessible colors and focus states
 * Light/Dark mode support via CSS custom properties
 */

import React from 'react';
import {
  Eye,
  Users,
  Sparkles,
  Wand2,
  Share2,
  Settings,
  Upload,
  Trash2,
  Globe,
  EyeOff,
  ScanFace,
} from 'lucide-react';

export interface GalleryActionBarProps {
  /** Whether gallery is published */
  isPublished?: boolean;
  /** Whether gallery has photos (needed for publish validation) */
  hasPhotos?: boolean;
  /** Callback for View as Client action */
  onViewAsClient?: () => void;
  /** Callback for Find People action */
  /** Callback for Find People action */
  onFindPeople?: () => void;
  /** Callback for Scan Faces action */
  onScanFaces?: () => void;
  /** Callback for AI Story action */
  onAIStory?: () => void;
  /** Callback for Smart Curate action */
  onSmartCurate?: () => void;
  /** Callback for Share action */
  onShare?: () => void;
  /** Callback for Settings action */
  onSettings?: () => void;
  /** Callback for Upload action */
  onUpload?: () => void;
  /** Callback for Delete action */
  onDelete?: () => void;
  /** Callback for Publish/Unpublish action */
  onPublishToggle?: () => void;
  /** Whether publish action is loading */
  isPublishLoading?: boolean;
  /** Whether upload panel is open */
  uploadOpen?: boolean;
  /** Additional class names */
  className?: string;
}

export const GalleryActionBar: React.FC<GalleryActionBarProps> = ({
  isPublished = false,
  hasPhotos = true,
  onViewAsClient,
  onFindPeople,
  onScanFaces,
  onAIStory,
  onSmartCurate,
  onShare,
  onSettings,
  onUpload,
  onDelete,
  onPublishToggle,
  isPublishLoading = false,
  uploadOpen = false,
  className = '',
}) => {
  return (
    <div className={`gallery-action-bar ${className}`}>
      {/* Action buttons row - responsive flex wrap with mobile-first design */}
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 md:gap-2.5">
        {/* Primary Actions Group - Left */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* View as Client - Cyan */}
          {onViewAsClient && (
            <button
              onClick={onViewAsClient}
              className="btn-gallery-action btn-action-cyan min-h-[36px] sm:min-h-[38px]"
              aria-label="View as Client"
            >
              <Eye size={16} className="flex-shrink-0" />
              <span className="hidden sm:inline">View as Client</span>
            </button>
          )}

          {/* Find People - Purple (AI) */}
          {onFindPeople && (
            <button
              onClick={onFindPeople}
              className="btn-gallery-action btn-action-purple min-h-[36px] sm:min-h-[38px]"
              aria-label="Find People"
            >
              <Users size={16} className="flex-shrink-0" />
              <span className="hidden sm:inline">Find People</span>
            </button>
          )}

          {/* Scan Faces - Purple (AI) */}
          {onScanFaces && (
            <button
              onClick={onScanFaces}
              className="btn-gallery-action btn-action-purple min-h-[36px] sm:min-h-[38px]"
              aria-label="Scan Faces"
            >
              <ScanFace size={16} className="flex-shrink-0" />
              <span className="hidden sm:inline">Scan Faces</span>
            </button>
          )}

          {/* AI Story - Purple (AI) */}
          {onAIStory && (
            <button
              onClick={onAIStory}
              className="btn-gallery-action btn-action-purple min-h-[36px] sm:min-h-[38px]"
              aria-label="AI Story"
            >
              <Sparkles size={16} className="flex-shrink-0" />
              <span className="hidden sm:inline">AI Story</span>
            </button>
          )}

          {/* Smart Curate - Neutral */}
          {onSmartCurate && (
            <button
              onClick={onSmartCurate}
              className="btn-gallery-action btn-action-neutral min-h-[36px] sm:min-h-[38px]"
              aria-label="Smart Curate"
            >
              <Wand2 size={16} className="flex-shrink-0" />
              <span className="hidden md:inline">Smart Curate</span>
            </button>
          )}
        </div>

        {/* Spacer - pushes secondary actions to right on larger screens */}
        <div className="flex-1 hidden lg:block" />

        {/* Secondary Actions Group - Right */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* Publish/Unpublish - Green */}
          {onPublishToggle && (
            <button
              onClick={onPublishToggle}
              disabled={isPublishLoading || (!isPublished && !hasPhotos)}
              title={!hasPhotos && !isPublished ? 'Add at least one photo before publishing' : ''}
              className="btn-gallery-action btn-action-green min-h-[36px] sm:min-h-[38px]"
              aria-label={isPublished ? 'Unpublish gallery' : 'Publish gallery'}
            >
              {isPublished ? <EyeOff size={16} className="flex-shrink-0" /> : <Globe size={16} className="flex-shrink-0" />}
              <span className="hidden sm:inline">{isPublished ? 'Unpublish' : 'Publish'}</span>
            </button>
          )}

          {/* Share - Blue */}
          {onShare && (
            <button
              onClick={onShare}
              className="btn-gallery-action btn-action-blue min-h-[36px] sm:min-h-[38px]"
              aria-label="Share gallery"
            >
              <Share2 size={16} className="flex-shrink-0" />
              <span className="hidden sm:inline">Share</span>
            </button>
          )}

          {/* Upload - Primary when active, neutral otherwise */}
          {onUpload && (
            <button
              onClick={onUpload}
              className={`btn-gallery-action min-h-[36px] sm:min-h-[38px] ${uploadOpen ? 'btn-action-primary' : 'btn-action-neutral'}`}
              aria-label="Upload photos"
              aria-pressed={uploadOpen}
            >
              <Upload size={16} className="flex-shrink-0" />
              <span className="hidden sm:inline">Upload</span>
            </button>
          )}

          {/* Settings - Visible outline style */}
          {onSettings && (
            <button
              onClick={onSettings}
              className="btn-gallery-action btn-action-ghost min-h-[36px] sm:min-h-[38px]"
              aria-label="Settings"
            >
              <Settings size={16} className="flex-shrink-0" />
              <span className="hidden lg:inline">Settings</span>
            </button>
          )}

          {/* Delete - Red with white text for clear visibility */}
          {onDelete && (
            <button
              onClick={onDelete}
              className="btn-gallery-action btn-action-ghost-destructive min-h-[36px] sm:min-h-[38px]"
              aria-label="Delete gallery"
            >
              <Trash2 size={16} className="flex-shrink-0" />
              <span className="hidden lg:inline">Delete</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
