import React from 'react';
import { motion } from 'framer-motion';
import { staggerContainer, staggerItem } from '../landing/animations/presets';

interface SettingsPageLayoutProps {
    title: string;
    subtitle?: string;
    actions?: React.ReactNode;
    children: React.ReactNode;
}

export const SettingsPageLayout: React.FC<SettingsPageLayoutProps> = ({
    title,
    subtitle,
    actions,
    children,
}) => {
    return (
        <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="space-y-6"
        >
            {/* Page Header - Enhanced with glass effect */}
            <motion.div
                variants={staggerItem}
                className="card-glass rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
                <div>
                    <h1 className="text-2xl font-bold text-gradient">{title}</h1>
                    {subtitle && (
                        <p className="text-text-secondary mt-1">
                            {subtitle}
                        </p>
                    )}
                </div>
                {actions && (
                    <div className="flex items-center gap-3">
                        {actions}
                    </div>
                )}
            </motion.div>

            {/* Main Content */}
            <motion.div variants={staggerItem}>
                {children}
            </motion.div>
        </motion.div>
    );
};
