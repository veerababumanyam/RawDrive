/**
 * SharePanel / EmbedCodeModal / GalleryThemeToggle Tests
 *
 * Tests sharing panel embed code generation, theme toggle persistence,
 * and integration of new sharing features.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { EmbedCodeModal } from './EmbedCodeModal';
import { GalleryThemeToggle } from '../../../../pages/public/components/GalleryThemeToggle';

// Mock clipboard API
const mockWriteText = vi.fn().mockResolvedValue(undefined);
Object.assign(navigator, {
  clipboard: { writeText: mockWriteText },
});

describe('EmbedCodeModal', () => {
  const defaultProps = {
    galleryUrl: 'https://rawdrive.io/gallery/abc123',
    isOpen: true,
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders when open', () => {
    render(<EmbedCodeModal {...defaultProps} />);
    expect(screen.getByText('Embed Gallery')).toBeTruthy();
  });

  it('does not render when closed', () => {
    render(<EmbedCodeModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText(/embed/i)).toBeNull();
  });

  it('generates iframe code with default dimensions', () => {
    render(<EmbedCodeModal {...defaultProps} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toContain('<iframe');
    expect(textarea.value).toContain('src="https://rawdrive.io/gallery/abc123/embed"');
    expect(textarea.value).toContain('width="800"');
    expect(textarea.value).toContain('height="600"');
  });

  it('updates iframe code when dimensions change', () => {
    render(<EmbedCodeModal {...defaultProps} />);
    const widthInput = screen.getByLabelText(/width/i) as HTMLInputElement;

    fireEvent.change(widthInput, { target: { value: '1024' } });

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toContain('width="1024"');
  });

  it('copies embed code to clipboard', async () => {
    render(<EmbedCodeModal {...defaultProps} />);
    const copyButton = screen.getByRole('button', { name: /copy/i });

    await act(async () => {
      fireEvent.click(copyButton);
    });

    expect(mockWriteText).toHaveBeenCalledWith(expect.stringContaining('<iframe'));
  });

  it('calls onClose when close button is clicked', () => {
    render(<EmbedCodeModal {...defaultProps} />);
    const closeButton = screen.getByLabelText(/close/i);
    fireEvent.click(closeButton);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});

describe('GalleryThemeToggle', () => {
  let getItemSpy: ReturnType<typeof vi.spyOn>;
  let setItemSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
    setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
    // Reset data-theme
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
  });

  it('renders toggle button', () => {
    render(<GalleryThemeToggle />);
    expect(screen.getByRole('button', { name: /theme/i })).toBeTruthy();
  });

  it('reads initial theme from localStorage', () => {
    getItemSpy.mockReturnValue('dark');
    render(<GalleryThemeToggle />);
    expect(getItemSpy).toHaveBeenCalledWith('gallery-theme');
  });

  it('toggles theme on click and persists', () => {
    getItemSpy.mockReturnValue('light');
    render(<GalleryThemeToggle />);

    const button = screen.getByRole('button', { name: /theme/i });
    fireEvent.click(button);

    expect(setItemSpy).toHaveBeenCalledWith('gallery-theme', 'dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('toggles from dark to light', () => {
    getItemSpy.mockReturnValue('dark');
    render(<GalleryThemeToggle />);

    const button = screen.getByRole('button', { name: /theme/i });
    fireEvent.click(button);

    expect(setItemSpy).toHaveBeenCalledWith('gallery-theme', 'light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
