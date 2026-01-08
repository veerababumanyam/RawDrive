/**
 * Sync Routes.
 *
 * Provides endpoints for managing photo sync jobs:
 * - Create sync jobs
 * - Get job status
 * - Cancel jobs
 *
 * @module routes/sync.routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Provider, SyncType, SyncJobStatus } from '../types.js';
import { getJobService, getCredentialService } from '../services/index.js';
import { publish } from '../queue/rabbitmq-client.js';
import { QUEUES, createSyncJobMessage } from '../queue/queues.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Create job request body.
 */
interface CreateJobBody {
  provider: string;
  syncType?: string;
  priority?: number;
}

/**
 * Job ID parameter.
 */
interface JobIdParams {
  jobId: string;
}

// ============================================================================
// Routes
// ============================================================================

/**
 * Register sync routes.
 */
export async function syncRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * Create a new sync job.
   *
   * POST /api/v1/sync/jobs
   */
  fastify.post<{
    Body: CreateJobBody;
  }>('/api/v1/sync/jobs', {
    schema: {
      description: 'Create a new sync job',
      tags: ['Sync'],
      body: {
        type: 'object',
        required: ['provider'],
        properties: {
          provider: {
            type: 'string',
            enum: Object.values(Provider),
            description: 'Cloud storage provider to sync from',
          },
          syncType: {
            type: 'string',
            enum: Object.values(SyncType),
            default: 'full',
            description: 'Type of sync (full or incremental)',
          },
          priority: {
            type: 'number',
            minimum: 1,
            maximum: 10,
            default: 5,
            description: 'Job priority (1-10, higher = more priority)',
          },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            provider: { type: 'string' },
            syncType: { type: 'string' },
            status: { type: 'string' },
            priority: { type: 'number' },
            createdAt: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
        409: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { provider, syncType = 'full', priority = 5 } = request.body;
    const userId = (request as any).user?.id;

    if (!userId) {
      return reply.status(401).send({
        error: 'unauthorized',
        message: 'Authentication required',
      });
    }

    const providerType = provider as Provider;
    const syncTypeValue = syncType as SyncType;

    // Check if provider is connected
    const credentialService = getCredentialService();
    const credential = await credentialService.getActiveCredential(userId, providerType);

    if (!credential) {
      return reply.status(400).send({
        error: 'provider_not_connected',
        message: `Provider ${provider} is not connected. Please connect the provider first.`,
      });
    }

    // Create the job
    const jobService = getJobService();
    const result = await jobService.createJob({
      userId,
      provider: providerType,
      syncType: syncTypeValue,
      priority,
    });

    if (!result.success) {
      return reply.status(409).send({
        error: 'job_exists',
        message: result.error,
      });
    }

    const job = result.job!;

    // Get sync token for incremental sync
    let syncToken: string | undefined;
    if (syncTypeValue === SyncType.INCREMENTAL && credential.syncCursor) {
      syncToken = credential.syncCursor;
    }

    // Publish job to queue
    const message = createSyncJobMessage(
      job.id,
      userId,
      providerType,
      syncTypeValue,
      {
        syncToken,
        priority,
      }
    );

    await publish(QUEUES.SYNC_JOBS, message, { priority });

    console.log('[SyncRoutes] Job created and queued', {
      jobId: job.id,
      userId,
      provider,
      syncType,
    });

    return reply.status(201).send({
      id: job.id,
      userId: job.userId,
      provider: job.provider,
      syncType: job.syncType,
      status: job.status,
      priority: job.priority,
      createdAt: job.createdAt.toISOString(),
    });
  });

  /**
   * Get job status.
   *
   * GET /api/v1/sync/jobs/{jobId}
   */
  fastify.get<{
    Params: JobIdParams;
  }>('/api/v1/sync/jobs/:jobId', {
    schema: {
      description: 'Get sync job status',
      tags: ['Sync'],
      params: {
        type: 'object',
        required: ['jobId'],
        properties: {
          jobId: {
            type: 'string',
            format: 'uuid',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            provider: { type: 'string' },
            syncType: { type: 'string' },
            status: { type: 'string' },
            priority: { type: 'number' },
            progress: {
              type: 'object',
              properties: {
                processed: { type: 'number' },
                total: { type: 'number' },
                errors: { type: 'number' },
                currentItem: { type: 'string' },
              },
            },
            error: { type: 'string', nullable: true },
            startedAt: { type: 'string', nullable: true },
            completedAt: { type: 'string', nullable: true },
            createdAt: { type: 'string' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { jobId } = request.params;
    const userId = (request as any).user?.id;

    if (!userId) {
      return reply.status(401).send({
        error: 'unauthorized',
        message: 'Authentication required',
      });
    }

    const jobService = getJobService();
    const job = await jobService.getJobStatus(jobId);

    if (!job) {
      return reply.status(404).send({
        error: 'not_found',
        message: 'Job not found',
      });
    }

    // Verify ownership
    if (job.userId !== userId) {
      return reply.status(404).send({
        error: 'not_found',
        message: 'Job not found',
      });
    }

    return reply.send({
      id: job.id,
      userId: job.userId,
      provider: job.provider,
      syncType: job.syncType,
      status: job.status,
      priority: job.priority,
      progress: job.progress,
      error: job.error,
      startedAt: job.startedAt?.toISOString() || null,
      completedAt: job.completedAt?.toISOString() || null,
      createdAt: job.createdAt.toISOString(),
    });
  });

  /**
   * Cancel a sync job.
   *
   * DELETE /api/v1/sync/jobs/{jobId}
   */
  fastify.delete<{
    Params: JobIdParams;
  }>('/api/v1/sync/jobs/:jobId', {
    schema: {
      description: 'Cancel a sync job',
      tags: ['Sync'],
      params: {
        type: 'object',
        required: ['jobId'],
        properties: {
          jobId: {
            type: 'string',
            format: 'uuid',
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
    const { jobId } = request.params;
    const userId = (request as any).user?.id;

    if (!userId) {
      return reply.status(401).send({
        error: 'unauthorized',
        message: 'Authentication required',
      });
    }

    const jobService = getJobService();
    const job = await jobService.getJob(jobId);

    if (!job) {
      return reply.status(404).send({
        error: 'not_found',
        message: 'Job not found',
      });
    }

    // Verify ownership
    if (job.userId !== userId) {
      return reply.status(404).send({
        error: 'not_found',
        message: 'Job not found',
      });
    }

    // Check if job can be cancelled
    if (job.status !== SyncJobStatus.PENDING && job.status !== SyncJobStatus.RUNNING) {
      return reply.status(400).send({
        error: 'invalid_status',
        message: `Cannot cancel job with status: ${job.status}`,
      });
    }

    const cancelled = await jobService.cancelJob(jobId, 'User requested cancellation');

    if (!cancelled) {
      return reply.status(400).send({
        error: 'cancel_failed',
        message: 'Failed to cancel job',
      });
    }

    return reply.send({
      success: true,
      message: 'Job cancelled successfully',
    });
  });

  /**
   * List user's sync jobs.
   *
   * GET /api/v1/sync/jobs
   */
  fastify.get<{
    Querystring: {
      provider?: string;
      status?: string;
      limit?: number;
      offset?: number;
    };
  }>('/api/v1/sync/jobs', {
    schema: {
      description: 'List sync jobs for current user',
      tags: ['Sync'],
      querystring: {
        type: 'object',
        properties: {
          provider: {
            type: 'string',
            enum: Object.values(Provider),
          },
          status: {
            type: 'string',
            enum: Object.values(SyncJobStatus),
          },
          limit: {
            type: 'number',
            minimum: 1,
            maximum: 100,
            default: 20,
          },
          offset: {
            type: 'number',
            minimum: 0,
            default: 0,
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            jobs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  provider: { type: 'string' },
                  syncType: { type: 'string' },
                  status: { type: 'string' },
                  progress: { type: 'object' },
                  createdAt: { type: 'string' },
                },
              },
            },
            total: { type: 'number' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { provider, status, limit = 20, offset = 0 } = request.query;
    const userId = (request as any).user?.id;

    if (!userId) {
      return reply.status(401).send({
        error: 'unauthorized',
        message: 'Authentication required',
      });
    }

    const jobService = getJobService();
    const jobs = await jobService.getUserJobs(userId, {
      provider: provider as Provider | undefined,
      status: status as SyncJobStatus | undefined,
    });

    // Apply pagination
    const paginatedJobs = jobs.slice(offset, offset + limit);

    return reply.send({
      jobs: paginatedJobs.map((job) => ({
        id: job.id,
        provider: job.provider,
        syncType: job.syncType,
        status: job.status,
        progress: job.progress,
        createdAt: job.createdAt.toISOString(),
      })),
      total: jobs.length,
    });
  });
}

export default syncRoutes;
