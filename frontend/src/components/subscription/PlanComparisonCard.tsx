/**
 * PlanComparisonCard Component
 *
 * Displays a single plan in the upgrade modal with features and pricing.
 * Highlights recommended plan and current plan.
 * Feature: 006-user-profile-sidebar
 */

import React from 'react';
import { Check, Star, Zap } from 'lucide-react';

import type { Plan } from '../../services/subscriptionService';
import { AppButton } from '../ui/AppButton';

interface PlanComparisonCardProps {
  plan: Plan;
  isCurrentPlan?: boolean;
  isRecommended?: boolean;
  isSelected?: boolean;
  onSelect: (planCode: string) => void;
  billingPeriod: 'monthly' | 'annual';
  disabled?: boolean;
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
 * Format price for display
 */
function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * PlanComparisonCard - Individual plan option in upgrade modal
 */
export const PlanComparisonCard: React.FC<PlanComparisonCardProps> = ({
  plan,
  isCurrentPlan = false,
  isRecommended = false,
  isSelected = false,
  onSelect,
  billingPeriod,
  disabled = false,
}) => {
  const price = billingPeriod === 'annual' && plan.price_annual
    ? plan.price_annual / 12
    : plan.price_monthly;

  const annualSavings = plan.price_annual
    ? Math.round((1 - (plan.price_annual / (plan.price_monthly * 12))) * 100)
    : 0;

  const isFreePlan = plan.code === 'free';

  // Feature list based on plan
  const features = [
    { label: `${formatStorage(plan.storage_bytes)} Storage`, included: true },
    { label: `${plan.max_galleries} Galleries`, included: true },
    { label: `${plan.max_clients} Clients`, included: true },
    { label: `${plan.max_team_members} Team Members`, included: true },
    { label: `${plan.ai_credits_monthly} AI Credits/mo`, included: true },
    // Feature flags from plan.features
    ...(plan.features.priority_support ? [{ label: 'Priority Support', included: true }] : []),
    ...(plan.features.custom_branding ? [{ label: 'Custom Branding', included: true }] : []),
    ...(plan.features.api_access ? [{ label: 'API Access', included: true }] : []),
    ...(plan.features.white_label ? [{ label: 'White Label', included: true }] : []),
  ];

  return (
    <div
      className={`
        relative flex flex-col rounded-2xl border-2 p-5 transition-all duration-200
        ${isRecommended
          ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
          : isSelected
            ? 'border-accent bg-accent/5'
            : 'border-border bg-surface hover:border-border-hover'
        }
        ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
      `}
      onClick={() => !disabled && !isCurrentPlan && onSelect(plan.code)}
      role="button"
      tabIndex={disabled || isCurrentPlan ? -1 : 0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!disabled && !isCurrentPlan) onSelect(plan.code);
        }
      }}
      aria-selected={isSelected}
      aria-disabled={disabled || isCurrentPlan}
    >
      {/* Recommended Badge */}
      {isRecommended && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-primary text-white text-xs font-semibold rounded-full shadow-lg">
            <Star size={12} className="fill-current" />
            Recommended
          </span>
        </div>
      )}

      {/* Current Plan Badge */}
      {isCurrentPlan && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-text-secondary text-white text-xs font-semibold rounded-full">
            Current Plan
          </span>
        </div>
      )}

      {/* Plan Header */}
      <div className="text-center mb-4 pt-2">
        <h3 className="text-xl font-bold text-text-primary">{plan.name}</h3>
        <div className="mt-2">
          {isFreePlan ? (
            <span className="text-3xl font-bold text-text-primary">Free</span>
          ) : (
            <>
              <span className="text-3xl font-bold text-text-primary">
                {formatPrice(price, plan.currency)}
              </span>
              <span className="text-text-secondary">/mo</span>
              {billingPeriod === 'annual' && annualSavings > 0 && (
                <span className="ml-2 text-sm text-success font-medium">
                  Save {annualSavings}%
                </span>
              )}
            </>
          )}
        </div>
        {billingPeriod === 'annual' && plan.price_annual && (
          <p className="text-sm text-text-tertiary mt-1">
            Billed {formatPrice(plan.price_annual, plan.currency)} annually
          </p>
        )}
      </div>

      {/* Features List */}
      <ul className="flex-1 space-y-2.5 mb-5">
        {features.map((feature, index) => (
          <li key={index} className="flex items-center gap-2">
            <div className={`
              w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0
              ${feature.included ? 'bg-success/10 text-success' : 'bg-border/50 text-text-tertiary'}
            `}>
              <Check size={12} strokeWidth={3} />
            </div>
            <span className={`text-sm ${feature.included ? 'text-text-primary' : 'text-text-tertiary line-through'}`}>
              {feature.label}
            </span>
          </li>
        ))}
      </ul>

      {/* Action Button */}
      <AppButton
        variant={isRecommended ? 'primary' : isSelected ? 'secondary' : 'outline'}
        className="w-full"
        disabled={disabled || isCurrentPlan}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled && !isCurrentPlan) onSelect(plan.code);
        }}
      >
        {isCurrentPlan ? (
          'Current Plan'
        ) : isSelected ? (
          <>
            <Check size={16} className="mr-1.5" />
            Selected
          </>
        ) : (
          <>
            <Zap size={16} className="mr-1.5" />
            {isFreePlan ? 'Downgrade' : 'Upgrade'}
          </>
        )}
      </AppButton>
    </div>
  );
};

export default PlanComparisonCard;
