/**
 * UpgradeModal Component
 *
 * Modal for upgrading subscription plan.
 * Shows plan comparison cards and handles checkout.
 * Feature: 006-user-profile-sidebar
 */

import React, { useState } from 'react';
import { X, CreditCard, Loader2, AlertCircle } from 'lucide-react';

import { useSubscription, usePlans } from '../../hooks/useSubscription';
import { AppButton } from '../ui/AppButton';
import { PlanComparisonCard } from './PlanComparisonCard';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * UpgradeModal - Plan selection and checkout modal
 */
export const UpgradeModal: React.FC<UpgradeModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { subscription, createCheckout, isCheckingOut } = useSubscription();
  const { plans, loading: loadingPlans, error: plansError } = usePlans();

  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('annual');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Handle checkout
  const handleCheckout = async () => {
    if (!selectedPlan || !subscription) return;

    setCheckoutError(null);

    try {
      await createCheckout({
        plan_id: selectedPlan,
        billing_cycle: billingPeriod,
        success_url: `${window.location.origin}/settings/subscription?checkout=success`,
        cancel_url: `${window.location.origin}/settings/subscription?checkout=cancel`,
      });
      // Redirect happens in the hook
    } catch (error) {
      setCheckoutError(
        error instanceof Error ? error.message : 'Failed to start checkout'
      );
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
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const currentPlanCode = subscription?.plan.code;

  // Sort plans by price (free first, then by price)
  const sortedPlans = [...plans].sort((a, b) => {
    if (a.code === 'free') return -1;
    if (b.code === 'free') return 1;
    return a.price_monthly - b.price_monthly;
  });

  // Determine recommended plan (next tier up or professional)
  const getRecommendedPlan = () => {
    if (!currentPlanCode) return 'professional';
    const currentIndex = sortedPlans.findIndex((p) => p.code === currentPlanCode);
    if (currentIndex < sortedPlans.length - 1) {
      return sortedPlans[currentIndex + 1]?.code;
    }
    return null;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-5xl max-h-[90vh] mx-4 bg-surface rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 id="upgrade-modal-title" className="text-xl font-semibold text-text-primary">
              Upgrade Your Plan
            </h2>
            <p className="text-sm text-text-secondary mt-0.5">
              Choose the plan that works best for you
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Billing Toggle */}
        <div className="flex items-center justify-center gap-3 py-4 border-b border-border bg-surface-hover/30">
          <span className={`text-sm font-medium ${billingPeriod === 'monthly' ? 'text-text-primary' : 'text-text-tertiary'}`}>
            Monthly
          </span>
          <button
            onClick={() => setBillingPeriod(billingPeriod === 'monthly' ? 'annual' : 'monthly')}
            className={`
              relative w-14 h-7 rounded-full transition-colors duration-200
              ${billingPeriod === 'annual' ? 'bg-primary' : 'bg-border'}
            `}
            aria-pressed={billingPeriod === 'annual'}
            aria-label={`Switch to ${billingPeriod === 'monthly' ? 'annual' : 'monthly'} billing`}
          >
            <span
              className={`
                absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200
                ${billingPeriod === 'annual' ? 'translate-x-7' : 'translate-x-0'}
              `}
            />
          </button>
          <span className={`text-sm font-medium ${billingPeriod === 'annual' ? 'text-text-primary' : 'text-text-tertiary'}`}>
            Annual
            <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-success/10 text-success rounded-full">
              Save up to 20%
            </span>
          </span>
        </div>

        {/* Plans Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loadingPlans ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="ml-3 text-text-secondary">Loading plans...</span>
            </div>
          ) : plansError ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="w-12 h-12 text-error mb-4" />
              <h3 className="text-lg font-medium text-text-primary mb-2">
                Failed to load plans
              </h3>
              <p className="text-text-secondary mb-4">
                {plansError instanceof Error ? plansError.message : 'Please try again'}
              </p>
              <AppButton variant="outline" onClick={() => window.location.reload()}>
                Retry
              </AppButton>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {sortedPlans.map((plan) => (
                <PlanComparisonCard
                  key={plan.plan_id}
                  plan={plan}
                  isCurrentPlan={plan.code === currentPlanCode}
                  isRecommended={plan.code === getRecommendedPlan()}
                  isSelected={plan.code === selectedPlan}
                  onSelect={setSelectedPlan}
                  billingPeriod={billingPeriod}
                  disabled={isCheckingOut}
                />
              ))}
            </div>
          )}

          {/* Checkout Error */}
          {checkoutError && (
            <div className="mt-4 p-4 bg-error/10 border border-error/20 rounded-xl">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-error flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-error">Checkout Error</p>
                  <p className="text-sm text-error/80 mt-0.5">{checkoutError}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-surface-hover/30">
          <p className="text-sm text-text-tertiary">
            All plans include 24/7 support and secure cloud storage.
          </p>
          <div className="flex items-center gap-3">
            <AppButton variant="outline" onClick={onClose} disabled={isCheckingOut}>
              Cancel
            </AppButton>
            <AppButton
              variant="primary"
              onClick={handleCheckout}
              disabled={!selectedPlan || selectedPlan === currentPlanCode || isCheckingOut}
            >
              {isCheckingOut ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard size={16} className="mr-2" />
                  Continue to Checkout
                </>
              )}
            </AppButton>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpgradeModal;
