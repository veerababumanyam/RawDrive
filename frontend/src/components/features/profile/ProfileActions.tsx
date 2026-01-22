import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, QrCode, Share2, X } from 'lucide-react';
import { ProfileTheme } from './ProfileThemeEngine';

interface ProfileActionsProps {
    theme: ProfileTheme;
    slug: string;
    showVCard?: boolean;
    showQrCode?: boolean;
    onShare: () => void;
    onDownloadVCard: () => void;
    onDownloadQr: () => void;
}

export const ProfileActions: React.FC<ProfileActionsProps> = ({
    theme,
    slug,
    showVCard = true,
    showQrCode = true,
    onShare,
    onDownloadVCard,
    onDownloadQr,
}) => {
    return (
        <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.8, type: 'spring' }}
            className={`
        fixed bottom-6 left-1/2 -translate-x-1/2 z-50
        flex items-center gap-4 p-2
        ${theme.colors.surface} backdrop-blur-xl border ${theme.colors.border}
        rounded-full shadow-2xl
      `}
        >
            {showVCard && (
                <ActionButton
                    theme={theme}
                    icon={Download}
                    label="Save Contact"
                    onClick={onDownloadVCard}
                />
            )}

            {showQrCode && (
                <ActionButton
                    theme={theme}
                    icon={QrCode}
                    label="QR Code"
                    onClick={onDownloadQr}
                />
            )}

            <ActionButton
                theme={theme}
                icon={Share2}
                label="Share"
                onClick={onShare}
                variant="primary"
            />
        </motion.div>
    );
};

interface ActionButtonProps {
    theme: ProfileTheme;
    icon: React.ElementType;
    label: string;
    onClick: () => void;
    variant?: 'default' | 'primary';
}

const ActionButton: React.FC<ActionButtonProps> = ({
    theme,
    icon: Icon,
    label,
    onClick,
    variant = 'default'
}) => {
    const isPrimary = variant === 'primary';

    return (
        <button
            onClick={onClick}
            className={`
        flex items-center gap-2 px-4 py-2.5 rounded-full font-medium text-sm transition-all
        ${isPrimary
                    ? `${theme.colors.primaryButton} ${theme.colors.primaryButtonText}`
                    : `${theme.colors.text} hover:bg-black/5 dark:hover:bg-white/10`
                }
      `}
        >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
        </button>
    );
};
