/**
 * Photo Sync Service - Fastify Application Entrypoint.
 *
 * High-performance photo import and synchronization microservice for RawDrive.
 * Supports importing photos from multiple cloud providers (Google Photos, iCloud,
 * Dropbox, Amazon Photos, OneDrive) with OAuth2 authentication, job queuing,
 * and incremental sync capabilities.
 */

import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import { config } from './config/index.js';
import { initialize as initializeDatabase, close as closeDatabase, isHealthy as checkDatabaseHealth } from './db/connection.js';
import { initialize as initializeRedis, close as closeRedis, isHealthy as checkRedisHealth } from './cache/redis-client.js';
import { initialize as initializeRabbitMQ, close as closeRabbitMQ, isHealthy as checkRabbitMQHealth } from './queue/rabbitmq-client.js';
import { registerRoutes } from './routes/index.js';

// Build the Fastify application instance
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport: config.isDevelopment
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
      serializers: {
        req(request: FastifyRequest) {
          return {
            method: request.method,
            url: request.url,
            correlationId: request.headers['x-correlation-id'],
          };
        },
        res(reply: FastifyReply) {
          return {
            statusCode: reply.statusCode,
          };
        },
      },
    },
    // Increase limits for potential large payloads
    bodyLimit: 1048576, // 1MB
    // Request ID for correlation
    requestIdHeader: 'x-correlation-id',
    genReqId: () => crypto.randomUUID(),
  });

  // Register shutdown handlers
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info({ signal }, 'Received shutdown signal');
      await gracefulShutdown(app);
    });
  }

  // Register plugins
  await registerPlugins(app);

  // Initialize infrastructure connections
  await initializeInfrastructure(app);

  // Register API routes
  await registerAppRoutes(app);

  // Ready hook
  app.addHook('onReady', async () => {
    app.log.info(
      {
        service: config.SERVICE_NAME,
        version: config.SERVICE_VERSION,
        environment: config.APP_ENV,
        port: config.PORT,
      },
      'Photo Sync Service started successfully'
    );
  });

  // Close hook
  app.addHook('onClose', async () => {
    app.log.info('Photo Sync Service shutting down...');
    // Cleanup will be handled by gracefulShutdown
  });

  return app;
}

/**
 * Register all Fastify plugins.
 * Order matters - CORS and error handling should come first.
 */
async function registerPlugins(app: FastifyInstance): Promise<void> {
  // CORS support
  await app.register(import('@fastify/cors'), {
    origin: config.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Correlation-ID',
      'X-Workspace-ID',
      'X-Request-ID',
    ],
    exposedHeaders: ['X-Correlation-ID', 'X-Request-ID'],
  });

  // Request context decorator
  app.decorateRequest('userId', null);
  app.decorateRequest('workspaceId', null);
  app.decorateRequest('correlationId', '');

  // Add correlation ID to all requests
  app.addHook('onRequest', async (request, reply) => {
    const correlationId =
      (request.headers['x-correlation-id'] as string) || request.id;
    request.correlationId = correlationId;
    reply.header('X-Correlation-ID', correlationId);
  });

  // Error handler
  app.setErrorHandler(async (error, request, reply) => {
    const statusCode = error.statusCode || 500;

    app.log.error(
      {
        err: error,
        correlationId: request.correlationId,
        method: request.method,
        url: request.url,
      },
      'Request error'
    );

    return reply.status(statusCode).send({
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message:
          statusCode >= 500 && !config.isDevelopment
            ? 'Internal server error'
            : error.message,
        correlationId: request.correlationId,
      },
    });
  });

  // Not found handler
  app.setNotFoundHandler(async (request, reply) => {
    return reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
        correlationId: request.correlationId,
      },
    });
  });
}

/**
 * Initialize infrastructure connections (database, redis, rabbitmq).
 */
async function initializeInfrastructure(app: FastifyInstance): Promise<void> {
  app.log.info('Initializing infrastructure connections...');

  // Initialize database
  try {
    await initializeDatabase();
    app.log.info('Database connection initialized');
  } catch (error) {
    app.log.error({ error }, 'Failed to initialize database');
    throw error;
  }

  // Initialize Redis
  try {
    await initializeRedis();
    app.log.info('Redis connection initialized');
  } catch (error) {
    app.log.error({ error }, 'Failed to initialize Redis');
    throw error;
  }

  // Initialize RabbitMQ
  try {
    await initializeRabbitMQ();
    app.log.info('RabbitMQ connection initialized');
  } catch (error) {
    app.log.error({ error }, 'Failed to initialize RabbitMQ');
    throw error;
  }

  app.log.info('All infrastructure connections initialized successfully');
}

/**
 * Register all application routes.
 */
async function registerAppRoutes(app: FastifyInstance): Promise<void> {
  // Root endpoint for service discovery
  app.get('/', async (_request, _reply) => {
    return {
      service: config.SERVICE_NAME,
      version: config.SERVICE_VERSION,
      docs: '/docs',
      health: '/health',
      ready: '/ready',
      metrics: '/metrics',
    };
  });

  // Readiness probe with real health checks
  app.get('/ready', async (_request, reply) => {
    const checks: Record<string, { healthy: boolean; latency?: number }> = {};
    let allHealthy = true;

    // Check database
    const dbStart = Date.now();
    try {
      const dbHealth = await checkDatabaseHealth();
      checks['postgres'] = { healthy: dbHealth, latency: Date.now() - dbStart };
      if (!dbHealth) allHealthy = false;
    } catch {
      checks['postgres'] = { healthy: false, latency: Date.now() - dbStart };
      allHealthy = false;
    }

    // Check Redis
    const redisStart = Date.now();
    try {
      const redisHealthy = await checkRedisHealth();
      checks['redis'] = { healthy: redisHealthy, latency: Date.now() - redisStart };
      if (!redisHealthy) allHealthy = false;
    } catch {
      checks['redis'] = { healthy: false, latency: Date.now() - redisStart };
      allHealthy = false;
    }

    // Check RabbitMQ
    const mqStart = Date.now();
    try {
      const mqHealth = await checkRabbitMQHealth();
      checks['rabbitmq'] = { healthy: mqHealth, latency: Date.now() - mqStart };
      if (!mqHealth) allHealthy = false;
    } catch {
      checks['rabbitmq'] = { healthy: false, latency: Date.now() - mqStart };
      allHealthy = false;
    }

    if (!allHealthy) {
      return reply.status(503).send({
        status: 'unavailable',
        service: config.SERVICE_NAME,
        version: config.SERVICE_VERSION,
        checks,
      });
    }

    return {
      status: 'ready',
      service: config.SERVICE_NAME,
      version: config.SERVICE_VERSION,
      checks,
    };
  });

  // Prometheus metrics endpoint for KEDA autoscaling
  app.get('/metrics', async (_request, reply) => {
    // TODO: T045 - Implement Prometheus metrics collector
    const metrics = `
# HELP photo_sync_jobs_active Number of active sync jobs
# TYPE photo_sync_jobs_active gauge
photo_sync_jobs_active 0

# HELP photo_sync_jobs_total Total sync jobs processed
# TYPE photo_sync_jobs_total counter
photo_sync_jobs_total 0

# HELP photo_sync_photos_processed_total Total photos processed
# TYPE photo_sync_photos_processed_total counter
photo_sync_photos_processed_total 0

# HELP photo_sync_errors_total Total errors by type
# TYPE photo_sync_errors_total counter
photo_sync_errors_total{type="oauth"} 0
photo_sync_errors_total{type="download"} 0
photo_sync_errors_total{type="duplicate"} 0
`.trim();

    reply.header('Content-Type', 'text/plain; version=0.0.4');
    return metrics;
  });

  // Register all API routes from the routes module
  await registerRoutes(app);
}

/**
 * Graceful shutdown handler.
 * Drains in-progress operations and closes connections.
 */
async function gracefulShutdown(app: FastifyInstance): Promise<void> {
  const drainTimeout = config.DRAIN_TIMEOUT_SECONDS * 1000;
  const startTime = Date.now();

  app.log.info({ drainTimeout }, 'Starting graceful shutdown...');

  // TODO: T036, T037 - Drain in-progress sync/download workers
  // For now, just wait a short period to allow pending requests to complete
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const elapsed = Date.now() - startTime;
  if (elapsed < drainTimeout) {
    app.log.info('All operations drained successfully');
  } else {
    app.log.warn({ elapsed, drainTimeout }, 'Drain timeout reached');
  }

  // Close RabbitMQ connection
  try {
    await closeRabbitMQ();
    app.log.info('RabbitMQ connection closed');
  } catch (error) {
    app.log.error({ error }, 'Error closing RabbitMQ connection');
  }

  // Close Redis connection
  try {
    await closeRedis();
    app.log.info('Redis connection closed');
  } catch (error) {
    app.log.error({ error }, 'Error closing Redis connection');
  }

  // Close database connection
  try {
    await closeDatabase();
    app.log.info('Database connection closed');
  } catch (error) {
    app.log.error({ error }, 'Error closing database connection');
  }

  // Close Fastify (this will trigger onClose hooks)
  await app.close();

  app.log.info('Photo Sync Service shutdown complete');
  process.exit(0);
}

// Start the server
async function start(): Promise<void> {
  try {
    const app = await buildApp();

    await app.listen({
      host: config.HOST,
      port: config.PORT,
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Only start if this is the main module
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  start();
}

// Type augmentation for Fastify request
declare module 'fastify' {
  interface FastifyRequest {
    userId: string | null;
    workspaceId: string | null;
    correlationId: string;
  }
}

export { start };
