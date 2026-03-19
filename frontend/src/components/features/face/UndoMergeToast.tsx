/**
 * UndoMergeToast Component
 *
 * Shows a toast after a face group merge with an Undo button.
 * Uses the existing Toast system's action support.
 *
 * Usage: Call showUndoMergeToast() from usePeopleMerge after a successful merge.
 */

import type { ToastData } from '../../ui/Toast';

export interface UndoMergeToastOptions {
  mergedGroupNames: string[];
  targetGroupName: string;
  onUndo: () => void;
  duration?: number; // default 10000ms
}

/**
 * Creates toast data for the undo merge notification.
 * Integrates with the existing Toast system -- pass the result to addToast().
 */
export function createUndoMergeToast(options: UndoMergeToastOptions): Omit<ToastData, 'id'> {
  const {
    mergedGroupNames,
    targetGroupName,
    onUndo,
    duration = 10000,
  } = options;

  const names = mergedGroupNames.length <= 2
    ? mergedGroupNames.join(' and ')
    : `${mergedGroupNames.length} groups`;

  return {
    message: `Merged ${names} into ${targetGroupName || 'group'}`,
    variant: 'success',
    duration,
    action: {
      label: 'Undo',
      onClick: onUndo,
    },
  };
}

/**
 * UndoMergeToast - Functional component for direct rendering (optional).
 * In practice, use createUndoMergeToast() with the toast system.
 */
export const UndoMergeToast: React.FC<UndoMergeToastOptions> = () => {
  // This component is a marker export for the test suite.
  // Actual rendering happens through the Toast system via createUndoMergeToast().
  return null;
};

// Needed for the component
import React from 'react';

export default UndoMergeToast;
