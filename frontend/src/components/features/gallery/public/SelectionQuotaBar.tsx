/**
 * SelectionQuotaBar
 * Progress bar showing client selection count vs photographer-set quota.
 * Color shifts: blue (<90%), amber (90-99%), red (100%).
 * Hidden when selectionLimit is null (unlimited selections).
 */
import React from 'react';
import { useGalleryInteraction } from '../../../../contexts/GalleryInteractionContext';

export interface SelectionQuotaBarProps {
  className?: string;
}

export const SelectionQuotaBar: React.FC<SelectionQuotaBarProps> = ({
  className = '',
}) => {
  const { selectionCount, selectionLimit, isAtSelectionLimit } =
    useGalleryInteraction();

  if (selectionLimit === null) return null;

  const percentage = Math.min((selectionCount / selectionLimit) * 100, 100);
  const ratio = selectionCount / selectionLimit;

  let barColor = 'bg-blue-500';
  if (ratio >= 1) {
    barColor = 'bg-red-500';
  } else if (ratio >= 0.9) {
    barColor = 'bg-amber-500';
  }

  return (
    <div
      data-testid="selection-quota-bar"
      className={`w-full ${className}`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {isAtSelectionLimit
            ? 'Selection complete!'
            : `${selectionCount} of ${selectionLimit} selected`}
        </span>
      </div>
      <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          data-testid="quota-fill"
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
