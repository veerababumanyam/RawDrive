/**
 * Subscription Service
 * API client for subscription management, billing, and invoices
 * Feature: 006-user-profile-sidebar
 */

import api from './api';

// ============================================================================
// Types
// ============================================================================

export interface Plan {
  plan_id: string;
  code: string;
  name: string;
  price_monthly: number;
  price_annual: number | null;
  currency: string;
  storage_bytes: number;
  max_galleries: number;
  max_clients: number;
  max_team_members: number;
  ai_credits_monthly: number;
  features: Record<string, boolean>;
}

export interface UsageStats {
  storage_used_bytes: number;
  storage_limit_bytes: number;
  storage_percentage: number;
  galleries_count: number;
  galleries_limit: number;
  clients_count: number;
  clients_limit: number;
  team_members_count: number;
  team_members_limit: number;
  ai_credits_used: number;
  ai_credits_limit: number;
}

export interface SubscriptionStatus {
  workspace_id: string;
  plan: Plan;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
  is_trial: boolean;
  trial_days_remaining: number | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  usage: UsageStats;
}

export interface Invoice {
  invoice_id: string;
  invoice_number: string;
  amount: number;
  currency: string;
  tax_amount: number | null;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  billing_period_start: string;
  billing_period_end: string;
  paid_at: string | null;
  created_at: string;
}

export interface CheckoutSessionRequest {
  plan_id: string;
  billing_cycle?: 'monthly' | 'annual';
  success_url?: string;
  cancel_url?: string;
}

export interface CheckoutSessionResponse {
  checkout_url: string;
  session_id: string;
  expires_at: string;
}

export interface CancelRequest {
  reason?: string;
  immediate?: boolean;
}

export interface PaginatedInvoices {
  items: Invoice[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

// ============================================================================
// Service Methods
// ============================================================================

export const subscriptionService = {
  /**
   * Get current subscription status for a workspace
   */
  getStatus: async (workspaceId: string): Promise<SubscriptionStatus> => {
    const response = await api.get<SubscriptionStatus>(
      `/api/v1/workspaces/${workspaceId}/subscription`
    );
    if (response.error) {
      throw new Error(response.error.message || 'Failed to get subscription status');
    }
    return response.data!;
  },

  /**
   * Get list of available plans
   */
  getPlans: async (): Promise<{ items: Plan[] }> => {
    const response = await api.get<{ items: Plan[] }>('/api/v1/subscription/plans');
    if (response.error) {
      throw new Error(response.error.message || 'Failed to get plans');
    }
    return response.data!;
  },

  /**
   * Create a checkout session for plan upgrade
   */
  createCheckoutSession: async (
    workspaceId: string,
    request: CheckoutSessionRequest
  ): Promise<CheckoutSessionResponse> => {
    const response = await api.post<CheckoutSessionResponse>(
      `/api/v1/workspaces/${workspaceId}/subscription/checkout`,
      request
    );
    if (response.error) {
      throw new Error(response.error.message || 'Failed to create checkout session');
    }
    return response.data!;
  },

  /**
   * Cancel subscription (cancel at period end by default)
   */
  cancel: async (
    workspaceId: string,
    request?: CancelRequest
  ): Promise<SubscriptionStatus> => {
    const response = await api.post<SubscriptionStatus>(
      `/api/v1/workspaces/${workspaceId}/subscription/cancel`,
      request || {}
    );
    if (response.error) {
      throw new Error(response.error.message || 'Failed to cancel subscription');
    }
    return response.data!;
  },

  /**
   * Reactivate a canceled subscription before period end
   */
  reactivate: async (workspaceId: string): Promise<SubscriptionStatus> => {
    const response = await api.post<SubscriptionStatus>(
      `/api/v1/workspaces/${workspaceId}/subscription/reactivate`
    );
    if (response.error) {
      throw new Error(response.error.message || 'Failed to reactivate subscription');
    }
    return response.data!;
  },

  /**
   * Get paginated list of invoices
   */
  getInvoices: async (
    workspaceId: string,
    options?: { page?: number; limit?: number; status?: Invoice['status'] }
  ): Promise<PaginatedInvoices> => {
    const params = new URLSearchParams();
    if (options?.page) params.set('page', options.page.toString());
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.status) params.set('status', options.status);

    const response = await api.get<PaginatedInvoices>(
      `/api/v1/workspaces/${workspaceId}/subscription/invoices?${params.toString()}`
    );
    if (response.error) {
      throw new Error(response.error.message || 'Failed to get invoices');
    }
    return response.data!;
  },

  /**
   * Get invoice PDF download URL
   */
  getInvoicePdfUrl: (workspaceId: string, invoiceId: string): string => {
    return `/api/v1/workspaces/${workspaceId}/subscription/invoices/${invoiceId}/pdf`;
  },

  /**
   * Download invoice PDF (triggers browser download)
   */
  downloadInvoicePdf: async (
    workspaceId: string,
    invoiceId: string
  ): Promise<void> => {
    const response = await api.fetchRaw(
      `/api/v1/workspaces/${workspaceId}/subscription/invoices/${invoiceId}/pdf`
    );

    if (!response.ok) {
      throw new Error('Failed to download invoice PDF');
    }

    // Create blob URL and trigger download
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `invoice-${invoiceId}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
};

export default subscriptionService;
