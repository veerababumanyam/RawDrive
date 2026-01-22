import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../../lib/utils';
import { ProfileTheme } from './ProfileThemeEngine';

export interface ProfileGridItemProps {
    children: React.ReactNode;
    theme: ProfileTheme;
    colSpan?: 1 | 2 | 3 | 4 | 'full';
    rowSpan?: 1 | 2;
    className?: string;
    delay?: number;
}

export const ProfileGridItem: React.FC<ProfileGridItemProps> = ({
    children,
    theme,
    colSpan = 1,
    rowSpan = 1,
    className = '',
    delay = 0,
}) => {
    // Calculate grid classes
    const getColSpanClass = () => {
        switch (colSpan) {
            case 1: return 'col-span-1';
            case 2: return 'col-span-1 md:col-span-2';
            case 3: return 'col-span-1 md:col-span-3';
            case 4: return 'col-span-1 md:col-span-4';
            case 'full': return 'col-span-1 md:col-span-full';
            default: return 'col-span-1';
        }
    };

    const getRowSpanClass = () => {
        switch (rowSpan) {
            case 1: return 'row-span-1';
            case 2: return 'row-span-1 md:row-span-2';
            default: return 'row-span-1';
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay }}
            className={cn(
                'relative overflow-hidden transition-all duration-300',
                getColSpanClass(),
                getRowSpanClass(),
                // Apply theme-specific surface styles if not overridden by className
                !className.includes('bg-') && theme.colors.surface,
                theme.effects.radius,
                theme.effects.shadow,
                theme.effects.glassmorphism && theme.effects.blur,
                theme.effects.glassmorphism && theme.colors.border ? `border ${theme.colors.border}` : '',
                className
            )}
        >
            {children}
        </motion.div>
    );
};
