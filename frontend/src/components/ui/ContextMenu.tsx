/**
 * ContextMenu Component
 * Right-click context menu with positioning and keyboard support
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'destructive';
  separator?: boolean; // Add separator before this item
}

export interface ContextMenuProps {
  isOpen: boolean;
  onClose: () => void;
  items: ContextMenuItem[];
  x: number;
  y: number;
  className?: string;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  isOpen,
  onClose,
  items,
  x,
  y,
  className = '',
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  // Update position when props change
  useEffect(() => {
    setPosition({ x, y });
  }, [x, y]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Use setTimeout to avoid immediate close on right-click
    const timeout = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Adjust position to keep menu in viewport
  useEffect(() => {
    if (!isOpen || !menuRef.current) return;

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = position.x;
    let adjustedY = position.y;

    // Adjust horizontal position
    if (rect.right > viewportWidth) {
      adjustedX = viewportWidth - rect.width - 8;
    }
    if (adjustedX < 8) {
      adjustedX = 8;
    }

    // Adjust vertical position
    if (rect.bottom > viewportHeight) {
      adjustedY = viewportHeight - rect.height - 8;
    }
    if (adjustedY < 8) {
      adjustedY = 8;
    }

    if (adjustedX !== position.x || adjustedY !== position.y) {
      setPosition({ x: adjustedX, y: adjustedY });
    }
  }, [isOpen, position.x, position.y]);

  if (!isOpen) return null;

  const menu = (
    <div
      ref={menuRef}
      className={`
        fixed z-50
        min-w-[180px]
        bg-surface
        border border-border
        rounded-lg
        shadow-lg
        py-1
        ${className}
      `}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      role="menu"
      aria-orientation="vertical"
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, index) => {
        if (item.separator && index > 0) {
          return (
            <React.Fragment key={`separator-${index}`}>
              <div className="border-t border-border my-1" />
              <button
                className={`
                  w-full px-4 py-2 text-left text-sm
                  flex items-center gap-2
                  transition-colors
                  ${item.disabled
                    ? 'text-text-tertiary cursor-not-allowed'
                    : item.variant === 'destructive'
                      ? 'text-error hover:bg-error-50 dark:hover:bg-error-900/20'
                      : 'text-text-primary hover:bg-surface-hover'
                  }
                `}
                onClick={() => {
                  if (!item.disabled) {
                    item.onClick();
                    onClose();
                  }
                }}
                disabled={item.disabled}
                role="menuitem"
              >
                {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
                <span>{item.label}</span>
              </button>
            </React.Fragment>
          );
        }

        return (
          <button
            key={index}
            className={`
              w-full px-4 py-2 text-left text-sm
              flex items-center gap-2
              transition-colors
              ${item.disabled
                ? 'text-text-tertiary cursor-not-allowed'
                : item.variant === 'destructive'
                  ? 'text-error hover:bg-error-50 dark:hover:bg-error-900/20'
                  : 'text-text-primary hover:bg-surface-hover'
              }
            `}
            onClick={() => {
              if (!item.disabled) {
                item.onClick();
                onClose();
              }
            }}
            disabled={item.disabled}
            role="menuitem"
          >
            {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );

  return createPortal(menu, document.body);
};

