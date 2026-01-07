/**
 * Routes Module.
 *
 * Exports all route registration functions.
 *
 * @module routes
 */

import { FastifyInstance } from 'fastify';

export { healthRoutes } from './health.routes.js';
export { oauthRoutes } from './oauth.routes.js';
export { syncRoutes } from './sync.routes.js';
export { providerRoutes } from './provider.routes.js';

/**
 * Register all routes.
 */
export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  const { healthRoutes } = await import('./health.routes.js');
  const { oauthRoutes } = await import('./oauth.routes.js');
  const { syncRoutes } = await import('./sync.routes.js');
  const { providerRoutes } = await import('./provider.routes.js');

  await fastify.register(healthRoutes);
  await fastify.register(oauthRoutes);
  await fastify.register(syncRoutes);
  await fastify.register(providerRoutes);
}

export default registerRoutes;
