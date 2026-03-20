/**
 * SubGalleryPermissionBadge Component
 * Shows permission inheritance status with override toggle
 */

import React, { useState } from 'react';
import { Link2, Unlock } from 'lucide-react';

export interface SubGalleryPermissionBadgeProps {
  subGalleryId: string;
  parentGalleryId: string;
  inheritsPermissions: boolean;
  onToggleOverride: (subGalleryId: string, override: boolean) => void;
}

export const SubGalleryPermissionBadge: React.FC<SubGalleryPermissionBadgeProps> = ({
  subGalleryId,
  inheritsPermissions,
  onToggleOverride,
}) => {
  const [showConfirmation, setShowConfirmation] = useState(false);

  const handleToggleClick = () => {
    setShowConfirmation(true);
  };

  const handleConfirm = () => {
    onToggleOverride(subGalleryId, !inheritsPermissions ? false : true);
    setShowConfirmation(false);
  };

  const handleCancel = () => {
    setShowConfirmation(false);
  };

  return (
    <div className="flex items-center gap-3">
      {/* Badge */}
      {inheritsPermissions ? (
        <span
          data-permission-badge
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200"
        >
          <Link2 size={12} />
          Inherits from parent
        </span>
      ) : (
        <span
          data-permission-badge
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200"
        >
          <Unlock size={12} />
          Custom permissions
        </span>
      )}

      {/* Toggle Switch */}
      <label className="relative inline-flex items-center gap-2 cursor-pointer">
        <button
          role="switch"
          aria-checked={!inheritsPermissions}
          aria-label="Override permissions"
          onClick={handleToggleClick}
          className={`
            relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent
            transition-colors duration-200 ease-in-out
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
            ${!inheritsPermissions ? 'bg-primary' : 'bg-gray-300'}
          `}
        >
          <span
            className={`
              pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm
              ring-0 transition duration-200 ease-in-out
              ${!inheritsPermissions ? 'translate-x-4' : 'translate-x-0'}
            `}
          />
        </button>
        <span className="text-xs text-text-secondary">Override</span>
      </label>

      {/* Confirmation Popup */}
      {showConfirmation && (
        <div className="absolute z-50 mt-1 p-3 bg-surface border border-border rounded-lg shadow-lg max-w-xs">
          <p className="text-sm text-text-primary mb-3">
            {inheritsPermissions
              ? 'This sub-gallery will use its own access settings'
              : 'This sub-gallery will use parent gallery settings'}
          </p>
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={handleCancel}
              className="px-3 py-1 text-xs font-medium text-text-secondary hover:text-text-primary border border-border rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="px-3 py-1 text-xs font-medium text-white bg-primary hover:bg-primary/90 rounded transition-colors"
            >
              Confirm
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
