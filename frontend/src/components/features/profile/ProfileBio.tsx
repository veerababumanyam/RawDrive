import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ProfileTheme } from './ProfileThemeEngine';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface ProfileBioProps {
    theme: ProfileTheme;
    bio: string;
}

export const ProfileBio: React.FC<ProfileBioProps> = ({ theme, bio }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const maxLength = 150;
    const shouldTruncate = bio.length > maxLength;

    const displayBio = isExpanded || !shouldTruncate ? bio : `${bio.slice(0, maxLength)}...`;

    return (
        <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className={`relative px-6 py-4 mb-8 text-center mx-auto max-w-2xl ${theme.colors.textSecondary} ${theme.typography.bodyFont}`}
        >
            <p className="text-base md:text-lg leading-relaxed whitespace-pre-line">
                {displayBio}
            </p>

            {shouldTruncate && (
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className={`mt-2 flex items-center justify-center gap-1 mx-auto text-sm font-medium ${theme.colors.accent} hover:opacity-80 transition-opacity`}
                >
                    {isExpanded ? (
                        <>
                            Show Less <ChevronUp className="w-4 h-4" />
                        </>
                    ) : (
                        <>
                            Read More <ChevronDown className="w-4 h-4" />
                        </>
                    )}
                </button>
            )}
        </motion.div>
    );
};
