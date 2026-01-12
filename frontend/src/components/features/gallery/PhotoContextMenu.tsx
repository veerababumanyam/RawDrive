/**
 * PhotoContextMenu Component
 *
 * A floating context menu for photo actions, triggered by long-press on touch devices.
 * Provides quick access to common actions: Favorite, Select, Download, Share, Delete.
 *
 * Features:
 * - Positioned near the touch point
 * - Auto-closes on outside click/touch
 * - Keyboard accessible (Escape to close)
 * - Smooth animations with reduced motion support
 * - Dark mode support
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Heart, Bookmark, Download, Share2, Trash2, Lock, Eye, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface PhotoContextMenuAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger' | 'success';
  disabled?: boolean;
  active?: boolean;
}

export interface PhotoContextMenuProps {
  /** Whether the menu is visible */
  isOpen: boolean;
  /** Position to render the menu (screen coordinates) */
  position: { x: number; y: number };
  /** Callback when menu should close */
  onClose: () => void;
  /** Actions to display in the menu */
  actions: PhotoContextMenuAction[];
  /** Optional title for the menu */
  title?: string;
}

export const PhotoContextMenu: React.FC<PhotoContextMenuProps> = ({
  isOpen,
  position,
  onClose,
  actions,
  title,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Small delay to prevent immediate close from the triggering touch
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen, onClose]);

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

  // Calculate position to keep menu on screen
  const getAdjustedPosition = useCallback(() => {
    const menuWidth = 200;
    const menuHeight = actions.length * 48 + (title ? 40 : 0) + 16; // Rough estimate
    const padding = 16;

    let x = position.x;
    let y = position.y;

    // Keep within viewport bounds
    if (x + menuWidth > window.innerWidth - padding) {
      x = window.innerWidth - menuWidth - padding;
    }
    if (x < padding) {
      x = padding;
    }

    if (y + menuHeight > window.innerHeight - padding) {
      y = position.y - menuHeight - 10; // Show above touch point
    }
    if (y < padding) {
      y = padding;
    }

    return { x, y };
  }, [position, actions.length, title]);

  const adjustedPosition = getAdjustedPosition();

  const getVariantClasses = (variant: PhotoContextMenuAction['variant'], active?: boolean) => {
    if (active) {
      switch (variant) {
        case 'danger':
          return 'bg-red-500/20 text-red-400';
        case 'success':
          return 'bg-green-500/20 text-green-400';
        default:
          return 'bg-blue-500/20 text-blue-400';
      }
    }

    switch (variant) {
      case 'danger':
        return 'text-red-400 hover:bg-red-500/10';
      case 'success':
        return 'text-green-400 hover:bg-green-500/10';
      default:
        return 'text-gray-200 hover:bg-white/10';
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop - subtle overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[200] bg-black/30"
            aria-hidden="true"
          />

          {/* Menu */}
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.9, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            transition={{
              duration: 0.2,
              ease: [0.16, 1, 0.3, 1], // Custom ease for snappy feel
            }}
            style={{
              position: 'fixed',
              left: adjustedPosition.x,
              top: adjustedPosition.y,
            }}
            className="z-[201] w-52 bg-gray-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 overflow-hidden"
            role="menu"
            aria-orientation="vertical"
            aria-label={title || 'Photo actions'}
          >
            {/* Title */}
            {title && (
              <div className="px-4 py-3 border-b border-white/10">
                <span className="text-sm font-medium text-gray-300 truncate block">
                  {title}
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="py-2">
              {actions.map((action) => (
                <button
                  key={action.id}
                  className={`
                    w-full flex items-center gap-3 px-4 py-3
                    text-sm font-medium transition-colors duration-150
                    disabled:opacity-40 disabled:cursor-not-allowed
                    ${getVariantClasses(action.variant, action.active)}
                  `}
                  onClick={() => {
                    if (!action.disabled) {
                      action.onClick();
                      onClose();
                    }
                  }}
                  disabled={action.disabled}
                  role="menuitem"
                  aria-disabled={action.disabled}
                >
                  <span className="flex-shrink-0">{action.icon}</span>
                  <span className="truncate">{action.label}</span>
                  {action.active && (
                    <span className="ml-auto">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Close hint for touch users */}
            <div className="px-4 py-2 border-t border-white/10 bg-white/5">
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <X size={12} />
                Tap outside to close
              </span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
};

/**
 * Helper function to create standard photo actions
 */
export function createPhotoContextActions({
  isFavorited,
  isSelected,
  isPrivate,
  onFavorite,
  onSelect,
  onDownload,
  onShare,
  onLock,
  onDelete,
  onView,
}: {
  isFavorited?: boolean;
  isSelected?: boolean;
  isPrivate?: boolean;
  onFavorite?: () => void;
  onSelect?: () => void;
  onDownload?: () => void;
  onShare?: () => void;
  onLock?: () => void;
  onDelete?: () => void;
  onView?: () => void;
}): PhotoContextMenuAction[] {
  const actions: PhotoContextMenuAction[] = [];

  if (onView) {
    actions.push({
      id: 'view',
      label: 'View Full Screen',
      icon: <Eye size={18} />,
      onClick: onView,
    });
  }

  if (onFavorite) {
    actions.push({
      id: 'favorite',
      label: isFavorited ? 'Remove Favorite' : 'Add to Favorites',
      icon: <Heart size={18} className={isFavorited ? 'fill-current' : ''} />,
      onClick: onFavorite,
      active: isFavorited,
      variant: isFavorited ? 'danger' : 'default',
    });
  }

  if (onSelect) {
    actions.push({
      id: 'select',
      label: isSelected ? 'Remove Selection' : 'Add to Selection',
      icon: <Bookmark size={18} className={isSelected ? 'fill-current' : ''} />,
      onClick: onSelect,
      active: isSelected,
      variant: isSelected ? 'success' : 'default',
    });
  }

  if (onDownload) {
    actions.push({
      id: 'download',
      label: 'Download',
      icon: <Download size={18} />,
      onClick: onDownload,
    });
  }

  if (onShare) {
    actions.push({
      id: 'share',
      label: 'Share',
      icon: <Share2 size={18} />,
      onClick: onShare,
    });
  }

  if (onLock) {
    actions.push({
      id: 'lock',
      label: isPrivate ? 'Unlock Photo' : 'Lock Photo',
      icon: <Lock size={18} />,
      onClick: onLock,
      active: isPrivate,
    });
  }

  if (onDelete) {
    actions.push({
      id: 'delete',
      label: 'Delete',
      icon: <Trash2 size={18} />,
      onClick: onDelete,
      variant: 'danger',
    });
  }

  return actions;
}

export default PhotoContextMenu;
