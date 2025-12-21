/**
 * LanguageSelector Component
 * 
 * Dropdown for selecting UI language with instant switching
 * and persistence to backend/localStorage.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '../../i18n/config';
import { userService } from '../../services/userService';

interface LanguageSelectorProps {
    /** Callback when language changes successfully */
    onLanguageChange?: (lang: LanguageCode) => void;
    /** Show as compact button or full dropdown */
    variant?: 'button' | 'dropdown';
    /** Additional CSS classes */
    className?: string;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
    onLanguageChange,
    variant = 'dropdown',
    className = '',
}) => {
    const { i18n, t } = useTranslation('settings');
    const [isOpen, setIsOpen] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);

    const currentLanguage = SUPPORTED_LANGUAGES.find(
        (lang) => lang.code === i18n.language
    ) || SUPPORTED_LANGUAGES[0];

    const handleLanguageChange = async (langCode: LanguageCode) => {
        if (langCode === i18n.language) {
            setIsOpen(false);
            return;
        }

        setIsUpdating(true);
        try {
            // Update i18n first for instant feedback
            await i18n.changeLanguage(langCode);

            // Persist to localStorage (handled by i18next detector)
            // Persist to backend
            try {
                await userService.updateProfile({ preferred_language: langCode });
            } catch (error) {
                console.warn('Failed to save language preference to backend:', error);
                // Continue anyway - localStorage will persist it
            }

            onLanguageChange?.(langCode);
        } catch (error) {
            console.error('Failed to change language:', error);
        } finally {
            setIsUpdating(false);
            setIsOpen(false);
        }
    };

    if (variant === 'button') {
        return (
            <div className={`relative ${className}`}>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-hover transition-colors"
                    aria-label={t('language.selectLanguage')}
                >
                    <Globe size={18} className="text-text-secondary" />
                    <span className="text-sm font-medium">{currentLanguage.nativeName}</span>
                </button>

                {isOpen && (
                    <LanguageDropdown
                        currentLang={i18n.language}
                        isUpdating={isUpdating}
                        onSelect={handleLanguageChange}
                        onClose={() => setIsOpen(false)}
                    />
                )}
            </div>
        );
    }

    return (
        <div className={`relative ${className}`}>
            <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('language.selectLanguage')}
            </label>
            <button
                onClick={() => setIsOpen(!isOpen)}
                disabled={isUpdating}
                className={`
          w-full flex items-center justify-between
          px-4 py-3 rounded-xl
          bg-surface border border-border
          hover:border-primary/50 hover:bg-surface-hover
          focus:outline-none focus:ring-2 focus:ring-primary/30
          transition-all duration-200
          ${isUpdating ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
        `}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
            >
                <div className="flex items-center gap-3">
                    <Globe size={20} className="text-text-tertiary" />
                    <div className="text-left">
                        <div className="font-medium text-text-primary">
                            {currentLanguage.nativeName}
                        </div>
                        <div className="text-xs text-text-tertiary">
                            {currentLanguage.name}
                        </div>
                    </div>
                </div>
                <ChevronDown
                    size={18}
                    className={`text-text-tertiary transition-transform duration-200 ${isOpen ? 'rotate-180' : ''
                        }`}
                />
            </button>

            {isOpen && (
                <LanguageDropdown
                    currentLang={i18n.language}
                    isUpdating={isUpdating}
                    onSelect={handleLanguageChange}
                    onClose={() => setIsOpen(false)}
                />
            )}
        </div>
    );
};

interface LanguageDropdownProps {
    currentLang: string;
    isUpdating: boolean;
    onSelect: (lang: LanguageCode) => void;
    onClose: () => void;
}

const LanguageDropdown: React.FC<LanguageDropdownProps> = React.memo(({
    currentLang,
    isUpdating,
    onSelect,
    onClose,
}) => {
    // Close on click outside
    React.useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('[data-language-dropdown]')) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    return (
        <div
            data-language-dropdown
            className="
        absolute z-50 mt-2 w-full min-w-[280px]
        max-h-[400px] overflow-y-auto
        bg-surface border border-border rounded-xl
        shadow-xl shadow-black/10
        animate-in fade-in slide-in-from-top-2 duration-200
      "
            role="listbox"
        >
            {SUPPORTED_LANGUAGES.map((lang) => (
                <button
                    key={lang.code}
                    onClick={() => onSelect(lang.code)}
                    disabled={isUpdating}
                    className={`
            w-full flex items-center justify-between
            px-4 py-3
            hover:bg-surface-hover
            transition-colors duration-150
            ${currentLang === lang.code ? 'bg-primary/5' : ''}
            ${isUpdating ? 'cursor-wait' : 'cursor-pointer'}
            first:rounded-t-xl last:rounded-b-xl
          `}
                    role="option"
                    aria-selected={currentLang === lang.code}
                    dir={lang.dir}
                >
                    <div className="flex items-center gap-3">
                        <div className="text-left">
                            <div className={`font-medium ${currentLang === lang.code ? 'text-primary' : 'text-text-primary'}`}>
                                {lang.nativeName}
                            </div>
                            <div className="text-xs text-text-tertiary">
                                {lang.name}
                            </div>
                        </div>
                    </div>
                    {currentLang === lang.code && (
                        <Check size={18} className="text-primary flex-shrink-0" />
                    )}
                </button>
            ))}
        </div>
    );
});

export default LanguageSelector;
