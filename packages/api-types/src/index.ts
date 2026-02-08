/**
 * @rawdrive/api-types
 *
 * Auto-generated TypeScript types and clients for RawDrive microservice APIs.
 *
 * This package provides:
 * - Strongly typed API clients for each microservice
 * - Request/response types generated from OpenAPI specs
 * - Zod schemas for runtime validation
 *
 * @example
 * ```typescript
 * // Import generated client for a specific service
 * import { getGalleries, Gallery } from '@rawdrive/api-types/gallery-service';
 *
 * // Use strongly typed API calls
 * const galleries = await getGalleries({
 *   workspaceId: 'xxx',
 *   page: 1,
 *   limit: 20,
 * });
 *
 * // Runtime validation with Zod schemas
 * import { gallerySchema } from '@rawdrive/api-types/schemas';
 * const validated = gallerySchema.parse(galleries.data[0]);
 * ```
 *
 * @packageDocumentation
 */

// Re-export common types and utilities
export * from './lib/axios-instance';

// Service availability (will be generated)
export const AVAILABLE_SERVICES = [
  'backend',
  'gallery-service',
  'webhooks-service',
  'billing-service',
  'client-service',
  'notifications-service',
  'invitations-service',
  'onboarding-service',
  'ai-service',
  'ai-processing-service',
  'livesync-service',
] as const;

export type AvailableService = typeof AVAILABLE_SERVICES[number];

/**
 * Service port mapping for development.
 */
export const SERVICE_PORTS: Record<AvailableService, number> = {
  'backend': 8000,
  'webhooks-service': 8003,
  'gallery-service': 8004,
  'billing-service': 8005,
  'onboarding-service': 8006,
  'invitations-service': 8007,
  'client-service': 8009,
  'notifications-service': 8010,
  'ai-service': 8011,
  'ai-processing-service': 8012,
  'livesync-service': 8013,
};

/**
 * Get the base URL for a service.
 *
 * @param service - Service name
 * @param host - Host (default: localhost)
 * @returns Full base URL for the service
 */
export function getServiceUrl(
  service: AvailableService,
  host: string = 'localhost'
): string {
  const port = SERVICE_PORTS[service];
  return `http://${host}:${port}`;
}
