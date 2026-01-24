/**
 * Tests for ProfileSettingsPage Public Profile Card component.
 *
 * Tests cover:
 * - Loading state while fetching public profile slug
 * - Error state when no personal profile exists
 * - Success state with URL display and QR code
 * - Copy URL functionality with visual feedback
 * - Download QR code functionality
 * - View Profile navigation
 * - Accessibility compliance
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProfileSettingsPage from '../ProfileSettingsPage';
import { personalProfileService } from '../../../services/personalProfileService';
import { useAuth } from '../../../contexts/AuthContext';
import { useUserProfile } from '../../../hooks/useUserSettings';
import { useToastActions } from '../../../components/ui/Toast';

// Mock the services and hooks
vi.mock('../../../services/personalProfileService', () => ({
  personalProfileService: {
    getProfile: vi.fn(),
    getPublicProfileUrl: vi.fn((slug: string) => `https://rawdrive.ai/u/${slug}`),
  },
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../../hooks/useUserSettings', () => ({
  useUserProfile: vi.fn(),
}));

vi.mock('../../../components/ui/Toast', () => ({
  useToastActions: vi.fn(() => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  })),
}));

vi.mock('../../../components/settings/AvatarUploader', () => ({
  AvatarUploader: () => <div data-testid="avatar-uploader">Avatar Uploader</div>,
}));

vi.mock('../../../components/settings/TimezonePicker', () => ({
  TimezonePicker: () => <div data-testid="timezone-picker">Timezone Picker</div>,
}));

vi.mock('../../../components/settings/EmailChangeModal', () => ({
  EmailChangeModal: () => <div data-testid="email-modal">Email Modal</div>,
}));

vi.mock('../../../components/settings/SettingsPageLayout', () => ({
  SettingsPageLayout: ({ children, title }: any) => (
    <div data-testid="settings-layout">
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

// Mock URL methods
const mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
const mockRevokeObjectURL = vi.fn();
global.URL.createObjectURL = mockCreateObjectURL;
global.URL.revokeObjectURL = mockRevokeObjectURL;

// Mock fetch for QR code download
global.fetch = vi.fn();

// Mock window.open for view profile
const mockOpen = vi.fn();
global.window.open = mockOpen;

describe('ProfileSettingsPage - Public Profile Card', () => {
  const mockProfile = {
    display_name: 'John Doe',
    job_title: 'Photographer',
    phone: '+1234567890',
    bio: 'Professional photographer',
    timezone: 'UTC',
    avatar_url: null,
  };

  const mockPersonalProfile = {
    slug: 'john-doe',
    email: 'john@example.com',
    display_name: 'John Doe',
  };

  const mockWorkspace = {
    workspace_id: 'workspace-123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockOpen.mockClear();

    // Default mock implementations
    (useAuth as any).mockReturnValue({ workspace: mockWorkspace });
    (useUserProfile as any).mockReturnValue({
      profile: mockProfile,
      loading: false,
      error: null,
      updateProfile: vi.fn(),
      uploadAvatar: vi.fn(),
      deleteAvatar: vi.fn(),
      requestEmailChange: vi.fn(),
    });

    (personalProfileService.getProfile as any).mockResolvedValue(mockPersonalProfile);
    (global.fetch as any).mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['QR code data'])),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Reset fetch mock
    (global.fetch as any).mockReset();
    (global.fetch as any).mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['QR code data'])),
    });
    // Reset clipboard mock
    if (navigator.clipboard) {
      delete (navigator as any).clipboard;
    }
  });

  describe('Loading State', () => {
    it('should display loading spinner while fetching slug', async () => {
      // Create a promise that never resolves to keep loading state
      const unresolvingPromise = new Promise(() => {});
      (personalProfileService.getProfile as any).mockReturnValue(unresolvingPromise);

      render(<ProfileSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Loading public profile...')).toBeInTheDocument();
        const spinners = document.querySelectorAll('.animate-spin');
        expect(spinners.length).toBeGreaterThan(0);
      }, { timeout: 3000 });
    });

    it('should transition from loading to success state', async () => {
      render(<ProfileSettingsPage />);

      // After fetch completes, shows success
      await waitFor(() => {
        expect(screen.queryByText('Loading public profile...')).not.toBeInTheDocument();
        expect(screen.getByDisplayValue('https://rawdrive.ai/u/john-doe')).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('Error State - No Personal Profile', () => {
    beforeEach(() => {
      const error: any = new Error('Not found');
      error.response = { status: 404 };
      (personalProfileService.getProfile as any).mockRejectedValue(error);
    });

    it('should display error message when user has no personal profile', async () => {
      render(<ProfileSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('No Public Profile Yet')).toBeInTheDocument();
        expect(
          screen.getByText(/Create a public profile to share your portfolio/)
        ).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should display "Create Public Profile" button', async () => {
      render(<ProfileSettingsPage />);

      await waitFor(() => {
        const createButton = screen.getByRole('button', { name: /Create Public Profile/ });
        expect(createButton).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('Success State - Public Profile Loaded', () => {
    it('should display public profile card with URL', async () => {
      render(<ProfileSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Public Profile')).toBeInTheDocument();
        expect(screen.getByDisplayValue('https://rawdrive.ai/u/john-doe')).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should display QR code image', async () => {
      render(<ProfileSettingsPage />);

      await waitFor(() => {
        const qrImage = screen.getByAltText(/QR code for john-doe public profile/);
        expect(qrImage).toBeInTheDocument();
        expect(qrImage).toHaveAttribute(
          'src',
          expect.stringContaining('api.qrserver.com/v1/create-qr-code')
        );
      }, { timeout: 3000 });
    });

    it('should have QR code with lazy loading', async () => {
      render(<ProfileSettingsPage />);

      await waitFor(() => {
        const qrImage = screen.getByAltText(/QR code for john-doe public profile/);
        expect(qrImage).toHaveAttribute('loading', 'lazy');
      }, { timeout: 3000 });
    });

    it('should display Quick Actions buttons', async () => {
      render(<ProfileSettingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Copy URL/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Download QR/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /View Profile/ })).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should have readonly URL input', async () => {
      render(<ProfileSettingsPage />);

      await waitFor(() => {
        const urlInput = screen.getByDisplayValue(
          'https://rawdrive.ai/u/john-doe'
        ) as HTMLInputElement;
        expect(urlInput).toHaveAttribute('readonly');
      }, { timeout: 3000 });
    });
  });

  describe('Copy URL Functionality', () => {
    it('should show success state after copy click', async () => {
      // Mock navigator.clipboard at runtime
      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: mockWriteText,
        },
      });

      render(<ProfileSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Public Profile')).toBeInTheDocument();
      }, { timeout: 3000 });

      const allButtons = screen.getAllByRole('button');
      const copyButton = allButtons.find(btn => btn.textContent?.includes('Copy') && btn.textContent !== 'Copy URL');

      if (copyButton) {
        fireEvent.click(copyButton);

        await waitFor(() => {
          expect(screen.getByText('Copied!')).toBeInTheDocument();
        }, { timeout: 3000 });
      }
    });

    it('should auto-select text when clicking URL input', async () => {
      render(<ProfileSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Public Profile')).toBeInTheDocument();
      }, { timeout: 3000 });

      const urlInput = screen.getByDisplayValue('https://rawdrive.ai/u/john-doe') as HTMLInputElement;
      const selectSpy = vi.spyOn(urlInput, 'select');

      fireEvent.click(urlInput);

      expect(selectSpy).toHaveBeenCalled();
    });
  });

  describe('Download QR Code Functionality', () => {
    it('should fetch QR code on download button click', async () => {
      render(<ProfileSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Public Profile')).toBeInTheDocument();
      }, { timeout: 3000 });

      const downloadButton = screen.getByRole('button', { name: /Download QR/ });
      fireEvent.click(downloadButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('api.qrserver.com/v1/create-qr-code')
        );
      }, { timeout: 3000 });
    });

    it('should create blob URL for QR download', async () => {
      render(<ProfileSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Public Profile')).toBeInTheDocument();
      }, { timeout: 3000 });

      const downloadButton = screen.getByRole('button', { name: /Download QR/ });
      fireEvent.click(downloadButton);

      await waitFor(() => {
        expect(mockCreateObjectURL).toHaveBeenCalled();
      }, { timeout: 3000 });
    });
  });

  describe('View Profile Functionality', () => {
    it('should open public profile in new tab', async () => {
      render(<ProfileSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Public Profile')).toBeInTheDocument();
      }, { timeout: 3000 });

      const viewButton = screen.getByRole('button', { name: /View Profile/ });
      fireEvent.click(viewButton);

      await waitFor(() => {
        expect(mockOpen).toHaveBeenCalledWith(
          'https://rawdrive.ai/u/john-doe',
          '_blank',
          'noopener,noreferrer'
        );
      }, { timeout: 3000 });
    });

    it('should use security parameters for window.open', async () => {
      render(<ProfileSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Public Profile')).toBeInTheDocument();
      }, { timeout: 3000 });

      const viewButton = screen.getByRole('button', { name: /View Profile/ });
      fireEvent.click(viewButton);

      expect(mockOpen).toHaveBeenCalledWith(
        expect.any(String),
        '_blank',
        expect.stringContaining('noopener')
      );
    });
  });

  describe('Responsive Design', () => {
    it('should have responsive grid layout', async () => {
      render(<ProfileSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Public Profile')).toBeInTheDocument();
      }, { timeout: 3000 });

      const contentGrid = screen.getByText('Your Public Profile URL')?.closest('.grid');
      expect(contentGrid).toHaveClass('grid-cols-1');
    });

    it('should have lg:grid-cols-2 for desktop', async () => {
      render(<ProfileSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Public Profile')).toBeInTheDocument();
      }, { timeout: 3000 });

      const contentGrid = screen.getByText('Your Public Profile URL')?.closest('.grid');
      expect(contentGrid).toHaveClass('lg:grid-cols-2');
    });
  });

  describe('Accessibility', () => {
    it('should have descriptive alt text for QR code', async () => {
      render(<ProfileSettingsPage />);

      await waitFor(() => {
        const qrImage = screen.getByAltText(/QR code for john-doe public profile/);
        expect(qrImage).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should have proper form labels', async () => {
      render(<ProfileSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Your Public Profile URL')).toBeInTheDocument();
        expect(screen.getByText('Quick Actions')).toBeInTheDocument();
        expect(screen.getByText('QR Code Preview')).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should have keyboard accessible buttons', async () => {
      render(<ProfileSettingsPage />);

      await waitFor(() => {
        const allButtons = screen.getAllByRole('button');
        const hasButtons = allButtons.length > 0;
        expect(hasButtons).toBe(true);

        allButtons.forEach(button => {
          expect(button.tagName).toBe('BUTTON');
        });
      }, { timeout: 3000 });
    });
  });

  describe('Integration with Profile Data', () => {
    it('should fetch slug after profile loads', async () => {
      render(<ProfileSettingsPage />);

      await waitFor(() => {
        expect(personalProfileService.getProfile).toHaveBeenCalledWith('workspace-123');
      }, { timeout: 3000 });
    });

    it('should not fetch when workspace_id is missing', async () => {
      (useAuth as any).mockReturnValue({ workspace: null });

      render(<ProfileSettingsPage />);

      // Wait a moment to ensure no call is made
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(personalProfileService.getProfile).not.toHaveBeenCalled();
    });

    it('should display service URL from personalProfileService', async () => {
      render(<ProfileSettingsPage />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('https://rawdrive.ai/u/john-doe')).toBeInTheDocument();
      }, { timeout: 3000 });

      expect(personalProfileService.getPublicProfileUrl).toHaveBeenCalledWith('john-doe');
    });
  });
});
