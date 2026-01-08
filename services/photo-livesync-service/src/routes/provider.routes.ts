/**
 * Provider Routes.
 *
 * Provides endpoints for provider status and management:
 * - List connected providers
 * - Get provider status
 * - List supported providers
 *
 * @module routes/provider.routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Provider } from '../types.js';
import { getCredentialService } from '../services/index.js';
import { ProviderFactory } from '../providers/index.js';
import { CredentialStatus } from '../db/repositories/provider-credential.repository.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Provider parameter.
 */
interface ProviderParams {
  provider: string;
}

// ============================================================================
// Routes
// ============================================================================

/**
 * Register provider routes.
 */
export async function providerRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * List supported providers.
   *
   * GET /api/v1/sync/providers
   */
  fastify.get('/api/v1/sync/providers', {
    schema: {
      description: 'List all supported cloud storage providers',
      tags: ['Providers'],
      response: {
        200: {
          type: 'object',
          properties: {
            providers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  supported: { type: 'boolean' },
                  features: {
                    type: 'object',
                    properties: {
                      incrementalSync: { type: 'boolean' },
                      albums: { type: 'boolean' },
                      resumableDownloads: { type: 'boolean' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const allProviders = Object.values(Provider);
    const supportedProviders = ProviderFactory.getSupportedProviders();

    const providers = allProviders.map((providerId) => {
      const config = ProviderFactory.getConfig(providerId);
      const isSupported = supportedProviders.includes(providerId);

      return {
        id: providerId,
        name: getProviderDisplayName(providerId),
        supported: isSupported,
        features: config ? {
          incrementalSync: config.supportsIncrementalSync,
          albums: config.supportsAlbums,
          resumableDownloads: config.supportsResumableDownloads,
        } : {
          incrementalSync: false,
          albums: false,
          resumableDownloads: false,
        },
      };
    });

    return reply.send({ providers });
  });

  /**
   * Get user's connected providers.
   *
   * GET /api/v1/sync/providers/connected
   */
  fastify.get('/api/v1/sync/providers/connected', {
    schema: {
      description: 'List connected providers for current user',
      tags: ['Providers'],
      response: {
        200: {
          type: 'object',
          properties: {
            providers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  status: { type: 'string' },
                  accountEmail: { type: 'string', nullable: true },
                  connectedAt: { type: 'string' },
                  lastSyncAt: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const userId = (request as any).user?.id;

    if (!userId) {
      return reply.status(401).send({
        error: 'unauthorized',
        message: 'Authentication required',
      });
    }

    const credentialService = getCredentialService();
    const credentials = await credentialService.getUserCredentials(userId);

    const providers = credentials.map((cred) => ({
      id: cred.provider,
      name: getProviderDisplayName(cred.provider),
      status: cred.status,
      accountEmail: cred.providerAccountEmail || null,
      connectedAt: cred.createdAt.toISOString(),
      lastSyncAt: cred.lastSyncAt?.toISOString() || null,
    }));

    return reply.send({ providers });
  });

  /**
   * Get provider connection status.
   *
   * GET /api/v1/sync/providers/{provider}/status
   */
  fastify.get<{
    Params: ProviderParams;
  }>('/api/v1/sync/providers/:provider/status', {
    schema: {
      description: 'Get connection status for a specific provider',
      tags: ['Providers'],
      params: {
        type: 'object',
        required: ['provider'],
        properties: {
          provider: {
            type: 'string',
            enum: Object.values(Provider),
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            provider: { type: 'string' },
            connected: { type: 'boolean' },
            status: { type: 'string', nullable: true },
            accountEmail: { type: 'string', nullable: true },
            connectedAt: { type: 'string', nullable: true },
            expiresAt: { type: 'string', nullable: true },
            lastSyncAt: { type: 'string', nullable: true },
            syncCursor: { type: 'boolean' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { provider } = request.params;
    const userId = (request as any).user?.id;

    if (!userId) {
      return reply.status(401).send({
        error: 'unauthorized',
        message: 'Authentication required',
      });
    }

    const providerType = provider as Provider;
    const credentialService = getCredentialService();
    const credential = await credentialService.getCredential(userId, providerType);

    if (!credential) {
      return reply.send({
        provider,
        connected: false,
        status: null,
        accountEmail: null,
        connectedAt: null,
        expiresAt: null,
        lastSyncAt: null,
        syncCursor: false,
      });
    }

    return reply.send({
      provider,
      connected: credential.status === CredentialStatus.ACTIVE,
      status: credential.status,
      accountEmail: credential.providerAccountEmail || null,
      connectedAt: credential.createdAt.toISOString(),
      expiresAt: credential.accessTokenExpiresAt.toISOString(),
      lastSyncAt: credential.lastSyncAt?.toISOString() || null,
      syncCursor: !!credential.syncCursor,
    });
  });

  /**
   * Validate provider connection.
   *
   * POST /api/v1/sync/providers/{provider}/validate
   */
  fastify.post<{
    Params: ProviderParams;
  }>('/api/v1/sync/providers/:provider/validate', {
    schema: {
      description: 'Validate provider connection by testing API access',
      tags: ['Providers'],
      params: {
        type: 'object',
        required: ['provider'],
        properties: {
          provider: {
            type: 'string',
            enum: Object.values(Provider),
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            valid: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { provider } = request.params;
    const userId = (request as any).user?.id;

    if (!userId) {
      return reply.status(401).send({
        error: 'unauthorized',
        message: 'Authentication required',
      });
    }

    const providerType = provider as Provider;
    const credentialService = getCredentialService();
    const credential = await credentialService.getActiveCredential(userId, providerType);

    if (!credential) {
      return reply.send({
        valid: false,
        message: 'Provider not connected',
      });
    }

    // Test connection
    try {
      const providerInstance = ProviderFactory.create(providerType, { userId });
      const isValid = await providerInstance.testConnection(credential.accessToken);

      return reply.send({
        valid: isValid,
        message: isValid ? 'Connection valid' : 'Connection test failed',
      });
    } catch (error) {
      return reply.send({
        valid: false,
        message: error instanceof Error ? error.message : 'Connection test failed',
      });
    }
  });
}

/**
 * Get display name for a provider.
 */
function getProviderDisplayName(provider: Provider): string {
  const names: Record<Provider, string> = {
    [Provider.GOOGLE_PHOTOS]: 'Google Photos',
    [Provider.DROPBOX]: 'Dropbox',
    [Provider.ONEDRIVE]: 'OneDrive',
    [Provider.AMAZON_PHOTOS]: 'Amazon Photos',
    [Provider.ICLOUD]: 'iCloud Photos',
  };

  return names[provider] || provider;
}

export default providerRoutes;
