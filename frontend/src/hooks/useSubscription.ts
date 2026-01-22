/**
 * useSubscription Hook
 *
 * Hooks for subscription management using native React state.
 * Follows the codebase pattern of useState/useEffect/useCallback.
 * Feature: 006-user-profile-sidebar
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ui';
import {
  subscriptionService,
  type CancelRequest,
  type CheckoutSessionRequest,
  type Invoice,
  type SubscriptionStatus,
  type Plan,
} from '../services/subscriptionService';

// ---------------------------------------------------------------------------
// Main Subscription Hook
// ---------------------------------------------------------------------------

interface UseSubscriptionOptions {
  autoFetch?: boolean;
}

interface UseSubscriptionReturn {
  // Data
  subscription: SubscriptionStatus | null;
  usagePercentages: {
    storage: number;
    galleries: number;
    clients: number;
    teamMembers: number;
    aiCredits: number;
  } | null;
  loading: boolean;
  error: Error | null;

  // Derived state
  isPaid: boolean;
  isTrial: boolean;
  isCanceled: boolean;
  trialDaysRemaining: number | null;

  // Actions
  refetch: () => Promise<void>;
  createCheckout: (request: CheckoutSessionRequest) => Promise<void>;
  cancelSubscription: (request?: CancelRequest) => Promise<void>;
  reactivateSubscription: () => Promise<void>;

  // Mutation states
  isCheckingOut: boolean;
  isCanceling: boolean;
  isReactivating: boolean;

  // Helpers
  formatBytes: (bytes: number) => string;
}

export const useSubscription = ({
  autoFetch = true,
}: UseSubscriptionOptions = {}): UseSubscriptionReturn => {
  const { workspace } = useAuth();
  const { addToast } = useToast();
  const workspaceId = workspace?.workspace_id;

  // State
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Mutation states
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [isReactivating, setIsReactivating] = useState(false);

  // Fetch subscription status
  const fetchSubscription = useCallback(async () => {
    if (!workspaceId) {
      setSubscription(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await subscriptionService.getStatus(workspaceId);
      setSubscription(data);
    } catch (err) {
      // Check if this is a 403 permission error (pattern from useAdminAccess.ts)
      const isPermissionError =
        (err && typeof err === 'object' && 'status' in err && err.status === 403) ||
        (err instanceof Error && (err.message?.includes('403') || err.message?.toLowerCase().includes('forbidden')));

      if (isPermissionError) {
        // Permission error - not a real error, user just doesn't have billing:read
        setSubscription(null);
        setError(null); // No error state for graceful degradation
      } else {
        // Real error - network issue, server error, etc.
        setError(err instanceof Error ? err : new Error('Failed to fetch subscription'));
        setSubscription(null);
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch && workspaceId) {
      fetchSubscription();
    }
  }, [autoFetch, workspaceId, fetchSubscription]);

  // Create checkout session for upgrade
  const createCheckout = useCallback(
    async (request: CheckoutSessionRequest) => {
      if (!workspaceId) return;

      setIsCheckingOut(true);
      try {
        const data = await subscriptionService.createCheckoutSession(workspaceId, request);
        // Redirect to checkout URL
        window.location.href = data.checkout_url;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to start checkout';
        addToast({
          variant: 'error',
          title: 'Checkout Failed',
          message: errorMessage,
          duration: 5000,
        });
        throw err;
      } finally {
        setIsCheckingOut(false);
      }
    },
    [workspaceId, addToast]
  );

  // Cancel subscription
  const cancelSubscription = useCallback(
    async (request?: CancelRequest) => {
      if (!workspaceId) return;

      setIsCanceling(true);
      try {
        await subscriptionService.cancel(workspaceId, request);
        // Refetch to update state
        await fetchSubscription();
        addToast({
          variant: 'success',
          title: 'Subscription Canceled',
          message: 'Your subscription will be canceled at the end of your billing period.',
          duration: 5000,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to cancel subscription';
        addToast({
          variant: 'error',
          title: 'Cancellation Failed',
          message: errorMessage,
          duration: 5000,
        });
        throw err;
      } finally {
        setIsCanceling(false);
      }
    },
    [workspaceId, addToast, fetchSubscription]
  );

  // Reactivate subscription
  const reactivateSubscription = useCallback(async () => {
    if (!workspaceId) return;

    setIsReactivating(true);
    try {
      await subscriptionService.reactivate(workspaceId);
      // Refetch to update state
      await fetchSubscription();
      addToast({
        variant: 'success',
        title: 'Subscription Reactivated',
        message: 'Your subscription has been reactivated successfully!',
        duration: 5000,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to reactivate subscription';
      addToast({
        variant: 'error',
        title: 'Reactivation Failed',
        message: errorMessage,
        duration: 5000,
      });
      throw err;
    } finally {
      setIsReactivating(false);
    }
  }, [workspaceId, addToast, fetchSubscription]);

  // Format bytes helper
  const formatBytes = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }, []);

  // Calculate usage percentages
  const usagePercentages = subscription?.usage
    ? {
        storage: Math.round(
          (subscription.usage.storage_used_bytes / subscription.usage.storage_limit_bytes) * 100
        ),
        galleries: Math.round(
          (subscription.usage.galleries_count / subscription.usage.galleries_limit) * 100
        ),
        clients: Math.round(
          (subscription.usage.clients_count / subscription.usage.clients_limit) * 100
        ),
        teamMembers: Math.round(
          (subscription.usage.team_members_count / subscription.usage.team_members_limit) * 100
        ),
        aiCredits: Math.round(
          (subscription.usage.ai_credits_used / subscription.usage.ai_credits_limit) * 100
        ),
      }
    : null;

  return {
    // Data
    subscription,
    usagePercentages,
    loading,
    error,

    // Derived state
    isPaid: subscription?.plan.code !== 'free',
    isTrial: subscription?.is_trial ?? false,
    isCanceled: subscription?.cancel_at_period_end ?? false,
    trialDaysRemaining: subscription?.trial_days_remaining ?? null,

    // Actions
    refetch: fetchSubscription,
    createCheckout,
    cancelSubscription,
    reactivateSubscription,

    // Mutation states
    isCheckingOut,
    isCanceling,
    isReactivating,

    // Helpers
    formatBytes,
  };
};

// ---------------------------------------------------------------------------
// Plans Hook
// ---------------------------------------------------------------------------

interface UsePlansReturn {
  plans: Plan[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export const usePlans = (): UsePlansReturn => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await subscriptionService.getPlans();
      setPlans(data.items);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch plans'));
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  return {
    plans,
    loading,
    error,
    refetch: fetchPlans,
  };
};

// ---------------------------------------------------------------------------
// Invoices Hook
// ---------------------------------------------------------------------------

interface UseInvoicesOptions {
  page?: number;
  limit?: number;
  status?: Invoice['status'];
  autoFetch?: boolean;
}

interface UseInvoicesReturn {
  invoices: Invoice[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  } | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  downloadPdf: (invoiceId: string) => Promise<void>;
}

export const useInvoices = ({
  page = 1,
  limit = 20,
  status,
  autoFetch = true,
}: UseInvoicesOptions = {}): UseInvoicesReturn => {
  const { workspace } = useAuth();
  const workspaceId = workspace?.workspace_id;

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pagination, setPagination] = useState<UseInvoicesReturn['pagination']>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchInvoices = useCallback(async () => {
    if (!workspaceId) {
      setInvoices([]);
      setPagination(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await subscriptionService.getInvoices(workspaceId, { page, limit, status });
      setInvoices(data.items);
      setPagination(data.pagination);
    } catch (err) {
      // Check if this is a 403 permission error
      const isPermissionError =
        (err && typeof err === 'object' && 'status' in err && err.status === 403) ||
        (err instanceof Error && (err.message?.includes('403') || err.message?.toLowerCase().includes('forbidden')));

      if (isPermissionError) {
        // Permission error - gracefully degrade
        setInvoices([]);
        setPagination(null);
        setError(null);
      } else {
        // Real error
        setError(err instanceof Error ? err : new Error('Failed to fetch invoices'));
        setInvoices([]);
        setPagination(null);
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId, page, limit, status]);

  useEffect(() => {
    if (autoFetch && workspaceId) {
      fetchInvoices();
    }
  }, [autoFetch, workspaceId, fetchInvoices]);

  const downloadPdf = useCallback(
    async (invoiceId: string) => {
      if (!workspaceId) return;
      await subscriptionService.downloadInvoicePdf(workspaceId, invoiceId);
    },
    [workspaceId]
  );

  return {
    invoices,
    pagination,
    loading,
    error,
    refetch: fetchInvoices,
    downloadPdf,
  };
};
