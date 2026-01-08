/**
 * OAuth Routes.
 *
 * Handles OAuth authentication flows for cloud storage providers:
 * - Initiate OAuth flow (redirect to provider)
 * - OAuth callback handler
 * - Token exchange
 *
 * @module routes/oauth.routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID, randomBytes } from 'node:crypto';
import { Provider } from '../types.js';
import { ProviderFactory, type OAuthState } from '../providers/index.js';
import { getCredentialService } from '../services/index.js';
import { cacheSet, cacheGet, cacheDelete } from '../cache/redis-client.js';
import { config } from '../config/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Connect request parameters.
 */
interface ConnectParams {
  provider: string;
}

/**
 * Connect query parameters.
 */
interface ConnectQuery {
  redirect_url?: string;
}

/**
 * Callback query parameters.
 */
interface CallbackQuery {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** OAuth state TTL in seconds (10 minutes) */
const OAUTH_STATE_TTL = 600;

/** Cache key prefix for OAuth state */
const OAUTH_STATE_PREFIX = 'oauth-state:';

// ============================================================================
// Routes
// ============================================================================

/**
 * Register OAuth routes.
 */
export async function oauthRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * Initiate OAuth connection flow.
   *
   * POST /api/v1/sync/providers/{provider}/connect
   */
  fastify.post<{
    Params: ConnectParams;
    Querystring: ConnectQuery;
  }>('/api/v1/sync/providers/:provider/connect', {
    schema: {
      description: 'Initiate OAuth flow for a cloud storage provider',
      tags: ['OAuth'],
      params: {
        type: 'object',
        required: ['provider'],
        properties: {
          provider: {
            type: 'string',
            enum: Object.values(Provider),
            description: 'Cloud storage provider',
          },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          redirect_url: {
            type: 'string',
            description: 'URL to redirect after OAuth completion',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            authorizationUrl: { type: 'string' },
            state: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { provider } = request.params;
    const { redirect_url: redirectUrl } = request.query;

    // Get user ID from JWT (assuming auth middleware sets this)
    const userId = (request as any).user?.id;

    if (!userId) {
      return reply.status(401).send({
        error: 'unauthorized',
        message: 'Authentication required',
      });
    }

    // Validate provider
    const providerType = provider as Provider;

    if (!ProviderFactory.isSupported(providerType)) {
      return reply.status(400).send({
        error: 'invalid_provider',
        message: `Provider not supported: ${provider}`,
      });
    }

    // Generate OAuth state
    const state = randomUUID();
    const codeVerifier = randomBytes(32).toString('base64url');

    const oauthState: OAuthState = {
      state,
      codeVerifier,
      redirectUrl: redirectUrl || config.DEFAULT_OAUTH_REDIRECT,
      userId,
      createdAt: new Date(),
    };

    // Store state in Redis
    await cacheSet(`${OAUTH_STATE_PREFIX}${state}`, oauthState, {
      ttlSeconds: OAUTH_STATE_TTL,
    });

    // Create provider instance and get authorization URL
    const providerInstance = ProviderFactory.create(providerType, { userId });
    const authorizationUrl = providerInstance.getAuthorizationUrl(oauthState);

    return reply.send({
      authorizationUrl,
      state,
    });
  });

  /**
   * OAuth callback handler.
   *
   * GET /api/v1/sync/providers/{provider}/callback
   */
  fastify.get<{
    Params: ConnectParams;
    Querystring: CallbackQuery;
  }>('/api/v1/sync/providers/:provider/callback', {
    schema: {
      description: 'OAuth callback handler',
      tags: ['OAuth'],
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
      querystring: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          state: { type: 'string' },
          error: { type: 'string' },
          error_description: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { provider } = request.params;
    const { code, state, error, error_description: errorDescription } = request.query;

    // Handle OAuth error
    if (error) {
      console.error('[OAuth] Provider returned error', {
        provider,
        error,
        errorDescription,
      });

      // Redirect with error
      return reply.redirect(
        `${config.FRONTEND_URL}/settings/integrations?error=${encodeURIComponent(error)}`
      );
    }

    // Validate state and code
    if (!state || !code) {
      return reply.redirect(
        `${config.FRONTEND_URL}/settings/integrations?error=invalid_callback`
      );
    }

    // Get OAuth state from Redis
    const oauthState = await cacheGet<OAuthState>(`${OAUTH_STATE_PREFIX}${state}`);

    if (!oauthState) {
      console.error('[OAuth] Invalid or expired state', { state });
      return reply.redirect(
        `${config.FRONTEND_URL}/settings/integrations?error=invalid_state`
      );
    }

    // Delete state from Redis (one-time use)
    await cacheDelete(`${OAUTH_STATE_PREFIX}${state}`);

    const providerType = provider as Provider;
    const { userId, codeVerifier, redirectUrl } = oauthState;

    try {
      // Create provider instance
      const providerInstance = ProviderFactory.create(providerType, { userId });

      // Exchange authorization code for tokens
      const tokens = await providerInstance.exchangeAuthorizationCode({
        code,
        state,
        codeVerifier,
      });

      // Get account info
      const accountInfo = await providerInstance.getAccountInfo(tokens.accessToken);

      // Save tokens
      const credentialService = getCredentialService();
      await credentialService.saveTokens({
        userId,
        provider: providerType,
        tokens,
        accountInfo,
      });

      console.log('[OAuth] Provider connected', {
        userId,
        provider,
        accountId: accountInfo.accountId,
        email: accountInfo.email,
      });

      // Redirect to success page
      return reply.redirect(
        `${redirectUrl || config.FRONTEND_URL}/settings/integrations?provider=${provider}&connected=true`
      );
    } catch (err) {
      console.error('[OAuth] Token exchange failed', {
        provider,
        error: err instanceof Error ? err.message : 'Unknown error',
      });

      return reply.redirect(
        `${config.FRONTEND_URL}/settings/integrations?error=token_exchange_failed`
      );
    }
  });

  /**
   * Disconnect a provider.
   *
   * DELETE /api/v1/sync/providers/{provider}/disconnect
   */
  fastify.delete<{
    Params: ConnectParams;
  }>('/api/v1/sync/providers/:provider/disconnect', {
    schema: {
      description: 'Disconnect a cloud storage provider',
      tags: ['OAuth'],
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
            success: { type: 'boolean' },
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

    const disconnected = await credentialService.disconnectProvider(userId, providerType);

    if (!disconnected) {
      return reply.status(404).send({
        error: 'not_found',
        message: `Provider not connected: ${provider}`,
      });
    }

    console.log('[OAuth] Provider disconnected', { userId, provider });

    return reply.send({
      success: true,
      message: `Provider ${provider} disconnected successfully`,
    });
  });
}

export default oauthRoutes;
