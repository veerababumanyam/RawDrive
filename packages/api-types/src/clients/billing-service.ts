/**
 * Billing Service API Client
 *
 * Auto-generated TypeScript client for the Billing Service API.
 *
 * NOTE: This file will be replaced when running `pnpm generate:api-clients`.
 * This is a placeholder showing the expected API structure.
 *
 * // TODO: Generate with orval when OpenAPI spec is available
 *
 * @example
 * ```typescript
 * import { getSubscription, getInvoices } from '@rawdrive/api-types/billing-service';
 *
 * const subscription = await getSubscription({ workspaceId: 'xxx' });
 * const invoices = await getInvoices({ workspaceId: 'xxx' });
 * ```
 */

import { customInstance } from '../lib/axios-instance';

// ============================================================================
// Subscription Types
// ============================================================================

export interface Subscription {
  id: string;
  workspace_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  created_at: string;
  updated_at: string;
}

export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete';

export interface Invoice {
  id: string;
  workspace_id: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  created_at: string;
  paid_at: string | null;
}

export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';

// ============================================================================
// Plan Types
// ============================================================================

export interface Plan {
  id: string;
  name: string;
  description: string;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  features: string[];
  is_active: boolean;
}

// ============================================================================
// API Functions (stubs)
// ============================================================================

export const getSubscription = (workspaceId: string) =>
  customInstance<Subscription>({ url: `/api/v1/billing/subscriptions/${workspaceId}`, method: 'get' });

export const getInvoices = (workspaceId: string) =>
  customInstance<Invoice[]>({ url: `/api/v1/billing/invoices`, method: 'get', params: { workspace_id: workspaceId } });

export const getPlans = () =>
  customInstance<Plan[]>({ url: `/api/v1/billing/plans`, method: 'get' });
