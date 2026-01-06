/**
 * Search Service
 * API client for unified search and semantic search features
 *
 * Feature: AI & Search Features (GEO)
 */

import apiClient from './api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchRequest {
  query: string;
  entity_types?: string[];
  gallery_id?: string;
}

export interface GallerySearchResult {
  gallery_id: string;
  title: string;
  description?: string;
  client_name?: string;
  status: string;
  created_at: string;
  match_type: string;
}

export interface AssetSearchResult {
  asset_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  gallery_id?: string;
  created_at: string;
  match_type: string;
}

export interface TagSearchResult {
  tag_id: string;
  name: string;
  type: string;
  color?: string;
  usage_count: number;
  match_type: string;
}

export interface PersonSearchResult {
  person_id: string;
  display_name?: string;
  status: string;
  face_count: number;
  cover_asset_id?: string;
  match_type: string;
}

export interface CommentSearchResult {
  comment_id: string;
  gallery_id: string;
  asset_id?: string;
  body: string;
  author_name: string;
  created_at: string;
  match_type: string;
}

export interface SearchResults {
  galleries?: GallerySearchResult[];
  assets?: AssetSearchResult[];
  tags?: TagSearchResult[];
  people?: PersonSearchResult[];
  comments?: CommentSearchResult[];
}

export interface SearchResponse {
  query: string;
  results: SearchResults;
  total: number;
}

export interface AssetListMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AssetResult {
  asset_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  gallery_id?: string;
  created_at: string;
}

export interface AssetListResponse {
  data: AssetResult[];
  meta: AssetListMeta;
}

export type EntityType = 'galleries' | 'assets' | 'tags' | 'people' | 'comments';

// ---------------------------------------------------------------------------
// Search Service
// ---------------------------------------------------------------------------

export class SearchService {
  /**
   * Unified search across galleries, assets, tags, people, and comments
   */
  static async search(
    workspaceId: string,
    request: SearchRequest
  ): Promise<SearchResponse> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/search`;
    const response = await apiClient.post<SearchResponse>(endpoint, request);
    if (response.error) {
      throw new Error(response.error.message || 'Search failed');
    }
    return response.data!;
  }

  /**
   * Quick search via GET request (useful for search-as-you-type)
   */
  static async quickSearch(
    workspaceId: string,
    query: string,
    options?: {
      types?: EntityType[];
      galleryId?: string;
    }
  ): Promise<SearchResponse> {
    const params = new URLSearchParams();
    params.append('q', query);
    if (options?.types?.length) {
      params.append('types', options.types.join(','));
    }
    if (options?.galleryId) {
      params.append('gallery_id', options.galleryId);
    }

    const endpoint = `/api/v1/workspaces/${workspaceId}/search?${params.toString()}`;
    const response = await apiClient.get<SearchResponse>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Quick search failed');
    }
    return response.data!;
  }

  /**
   * Search assets by tag
   */
  static async searchByTag(
    workspaceId: string,
    tagId: string,
    options?: {
      galleryId?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<AssetListResponse> {
    const params = new URLSearchParams();
    if (options?.galleryId) params.append('gallery_id', options.galleryId);
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());

    const query = params.toString();
    const endpoint = `/api/v1/workspaces/${workspaceId}/search/by-tag/${tagId}${query ? `?${query}` : ''}`;

    const response = await apiClient.get<AssetListResponse>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to search by tag');
    }
    return response.data!;
  }

  /**
   * Search assets by person
   */
  static async searchByPerson(
    workspaceId: string,
    personId: string,
    options?: {
      galleryId?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<AssetListResponse> {
    const params = new URLSearchParams();
    if (options?.galleryId) params.append('gallery_id', options.galleryId);
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());

    const query = params.toString();
    const endpoint = `/api/v1/workspaces/${workspaceId}/search/by-person/${personId}${query ? `?${query}` : ''}`;

    const response = await apiClient.get<AssetListResponse>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to search by person');
    }
    return response.data!;
  }

  /**
   * Parse natural language query into search parameters
   * This is a client-side helper that interprets common search patterns
   */
  static parseNaturalLanguageQuery(query: string): {
    keywords: string[];
    filters: {
      entityTypes?: EntityType[];
      hasTag?: string;
      hasPerson?: string;
      dateRange?: { from?: string; to?: string };
    };
  } {
    const keywords: string[] = [];
    const filters: {
      entityTypes?: EntityType[];
      hasTag?: string;
      hasPerson?: string;
      dateRange?: { from?: string; to?: string };
    } = {};

    // Normalize query
    const normalizedQuery = query.toLowerCase().trim();

    // Detect entity type hints
    if (
      normalizedQuery.includes('gallery') ||
      normalizedQuery.includes('galleries')
    ) {
      filters.entityTypes = ['galleries'];
    } else if (
      normalizedQuery.includes('photo') ||
      normalizedQuery.includes('photos') ||
      normalizedQuery.includes('image')
    ) {
      filters.entityTypes = ['assets'];
    } else if (normalizedQuery.includes('tag')) {
      filters.entityTypes = ['tags'];
    } else if (
      normalizedQuery.includes('person') ||
      normalizedQuery.includes('people') ||
      normalizedQuery.includes('face')
    ) {
      filters.entityTypes = ['people'];
    } else if (normalizedQuery.includes('comment')) {
      filters.entityTypes = ['comments'];
    }

    // Detect person references (e.g., "photos of John", "with John")
    const personMatch = normalizedQuery.match(
      /(?:of|with|featuring)\s+([a-z]+)/i
    );
    if (personMatch) {
      filters.hasPerson = personMatch[1];
    }

    // Detect tag references (e.g., "tagged as wedding")
    const tagMatch = normalizedQuery.match(/(?:tagged\s+(?:as\s+)?|tag:)(\w+)/i);
    if (tagMatch) {
      filters.hasTag = tagMatch[1];
    }

    // Detect date references
    if (
      normalizedQuery.includes('last week') ||
      normalizedQuery.includes('this week')
    ) {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      filters.dateRange = {
        from: weekAgo.toISOString().split('T')[0],
        to: now.toISOString().split('T')[0],
      };
    } else if (
      normalizedQuery.includes('last month') ||
      normalizedQuery.includes('this month')
    ) {
      const now = new Date();
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      filters.dateRange = {
        from: monthAgo.toISOString().split('T')[0],
        to: now.toISOString().split('T')[0],
      };
    }

    // Extract remaining keywords (remove filter phrases)
    const cleanedQuery = normalizedQuery
      .replace(/(?:gallery|galleries|photo|photos|image|tag|person|people|face|comment)/gi, '')
      .replace(/(?:of|with|featuring)\s+\w+/gi, '')
      .replace(/(?:tagged\s+(?:as\s+)?|tag:)\w+/gi, '')
      .replace(/(?:last|this)\s+(?:week|month)/gi, '')
      .trim();

    if (cleanedQuery) {
      keywords.push(...cleanedQuery.split(/\s+/).filter((k) => k.length > 2));
    }

    return { keywords, filters };
  }
}

// Export singleton instance for convenience
export const searchService = SearchService;

export default searchService;
