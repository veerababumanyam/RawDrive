import React from 'react';
import { motion } from 'framer-motion';
import { ProfileTheme } from './ProfileThemeEngine';

interface ProfileContainerProps {
    theme: ProfileTheme;
    children: React.ReactNode;
    brandColor?: string; // Optional override
    className?: string;
    style?: React.CSSProperties;
}

export const ProfileContainer: React.FC<ProfileContainerProps> = ({
    theme,
    children,
    brandColor,
    className = '',
    style,
}) => {
    return (
        <div
            className={`min-h-screen w-full transition-colors duration-500 ease-out ${theme.colors.background} ${className}`}
            style={{
                ...(brandColor ? { '--brand-color': brandColor } as React.CSSProperties : {}),
                ...style,
            }}
        >
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="max-w-4xl mx-auto px-4 py-8 md:py-16 min-h-screen flex flex-col"
            >
                {children}
            </motion.div>
        </div>
    );
};
