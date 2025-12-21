/**
 * Version Control Service
 *
 * Service for managing profile version snapshots, including
 * automatic daily snapshots, manual snapshots, restore, and comparison.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.6, 10.7
 */

import apiClient, { type ApiResponse } from '@/services/api';
import type { ProfileVersion } from '@/types/profileEditor';

// =============================================================================
// Types
// =============================================================================

export interface VersionDiff {
  field_path: string;
  field_label: string;
  old_value: unknown;
  new_value: unknown;
  change_type: 'added' | 'modified' | 'removed';
}

export interface VersionComparison {
  version_a: Pick<ProfileVersion, 'version_id' | 'version_number' | 'label' | 'created_at'>;
  version_b: Pick<ProfileVersion, 'version_id' | 'version_number' | 'label' | 'created_at'>;
  differences: VersionDiff[];
  summary: {
    added: number;
    modified: number;
    removed: number;
    total: number;
  };
}

export interface CreateSnapshotRequest {
  label?: string;
  description?: string;
}

export interface RestoreVersionRequest {
  create_backup?: boolean;
}

export interface ExportData {
  version: string;
  exported_at: string;
  workspace_id: string;
  profile_type: string;
  profile_data: Record<string, unknown>;
  visibility_data: Record<string, unknown>;
  theme_data: Record<string, unknown>;
}

type VersionChangeListener = (versions: ProfileVersion[]) => void;

// =============================================================================
// Version Control Service Class
// =============================================================================

class VersionControlService {
  private static instance: VersionControlService;

  private workspaceId: string | null = null;
  private profileType: 'company' | 'photographer' = 'company';
  private versions: ProfileVersion[] = [];
  private listeners: Set<VersionChangeListener> = new Set();

  private constructor() {}

  public static getInstance(): VersionControlService {
    if (!VersionControlService.instance) {
      VersionControlService.instance = new VersionControlService();
    }
    return VersionControlService.instance;
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize service with workspace context
   */
  initialize(workspaceId: string, profileType: 'company' | 'photographer' = 'company'): void {
    this.workspaceId = workspaceId;
    this.profileType = profileType;
  }

  // ===========================================================================
  // Version List Methods
  // ===========================================================================

  /**
   * List all versions for the current profile
   */
  async listVersions(options: {
    limit?: number;
    offset?: number;
    include_auto?: boolean;
  } = {}): Promise<ProfileVersion[]> {
    if (!this.workspaceId) {
      throw new Error('Workspace not initialized');
    }

    const params = new URLSearchParams();
    if (options.limit) params.set('limit', options.limit.toString());
    if (options.offset) params.set('offset', options.offset.toString());
    if (options.include_auto !== undefined) params.set('include_auto', options.include_auto.toString());

    const queryString = params.toString();
    const url = `/v1/workspaces/${this.workspaceId}/profile-editor/versions${queryString ? `?${queryString}` : ''}`;

    const response = await apiClient.get<ProfileVersion[]>(url);

    if (response.data) {
      this.versions = response.data;
      this.notifyListeners();
    }

    return response.data || [];
  }

  /**
   * Get a specific version by ID
   */
  async getVersion(versionId: string): Promise<ProfileVersion | null> {
    if (!this.workspaceId) {
      throw new Error('Workspace not initialized');
    }

    const response = await apiClient.get<ProfileVersion>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/versions/${versionId}`
    );

    return response.data || null;
  }

  /**
   * Get the latest version
   */
  async getLatestVersion(): Promise<ProfileVersion | null> {
    const versions = await this.listVersions({ limit: 1 });
    return versions[0] || null;
  }

  // ===========================================================================
  // Snapshot Methods
  // ===========================================================================

  /**
   * Create a manual snapshot
   */
  async createSnapshot(request: CreateSnapshotRequest = {}): Promise<ApiResponse<ProfileVersion>> {
    if (!this.workspaceId) {
      throw new Error('Workspace not initialized');
    }

    const response = await apiClient.post<ProfileVersion>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/versions`,
      {
        ...request,
        profile_type: this.profileType,
        is_auto_snapshot: false,
      }
    );

    if (response.data) {
      this.versions = [response.data, ...this.versions];
      this.notifyListeners();
    }

    return response;
  }

  /**
   * Create a labeled snapshot (convenience method)
   */
  async createLabeledSnapshot(label: string, description?: string): Promise<ProfileVersion | null> {
    const response = await this.createSnapshot({ label, description });
    return response.data || null;
  }

  /**
   * Update version label
   */
  async updateVersionLabel(versionId: string, label: string): Promise<ApiResponse<ProfileVersion>> {
    if (!this.workspaceId) {
      throw new Error('Workspace not initialized');
    }

    const response = await apiClient.patch<ProfileVersion>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/versions/${versionId}`,
      { label }
    );

    if (response.data) {
      this.versions = this.versions.map((v) =>
        v.version_id === versionId ? response.data! : v
      );
      this.notifyListeners();
    }

    return response;
  }

  // ===========================================================================
  // Restore Methods
  // ===========================================================================

  /**
   * Restore profile to a previous version
   */
  async restoreVersion(
    versionId: string,
    options: RestoreVersionRequest = { create_backup: true }
  ): Promise<ApiResponse<ProfileVersion>> {
    if (!this.workspaceId) {
      throw new Error('Workspace not initialized');
    }

    const response = await apiClient.post<ProfileVersion>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/versions/${versionId}/restore`,
      options
    );

    if (response.data) {
      // Refresh version list
      await this.listVersions();
    }

    return response;
  }

  /**
   * Preview what will change if restoring to a version
   */
  async previewRestore(versionId: string): Promise<VersionComparison | null> {
    // Compare target version with current state
    const latestVersion = await this.getLatestVersion();
    if (!latestVersion) return null;

    return this.compareVersions(versionId, latestVersion.version_id);
  }

  // ===========================================================================
  // Comparison Methods
  // ===========================================================================

  /**
   * Compare two versions
   */
  async compareVersions(
    versionIdA: string,
    versionIdB: string
  ): Promise<VersionComparison | null> {
    if (!this.workspaceId) {
      throw new Error('Workspace not initialized');
    }

    const response = await apiClient.get<VersionComparison>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/versions/compare?a=${versionIdA}&b=${versionIdB}`
    );

    return response.data || null;
  }

  /**
   * Get diff between current state and a specific version
   */
  async getDiffFromCurrent(versionId: string): Promise<VersionDiff[]> {
    const comparison = await this.previewRestore(versionId);
    return comparison?.differences || [];
  }

  // ===========================================================================
  // Export/Import Methods
  // ===========================================================================

  /**
   * Export profile configuration to JSON
   */
  async exportToJson(versionId?: string): Promise<ExportData> {
    if (!this.workspaceId) {
      throw new Error('Workspace not initialized');
    }

    const url = versionId
      ? `/v1/workspaces/${this.workspaceId}/profile-editor/versions/${versionId}/export`
      : `/v1/workspaces/${this.workspaceId}/profile-editor/export`;

    const response = await apiClient.get<ExportData>(url);

    if (!response.data) {
      throw new Error('Failed to export profile');
    }

    return response.data;
  }

  /**
   * Download export as JSON file
   */
  async downloadExport(versionId?: string, filename?: string): Promise<void> {
    const data = await this.exportToJson(versionId);
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `profile-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Import profile configuration from JSON
   */
  async importFromJson(
    data: ExportData,
    options: {
      create_backup?: boolean;
      merge?: boolean;
    } = { create_backup: true }
  ): Promise<ApiResponse<ProfileVersion>> {
    if (!this.workspaceId) {
      throw new Error('Workspace not initialized');
    }

    const response = await apiClient.post<ProfileVersion>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/import`,
      {
        data,
        ...options,
      }
    );

    if (response.data) {
      await this.listVersions();
    }

    return response;
  }

  /**
   * Validate import data
   */
  validateImportData(data: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data || typeof data !== 'object') {
      errors.push('Invalid data format');
      return { valid: false, errors };
    }

    const exportData = data as Partial<ExportData>;

    if (!exportData.version) {
      errors.push('Missing version field');
    }

    if (!exportData.profile_data) {
      errors.push('Missing profile_data field');
    }

    if (!exportData.visibility_data) {
      errors.push('Missing visibility_data field');
    }

    if (!exportData.theme_data) {
      errors.push('Missing theme_data field');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // ===========================================================================
  // Delete Methods
  // ===========================================================================

  /**
   * Delete a version (only manual snapshots can be deleted)
   */
  async deleteVersion(versionId: string): Promise<void> {
    if (!this.workspaceId) {
      throw new Error('Workspace not initialized');
    }

    await apiClient.delete(
      `/v1/workspaces/${this.workspaceId}/profile-editor/versions/${versionId}`
    );

    this.versions = this.versions.filter((v) => v.version_id !== versionId);
    this.notifyListeners();
  }

  // ===========================================================================
  // Subscription Methods
  // ===========================================================================

  /**
   * Subscribe to version changes
   */
  subscribe(listener: VersionChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify listeners of changes
   */
  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener([...this.versions]);
      } catch (error) {
        console.error('Version listener error:', error);
      }
    });
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Get cached versions
   */
  getCachedVersions(): ProfileVersion[] {
    return [...this.versions];
  }

  /**
   * Format version for display
   */
  formatVersionLabel(version: ProfileVersion): string {
    if (version.label) {
      return version.label;
    }

    if (version.is_auto_snapshot) {
      return `Auto-save (${this.formatDate(version.created_at)})`;
    }

    return `Version ${version.version_number}`;
  }

  /**
   * Format date for display
   */
  formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffHours < 1) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return diffMinutes <= 1 ? 'Just now' : `${diffMinutes} minutes ago`;
    }

    if (diffHours < 24) {
      return `${Math.floor(diffHours)} hours ago`;
    }

    if (diffDays < 7) {
      return `${Math.floor(diffDays)} days ago`;
    }

    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  /**
   * Get change type color
   */
  getChangeTypeColor(changeType: VersionDiff['change_type']): string {
    switch (changeType) {
      case 'added':
        return 'text-success';
      case 'removed':
        return 'text-error';
      case 'modified':
        return 'text-warning';
      default:
        return 'text-text-secondary';
    }
  }

  /**
   * Reset service state (for testing)
   */
  reset(): void {
    this.versions = [];
    this.listeners.clear();
    this.workspaceId = null;
  }
}

// =============================================================================
// Export Singleton Instance
// =============================================================================

export const versionControlService = VersionControlService.getInstance();

// Export class for testing
export { VersionControlService };
