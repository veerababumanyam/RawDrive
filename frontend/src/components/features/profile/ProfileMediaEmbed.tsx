import React from 'react';
import { motion } from 'framer-motion';
import { ProfileTheme } from './ProfileThemeEngine';
import { EmbeddedTikTok } from './EmbeddedTikTok';
import { EmbeddedSpotify } from './EmbeddedSpotify';

interface ProfileMediaEmbedProps {
    theme: ProfileTheme;
    media: {
        tiktok_username?: string;
        spotify_playlist_id?: string;
    };
}

export const ProfileMediaEmbed: React.FC<ProfileMediaEmbedProps> = ({ theme, media }) => {
    if (!media.tiktok_username && !media.spotify_playlist_id) return null;

    return (
        <div className="space-y-6 mb-8 w-full">
            {media.tiktok_username && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className={`overflow-hidden ${theme.effects.radius} ${theme.effects.shadow} border ${theme.colors.border}`}
                >
                    <EmbeddedTikTok username={media.tiktok_username} />
                </motion.div>
            )}

            {media.spotify_playlist_id && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                    className={`overflow-hidden ${theme.effects.radius} ${theme.effects.shadow} border ${theme.colors.border}`}
                >
                    <EmbeddedSpotify playlistId={media.spotify_playlist_id} />
                </motion.div>
            )}
        </div>
    );
};
