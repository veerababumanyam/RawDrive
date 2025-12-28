/**
 * PlanCard Component
 *
 * Displays current subscription plan details with status indicators.
 * Shows plan name, pricing, billing period, and subscription status.
 * Feature: 006-user-profile-sidebar
 */

import React from 'react';
import {
  Crown,
  Calendar,
  CreditCard,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  Zap,
} from 'lucide-react';

import type { SubscriptionStatus } from '../../services/subscriptionService';

interface PlanCardProps {
  subscription: SubscriptionStatus;
  onUpgrade?: () => void;
  onManage?: () => void;
  className?: string;
}

interface StatusBadgeProps {
  status: SubscriptionStatus['status'];
  isTrial?: boolean;
  cancelAtPeriodEnd?: boolean;
}

/**
 * Format currency for display
 */
function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format date for display
 */
function formatDate(dateString: string | null): string {
  if (!dateString) return 'N/A';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(dateString));
}

/**
 * Status badge with appropriate styling
 */
const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  isTrial = false,
  cancelAtPeriodEnd = false,
}) => {
  const getStatusConfig = () => {
    if (cancelAtPeriodEnd) {
      return {
        label: 'Canceling',
        icon: <Clock size={14} />,
        className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
      };
    }

    if (isTrial) {
      return {
        label: 'Trial',
        icon: <Zap size={14} />,
        className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
      };
    }

    switch (status) {
      case 'active':
        return {
          label: 'Active',
          icon: <CheckCircle size={14} />,
          className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
        };
      case 'trialing':
        return {
          label: 'Trial',
          icon: <Zap size={14} />,
          className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
        };
      case 'past_due':
        return {
          label: 'Past Due',
          icon: <AlertCircle size={14} />,
          className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
        };
      case 'canceled':
        return {
          label: 'Canceled',
          icon: <XCircle size={14} />,
          className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
        };
      case 'expired':
        return {
          label: 'Expired',
          icon: <XCircle size={14} />,
          className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
        };
      default:
        return {
          label: status,
          icon: null,
          className: 'bg-gray-100 text-gray-800',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.className}`}
    >
      {config.icon}
      {config.label}
    </span>
  );
};

/**
 * Plan feature list item
 */
const PlanFeature: React.FC<{ feature: string; included: boolean }> = ({
  feature,
  included,
}) => (
  <li className="flex items-center gap-2 text-sm">
    {included ? (
      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
    ) : (
      <XCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />
    )}
    <span className={included ? 'text-text-primary' : 'text-text-tertiary line-through'}>
      {feature}
    </span>
  </li>
);

/**
 * Get readable feature names from plan features
 */
function getFeatureLabels(features: Record<string, boolean>): Array<{ name: string; included: boolean }> {
  const featureMap: Record<string, string> = {
    custom_branding: 'Custom Branding',
    remove_watermark: 'Remove Watermark',
    priority_support: 'Priority Support',
    advanced_analytics: 'Advanced Analytics',
    api_access: 'API Access',
    white_label: 'White Label',
    sso_integration: 'SSO Integration',
    dedicated_account: 'Dedicated Account Manager',
  };

  return Object.entries(features).map(([key, included]) => ({
    name: featureMap[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    included,
  }));
}

/**
 * PlanCard - Displays subscription plan information
 */
export const PlanCard: React.FC<PlanCardProps> = ({
  subscription,
  onUpgrade,
  onManage,
  className = '',
}) => {
  const { plan, status, is_trial, trial_days_remaining, cancel_at_period_end } = subscription;
  const isPaid = plan.code !== 'free';
  const features = getFeatureLabels(plan.features);

  return (
    <section
      className={`glass-card glass-card-hover rounded-2xl p-4 sm:p-6 ${className}`}
      aria-labelledby="plan-heading"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-start gap-4">
          <div
            className={`icon-container icon-container-lg rounded-xl shadow-lg ${
              isPaid ? 'icon-container-gold' : 'icon-container-primary'
            }`}
          >
            <Crown size={22} />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 id="plan-heading" className="text-lg font-semibold text-text-primary">
                {plan.name}
              </h2>
              <StatusBadge
                status={status}
                isTrial={is_trial}
                cancelAtPeriodEnd={cancel_at_period_end}
              />
            </div>
            <p className="text-sm text-text-secondary mt-0.5">
              {isPaid
                ? `${formatCurrency(plan.price_monthly, plan.currency)}/month`
                : 'Free forever'}
            </p>
          </div>
        </div>

        {/* Action button */}
        {!isPaid && onUpgrade && (
          <button
            onClick={onUpgrade}
            className="btn-gold px-4 py-2 text-sm font-medium rounded-lg shadow-lg hover:shadow-xl transition-all"
          >
            Upgrade
          </button>
        )}
        {isPaid && onManage && (
          <button
            onClick={onManage}
            className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary bg-surface-hover hover:bg-border/50 rounded-lg transition-colors"
          >
            Manage
          </button>
        )}
      </div>

      {/* Trial indicator */}
      {is_trial && trial_days_remaining !== null && (
        <div className="mb-6 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <div>
              <p className="text-sm font-medium text-purple-800 dark:text-purple-200">
                {trial_days_remaining} days remaining in trial
              </p>
              <p className="text-xs text-purple-600 dark:text-purple-300 mt-0.5">
                Upgrade before your trial ends to keep all features
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation warning */}
      {cancel_at_period_end && (
        <div className="mb-6 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Your subscription will cancel at the end of the billing period
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-300 mt-0.5">
                Ends on {formatDate(subscription.current_period_end)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Billing period */}
      {isPaid && subscription.current_period_start && subscription.current_period_end && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="flex items-center gap-3 p-3 bg-surface-hover rounded-xl">
            <Calendar className="w-5 h-5 text-text-tertiary" />
            <div>
              <p className="text-xs text-text-tertiary">Current Period</p>
              <p className="text-sm font-medium text-text-primary">
                {formatDate(subscription.current_period_start)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-surface-hover rounded-xl">
            <CreditCard className="w-5 h-5 text-text-tertiary" />
            <div>
              <p className="text-xs text-text-tertiary">Next Billing</p>
              <p className="text-sm font-medium text-text-primary">
                {cancel_at_period_end ? 'N/A' : formatDate(subscription.current_period_end)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Plan features */}
      {features.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-text-secondary mb-3">Plan Features</h3>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {features.map(({ name, included }) => (
              <PlanFeature key={name} feature={name} included={included} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

export default PlanCard;
