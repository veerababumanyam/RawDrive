/**
 * PhotoSectionHeader Component
 * Section headers for organizing photos into groups
 * Used for "FAVORITES" and "OTHER PHOTOS" sections
 */

import React from 'react';
import { Heart, Image, Lock, Star, Camera } from 'lucide-react';

export type SectionType = 'favorites' | 'other' | 'picks' | 'private' | 'all';

export interface PhotoSectionHeaderProps {
    /** Type of section */
    type: SectionType;
    /** Optional custom title */
    title?: string;
    /** Number of items in section */
    count?: number;
    /** Whether to show count */
    showCount?: boolean;
    /** Additional class names */
    className?: string;
}

const sectionConfig: Record<SectionType, { icon: React.ReactNode; label: string; iconColor: string }> = {
    favorites: {
        icon: <Heart size={16} className="fill-current" />,
        label: 'Favorites',
        iconColor: 'text-pink-500',
    },
    other: {
        icon: <Image size={16} />,
        label: 'Other Photos',
        iconColor: 'text-text-tertiary',
    },
    picks: {
        icon: <Star size={16} className="fill-current" />,
        label: 'Picks',
        iconColor: 'text-amber-500',
    },
    private: {
        icon: <Lock size={16} />,
        label: 'Private',
        iconColor: 'text-text-tertiary',
    },
    all: {
        icon: <Camera size={16} />,
        label: 'All Photos',
        iconColor: 'text-primary',
    },
};

export const PhotoSectionHeader: React.FC<PhotoSectionHeaderProps> = ({
    type,
    title,
    count,
    showCount = true,
    className = '',
}) => {
    const config = sectionConfig[type];
    const displayTitle = title || config.label;

    return (
        <div
            className={`
        photo-section-header
        flex items-center gap-2.5
        py-2
        ${className}
      `}
        >
            {/* Icon with colored background */}
            <div className={`flex items-center justify-center ${config.iconColor}`}>
                {config.icon}
            </div>

            {/* Section Title */}
            <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
                {displayTitle}
            </h3>

            {/* Item Count */}
            {showCount && count !== undefined && count > 0 && (
                <span className="text-xs font-medium text-text-tertiary">
                    ({count})
                </span>
            )}
        </div>
    );
};
