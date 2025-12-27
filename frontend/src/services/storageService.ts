/**
 * Storage Service
 *
 * API client for storage usage and subscription endpoints.
 */

import apiClient from './api';
import type {
  StorageUsage,
  StorageBreakdown,
  UploadCheckResult,
  SubscriptionStatus,
  Plan,
} from '../types/storage';

// ---------------------------------------------------------------------------
// Storage API
// ---------------------------------------------------------------------------

/**
 * Get storage usage for a workspace
 */
export async function getStorageUsage(
  workspaceId: string,
  refresh = false
): Promise<StorageUsage> {
  const params = refresh ? '?refresh=true' : '';
  const response = await apiClient.get<StorageUsage>(
    `/api/v1/workspaces/${workspaceId}/storage/usage${params}`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to get storage usage');
  }

  return response.data as StorageUsage;
}

/**
 * Get storage breakdown by type and month
 */
export async function getStorageBreakdown(
  workspaceId: string
): Promise<StorageBreakdown> {
  const response = await apiClient.get<StorageBreakdown>(
    `/api/v1/workspaces/${workspaceId}/storage/breakdown`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to get storage breakdown');
  }

  return response.data as StorageBreakdown;
}

/**
 * Force refresh the storage cache
 */
export async function refreshStorageCache(
  workspaceId: string
): Promise<StorageUsage> {
  const response = await apiClient.post<StorageUsage>(
    `/api/v1/workspaces/${workspaceId}/storage/refresh`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to refresh storage cache');
  }

  return response.data as StorageUsage;
}

/**
 * Check if a file upload is allowed within storage limits
 */
export async function checkUploadAllowed(
  workspaceId: string,
  fileSizeBytes: number
): Promise<UploadCheckResult> {
  const response = await apiClient.get<UploadCheckResult>(
    `/api/v1/workspaces/${workspaceId}/storage/check-upload?size_bytes=${fileSizeBytes}`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to check upload');
  }

  return response.data as UploadCheckResult;
}

// ---------------------------------------------------------------------------
// Subscription API
// ---------------------------------------------------------------------------

/**
 * Get subscription status for a workspace
 */
export async function getSubscriptionStatus(
  workspaceId: string
): Promise<SubscriptionStatus> {
  const response = await apiClient.get<SubscriptionStatus>(
    `/api/v1/workspaces/${workspaceId}/subscription`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to get subscription status');
  }

  return response.data as SubscriptionStatus;
}

/**
 * Get all available plans
 */
export async function getAvailablePlans(): Promise<Plan[]> {
  const response = await apiClient.get<{ items: Plan[] }>('/api/v1/billing/plans');

  if (response.error) {
    throw new Error(response.error.message || 'Failed to get plans');
  }

  return response.data?.items || [];
}

// ---------------------------------------------------------------------------
// Export as named object for convenience
// ---------------------------------------------------------------------------

export const storageService = {
  getStorageUsage,
  getStorageBreakdown,
  refreshStorageCache,
  checkUploadAllowed,
  getSubscriptionStatus,
  getAvailablePlans,
};
