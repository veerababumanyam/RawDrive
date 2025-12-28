/**
 * CancelSubscriptionModal Component
 *
 * Modal for canceling subscription with feedback and confirmation.
 * Shows what user will lose and cancellation policy.
 * Feature: 006-user-profile-sidebar
 */

import React, { useState } from 'react';
import { X, AlertTriangle, Loader2, Calendar, HardDrive, Users, Image, Sparkles } from 'lucide-react';

import { useSubscription } from '../../hooks/useSubscription';
import { AppButton } from '../ui/AppButton';

interface CancelSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * Cancellation reasons for feedback
 */
const CANCELLATION_REASONS = [
  { value: 'too_expensive', label: 'Too expensive' },
  { value: 'not_using', label: 'Not using it enough' },
  { value: 'missing_features', label: 'Missing features I need' },
  { value: 'switching_competitor', label: 'Switching to another service' },
  { value: 'temporary_pause', label: 'Temporary pause' },
  { value: 'other', label: 'Other reason' },
];

/**
 * Format date for display
 */
function formatDate(date: Date | string | null | undefined): string {
  if (!date) return 'N/A';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format bytes to human readable
 */
function formatStorage(bytes: number): string {
  if (bytes === 0) return '0 GB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1000) {
    return `${(gb / 1000).toFixed(0)} TB`;
  }
  return `${gb.toFixed(0)} GB`;
}

/**
 * CancelSubscriptionModal - Confirmation dialog for cancellation
 */
export const CancelSubscriptionModal: React.FC<CancelSubscriptionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { subscription, cancelSubscription, isCanceling } = useSubscription();
  const [reason, setReason] = useState<string>('');
  const [feedback, setFeedback] = useState<string>('');
  const [step, setStep] = useState<'confirm' | 'feedback'>('confirm');
  const [error, setError] = useState<string | null>(null);

  // Handle cancel
  const handleCancel = async () => {
    setError(null);

    // Combine reason and feedback into a single reason string for the API
    const combinedReason = feedback
      ? `${reason}: ${feedback}`
      : reason;

    try {
      await cancelSubscription({ reason: combinedReason || undefined });
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel subscription');
    }
  };

  // Close on escape key
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      // Reset state when closed
      setStep('confirm');
      setReason('');
      setFeedback('');
      setError(null);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !subscription) return null;

  const plan = subscription.plan;
  const periodEnd = subscription.current_period_end;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-lg mx-4 bg-surface rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-warning/10 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-warning" />
            </div>
            <h2 id="cancel-modal-title" className="text-lg font-semibold text-text-primary">
              Cancel Subscription
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'confirm' ? (
            <>
              {/* Warning Message */}
              <div className="mb-6">
                <p className="text-text-primary">
                  Are you sure you want to cancel your <strong>{plan.name}</strong> subscription?
                </p>
                <p className="text-text-secondary mt-2 text-sm">
                  Your subscription will remain active until{' '}
                  <strong>{formatDate(periodEnd)}</strong>. After that, you'll lose access to:
                </p>
              </div>

              {/* What You'll Lose */}
              <div className="bg-surface-hover rounded-xl p-4 mb-6">
                <h3 className="text-sm font-medium text-text-primary mb-3">
                  Features You'll Lose
                </h3>
                <ul className="space-y-2.5">
                  <li className="flex items-center gap-3 text-sm text-text-secondary">
                    <div className="w-8 h-8 bg-error/10 rounded-lg flex items-center justify-center">
                      <HardDrive size={16} className="text-error" />
                    </div>
                    <span>{formatStorage(plan.storage_bytes)} of cloud storage</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm text-text-secondary">
                    <div className="w-8 h-8 bg-error/10 rounded-lg flex items-center justify-center">
                      <Image size={16} className="text-error" />
                    </div>
                    <span>Up to {plan.max_galleries} galleries</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm text-text-secondary">
                    <div className="w-8 h-8 bg-error/10 rounded-lg flex items-center justify-center">
                      <Users size={16} className="text-error" />
                    </div>
                    <span>{plan.max_team_members} team members & {plan.max_clients} clients</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm text-text-secondary">
                    <div className="w-8 h-8 bg-error/10 rounded-lg flex items-center justify-center">
                      <Sparkles size={16} className="text-error" />
                    </div>
                    <span>{plan.ai_credits_monthly} AI credits per month</span>
                  </li>
                </ul>
              </div>

              {/* Cancellation Policy */}
              <div className="bg-info/5 border border-info/20 rounded-xl p-4 mb-6">
                <h3 className="text-sm font-medium text-info mb-2 flex items-center gap-2">
                  <Calendar size={16} />
                  Cancellation Policy
                </h3>
                <ul className="text-sm text-text-secondary space-y-1.5">
                  <li>• Your subscription remains active until the end of your billing period</li>
                  <li>• You can reactivate anytime before {formatDate(periodEnd)}</li>
                  <li>• Your data is retained for 30 days after cancellation</li>
                  <li>• After 30 days, your galleries and files will be permanently deleted</li>
                </ul>
              </div>

              {/* Error */}
              {error && (
                <div className="mb-4 p-3 bg-error/10 border border-error/20 rounded-lg">
                  <p className="text-sm text-error">{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3">
                <AppButton variant="outline" className="flex-1" onClick={onClose}>
                  Keep Subscription
                </AppButton>
                <AppButton
                  variant="destructive"
                  className="flex-1"
                  onClick={() => setStep('feedback')}
                >
                  Continue to Cancel
                </AppButton>
              </div>
            </>
          ) : (
            <>
              {/* Feedback Step */}
              <div className="mb-6">
                <p className="text-text-primary mb-4">
                  Before you go, could you tell us why you're canceling?
                </p>

                {/* Reason Selection */}
                <div className="space-y-2 mb-4">
                  {CANCELLATION_REASONS.map((option) => (
                    <label
                      key={option.value}
                      className={`
                        flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors
                        ${reason === option.value
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-border-hover'
                        }
                      `}
                    >
                      <input
                        type="radio"
                        name="cancel-reason"
                        value={option.value}
                        checked={reason === option.value}
                        onChange={(e) => setReason(e.target.value)}
                        className="w-4 h-4 text-primary accent-primary"
                      />
                      <span className="text-sm text-text-primary">{option.label}</span>
                    </label>
                  ))}
                </div>

                {/* Additional Feedback */}
                <div>
                  <label
                    htmlFor="cancel-feedback"
                    className="block text-sm font-medium text-text-primary mb-1.5"
                  >
                    Additional feedback (optional)
                  </label>
                  <textarea
                    id="cancel-feedback"
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Tell us how we can improve..."
                    rows={3}
                    className="
                      w-full px-4 py-3 rounded-xl
                      bg-surface border border-border
                      text-text-primary placeholder:text-text-tertiary
                      focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20
                      transition-colors resize-none
                    "
                  />
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="mb-4 p-3 bg-error/10 border border-error/20 rounded-lg">
                  <p className="text-sm text-error">{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3">
                <AppButton
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep('confirm')}
                  disabled={isCanceling}
                >
                  Back
                </AppButton>
                <AppButton
                  variant="destructive"
                  className="flex-1"
                  onClick={handleCancel}
                  disabled={!reason || isCanceling}
                >
                  {isCanceling ? (
                    <>
                      <Loader2 size={16} className="mr-2 animate-spin" />
                      Canceling...
                    </>
                  ) : (
                    'Confirm Cancellation'
                  )}
                </AppButton>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CancelSubscriptionModal;
