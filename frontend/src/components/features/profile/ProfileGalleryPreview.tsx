import React from 'react';
import { motion } from 'framer-motion';
import { ImageIcon, ArrowRight } from 'lucide-react';
import { ProfileTheme } from './ProfileThemeEngine';
import { FeaturedGalleryInfo } from '../../../types/personalProfile';

interface ProfileGalleryPreviewProps {
    theme: ProfileTheme;
    galleries: FeaturedGalleryInfo[];
}

export const ProfileGalleryPreview: React.FC<ProfileGalleryPreviewProps> = ({ theme, galleries }) => {
    const displayGalleries = galleries.slice(0, 4);

    if (displayGalleries.length === 0) return null;

    // Use the first gallery for the "View Gallery" link
    const primaryGallery = displayGalleries[0];

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className={`w-full overflow-hidden mb-8 ${theme.effects.radius} ${theme.effects.shadow} border ${theme.colors.border} ${theme.colors.surface}`}
        >
            {/* 2x2 Grid of gallery covers */}
            <div className="grid grid-cols-2 gap-2 p-2">
                {displayGalleries.map((gallery, index) => (
                    <motion.div
                        key={gallery.gallery_id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.6 + index * 0.1, duration: 0.3 }}
                        className={`relative aspect-square overflow-hidden ${theme.effects.radius}`}
                    >
                        {gallery.cover_image_url ? (
                            <img
                                src={gallery.cover_image_url}
                                alt={gallery.name}
                                className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                                loading="lazy"
                            />
                        ) : (
                            <div className={`w-full h-full flex items-center justify-center ${theme.colors.surface} bg-opacity-50`}>
                                <ImageIcon className={`w-8 h-8 ${theme.colors.textSecondary}`} />
                            </div>
                        )}
                    </motion.div>
                ))}
            </div>

            {/* View Gallery link */}
            <a
                href={`/gallery/${primaryGallery.gallery_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center justify-center gap-2 py-3 px-4 ${theme.colors.textSecondary} hover:${theme.colors.text} transition-colors text-sm font-medium`}
            >
                <span>View Gallery</span>
                <ArrowRight className="w-4 h-4" />
            </a>
        </motion.div>
    );
};
