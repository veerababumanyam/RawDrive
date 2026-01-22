import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '../../lib/utils';

interface VisibilityToggleProps {
    isVisible: boolean;
    onChange: (visible: boolean) => void;
    label?: string;
    className?: string;
}

export const VisibilityToggle: React.FC<VisibilityToggleProps> = ({
    isVisible,
    onChange,
    label,
    className = '',
}) => {
    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                onChange(!isVisible);
            }}
            className={cn(
                "group flex items-center gap-2 px-2 py-1.5 rounded-md transition-all",
                isVisible
                    ? "bg-primary/10 text-primary hover:bg-primary/20"
                    : "bg-surface text-text-tertiary hover:text-text-secondary hover:bg-surface-hover",
                className
            )}
            title={label || (isVisible ? "Visible to public" : "Hidden from public")}
        >
            {isVisible ? (
                <Eye className="w-4 h-4" />
            ) : (
                <EyeOff className="w-4 h-4" />
            )}
            {label && <span className="text-xs font-medium">{label}</span>}
        </button>
    );
};
