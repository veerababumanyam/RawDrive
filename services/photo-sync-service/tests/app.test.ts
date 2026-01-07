/**
 * Basic tests for Photo Sync Service application.
 *
 * These tests verify the Fastify app boots correctly and health endpoints work.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

describe('Photo Sync Service App', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health Endpoints', () => {
    it('GET / returns service info', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.service).toBe('photo-sync-service');
      expect(body.health).toBe('/health');
      expect(body.ready).toBe('/ready');
    });

    it('GET /health returns ok status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('ok');
      expect(body.service).toBe('photo-sync-service');
    });

    it('GET /health/live returns ok status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/live',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('ok');
    });

    it('GET /ready returns ready status with checks', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ready',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('ready');
      expect(body.checks).toBeDefined();
      expect(body.checks).toHaveProperty('postgres');
      expect(body.checks).toHaveProperty('redis');
      expect(body.checks).toHaveProperty('rabbitmq');
    });

    it('GET /metrics returns Prometheus format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.payload).toContain('photo_sync_jobs_active');
      expect(response.payload).toContain('# HELP');
      expect(response.payload).toContain('# TYPE');
    });
  });

  describe('Error Handling', () => {
    it('returns 404 for unknown routes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/unknown-route',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('includes correlation ID in error responses', async () => {
      const correlationId = 'test-correlation-123';
      const response = await app.inject({
        method: 'GET',
        url: '/unknown-route',
        headers: {
          'x-correlation-id': correlationId,
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.error.correlationId).toBe(correlationId);
      expect(response.headers['x-correlation-id']).toBe(correlationId);
    });
  });

  describe('CORS', () => {
    it('includes CORS headers for allowed origins', async () => {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/health',
        headers: {
          origin: 'http://localhost:3000',
          'access-control-request-method': 'GET',
        },
      });

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });
  });
});
