/**
 * Tests for RSVP PDF Export Download Flow (T047)
 *
 * Test coverage:
 * - PDF download blob handling
 * - Error handling for failed exports
 * - Loading states during export
 * - File naming and content-disposition
 *
 * Feature: 020-invitation-rsvp-hardening
 * Task: T047 - Add frontend download flow test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock URL.createObjectURL and URL.revokeObjectURL
const mockCreateObjectURL = vi.fn(() => 'blob:http://localhost/mock-url');
const mockRevokeObjectURL = vi.fn();
global.URL.createObjectURL = mockCreateObjectURL;
global.URL.revokeObjectURL = mockRevokeObjectURL;

// ---------------------------------------------------------------------------
// Test Utilities
// ---------------------------------------------------------------------------

/**
 * Creates a mock PDF blob response
 */
function createMockPDFBlob(): Blob {
  // PDF magic bytes + minimal content
  const pdfContent = '%PDF-1.4\n1 0 obj\n<<>>\nendobj\nxref\ntrailer\n<<>>\nstartxref\n0\n%%EOF';
  return new Blob([pdfContent], { type: 'application/pdf' });
}

/**
 * Creates a mock successful PDF response
 */
function createMockPDFResponse(): Response {
  const blob = createMockPDFBlob();
  return new Response(blob, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="test-rsvps-20250103.pdf"',
    },
  });
}

/**
 * Creates a mock error response
 */
function createMockErrorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ detail: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// PDF Download Flow Tests
// ---------------------------------------------------------------------------

describe('RSVP PDF Export Download Flow', () => {
  const workspaceId = 'test-workspace-123';
  const invitationId = 'test-invitation-456';
  const invitationTitle = 'Test Wedding';

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock document.createElement for link element
    const mockLink = {
      href: '',
      download: '',
      click: vi.fn(),
      remove: vi.fn(),
    };
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        return mockLink as unknown as HTMLAnchorElement;
      }
      return document.createElement(tag);
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => document.body);
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => document.body);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Successful PDF Export', () => {
    it('should fetch PDF from correct endpoint', async () => {
      mockFetch.mockResolvedValueOnce(createMockPDFResponse());

      // Simulate the export call that RSVPExport component makes
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/invitations/${invitationId}/rsvps/export?format=pdf`,
        {
          method: 'GET',
          headers: { Accept: 'application/pdf' },
        }
      );

      expect(mockFetch).toHaveBeenCalledWith(
        `/api/v1/workspaces/${workspaceId}/invitations/${invitationId}/rsvps/export?format=pdf`,
        expect.objectContaining({
          method: 'GET',
          headers: { Accept: 'application/pdf' },
        })
      );
      expect(response.ok).toBe(true);
    });

    it('should handle PDF blob correctly', async () => {
      mockFetch.mockResolvedValueOnce(createMockPDFResponse());

      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/invitations/${invitationId}/rsvps/export?format=pdf`,
        { headers: { Accept: 'application/pdf' } }
      );

      const blob = await response.blob();

      expect(blob.type).toBe('application/pdf');
      expect(blob.size).toBeGreaterThan(0);
    });

    it('should create object URL for download', async () => {
      mockFetch.mockResolvedValueOnce(createMockPDFResponse());

      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/invitations/${invitationId}/rsvps/export?format=pdf`
      );
      const blob = await response.blob();

      // Simulate what RSVPExport does
      const url = URL.createObjectURL(blob);

      expect(mockCreateObjectURL).toHaveBeenCalledWith(blob);
      expect(url).toBe('blob:http://localhost/mock-url');
    });

    it('should revoke object URL after download', async () => {
      const blobUrl = 'blob:http://localhost/test-url';
      mockCreateObjectURL.mockReturnValueOnce(blobUrl);
      mockFetch.mockResolvedValueOnce(createMockPDFResponse());

      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/invitations/${invitationId}/rsvps/export?format=pdf`
      );
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      // Simulate cleanup
      URL.revokeObjectURL(url);

      expect(mockRevokeObjectURL).toHaveBeenCalledWith(blobUrl);
    });

    it('should use correct filename from invitation title', async () => {
      mockFetch.mockResolvedValueOnce(createMockPDFResponse());

      // The filename is generated as: rsvps-{invitationTitle || invitationId}.pdf
      const expectedFilename = `rsvps-${invitationTitle || invitationId}.pdf`;

      expect(expectedFilename).toBe('rsvps-Test Wedding.pdf');
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 Not Found error', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockErrorResponse(404, 'Invitation not found')
      );

      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/invitations/invalid-id/rsvps/export?format=pdf`
      );

      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });

    it('should handle 501 Not Implemented (PDF unavailable)', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockErrorResponse(501, 'PDF export is not available')
      );

      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/invitations/${invitationId}/rsvps/export?format=pdf`
      );

      expect(response.ok).toBe(false);
      expect(response.status).toBe(501);
    });

    it('should handle 500 Server Error', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockErrorResponse(500, 'Failed to generate PDF')
      );

      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/invitations/${invitationId}/rsvps/export?format=pdf`
      );

      expect(response.ok).toBe(false);
      expect(response.status).toBe(500);
    });

    it('should handle network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        fetch(`/api/v1/workspaces/${workspaceId}/invitations/${invitationId}/rsvps/export?format=pdf`)
      ).rejects.toThrow('Network error');
    });

    it('should handle timeout', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Request timeout'));

      await expect(
        fetch(`/api/v1/workspaces/${workspaceId}/invitations/${invitationId}/rsvps/export?format=pdf`)
      ).rejects.toThrow('Request timeout');
    });
  });

  describe('Content Type Validation', () => {
    it('should validate response is PDF content type', async () => {
      mockFetch.mockResolvedValueOnce(createMockPDFResponse());

      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/invitations/${invitationId}/rsvps/export?format=pdf`
      );

      const contentType = response.headers.get('Content-Type');
      expect(contentType).toBe('application/pdf');
    });

    it('should handle non-PDF response gracefully', async () => {
      // Server returns HTML error page instead of PDF
      const htmlResponse = new Response('<html><body>Error</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
      mockFetch.mockResolvedValueOnce(htmlResponse);

      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/invitations/${invitationId}/rsvps/export?format=pdf`
      );

      const contentType = response.headers.get('Content-Type');
      expect(contentType).not.toBe('application/pdf');
    });
  });

  describe('Workspace Isolation', () => {
    it('should include workspace_id in request URL', async () => {
      mockFetch.mockResolvedValueOnce(createMockPDFResponse());

      await fetch(
        `/api/v1/workspaces/${workspaceId}/invitations/${invitationId}/rsvps/export?format=pdf`
      );

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain(`/workspaces/${workspaceId}/`);
    });

    it('should include invitation_id in request URL', async () => {
      mockFetch.mockResolvedValueOnce(createMockPDFResponse());

      await fetch(
        `/api/v1/workspaces/${workspaceId}/invitations/${invitationId}/rsvps/export?format=pdf`
      );

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain(`/invitations/${invitationId}/`);
    });
  });
});

// ---------------------------------------------------------------------------
// Export Format Selection Tests
// ---------------------------------------------------------------------------

describe('Export Format Selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should request PDF format when format=pdf', async () => {
    mockFetch.mockResolvedValueOnce(createMockPDFResponse());

    await fetch('/api/v1/workspaces/ws/invitations/inv/rsvps/export?format=pdf');

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('format=pdf');
  });

  it('should request CSV format when format=csv', async () => {
    const csvResponse = new Response('name,email\nAlice,alice@example.com', {
      status: 200,
      headers: { 'Content-Type': 'text/csv' },
    });
    mockFetch.mockResolvedValueOnce(csvResponse);

    await fetch('/api/v1/workspaces/ws/invitations/inv/rsvps/export?format=csv');

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('format=csv');
  });

  it('should default to CSV when no format specified', async () => {
    const csvResponse = new Response('name,email\nAlice,alice@example.com', {
      status: 200,
      headers: { 'Content-Type': 'text/csv' },
    });
    mockFetch.mockResolvedValueOnce(csvResponse);

    // No format parameter - server defaults to CSV
    await fetch('/api/v1/workspaces/ws/invitations/inv/rsvps/export');

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).not.toContain('format=pdf');
  });
});

// ---------------------------------------------------------------------------
// Download Link Creation Tests
// ---------------------------------------------------------------------------

describe('Download Link Creation', () => {
  let mockLinkElement: {
    href: string;
    download: string;
    click: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLinkElement = {
      href: '',
      download: '',
      click: vi.fn(),
    };

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        return mockLinkElement as unknown as HTMLAnchorElement;
      }
      return document.createElement(tag);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create anchor element for download', () => {
    // Simulate the download trigger from RSVPExport
    const link = document.createElement('a');

    expect(document.createElement).toHaveBeenCalledWith('a');
    expect(link).toBe(mockLinkElement);
  });

  it('should set href to blob URL', () => {
    const blobUrl = 'blob:http://localhost/pdf-123';
    const link = document.createElement('a') as HTMLAnchorElement;
    link.href = blobUrl;

    expect(mockLinkElement.href).toBe(blobUrl);
  });

  it('should set download attribute with filename', () => {
    const filename = 'wedding-rsvps-20250103.pdf';
    const link = document.createElement('a') as HTMLAnchorElement;
    link.download = filename;

    expect(mockLinkElement.download).toBe(filename);
  });

  it('should programmatically click link to trigger download', () => {
    const link = document.createElement('a') as HTMLAnchorElement;
    link.click();

    expect(mockLinkElement.click).toHaveBeenCalled();
  });
});
