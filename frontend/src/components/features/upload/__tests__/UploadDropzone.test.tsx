import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UploadDropzone } from '../UploadDropzone';

// Mock all external dependencies
vi.mock('heic2any', () => ({
  default: vi.fn(),
}));

vi.mock('@rawdrive/shared-constants', () => ({
  SUPPORTED_IMAGE_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  SUPPORTED_VIDEO_MIME_TYPES: ['video/mp4', 'video/quicktime'],
  SUPPORTED_RAW_EXTENSIONS: ['cr2', 'nef', 'arw'],
}));

vi.mock('@/utils/fileUtils', () => ({
  isRawFileObject: vi.fn(() => false),
}));

vi.mock('../SmartUploadSuggestions', () => ({
  SmartUploadSuggestions: () => <div data-testid="smart-suggestions" />,
}));

vi.mock('../../../ui/AppButton', () => ({
  AppButton: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('../../../ui/AppCard', () => ({
  AppCard: ({ children, className, ...props }: any) => (
    <div className={className} {...props}>
      {children}
    </div>
  ),
}));

describe('UploadDropzone', () => {
  const defaultProps = {
    galleryId: 'gal-123',
    onFilesSelected: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders drag and drop instructions', () => {
    render(<UploadDropzone {...defaultProps} />);

    expect(screen.getByText('Drag & drop or tap to select')).toBeInTheDocument();
    expect(screen.getByText('or')).toBeInTheDocument();
  });

  it('renders Select Files and Select Folder buttons', () => {
    render(<UploadDropzone {...defaultProps} />);

    expect(screen.getByText('Select Files')).toBeInTheDocument();
    expect(screen.getByText('Select Folder')).toBeInTheDocument();
  });

  it('renders hidden file inputs for file and folder selection', () => {
    render(<UploadDropzone {...defaultProps} />);

    expect(screen.getByLabelText('File upload input')).toBeInTheDocument();
    expect(screen.getByLabelText('Folder upload input')).toBeInTheDocument();
  });

  it('displays supported file type information', () => {
    render(<UploadDropzone {...defaultProps} />);

    expect(
      screen.getByText(/Supports:.*JPEG.*PNG.*WebP.*HEIC.*RAW/i)
    ).toBeInTheDocument();
  });

  it('shows max files limit in description', () => {
    render(<UploadDropzone {...defaultProps} maxFiles={500} />);

    expect(screen.getByText(/Max files: 500/)).toBeInTheDocument();
  });
});
