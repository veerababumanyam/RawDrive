/**
 * Storage and Subscription Types
 *
 * Type definitions for storage usage, subscription status, and billing.
 */

// ---------------------------------------------------------------------------
// Storage Usage Types
// ---------------------------------------------------------------------------

export interface StorageUsage {
  /** Workspace UUID */
  workspace_id: string;
  /** Total storage used in bytes */
  storage_used_bytes: number;
  /** Storage limit based on plan in bytes */
  storage_limit_bytes: number;
  /** Human readable used (e.g. '2.5 GB') */
  storage_used_formatted: string;
  /** Human readable limit (e.g. '5 GB') */
  storage_limit_formatted: string;
  /** Usage percentage (0-100) */
  usage_percent: number;
  /** Number of assets */
  asset_count: number;
  /** Current plan code */
  plan_code: string;
  /** True if usage > 80% */
  is_near_limit: boolean;
  /** True if usage >= 100% */
  is_at_limit: boolean;
  /** Cache timestamp */
  last_updated_at: string | null;
}

export interface StorageBreakdownItem {
  /** Name (file type or month) */
  name: string;
  /** Storage in bytes */
  storage_bytes: number;
  /** Number of assets */
  asset_count: number;
  /** Percentage of total */
  percentage: number;
}

export interface StorageBreakdown {
  /** Workspace UUID */
  workspace_id: string;
  /** Total storage in bytes */
  total_bytes: number;
  /** Breakdown by file type (photo, video) */
  by_type: StorageBreakdownItem[];
  /** Breakdown by month */
  by_month: StorageBreakdownItem[];
}

export interface UploadCheckResult {
  /** Whether upload is allowed */
  allowed: boolean;
  /** Error message if not allowed */
  error_message: string | null;
  /** Current usage in bytes */
  current_usage_bytes: number;
  /** Storage limit in bytes */
  limit_bytes: number;
  /** Remaining storage in bytes */
  remaining_bytes: number;
  /** File size being checked */
  file_size_bytes: number;
  /** How much over limit (0 if allowed) */
  would_exceed_by: number;
}

// ---------------------------------------------------------------------------
// Subscription Types
// ---------------------------------------------------------------------------

export interface Plan {
  /** Plan UUID */
  plan_id: string;
  /** Plan code (free, starter, professional, business, enterprise) */
  code: 'free' | 'starter' | 'professional' | 'business' | 'enterprise';
  /** Display name */
  name: string;
  /** Monthly price in INR (Decimal) */
  price_monthly: number;
  /** Annual price in INR (Decimal) */
  price_annual: number | null;
  /** Currency code */
  currency: string;
  /** Storage limit in bytes */
  storage_bytes: number;
  /** Maximum galleries */
  max_galleries: number;
  /** Maximum clients */
  max_clients: number;
  /** Maximum team members */
  max_team_members: number;
  /** Monthly AI credits */
  ai_credits_monthly: number;
  /** Plan features */
  features: Record<string, boolean | string | number>;
}

export interface SubscriptionStatus {
  /** Workspace UUID */
  workspace_id: string;
  /** Plan details */
  plan: Plan;
  /** Subscription status */
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
  /** Whether in trial period */
  is_trial: boolean;
  /** Days remaining in trial (null if not trialing) */
  trial_days_remaining: number | null;
  /** Current billing period start */
  current_period_start: string | null;
  /** Current billing period end */
  current_period_end: string | null;
  /** Whether subscription will cancel at period end */
  cancel_at_period_end: boolean;
  /** Storage used in bytes */
  storage_used_bytes: number;
  /** Number of galleries */
  galleries_count: number;
  /** Number of clients */
  clients_count: number;
  /** Number of team members */
  team_members_count: number;
  /** AI credits used this month */
  ai_credits_used: number;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes < 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  if (unitIndex === 0) return `${Math.round(size)} ${units[unitIndex]}`;
  if (size >= 100) return `${size.toFixed(0)} ${units[unitIndex]}`;
  if (size >= 10) return `${size.toFixed(1)} ${units[unitIndex]}`;
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Calculate storage percentage
 */
export function calculateStoragePercent(used: number, limit: number): number {
  if (limit === 0) return used > 0 ? 100 : 0;
  return Math.min((used / limit) * 100, 100);
}

/**
 * Get storage status color based on usage percentage
 */
export function getStorageStatusColor(percent: number): 'success' | 'warning' | 'danger' {
  if (percent >= 90) return 'danger';
  if (percent >= 70) return 'warning';
  return 'success';
}
