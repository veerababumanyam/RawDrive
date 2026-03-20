import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ProfileTheme } from './ProfileThemeEngine';
import {
    Instagram, Facebook, Twitter, Linkedin, Youtube,
    Music, Image, Palette, Phone, Globe, AtSign, Cloud, LucideIcon
} from 'lucide-react';

interface ProfileSocialsProps {
    theme: ProfileTheme;
    socials: Record<string, string>;
}

// Map platform strings to Lucide icons
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
    threads: AtSign,
    bluesky: Cloud,
};

// Platform-specific brand colors for hover state
const SOCIAL_COLORS: Record<string, string> = {
    instagram: '#E4405F',
    facebook: '#1877F2',
    twitter: '#1DA1F2',
    linkedin: '#0A66C2',
    youtube: '#FF0000',
    tiktok: '#000000',
    pinterest: '#E60023',
    threads: '#000000',
    bluesky: '#0085FF',
    spotify: '#1DB954',
    whatsapp: '#25D366',
};

interface SocialIconButtonProps {
    platform: string;
    url: string;
    index: number;
    theme: ProfileTheme;
}

const SocialIconButton: React.FC<SocialIconButtonProps> = ({ platform, url, index, theme }) => {
    const [isHovered, setIsHovered] = useState(false);
    const Icon = SOCIAL_ICONS[platform] || Globe;
    const brandColor = SOCIAL_COLORS[platform];

    return (
        <motion.a
            key={platform}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.4 + (index * 0.05), type: 'spring' }}
            whileHover={{ scale: 1.15, rotate: 5 }}
            whileTap={{ scale: 0.9 }}
            className={`
                p-3.5
                ${!isHovered ? `${theme.colors.surface} ${theme.colors.text}` : ''}
                border ${theme.colors.border}
                ${theme.effects.radius} ${theme.effects.shadow}
                ${theme.effects.glassmorphism ? theme.effects.blur : ''}
                transition-colors duration-200
            `}
            style={isHovered && brandColor ? {
                backgroundColor: brandColor,
                color: '#FFFFFF',
                borderColor: brandColor,
            } : undefined}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            title={platform}
        >
            <Icon className="w-5 h-5" />
        </motion.a>
    );
};

export const ProfileSocials: React.FC<ProfileSocialsProps> = ({ theme, socials }) => {
    const visibleSocials = Object.entries(socials).filter(([, url]) => url);

    if (visibleSocials.length === 0) return null;

    return (
        <div className="flex flex-wrap justify-center gap-3 mb-8">
            {visibleSocials.map(([platform, url], index) => (
                <SocialIconButton
                    key={platform}
                    platform={platform}
                    url={url}
                    index={index}
                    theme={theme}
                />
            ))}
        </div>
    );
};
