/**
 * GalleryActionBar Component
 * iOS-quality liquid glassmorphic action bar with tier-based button hierarchy
 * Premium glass effects with spring animations and 50-80px blur
 * WCAG 2.1 AA compliant - accessible colors and focus states
 * Full light/dark mode parity with Apple-tier visual quality
 *
 * Button Hierarchy:
 * - Tier 1 (Upload): Solid vibrant orange with glow - always visible text
 * - Tier 2 (Share, Delete): Glass with semantic colors - medium priority
 * - Tier 3 (Settings): Subtle neutral glass - configuration
 * - Tier 4 (Preview, FaceID, AI, Culling, Cover, XMP): Compact contextual glass
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
  FileText,
  FileInput,
  Scissors,
} from 'lucide-react';
import { ActionBarTooltip } from '@/components/ui/ActionBarTooltip';

export interface GalleryActionBarProps {
  /** Callback for View as Client action */
  onViewAsClient?: () => void;
  /** Callback for Find People action */
  onFindPeople?: () => void;
  /** Callback for AI Tools Hub action (replaces AI Story + Smart Curate) */
  onAITools?: () => void;
  /** Whether AI Tools panel is open */
  aiToolsOpen?: boolean;
  /** Callback for Culling Workflow action */
  onCulling?: () => void;
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
  /** Callback for XMP Export action */
  onXmpExport?: () => void;
  /** Callback for XMP Import action */
  onXmpImport?: () => void;
  /** Additional class names */
  className?: string;
}

export const GalleryActionBar: React.FC<GalleryActionBarProps> = ({
  onViewAsClient,
  onFindPeople,
  onAITools,
  aiToolsOpen = false,
  onCulling,
  onShare,
  onDesignStudio,
  onSettings,
  onUpload,
  onDelete,
  uploadOpen = false,
  onXmpExport,
  onXmpImport,
  className = '',
}) => {
  return (
    <div className={`gallery-action-bar ${className}`}>
      {/* Action buttons row - responsive flex wrap with mobile-first design */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 md:gap-4">
        {/* Contextual Actions Group - TIER 4 (Compact glass, icon-first) */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          {/* Preview - TIER 4 CONTEXTUAL */}
          {onViewAsClient && (
            <ActionBarTooltip content="View gallery as your clients see it - test magic links, permissions, and viewing experience">
              <button
                onClick={onViewAsClient}
                className="btn-ios btn-ios-contextual"
                aria-label="Preview gallery as client"
              >
                <Eye size={16} className="flex-shrink-0" />
                <span className="hidden sm:inline">Preview</span>
              </button>
            </ActionBarTooltip>
          )}

          {/* FaceID - TIER 4 CONTEXTUAL */}
          {onFindPeople && (
            <ActionBarTooltip content="Search and organize photos by facial recognition - automatically group photos by person">
              <button
                onClick={onFindPeople}
                className="btn-ios btn-ios-contextual"
                aria-label="Find people with facial recognition"
              >
                <Users size={16} className="flex-shrink-0" />
                <span className="hidden sm:inline">FaceID</span>
              </button>
            </ActionBarTooltip>
          )}

          {/* AI Tools - TIER 4 CONTEXTUAL (highlighted when open) */}
          {onAITools && (
            <ActionBarTooltip content="Access AI-powered features: Smart Curate, AI Story, Quality Check, and more">
              <button
                onClick={onAITools}
                className={`btn-ios ${aiToolsOpen ? 'btn-ios-contextual ring-2 ring-purple-400/50 ring-offset-2' : 'btn-ios-contextual'}`}
                aria-label="AI Tools"
                aria-pressed={aiToolsOpen}
              >
                <Sparkles size={16} className="flex-shrink-0" />
                <span className="hidden sm:inline">AI Tools</span>
              </button>
            </ActionBarTooltip>
          )}

          {/* Culling - TIER 4 CONTEXTUAL */}
          {onCulling && (
            <ActionBarTooltip content="Bulk photo culling workflow - select best shots, auto-reject low quality, preview final gallery">
              <button
                onClick={onCulling}
                className="btn-ios btn-ios-contextual"
                aria-label="Culling workflow"
              >
                <Scissors size={16} className="flex-shrink-0" />
                <span className="hidden sm:inline">Culling</span>
              </button>
            </ActionBarTooltip>
          )}
        </div>

        {/* Spacer - pushes secondary actions to right on larger screens */}
        <div className="flex-1 hidden lg:block" />

        {/* Secondary Actions Group - Right */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          {/* Share - TIER 2 HIGH PRIORITY (Emerald glass with tint) */}
          {onShare && (
            <ActionBarTooltip content="Create share links with custom permissions - send to clients via email, SMS, or social media">
              <button
                onClick={onShare}
                className="btn-ios btn-ios-share"
                aria-label="Share gallery"
              >
                <Share2 size={16} className="flex-shrink-0" />
                <span className="hidden sm:inline">Share</span>
              </button>
            </ActionBarTooltip>
          )}

          {/* Cover/Design Studio - TIER 4 CONTEXTUAL */}
          {onDesignStudio && (
            <ActionBarTooltip content="Customize gallery cover, theme, typography, and visual identity">
              <button
                onClick={onDesignStudio}
                className="btn-ios btn-ios-contextual"
                aria-label="Customize gallery cover design"
              >
                <Palette size={16} className="flex-shrink-0" />
                <span className="hidden sm:inline">Cover</span>
              </button>
            </ActionBarTooltip>
          )}

          {/* Upload - TIER 1 PRIMARY (Orange glass with glow) */}
          {onUpload && (
            <ActionBarTooltip content="Add photos and videos to this gallery - supports bulk upload and drag-and-drop">
              <button
                onClick={onUpload}
                className={`btn-ios btn-ios-primary ${uploadOpen ? 'ring-2 ring-orange-400/50 ring-offset-2' : ''}`}
                aria-label="Upload photos"
                aria-pressed={uploadOpen}
              >
                <Upload size={18} className="flex-shrink-0" />
                <span>Upload</span>
              </button>
            </ActionBarTooltip>
          )}

          {/* XMP Export - TIER 4 CONTEXTUAL */}
          {onXmpExport && (
            <ActionBarTooltip content="Export XMP sidecar files for Lightroom/Adobe compatibility - sync ratings, flags, and labels">
              <button
                onClick={onXmpExport}
                className="btn-ios btn-ios-contextual"
                aria-label="Export XMP files"
              >
                <FileText size={16} className="flex-shrink-0" />
                <span className="hidden sm:inline">Export</span>
              </button>
            </ActionBarTooltip>
          )}

          {/* XMP Import - TIER 4 CONTEXTUAL */}
          {onXmpImport && (
            <ActionBarTooltip content="Import XMP sidecar files from Lightroom/Adobe - apply ratings, flags, and labels from external edits">
              <button
                onClick={onXmpImport}
                className="btn-ios btn-ios-contextual"
                aria-label="Import XMP files"
              >
                <FileInput size={16} className="flex-shrink-0" />
                <span className="hidden sm:inline">Import</span>
              </button>
            </ActionBarTooltip>
          )}

          {/* Settings - TIER 3 CONFIGURATION (Neutral glass) */}
          {onSettings && (
            <ActionBarTooltip content="Configure gallery settings: visibility, download permissions, watermarks, expiration, and privacy">
              <button
                onClick={onSettings}
                className="btn-ios btn-ios-settings"
                aria-label="Settings"
              >
                <Settings size={16} className="flex-shrink-0" />
                <span className="hidden lg:inline">Settings</span>
              </button>
            </ActionBarTooltip>
          )}

          {/* Delete - TIER 2 HIGH PRIORITY (Red glass outline → fill on hover) */}
          {onDelete && (
            <ActionBarTooltip content="Permanently delete this gallery and all its contents - this action cannot be undone">
              <button
                onClick={onDelete}
                className="btn-ios btn-ios-delete"
                aria-label="Delete gallery"
              >
                <Trash2 size={16} className="flex-shrink-0" />
                <span className="hidden lg:inline">Delete</span>
              </button>
            </ActionBarTooltip>
          )}
        </div>
      </div>
    </div>
  );
};
