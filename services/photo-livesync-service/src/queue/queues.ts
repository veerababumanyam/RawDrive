/**
 * Queue Definitions Module.
 *
 * Defines all RabbitMQ queues and exchanges used by the photo sync service.
 *
 * @module queue/queues
 */

import { Options } from 'amqplib';
import { Provider, SyncType } from '../types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Queue definition.
 */
export interface QueueDefinition {
  name: string;
  options: Options.AssertQueue;
  binding?: {
    exchange: string;
    routingKey: string;
  };
}

/**
 * Exchange definition.
 */
export interface ExchangeDefinition {
  name: string;
  type: 'direct' | 'topic' | 'fanout' | 'headers';
  options: Options.AssertExchange;
}

/**
 * Sync job message payload.
 */
export interface SyncJobMessage {
  jobId: string;
  userId: string;
  provider: Provider;
  syncType: SyncType;
  syncToken?: string;
  priority: number;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
}

/**
 * Photo download message payload.
 */
export interface PhotoDownloadMessage {
  jobId: string;
  userId: string;
  provider: Provider;
  photoId: string;
  filename: string;
  downloadUrl: string;
  retryCount: number;
  maxRetries: number;
}

/**
 * Sync completion notification message.
 */
export interface SyncCompleteMessage {
  jobId: string;
  userId: string;
  provider: Provider;
  success: boolean;
  photosProcessed: number;
  photosAdded: number;
  errors: number;
  syncToken?: string;
  completedAt: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Queue name prefix */
const PREFIX = 'photo-sync';

/** Default message TTL in milliseconds (7 days) */
const DEFAULT_MESSAGE_TTL = 7 * 24 * 60 * 60 * 1000;

/** Dead letter exchange */
const DLX_EXCHANGE = `${PREFIX}.dlx`;

// ============================================================================
// Exchanges
// ============================================================================

/**
 * Exchange definitions.
 */
export const EXCHANGES: Record<string, ExchangeDefinition> = {
  SYNC: {
    name: `${PREFIX}.sync`,
    type: 'direct',
    options: {
      durable: true,
    },
  },
  DLX: {
    name: DLX_EXCHANGE,
    type: 'fanout',
    options: {
      durable: true,
    },
  },
};

// ============================================================================
// Queues
// ============================================================================

/**
 * Queue definitions.
 */
export const QUEUES: Record<string, QueueDefinition> = {
  /**
   * Main queue for sync job requests.
   */
  SYNC_JOBS: {
    name: `${PREFIX}.jobs`,
    options: {
      durable: true,
      deadLetterExchange: DLX_EXCHANGE,
      messageTtl: DEFAULT_MESSAGE_TTL,
      maxPriority: 10,
    },
    binding: {
      exchange: EXCHANGES.SYNC.name,
      routingKey: 'jobs',
    },
  },

  /**
   * Queue for individual photo download tasks.
   */
  PHOTO_DOWNLOADS: {
    name: `${PREFIX}.downloads`,
    options: {
      durable: true,
      deadLetterExchange: DLX_EXCHANGE,
      messageTtl: DEFAULT_MESSAGE_TTL,
    },
    binding: {
      exchange: EXCHANGES.SYNC.name,
      routingKey: 'downloads',
    },
  },

  /**
   * Queue for sync completion notifications.
   */
  SYNC_COMPLETE: {
    name: `${PREFIX}.complete`,
    options: {
      durable: true,
      messageTtl: DEFAULT_MESSAGE_TTL,
    },
    binding: {
      exchange: EXCHANGES.SYNC.name,
      routingKey: 'complete',
    },
  },

  /**
   * Dead letter queue for failed messages.
   */
  DEAD_LETTER: {
    name: `${PREFIX}.dlq`,
    options: {
      durable: true,
      // Keep dead letters for 30 days
      messageTtl: 30 * 24 * 60 * 60 * 1000,
    },
    binding: {
      exchange: DLX_EXCHANGE,
      routingKey: '',
    },
  },
};

// ============================================================================
// Queue Names (for direct access)
// ============================================================================

export const QUEUE_NAMES = {
  SYNC_JOBS: QUEUES.SYNC_JOBS.name,
  PHOTO_DOWNLOADS: QUEUES.PHOTO_DOWNLOADS.name,
  SYNC_COMPLETE: QUEUES.SYNC_COMPLETE.name,
  DEAD_LETTER: QUEUES.DEAD_LETTER.name,
};

// ============================================================================
// Message Builders
// ============================================================================

/**
 * Create a sync job message.
 */
export function createSyncJobMessage(
  jobId: string,
  userId: string,
  provider: Provider,
  syncType: SyncType,
  options: {
    syncToken?: string;
    priority?: number;
    maxRetries?: number;
  } = {}
): SyncJobMessage {
  return {
    jobId,
    userId,
    provider,
    syncType,
    syncToken: options.syncToken,
    priority: options.priority ?? 5,
    retryCount: 0,
    maxRetries: options.maxRetries ?? 5,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Create a photo download message.
 */
export function createPhotoDownloadMessage(
  jobId: string,
  userId: string,
  provider: Provider,
  photoId: string,
  filename: string,
  downloadUrl: string,
  options: {
    maxRetries?: number;
  } = {}
): PhotoDownloadMessage {
  return {
    jobId,
    userId,
    provider,
    photoId,
    filename,
    downloadUrl,
    retryCount: 0,
    maxRetries: options.maxRetries ?? 3,
  };
}

/**
 * Create a sync complete message.
 */
export function createSyncCompleteMessage(
  jobId: string,
  userId: string,
  provider: Provider,
  result: {
    success: boolean;
    photosProcessed: number;
    photosAdded: number;
    errors: number;
    syncToken?: string;
  }
): SyncCompleteMessage {
  return {
    jobId,
    userId,
    provider,
    success: result.success,
    photosProcessed: result.photosProcessed,
    photosAdded: result.photosAdded,
    errors: result.errors,
    syncToken: result.syncToken,
    completedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  EXCHANGES,
  QUEUES,
  QUEUE_NAMES,
  createSyncJobMessage,
  createPhotoDownloadMessage,
  createSyncCompleteMessage,
};
