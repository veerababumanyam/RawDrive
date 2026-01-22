/**
 * DesignStudioTooltip Component
 * Premium liquid glassmorphism tooltip for Gallery Design Studio
 */

import React, { useState, useRef } from 'react';

interface DesignStudioTooltipProps {
    content: string;
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
        switch (position) {
            case 'bottom':
                return 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-[#1e293b]/80';
            case 'left':
                return 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-[#1e293b]/80';
            case 'right':
                return 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-[#1e293b]/80';
            default: // top
                return 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-[#1e293b]/80';
        }
    };

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
            absolute z-[100] px-3 py-1.5
            rounded-full glass-liquid-dark
            text-[10px] font-semibold text-white uppercase tracking-wider
            animate-in fade-in zoom-in-95 slide-in-from-bottom-1 duration-200
            ${getPositionClasses()}
          `}
                >
                    <div className="relative z-10 whitespace-nowrap">
                        {content}
                    </div>
                    <div className={`absolute w-0 h-0 border-4 ${getArrowClasses()}`} />
                </div>
            )}
        </div>
    );
};

export default DesignStudioTooltip;
