import React, { useRef, useState, useEffect } from 'react';
import { m } from 'framer-motion';
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

/**
 * Hook that uses IntersectionObserver to detect when an element enters the viewport.
 * Once visible, it stays visible (no re-hiding) to avoid re-mounting embeds.
 */
function useInView(rootMargin = '200px'): [React.RefObject<HTMLDivElement | null>, boolean] {
    const ref = useRef<HTMLDivElement | null>(null);
    const [inView, setInView] = useState(false);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setInView(true);
                    observer.disconnect();
                }
            },
            { rootMargin },
        );

        observer.observe(element);
        return () => observer.disconnect();
    }, [rootMargin]);

    return [ref, inView];
}

const LazyTikTok: React.FC<{ username: string; theme: ProfileTheme }> = ({ username, theme }) => {
    const [ref, inView] = useInView();

    return (
        <m.div
            ref={ref}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className={`overflow-hidden ${theme.effects.radius} ${theme.effects.shadow} border ${theme.colors.border}`}
        >
            {inView ? (
                <EmbeddedTikTok username={username} />
            ) : (
                <div className={`h-[400px] flex items-center justify-center ${theme.colors.surface}`}>
                    <span className={`text-sm ${theme.colors.textSecondary}`}>Loading TikTok...</span>
                </div>
            )}
        </m.div>
    );
};

const LazySpotify: React.FC<{ playlistId: string; theme: ProfileTheme }> = ({ playlistId, theme }) => {
    const [ref, inView] = useInView();

    return (
        <m.div
            ref={ref}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className={`overflow-hidden ${theme.effects.radius} ${theme.effects.shadow} border ${theme.colors.border}`}
        >
            {inView ? (
                <EmbeddedSpotify playlistId={playlistId} />
            ) : (
                <div className={`h-[352px] flex items-center justify-center ${theme.colors.surface}`}>
                    <span className={`text-sm ${theme.colors.textSecondary}`}>Loading Spotify...</span>
                </div>
            )}
        </m.div>
    );
};

export const ProfileMediaEmbed: React.FC<ProfileMediaEmbedProps> = ({ theme, media }) => {
    if (!media.tiktok_username && !media.spotify_playlist_id) return null;

    return (
        <div className="space-y-6 mb-8 w-full">
            {media.tiktok_username && (
                <LazyTikTok username={media.tiktok_username} theme={theme} />
            )}

            {media.spotify_playlist_id && (
                <LazySpotify playlistId={media.spotify_playlist_id} theme={theme} />
            )}
        </div>
    );
};
