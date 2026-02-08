import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home,
  Plus,
  Star,
  Check,
  Trash2,
  Share2,
  ExternalLink,
  Smartphone,
  Info,
  X,
} from 'lucide-react';
import { usePWA } from '@/hooks/usePWA';

/* =============================================================================
   Gallery Shortcut Component

   Enables users to add galleries to home screen as quick shortcuts.
   Supports both PWA shortcut manifest and native share API for iOS.
   ============================================================================= */

/**
 * Gallery data for shortcut
 */
export interface GalleryShortcutData {
  id: string;
  slug: string;
  name: string;
  description?: string;
  thumbnailUrl?: string;
  coverImageUrl?: string;
  isPublic?: boolean;
}

/**
 * Props for GalleryShortcut button
 */
export interface GalleryShortcutButtonProps {
  gallery: GalleryShortcutData;
  variant?: 'icon' | 'button' | 'menu-item';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onShortcutAdded?: () => void;
  onShortcutRemoved?: () => void;
}

/**
 * Generate shortcut URL for a gallery
 */
function getGalleryShortcutUrl(gallery: GalleryShortcutData): string {
  // For public galleries, use the public URL
  if (gallery.isPublic) {
    return `/g/${gallery.slug}`;
  }
  // For private galleries, use the gallery detail URL
  return `/galleries/${gallery.id}`;
}

/**
 * Gallery Shortcut Button Component
 */
export function GalleryShortcutButton({
  gallery,
  variant = 'button',
  size = 'md',
  className,
  onShortcutAdded,
  onShortcutRemoved,
}: GalleryShortcutButtonProps) {
  const { platform, shortcuts, addShortcut, removeShortcut, canShare, share } = usePWA();
  const [showInstructions, setShowInstructions] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  // Check if shortcut exists
  const shortcutUrl = getGalleryShortcutUrl(gallery);
  const isShortcutAdded = useMemo(() => {
    return shortcuts.some(s => s.url === shortcutUrl);
  }, [shortcuts, shortcutUrl]);

  // Handle add shortcut
  const handleAddShortcut = useCallback(async () => {
    setIsAdding(true);

    try {
      // For iOS, use share API if available
      if (platform.isIOS && canShare({ url: window.location.origin + shortcutUrl })) {
        setShowInstructions(true);
        return;
      }

      // Add to shortcuts storage
      addShortcut({
        name: gallery.name,
        short_name: gallery.name.slice(0, 12),
        description: gallery.description || `Quick access to ${gallery.name}`,
        url: shortcutUrl,
        icons: gallery.thumbnailUrl ? [
          {
            src: gallery.thumbnailUrl,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
        ] : undefined,
      });

      // If platform supports share API for adding to home screen
      if (canShare({ url: window.location.origin + shortcutUrl })) {
        try {
          await share({
            title: gallery.name,
            text: gallery.description || `Open ${gallery.name} gallery`,
            url: window.location.origin + shortcutUrl,
          });
        } catch (error) {
          // User cancelled or share failed - that's ok
          console.log('Share cancelled or failed:', error);
        }
      }

      onShortcutAdded?.();
    } finally {
      setIsAdding(false);
    }
  }, [platform.isIOS, canShare, shortcutUrl, gallery, addShortcut, share, onShortcutAdded]);

  // Handle remove shortcut
  const handleRemoveShortcut = useCallback(() => {
    removeShortcut(shortcutUrl);
    onShortcutRemoved?.();
  }, [removeShortcut, shortcutUrl, onShortcutRemoved]);

  // Size classes
  const sizeClasses = {
    sm: 'p-1.5 text-xs',
    md: 'p-2 text-sm',
    lg: 'p-3 text-base',
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  // Render based on variant
  if (variant === 'icon') {
    return (
      <>
        <button
          onClick={isShortcutAdded ? handleRemoveShortcut : handleAddShortcut}
          disabled={isAdding}
          className={`rounded-lg transition-colors ${sizeClasses[size]} ${
            isShortcutAdded
              ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
              : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-white'
          } disabled:opacity-50 ${className || ''}`}
          title={isShortcutAdded ? 'Remove from shortcuts' : 'Add to home screen'}
        >
          {isAdding ? (
            <span className={`block ${iconSizes[size]} border-2 border-current border-t-transparent rounded-full animate-spin`} />
          ) : isShortcutAdded ? (
            <Star className={`${iconSizes[size]} fill-current`} />
          ) : (
            <Home className={iconSizes[size]} />
          )}
        </button>

        <IOSInstructionsModal
          isOpen={showInstructions}
          onClose={() => setShowInstructions(false)}
          gallery={gallery}
        />
      </>
    );
  }

  if (variant === 'menu-item') {
    return (
      <>
        <button
          onClick={isShortcutAdded ? handleRemoveShortcut : handleAddShortcut}
          disabled={isAdding}
          className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm rounded-lg transition-colors ${
            isShortcutAdded
              ? 'text-blue-400 hover:bg-blue-500/10'
              : 'text-slate-300 hover:bg-slate-700/50'
          } disabled:opacity-50 ${className || ''}`}
        >
          {isAdding ? (
            <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : isShortcutAdded ? (
            <Star className="w-5 h-5 fill-current" />
          ) : (
            <Home className="w-5 h-5" />
          )}
          <span>{isShortcutAdded ? 'Remove from shortcuts' : 'Add to home screen'}</span>
          {isShortcutAdded && <Check className="w-4 h-4 ml-auto" />}
        </button>

        <IOSInstructionsModal
          isOpen={showInstructions}
          onClose={() => setShowInstructions(false)}
          gallery={gallery}
        />
      </>
    );
  }

  // Default button variant
  return (
    <>
      <button
        onClick={isShortcutAdded ? handleRemoveShortcut : handleAddShortcut}
        disabled={isAdding}
        className={`inline-flex items-center gap-2 ${sizeClasses[size]} rounded-lg transition-colors ${
          isShortcutAdded
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-slate-700 text-white hover:bg-slate-600'
        } disabled:opacity-50 font-medium ${className || ''}`}
      >
        {isAdding ? (
          <span className={`block ${iconSizes[size]} border-2 border-white border-t-transparent rounded-full animate-spin`} />
        ) : isShortcutAdded ? (
          <>
            <Check className={iconSizes[size]} />
            <span>Shortcut Added</span>
          </>
        ) : (
          <>
            <Plus className={iconSizes[size]} />
            <span>Add to Home</span>
          </>
        )}
      </button>

      <IOSInstructionsModal
        isOpen={showInstructions}
        onClose={() => setShowInstructions(false)}
        gallery={gallery}
      />
    </>
  );
}

/**
 * iOS Instructions Modal
 */
interface IOSInstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  gallery: GalleryShortcutData;
}

function IOSInstructionsModal({ isOpen, onClose, gallery }: IOSInstructionsModalProps) {
  const { share, canShare } = usePWA();
  const shortcutUrl = getGalleryShortcutUrl(gallery);
  const fullUrl = window.location.origin + shortcutUrl;

  const handleShare = async () => {
    if (canShare({ url: fullUrl })) {
      try {
        await share({
          title: gallery.name,
          text: `Open ${gallery.name} gallery`,
          url: fullUrl,
        });
        onClose();
      } catch {
        // User cancelled
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-lg"
          >
            <div className="bg-slate-800 rounded-t-2xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                    <Smartphone className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">Add to Home Screen</h3>
                    <p className="text-xs text-slate-400">Create a shortcut for quick access</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-4 space-y-4">
                {/* Gallery preview */}
                <div className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg">
                  {gallery.thumbnailUrl ? (
                    <img
                      src={gallery.thumbnailUrl}
                      alt={gallery.name}
                      className="w-12 h-12 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-slate-600 flex items-center justify-center">
                      <Home className="w-6 h-6 text-slate-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{gallery.name}</p>
                    {gallery.description && (
                      <p className="text-xs text-slate-400 truncate">{gallery.description}</p>
                    )}
                  </div>
                </div>

                {/* Instructions */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Info className="w-4 h-4 shrink-0" />
                    <p className="text-sm">To add this gallery to your home screen:</p>
                  </div>

                  <ol className="space-y-2 text-sm">
                    <li className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 text-xs font-medium">1</span>
                      <span className="text-slate-300">Tap the <Share2 className="w-4 h-4 inline text-blue-400" /> Share button below</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 text-xs font-medium">2</span>
                      <span className="text-slate-300">Scroll and tap <span className="text-white font-medium">"Add to Home Screen"</span></span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 text-xs font-medium">3</span>
                      <span className="text-slate-300">Tap <span className="text-white font-medium">"Add"</span> to confirm</span>
                    </li>
                  </ol>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={onClose}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-700 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleShare}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
                  >
                    <Share2 className="w-4 h-4" />
                    Share
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* =============================================================================
   Gallery Shortcuts List Component
   ============================================================================= */

export interface GalleryShortcutsListProps {
  onGallerySelect?: (url: string) => void;
  className?: string;
  maxItems?: number;
}

export function GalleryShortcutsList({
  onGallerySelect,
  className,
  maxItems = 5,
}: GalleryShortcutsListProps) {
  const { shortcuts, removeShortcut } = usePWA();

  const displayedShortcuts = shortcuts.slice(0, maxItems);

  if (displayedShortcuts.length === 0) {
    return (
      <div className={`text-center py-8 ${className || ''}`}>
        <Home className="w-12 h-12 mx-auto text-slate-600 mb-3" />
        <p className="text-slate-400 text-sm">No gallery shortcuts yet</p>
        <p className="text-slate-500 text-xs mt-1">
          Add galleries to your home screen for quick access
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className || ''}`}>
      {displayedShortcuts.map((shortcut) => (
        <div
          key={shortcut.url}
          className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg group"
        >
          {shortcut.icons?.[0]?.src ? (
            <img
              src={shortcut.icons[0].src}
              alt={shortcut.name}
              className="w-10 h-10 rounded-lg object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center">
              <Home className="w-5 h-5 text-slate-400" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <p className="text-white font-medium truncate">{shortcut.name}</p>
            {shortcut.description && (
              <p className="text-xs text-slate-400 truncate">{shortcut.description}</p>
            )}
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onGallerySelect?.(shortcut.url)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              title="Open gallery"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
            <button
              onClick={() => removeShortcut(shortcut.url)}
              className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors"
              title="Remove shortcut"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default GalleryShortcutButton;
