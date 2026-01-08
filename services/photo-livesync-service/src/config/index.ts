/**
 * Environment configuration module for Photo Sync Service.
 *
 * Loads and validates configuration from environment variables.
 * All settings are validated at startup to fail fast on misconfiguration.
 */

import { z } from 'zod';

// Environment enum
const Environment = z.enum(['development', 'staging', 'production', 'test']);
type Environment = z.infer<typeof Environment>;

// Configuration schema with validation
const ConfigSchema = z.object({
  // Service identification
  SERVICE_NAME: z.string().default('photo-sync-service'),
  SERVICE_VERSION: z.string().default('1.0.0'),
  APP_ENV: Environment.default('development'),

  // Server settings
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(8007),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Database (PostgreSQL)
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/rawdrive'),
  DB_POOL_MIN_SIZE: z.coerce.number().int().min(1).default(2),
  DB_POOL_MAX_SIZE: z.coerce.number().int().min(1).default(10),
  DB_COMMAND_TIMEOUT: z.coerce.number().int().min(1000).default(60000),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379/0'),
  REDIS_MAX_CONNECTIONS: z.coerce.number().int().min(1).default(10),

  // RabbitMQ
  RABBITMQ_URL: z.string().default('amqp://guest:guest@localhost:5672'),
  RABBITMQ_PREFETCH: z.coerce.number().int().min(1).default(10),
  RABBITMQ_PREFETCH_COUNT: z.coerce.number().int().min(1).default(10),
  RABBITMQ_HEARTBEAT_INTERVAL: z.coerce.number().int().min(0).default(60),

  // CORS
  CORS_ORIGINS: z.string().transform((val) => {
    if (!val) return ['http://localhost:3000'];
    return val.split(',').map((origin) => origin.trim());
  }).default('http://localhost:3000'),

  // JWT Authentication
  JWT_SECRET: z.string().min(32).default('development-jwt-secret-change-in-production'),
  JWT_ALGORITHM: z.string().default('HS256'),

  // Encryption (for OAuth credentials - AES-256-GCM)
  ENCRYPTION_KEY: z.string().min(32).default('development-encryption-key-32chars!'),

  // OAuth settings
  OAUTH_CALLBACK_BASE_URL: z.string().url().default('http://localhost:8007'),
  OAUTH_STATE_TTL_SECONDS: z.coerce.number().int().min(60).default(600),
  DEFAULT_OAUTH_REDIRECT: z.string().default('/settings/integrations'),

  // Frontend
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),

  // OAuth providers - Google Photos
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),

  // OAuth providers - Dropbox
  DROPBOX_CLIENT_ID: z.string().optional(),
  DROPBOX_CLIENT_SECRET: z.string().optional(),
  DROPBOX_REDIRECT_URI: z.string().optional(),

  // OAuth providers - OneDrive (Microsoft Graph)
  ONEDRIVE_CLIENT_ID: z.string().optional(),
  ONEDRIVE_CLIENT_SECRET: z.string().optional(),
  ONEDRIVE_REDIRECT_URI: z.string().optional(),
  ONEDRIVE_TENANT_ID: z.string().default('common'),

  // OAuth providers - Amazon Photos
  AMAZON_CLIENT_ID: z.string().optional(),
  AMAZON_CLIENT_SECRET: z.string().optional(),
  AMAZON_REDIRECT_URI: z.string().optional(),

  // iCloud (CloudKit Web Services)
  ICLOUD_APP_ID: z.string().optional(),
  ICLOUD_API_TOKEN: z.string().optional(),
  ICLOUD_ENVIRONMENT: z.enum(['development', 'production']).default('development'),

  // Storage (R2/S3)
  R2_ENDPOINT: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().default('rawdrive-photos'),
  R2_REGION: z.string().default('auto'),
  R2_SIGNED_URL_EXPIRY: z.coerce.number().int().min(300).default(3600),

  // Rate limiting (per-provider)
  RATE_LIMIT_ENABLED: z.coerce.boolean().default(true),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),

  // Sync settings
  SYNC_BATCH_SIZE: z.coerce.number().int().min(1).default(100),
  SYNC_MAX_RETRIES: z.coerce.number().int().min(0).default(5),
  SYNC_RETRY_DELAY_MS: z.coerce.number().int().min(100).default(1000),
  SYNC_CONCURRENT_DOWNLOADS: z.coerce.number().int().min(1).max(20).default(5),
  SYNC_PROGRESS_UPDATE_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),

  // Circuit breaker (for provider resilience)
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: z.coerce.number().int().min(1).default(5),
  CIRCUIT_BREAKER_RECOVERY_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000),
  CIRCUIT_BREAKER_HALF_OPEN_REQUESTS: z.coerce.number().int().min(1).default(3),

  // Duplicate detection
  DUPLICATE_DETECTION_ENABLED: z.coerce.boolean().default(true),
  DUPLICATE_HASH_ALGORITHM: z.enum(['sha256', 'md5']).default('sha256'),

  // Graceful shutdown
  DRAIN_TIMEOUT_SECONDS: z.coerce.number().int().min(5).default(30),

  // Metrics and observability
  METRICS_ENABLED: z.coerce.boolean().default(true),
  METRICS_PREFIX: z.string().default('photo_sync'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  OTEL_SERVICE_NAME: z.string().default('photo-sync-service'),
});

type Config = z.infer<typeof ConfigSchema> & {
  isDevelopment: boolean;
  isProduction: boolean;
  isTest: boolean;
  isStaging: boolean;
};

// Parse and validate configuration
function loadConfig(): Config {
  const parsed = ConfigSchema.safeParse(process.env);

  if (!parsed.success) {
    const errors = parsed.error.errors
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');

    console.error('Configuration validation failed:\n' + errors);

    // In production, fail fast on invalid config
    if (process.env.APP_ENV === 'production') {
      process.exit(1);
    }

    // In development, use defaults where possible
    console.warn('Using default values for invalid configuration');
  }

  const configData = parsed.success ? parsed.data : ConfigSchema.parse({});

  return {
    ...configData,
    isDevelopment: configData.APP_ENV === 'development',
    isProduction: configData.APP_ENV === 'production',
    isTest: configData.APP_ENV === 'test',
    isStaging: configData.APP_ENV === 'staging',
  };
}

// Export singleton config instance
export const config = loadConfig();

// Export types
export type { Config, Environment };

// Export schema for testing
export { ConfigSchema };

/**
 * Safe dump for logging - masks all sensitive values.
 * Use this when logging configuration at startup.
 */
export function safeDump(): Record<string, unknown> {
  const masked = '***REDACTED***';

  const maskUrl = (url: string | undefined): string | undefined => {
    if (!url) return undefined;
    return url.replace(/\/\/[^@]+@/, '//***:***@');
  };

  return {
    // Service
    SERVICE_NAME: config.SERVICE_NAME,
    SERVICE_VERSION: config.SERVICE_VERSION,
    APP_ENV: config.APP_ENV,
    HOST: config.HOST,
    PORT: config.PORT,
    LOG_LEVEL: config.LOG_LEVEL,

    // Database
    DATABASE_URL: maskUrl(config.DATABASE_URL),
    DB_POOL_MIN_SIZE: config.DB_POOL_MIN_SIZE,
    DB_POOL_MAX_SIZE: config.DB_POOL_MAX_SIZE,
    DB_COMMAND_TIMEOUT: config.DB_COMMAND_TIMEOUT,

    // Redis
    REDIS_URL: maskUrl(config.REDIS_URL),
    REDIS_MAX_CONNECTIONS: config.REDIS_MAX_CONNECTIONS,

    // RabbitMQ
    RABBITMQ_URL: maskUrl(config.RABBITMQ_URL),
    RABBITMQ_PREFETCH_COUNT: config.RABBITMQ_PREFETCH_COUNT,
    RABBITMQ_HEARTBEAT_INTERVAL: config.RABBITMQ_HEARTBEAT_INTERVAL,

    // CORS
    CORS_ORIGINS: config.CORS_ORIGINS,

    // Auth (masked)
    JWT_SECRET: masked,
    JWT_ALGORITHM: config.JWT_ALGORITHM,
    ENCRYPTION_KEY: masked,

    // OAuth (masked)
    OAUTH_CALLBACK_BASE_URL: config.OAUTH_CALLBACK_BASE_URL,
    OAUTH_STATE_TTL_SECONDS: config.OAUTH_STATE_TTL_SECONDS,
    GOOGLE_CLIENT_ID: config.GOOGLE_CLIENT_ID ? masked : undefined,
    DROPBOX_CLIENT_ID: config.DROPBOX_CLIENT_ID ? masked : undefined,
    ONEDRIVE_CLIENT_ID: config.ONEDRIVE_CLIENT_ID ? masked : undefined,
    ONEDRIVE_TENANT_ID: config.ONEDRIVE_TENANT_ID,
    AMAZON_CLIENT_ID: config.AMAZON_CLIENT_ID ? masked : undefined,
    ICLOUD_APP_ID: config.ICLOUD_APP_ID ? masked : undefined,
    ICLOUD_ENVIRONMENT: config.ICLOUD_ENVIRONMENT,

    // Storage
    R2_ENDPOINT: config.R2_ENDPOINT,
    R2_BUCKET_NAME: config.R2_BUCKET_NAME,
    R2_REGION: config.R2_REGION,
    R2_SIGNED_URL_EXPIRY: config.R2_SIGNED_URL_EXPIRY,
    R2_ACCESS_KEY_ID: config.R2_ACCESS_KEY_ID ? masked : undefined,

    // Rate limiting
    RATE_LIMIT_ENABLED: config.RATE_LIMIT_ENABLED,
    RATE_LIMIT_MAX_REQUESTS: config.RATE_LIMIT_MAX_REQUESTS,
    RATE_LIMIT_WINDOW_MS: config.RATE_LIMIT_WINDOW_MS,

    // Sync
    SYNC_BATCH_SIZE: config.SYNC_BATCH_SIZE,
    SYNC_MAX_RETRIES: config.SYNC_MAX_RETRIES,
    SYNC_RETRY_DELAY_MS: config.SYNC_RETRY_DELAY_MS,
    SYNC_CONCURRENT_DOWNLOADS: config.SYNC_CONCURRENT_DOWNLOADS,
    SYNC_PROGRESS_UPDATE_INTERVAL_MS: config.SYNC_PROGRESS_UPDATE_INTERVAL_MS,

    // Circuit breaker
    CIRCUIT_BREAKER_FAILURE_THRESHOLD: config.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    CIRCUIT_BREAKER_RECOVERY_TIMEOUT_MS: config.CIRCUIT_BREAKER_RECOVERY_TIMEOUT_MS,
    CIRCUIT_BREAKER_HALF_OPEN_REQUESTS: config.CIRCUIT_BREAKER_HALF_OPEN_REQUESTS,

    // Duplicate detection
    DUPLICATE_DETECTION_ENABLED: config.DUPLICATE_DETECTION_ENABLED,
    DUPLICATE_HASH_ALGORITHM: config.DUPLICATE_HASH_ALGORITHM,

    // Shutdown
    DRAIN_TIMEOUT_SECONDS: config.DRAIN_TIMEOUT_SECONDS,

    // Metrics
    METRICS_ENABLED: config.METRICS_ENABLED,
    METRICS_PREFIX: config.METRICS_PREFIX,
    OTEL_EXPORTER_OTLP_ENDPOINT: config.OTEL_EXPORTER_OTLP_ENDPOINT,
    OTEL_SERVICE_NAME: config.OTEL_SERVICE_NAME,
  };
}

/**
 * Check if a specific provider is configured.
 * Returns true only if both client ID and secret are set.
 */
export function isProviderConfigured(provider: 'google' | 'dropbox' | 'onedrive' | 'amazon' | 'icloud'): boolean {
  switch (provider) {
    case 'google':
      return !!(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET);
    case 'dropbox':
      return !!(config.DROPBOX_CLIENT_ID && config.DROPBOX_CLIENT_SECRET);
    case 'onedrive':
      return !!(config.ONEDRIVE_CLIENT_ID && config.ONEDRIVE_CLIENT_SECRET);
    case 'amazon':
      return !!(config.AMAZON_CLIENT_ID && config.AMAZON_CLIENT_SECRET);
    case 'icloud':
      return !!(config.ICLOUD_APP_ID && config.ICLOUD_API_TOKEN);
    default:
      return false;
  }
}

/**
 * Get list of all configured providers.
 */
export function getConfiguredProviders(): string[] {
  const providers: string[] = [];
  if (isProviderConfigured('google')) providers.push('google');
  if (isProviderConfigured('dropbox')) providers.push('dropbox');
  if (isProviderConfigured('onedrive')) providers.push('onedrive');
  if (isProviderConfigured('amazon')) providers.push('amazon');
  if (isProviderConfigured('icloud')) providers.push('icloud');
  return providers;
}
