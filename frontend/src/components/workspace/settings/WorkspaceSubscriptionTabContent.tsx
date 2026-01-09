import React from 'react';
import { useTranslation } from 'react-i18next';
import { CreditCard, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { useSubscription } from '../../../hooks/useSubscription';
import { UsageCard } from '../../subscription/UsageCard';
import { AppButton } from '../../ui/AppButton';
import { Loader2 } from 'lucide-react';

interface Props {
    workspaceId: string;
}

export const WorkspaceSubscriptionTabContent: React.FC<Props> = ({ workspaceId }) => {
    const { t } = useTranslation('settings');
    const {
        subscription,
        loading,
        error,
        refetch,
        isTrial,
        isCanceled,
        trialDaysRemaining,
        isReactivating,
        reactivateSubscription,
    } = useSubscription({ autoFetch: true });

    const handleReactivate = async () => {
        try {
            await reactivateSubscription();
        } catch {
            // Error toast is shown by the hook
        }
    };

    if (loading) {
        return (
            <div className="p-8 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-text-tertiary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                    <span className="font-medium text-red-500">Failed to load subscription</span>
                </div>
                <p className="text-sm text-text-secondary mb-4">
                    {error instanceof Error ? error.message : 'Something went wrong. Please try again.'}
                </p>
                <AppButton variant="outline" onClick={() => refetch()}>
                    <RefreshCw size={16} className="mr-2" />
                    Try Again
                </AppButton>
            </div>
        );
    }

    if (!subscription) {
        return (
            <div className="p-6 bg-surface border border-border/50 rounded-xl text-center text-text-secondary">
                No subscription information available.
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div>
                <h2 className="text-lg font-semibold text-text-primary mb-1">
                    Subscription & Billing
                </h2>
                <p className="text-sm text-text-secondary">
                    Manage your plan, billing details, and invoices.
                </p>
            </div>

            {/* Current Plan Card */}
            <div className="bg-surface border border-border/50 rounded-xl p-6 relative overflow-hidden">
                <div className="flex justify-between items-start z-10 relative">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-xl font-bold text-text-primary">{subscription.plan?.name || 'Free'}</h3>
                            {subscription.status === 'active' && (
                                <span className="px-2 py-0.5 bg-green-500/10 text-green-500 text-xs font-medium rounded-full border border-green-500/20">
                                    Active
                                </span>
                            )}
                            {isTrial && (
                                <span className="px-2 py-0.5 bg-blue-500/10 text-blue-500 text-xs font-medium rounded-full border border-blue-500/20">
                                    Trial ({trialDaysRemaining || 0} days left)
                                </span>
                            )}
                            {isCanceled && (
                                <span className="px-2 py-0.5 bg-yellow-500/10 text-yellow-500 text-xs font-medium rounded-full border border-yellow-500/20">
                                    Canceling
                                </span>
                            )}
                        </div>
                        <div className="text-2xl font-bold text-text-primary mb-1">
                            {(subscription.plan?.price_monthly || 0) > 0 ? (
                                <span>${subscription.plan.price_monthly}<span className="text-sm text-text-secondary font-normal">/month</span></span>
                            ) : (
                                <span>Free</span>
                            )}
                        </div>
                        <p className="text-sm text-text-secondary mt-2">
                            {subscription.status === 'active' && subscription.current_period_end ? (
                                `Next billing date: ${new Date(subscription.current_period_end).toLocaleDateString()}`
                            ) : null}
                        </p>
                    </div>
                </div>

                {/* Reactivate Button for Canceled Subscriptions */}
                {isCanceled && (
                    <div className="mt-6 pt-6 border-t border-border/50">
                        <div className="flex items-start gap-4">
                            <div className="p-2 bg-green-500/10 rounded-lg">
                                <CheckCircle className="w-5 h-5 text-green-500" />
                            </div>
                            <div className="flex-1">
                                <h4 className="font-semibold text-text-primary mb-1">Reactivate Subscription</h4>
                                <p className="text-sm text-text-secondary mb-4">
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
            </div>

            {/* Usage Card */}
            {subscription.usage && <UsageCard usage={subscription.usage} />}

            {/* Billing History Placeholder */}
            <div>
                <h3 className="text-md font-semibold text-text-primary mb-4 flex items-center gap-2">
                    <CreditCard className="w-4 h-4" /> Billing History
                </h3>
                <div className="bg-surface border border-border/50 rounded-xl p-6 text-center text-text-secondary">
                    <CreditCard className="w-12 h-12 mx-auto mb-3 text-text-tertiary opacity-50" />
                    <p>No invoices found for this period.</p>
                    <p className="text-sm mt-1">Your invoices will appear here after your first payment.</p>
                </div>
            </div>
        </div>
    );
};
