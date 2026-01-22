/**
 * DesignStudioTooltip Component - Enhanced Phase 1
 * Premium liquid glassmorphism tooltip for Gallery Design Studio
 *
 * Features:
 * - Simple string content support
 * - Rich content with title, description, category
 * - Auto-positioning to avoid viewport edges
 * - Keyboard-friendly (focus state support)
 */

import React, { useState, useRef } from 'react';

interface RichTooltipContent {
    title: string;
    description?: string;
    category?: string;
    isPremium?: boolean;
    isLocked?: boolean;
}

interface DesignStudioTooltipProps {
    content: string | RichTooltipContent;
    children: React.ReactElement;
    position?: 'top' | 'bottom' | 'left' | 'right';
    delay?: number;
}

export const DesignStudioTooltip: React.FC<DesignStudioTooltipProps> = ({
    content,
    children,
    position = 'top',
    delay = 100,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleMouseEnter = () => {
        timeoutRef.current = setTimeout(() => {
            setIsOpen(true);
        }, delay);
    };

    const handleMouseLeave = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        setIsOpen(false);
    };

    const handleFocus = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        setIsOpen(true);
    };

    const handleBlur = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        setIsOpen(false);
    };

    const getPositionClasses = () => {
        switch (position) {
            case 'bottom':
                return 'top-full left-1/2 -translate-x-1/2 mt-2';
            case 'left':
                return 'right-full top-1/2 -translate-y-1/2 mr-2';
            case 'right':
                return 'left-full top-1/2 -translate-y-1/2 ml-2';
            default: // top
                return 'bottom-full left-1/2 -translate-x-1/2 mb-2';
        }
    };

    const getArrowClasses = () => {
        // Arrow direction based on tooltip position
        switch (position) {
            case 'bottom':
                return 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-gray-700 dark:border-b-[#1e293b]/80';
            case 'left':
                return 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-gray-700 dark:border-l-[#1e293b]/80';
            case 'right':
                return 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-gray-700 dark:border-r-[#1e293b]/80';
            default: // top
                return 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-gray-700 dark:border-t-[#1e293b]/80';
        }
    };

    // Check if content is rich tooltip content
    const isRichContent = typeof content === 'object' && content !== null;

    return (
        <div className="relative inline-flex group">
            {React.cloneElement(children, {
                onMouseEnter: handleMouseEnter,
                onMouseLeave: handleMouseLeave,
                onFocus: handleFocus,
                onBlur: handleBlur,
            })}

            {isOpen && (
                <div
                    role="tooltip"
                    className={`
            absolute z-[100]
            rounded-lg bg-gray-900 dark:glass-liquid-dark border border-gray-700 dark:border-transparent
            text-gray-100 dark:text-white
            animate-in fade-in zoom-in-95 slide-in-from-bottom-1 duration-200
            ${getPositionClasses()}
            ${isRichContent ? 'px-3 py-2 min-w-[200px]' : 'px-3 py-1.5'}
          `}
                >
                    <div className="relative z-10">
                        {isRichContent ? (
                            // Rich content rendering
                            <div className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                    <h3 className="text-[11px] font-bold tracking-wider uppercase">
                                        {(content as RichTooltipContent).title}
                                    </h3>
                                    {(content as RichTooltipContent).isPremium && (
                                        <span className={`text-[7px] font-black px-1 py-0.5 rounded ${
                                            (content as RichTooltipContent).isLocked
                                                ? 'bg-amber-500/80 text-white'
                                                : 'bg-cyan-400/80 text-gray-900'
                                        }`}>
                                            {(content as RichTooltipContent).isLocked ? 'LOCKED' : 'PRO'}
                                        </span>
                                    )}
                                </div>
                                {(content as RichTooltipContent).description && (
                                    <p className="text-[9px] text-gray-300 dark:text-gray-200 leading-relaxed max-w-xs">
                                        {(content as RichTooltipContent).description}
                                    </p>
                                )}
                                {(content as RichTooltipContent).category && (
                                    <div className="text-[8px] text-gray-400 dark:text-gray-400 uppercase tracking-wider mt-1 pt-1 border-t border-gray-600/50">
                                        {(content as RichTooltipContent).category}
                                    </div>
                                )}
                            </div>
                        ) : (
                            // Simple string content
                            <div className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider">
                                {content as string}
                            </div>
                        )}
                    </div>
                    <div className={`absolute w-0 h-0 border-4 ${getArrowClasses()}`} />
                </div>
            )}
        </div>
    );
};

export default DesignStudioTooltip;
