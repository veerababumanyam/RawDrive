/**
 * GalleryActionBar Component
 * Unified action bar with organized button groups
 * Color-coded buttons based on functionality
 */

import React from 'react';
import {
    Eye,
    Users,
    Sparkles,
    Share2,
    Settings,
    Upload,
    Trash2,
    Globe,
    EyeOff,
} from 'lucide-react';
import { AppButton } from '../../ui/AppButton';

export interface GalleryActionBarProps {
    /** Whether gallery is published */
    isPublished?: boolean;
    /** Whether gallery has photos (needed for publish validation) */
    hasPhotos?: boolean;
    /** Callback for View as Client action */
    onViewAsClient?: () => void;
    /** Callback for Find People action */
    onFindPeople?: () => void;
    /** Callback for AI Story action */
    onAIStory?: () => void;
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
    onAIStory,
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
        <div
            className={`
        gallery-action-bar
        bg-surface/80 backdrop-blur-sm
        border border-border rounded-xl
        p-3 sm:p-4
        ${className}
      `}
        >
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                {/* Primary Action Group - Left aligned */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* View as Client - Outline style */}
                    {onViewAsClient && (
                        <AppButton
                            variant="outline"
                            size="sm"
                            leftIcon={<Eye size={16} />}
                            onClick={onViewAsClient}
                            className="gallery-btn-view"
                        >
                            <span className="hidden sm:inline">View as Client</span>
                            <span className="sm:hidden">View</span>
                        </AppButton>
                    )}

                    {/* Find People - AI/Smart action (purple tint) */}
                    {onFindPeople && (
                        <AppButton
                            variant="outline"
                            size="sm"
                            leftIcon={<Users size={16} />}
                            onClick={onFindPeople}
                            className="gallery-btn-ai hover:border-purple-400 hover:text-purple-600 dark:hover:text-purple-400"
                        >
                            <span className="hidden sm:inline">Find People</span>
                            <span className="sm:hidden">People</span>
                        </AppButton>
                    )}

                    {/* AI Story - AI/Smart action (purple gradient) */}
                    {onAIStory && (
                        <AppButton
                            variant="outline"
                            size="sm"
                            leftIcon={<Sparkles size={16} />}
                            onClick={onAIStory}
                            className="gallery-btn-ai hover:border-purple-400 hover:text-purple-600 dark:hover:text-purple-400"
                        >
                            <span className="hidden sm:inline">AI Story</span>
                            <span className="sm:hidden">AI</span>
                        </AppButton>
                    )}
                </div>

                {/* Spacer */}
                <div className="flex-1 hidden lg:block" />

                {/* Secondary Action Group - Right aligned */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* Publish/Unpublish Button */}
                    {onPublishToggle && (
                        <AppButton
                            variant={isPublished ? 'outline' : 'primary'}
                            size="sm"
                            leftIcon={isPublished ? <EyeOff size={16} /> : <Globe size={16} />}
                            onClick={onPublishToggle}
                            disabled={isPublishLoading || (!isPublished && !hasPhotos)}
                            title={!hasPhotos && !isPublished ? 'Add at least one photo before publishing' : ''}
                            className={isPublished ? 'gallery-btn-unpublish' : ''}
                        >
                            {isPublished ? 'Unpublish' : 'Publish'}
                        </AppButton>
                    )}

                    {/* Share - Cyan/Teal color */}
                    {onShare && (
                        <AppButton
                            variant="outline"
                            size="sm"
                            leftIcon={<Share2 size={16} />}
                            onClick={onShare}
                            className="gallery-btn-share hover:border-cyan-400 hover:text-cyan-600 dark:hover:text-cyan-400"
                        >
                            Share
                        </AppButton>
                    )}

                    {/* Upload - Primary action */}
                    {onUpload && (
                        <AppButton
                            variant={uploadOpen ? 'primary' : 'outline'}
                            size="sm"
                            leftIcon={<Upload size={16} />}
                            onClick={onUpload}
                            className="gallery-btn-upload"
                        >
                            Upload
                        </AppButton>
                    )}

                    {/* Settings - Icon only on mobile, with text on desktop */}
                    {onSettings && (
                        <AppButton
                            variant="ghost"
                            size="sm"
                            leftIcon={<Settings size={16} />}
                            onClick={onSettings}
                            className="gallery-btn-settings"
                            aria-label="Settings"
                        >
                            <span className="hidden md:inline">Settings</span>
                        </AppButton>
                    )}

                    {/* Delete - Destructive */}
                    {onDelete && (
                        <AppButton
                            variant="ghost"
                            size="sm"
                            leftIcon={<Trash2 size={16} />}
                            onClick={onDelete}
                            className="gallery-btn-delete text-text-tertiary hover:text-error hover:bg-error/10"
                            aria-label="Delete gallery"
                        >
                            <span className="hidden md:inline">Delete</span>
                        </AppButton>
                    )}
                </div>
            </div>
        </div>
    );
};
