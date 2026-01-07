/**
 * Health Check Routes.
 *
 * Provides health check endpoints for Kubernetes probes:
 * - /health/live - Liveness probe (is the process running?)
 * - /health/ready - Readiness probe (can the service handle requests?)
 *
 * @module routes/health.routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { isHealthy as isDbHealthy } from '../db/connection.js';
import { isHealthy as isRedisHealthy } from '../cache/redis-client.js';
import { isHealthy as isRabbitHealthy } from '../queue/rabbitmq-client.js';
import { getWorkerStatus } from '../workers/sync.worker.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Health check response.
 */
interface HealthResponse {
  status: 'ok' | 'degraded' | 'unhealthy';
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
  checks?: {
    database?: { status: 'ok' | 'error'; latencyMs?: number };
    redis?: { status: 'ok' | 'error'; latencyMs?: number };
    rabbitmq?: { status: 'ok' | 'error' };
    worker?: { status: 'ok' | 'error'; activeJobs?: number };
  };
}

// ============================================================================
// Constants
// ============================================================================

const SERVICE_NAME = 'photo-sync-service';
const SERVICE_VERSION = process.env.npm_package_version || '1.0.0';
const startTime = Date.now();

// ============================================================================
// Route Handler
// ============================================================================

/**
 * Register health check routes.
 */
export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * Liveness probe endpoint.
   *
   * Returns 200 if the process is running.
   * Use for Kubernetes liveness probe.
   */
  fastify.get('/health/live', {
    schema: {
      description: 'Liveness probe - checks if process is running',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            service: { type: 'string' },
            version: { type: 'string' },
            uptime: { type: 'number' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const response: HealthResponse = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      uptime: (Date.now() - startTime) / 1000,
    };

    return reply.send(response);
  });

  /**
   * Readiness probe endpoint.
   *
   * Returns 200 if the service can handle requests.
   * Checks database, Redis, and RabbitMQ connectivity.
   * Use for Kubernetes readiness probe.
   */
  fastify.get('/health/ready', {
    schema: {
      description: 'Readiness probe - checks if service can handle requests',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            service: { type: 'string' },
            version: { type: 'string' },
            uptime: { type: 'number' },
            checks: {
              type: 'object',
              properties: {
                database: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    latencyMs: { type: 'number' },
                  },
                },
                redis: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    latencyMs: { type: 'number' },
                  },
                },
                rabbitmq: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                  },
                },
                worker: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    activeJobs: { type: 'number' },
                  },
                },
              },
            },
          },
        },
        503: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            service: { type: 'string' },
            version: { type: 'string' },
            uptime: { type: 'number' },
            checks: { type: 'object' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    // Check all dependencies in parallel
    const [dbHealthy, redisHealthy, rabbitHealthy] = await Promise.all([
      checkWithTimeout(isDbHealthy, 5000),
      checkWithTimeout(isRedisHealthy, 5000),
      checkWithTimeout(isRabbitHealthy, 5000),
    ]);

    const workerStatus = getWorkerStatus();

    const response: HealthResponse = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      uptime: (Date.now() - startTime) / 1000,
      checks: {
        database: {
          status: dbHealthy ? 'ok' : 'error',
        },
        redis: {
          status: redisHealthy ? 'ok' : 'error',
        },
        rabbitmq: {
          status: rabbitHealthy ? 'ok' : 'error',
        },
        worker: {
          status: workerStatus.isRunning ? 'ok' : 'error',
          activeJobs: workerStatus.activeJobs,
        },
      },
    };

    // Determine overall status
    const allHealthy = dbHealthy && redisHealthy && rabbitHealthy;
    const partialHealthy = dbHealthy || redisHealthy || rabbitHealthy;

    if (allHealthy) {
      response.status = 'ok';
      return reply.send(response);
    } else if (partialHealthy) {
      response.status = 'degraded';
      return reply.status(503).send(response);
    } else {
      response.status = 'unhealthy';
      return reply.status(503).send(response);
    }
  });

  /**
   * Detailed health check endpoint.
   *
   * Returns detailed health information for debugging.
   */
  fastify.get('/health', {
    schema: {
      description: 'Detailed health check with dependency status',
      tags: ['Health'],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    // Check all dependencies with timing
    const dbStart = Date.now();
    const dbHealthy = await checkWithTimeout(isDbHealthy, 5000);
    const dbLatency = Date.now() - dbStart;

    const redisStart = Date.now();
    const redisHealthy = await checkWithTimeout(isRedisHealthy, 5000);
    const redisLatency = Date.now() - redisStart;

    const rabbitHealthy = await checkWithTimeout(isRabbitHealthy, 5000);

    const workerStatus = getWorkerStatus();

    const response: HealthResponse = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      uptime: (Date.now() - startTime) / 1000,
      checks: {
        database: {
          status: dbHealthy ? 'ok' : 'error',
          latencyMs: dbLatency,
        },
        redis: {
          status: redisHealthy ? 'ok' : 'error',
          latencyMs: redisLatency,
        },
        rabbitmq: {
          status: rabbitHealthy ? 'ok' : 'error',
        },
        worker: {
          status: workerStatus.isRunning ? 'ok' : 'error',
          activeJobs: workerStatus.activeJobs,
        },
      },
    };

    const allHealthy = dbHealthy && redisHealthy && rabbitHealthy;

    if (!allHealthy) {
      response.status = 'degraded';
    }

    return reply.send(response);
  });
}

/**
 * Check with timeout wrapper.
 */
async function checkWithTimeout(
  check: () => Promise<boolean>,
  timeoutMs: number
): Promise<boolean> {
  try {
    return await Promise.race([
      check(),
      new Promise<boolean>((_, reject) =>
        setTimeout(() => reject(new Error('Health check timeout')), timeoutMs)
      ),
    ]);
  } catch {
    return false;
  }
}

export default healthRoutes;
