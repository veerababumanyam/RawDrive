/**
 * Subscription Settings Page
 *
 * Displays subscription status, usage metrics, and billing management.
 * Includes upgrade modal, cancellation flow, and invoice history.
 * Feature: 006-user-profile-sidebar
 */

import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  RefreshCw,
  CreditCard,
  Receipt,
  FileText,
  XCircle,
  CheckCircle,
} from 'lucide-react';

import { useSubscription, useInvoices } from '../../hooks/useSubscription';
import { useToast } from '../../components/ui';
import { AppButton } from '../../components/ui/AppButton';
import {
  UsageCard,
  PlanCard,
  UpgradeModal,
  CancelSubscriptionModal,
} from '../../components/subscription';

/* =============================================================================
   Skeleton Loading Component
   ============================================================================= */

const SubscriptionSkeleton: React.FC = () => (
  <div className="space-y-6 animate-pulse">
    {/* Plan Card Skeleton */}
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 bg-border/50 rounded-xl" />
        <div className="flex-1">
          <div className="h-6 bg-border/50 rounded w-32 mb-2" />
          <div className="h-4 bg-border/50 rounded w-24" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="h-16 bg-border/50 rounded-xl" />
        <div className="h-16 bg-border/50 rounded-xl" />
      </div>
    </div>

    {/* Usage Card Skeleton */}
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 bg-border/50 rounded-xl" />
        <div className="flex-1">
          <div className="h-6 bg-border/50 rounded w-32 mb-2" />
          <div className="h-4 bg-border/50 rounded w-48" />
        </div>
      </div>
      <div className="space-y-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i}>
            <div className="flex justify-between mb-2">
              <div className="h-4 bg-border/50 rounded w-20" />
              <div className="h-4 bg-border/50 rounded w-24" />
            </div>
            <div className="h-2 bg-border/50 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

/* =============================================================================
   Error State Component
   ============================================================================= */

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

const ErrorState: React.FC<ErrorStateProps> = ({ message, onRetry }) => (
  <div className="glass-card rounded-2xl p-8 text-center">
    <div className="flex justify-center mb-4">
      <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
        <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
      </div>
    </div>
    <h3 className="text-lg font-semibold text-text-primary mb-2">
      Unable to load subscription
    </h3>
    <p className="text-text-secondary mb-6">{message}</p>
    <AppButton variant="outline" onClick={onRetry}>
      <RefreshCw size={16} className="mr-2" />
      Try Again
    </AppButton>
  </div>
);

/* =============================================================================
   Invoice List Component
   ============================================================================= */

const InvoiceList: React.FC = () => {
  const { invoices, loading, error, downloadPdf } = useInvoices({ limit: 5 });
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-border/30 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-6 text-text-secondary">
        <AlertCircle className="w-8 h-8 mx-auto mb-2 text-error" />
        <p>Failed to load invoices</p>
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="text-center py-8 text-text-secondary">
        <Receipt className="w-12 h-12 mx-auto mb-3 text-text-tertiary" />
        <p>No invoices yet</p>
        <p className="text-sm mt-1">Your invoices will appear here after your first payment.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {invoices.map((invoice) => (
        <div
          key={invoice.invoice_id}
          className="flex items-center justify-between p-4 bg-surface-hover rounded-xl"
        >
          <div className="flex items-center gap-3">
            <div className={`
              w-8 h-8 rounded-lg flex items-center justify-center
              ${invoice.status === 'paid'
                ? 'bg-success/10'
                : invoice.status === 'pending'
                  ? 'bg-warning/10'
                  : 'bg-error/10'
              }
            `}>
              {invoice.status === 'paid' ? (
                <CheckCircle size={16} className="text-success" />
              ) : invoice.status === 'pending' ? (
                <Receipt size={16} className="text-warning" />
              ) : (
                <XCircle size={16} className="text-error" />
              )}
            </div>
            <div>
              <p className="font-medium text-text-primary text-sm">
                {invoice.invoice_number}
              </p>
              <p className="text-xs text-text-tertiary">
                {new Date(invoice.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-medium text-text-primary">
              {new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: invoice.currency,
              }).format(invoice.amount)}
            </span>
            {invoice.status === 'paid' && (
              <button
                onClick={() => downloadPdf(invoice.invoice_id)}
                className="p-1.5 rounded-lg text-text-tertiary hover:text-primary hover:bg-primary/10 transition-colors"
                title="Download PDF"
              >
                <FileText size={16} />
              </button>
            )}
          </div>
        </div>
      ))}

      {/* View All Link */}
      <button
        onClick={() => navigate('/settings/subscription/invoices')}
        className="w-full py-2 text-sm text-primary hover:text-primary-hover font-medium transition-colors"
      >
        View all invoices
      </button>
    </div>
  );
};

/* =============================================================================
   Subscription Settings Page Component
   ============================================================================= */

const SubscriptionSettingsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { addToast } = useToast();
  const {
    subscription,
    loading,
    error,
    refetch,
    isCanceled,
    isPaid,
    reactivateSubscription,
    isReactivating,
  } = useSubscription();

  // Modal states
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

  // Handle checkout return status from URL
  useEffect(() => {
    const checkoutStatus = searchParams.get('checkout');
    if (checkoutStatus === 'success') {
      addToast({
        variant: 'success',
        title: 'Payment Successful',
        message: 'Your subscription has been upgraded successfully!',
        duration: 5000,
      });
      refetch();
      // Clear the URL param
      setSearchParams({});
    } else if (checkoutStatus === 'cancel') {
      addToast({
        variant: 'info',
        title: 'Checkout Canceled',
        message: 'Your checkout was canceled. No changes were made.',
        duration: 5000,
      });
      setSearchParams({});
    }
  }, [searchParams, setSearchParams, addToast, refetch]);

  // Handle upgrade button click
  const handleUpgrade = () => {
    setIsUpgradeModalOpen(true);
  };

  // Handle manage subscription (opens cancel modal for now)
  const handleManage = () => {
    if (isPaid && !isCanceled) {
      setIsCancelModalOpen(true);
    }
  };

  // Handle reactivation
  const handleReactivate = async () => {
    try {
      await reactivateSubscription();
    } catch {
      // Error toast is shown by the hook
    }
  };

  // Loading state
  if (loading) {
    return <SubscriptionSkeleton />;
  }

  // Error state
  if (error) {
    return (
      <ErrorState
        message={
          error instanceof Error
            ? error.message
            : 'Something went wrong. Please try again.'
        }
        onRetry={() => refetch()}
      />
    );
  }

  // No subscription data
  if (!subscription) {
    return (
      <ErrorState
        message="No subscription information available."
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Plan Card */}
      <PlanCard
        subscription={subscription}
        onUpgrade={handleUpgrade}
        onManage={handleManage}
      />

      {/* Reactivate Button for Canceled Subscriptions */}
      {isCanceled && (
        <div className="glass-card glass-card-hover rounded-2xl p-4 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="icon-container icon-container-lg icon-container-success rounded-xl shadow-lg">
              <CreditCard size={22} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-text-primary">
                Reactivate Subscription
              </h3>
              <p className="text-sm text-text-secondary mt-1 mb-4">
                Your subscription is scheduled to cancel. Reactivate now to keep your
                current plan and avoid losing access to premium features.
              </p>
              <AppButton
                variant="primary"
                onClick={handleReactivate}
                disabled={isReactivating}
              >
                {isReactivating ? (
                  <>
                    <RefreshCw size={16} className="mr-2 animate-spin" />
                    Reactivating...
                  </>
                ) : (
                  'Reactivate Subscription'
                )}
              </AppButton>
            </div>
          </div>
        </div>
      )}

      {/* Usage Card */}
      <UsageCard usage={subscription.usage} />

      {/* Recent Invoices */}
      <div className="glass-card rounded-2xl p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text-primary">
            Recent Invoices
          </h3>
          <Receipt size={20} className="text-text-tertiary" />
        </div>
        <InvoiceList />
      </div>

      {/* Quick Actions */}
      <div className="glass-card rounded-2xl p-4 sm:p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          Billing & Payment
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={handleUpgrade}
            className="flex items-center gap-3 p-4 bg-surface-hover hover:bg-border/50 rounded-xl transition-colors text-left group"
          >
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <CreditCard className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-text-primary">Upgrade Plan</p>
              <p className="text-sm text-text-tertiary">
                Get more storage and features
              </p>
            </div>
          </button>

          <button
            onClick={handleManage}
            disabled={!isPaid || isCanceled}
            className="flex items-center gap-3 p-4 bg-surface-hover hover:bg-border/50 rounded-xl transition-colors text-left group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center group-hover:bg-accent/20 transition-colors">
              <XCircle className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="font-medium text-text-primary">Cancel Subscription</p>
              <p className="text-sm text-text-tertiary">
                {isCanceled ? 'Already scheduled to cancel' : 'Manage your subscription'}
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* Modals */}
      <UpgradeModal
        isOpen={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
      />

      <CancelSubscriptionModal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        onSuccess={() => refetch()}
      />
    </div>
  );
};

export default SubscriptionSettingsPage;
