/**
 * ProfileStatusBar Component
 *
 * A compact status bar showing profile completeness percentage.
 * Clicking opens a modal with details about missing fields.
 */

import React, { useState, useMemo } from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { ProfileCompletenessDetails } from './ProfileCompletenessDetails';
import {
  getPersonalProfileCompleteness,
  getCompanyProfileCompleteness,
  getCompletenessStatusColor,
  type ProfileSection,
  type MissingField,
} from '../../utils/profileCompleteness';
import type { PersonalProfile } from '../../types/personalProfile';
import type { CompanyProfile } from '../../types/companyProfile';

export interface ProfileStatusBarProps {
  /** Personal profile data */
  personalProfile?: Partial<PersonalProfile> | null;
  /** Company profile data */
  companyProfile?: Partial<CompanyProfile> | null;
  /** Section to show (affects which fields are tracked) */
  section?: ProfileSection;
  /** Callback when user clicks "Edit" in the details modal */
  onNavigate?: (section: ProfileSection) => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Compact status bar showing profile completeness
 */
export const ProfileStatusBar: React.FC<ProfileStatusBarProps> = ({
  personalProfile,
  companyProfile,
  section,
  onNavigate,
  className = '',
}) => {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // Calculate completeness based on section
  const completenessData = useMemo(() => {
    if (section === 'personal') {
      return getPersonalProfileCompleteness(personalProfile);
    }
    if (section === 'company') {
      return getCompanyProfileCompleteness(companyProfile);
    }
    // Combined view - calculate both
    const personalResult = getPersonalProfileCompleteness(personalProfile);
    const companyResult = getCompanyProfileCompleteness(companyProfile);

    return {
      percent: Math.round(
        ((personalResult.completedCount + companyResult.completedCount) /
          (personalResult.totalCount + companyResult.totalCount)) *
          100
      ),
      completedCount: personalResult.completedCount + companyResult.completedCount,
      totalCount: personalResult.totalCount + companyResult.totalCount,
      missingFields: [...personalResult.missingFields, ...companyResult.missingFields],
    };
  }, [personalProfile, companyProfile, section]);

  const { percent, missingFields, completedCount, totalCount } = completenessData;
  const colors = getCompletenessStatusColor(percent);
  const isComplete = percent >= 100;

  // Build aria label
  const ariaLabel = isComplete
    ? 'Profile complete'
    : `Profile completeness ${percent}%. ${missingFields.length} fields missing. Click for details.`;

  // Handle modal close
  const handleClose = () => {
    setIsDetailsOpen(false);
  };

  // Handle navigate from modal
  const handleNavigate = (targetSection: ProfileSection) => {
    onNavigate?.(targetSection);
    handleClose();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsDetailsOpen(true)}
        className={`
          inline-flex items-center gap-1.5
          px-2.5 py-1
          text-sm font-medium
          rounded-full
          border
          transition-all duration-200
          hover:shadow-sm
          focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-1
          min-h-[28px]
          ${colors.bg}
          ${colors.text}
          ${colors.border}
          ${className}
        `}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
      >
        {isComplete ? (
          <>
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Complete</span>
          </>
        ) : (
          <>
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{percent}%</span>
          </>
        )}
      </button>

      <ProfileCompletenessDetails
        isOpen={isDetailsOpen}
        onClose={handleClose}
        missingFields={missingFields}
        percent={percent}
        completedCount={completedCount}
        totalCount={totalCount}
        onNavigate={handleNavigate}
      />
    </>
  );
};

export default ProfileStatusBar;
