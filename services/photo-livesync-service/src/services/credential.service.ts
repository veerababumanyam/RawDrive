/**
 * Credential Service.
 *
 * Manages OAuth credentials for cloud storage providers:
 * - Token storage with encryption
 * - Automatic token refresh
 * - Provider connection/disconnection
 *
 * @module services/credential.service
 */

import { Provider } from '../types.js';
import {
  type ProviderCredential,
  type ProviderCredentialSummary,
  CredentialStatus,
  findCredentialById,
  findCredentialByUserAndProvider,
  findCredentialsByUserId,
  findActiveCredential,
  findCredentialsNeedingRefresh,
  upsertProviderCredential,
  updateTokens,
  updateCredentialStatus,
  markCredentialExpired,
  markRefreshFailed,
  disconnectProvider,
  deleteCredentialByUserAndProvider,
  getConnectedProviders,
  type CreateProviderCredentialInput,
  type CredentialError,
} from '../db/repositories/provider-credential.repository.js';
import {
  ProviderFactory,
  type OAuthTokens,
  type ProviderAccountInfo,
} from '../providers/index.js';
import { acquireLock, releaseLock } from '../cache/redis-client.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for saving OAuth tokens.
 */
export interface SaveTokensOptions {
  userId: string;
  provider: Provider;
  tokens: OAuthTokens;
  accountInfo?: ProviderAccountInfo;
}

/**
 * Token refresh result.
 */
export interface TokenRefreshResult {
  success: boolean;
  credential?: ProviderCredential;
  error?: string;
}

// ============================================================================
// Credential Service
// ============================================================================

/**
 * Credential service class.
 */
export class CredentialService {
  /**
   * Get a credential by ID.
   */
  async getCredentialById(id: string): Promise<ProviderCredential | null> {
    return findCredentialById(id);
  }

  /**
   * Get a credential by user and provider.
   */
  async getCredential(
    userId: string,
    provider: Provider
  ): Promise<ProviderCredential | null> {
    return findCredentialByUserAndProvider(userId, provider);
  }

  /**
   * Get an active credential for API calls.
   *
   * Returns null if credential doesn't exist or isn't active.
   */
  async getActiveCredential(
    userId: string,
    provider: Provider
  ): Promise<ProviderCredential | null> {
    return findActiveCredential(userId, provider);
  }

  /**
   * Get all credentials for a user.
   */
  async getUserCredentials(userId: string): Promise<ProviderCredentialSummary[]> {
    return findCredentialsByUserId(userId);
  }

  /**
   * Get connected providers for a user.
   */
  async getConnectedProviders(userId: string): Promise<Provider[]> {
    return getConnectedProviders(userId);
  }

  /**
   * Save OAuth tokens after successful authentication.
   */
  async saveTokens(options: SaveTokensOptions): Promise<ProviderCredential> {
    const { userId, provider, tokens, accountInfo } = options;

    const accessTokenExpiresAt = new Date(Date.now() + tokens.expiresIn * 1000);
    const refreshTokenExpiresAt = tokens.refreshTokenExpiresIn
      ? new Date(Date.now() + tokens.refreshTokenExpiresIn * 1000)
      : undefined;

    const input: CreateProviderCredentialInput = {
      userId,
      provider,
      providerAccountId: accountInfo?.accountId || 'unknown',
      providerAccountEmail: accountInfo?.email,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenType: tokens.tokenType,
      scope: tokens.scope,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    };

    return upsertProviderCredential(input);
  }

  /**
   * Refresh tokens for a credential.
   *
   * Uses distributed locking to prevent concurrent refresh attempts.
   */
  async refreshTokens(credentialId: string): Promise<TokenRefreshResult> {
    // Acquire lock to prevent concurrent refresh
    const lockKey = `token-refresh:${credentialId}`;
    const lock = await acquireLock(lockKey, {
      ttlMs: 30000,
      retryCount: 3,
    });

    if (!lock.acquired) {
      return {
        success: false,
        error: 'Token refresh already in progress',
      };
    }

    try {
      // Get current credential
      const credential = await findCredentialById(credentialId);

      if (!credential) {
        return {
          success: false,
          error: 'Credential not found',
        };
      }

      if (!credential.refreshToken) {
        return {
          success: false,
          error: 'No refresh token available',
        };
      }

      // Create provider instance for refresh
      const providerInstance = ProviderFactory.create(credential.provider, {
        userId: credential.userId,
      });

      // Attempt token refresh
      const newTokens = await providerInstance.refreshAccessToken(credential.refreshToken);

      // Calculate new expiration
      const accessTokenExpiresAt = new Date(Date.now() + newTokens.expiresIn * 1000);
      const refreshTokenExpiresAt = newTokens.refreshTokenExpiresIn
        ? new Date(Date.now() + newTokens.refreshTokenExpiresIn * 1000)
        : undefined;

      // Update tokens in database
      const updatedCredential = await updateTokens(credentialId, {
        accessToken: newTokens.accessToken,
        refreshToken: newTokens.refreshToken,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
        scope: newTokens.scope,
      });

      if (!updatedCredential) {
        return {
          success: false,
          error: 'Failed to update tokens',
        };
      }

      console.log('[CredentialService] Token refreshed successfully', {
        credentialId,
        provider: credential.provider,
      });

      return {
        success: true,
        credential: updatedCredential,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.error('[CredentialService] Token refresh failed', {
        credentialId,
        error: errorMessage,
      });

      // Mark credential as refresh failed
      const credentialError: CredentialError = {
        code: 'REFRESH_FAILED',
        message: errorMessage,
        timestamp: new Date().toISOString(),
      };

      await markRefreshFailed(credentialId, credentialError);

      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      await releaseLock(lock.key, lock.lockId);
    }
  }

  /**
   * Refresh all credentials that are expiring soon.
   */
  async refreshExpiringCredentials(thresholdMinutes = 5): Promise<{
    total: number;
    success: number;
    failed: number;
  }> {
    const expiringCredentials = await findCredentialsNeedingRefresh(
      thresholdMinutes,
      100
    );

    const results = {
      total: expiringCredentials.length,
      success: 0,
      failed: 0,
    };

    for (const credential of expiringCredentials) {
      const result = await this.refreshTokens(credential.id);

      if (result.success) {
        results.success++;
      } else {
        results.failed++;
      }
    }

    return results;
  }

  /**
   * Disconnect a provider for a user.
   *
   * Optionally revokes tokens with the provider.
   */
  async disconnectProvider(
    userId: string,
    provider: Provider,
    revokeToken = true
  ): Promise<boolean> {
    const credential = await findActiveCredential(userId, provider);

    if (!credential) {
      return false;
    }

    // Revoke token with provider
    if (revokeToken) {
      try {
        const providerInstance = ProviderFactory.create(provider, { userId });
        await providerInstance.revokeToken(credential.accessToken);
      } catch (error) {
        console.warn('[CredentialService] Token revocation failed', {
          userId,
          provider,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // Continue with disconnect even if revocation fails
      }
    }

    // Mark credential as disconnected
    await disconnectProvider(userId, provider);

    console.log('[CredentialService] Provider disconnected', {
      userId,
      provider,
    });

    return true;
  }

  /**
   * Delete a provider credential permanently.
   */
  async deleteCredential(userId: string, provider: Provider): Promise<boolean> {
    return deleteCredentialByUserAndProvider(userId, provider);
  }

  /**
   * Validate a credential by testing connection to provider.
   */
  async validateCredential(credentialId: string): Promise<boolean> {
    const credential = await findCredentialById(credentialId);

    if (!credential) {
      return false;
    }

    try {
      const providerInstance = ProviderFactory.create(credential.provider, {
        userId: credential.userId,
      });

      return await providerInstance.testConnection(credential.accessToken);
    } catch {
      return false;
    }
  }

  /**
   * Mark a credential as expired.
   */
  async markExpired(credentialId: string): Promise<void> {
    await markCredentialExpired(credentialId);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let credentialServiceInstance: CredentialService | null = null;

/**
 * Get the credential service instance.
 */
export function getCredentialService(): CredentialService {
  if (!credentialServiceInstance) {
    credentialServiceInstance = new CredentialService();
  }
  return credentialServiceInstance;
}

export default CredentialService;
