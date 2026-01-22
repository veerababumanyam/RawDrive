import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, MapPin, Download, QrCode, Share2, LucideIcon, Globe, Instagram, Facebook, Twitter, Linkedin, Youtube, Music, Image, Palette, Phone } from 'lucide-react';
import { ProfileTheme } from './ProfileThemeEngine';
import { AppButton } from '../../ui/AppButton';

interface ProfileHeroProps {
    theme: ProfileTheme;
    displayName: string;
    avatarUrl?: string;
    profileTitle?: string;
    location?: string;
    bio?: string;
    socials?: Record<string, string>;
    isVerified?: boolean;
    badges?: string[];
    brandColor?: string;
    onShare?: () => void;
    onDownloadVCard?: () => void;
    onDownloadQr?: () => void;
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

export const ProfileHero: React.FC<ProfileHeroProps> = ({
    theme,
    displayName,
    avatarUrl,
    profileTitle,
    location,
    bio,
    socials = {},
    isVerified,
    badges,
    brandColor = '#3B82F6',
    onShare,
    onDownloadVCard,
    onDownloadQr,
}) => {
    const visibleSocials = Object.entries(socials).filter(([, url]) => url);

    return (
        <div className="flex flex-col items-center text-center w-full max-w-lg mx-auto mb-8 relative z-10">
            {/* Avatar */}
            <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.4 }}
                className="relative mb-6"
            >
                {avatarUrl ? (
                    <img
                        src={avatarUrl}
                        alt={displayName}
                        className={`w-36 h-36 object-cover rounded-full shadow-2xl ring-4 ring-white/10`}
                    />
                ) : (
                    <div
                        className={`w-36 h-36 flex items-center justify-center text-5xl font-bold text-white rounded-full shadow-2xl ring-4 ring-white/10`}
                        style={{ backgroundColor: brandColor }}
                    >
                        {displayName.charAt(0).toUpperCase()}
                    </div>
                )}

                {/* Verification Badge */}
                {isVerified && (
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.4, type: 'spring' }}
                        className="absolute bottom-1 right-1 bg-blue-500 rounded-full p-1.5 shadow-lg border-2 border-zinc-900"
                    >
                        <CheckCircle className="w-5 h-5 text-white" />
                    </motion.div>
                )}
            </motion.div>

            {/* Name & Title */}
            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.4 }}
                className="space-y-1 mb-6"
            >
                <h1 className={`text-3xl font-bold text-white tracking-tight`}>
                    {displayName}
                </h1>

                {profileTitle && (
                    <p className={`text-xs font-bold tracking-[0.2em] uppercase text-zinc-500`}>
                        {profileTitle}
                    </p>
                )}

                {/* Location - Tiny and subtle */}
                {location && (
                    <div className="flex items-center justify-center gap-1.5 pt-2 text-zinc-500 text-xs font-medium">
                        <MapPin className="w-3 h-3" />
                        {location}
                    </div>
                )}
            </motion.div>

            {/* Bio */}
            {bio && (
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="text-sm text-zinc-400 mb-8 max-w-sm font-medium leading-relaxed"
                >
                    {bio}
                </motion.p>
            )}

            {/* Social Icons Row */}
            {visibleSocials.length > 0 && (
                <motion.div
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="flex flex-wrap justify-center gap-4 mb-8"
                >
                    {visibleSocials.map(([platform, url], index) => {
                        const Icon = SOCIAL_ICONS[platform] || Globe;
                        return (
                            <a
                                key={platform}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-12 h-12 flex items-center justify-center bg-white rounded-full text-black hover:scale-110 transition-transform duration-200"
                            >
                                <Icon className="w-6 h-6" />
                            </a>
                        );
                    })}
                </motion.div>
            )}

            {/* Action Buttons Row (Save, Scan, Share) */}
            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="grid grid-cols-3 gap-3 w-full max-w-sm mb-8"
            >
                <button
                    onClick={onDownloadVCard}
                    className="flex flex-col items-center justify-center gap-2 p-4 bg-transparent border border-zinc-800 rounded-2xl hover:bg-zinc-900 transition-colors group"
                >
                    <div className="text-blue-500 group-hover:scale-110 transition-transform">
                        <Download className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] font-bold text-blue-500 tracking-wider">SAVE</span>
                </button>

                <button
                    onClick={onDownloadQr}
                    className="flex flex-col items-center justify-center gap-2 p-4 bg-transparent border border-zinc-800 rounded-2xl hover:bg-zinc-900 transition-colors group"
                >
                    <div className="text-blue-500 group-hover:scale-110 transition-transform">
                        <QrCode className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] font-bold text-blue-500 tracking-wider">SCAN</span>
                </button>

                <button
                    onClick={onShare}
                    className="flex flex-col items-center justify-center gap-2 p-4 bg-transparent border border-zinc-800 rounded-2xl hover:bg-zinc-900 transition-colors group"
                >
                    <div className="text-blue-500 group-hover:scale-110 transition-transform">
                        <Share2 className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] font-bold text-blue-500 tracking-wider">SHARE</span>
                </button>
            </motion.div>

            {/* Divider */}
            <div className="w-full flex items-center justify-center gap-4 text-zinc-800 mb-8">
                <div className="h-px bg-zinc-900 w-24"></div>
                <span className="text-xs font-bold tracking-widest text-zinc-600">INVITE</span>
                <div className="h-px bg-zinc-900 w-24"></div>
            </div>

        </div>
    );
};
