/**
 * Tests for GalleryMusicPlayer component.
 *
 * Verifies audio player renders play/pause, does not autoplay,
 * and hides when no music URL is provided.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GalleryMusicPlayer } from './GalleryMusicPlayer';

// Mock HTMLMediaElement methods
beforeEach(() => {
  vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(window.HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});

describe('GalleryMusicPlayer', () => {
  it('renders nothing when no musicUrl provided', () => {
    const { container } = render(<GalleryMusicPlayer />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when musicUrl is empty string', () => {
    const { container } = render(<GalleryMusicPlayer musicUrl="" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders play button when musicUrl provided', () => {
    render(<GalleryMusicPlayer musicUrl="https://example.com/music.mp3" />);
    const playButton = screen.getByRole('button', { name: /play/i });
    expect(playButton).toBeInTheDocument();
  });

  it('does not autoplay audio', () => {
    render(<GalleryMusicPlayer musicUrl="https://example.com/music.mp3" />);
    // Audio element should exist but not be playing
    expect(window.HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it('calls play when play button clicked', async () => {
    render(<GalleryMusicPlayer musicUrl="https://example.com/music.mp3" />);
    const playButton = screen.getByRole('button', { name: /play/i });
    await userEvent.click(playButton);
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it('renders track name from prop', () => {
    render(
      <GalleryMusicPlayer
        musicUrl="https://example.com/music.mp3"
        trackName="Wedding Waltz"
      />
    );
    expect(screen.getByText('Wedding Waltz')).toBeInTheDocument();
  });

  it('derives track name from URL when not provided', () => {
    render(
      <GalleryMusicPlayer musicUrl="https://example.com/wedding-waltz.mp3" />
    );
    expect(screen.getByText('wedding-waltz')).toBeInTheDocument();
  });

  it('renders volume control', () => {
    render(<GalleryMusicPlayer musicUrl="https://example.com/music.mp3" />);
    const volumeSlider = screen.getByRole('slider', { name: /volume/i });
    expect(volumeSlider).toBeInTheDocument();
  });
});
