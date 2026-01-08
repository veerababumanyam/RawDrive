/**
 * ActivityRecorder Component
 *
 * Modal dialog for manually logging client activities.
 * Supports various activity types with conditional metadata fields.
 */

import React, { useState, useEffect } from 'react';
import {
  FileText,
  Phone,
  Mail,
  Users,
  CheckCircle,
  Tag,
  Clock,
  Link as LinkIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
} from '../../ui/Modal';
import { AppButton } from '../../ui/AppButton';
import { AppInput } from '../../ui/AppInput';
import { DatePicker } from '../../ui/DatePicker';
import { useToast } from '../../ui/Toast';
import { clientService } from '../../../services/clientService';
import type { RecordActivityRequest, ActivityEntityType } from '../../../types/client';

/* =============================================================================
   Types
   ============================================================================= */

interface ActivityRecorderProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal closes */
  onClose: () => void;
  /** Workspace ID */
  workspaceId: string;
  /** Client ID */
  clientId: string;
  /** Callback after successful activity recording */
  onActivityRecorded?: () => void;
  /** Pre-selected activity type (optional) */
  defaultActivityType?: string;
  /** Pre-filled description (optional) */
  defaultDescription?: string;
}

interface ActivityTypeOption {
  value: string;
  label: string;
  icon: React.ElementType;
  color: string;
  metadataFields?: string[];
}

/* =============================================================================
   Activity Type Configuration
   ============================================================================= */

const ACTIVITY_TYPES: ActivityTypeOption[] = [
  {
    value: 'note',
    label: 'Note',
    icon: FileText,
    color: 'text-blue-600',
  },
  {
    value: 'call',
    label: 'Phone Call',
    icon: Phone,
    color: 'text-green-600',
    metadataFields: ['duration_minutes'],
  },
  {
    value: 'email',
    label: 'Email',
    icon: Mail,
    color: 'text-purple-600',
    metadataFields: ['subject'],
  },
  {
    value: 'meeting',
    label: 'Meeting',
    icon: Users,
    color: 'text-orange-600',
    metadataFields: ['duration_minutes', 'attendees'],
  },
  {
    value: 'video_call',
    label: 'Video Call',
    icon: Users,
    color: 'text-indigo-600',
    metadataFields: ['duration_minutes', 'platform'],
  },
  {
    value: 'status_change',
    label: 'Status Change',
    icon: CheckCircle,
    color: 'text-teal-600',
    metadataFields: ['old_status', 'new_status'],
  },
  {
    value: 'tag_added',
    label: 'Tag Added',
    icon: Tag,
    color: 'text-pink-600',
    metadataFields: ['tag_name'],
  },
];

const ENTITY_TYPES: Array<{ value: ActivityEntityType; label: string }> = [
  { value: 'gallery', label: 'Gallery' },
  { value: 'asset', label: 'Asset' },
  { value: 'payment', label: 'Payment' },
  { value: 'communication', label: 'Communication' },
  { value: 'contact', label: 'Contact' },
  { value: 'address', label: 'Address' },
  { value: 'tag', label: 'Tag' },
  { value: 'note', label: 'Note' },
];

/* =============================================================================
   ActivityRecorder Component
   ============================================================================= */

export const ActivityRecorder: React.FC<ActivityRecorderProps> = ({
  isOpen,
  onClose,
  workspaceId,
  clientId,
  onActivityRecorded,
  defaultActivityType = 'note',
  defaultDescription = '',
}) => {
  const { addToast } = useToast();

  // Form state
  const [activityType, setActivityType] = useState(defaultActivityType);
  const [description, setDescription] = useState(defaultDescription);
  const [activityDate, setActivityDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [relatedEntityType, setRelatedEntityType] = useState<ActivityEntityType | ''>('');
  const [relatedEntityId, setRelatedEntityId] = useState('');

  // Metadata fields (dynamic based on activity type)
  const [metadata, setMetadata] = useState<Record<string, string>>({});

  // UI state
  const [loading, setLoading] = useState(false);

  // Reset form when modal opens/closes or defaults change
  useEffect(() => {
    if (isOpen) {
      setActivityType(defaultActivityType);
      setDescription(defaultDescription);
      setActivityDate(format(new Date(), 'yyyy-MM-dd'));
      setRelatedEntityType('');
      setRelatedEntityId('');
      setMetadata({});
    }
  }, [isOpen, defaultActivityType, defaultDescription]);

  // Get current activity type config
  const currentActivityConfig = ACTIVITY_TYPES.find((t) => t.value === activityType);
  const Icon = currentActivityConfig?.icon || Clock;

  // Validate form
  const isFormValid = activityType && description.trim().length > 0;

  // Handle metadata field change
  const handleMetadataChange = (field: string, value: string) => {
    setMetadata((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isFormValid) {
      addToast({
        variant: 'error',
        message: 'Please fill in all required fields',
      });
      return;
    }

    setLoading(true);

    try {
      // Build request payload
      const payload: RecordActivityRequest = {
        activity_type: activityType,
        description: description.trim(),
        metadata: {
          ...metadata,
          activity_date: activityDate,
        },
      };

      // Add related entity if specified
      if (relatedEntityType && relatedEntityId) {
        payload.related_entity_type = relatedEntityType;
        payload.related_entity_id = relatedEntityId;
      }

      // Submit activity
      await clientService.recordActivity(workspaceId, clientId, payload);

      addToast({
        variant: 'success',
        message: 'Activity recorded successfully',
      });

      // Close modal and trigger callback
      onClose();
      onActivityRecorded?.();
    } catch (error) {
      addToast({
        variant: 'error',
        message: error instanceof Error ? error.message : 'Failed to record activity',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <form onSubmit={handleSubmit}>
        <ModalHeader>
          <ModalTitle>Record Activity</ModalTitle>
        </ModalHeader>

        <ModalBody>
          <div className="space-y-4">
            {/* Activity Type Selector */}
            <div>
              <label htmlFor="activity-type" className="block text-sm font-medium text-gray-700 mb-2">
                Activity Type <span className="text-red-500">*</span>
              </label>
              <select
                id="activity-type"
                value={activityType}
                onChange={(e) => setActivityType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                {ACTIVITY_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Activity Date */}
            <div>
              <DatePicker
                label="Activity Date"
                value={activityDate}
                onChange={setActivityDate}
                placeholder="Select date"
                maxDate={new Date()}
              />
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={`Describe the ${currentActivityConfig?.label.toLowerCase() || 'activity'}...`}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                {description.length} characters
              </p>
            </div>

            {/* Conditional Metadata Fields */}
            {currentActivityConfig?.metadataFields && currentActivityConfig.metadataFields.length > 0 && (
              <div className="space-y-3 p-4 bg-gray-50 rounded-md">
                <h4 className="text-sm font-medium text-gray-700">Additional Details</h4>

                {currentActivityConfig.metadataFields.includes('duration_minutes') && (
                  <div>
                    <AppInput
                      type="number"
                      label="Duration (minutes)"
                      value={metadata.duration_minutes || ''}
                      onChange={(e) => handleMetadataChange('duration_minutes', e.target.value)}
                      placeholder="15"
                      min="1"
                    />
                  </div>
                )}

                {currentActivityConfig.metadataFields.includes('subject') && (
                  <div>
                    <AppInput
                      type="text"
                      label="Email Subject"
                      value={metadata.subject || ''}
                      onChange={(e) => handleMetadataChange('subject', e.target.value)}
                      placeholder="Subject line"
                    />
                  </div>
                )}

                {currentActivityConfig.metadataFields.includes('attendees') && (
                  <div>
                    <AppInput
                      type="text"
                      label="Attendees"
                      value={metadata.attendees || ''}
                      onChange={(e) => handleMetadataChange('attendees', e.target.value)}
                      placeholder="John, Sarah, Mike"
                    />
                  </div>
                )}

                {currentActivityConfig.metadataFields.includes('platform') && (
                  <div>
                    <AppInput
                      type="text"
                      label="Platform"
                      value={metadata.platform || ''}
                      onChange={(e) => handleMetadataChange('platform', e.target.value)}
                      placeholder="Zoom, Google Meet, etc."
                    />
                  </div>
                )}

                {currentActivityConfig.metadataFields.includes('old_status') && (
                  <div className="grid grid-cols-2 gap-3">
                    <AppInput
                      type="text"
                      label="Old Status"
                      value={metadata.old_status || ''}
                      onChange={(e) => handleMetadataChange('old_status', e.target.value)}
                      placeholder="Lead"
                    />
                    <AppInput
                      type="text"
                      label="New Status"
                      value={metadata.new_status || ''}
                      onChange={(e) => handleMetadataChange('new_status', e.target.value)}
                      placeholder="Active"
                    />
                  </div>
                )}

                {currentActivityConfig.metadataFields.includes('tag_name') && (
                  <div>
                    <AppInput
                      type="text"
                      label="Tag Name"
                      value={metadata.tag_name || ''}
                      onChange={(e) => handleMetadataChange('tag_name', e.target.value)}
                      placeholder="VIP Client"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Related Entity (Optional) */}
            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center space-x-2 mb-3">
                <LinkIcon className="h-4 w-4 text-gray-500" />
                <h4 className="text-sm font-medium text-gray-700">Link to Entity (Optional)</h4>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="entity-type" className="block text-xs font-medium text-gray-600 mb-1">
                    Entity Type
                  </label>
                  <select
                    id="entity-type"
                    value={relatedEntityType}
                    onChange={(e) => setRelatedEntityType(e.target.value as ActivityEntityType | '')}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">None</option>
                    {ENTITY_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <AppInput
                    type="text"
                    label="Entity ID"
                    value={relatedEntityId}
                    onChange={(e) => setRelatedEntityId(e.target.value)}
                    placeholder="UUID"
                    disabled={!relatedEntityType}
                    className="text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        </ModalBody>

        <ModalFooter>
          <AppButton variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </AppButton>
          <AppButton
            type="submit"
            variant="primary"
            isLoading={loading}
            disabled={!isFormValid}
            leftIcon={<Icon className="h-4 w-4" />}
          >
            Record Activity
          </AppButton>
        </ModalFooter>
      </form>
    </Modal>
  );
};
