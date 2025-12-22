/**
 * Undo/Redo Controls Component
 *
 * Provides UI controls for undo/redo functionality:
 * - Undo button with history count
 * - Redo button with history count
 * - Reset to default button
 * - Save indicator
 *
 * Requirements: 8.5, 8.6
 */

import React from 'react';
import {
  Undo2,
  Redo2,
  RotateCcw,
  Check,
  Loader2,
  Save,
} from 'lucide-react';

import { AppButton } from '../../ui/AppButton';

// =============================================================================
// Constants
// =============================================================================

/** Time thresholds for displaying relative save times (in seconds) */
const TIME_THRESHOLDS = {
  JUST_NOW: 5,
  MINUTE: 60,
  HOUR: 3600,
} as const;

// =============================================================================
// Types
// =============================================================================

interface UndoRedoControlsProps {
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Undo callback */
  onUndo: () => void;
  /** Redo callback */
  onRedo: () => void;
  /** Reset callback */
  onReset?: () => void;
  /** Manual save callback */
  onSave?: () => void;
  /** Number of undo steps available */
  undoCount?: number;
  /** Number of redo steps available */
  redoCount?: number;
  /** Whether state has been modified */
  isDirty?: boolean;
  /** Last save timestamp */
  lastSaveTime?: Date | null;
  /** Whether save is pending (debounced) */
  isSavePending?: boolean;
  /** Whether controls are disabled */
  disabled?: boolean;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Show labels on buttons */
  showLabels?: boolean;
  /** Compact layout */
  compact?: boolean;
}

// =============================================================================
// Component
// =============================================================================

export const UndoRedoControls: React.FC<UndoRedoControlsProps> = ({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onReset,
  onSave,
  undoCount = 0,
  redoCount = 0,
  isDirty = false,
  lastSaveTime,
  isSavePending = false,
  disabled = false,
  size = 'sm',
  showLabels = false,
  compact = false,
}) => {
  // Format last save time using named constants
  const formatSaveTime = (date: Date | null): string => {
    if (!date) return '';
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSeconds < TIME_THRESHOLDS.JUST_NOW) return 'Just now';
    if (diffSeconds < TIME_THRESHOLDS.MINUTE) return `${diffSeconds}s ago`;
    if (diffSeconds < TIME_THRESHOLDS.HOUR) return `${Math.floor(diffSeconds / TIME_THRESHOLDS.MINUTE)}m ago`;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const buttonSize = size === 'sm' ? 'sm' : 'md';
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <div
      className={`
        flex items-center
        ${compact ? 'gap-1' : 'gap-2'}
      `}
    >
      {/* Undo button */}
      <AppButton
        variant="ghost"
        size={buttonSize}
        onClick={onUndo}
        disabled={!canUndo || disabled}
        title={undoCount > 0 ? `Undo (${undoCount} step${undoCount !== 1 ? 's' : ''})` : 'Nothing to undo'}
        aria-label="Undo"
      >
        <Undo2 className={iconSize} />
        {showLabels && <span className="ml-1">Undo</span>}
        {undoCount > 0 && !showLabels && (
          <span className="ml-0.5 text-[10px] text-text-tertiary">{undoCount}</span>
        )}
      </AppButton>

      {/* Redo button */}
      <AppButton
        variant="ghost"
        size={buttonSize}
        onClick={onRedo}
        disabled={!canRedo || disabled}
        title={redoCount > 0 ? `Redo (${redoCount} step${redoCount !== 1 ? 's' : ''})` : 'Nothing to redo'}
        aria-label="Redo"
      >
        <Redo2 className={iconSize} />
        {showLabels && <span className="ml-1">Redo</span>}
        {redoCount > 0 && !showLabels && (
          <span className="ml-0.5 text-[10px] text-text-tertiary">{redoCount}</span>
        )}
      </AppButton>

      {/* Divider */}
      {(onReset || onSave) && <div className="w-px h-4 bg-border mx-1" />}

      {/* Reset button */}
      {onReset && (
        <AppButton
          variant="ghost"
          size={buttonSize}
          onClick={onReset}
          disabled={!isDirty || disabled}
          title="Reset to defaults"
          aria-label="Reset to defaults"
        >
          <RotateCcw className={iconSize} />
          {showLabels && <span className="ml-1">Reset</span>}
        </AppButton>
      )}

      {/* Save button / indicator */}
      {onSave && (
        <AppButton
          variant={isDirty ? 'primary' : 'ghost'}
          size={buttonSize}
          onClick={onSave}
          disabled={!isDirty || disabled || isSavePending}
          title={isSavePending ? 'Saving...' : isDirty ? 'Save changes' : 'All changes saved'}
          aria-label="Save"
        >
          {isSavePending ? (
            <Loader2 className={`${iconSize} animate-spin`} />
          ) : isDirty ? (
            <Save className={iconSize} />
          ) : (
            <Check className={iconSize} />
          )}
          {showLabels && (
            <span className="ml-1">
              {isSavePending ? 'Saving...' : isDirty ? 'Save' : 'Saved'}
            </span>
          )}
        </AppButton>
      )}

      {/* Save status */}
      {!compact && lastSaveTime && !isSavePending && (
        <span className="text-[10px] text-text-tertiary ml-1">
          Saved {formatSaveTime(lastSaveTime)}
        </span>
      )}

      {/* Auto-save pending indicator */}
      {!compact && isSavePending && (
        <span className="flex items-center text-[10px] text-text-tertiary ml-1">
          <Loader2 className="w-3 h-3 animate-spin mr-1" />
          Saving...
        </span>
      )}
    </div>
  );
};

export default UndoRedoControls;
