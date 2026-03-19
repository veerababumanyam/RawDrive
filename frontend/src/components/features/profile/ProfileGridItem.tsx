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
}

const itemVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
    },
};

export const ProfileGridItem: React.FC<ProfileGridItemProps> = ({
    children,
    theme,
    colSpan = 1,
    rowSpan = 1,
    className = '',
}) => {
    // Calculate grid classes
    const getColSpanClass = () => {
        switch (colSpan) {
            case 1: return 'col-span-1';
            case 2: return 'col-span-1 sm:col-span-2';
            case 3: return 'col-span-1 sm:col-span-2 lg:col-span-3';
            case 4: return 'col-span-1 sm:col-span-2 lg:col-span-3 xl:col-span-4';
            case 'full': return 'col-span-full';
            default: return 'col-span-1';
        }
    };

    const getRowSpanClass = () => {
        switch (rowSpan) {
            case 1: return 'row-span-1';
            case 2: return 'row-span-1 sm:row-span-2';
            default: return 'row-span-1';
        }
    };

    return (
        <motion.div
            variants={itemVariants}
            className={cn(
                'relative overflow-hidden transition-transform duration-300',
                'hover:scale-[1.02] hover:-translate-y-1',
                'motion-reduce:transition-none motion-reduce:hover:transform-none',
                'backdrop-blur-[8px] sm:backdrop-blur-[12px]',
                'border border-white/20 dark:border-white/10',
                getColSpanClass(),
                getRowSpanClass(),
                className
            )}
            style={{
                backgroundColor: 'var(--theme-surface)',
                borderColor: 'var(--theme-border)',
                borderRadius: 'var(--theme-radius)',
                boxShadow: 'var(--theme-shadow)',
            }}
        >
            {children}
        </motion.div>
    );
};
