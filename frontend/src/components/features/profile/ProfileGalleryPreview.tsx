import React from 'react';
import { motion } from 'framer-motion';
import { ImageIcon, ArrowRight } from 'lucide-react';
import { ProfileTheme } from './ProfileThemeEngine';
import { FeaturedGalleryInfo } from '../../../types/personalProfile';

interface ProfileGalleryPreviewProps {
    theme: ProfileTheme;
    gallery: FeaturedGalleryInfo;
}

export const ProfileGalleryPreview: React.FC<ProfileGalleryPreviewProps> = ({ theme, gallery }) => {
    return (
        <motion.a
            href={`/gallery/${gallery.gallery_id}`} // Assuming this route exists
            target="_blank"
            rel="noopener noreferrer"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            whileHover={{ scale: 1.02 }}
            className={`
        block w-full overflow-hidden mb-8 group
        ${theme.effects.radius} ${theme.effects.shadow} border ${theme.colors.border}
        ${theme.colors.surface}
      `}
        >
            <div className="relative h-48 md:h-64 overflow-hidden">
                {gallery.cover_image_url ? (
                    <img
                        src={gallery.cover_image_url}
                        alt={gallery.name}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                ) : (
                    <div className={`w-full h-full flex items-center justify-center ${theme.colors.surface} bg-opacity-50`}>
                        <ImageIcon className={`w-12 h-12 ${theme.colors.textSecondary}`} />
                    </div>
                )}

                {/* Overlay Gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end p-6">
                    <p className="text-white/80 text-sm font-medium uppercase tracking-wider mb-1">Featured Gallery</p>
                    <div className="flex items-center justify-between">
                        <h3 className="text-white text-2xl font-bold">{gallery.name}</h3>
                        <span className="bg-white/20 backdrop-blur-md p-2 rounded-full text-white transform translate-x-4 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-300">
                            <ArrowRight className="w-5 h-5" />
                        </span>
                    </div>
                </div>
            </div>

            {/* Footer Info (if needed, currently overlay handles it nicely) */}
        </motion.a>
    );
};
