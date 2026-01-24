import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '../../lib/utils';

interface VisibilityToggleProps {
    isVisible: boolean;
    onChange: (visible: boolean) => void;
    label?: string;
    showLabel?: boolean;
    className?: string;
}

export const VisibilityToggle: React.FC<VisibilityToggleProps> = ({
    isVisible,
    onChange,
    label,
    showLabel = false,
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
                "group flex items-center gap-2 px-3 py-2 rounded-md transition-all shadow-sm",
                isVisible
                    ? "bg-green-500/10 text-green-600 hover:bg-green-500/20 border border-green-500/20"
                    : "bg-red-500/10 text-red-600 hover:bg-red-500/20 border border-red-500/20",
                className
            )}
            title={label || (isVisible ? "Visible to public" : "Hidden from public")}
        >
            {isVisible ? (
                <Eye className="w-5 h-5" />
            ) : (
                <EyeOff className="w-5 h-5" />
            )}
            {showLabel && label && <span className="text-sm font-medium">{label}</span>}
        </button>
    );
};
