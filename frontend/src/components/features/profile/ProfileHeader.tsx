import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, MapPin } from 'lucide-react';
import { ProfileTheme } from './ProfileThemeEngine';

interface ProfileHeaderProps {
    theme: ProfileTheme;
    displayName: string;
    avatarUrl?: string;
    profileTitle?: string;
    location?: string;
    isVerified?: boolean;
    badges?: string[];
    brandColor?: string;
}

export const ProfileHeader: React.FC<ProfileHeaderProps> = ({
    theme,
    displayName,
    avatarUrl,
    profileTitle,
    location,
    isVerified,
    badges,
    brandColor = '#3B82F6',
}) => {
    return (
        <div className="flex flex-col items-center text-center mb-8">
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
                        className={`w-32 h-32 md:w-40 md:h-40 object-cover ${theme.effects.radius} ${theme.effects.shadow} ring-4 ring-white/20`}
                    />
                ) : (
                    <div
                        className={`w-32 h-32 md:w-40 md:h-40 flex items-center justify-center text-5xl font-bold text-white ${theme.effects.radius} ${theme.effects.shadow} ring-4 ring-white/20`}
                        style={{ backgroundColor: brandColor }}
                    >
                        {displayName.charAt(0).toUpperCase()}
                    </div>
                )}

                {/* Verification Badge (Floating) */}
                {isVerified && (
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.4, type: 'spring' }}
                        className="absolute -bottom-2 -right-2 bg-white rounded-full p-1.5 shadow-lg"
                    >
                        <CheckCircle className="w-5 h-5 text-blue-500 fill-blue-50" />
                    </motion.div>
                )}
            </motion.div>

            {/* Name & Title */}
            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.4 }}
                className="space-y-2 max-w-lg"
            >
                <h1 className={`text-3xl md:text-4xl font-bold ${theme.colors.text} ${theme.typography.headingFont}`}>
                    {displayName}
                </h1>

                {profileTitle && (
                    <p className={`text-lg md:text-xl font-medium ${theme.colors.accent} ${theme.typography.bodyFont}`}>
                        {profileTitle}
                    </p>
                )}

                {/* Location & Badges */}
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    {location && (
                        <span className={`inline-flex items-center gap-1.5 text-sm ${theme.colors.textSecondary}`}>
                            <MapPin className="w-4 h-4 opacity-70" />
                            {location}
                        </span>
                    )}

                    {badges && badges.map((badge, index) => (
                        <span
                            key={index}
                            className={`px-2 py-0.5 text-xs font-medium rounded-full border ${theme.colors.border} ${theme.colors.surface} ${theme.colors.textSecondary}`}
                        >
                            {badge}
                        </span>
                    ))}
                </div>
            </motion.div>
        </div>
    );
};
