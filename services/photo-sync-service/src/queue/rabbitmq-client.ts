/**
 * RabbitMQ Client Module.
 *
 * Provides connection management and messaging utilities for RabbitMQ:
 * - Connection management with automatic reconnection
 * - Channel creation and management
 * - Message publishing with retries
 * - Queue consumers with acknowledgment
 *
 * @module queue/rabbitmq-client
 */

import amqp, { Connection, Channel, ConsumeMessage, Options } from 'amqplib';
import { config } from '../config/index.js';
import { QUEUES, EXCHANGES, type QueueDefinition } from './queues.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Message handler function type.
 */
export type MessageHandler<T = unknown> = (
  message: T,
  rawMessage: ConsumeMessage
) => Promise<void>;

/**
 * Publish options.
 */
export interface PublishOptions {
  /** Message priority (0-10, higher = more priority) */
  priority?: number;
  /** Message expiration in milliseconds */
  expiration?: number;
  /** Whether message should persist through broker restarts */
  persistent?: boolean;
  /** Correlation ID for request tracking */
  correlationId?: string;
  /** Custom headers */
  headers?: Record<string, unknown>;
}

/**
 * Consumer options.
 */
export interface ConsumerOptions {
  /** Consumer prefetch count */
  prefetch?: number;
  /** Consumer tag for identification */
  consumerTag?: string;
  /** Whether to auto-acknowledge messages */
  noAck?: boolean;
}

// ============================================================================
// State
// ============================================================================

let connection: Connection | null = null;
let channel: Channel | null = null;
let isConnecting = false;
let isShuttingDown = false;
let reconnectAttempts = 0;

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

// ============================================================================
// Connection Management
// ============================================================================

/**
 * Get or create RabbitMQ connection.
 */
export async function getConnection(): Promise<Connection> {
  if (isShuttingDown) {
    throw new Error('RabbitMQ client is shutting down');
  }

  if (connection && isConnectionOpen(connection)) {
    return connection;
  }

  // Prevent concurrent connection attempts
  if (isConnecting) {
    await waitForConnection();
    if (connection) return connection;
  }

  isConnecting = true;

  try {
    console.log('[RabbitMQ] Connecting to', config.RABBITMQ_URL.replace(/\/\/[^@]*@/, '//***:***@'));

    connection = await amqp.connect(config.RABBITMQ_URL, {
      heartbeat: 60,
    });

    // Set up connection error handlers
    connection.on('error', handleConnectionError);
    connection.on('close', handleConnectionClose);

    console.log('[RabbitMQ] Connected successfully');
    reconnectAttempts = 0;

    return connection;
  } catch (error) {
    console.error('[RabbitMQ] Connection failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  } finally {
    isConnecting = false;
  }
}

/**
 * Get or create a channel.
 */
export async function getChannel(): Promise<Channel> {
  if (isShuttingDown) {
    throw new Error('RabbitMQ client is shutting down');
  }

  if (channel && isChannelOpen(channel)) {
    return channel;
  }

  const conn = await getConnection();
  channel = await conn.createChannel();

  // Set up channel error handlers
  channel.on('error', handleChannelError);
  channel.on('close', handleChannelClose);

  // Set default prefetch
  await channel.prefetch(config.RABBITMQ_PREFETCH);

  console.log('[RabbitMQ] Channel created');

  return channel;
}

/**
 * Check if connection is open.
 */
function isConnectionOpen(conn: Connection | null): boolean {
  if (!conn) return false;
  // amqplib doesn't expose a direct isOpen check, we check via channel creation
  return true;
}

/**
 * Check if channel is open.
 */
function isChannelOpen(ch: Channel | null): boolean {
  if (!ch) return false;
  return true;
}

/**
 * Wait for connection to be established.
 */
async function waitForConnection(): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (!isConnecting || connection) {
        resolve();
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}

// ============================================================================
// Error Handlers
// ============================================================================

/**
 * Handle connection errors.
 */
function handleConnectionError(error: Error): void {
  console.error('[RabbitMQ] Connection error', { error: error.message });
}

/**
 * Handle connection close.
 */
function handleConnectionClose(): void {
  console.log('[RabbitMQ] Connection closed');
  connection = null;
  channel = null;

  if (!isShuttingDown) {
    scheduleReconnect();
  }
}

/**
 * Handle channel errors.
 */
function handleChannelError(error: Error): void {
  console.error('[RabbitMQ] Channel error', { error: error.message });
}

/**
 * Handle channel close.
 */
function handleChannelClose(): void {
  console.log('[RabbitMQ] Channel closed');
  channel = null;
}

/**
 * Schedule reconnection attempt.
 */
function scheduleReconnect(): void {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('[RabbitMQ] Max reconnection attempts reached');
    return;
  }

  const delay = Math.min(
    BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts),
    MAX_RECONNECT_DELAY
  );

  console.log(`[RabbitMQ] Reconnecting in ${delay}ms (attempt ${reconnectAttempts + 1})`);

  setTimeout(async () => {
    reconnectAttempts++;
    try {
      await getConnection();
    } catch (error) {
      // Error handled in getConnection
    }
  }, delay);
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize RabbitMQ connection and declare queues/exchanges.
 */
export async function initialize(): Promise<void> {
  console.log('[RabbitMQ] Initializing...');

  const ch = await getChannel();

  // Declare exchanges
  for (const exchange of Object.values(EXCHANGES)) {
    await ch.assertExchange(exchange.name, exchange.type, exchange.options);
    console.log(`[RabbitMQ] Exchange declared: ${exchange.name}`);
  }

  // Declare queues
  for (const queue of Object.values(QUEUES)) {
    await ch.assertQueue(queue.name, queue.options);
    console.log(`[RabbitMQ] Queue declared: ${queue.name}`);

    // Bind to exchange if specified
    if (queue.binding) {
      await ch.bindQueue(queue.name, queue.binding.exchange, queue.binding.routingKey);
      console.log(`[RabbitMQ] Queue bound: ${queue.name} -> ${queue.binding.exchange}`);
    }
  }

  console.log('[RabbitMQ] Initialization complete');
}

/**
 * Close connection gracefully.
 */
export async function close(): Promise<void> {
  isShuttingDown = true;

  console.log('[RabbitMQ] Closing connection...');

  try {
    if (channel) {
      await channel.close();
      channel = null;
    }

    if (connection) {
      await connection.close();
      connection = null;
    }

    console.log('[RabbitMQ] Connection closed');
  } catch (error) {
    console.error('[RabbitMQ] Error closing connection', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    isShuttingDown = false;
  }
}

// ============================================================================
// Publishing
// ============================================================================

/**
 * Publish a message to a queue.
 *
 * @param queue - Queue definition
 * @param message - Message payload
 * @param options - Publish options
 */
export async function publish<T>(
  queue: QueueDefinition,
  message: T,
  options: PublishOptions = {}
): Promise<boolean> {
  const ch = await getChannel();

  const content = Buffer.from(JSON.stringify(message));

  const publishOptions: Options.Publish = {
    contentType: 'application/json',
    persistent: options.persistent ?? true,
    priority: options.priority,
    expiration: options.expiration?.toString(),
    correlationId: options.correlationId,
    headers: options.headers,
    timestamp: Date.now(),
  };

  return ch.sendToQueue(queue.name, content, publishOptions);
}

/**
 * Publish a message to an exchange.
 *
 * @param exchange - Exchange name
 * @param routingKey - Routing key
 * @param message - Message payload
 * @param options - Publish options
 */
export async function publishToExchange<T>(
  exchange: string,
  routingKey: string,
  message: T,
  options: PublishOptions = {}
): Promise<boolean> {
  const ch = await getChannel();

  const content = Buffer.from(JSON.stringify(message));

  const publishOptions: Options.Publish = {
    contentType: 'application/json',
    persistent: options.persistent ?? true,
    priority: options.priority,
    expiration: options.expiration?.toString(),
    correlationId: options.correlationId,
    headers: options.headers,
    timestamp: Date.now(),
  };

  return ch.publish(exchange, routingKey, content, publishOptions);
}

// ============================================================================
// Consuming
// ============================================================================

/**
 * Start consuming messages from a queue.
 *
 * @param queue - Queue definition
 * @param handler - Message handler function
 * @param options - Consumer options
 * @returns Consumer tag
 */
export async function consume<T>(
  queue: QueueDefinition,
  handler: MessageHandler<T>,
  options: ConsumerOptions = {}
): Promise<string> {
  const ch = await getChannel();

  // Set prefetch for this consumer
  if (options.prefetch) {
    await ch.prefetch(options.prefetch);
  }

  const { consumerTag } = await ch.consume(
    queue.name,
    async (msg) => {
      if (!msg) return;

      try {
        const content = JSON.parse(msg.content.toString()) as T;
        await handler(content, msg);

        if (!options.noAck) {
          ch.ack(msg);
        }
      } catch (error) {
        console.error('[RabbitMQ] Message processing error', {
          queue: queue.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        if (!options.noAck) {
          // Reject and requeue if handler fails
          ch.nack(msg, false, true);
        }
      }
    },
    {
      noAck: options.noAck ?? false,
      consumerTag: options.consumerTag,
    }
  );

  console.log(`[RabbitMQ] Consumer started: ${queue.name} (tag: ${consumerTag})`);

  return consumerTag;
}

/**
 * Stop consuming messages.
 *
 * @param consumerTag - Consumer tag to cancel
 */
export async function cancelConsumer(consumerTag: string): Promise<void> {
  if (!channel) return;

  await channel.cancel(consumerTag);
  console.log(`[RabbitMQ] Consumer cancelled: ${consumerTag}`);
}

/**
 * Acknowledge a message.
 */
export async function ack(message: ConsumeMessage): Promise<void> {
  if (!channel) return;
  channel.ack(message);
}

/**
 * Reject a message.
 *
 * @param message - Message to reject
 * @param requeue - Whether to requeue the message
 */
export async function nack(message: ConsumeMessage, requeue = false): Promise<void> {
  if (!channel) return;
  channel.nack(message, false, requeue);
}

// ============================================================================
// Health Check
// ============================================================================

/**
 * Check if RabbitMQ connection is healthy.
 */
export async function isHealthy(): Promise<boolean> {
  try {
    const ch = await getChannel();
    // Try to check queue status as a health check
    await ch.checkQueue(QUEUES.SYNC_JOBS.name);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  getConnection,
  getChannel,
  initialize,
  close,
  publish,
  publishToExchange,
  consume,
  cancelConsumer,
  ack,
  nack,
  isHealthy,
};
