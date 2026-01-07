/**
 * Services Module.
 *
 * Exports all service classes and singleton getters.
 *
 * @module services
 */

export {
  CredentialService,
  getCredentialService,
  type SaveTokensOptions,
  type TokenRefreshResult,
} from './credential.service.js';

export {
  JobService,
  getJobService,
  type CreateJobOptions,
  type CreateJobResult,
  type UpdateProgressOptions,
} from './job.service.js';

export {
  SyncService,
  getSyncService,
  type SyncOptions,
  type SyncResult,
} from './sync.service.js';
