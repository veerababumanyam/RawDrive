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
  Share2,
  Palette,
  Settings,
  Upload,
  Trash2,
} from 'lucide-react';

export interface GalleryActionBarProps {
  /** Callback for View as Client action */
  onViewAsClient?: () => void;
  /** Callback for Find People action */
  onFindPeople?: () => void;
  /** Callback for AI Tools Hub action (replaces AI Story + Smart Curate) */
  onAITools?: () => void;
  /** Whether AI Tools panel is open */
  aiToolsOpen?: boolean;
  /** Callback for Share action */
  onShare?: () => void;
  /** Callback for Design Studio action - navigate to gallery design customization */
  onDesignStudio?: () => void;
  /** Callback for Settings action */
  onSettings?: () => void;
  /** Callback for Upload action */
  onUpload?: () => void;
  /** Callback for Delete action */
  onDelete?: () => void;
  /** Whether upload panel is open */
  uploadOpen?: boolean;
  /** Additional class names */
  className?: string;
}

export const GalleryActionBar: React.FC<GalleryActionBarProps> = ({
  onViewAsClient,
  onFindPeople,
  onAITools,
  aiToolsOpen = false,
  onShare,
  onDesignStudio,
  onSettings,
  onUpload,
  onDelete,
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

          {/* AI Tools - Purple (AI) - Opens AI Tools Hub */}
          {onAITools && (
            <button
              onClick={onAITools}
              className={`btn-gallery-action min-h-[36px] sm:min-h-[38px] ${
                aiToolsOpen ? 'btn-action-primary' : 'btn-action-purple'
              }`}
              aria-label="AI Tools"
              aria-pressed={aiToolsOpen}
            >
              <Sparkles size={16} className="flex-shrink-0" />
              <span className="hidden sm:inline">AI Tools</span>
            </button>
          )}
        </div>

        {/* Spacer - pushes secondary actions to right on larger screens */}
        <div className="flex-1 hidden lg:block" />

        {/* Secondary Actions Group - Right */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* Share - Blue */}
          {onShare && (
            <button
              onClick={onShare}
              className="btn-gallery-action btn-action-blue min-h-[36px] sm:min-h-[38px]"
              aria-label="Share gallery"
              title="Create share links - Generate URLs to send to clients"
            >
              <Share2 size={16} className="flex-shrink-0" />
              <span className="hidden sm:inline">Share</span>
            </button>
          )}

          {/* CoverDesign - Green */}
          {onDesignStudio && (
            <button
              onClick={onDesignStudio}
              className="btn-gallery-action btn-action-green min-h-[36px] sm:min-h-[38px]"
              aria-label="Open Cover Design to customize this gallery's cover, theme, and typography"
              title="Customize gallery cover design, theme, and typography"
            >
              <Palette size={16} className="flex-shrink-0" />
              <span className="hidden sm:inline">CoverDesign</span>
              <span className="sm:hidden">Cover</span>
            </button>
          )}

          {/* Upload - Orange */}
          {onUpload && (
            <button
              onClick={onUpload}
              className={`btn-gallery-action min-h-[36px] sm:min-h-[38px] ${uploadOpen ? 'btn-action-primary' : 'btn-action-orange'}`}
              aria-label="Upload photos"
              aria-pressed={uploadOpen}
            >
              <Upload size={16} className="flex-shrink-0" />
              <span className="hidden sm:inline">Upload</span>
            </button>
          )}

          {/* Settings - iOS style with gradient color */}
          {onSettings && (
            <button
              onClick={onSettings}
              className="
                inline-flex items-center justify-center gap-1.5
                px-3 sm:px-4
                min-h-[36px] sm:min-h-[38px]
                rounded-full
                backdrop-blur-sm
                bg-gradient-to-r from-slate-500/20 to-slate-600/20 dark:from-slate-400/20 dark:to-slate-500/20
                border border-slate-400/30 dark:border-slate-500/30
                text-slate-700 dark:text-slate-200
                hover:from-slate-500/30 hover:to-slate-600/30 dark:hover:from-slate-400/30 dark:hover:to-slate-500/30
                hover:border-slate-500/50 dark:hover:border-slate-400/50
                hover:text-slate-900 dark:hover:text-slate-100
                hover:shadow-md hover:shadow-slate-500/20
                transition-all duration-200 ease-out
                font-medium text-sm
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/50 focus-visible:ring-offset-2
              "
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
