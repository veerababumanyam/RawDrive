/**
 * CommunicationLogger Component
 *
 * Modal dialog for logging client communications with follow-up tracking.
 * Supports email, phone, WhatsApp, SMS, and in-person interactions.
 */

import React, { useState, useEffect } from 'react';
import {
  Mail,
  Phone,
  MessageCircle,
  MessageSquare,
  Users,
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  Clock,
} from 'lucide-react';
import { format, addDays } from 'date-fns';
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
import type {
  LogCommunicationRequest,
  CommunicationType,
  CommunicationDirection,
} from '../../../types/client';

/* =============================================================================
   Types
   ============================================================================= */

interface CommunicationLoggerProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal closes */
  onClose: () => void;
  /** Workspace ID */
  workspaceId: string;
  /** Client ID */
  clientId: string;
  /** Callback after successful logging */
  onCommunicationLogged?: () => void;
  /** Pre-selected communication type (optional) */
  defaultType?: CommunicationType;
  /** Pre-selected direction (optional) */
  defaultDirection?: CommunicationDirection;
}

interface CommunicationTypeOption {
  value: CommunicationType;
  label: string;
  icon: React.ElementType;
  color: string;
  hasSubject?: boolean;
  hasDuration?: boolean;
}

/* =============================================================================
   Communication Type Configuration
   ============================================================================= */

const COMMUNICATION_TYPES: CommunicationTypeOption[] = [
  {
    value: 'email',
    label: 'Email',
    icon: Mail,
    color: 'text-purple-600',
    hasSubject: true,
  },
  {
    value: 'phone',
    label: 'Phone Call',
    icon: Phone,
    color: 'text-green-600',
    hasDuration: true,
  },
  {
    value: 'whatsapp',
    label: 'WhatsApp',
    icon: MessageCircle,
    color: 'text-emerald-600',
  },
  {
    value: 'sms',
    label: 'SMS',
    icon: MessageSquare,
    color: 'text-blue-600',
  },
  {
    value: 'in_person',
    label: 'In Person',
    icon: Users,
    color: 'text-orange-600',
    hasDuration: true,
  },
  {
    value: 'other',
    label: 'Other',
    icon: MessageSquare,
    color: 'text-gray-600',
  },
];

/* =============================================================================
   CommunicationLogger Component
   ============================================================================= */

export const CommunicationLogger: React.FC<CommunicationLoggerProps> = ({
  isOpen,
  onClose,
  workspaceId,
  clientId,
  onCommunicationLogged,
  defaultType = 'email',
  defaultDirection = 'outbound',
}) => {
  const { addToast } = useToast();

  // Form state
  const [communicationType, setCommunicationType] = useState<CommunicationType>(defaultType);
  const [direction, setDirection] = useState<CommunicationDirection>(defaultDirection);
  const [subject, setSubject] = useState('');
  const [notes, setNotes] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [followUpDate, setFollowUpDate] = useState(
    format(addDays(new Date(), 7), 'yyyy-MM-dd') // Default: 1 week from now
  );

  // UI state
  const [loading, setLoading] = useState(false);

  // Reset form when modal opens/closes or defaults change
  useEffect(() => {
    if (isOpen) {
      setCommunicationType(defaultType);
      setDirection(defaultDirection);
      setSubject('');
      setNotes('');
      setDurationMinutes('');
      setFollowUpRequired(false);
      setFollowUpDate(format(addDays(new Date(), 7), 'yyyy-MM-dd'));
    }
  }, [isOpen, defaultType, defaultDirection]);

  // Get current communication type config
  const currentTypeConfig = COMMUNICATION_TYPES.find((t) => t.value === communicationType);
  const Icon = currentTypeConfig?.icon || MessageSquare;

  // Validate form
  const isFormValid = notes.trim().length > 0;

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isFormValid) {
      addToast({
        variant: 'error',
        message: 'Please provide notes or details about the communication',
      });
      return;
    }

    setLoading(true);

    try {
      // Build request payload
      const payload: LogCommunicationRequest = {
        communication_type: communicationType,
        direction: direction,
        notes: notes.trim(),
      };

      // Add optional fields
      if (currentTypeConfig?.hasSubject && subject.trim()) {
        payload.subject = subject.trim();
      }

      if (currentTypeConfig?.hasDuration && durationMinutes) {
        const duration = parseInt(durationMinutes, 10);
        if (!isNaN(duration) && duration > 0) {
          payload.duration_minutes = duration;
        }
      }

      if (followUpRequired) {
        payload.follow_up_required = true;
        // Convert date string to ISO datetime string for backend
        // Backend expects datetime, not just date
        const followUpDateTime = new Date(followUpDate);
        followUpDateTime.setHours(0, 0, 0, 0); // Set to start of day
        payload.follow_up_date = followUpDateTime.toISOString();
      }

      // Submit communication
      await clientService.logCommunication(workspaceId, clientId, payload);

      addToast({
        variant: 'success',
        message: 'Communication logged successfully',
      });

      // Close modal and trigger callback
      onClose();
      onCommunicationLogged?.();
    } catch (error) {
      addToast({
        variant: 'error',
        message: error instanceof Error ? error.message : 'Failed to log communication',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <form onSubmit={handleSubmit}>
        <ModalHeader>
          <ModalTitle>Log Communication</ModalTitle>
        </ModalHeader>

        <ModalBody>
          <div className="space-y-4">
            {/* Communication Type */}
            <div>
              <label htmlFor="comm-type" className="block text-sm font-medium text-text-secondary mb-2">
                Type <span className="text-error">*</span>
              </label>
              <select
                id="comm-type"
                value={communicationType}
                onChange={(e) => setCommunicationType(e.target.value as CommunicationType)}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                required
              >
                {COMMUNICATION_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Direction */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Direction <span className="text-error">*</span>
              </label>
              <div className="flex space-x-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="direction"
                    value="outbound"
                    checked={direction === 'outbound'}
                    onChange={(e) => setDirection(e.target.value as CommunicationDirection)}
                    className="w-4 h-4 text-primary focus:ring-primary/50"
                  />
                  <ArrowUpRight className="h-4 w-4 text-purple-500" />
                  <span className="text-sm text-text-secondary">Outbound (I contacted them)</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="direction"
                    value="inbound"
                    checked={direction === 'inbound'}
                    onChange={(e) => setDirection(e.target.value as CommunicationDirection)}
                    className="w-4 h-4 text-primary focus:ring-primary/50"
                  />
                  <ArrowDownLeft className="h-4 w-4 text-info" />
                  <span className="text-sm text-text-secondary">Inbound (They contacted me)</span>
                </label>
              </div>
            </div>

            {/* Subject (conditional) */}
            {currentTypeConfig?.hasSubject && (
              <div>
                <AppInput
                  type="text"
                  label="Subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email subject line"
                />
              </div>
            )}

            {/* Notes */}
            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-text-secondary mb-2">
                Notes / Details <span className="text-error">*</span>
              </label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Describe what was discussed, agreed upon, or next steps..."
                rows={5}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none"
                required
              />
              <p className="text-xs text-text-tertiary mt-1">{notes.length} characters</p>
            </div>

            {/* Duration (conditional) */}
            {currentTypeConfig?.hasDuration && (
              <div>
                <AppInput
                  type="number"
                  label="Duration (minutes)"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  placeholder="15"
                  min="1"
                  leftIcon={<Clock className="h-4 w-4" />}
                />
              </div>
            )}

            {/* Follow-up Section */}
            <div className="border-t border-border pt-4">
              <div className="flex items-center space-x-2 mb-3">
                <Calendar className="h-4 w-4 text-text-tertiary" />
                <h4 className="text-sm font-medium text-text-secondary">Follow-up</h4>
              </div>

              {/* Follow-up Toggle */}
              <label className="flex items-center space-x-3 cursor-pointer mb-3">
                <input
                  type="checkbox"
                  checked={followUpRequired}
                  onChange={(e) => setFollowUpRequired(e.target.checked)}
                  className="w-4 h-4 text-primary rounded focus:ring-primary/50"
                />
                <span className="text-sm text-text-secondary">Requires follow-up</span>
              </label>

              {/* Follow-up Date (conditional) */}
              {followUpRequired && (
                <div className="pl-7">
                  <DatePicker
                    label="Follow-up Date"
                    value={followUpDate}
                    onChange={setFollowUpDate}
                    placeholder="Select date"
                    minDate={new Date()}
                  />
                  <p className="text-xs text-text-tertiary mt-1">
                    You'll be reminded to follow up on this date
                  </p>
                </div>
              )}
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
            Log Communication
          </AppButton>
        </ModalFooter>
      </form>
    </Modal>
  );
};
