/**
 * Client CRM Service
 * API client for all client management operations
 */

import apiClient from './api';
import type {
  // Request types
  CreateClientRequest,
  UpdateClientRequest,
  AddContactRequest,
  UpdateContactRequest,
  AddAddressRequest,
  UpdateAddressRequest,
  LinkGalleryRequest,
  UpdateGalleryRoleRequest,
  AddTagsRequest,
  LogCommunicationRequest,
  DetectDuplicatesRequest,
  MergeClientsRequest,
  RecordActivityRequest,
  AddNoteRequest,
  SelectGalleryPhotoRequest,
  CreateSmartListRequest,
  UpdateSmartListRequest,
  ExportClientsRequest,
  // Response types
  ClientDetail,
  ClientListResponse,
  ClientCreateResponse,
  ClientUpdateResponse,
  ClientDeleteResponse,
  ClientSearchResult,
  ClientContact,
  ContactCreateResponse,
  ClientAddress,
  AddressCreateResponse,
  GalleryLinkCreateResponse,
  GalleryLinkDetail,
  GalleryLinkedClient,
  GalleryRoleUpdateResponse,
  ClientActivityListResponse,
  ActivityCreateResponse,
  ActivitySummary,
  ClientCommunicationListResponse,
  CommunicationCreateResponse,
  DetectDuplicatesResponse,
  MergeClientsResponse,
  AvatarUploadResponse,
  AvatarSelectResponse,
  AvatarInfo,
  SmartList,
  SmartListWithCount,
  SmartListEvaluationResponse,
  ExportClientsResponse,
  ImportClientsResponse,
  ImportTemplateResponse,
  ClientAnalyticsResponse,
  EngagementMetricsResponse,
  ReferralAnalyticsResponse,
  RevenueAnalyticsResponse,
  DashboardAnalyticsResponse,
  // Query params
  ClientListParams,
  ActivityListParams,
  CommunicationListParams,
  AnalyticsParams,
  ClientTag,
} from '@/types/client';

/**
 * Build query string from params object
 */
function buildQueryString<T extends object>(params: T): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      value.forEach((v) => searchParams.append(key, String(v)));
    } else {
      searchParams.append(key, String(value));
    }
  }

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

export class ClientService {
  private getBaseUrl(workspaceId: string): string {
    return `/api/v1/workspaces/${workspaceId}/clients`;
  }

  // ---------------------------------------------------------------------------
  // Client CRUD
  // ---------------------------------------------------------------------------

  /**
   * List clients with filtering and pagination
   */
  async listClients(
    workspaceId: string,
    params: ClientListParams = {}
  ): Promise<ClientListResponse> {
    const query = buildQueryString(params);
    const url = `${this.getBaseUrl(workspaceId)}${query}`;



    const response = await apiClient.get<ClientListResponse>(url);



    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch clients');
    }

    return response.data!;
  }

  /**
   * Get a single client by ID
   */
  async getClient(workspaceId: string, clientId: string): Promise<ClientDetail> {
    const response = await apiClient.get<ClientDetail>(
      `${this.getBaseUrl(workspaceId)}/${clientId}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch client');
    }

    return response.data!;
  }

  /**
   * Create a new client
   */
  async createClient(
    workspaceId: string,
    data: CreateClientRequest
  ): Promise<ClientCreateResponse> {
    const response = await apiClient.post<ClientCreateResponse>(
      this.getBaseUrl(workspaceId),
      data
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to create client');
    }

    return response.data!;
  }

  /**
   * Update a client
   */
  async updateClient(
    workspaceId: string,
    clientId: string,
    data: UpdateClientRequest
  ): Promise<ClientUpdateResponse> {
    const response = await apiClient.patch<ClientUpdateResponse>(
      `${this.getBaseUrl(workspaceId)}/${clientId}`,
      data
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to update client');
    }

    return response.data!;
  }

  /**
   * Delete a client
   */
  async deleteClient(
    workspaceId: string,
    clientId: string
  ): Promise<ClientDeleteResponse> {
    const response = await apiClient.delete<ClientDeleteResponse>(
      `${this.getBaseUrl(workspaceId)}/${clientId}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to delete client');
    }

    return response.data!;
  }

  /**
   * Search clients
   */
  async searchClients(
    workspaceId: string,
    query: string,
    limit: number = 10
  ): Promise<ClientSearchResult[]> {
    const params = buildQueryString({ q: query, limit });
    const response = await apiClient.get<ClientSearchResult[]>(
      `${this.getBaseUrl(workspaceId)}/search${params}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to search clients');
    }

    return response.data!;
  }

  // ---------------------------------------------------------------------------
  // Contacts
  // ---------------------------------------------------------------------------

  /**
   * Add a contact to a client
   */
  async addContact(
    workspaceId: string,
    clientId: string,
    data: AddContactRequest
  ): Promise<ContactCreateResponse> {
    const response = await apiClient.post<ContactCreateResponse>(
      `${this.getBaseUrl(workspaceId)}/${clientId}/contacts`,
      data
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to add contact');
    }

    return response.data!;
  }

  /**
   * Update a contact
   */
  async updateContact(
    workspaceId: string,
    clientId: string,
    contactId: string,
    data: UpdateContactRequest
  ): Promise<ClientContact> {
    const response = await apiClient.patch<ClientContact>(
      `${this.getBaseUrl(workspaceId)}/${clientId}/contacts/${contactId}`,
      data
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to update contact');
    }

    return response.data!;
  }

  /**
   * Delete a contact
   */
  async deleteContact(
    workspaceId: string,
    clientId: string,
    contactId: string
  ): Promise<void> {
    const response = await apiClient.delete(
      `${this.getBaseUrl(workspaceId)}/${clientId}/contacts/${contactId}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to delete contact');
    }
  }

  // ---------------------------------------------------------------------------
  // Addresses
  // ---------------------------------------------------------------------------

  /**
   * Add an address to a client
   */
  async addAddress(
    workspaceId: string,
    clientId: string,
    data: AddAddressRequest
  ): Promise<AddressCreateResponse> {
    const response = await apiClient.post<AddressCreateResponse>(
      `${this.getBaseUrl(workspaceId)}/${clientId}/addresses`,
      data
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to add address');
    }

    return response.data!;
  }

  /**
   * Update an address
   */
  async updateAddress(
    workspaceId: string,
    clientId: string,
    addressId: string,
    data: UpdateAddressRequest
  ): Promise<ClientAddress> {
    const response = await apiClient.patch<ClientAddress>(
      `${this.getBaseUrl(workspaceId)}/${clientId}/addresses/${addressId}`,
      data
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to update address');
    }

    return response.data!;
  }

  /**
   * Delete an address
   */
  async deleteAddress(
    workspaceId: string,
    clientId: string,
    addressId: string
  ): Promise<void> {
    const response = await apiClient.delete(
      `${this.getBaseUrl(workspaceId)}/${clientId}/addresses/${addressId}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to delete address');
    }
  }

  // ---------------------------------------------------------------------------
  // Gallery Links
  // ---------------------------------------------------------------------------

  /**
   * Link a gallery to a client
   */
  async linkGallery(
    workspaceId: string,
    clientId: string,
    data: LinkGalleryRequest
  ): Promise<GalleryLinkCreateResponse> {
    const response = await apiClient.post<GalleryLinkCreateResponse>(
      `${this.getBaseUrl(workspaceId)}/${clientId}/galleries`,
      data
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to link gallery');
    }

    return response.data!;
  }

  /**
   * Get client's linked galleries
   */
  async getLinkedGalleries(
    workspaceId: string,
    clientId: string
  ): Promise<GalleryLinkDetail[]> {
    const response = await apiClient.get<GalleryLinkDetail[]>(
      `${this.getBaseUrl(workspaceId)}/${clientId}/galleries`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch linked galleries');
    }

    return response.data!;
  }

  /**
   * Update gallery role
   */
  async updateGalleryRole(
    workspaceId: string,
    clientId: string,
    galleryId: string,
    data: UpdateGalleryRoleRequest
  ): Promise<GalleryRoleUpdateResponse> {
    const response = await apiClient.patch<GalleryRoleUpdateResponse>(
      `${this.getBaseUrl(workspaceId)}/${clientId}/galleries/${galleryId}`,
      data
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to update gallery role');
    }

    return response.data!;
  }

  /**
   * Unlink a gallery from a client
   */
  async unlinkGallery(
    workspaceId: string,
    clientId: string,
    galleryId: string
  ): Promise<void> {
    const response = await apiClient.delete(
      `${this.getBaseUrl(workspaceId)}/${clientId}/galleries/${galleryId}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to unlink gallery');
    }
  }

  /**
   * Get clients linked to a gallery
   */
  async getGalleryClients(
    workspaceId: string,
    galleryId: string
  ): Promise<GalleryLinkedClient[]> {
    const response = await apiClient.get<GalleryLinkedClient[]>(
      `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/clients`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch gallery clients');
    }

    return response.data!;
  }

  // ---------------------------------------------------------------------------
  // Tags
  // ---------------------------------------------------------------------------

  /**
   * Add tags to a client
   */
  async addTags(
    workspaceId: string,
    clientId: string,
    data: AddTagsRequest
  ): Promise<ClientTag[]> {
    const response = await apiClient.post<ClientTag[]>(
      `${this.getBaseUrl(workspaceId)}/${clientId}/tags`,
      data
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to add tags');
    }

    return response.data!;
  }

  /**
   * Remove a tag from a client
   */
  async removeTag(
    workspaceId: string,
    clientId: string,
    tagId: string
  ): Promise<void> {
    const response = await apiClient.delete(
      `${this.getBaseUrl(workspaceId)}/${clientId}/tags/${tagId}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to remove tag');
    }
  }

  /**
   * Get all workspace tags
   */
  async getWorkspaceTags(workspaceId: string): Promise<ClientTag[]> {
    const response = await apiClient.get<ClientTag[]>(
      `/api/v1/workspaces/${workspaceId}/tags`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch tags');
    }

    return response.data!;
  }

  // ---------------------------------------------------------------------------
  // Activities
  // ---------------------------------------------------------------------------

  /**
   * Get client activities
   */
  async getActivities(
    workspaceId: string,
    clientId: string,
    params: ActivityListParams = {}
  ): Promise<ClientActivityListResponse> {
    const query = buildQueryString(params);
    const url = `${this.getBaseUrl(workspaceId)}/${clientId}/activities${query}`;



    const response = await apiClient.get<ClientActivityListResponse>(url);



    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch activities');
    }

    // Normalize response structure: API returns {activities, total, page, limit}
    // but TypeScript expects {activities, meta: {total, page, limit, total_pages}}
    const data = response.data!;
    if (data && !('meta' in data) && ('total' in data || 'page' in data || 'limit' in data)) {
      const normalized: ClientActivityListResponse = {
        activities: (data as any).activities || [],
        meta: {
          total: (data as any).total ?? 0,
          page: (data as any).page ?? 1,
          limit: (data as any).limit ?? 20,
          total_pages: Math.ceil(((data as any).total ?? 0) / ((data as any).limit ?? 20)),
        },
      };



      return normalized;
    }



    return data;
  }

  /**
   * Record an activity
   */
  async recordActivity(
    workspaceId: string,
    clientId: string,
    data: RecordActivityRequest
  ): Promise<ActivityCreateResponse> {
    const url = `${this.getBaseUrl(workspaceId)}/${clientId}/activities`;



    const response = await apiClient.post<ActivityCreateResponse>(url, data);



    if (response.error) {
      throw new Error(response.error.message || 'Failed to record activity');
    }

    return response.data!;
  }

  /**
   * Get activity summary
   */
  async getActivitySummary(
    workspaceId: string,
    clientId: string
  ): Promise<ActivitySummary> {
    const response = await apiClient.get<ActivitySummary>(
      `${this.getBaseUrl(workspaceId)}/${clientId}/activities/summary`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch activity summary');
    }

    return response.data!;
  }

  /**
   * Add a note to client timeline
   */
  async addNote(
    workspaceId: string,
    clientId: string,
    data: AddNoteRequest
  ): Promise<ActivityCreateResponse> {
    const response = await apiClient.post<ActivityCreateResponse>(
      `${this.getBaseUrl(workspaceId)}/${clientId}/notes`,
      data
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to add note');
    }

    return response.data!;
  }

  // ---------------------------------------------------------------------------
  // Communications
  // ---------------------------------------------------------------------------

  /**
   * Get client communications
   */
  async getCommunications(
    workspaceId: string,
    clientId: string,
    params: CommunicationListParams = {}
  ): Promise<ClientCommunicationListResponse> {
    const query = buildQueryString(params);
    const url = `${this.getBaseUrl(workspaceId)}/${clientId}/communications${query}`;



    const response = await apiClient.get<ClientCommunicationListResponse>(url);



    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch communications');
    }

    // Normalize response structure: API returns {communications, total, page, limit}
    // but TypeScript expects {communications, meta: {total, page, limit, total_pages}}
    const data = response.data!;
    if (data && !('meta' in data) && ('total' in data || 'page' in data || 'limit' in data)) {
      const normalized: ClientCommunicationListResponse = {
        communications: (data as any).communications || [],
        meta: {
          total: (data as any).total ?? 0,
          page: (data as any).page ?? 1,
          limit: (data as any).limit ?? 20,
          total_pages: Math.ceil(((data as any).total ?? 0) / ((data as any).limit ?? 20)),
        },
      };



      return normalized;
    }



    return data;
  }

  /**
   * Log a communication
   */
  async logCommunication(
    workspaceId: string,
    clientId: string,
    data: LogCommunicationRequest
  ): Promise<CommunicationCreateResponse> {
    const url = `${this.getBaseUrl(workspaceId)}/${clientId}/communications`;



    const response = await apiClient.post<CommunicationCreateResponse>(url, data);



    if (response.error) {
      throw new Error(response.error.message || 'Failed to log communication');
    }

    return response.data!;
  }

  // ---------------------------------------------------------------------------
  // Duplicate Detection
  // ---------------------------------------------------------------------------

  /**
   * Detect duplicate clients
   */
  async detectDuplicates(
    workspaceId: string,
    data: DetectDuplicatesRequest
  ): Promise<DetectDuplicatesResponse> {
    const response = await apiClient.post<DetectDuplicatesResponse>(
      `${this.getBaseUrl(workspaceId)}/detect-duplicates`,
      data
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to detect duplicates');
    }

    return response.data!;
  }

  /**
   * Merge duplicate clients
   */
  async mergeClients(
    workspaceId: string,
    data: MergeClientsRequest
  ): Promise<MergeClientsResponse> {
    const response = await apiClient.post<MergeClientsResponse>(
      `${this.getBaseUrl(workspaceId)}/merge`,
      data
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to merge clients');
    }

    return response.data!;
  }

  // ---------------------------------------------------------------------------
  // Avatar
  // ---------------------------------------------------------------------------

  /**
   * Upload client avatar
   */
  async uploadAvatar(
    workspaceId: string,
    clientId: string,
    file: File,
    cropData?: { crop_x?: number; crop_y?: number; crop_scale?: number }
  ): Promise<AvatarUploadResponse> {
    const formData = new FormData();
    formData.append('file', file, file.name);

    if (cropData) {
      if (cropData.crop_x !== undefined) formData.append('crop_x', String(cropData.crop_x));
      if (cropData.crop_y !== undefined) formData.append('crop_y', String(cropData.crop_y));
      if (cropData.crop_scale !== undefined) formData.append('crop_scale', String(cropData.crop_scale));
    }

    const response = await apiClient.upload<AvatarUploadResponse>(
      `${this.getBaseUrl(workspaceId)}/${clientId}/avatar`,
      formData
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to upload avatar');
    }

    return response.data!;
  }

  /**
   * Select gallery photo as avatar
   */
  async selectGalleryPhotoAsAvatar(
    workspaceId: string,
    clientId: string,
    data: SelectGalleryPhotoRequest
  ): Promise<AvatarSelectResponse> {
    const response = await apiClient.post<AvatarSelectResponse>(
      `${this.getBaseUrl(workspaceId)}/${clientId}/avatar/select`,
      data
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to select avatar');
    }

    return response.data!;
  }

  /**
   * Get avatar info
   */
  async getAvatarInfo(
    workspaceId: string,
    clientId: string
  ): Promise<AvatarInfo> {
    const response = await apiClient.get<AvatarInfo>(
      `${this.getBaseUrl(workspaceId)}/${clientId}/avatar`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch avatar info');
    }

    return response.data!;
  }

  /**
   * Delete client avatar
   */
  async deleteAvatar(
    workspaceId: string,
    clientId: string
  ): Promise<void> {
    const response = await apiClient.delete(
      `${this.getBaseUrl(workspaceId)}/${clientId}/avatar`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to delete avatar');
    }
  }

  /**
   * Fetch avatar image as blob URL (with authentication)
   * Adds cache-busting parameter to ensure fresh images after updates
   */
  async getAvatarBlobUrl(
    workspaceId: string,
    clientId: string,
    size: number = 256
  ): Promise<string | null> {
    try {
      // Add cache-busting timestamp to ensure we get the latest avatar
      const cacheBuster = Date.now();
      const response = await apiClient.fetchRaw(
        `${this.getBaseUrl(workspaceId)}/${clientId}/avatar/${size}?_t=${cacheBuster}`
      );

      if (!response.ok) {
        return null;
      }

      const blob = await response.blob();
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Smart Lists
  // ---------------------------------------------------------------------------

  /**
   * Get all smart lists
   */
  async getSmartLists(workspaceId: string): Promise<SmartListWithCount[]> {
    const response = await apiClient.get<SmartListWithCount[]>(
      `${this.getBaseUrl(workspaceId)}/smart-lists`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch smart lists');
    }

    return response.data!;
  }

  /**
   * Create a smart list
   */
  async createSmartList(
    workspaceId: string,
    data: CreateSmartListRequest
  ): Promise<SmartList> {
    const response = await apiClient.post<SmartList>(
      `${this.getBaseUrl(workspaceId)}/smart-lists`,
      data
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to create smart list');
    }

    return response.data!;
  }

  /**
   * Get a smart list by ID
   */
  async getSmartList(
    workspaceId: string,
    listId: string
  ): Promise<SmartList> {
    const response = await apiClient.get<SmartList>(
      `${this.getBaseUrl(workspaceId)}/smart-lists/${listId}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch smart list');
    }

    return response.data!;
  }

  /**
   * Update a smart list
   */
  async updateSmartList(
    workspaceId: string,
    listId: string,
    data: UpdateSmartListRequest
  ): Promise<SmartList> {
    const response = await apiClient.patch<SmartList>(
      `${this.getBaseUrl(workspaceId)}/smart-lists/${listId}`,
      data
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to update smart list');
    }

    return response.data!;
  }

  /**
   * Delete a smart list
   */
  async deleteSmartList(
    workspaceId: string,
    listId: string
  ): Promise<void> {
    const response = await apiClient.delete(
      `${this.getBaseUrl(workspaceId)}/smart-lists/${listId}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to delete smart list');
    }
  }

  /**
   * Evaluate a smart list
   */
  async evaluateSmartList(
    workspaceId: string,
    listId: string,
    params: { page?: number; limit?: number } = {}
  ): Promise<SmartListEvaluationResponse> {
    const query = buildQueryString(params);
    const response = await apiClient.get<SmartListEvaluationResponse>(
      `${this.getBaseUrl(workspaceId)}/smart-lists/${listId}/evaluate${query}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to evaluate smart list');
    }

    return response.data!;
  }

  // ---------------------------------------------------------------------------
  // Import/Export
  // ---------------------------------------------------------------------------

  /**
   * Export clients
   */
  async exportClients(
    workspaceId: string,
    params: ExportClientsRequest = {}
  ): Promise<ExportClientsResponse> {
    const query = buildQueryString(params);
    const response = await apiClient.get<ExportClientsResponse>(
      `${this.getBaseUrl(workspaceId)}/export${query}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to export clients');
    }

    return response.data!;
  }

  /**
   * Import clients from CSV
   */
  async importClients(
    workspaceId: string,
    file: File,
    options: { update_existing?: boolean; detect_duplicates?: boolean } = {}
  ): Promise<ImportClientsResponse> {
    const formData = new FormData();
    formData.append('file', file);

    if (options.update_existing !== undefined) {
      formData.append('update_existing', String(options.update_existing));
    }
    if (options.detect_duplicates !== undefined) {
      formData.append('detect_duplicates', String(options.detect_duplicates));
    }

    const response = await apiClient.request<ImportClientsResponse>(
      `${this.getBaseUrl(workspaceId)}/import`,
      {
        method: 'POST',
        body: formData,
        headers: {}, // Let browser set Content-Type for FormData
      }
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to import clients');
    }

    return response.data!;
  }

  /**
   * Get import template
   */
  async getImportTemplate(workspaceId: string): Promise<ImportTemplateResponse> {
    const response = await apiClient.get<ImportTemplateResponse>(
      `${this.getBaseUrl(workspaceId)}/import/template`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch import template');
    }

    return response.data!;
  }

  /**
   * Download import template as file
   */
  async downloadImportTemplate(workspaceId: string): Promise<void> {
    const template = await this.getImportTemplate(workspaceId);

    const blob = new Blob([template.content], { type: template.content_type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = template.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------------------
  // Analytics
  // ---------------------------------------------------------------------------

  /**
   * Get client analytics
   */
  async getAnalytics(
    workspaceId: string,
    params: AnalyticsParams = {}
  ): Promise<ClientAnalyticsResponse> {
    const query = buildQueryString(params);
    // Cast to any because backend returns WorkspaceAnalyticsSummary which differs from ClientAnalyticsResponse
    const response = await apiClient.get<any>(
      `${this.getBaseUrl(workspaceId)}/analytics${query}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch analytics');
    }

    const rawData = response.data;

    // Adapt backend response (WorkspaceAnalyticsSummary) to frontend expected structure (ClientAnalyticsResponse)
    return {
      summary: {
        total_clients: rawData.total_clients || 0,
        active_clients: rawData.active_clients || 0,
        inactive_clients: rawData.inactive_count || 0,
        new_clients_period: rawData.new_clients || 0,
        growth_rate_percent: 0, // Not calculated by backend yet
        clients_with_galleries: 0, // Not available in current backend response
        recently_active: rawData.active_count || 0
      },
      clients_by_status: {
        active: rawData.active_count || 0,
        at_risk: rawData.at_risk_count || 0,
        inactive: rawData.inactive_count || 0
      },
      monthly_trend: [], // Time series not correctly returned by backend yet
      period: {
        start: rawData.time_range?.start_date,
        end: rawData.time_range?.end_date,
        days: params.days
      }
    };
  }

  /**
   * Get engagement metrics
   */
  async getEngagementMetrics(
    workspaceId: string,
    params: AnalyticsParams = {}
  ): Promise<EngagementMetricsResponse> {
    const query = buildQueryString(params);
    const response = await apiClient.get<EngagementMetricsResponse>(
      `${this.getBaseUrl(workspaceId)}/analytics/engagement${query}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch engagement metrics');
    }

    return response.data!;
  }

  /**
   * Get referral analytics
   */
  async getReferralAnalytics(workspaceId: string): Promise<ReferralAnalyticsResponse> {
    const response = await apiClient.get<ReferralAnalyticsResponse>(
      `${this.getBaseUrl(workspaceId)}/analytics/referrals`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch referral analytics');
    }

    return response.data!;
  }

  /**
   * Get revenue analytics
   */
  async getRevenueAnalytics(
    workspaceId: string,
    params: AnalyticsParams = {}
  ): Promise<RevenueAnalyticsResponse> {
    const query = buildQueryString(params);
    const response = await apiClient.get<RevenueAnalyticsResponse>(
      `${this.getBaseUrl(workspaceId)}/analytics/revenue${query}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch revenue analytics');
    }

    return response.data!;
  }

  /**
   * Get dashboard analytics
   */
  async getDashboardAnalytics(workspaceId: string): Promise<DashboardAnalyticsResponse> {
    const response = await apiClient.get<DashboardAnalyticsResponse>(
      `${this.getBaseUrl(workspaceId)}/analytics/dashboard`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch dashboard analytics');
    }

    return response.data!;
  }
}

// Export singleton instance
export const clientService = new ClientService();
export default clientService;
