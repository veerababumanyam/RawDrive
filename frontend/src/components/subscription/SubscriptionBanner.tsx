/**
 * SubscriptionBanner Component
 *
 * Displays warning banners for subscription issues:
 * - Trial expiring soon
 * - Payment past due
 * - Subscription scheduled for cancellation
 *
 * Feature: 006-user-profile-sidebar
 */

import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Clock,
  CreditCard,
  X,
} from 'lucide-react';

import { useSubscription } from '../../hooks/useSubscription';
import { AppButton } from '../ui/AppButton';

interface SubscriptionBannerProps {
  /** Hide banner with local storage persistence */
  dismissible?: boolean;
  className?: string;
}

/**
 * Format remaining time in a user-friendly way
 */
function formatTimeRemaining(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `in ${days} days`;
  if (days < 14) return 'in about a week';
  return `in ${Math.ceil(days / 7)} weeks`;
}

/**
 * SubscriptionBanner - Displays subscription warning messages
 */
export const SubscriptionBanner: React.FC<SubscriptionBannerProps> = ({
  dismissible = true,
  className = '',
}) => {
  const { subscription, isTrial, isCanceled, trialDaysRemaining, loading } = useSubscription();
  const [isDismissed, setIsDismissed] = React.useState(false);

  // Check localStorage for dismissal
  React.useEffect(() => {
    if (dismissible) {
      const dismissedKey = `subscription_banner_dismissed_${subscription?.workspace_id}`;
      const dismissedUntil = localStorage.getItem(dismissedKey);
      if (dismissedUntil) {
        const until = new Date(dismissedUntil);
        if (until > new Date()) {
          setIsDismissed(true);
        } else {
          localStorage.removeItem(dismissedKey);
        }
      }
    }
  }, [dismissible, subscription?.workspace_id]);

  // Handle dismiss (snooze for 24 hours)
  const handleDismiss = () => {
    if (dismissible && subscription?.workspace_id) {
      const dismissedKey = `subscription_banner_dismissed_${subscription.workspace_id}`;
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      localStorage.setItem(dismissedKey, tomorrow.toISOString());
      setIsDismissed(true);
    }
  };

  // Don't render while loading or if dismissed
  if (loading || isDismissed || !subscription) {
    return null;
  }

  const status = subscription.status;

  // Check for past_due status
  if (status === 'past_due') {
    return (
      <BannerWrapper
        variant="error"
        icon={<CreditCard size={18} />}
        dismissible={dismissible}
        onDismiss={handleDismiss}
        className={className}
      >
        <div className="flex-1">
          <p className="font-medium">Payment Failed</p>
          <p className="text-sm opacity-90">
            We couldn't process your payment. Please update your payment method to avoid service interruption.
          </p>
        </div>
        <Link to="/settings/subscription">
          <AppButton variant="secondary" size="sm" className="bg-white/20 hover:bg-white/30 border-0 text-white">
            Update Payment
          </AppButton>
        </Link>
      </BannerWrapper>
    );
  }

  // Check for trial expiring soon (7 days or less)
  if (isTrial && trialDaysRemaining !== null && trialDaysRemaining <= 7) {
    return (
      <BannerWrapper
        variant="warning"
        icon={<Clock size={18} />}
        dismissible={dismissible}
        onDismiss={handleDismiss}
        className={className}
      >
        <div className="flex-1">
          <p className="font-medium">
            {trialDaysRemaining === 0
              ? 'Your trial expires today!'
              : `Your trial expires ${formatTimeRemaining(trialDaysRemaining)}`}
          </p>
          <p className="text-sm opacity-90">
            Upgrade now to keep access to all features and your data.
          </p>
        </div>
        <Link to="/settings/subscription">
          <AppButton variant="secondary" size="sm" className="bg-white/20 hover:bg-white/30 border-0">
            Upgrade Now
          </AppButton>
        </Link>
      </BannerWrapper>
    );
  }

  // Check for subscription scheduled for cancellation
  if (isCanceled && subscription.current_period_end) {
    const daysUntilEnd = Math.ceil(
      (new Date(subscription.current_period_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    return (
      <BannerWrapper
        variant="info"
        icon={<AlertTriangle size={18} />}
        dismissible={dismissible}
        onDismiss={handleDismiss}
        className={className}
      >
        <div className="flex-1">
          <p className="font-medium">Subscription Ending</p>
          <p className="text-sm opacity-90">
            Your subscription is set to cancel {formatTimeRemaining(daysUntilEnd)}. You can reactivate anytime before then.
          </p>
        </div>
        <Link to="/settings/subscription">
          <AppButton variant="secondary" size="sm" className="bg-white/20 hover:bg-white/30 border-0">
            Reactivate
          </AppButton>
        </Link>
      </BannerWrapper>
    );
  }

  // No banner to show
  return null;
};

// ---------------------------------------------------------------------------
// Banner Wrapper Component
// ---------------------------------------------------------------------------

interface BannerWrapperProps {
  variant: 'warning' | 'error' | 'info';
  icon: React.ReactNode;
  dismissible: boolean;
  onDismiss: () => void;
  className?: string;
  children: React.ReactNode;
}

const BannerWrapper: React.FC<BannerWrapperProps> = ({
  variant,
  icon,
  dismissible,
  onDismiss,
  className,
  children,
}) => {
  const variantStyles = {
    warning: 'bg-gradient-to-r from-amber-500 to-orange-500 text-white',
    error: 'bg-gradient-to-r from-red-500 to-rose-500 text-white',
    info: 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white',
  };

  return (
    <div
      className={`
        ${variantStyles[variant]}
        py-3 px-4 flex items-center gap-4
        ${className}
      `}
      role="alert"
    >
      <div className="flex-shrink-0 p-1.5 bg-white/20 rounded-lg">
        {icon}
      </div>

      {children}

      {dismissible && (
        <button
          onClick={onDismiss}
          className="flex-shrink-0 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
};

export default SubscriptionBanner;
