import React from 'react';
import { motion } from 'framer-motion';
import { ProfileTheme } from './ProfileThemeEngine';
import {
    Instagram, Facebook, Twitter, Linkedin, Youtube,
    Music, Image, Palette, Phone, Globe, LucideIcon
} from 'lucide-react';

interface ProfileSocialsProps {
    theme: ProfileTheme;
    socials: Record<string, string>;
}

// Map strings to Lucide icons
const SOCIAL_ICONS: Record<string, LucideIcon> = {
    instagram: Instagram,
    facebook: Facebook,
    twitter: Twitter,
    linkedin: Linkedin,
    youtube: Youtube,
    tiktok: Music,
    pinterest: Image,
    behance: Palette,
    dribbble: Palette,
    spotify: Music,
    whatsapp: Phone,
};

export const ProfileSocials: React.FC<ProfileSocialsProps> = ({ theme, socials }) => {
    const visibleSocials = Object.entries(socials).filter(([, url]) => url);

    if (visibleSocials.length === 0) return null;

    return (
        <div className="flex flex-wrap justify-center gap-3 mb-8">
            {visibleSocials.map(([platform, url], index) => {
                const Icon = SOCIAL_ICONS[platform] || Globe;

                return (
                    <motion.a
                        key={platform}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.4 + (index * 0.05), type: 'spring' }}
                        whileHover={{ scale: 1.1, rotate: 5 }}
                        whileTap={{ scale: 0.9 }}
                        className={`
              p-3.5 
              ${theme.colors.surface} ${theme.colors.text}
              border ${theme.colors.border}
              ${theme.effects.radius} ${theme.effects.shadow}
              ${theme.effects.glassmorphism ? theme.effects.blur : ''}
              hover:bg-opacity-80 transition-colors
            `}
                        title={platform}
                    >
                        <Icon className="w-5 h-5" />
                    </motion.a>
                );
            })}
        </div>
    );
};
