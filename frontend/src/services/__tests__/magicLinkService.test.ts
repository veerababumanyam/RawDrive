/**
 * Tests for MagicLinkService.
 *
 * Tests cover:
 * - Link CRUD operations
 * - Error handling with user-friendly messages
 * - QR code operations
 * - Sharing functionality
 * - Formatting utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MagicLinkService, MagicLinkError } from '../magicLinkService';
import type { MagicLink, CreateMagicLinkRequest } from '../../types/gallery';

// Mock the API client module
vi.mock('../api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
  getApiBaseUrl: vi.fn(() => 'http://localhost:8000'),
}));

// Import the mocked apiClient
import apiClient from '../api';

// Mock fetch for QR code tests (binary downloads use fetch directly)
const originalFetch = global.fetch;
global.fetch = vi.fn();

// Mock navigator
const mockShare = vi.fn();
const mockWriteText = vi.fn();

Object.defineProperty(navigator, 'share', {
  value: mockShare,
  writable: true,
  configurable: true,
});

Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: mockWriteText },
  writable: true,
  configurable: true,
});

describe('MagicLinkService', () => {
  let service: MagicLinkService;

  const mockLink: MagicLink = {
    link_id: 'link-123',
    gallery_id: 'gallery-456',
    label: 'Test Link',
    target_type: 'gallery',
    status: 'active',
    access_count: 5,
    max_accesses: 100,
    expires_at: '2025-12-31T23:59:59Z',
    token: 'abc123token',
    url: 'https://rawdrive.ai/g/abc123token',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MagicLinkService();
    mockShare.mockReset();
    mockWriteText.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createLink', () => {
    it('creates a magic link successfully', async () => {
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: mockLink,
        error: null,
      });

      const request: CreateMagicLinkRequest = {
        label: 'Test Link',
        target_type: 'gallery',
      };

      const result = await service.createLink('ws-123', 'gallery-456', request);

      expect(result).toEqual(mockLink);
      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/workspaces/ws-123/galleries/gallery-456/magic-links',
        request
      );
    });

    it('throws MagicLinkError on failure', async () => {
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request',
          status: 400,
        },
      });

      const request: CreateMagicLinkRequest = {
        label: 'Test',
        target_type: 'gallery',
      };

      await expect(service.createLink('ws-123', 'gallery-456', request)).rejects.toThrow(
        MagicLinkError
      );
    });
  });

  describe('listLinks', () => {
    it('lists magic links with pagination', async () => {
      const mockResponse = {
        links: [mockLink],
        total: 1,
        limit: 50,
        offset: 0,
      };

      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: mockResponse,
        error: null,
      });

      const result = await service.listLinks('ws-123', 'gallery-456');

      expect(result.links).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('passes pagination params correctly', async () => {
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { links: [], total: 0, limit: 10, offset: 20 },
        error: null,
      });

      await service.listLinks('ws-123', 'gallery-456', { limit: 10, offset: 20 });

      expect(apiClient.get).toHaveBeenCalledWith(
        expect.stringContaining('limit=10')
      );
      expect(apiClient.get).toHaveBeenCalledWith(
        expect.stringContaining('offset=20')
      );
    });
  });

  describe('revokeLink', () => {
    it('revokes a link successfully', async () => {
      (apiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { message: 'Link revoked' },
        error: null,
      });

      await expect(
        service.revokeLink('ws-123', 'gallery-456', 'link-123')
      ).resolves.not.toThrow();

      expect(apiClient.delete).toHaveBeenCalledWith(
        '/api/v1/workspaces/ws-123/galleries/gallery-456/magic-links/link-123'
      );
    });
  });

  describe('getQRCode', () => {
    it('downloads QR code as PNG by default', async () => {
      const mockBlob = new Blob(['fake-png-data'], { type: 'image/png' });
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      const result = await service.getQRCode('ws-123', 'gallery-456', 'link-123');

      expect(result).toBeInstanceOf(Blob);
      // getQRCode uses fetch with full URL including base URL from getApiBaseUrl()
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/workspaces/ws-123/galleries/gallery-456/magic-links/link-123/qr',
        expect.objectContaining({
          method: 'GET',
          credentials: 'include',
        })
      );
    });

    it('supports SVG format', async () => {
      const mockBlob = new Blob(['<svg></svg>'], { type: 'image/svg+xml' });
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      await service.getQRCode('ws-123', 'gallery-456', 'link-123', { format: 'svg' });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('format=svg'),
        expect.any(Object)
      );
    });

    it('supports PDF format', async () => {
      const mockBlob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      await service.getQRCode('ws-123', 'gallery-456', 'link-123', { format: 'pdf' });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('format=pdf'),
        expect.any(Object)
      );
    });

    it('throws MagicLinkError on QR code fetch failure', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ code: 'INTERNAL_ERROR', message: 'Server error' }),
      });

      await expect(
        service.getQRCode('ws-123', 'gallery-456', 'link-123')
      ).rejects.toThrow(MagicLinkError);
    });
  });

  describe('share', () => {
    it('uses Web Share API when available', async () => {
      // @ts-expect-error - Mock navigator.share to exist and succeed
      Object.defineProperty(navigator, 'share', {
        value: vi.fn().mockResolvedValue(undefined),
        writable: true,
        configurable: true,
      });

      const result = await service.share('https://example.com', 'Test', 'Description');

      expect(result.shared).toBe(true);
      expect(navigator.share).toHaveBeenCalledWith({
        url: 'https://example.com',
        title: 'Test',
        text: 'Description',
      });
    });

    it('falls back to clipboard when share is not available', async () => {
      // @ts-expect-error - Remove navigator.share
      Object.defineProperty(navigator, 'share', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const result = await service.share('https://example.com');

      expect(result.copied).toBe(true);
      expect(mockWriteText).toHaveBeenCalledWith('https://example.com');
    });

    it('falls back to clipboard when share fails', async () => {
      // @ts-expect-error - Mock share to throw
      Object.defineProperty(navigator, 'share', {
        value: vi.fn().mockRejectedValue(new Error('Share failed')),
        writable: true,
        configurable: true,
      });

      const result = await service.share('https://example.com');

      expect(result.copied).toBe(true);
      expect(mockWriteText).toHaveBeenCalled();
    });
  });

  describe('formatExpiration', () => {
    it('returns "Never expires" for undefined expiration', () => {
      const result = service.formatExpiration(undefined);
      expect(result).toBe('Never expires');
    });

    it('returns "Expired" for past dates', () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString(); // Yesterday
      const result = service.formatExpiration(pastDate);
      expect(result).toContain('Expired');
    });

    it('formats future dates correctly', () => {
      const futureDate = new Date(Date.now() + 86400000 * 7).toISOString(); // 7 days
      const result = service.formatExpiration(futureDate);
      expect(result).toMatch(/\d+ days?/);
    });
  });

  describe('formatAccessCount', () => {
    it('shows count without max', () => {
      const result = service.formatAccessCount(5);
      expect(result).toBe('5 views');
    });

    it('shows count with max', () => {
      const result = service.formatAccessCount(5, 100);
      expect(result).toBe('5 / 100 views');
    });

    it('handles singular view', () => {
      const result = service.formatAccessCount(1);
      expect(result).toBe('1 view');
    });

    it('handles zero views', () => {
      const result = service.formatAccessCount(0);
      expect(result).toBe('0 views');
    });
  });

  describe('Error Messages', () => {
    it('provides user-friendly message for API errors', async () => {
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: null,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Something went wrong',
          status: 500,
        },
      });

      try {
        await service.createLink('ws-123', 'gallery-456', {
          label: 'Test',
          target_type: 'gallery',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(MagicLinkError);
        expect((error as MagicLinkError).code).toBe('INTERNAL_ERROR');
      }
    });

    it('provides user-friendly message for 404', async () => {
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: null,
        error: {
          code: 'LINK_NOT_FOUND',
          message: 'Not found',
          status: 404,
        },
      });

      try {
        await service.getLink('ws-123', 'gallery-456', 'link-123');
      } catch (error) {
        expect(error).toBeInstanceOf(MagicLinkError);
        expect((error as MagicLinkError).code).toBe('LINK_NOT_FOUND');
      }
    });

    it('provides user-friendly message for 403', async () => {
      (apiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: null,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied',
          status: 403,
        },
      });

      try {
        await service.revokeLink('ws-123', 'gallery-456', 'link-123');
      } catch (error) {
        expect(error).toBeInstanceOf(MagicLinkError);
        expect((error as MagicLinkError).code).toBe('FORBIDDEN');
      }
    });
  });
});
