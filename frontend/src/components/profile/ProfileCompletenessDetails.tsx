/**
 * ProfileCompletenessDetails Component
 *
 * Modal showing detailed breakdown of profile completeness
 * with missing fields grouped by section and edit actions.
 */

import React from 'react';
import { CheckCircle, AlertCircle, Edit2, User, Building2 } from 'lucide-react';
import { Modal, ModalHeader, ModalTitle, ModalBody } from '../ui/Modal';
import { AppButton } from '../ui/AppButton';
import type { MissingField, ProfileSection } from '../../utils/profileCompleteness';

export interface ProfileCompletenessDetailsProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal should close */
  onClose: () => void;
  /** List of missing fields */
  missingFields: MissingField[];
  /** Completeness percentage (0-100) */
  percent: number;
  /** Number of completed fields */
  completedCount: number;
  /** Total number of tracked fields */
  totalCount: number;
  /** Callback when user clicks "Edit" for a section */
  onNavigate?: (section: ProfileSection) => void;
}

/**
 * Modal showing profile completeness details
 */
export const ProfileCompletenessDetails: React.FC<ProfileCompletenessDetailsProps> = ({
  isOpen,
  onClose,
  missingFields,
  percent,
  completedCount,
  totalCount,
  onNavigate,
}) => {
  // Group missing fields by section
  const personalFields = missingFields.filter((f) => f.section === 'personal');
  const companyFields = missingFields.filter((f) => f.section === 'company');

  const isComplete = percent >= 100;

  // Get progress bar color
  const getProgressColor = () => {
    if (percent >= 100) return 'bg-success';
    if (percent >= 50) return 'bg-warning';
    return 'bg-error';
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" title="Profile Completeness">
      <ModalHeader>
        <ModalTitle>Profile Completeness</ModalTitle>
      </ModalHeader>

      <ModalBody>
        {/* Summary Section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-text-secondary">
              {completedCount} of {totalCount} fields complete
            </span>
            <span
              className={`text-lg font-bold ${
                percent >= 100
                  ? 'text-success'
                  : percent >= 50
                  ? 'text-warning'
                  : 'text-error'
              }`}
            >
              {percent}%
            </span>
          </div>
          <div className="w-full h-2 bg-surface-hover rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${getProgressColor()}`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Complete State */}
        {isComplete && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-success" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-1">
              All Set!
            </h3>
            <p className="text-text-secondary text-sm">
              Your profile is complete. Great job!
            </p>
          </div>
        )}

        {/* Missing Fields */}
        {!isComplete && (
          <div className="space-y-6">
            {/* Personal Profile Fields */}
            {personalFields.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-text-tertiary" />
                    <h4 className="text-sm font-semibold text-text-primary">
                      Personal Profile
                    </h4>
                    <span className="text-xs text-text-tertiary">
                      ({personalFields.length} missing)
                    </span>
                  </div>
                  {onNavigate && (
                    <AppButton
                      variant="ghost"
                      size="sm"
                      onClick={() => onNavigate('personal')}
                      className="text-primary hover:text-primary-hover"
                    >
                      <Edit2 className="w-3.5 h-3.5 mr-1" />
                      Edit
                    </AppButton>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {personalFields.map((field) => (
                    <span
                      key={`${field.section}-${field.key}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-error/10 text-error text-xs font-medium rounded-full"
                    >
                      <AlertCircle className="w-3 h-3" />
                      {field.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Company Profile Fields */}
            {companyFields.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-text-tertiary" />
                    <h4 className="text-sm font-semibold text-text-primary">
                      Company Profile
                    </h4>
                    <span className="text-xs text-text-tertiary">
                      ({companyFields.length} missing)
                    </span>
                  </div>
                  {onNavigate && (
                    <AppButton
                      variant="ghost"
                      size="sm"
                      onClick={() => onNavigate('company')}
                      className="text-primary hover:text-primary-hover"
                    >
                      <Edit2 className="w-3.5 h-3.5 mr-1" />
                      Edit
                    </AppButton>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {companyFields.map((field) => (
                    <span
                      key={`${field.section}-${field.key}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-error/10 text-error text-xs font-medium rounded-full"
                    >
                      <AlertCircle className="w-3 h-3" />
                      {field.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </ModalBody>
    </Modal>
  );
};

export default ProfileCompletenessDetails;
