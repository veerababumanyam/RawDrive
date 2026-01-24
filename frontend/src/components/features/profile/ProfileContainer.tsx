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
    // Build CSS custom properties from theme color values
    const cssVars = {
        '--theme-bg': theme.colorValues.background,
        '--theme-text': theme.colorValues.text,
        '--theme-text-secondary': theme.colorValues.textSecondary,
        '--theme-accent': theme.colorValues.accent,
        '--theme-surface': theme.colorValues.surface,
        '--theme-border': theme.colorValues.border,
        '--theme-primary': theme.colorValues.background,
        '--brand-color': brandColor || '#3B82F6',
    } as React.CSSProperties;

    const combinedStyle = {
        ...cssVars,
        ...style,
    };

    return (
        <div
            className={`min-h-screen w-full transition-colors duration-500 ease-out ${theme.colors.background} ${className}`}
            style={combinedStyle}
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
