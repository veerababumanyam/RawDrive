import React, { useState, useMemo } from 'react';
import * as LucideIcons from 'lucide-react';
import { Search, X } from 'lucide-react';
import { AppInput } from '@/components/ui/AppInput';

interface IconPickerProps {
    value?: string;
    onChange: (iconName: string) => void;
    searchable?: boolean;
    className?: string;
}

export const IconPicker: React.FC<IconPickerProps> = ({
    value,
    onChange,
    searchable = true,
    className = '',
}) => {
    const [searchTerm, setSearchTerm] = useState('');

    // Get all valid icon names from lucide-react exports
    const iconList = useMemo(() => {
        return Object.keys(LucideIcons)
            .filter((key) => {
                // Filter out non-component exports and the createLucideIcon function
                // Lucide exports icons as React components (functions or objects)
                const item = (LucideIcons as any)[key];
                return key !== 'icons' && key !== 'createLucideIcon' && key !== 'default';
            })
            .sort();
    }, []);

    const filteredIcons = useMemo(() => {
        if (!searchTerm) return iconList.slice(0, 100); // Limit initial display for performance

        const lowerTerm = searchTerm.toLowerCase();
        return iconList.filter(name =>
            name.toLowerCase().includes(lowerTerm)
        ).slice(0, 100); // Limit search results too
    }, [iconList, searchTerm]);

    // Dynamic component renderer
    const renderIcon = (name: string, size: number = 24) => {
        const IconComponent = (LucideIcons as any)[name];
        if (!IconComponent) return null;
        return <IconComponent size={size} />;
    };

    return (
        <div className={`w-full ${className}`}>
            {searchable && (
                <div className="relative mb-3">
                    <AppInput
                        placeholder="Search icons..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        leftIcon={<Search className="w-4 h-4" />}
                    />
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            )}

            <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 max-h-[240px] overflow-y-auto p-1 border border-border rounded-lg bg-surface">
                {filteredIcons.map((iconName) => (
                    <button
                        key={iconName}
                        type="button"
                        onClick={() => onChange(iconName)}
                        className={`group relative flex flex-col items-center justify-center p-3 rounded-xl transition-all duration-300 ${value === iconName
                                ? 'bg-gradient-to-br from-primary via-primary/80 to-secondary shadow-lg shadow-primary/25 scale-110'
                                : 'bg-surface hover:bg-surface-hover hover:scale-105 border border-transparent hover:border-border'
                            }`}
                        title={iconName}
                    >
                        <div className={`
                             transition-colors duration-300 
                             ${value === iconName ? 'text-white' : 'text-text-secondary group-hover:text-primary'}
                         `}>
                            {renderIcon(iconName, 20)}
                        </div>
                    </button>
                ))}

                {filteredIcons.length === 0 && (
                    <div className="col-span-full py-4 text-center text-text-tertiary text-sm">
                        No icons found
                    </div>
                )}
            </div>

            <div className="mt-2 text-xs text-text-tertiary text-right">
                {iconList.length} icons available
            </div>
        </div>
    );
};
