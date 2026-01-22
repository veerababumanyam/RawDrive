/**
 * KeyboardShortcutHelp Component
 * Overlay modal showing all keyboard shortcuts for Pro Review Mode
 * Feature: 029-pro-review-xmp-sync
 * Task: T028
 *
 * Shows:
 * - Rating shortcuts (0-5)
 * - Flag shortcuts (P, U, X)
 * - Color label shortcuts (6-9)
 * - Navigation shortcuts (arrows, home, end)
 * - View shortcuts (F, Z, C, ?)
 */

import React, { useEffect, useCallback } from 'react';
import { X, Star, Flag, Palette, Navigation, Eye, Keyboard } from 'lucide-react';
import { KEYBOARD_SHORTCUTS } from '../../../../types/reviewMode';

export interface KeyboardShortcutHelpProps {
  /** Whether the modal is visible */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Custom className */
  className?: string;
}

/**
 * Shortcut row component
 */
const ShortcutRow: React.FC<{
  keys: string | string[];
  description: string;
  className?: string;
}> = ({ keys, description, className = '' }) => {
  const keyArray = Array.isArray(keys) ? keys : [keys];

  return (
    <div className={`flex items-center justify-between py-1.5 ${className}`}>
      <span className="text-sm text-text-secondary">{description}</span>
      <div className="flex items-center gap-1">
        {keyArray.map((key, index) => (
          <React.Fragment key={key}>
            {index > 0 && <span className="text-text-tertiary text-xs">or</span>}
            <kbd
              className="
                inline-flex items-center justify-center
                min-w-[24px] h-6 px-2
                bg-surface-hover border border-border
                rounded text-xs font-mono text-text-primary
              "
            >
              {key}
            </kbd>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

/**
 * Shortcut section component
 */
const ShortcutSection: React.FC<{
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  className?: string;
}> = ({ icon, title, children, className = '' }) => (
  <div className={`${className}`}>
    <div className="flex items-center gap-2 mb-2 pb-1 border-b border-border">
      {icon}
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
    </div>
    <div className="space-y-0.5">{children}</div>
  </div>
);

/**
 * KeyboardShortcutHelp - Modal showing all keyboard shortcuts
 */
export const KeyboardShortcutHelp: React.FC<KeyboardShortcutHelpProps> = ({
  isOpen,
  onClose,
  className = '',
}) => {
  // Close on escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className={`
        fixed inset-0 z-50
        flex items-center justify-center
        bg-black/60 backdrop-blur-sm
        ${className}
      `}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="keyboard-shortcuts-title"
    >
      <div
        className="
          bg-surface border border-border rounded-xl shadow-2xl
          w-full max-w-2xl max-h-[85vh]
          flex flex-col
          animate-in fade-in zoom-in-95 duration-200
        "
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-primary" />
            <h2 id="keyboard-shortcuts-title" className="text-lg font-semibold text-text-primary">
              Keyboard Shortcuts
            </h2>
          </div>
          <button
            onClick={onClose}
            className="
              p-1.5 rounded-lg
              text-text-tertiary hover:text-text-primary
              hover:bg-surface-hover
              transition-colors
              focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
            "
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Rating Shortcuts */}
            <ShortcutSection
              icon={<Star size={16} className="text-yellow-500" />}
              title="Rating"
            >
              <ShortcutRow
                keys={KEYBOARD_SHORTCUTS.RATING_0.key}
                description={KEYBOARD_SHORTCUTS.RATING_0.description}
              />
              <ShortcutRow
                keys={KEYBOARD_SHORTCUTS.RATING_1.key}
                description={KEYBOARD_SHORTCUTS.RATING_1.description}
              />
              <ShortcutRow
                keys={KEYBOARD_SHORTCUTS.RATING_2.key}
                description={KEYBOARD_SHORTCUTS.RATING_2.description}
              />
              <ShortcutRow
                keys={KEYBOARD_SHORTCUTS.RATING_3.key}
                description={KEYBOARD_SHORTCUTS.RATING_3.description}
              />
              <ShortcutRow
                keys={KEYBOARD_SHORTCUTS.RATING_4.key}
                description={KEYBOARD_SHORTCUTS.RATING_4.description}
              />
              <ShortcutRow
                keys={KEYBOARD_SHORTCUTS.RATING_5.key}
                description={KEYBOARD_SHORTCUTS.RATING_5.description}
              />
            </ShortcutSection>

            {/* Flag Shortcuts */}
            <ShortcutSection
              icon={<Flag size={16} className="text-primary" />}
              title="Flag"
            >
              <ShortcutRow
                keys={KEYBOARD_SHORTCUTS.FLAG_PICK.key.toUpperCase()}
                description={KEYBOARD_SHORTCUTS.FLAG_PICK.description}
              />
              <ShortcutRow
                keys={KEYBOARD_SHORTCUTS.FLAG_UNFLAG.key.toUpperCase()}
                description={KEYBOARD_SHORTCUTS.FLAG_UNFLAG.description}
              />
              <ShortcutRow
                keys={KEYBOARD_SHORTCUTS.FLAG_REJECT.key.toUpperCase()}
                description={KEYBOARD_SHORTCUTS.FLAG_REJECT.description}
              />
            </ShortcutSection>

            {/* Color Label Shortcuts */}
            <ShortcutSection
              icon={<Palette size={16} className="text-green-500" />}
              title="Color Labels"
            >
              <ShortcutRow
                keys={KEYBOARD_SHORTCUTS.LABEL_RED.key}
                description={KEYBOARD_SHORTCUTS.LABEL_RED.description}
              />
              <ShortcutRow
                keys={KEYBOARD_SHORTCUTS.LABEL_YELLOW.key}
                description={KEYBOARD_SHORTCUTS.LABEL_YELLOW.description}
              />
              <ShortcutRow
                keys={KEYBOARD_SHORTCUTS.LABEL_GREEN.key}
                description={KEYBOARD_SHORTCUTS.LABEL_GREEN.description}
              />
              <ShortcutRow
                keys={KEYBOARD_SHORTCUTS.LABEL_BLUE.key}
                description={KEYBOARD_SHORTCUTS.LABEL_BLUE.description}
              />
            </ShortcutSection>

            {/* Navigation Shortcuts */}
            <ShortcutSection
              icon={<Navigation size={16} className="text-blue-500" />}
              title="Navigation"
            >
              <ShortcutRow
                keys={['←', 'J']}
                description={KEYBOARD_SHORTCUTS.NAV_PREV.description}
              />
              <ShortcutRow
                keys={['→', 'K']}
                description={KEYBOARD_SHORTCUTS.NAV_NEXT.description}
              />
              <ShortcutRow
                keys="Home"
                description={KEYBOARD_SHORTCUTS.NAV_FIRST.description}
              />
              <ShortcutRow
                keys="End"
                description={KEYBOARD_SHORTCUTS.NAV_LAST.description}
              />
              <ShortcutRow
                keys="Page Up"
                description="Previous 10 photos"
              />
              <ShortcutRow
                keys="Page Down"
                description="Next 10 photos"
              />
            </ShortcutSection>

            {/* View Shortcuts */}
            <ShortcutSection
              icon={<Eye size={16} className="text-purple-500" />}
              title="View"
            >
              <ShortcutRow
                keys={KEYBOARD_SHORTCUTS.FULLSCREEN.key.toUpperCase()}
                description={KEYBOARD_SHORTCUTS.FULLSCREEN.description}
              />
              <ShortcutRow
                keys={KEYBOARD_SHORTCUTS.ZOOM.key.toUpperCase()}
                description={KEYBOARD_SHORTCUTS.ZOOM.description}
              />
              <ShortcutRow
                keys={KEYBOARD_SHORTCUTS.COMPARE.key.toUpperCase()}
                description={KEYBOARD_SHORTCUTS.COMPARE.description}
              />
              <ShortcutRow
                keys={KEYBOARD_SHORTCUTS.HELP.key}
                description={KEYBOARD_SHORTCUTS.HELP.description}
              />
              <ShortcutRow
                keys="Esc"
                description="Exit review mode"
              />
            </ShortcutSection>

            {/* Additional Shortcuts */}
            <ShortcutSection
              icon={<Keyboard size={16} className="text-text-tertiary" />}
              title="Other"
            >
              <ShortcutRow
                keys="Space"
                description="Toggle pick flag"
              />
              <ShortcutRow
                keys="Enter"
                description="Confirm and next"
              />
              <ShortcutRow
                keys="Delete"
                description="Mark as rejected"
              />
              <ShortcutRow
                keys={['Ctrl+Z', '⌘+Z']}
                description="Undo last action"
              />
            </ShortcutSection>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border bg-surface-hover/50">
          <p className="text-xs text-text-tertiary text-center">
            Press <kbd className="px-1 py-0.5 bg-surface rounded">?</kbd> or{' '}
            <kbd className="px-1 py-0.5 bg-surface rounded">Esc</kbd> to close
          </p>
        </div>
      </div>
    </div>
  );
};

export default KeyboardShortcutHelp;
