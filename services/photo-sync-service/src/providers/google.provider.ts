/**
 * Google Photos Provider Implementation.
 *
 * Implements the IPhotoProvider interface for Google Photos API v1.
 * Supports OAuth2 authentication, photo listing, and downloading.
 *
 * API Reference: https://developers.google.com/photos/library/reference/rest
 *
 * @module providers/google.provider
 */

import { Provider } from '../types.js';
import {
  type ProviderConfig,
  type OAuthTokens,
  type ProviderAccountInfo,
  type OAuthState,
  type OAuthExchangeParams,
  type ProviderPhoto,
  type ProviderPhotoMetadata,
  type PhotoListResult,
  type PhotoListOptions,
  type AlbumListResult,
  type ProviderAlbum,
  type DownloadOptions,
  type DownloadResult,
  ProviderErrorCode,
} from './provider.interface.js';
import {
  BasePhotoProvider,
  type BaseProviderOptions,
  type HttpResponse,
} from './base.provider.js';
import { config } from '../config/index.js';

// ============================================================================
// Google Photos API Types
// ============================================================================

interface GoogleMediaItem {
  id: string;
  description?: string;
  productUrl: string;
  baseUrl: string;
  mimeType: string;
  filename: string;
  mediaMetadata: {
    creationTime: string;
    width?: string;
    height?: string;
    photo?: {
      cameraMake?: string;
      cameraModel?: string;
      focalLength?: number;
      apertureFNumber?: number;
      isoEquivalent?: number;
      exposureTime?: string;
    };
    video?: {
      cameraMake?: string;
      cameraModel?: string;
      fps?: number;
      status?: string;
    };
  };
  contributorInfo?: {
    profilePictureBaseUrl: string;
    displayName: string;
  };
}

interface GoogleMediaItemsResponse {
  mediaItems?: GoogleMediaItem[];
  nextPageToken?: string;
}

interface GoogleAlbum {
  id: string;
  title: string;
  productUrl: string;
  mediaItemsCount?: string;
  coverPhotoBaseUrl?: string;
  coverPhotoMediaItemId?: string;
  isWriteable?: boolean;
}

interface GoogleAlbumsResponse {
  albums?: GoogleAlbum[];
  nextPageToken?: string;
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token?: string;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Google Photos provider configuration.
 */
export const GOOGLE_PHOTOS_CONFIG: ProviderConfig = {
  provider: Provider.GOOGLE_PHOTOS,
  oauth: {
    clientId: config.GOOGLE_CLIENT_ID,
    clientSecret: config.GOOGLE_CLIENT_SECRET,
    redirectUri: config.GOOGLE_REDIRECT_URI,
    scopes: [
      'https://www.googleapis.com/auth/photoslibrary.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    revokeUrl: 'https://oauth2.googleapis.com/revoke',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
  },
  apiBaseUrl: 'https://photoslibrary.googleapis.com/v1',
  apiVersion: 'v1',
  maxRequestsPerMinute: 60, // Google Photos has strict rate limits
  maxConcurrentDownloads: 5,
  defaultPageSize: 100,
  maxPageSize: 100,
  supportedFormats: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic'],
  supportsResumableDownloads: false,
  supportsIncrementalSync: false, // Google Photos doesn't have a changes API
  supportsAlbums: true,
  requestTimeoutMs: 30000,
  downloadTimeoutMs: 300000,
};

// ============================================================================
// Provider Implementation
// ============================================================================

/**
 * Google Photos provider implementation.
 *
 * @example
 * ```ts
 * const provider = new GooglePhotosProvider({
 *   userId: 'user-123',
 *   onTokenRefresh: async (tokens) => {
 *     await saveTokens(tokens);
 *   },
 * });
 *
 * const authUrl = provider.getAuthorizationUrl(state);
 * // Redirect user to authUrl...
 *
 * // After callback with authorization code:
 * const tokens = await provider.exchangeAuthorizationCode({ code, state });
 * provider.setTokens(tokens.accessToken, tokens.refreshToken, expiresAt);
 *
 * // List photos:
 * const photos = await provider.listPhotos(tokens.accessToken, { pageSize: 50 });
 * ```
 */
export class GooglePhotosProvider extends BasePhotoProvider {
  // ===========================================================================
  // Constructor
  // ===========================================================================

  constructor(options: BaseProviderOptions) {
    super(Provider.GOOGLE_PHOTOS, GOOGLE_PHOTOS_CONFIG, options);
  }

  // ===========================================================================
  // Authentication Methods
  // ===========================================================================

  /**
   * Generate Google OAuth authorization URL.
   */
  getAuthorizationUrl(state: OAuthState): string {
    return this.buildAuthorizationUrl(state, {
      include_granted_scopes: 'true',
    });
  }

  /**
   * Exchange authorization code for tokens.
   */
  async exchangeAuthorizationCode(params: OAuthExchangeParams): Promise<OAuthTokens> {
    const body: Record<string, string> = {
      client_id: this.config.oauth.clientId,
      client_secret: this.config.oauth.clientSecret,
      code: params.code,
      grant_type: 'authorization_code',
      redirect_uri: this.config.oauth.redirectUri,
    };

    if (params.codeVerifier) {
      body.code_verifier = params.codeVerifier;
    }

    const response = await this.oauthRequest<GoogleTokenResponse>(
      this.config.oauth.tokenUrl,
      body
    );

    return this.mapTokenResponse(response.data);
  }

  /**
   * Refresh access token using refresh token.
   */
  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    const body: Record<string, string> = {
      client_id: this.config.oauth.clientId,
      client_secret: this.config.oauth.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    };

    const response = await this.oauthRequest<GoogleTokenResponse>(
      this.config.oauth.tokenUrl,
      body
    );

    // Google doesn't return a new refresh token on refresh
    const tokens = this.mapTokenResponse(response.data);
    if (!tokens.refreshToken) {
      tokens.refreshToken = refreshToken;
    }

    return tokens;
  }

  /**
   * Revoke OAuth tokens.
   */
  async revokeToken(accessToken: string): Promise<boolean> {
    try {
      await fetch(
        `${this.config.oauth.revokeUrl}?token=${encodeURIComponent(accessToken)}`,
        { method: 'POST' }
      );
      return true;
    } catch (error) {
      this.logError('Token revocation failed', error);
      return false;
    }
  }

  /**
   * Get user account information.
   */
  async getAccountInfo(accessToken: string): Promise<ProviderAccountInfo> {
    const response = await this.request<GoogleUserInfo>(
      this.config.oauth.userInfoUrl!,
      accessToken,
      { skipRateLimit: true }
    );

    return {
      accountId: response.data.id,
      email: response.data.email,
      displayName: response.data.name,
      profilePictureUrl: response.data.picture,
    };
  }

  /**
   * Validate access token by making a test API call.
   */
  async validateToken(accessToken: string): Promise<boolean> {
    try {
      await this.request(
        '/mediaItems',
        accessToken,
        {
          query: { pageSize: 1 },
          skipRetry: true,
          skipCircuitBreaker: true,
        }
      );
      return true;
    } catch (error) {
      return false;
    }
  }

  // ===========================================================================
  // Photo Listing Methods
  // ===========================================================================

  /**
   * List photos from Google Photos library.
   */
  async listPhotos(
    accessToken: string,
    options: PhotoListOptions = {}
  ): Promise<PhotoListResult> {
    const pageSize = this.getPageSize(options.pageSize);

    const response = await this.request<GoogleMediaItemsResponse>(
      '/mediaItems',
      accessToken,
      {
        query: {
          pageSize,
          pageToken: options.pageToken,
        },
      }
    );

    const photos = (response.data.mediaItems || [])
      .filter((item) => !this.isVideo(item) || options.includeVideos)
      .map((item) => this.mapMediaItemToPhoto(item));

    return {
      photos,
      nextPageToken: response.data.nextPageToken,
      hasMore: !!response.data.nextPageToken,
    };
  }

  /**
   * Get a single photo by ID.
   */
  async getPhoto(accessToken: string, photoId: string): Promise<ProviderPhoto | null> {
    try {
      const response = await this.request<GoogleMediaItem>(
        `/mediaItems/${photoId}`,
        accessToken
      );
      return this.mapMediaItemToPhoto(response.data);
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        const providerError = error as { code: ProviderErrorCode };
        if (providerError.code === ProviderErrorCode.NOT_FOUND) {
          return null;
        }
      }
      throw error;
    }
  }

  /**
   * Get multiple photos by IDs (batched).
   */
  async getPhotos(
    accessToken: string,
    photoIds: string[]
  ): Promise<Map<string, ProviderPhoto>> {
    const results = new Map<string, ProviderPhoto>();

    // Google Photos supports batch get via mediaItems:batchGet
    const chunks = this.chunkArray(photoIds, 50); // Max 50 items per batch

    for (const chunk of chunks) {
      try {
        const response = await this.request<{ mediaItemResults: Array<{ mediaItem?: GoogleMediaItem; status?: { message: string } }> }>(
          '/mediaItems:batchGet',
          accessToken,
          {
            query: {
              mediaItemIds: chunk.join(','),
            },
          }
        );

        for (const result of response.data.mediaItemResults || []) {
          if (result.mediaItem) {
            const photo = this.mapMediaItemToPhoto(result.mediaItem);
            results.set(result.mediaItem.id, photo);
          }
        }
      } catch (error) {
        this.logError('Batch get failed, falling back to individual fetches', error);
        // Fall back to individual fetches for this chunk
        for (const id of chunk) {
          try {
            const photo = await this.getPhoto(accessToken, id);
            if (photo) {
              results.set(id, photo);
            }
          } catch (e) {
            this.logDebug('Failed to fetch photo', { photoId: id, error: e });
          }
        }
      }
    }

    return results;
  }

  // ===========================================================================
  // Album Methods
  // ===========================================================================

  /**
   * List albums from Google Photos.
   */
  async listAlbums(accessToken: string, pageToken?: string): Promise<AlbumListResult> {
    const response = await this.request<GoogleAlbumsResponse>(
      '/albums',
      accessToken,
      {
        query: {
          pageSize: 50,
          pageToken,
        },
      }
    );

    const albums: ProviderAlbum[] = (response.data.albums || []).map((album) => ({
      id: album.id,
      name: album.title,
      itemCount: album.mediaItemsCount ? parseInt(album.mediaItemsCount, 10) : undefined,
      coverPhotoUrl: album.coverPhotoBaseUrl,
      isShared: false, // Shared albums are listed separately
    }));

    return {
      albums,
      nextPageToken: response.data.nextPageToken,
      hasMore: !!response.data.nextPageToken,
    };
  }

  /**
   * List photos from a specific album.
   */
  async listAlbumPhotos(
    accessToken: string,
    albumId: string,
    options: PhotoListOptions = {}
  ): Promise<PhotoListResult> {
    const pageSize = this.getPageSize(options.pageSize);

    // Google Photos requires POST for album photos with albumId in body
    const response = await this.request<GoogleMediaItemsResponse>(
      '/mediaItems:search',
      accessToken,
      {
        method: 'POST',
        body: {
          albumId,
          pageSize,
          pageToken: options.pageToken,
        },
      }
    );

    const photos = (response.data.mediaItems || [])
      .filter((item) => !this.isVideo(item) || options.includeVideos)
      .map((item) => this.mapMediaItemToPhoto(item));

    return {
      photos,
      nextPageToken: response.data.nextPageToken,
      hasMore: !!response.data.nextPageToken,
    };
  }

  // ===========================================================================
  // Download Methods
  // ===========================================================================

  /**
   * Download a photo by ID.
   */
  async downloadPhoto(
    accessToken: string,
    photoId: string,
    options: DownloadOptions = {}
  ): Promise<DownloadResult> {
    // First, get the photo to get the download URL
    const photo = await this.getPhoto(accessToken, photoId);

    if (!photo) {
      throw this.createProviderError(
        ProviderErrorCode.NOT_FOUND,
        `Photo not found: ${photoId}`
      );
    }

    return this.downloadFromUrl(accessToken, photo.downloadUrl, options);
  }

  /**
   * Download a photo from URL.
   *
   * Google Photos URLs need quality parameters appended:
   * - =d for original download
   * - =w{width}-h{height} for resized
   */
  async downloadFromUrl(
    accessToken: string,
    downloadUrl: string,
    options: DownloadOptions = {}
  ): Promise<DownloadResult> {
    // Append quality parameter to Google Photos URL
    let url = downloadUrl;

    if (options.quality === 'original' || !options.quality) {
      url = `${downloadUrl}=d`; // Original download
    } else if (options.maxWidth || options.maxHeight) {
      const params: string[] = [];
      if (options.maxWidth) params.push(`w${options.maxWidth}`);
      if (options.maxHeight) params.push(`h${options.maxHeight}`);
      url = `${downloadUrl}=${params.join('-')}`;
    } else {
      // Default quality mappings
      const qualityMap: Record<string, string> = {
        high: 'w2048-h2048',
        medium: 'w1024-h1024',
        low: 'w512-h512',
      };
      url = `${downloadUrl}=${qualityMap[options.quality] || 'd'}`;
    }

    return this.downloadStream(url, accessToken, options);
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Test connection to Google Photos API.
   */
  async testConnection(accessToken: string): Promise<boolean> {
    try {
      await this.listPhotos(accessToken, { pageSize: 1 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Map Google token response to OAuthTokens.
   */
  private mapTokenResponse(response: GoogleTokenResponse): OAuthTokens {
    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      tokenType: response.token_type,
      expiresIn: response.expires_in,
      scope: response.scope,
      idToken: response.id_token,
    };
  }

  /**
   * Map Google MediaItem to ProviderPhoto.
   */
  private mapMediaItemToPhoto(item: GoogleMediaItem): ProviderPhoto {
    const metadata: ProviderPhotoMetadata = {};

    if (item.mediaMetadata.photo) {
      const photo = item.mediaMetadata.photo;
      if (photo.cameraMake) metadata.cameraMake = photo.cameraMake;
      if (photo.cameraModel) metadata.cameraModel = photo.cameraModel;
      if (photo.focalLength) metadata.focalLength = photo.focalLength;
      if (photo.apertureFNumber) metadata.aperture = photo.apertureFNumber;
      if (photo.isoEquivalent) metadata.iso = photo.isoEquivalent;
      if (photo.exposureTime) {
        // Parse exposure time (e.g., "1/250s" or "0.004s")
        const match = photo.exposureTime.match(/(\d+(?:\.\d+)?)/);
        if (match) {
          metadata.exposureTime = parseFloat(match[1]);
        }
      }
    }

    const createdAt = new Date(item.mediaMetadata.creationTime);

    return {
      id: item.id,
      filename: item.filename,
      mimeType: item.mimeType,
      sizeBytes: 0, // Google Photos doesn't provide file size
      width: item.mediaMetadata.width ? parseInt(item.mediaMetadata.width, 10) : undefined,
      height: item.mediaMetadata.height ? parseInt(item.mediaMetadata.height, 10) : undefined,
      takenAt: createdAt,
      createdAt,
      modifiedAt: createdAt, // Google Photos doesn't have separate modified date
      downloadUrl: item.baseUrl,
      thumbnailUrl: `${item.baseUrl}=w200-h200`,
      metadata,
      description: item.description,
      isVideo: this.isVideo(item),
    };
  }

  /**
   * Check if media item is a video.
   */
  private isVideo(item: GoogleMediaItem): boolean {
    return item.mimeType.startsWith('video/') || !!item.mediaMetadata.video;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new Google Photos provider instance.
 */
export function createGooglePhotosProvider(options: BaseProviderOptions): GooglePhotosProvider {
  return new GooglePhotosProvider(options);
}

export default GooglePhotosProvider;
