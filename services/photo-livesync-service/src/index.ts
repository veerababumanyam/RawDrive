/**
 * Photo Sync Service - Main Entry Point.
 *
 * This file is the default entry point for the service.
 * It re-exports the app builder and starts the server.
 */

export { buildApp, start } from './app.js';
export { config, safeDump } from './config/index.js';
export * from './types.js';

// Start the server when run directly
import { start } from './app.js';

start().catch((err) => {
  console.error('Failed to start Photo Sync Service:', err);
  process.exit(1);
});
