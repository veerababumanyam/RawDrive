/**
 * Tests for ShareDialog component.
 *
 * Tests cover:
 * - Rendering and tab navigation
 * - Link creation flow
 * - Link listing and management
 * - QR code display and download
 * - Copy and share functionality
 * - Error handling
 * - WCAG 2.1 AA compliance
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareDialog } from '../ShareDialog';
import { magicLinkService } from '../../../../services/magicLinkService';
import type { MagicLink } from '../../../../types/gallery';

// Mock the magicLinkService
vi.mock('../../../../services/magicLinkService', () => ({
  magicLinkService: {
    listLinks: vi.fn(),
    createLink: vi.fn(),
    revokeLink: vi.fn(),
    getQRCode: vi.fn(),
    downloadQRCode: vi.fn(),
    copyToClipboard: vi.fn(),
    share: vi.fn(),
    formatExpiration: vi.fn(),
    formatAccessCount: vi.fn(),
  },
  MagicLinkError: class MagicLinkError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'MagicLinkError';
    }
  },
}));

// Mock URL.createObjectURL and revokeObjectURL
const mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
const mockRevokeObjectURL = vi.fn();
global.URL.createObjectURL = mockCreateObjectURL;
global.URL.revokeObjectURL = mockRevokeObjectURL;

// Mock window.confirm
const mockConfirm = vi.fn(() => true);
global.confirm = mockConfirm;

describe('ShareDialog', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    workspaceId: 'workspace-123',
    galleryId: 'gallery-456',
    galleryTitle: 'Wedding Gallery',
  };

  const mockLink: MagicLink = {
    link_id: 'link-001',
    gallery_id: 'gallery-456',
    label: 'Test Link',
    url: 'https://rawdrive.ai/g/link-001',
    status: 'active',
    access_count: 5,
    max_accesses: 100,
    expires_at: '2025-12-31T23:59:59Z',
    created_at: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (magicLinkService.listLinks as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 50 },
    });
    (magicLinkService.formatExpiration as ReturnType<typeof vi.fn>).mockReturnValue('Never expires');
    (magicLinkService.formatAccessCount as ReturnType<typeof vi.fn>).mockReturnValue('5 views');
    (magicLinkService.copyToClipboard as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (magicLinkService.share as ReturnType<typeof vi.fn>).mockResolvedValue({ shared: true, copied: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('renders modal when open', async () => {
      render(<ShareDialog {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Share Gallery')).toBeInTheDocument();
      expect(screen.getByText(/Create a shareable link for Wedding Gallery/)).toBeInTheDocument();
    });

    it('does not render when closed', () => {
      render(<ShareDialog {...defaultProps} isOpen={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders tab navigation', async () => {
      render(<ShareDialog {...defaultProps} />);

      const tablist = screen.getByRole('tablist');
      expect(tablist).toBeInTheDocument();

      const createTab = screen.getByRole('tab', { name: /Create Link/i });
      const myLinksTab = screen.getByRole('tab', { name: /My Links/i });

      expect(createTab).toBeInTheDocument();
      expect(myLinksTab).toBeInTheDocument();
    });

    it('shows Create Link tab as default', async () => {
      render(<ShareDialog {...defaultProps} />);

      const createTab = screen.getByRole('tab', { name: /Create Link/i });
      expect(createTab).toHaveAttribute('aria-selected', 'true');

      // Create form should be visible
      expect(screen.getByText('Link Label (Optional)')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Create Shareable Link/i })).toBeInTheDocument();
    });
  });

  describe('Create Link Flow', () => {
    it('creates a link with label', async () => {
      const user = userEvent.setup();
      const newLink: MagicLink = {
        ...mockLink,
        link_id: 'new-link-001',
        label: 'My Custom Label',
      };

      (magicLinkService.createLink as ReturnType<typeof vi.fn>).mockResolvedValue(newLink);
      (magicLinkService.getQRCode as ReturnType<typeof vi.fn>).mockResolvedValue(new Blob(['mock-qr'], { type: 'image/png' }));

      render(<ShareDialog {...defaultProps} />);

      // Enter label
      const labelInput = screen.getByPlaceholderText(/Wedding Gallery - Smith Family/i);
      await user.type(labelInput, 'My Custom Label');

      // Click create button
      const createButton = screen.getByRole('button', { name: /Create Shareable Link/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(magicLinkService.createLink).toHaveBeenCalledWith(
          'workspace-123',
          'gallery-456',
          expect.objectContaining({ label: 'My Custom Label' })
        );
      });
    });

    it('shows advanced options when toggled', async () => {
      const user = userEvent.setup();
      render(<ShareDialog {...defaultProps} />);

      // Advanced options should be hidden initially
      expect(screen.queryByText('Expiration Date')).not.toBeInTheDocument();

      // Click advanced options toggle
      const advancedToggle = screen.getByRole('button', { name: /Advanced options/i });
      await user.click(advancedToggle);

      // Advanced options should be visible
      expect(screen.getByText('Expiration Date')).toBeInTheDocument();
      expect(screen.getByText('Maximum Views')).toBeInTheDocument();
    });

    it('creates link with expiration and max views', async () => {
      const user = userEvent.setup();
      const newLink: MagicLink = {
        ...mockLink,
        expires_at: '2025-06-01T12:00:00.000Z',
        max_accesses: 50,
      };

      (magicLinkService.createLink as ReturnType<typeof vi.fn>).mockResolvedValue(newLink);
      (magicLinkService.getQRCode as ReturnType<typeof vi.fn>).mockResolvedValue(new Blob(['mock-qr'], { type: 'image/png' }));

      render(<ShareDialog {...defaultProps} />);

      // Open advanced options
      const advancedToggle = screen.getByRole('button', { name: /Advanced options/i });
      await user.click(advancedToggle);

      // Set max views
      const maxViewsInput = screen.getByPlaceholderText('Unlimited');
      await user.type(maxViewsInput, '50');

      // Create link
      const createButton = screen.getByRole('button', { name: /Create Shareable Link/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(magicLinkService.createLink).toHaveBeenCalledWith(
          'workspace-123',
          'gallery-456',
          expect.objectContaining({ max_accesses: 50 })
        );
      });
    });

    it('navigates to QR view after creating link', async () => {
      const user = userEvent.setup();
      const newLink: MagicLink = { ...mockLink };

      (magicLinkService.createLink as ReturnType<typeof vi.fn>).mockResolvedValue(newLink);
      (magicLinkService.getQRCode as ReturnType<typeof vi.fn>).mockResolvedValue(new Blob(['mock-qr'], { type: 'image/png' }));

      render(<ShareDialog {...defaultProps} />);

      const createButton = screen.getByRole('button', { name: /Create Shareable Link/i });
      await user.click(createButton);

      // Should show QR tab and display QR code view
      await waitFor(() => {
        expect(screen.getByText('Download QR Code')).toBeInTheDocument();
      });
    });
  });

  describe('Link List View', () => {
    it('shows existing links', async () => {
      const user = userEvent.setup();
      (magicLinkService.listLinks as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [mockLink],
        meta: { total: 1, page: 1, limit: 50 },
      });

      render(<ShareDialog {...defaultProps} />);

      // Wait for links to load
      await waitFor(() => {
        expect(magicLinkService.listLinks).toHaveBeenCalled();
      });

      // Navigate to list view
      const myLinksTab = screen.getByRole('tab', { name: /My Links/i });
      await user.click(myLinksTab);

      await waitFor(() => {
        expect(screen.getByText('Test Link')).toBeInTheDocument();
      });
    });

    it('shows empty state when no links exist', async () => {
      const user = userEvent.setup();
      render(<ShareDialog {...defaultProps} />);

      // Wait for links to load
      await waitFor(() => {
        expect(magicLinkService.listLinks).toHaveBeenCalled();
      });

      // Navigate to list view
      const myLinksTab = screen.getByRole('tab', { name: /My Links/i });
      await user.click(myLinksTab);

      await waitFor(() => {
        expect(screen.getByText('No active links yet')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Create your first link/i })).toBeInTheDocument();
      });
    });

    it('handles link copy', async () => {
      const user = userEvent.setup();
      (magicLinkService.listLinks as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [mockLink],
        meta: { total: 1, page: 1, limit: 50 },
      });

      render(<ShareDialog {...defaultProps} />);

      // Wait for links to load
      await waitFor(() => {
        expect(magicLinkService.listLinks).toHaveBeenCalled();
      });

      // Navigate to list view
      const myLinksTab = screen.getByRole('tab', { name: /My Links/i });
      await user.click(myLinksTab);

      await waitFor(() => {
        expect(screen.getByText('Test Link')).toBeInTheDocument();
      });

      // Click copy button
      const copyButton = screen.getByRole('button', { name: /Copy link/i });
      await user.click(copyButton);

      expect(magicLinkService.copyToClipboard).toHaveBeenCalledWith('https://rawdrive.ai/g/link-001');
    });

    it('handles link revocation', async () => {
      const user = userEvent.setup();
      (magicLinkService.listLinks as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [mockLink],
        meta: { total: 1, page: 1, limit: 50 },
      });
      (magicLinkService.revokeLink as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      render(<ShareDialog {...defaultProps} />);

      // Wait for links to load
      await waitFor(() => {
        expect(magicLinkService.listLinks).toHaveBeenCalled();
      });

      // Navigate to list view
      const myLinksTab = screen.getByRole('tab', { name: /My Links/i });
      await user.click(myLinksTab);

      await waitFor(() => {
        expect(screen.getByText('Test Link')).toBeInTheDocument();
      });

      // Click revoke button
      const revokeButton = screen.getByRole('button', { name: /Revoke link/i });
      await user.click(revokeButton);

      expect(mockConfirm).toHaveBeenCalled();
      expect(magicLinkService.revokeLink).toHaveBeenCalledWith(
        'workspace-123',
        'gallery-456',
        'link-001'
      );
    });
  });

  describe('QR Code View', () => {
    it('displays QR code after link creation', async () => {
      const user = userEvent.setup();
      const newLink: MagicLink = { ...mockLink };

      (magicLinkService.createLink as ReturnType<typeof vi.fn>).mockResolvedValue(newLink);
      (magicLinkService.getQRCode as ReturnType<typeof vi.fn>).mockResolvedValue(new Blob(['mock-qr'], { type: 'image/png' }));

      render(<ShareDialog {...defaultProps} />);

      const createButton = screen.getByRole('button', { name: /Create Shareable Link/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByAltText(/QR code for Wedding Gallery/i)).toBeInTheDocument();
      });
    });

    it('shows link URL in QR view', async () => {
      const user = userEvent.setup();
      const newLink: MagicLink = { ...mockLink };

      (magicLinkService.createLink as ReturnType<typeof vi.fn>).mockResolvedValue(newLink);
      (magicLinkService.getQRCode as ReturnType<typeof vi.fn>).mockResolvedValue(new Blob(['mock-qr'], { type: 'image/png' }));

      render(<ShareDialog {...defaultProps} />);

      const createButton = screen.getByRole('button', { name: /Create Shareable Link/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('Link URL')).toBeInTheDocument();
        expect(screen.getByText('https://rawdrive.ai/g/link-001')).toBeInTheDocument();
      });
    });

    it('handles QR code download', async () => {
      const user = userEvent.setup();
      const newLink: MagicLink = { ...mockLink };

      (magicLinkService.createLink as ReturnType<typeof vi.fn>).mockResolvedValue(newLink);
      (magicLinkService.getQRCode as ReturnType<typeof vi.fn>).mockResolvedValue(new Blob(['mock-qr'], { type: 'image/png' }));
      (magicLinkService.downloadQRCode as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      render(<ShareDialog {...defaultProps} />);

      const createButton = screen.getByRole('button', { name: /Create Shareable Link/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('Download QR Code')).toBeInTheDocument();
      });

      // Download PNG
      const pngButton = screen.getByRole('button', { name: /PNG/i });
      await user.click(pngButton);

      expect(magicLinkService.downloadQRCode).toHaveBeenCalledWith(
        'workspace-123',
        'gallery-456',
        'link-001',
        expect.objectContaining({ format: 'png' })
      );
    });

    it('allows downloading in multiple formats', async () => {
      const user = userEvent.setup();
      const newLink: MagicLink = { ...mockLink };

      (magicLinkService.createLink as ReturnType<typeof vi.fn>).mockResolvedValue(newLink);
      (magicLinkService.getQRCode as ReturnType<typeof vi.fn>).mockResolvedValue(new Blob(['mock-qr'], { type: 'image/png' }));
      (magicLinkService.downloadQRCode as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      render(<ShareDialog {...defaultProps} />);

      const createButton = screen.getByRole('button', { name: /Create Shareable Link/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /PNG/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /SVG/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /PDF/i })).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('displays error when link creation fails', async () => {
      const user = userEvent.setup();
      const { MagicLinkError } = await import('../../../../services/magicLinkService');
      (magicLinkService.createLink as ReturnType<typeof vi.fn>).mockRejectedValue(
        new MagicLinkError('Rate limit exceeded')
      );

      render(<ShareDialog {...defaultProps} />);

      const createButton = screen.getByRole('button', { name: /Create Shareable Link/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('Rate limit exceeded')).toBeInTheDocument();
      });
    });

    it('displays generic error for unknown failures', async () => {
      const user = userEvent.setup();
      (magicLinkService.createLink as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Network error')
      );

      render(<ShareDialog {...defaultProps} />);

      const createButton = screen.getByRole('button', { name: /Create Shareable Link/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('Failed to create link')).toBeInTheDocument();
      });
    });

    it('displays error when loading links fails', async () => {
      (magicLinkService.listLinks as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Server error')
      );

      render(<ShareDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('Failed to load existing links')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('has accessible modal structure', async () => {
      render(<ShareDialog {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
    });

    it('has properly labeled tabs', async () => {
      render(<ShareDialog {...defaultProps} />);

      const tablist = screen.getByRole('tablist');
      expect(tablist).toBeInTheDocument();

      const tabs = within(tablist).getAllByRole('tab');
      expect(tabs.length).toBeGreaterThanOrEqual(2);

      tabs.forEach((tab) => {
        expect(tab).toHaveAttribute('aria-selected');
      });
    });

    it('has accessible buttons with labels', async () => {
      const user = userEvent.setup();
      (magicLinkService.listLinks as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [mockLink],
        meta: { total: 1, page: 1, limit: 50 },
      });

      render(<ShareDialog {...defaultProps} />);

      // Navigate to list view
      const myLinksTab = screen.getByRole('tab', { name: /My Links/i });
      await user.click(myLinksTab);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Copy link/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Share link/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /View QR code/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Revoke link/i })).toBeInTheDocument();
      });
    });

    it('has accessible error alerts', async () => {
      const user = userEvent.setup();
      (magicLinkService.createLink as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Failed')
      );

      render(<ShareDialog {...defaultProps} />);

      const createButton = screen.getByRole('button', { name: /Create Shareable Link/i });
      await user.click(createButton);

      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toBeInTheDocument();
      });
    });

    it('exposes advanced options toggle state', async () => {
      const user = userEvent.setup();
      render(<ShareDialog {...defaultProps} />);

      const advancedToggle = screen.getByRole('button', { name: /Advanced options/i });
      expect(advancedToggle).toHaveAttribute('aria-expanded', 'false');

      await user.click(advancedToggle);

      expect(advancedToggle).toHaveAttribute('aria-expanded', 'true');
    });
  });

  describe('Modal Behavior', () => {
    it('calls onClose when Done button is clicked', async () => {
      const user = userEvent.setup();
      render(<ShareDialog {...defaultProps} />);

      const doneButton = screen.getByRole('button', { name: /Done/i });
      await user.click(doneButton);

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('resets state when closed', async () => {
      const user = userEvent.setup();
      const newLink: MagicLink = { ...mockLink };

      (magicLinkService.createLink as ReturnType<typeof vi.fn>).mockResolvedValue(newLink);
      (magicLinkService.getQRCode as ReturnType<typeof vi.fn>).mockResolvedValue(new Blob(['mock-qr'], { type: 'image/png' }));

      const { rerender } = render(<ShareDialog {...defaultProps} />);

      // Create a link to change view to QR
      const createButton = screen.getByRole('button', { name: /Create Shareable Link/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('Download QR Code')).toBeInTheDocument();
      });

      // Close and reopen
      const doneButton = screen.getByRole('button', { name: /Done/i });
      await user.click(doneButton);

      rerender(<ShareDialog {...defaultProps} isOpen={false} />);
      rerender(<ShareDialog {...defaultProps} isOpen={true} />);

      // Should be back to create view
      await waitFor(() => {
        const createTab = screen.getByRole('tab', { name: /Create Link/i });
        expect(createTab).toHaveAttribute('aria-selected', 'true');
      });
    });
  });

  describe('Share Functionality', () => {
    it('handles native share on supported devices', async () => {
      const user = userEvent.setup();
      (magicLinkService.listLinks as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [mockLink],
        meta: { total: 1, page: 1, limit: 50 },
      });

      render(<ShareDialog {...defaultProps} />);

      // Navigate to list view
      const myLinksTab = screen.getByRole('tab', { name: /My Links/i });
      await user.click(myLinksTab);

      await waitFor(() => {
        expect(screen.getByText('Test Link')).toBeInTheDocument();
      });

      // Click share button
      const shareButton = screen.getByRole('button', { name: /Share link/i });
      await user.click(shareButton);

      expect(magicLinkService.share).toHaveBeenCalledWith(
        'https://rawdrive.ai/g/link-001',
        'Wedding Gallery',
        'Check out this gallery: Wedding Gallery'
      );
    });

    it('shows copied indicator when share falls back to copy', async () => {
      const user = userEvent.setup();
      (magicLinkService.listLinks as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [mockLink],
        meta: { total: 1, page: 1, limit: 50 },
      });
      (magicLinkService.share as ReturnType<typeof vi.fn>).mockResolvedValue({
        shared: false,
        copied: true,
      });

      render(<ShareDialog {...defaultProps} />);

      // Navigate to list view
      const myLinksTab = screen.getByRole('tab', { name: /My Links/i });
      await user.click(myLinksTab);

      await waitFor(() => {
        expect(screen.getByText('Test Link')).toBeInTheDocument();
      });

      // Click share button
      const shareButton = screen.getByRole('button', { name: /Share link/i });
      await user.click(shareButton);

      // Should show "Copied" state temporarily
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Link copied/i })).toBeInTheDocument();
      });
    });
  });
});
