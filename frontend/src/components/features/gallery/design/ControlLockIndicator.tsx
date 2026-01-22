/**
 * ControlLockIndicator - Display design section lock status
 *
 * Shows an overlay with lock icon and owner info when a design section
 * is locked by another user.
 */

import React from 'react';
import { LockIcon } from 'lucide-react';

interface ControlLockIndicatorProps {
  isLocked: boolean;
  lockedByUser?: string;
  section?: string;
  className?: string;
}

/**
 * Indicator displayed when a control section is locked
 */
export const ControlLockIndicator: React.FC<ControlLockIndicatorProps> = ({
  isLocked,
  lockedByUser,
  section,
  className = '',
}) => {
  if (!isLocked) {
    return null;
  }

  const sectionLabel = section
    ? section.charAt(0).toUpperCase() + section.slice(1).replace(/_/g, ' ')
    : 'This section';

  return (
    <div
      className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-black/30 backdrop-blur-sm ${className}`}
    >
      <div className="flex flex-col items-center gap-2 rounded-lg bg-white/95 px-4 py-3 shadow-lg">
        <LockIcon className="h-5 w-5 text-gray-700" />
        <div className="text-center text-sm">
          <p className="font-medium text-gray-900">{sectionLabel} is locked</p>
          {lockedByUser && <p className="text-xs text-gray-600">by {lockedByUser}</p>}
        </div>
      </div>
    </div>
  );
};

/**
 * Wrapper for control panel sections that can be locked
 */
interface LockableControlSectionProps {
  isLocked: boolean;
  lockedByUser?: string;
  section?: string;
  children: React.ReactNode;
  className?: string;
}

export const LockableControlSection: React.FC<LockableControlSectionProps> = ({
  isLocked,
  lockedByUser,
  section,
  children,
  className = '',
}) => {
  return (
    <div className={`relative ${className}`}>
      {isLocked && (
        <div className="pointer-events-none absolute inset-0 z-50 rounded-lg bg-black/10" />
      )}

      <div className={isLocked ? 'pointer-events-none opacity-50' : ''}>
        {children}
      </div>

      <ControlLockIndicator
        isLocked={isLocked}
        lockedByUser={lockedByUser}
        section={section}
        className="z-50"
      />
    </div>
  );
};
