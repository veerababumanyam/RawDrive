import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UploadProgressPanel } from '../UploadProgressPanel';
import type { UploadFileProgress, UploadProgressPanelProps } from '../UploadProgressPanel';

// Mock UI dependencies
vi.mock('../../../ui/AppButton', () => ({
  AppButton: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} data-testid={props['data-testid']}>
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

vi.mock('../../../ui/Progress', () => ({
  Progress: ({ value, size, variant }: any) => (
    <div data-testid="progress-bar" data-value={value} data-size={size} data-variant={variant} role="progressbar" aria-valuenow={value} />
  ),
}));

function createMockFile(name: string, size: number, type: string): File {
  const content = new Array(size).fill('x').join('');
  return new File([content], name, { type });
}

function createFileProgress(overrides: Partial<UploadFileProgress> = {}): UploadFileProgress {
  return {
    id: 'file-1',
    file: createMockFile('photo.jpg', 1024, 'image/jpeg'),
    stage: 'uploading',
    progress: 50,
    uploadedBytes: 512,
    totalBytes: 1024,
    ...overrides,
  };
}

describe('UploadProgressPanel', () => {
  const defaultStats = {
    totalFiles: 5,
    completedFiles: 2,
    failedFiles: 0,
    totalBytes: 5000,
    uploadedBytes: 2000,
    averageSpeed: 1000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no files are provided', () => {
    const { container } = render(
      <UploadProgressPanel files={[]} stats={defaultStats} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('displays uploading count from stats', () => {
    const files = [createFileProgress()];

    render(<UploadProgressPanel files={files} stats={defaultStats} />);

    expect(screen.getByText(/Uploading 2 of 5/)).toBeInTheDocument();
  });

  it('shows overall progress percentage', () => {
    const files = [createFileProgress()];

    render(<UploadProgressPanel files={files} stats={defaultStats} />);

    // 2 of 5 = 40%
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('Overall Progress')).toBeInTheDocument();
  });

  it('displays Upload Complete when all files are done', () => {
    const files = [createFileProgress({ stage: 'complete', progress: 100 })];
    const completeStats = { ...defaultStats, completedFiles: 5, totalFiles: 5 };

    render(<UploadProgressPanel files={files} stats={completeStats} />);

    expect(screen.getByText('Upload Complete')).toBeInTheDocument();
  });

  it('shows file name and size in the file list', () => {
    const files = [
      createFileProgress({
        id: 'f1',
        file: createMockFile('wedding-photo.jpg', 2048, 'image/jpeg'),
        totalBytes: 2048,
        uploadedBytes: 1024,
      }),
    ];

    render(<UploadProgressPanel files={files} stats={defaultStats} />);

    expect(screen.getByText('wedding-photo.jpg')).toBeInTheDocument();
  });

  it('shows error message for failed uploads', () => {
    const files = [
      createFileProgress({
        stage: 'error',
        error: 'Network timeout',
        progress: 30,
      }),
    ];

    render(<UploadProgressPanel files={files} stats={defaultStats} />);

    expect(screen.getByText('Network timeout')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('renders Pause button when uploads are active', () => {
    const files = [createFileProgress()];
    const onPauseResume = vi.fn();

    render(
      <UploadProgressPanel
        files={files}
        stats={defaultStats}
        onPauseResume={onPauseResume}
      />
    );

    expect(screen.getByText('Pause')).toBeInTheDocument();
  });

  it('renders Resume button when paused', () => {
    const files = [createFileProgress()];
    const onPauseResume = vi.fn();

    render(
      <UploadProgressPanel
        files={files}
        stats={defaultStats}
        onPauseResume={onPauseResume}
        isPaused={true}
      />
    );

    expect(screen.getByText('Resume')).toBeInTheDocument();
  });
});
