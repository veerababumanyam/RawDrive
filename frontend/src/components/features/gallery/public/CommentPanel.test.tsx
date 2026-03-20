import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { CommentPanel } from './CommentPanel';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(({ children, ...props }: any, ref: any) => (
      <div ref={ref} {...props}>{children}</div>
    )),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const mockAddComment = vi.fn().mockResolvedValue(undefined);
const mockLoadComments = vi.fn().mockResolvedValue(undefined);
const mockContextValue = {
  favorites: new Set<string>(),
  selections: new Set<string>(),
  toggleFavorite: vi.fn(),
  toggleSelection: vi.fn(),
  selectionLimit: null,
  isAtSelectionLimit: false,
  visitorToken: 'test-token',
  isProofingEnabled: true,
  favoriteCount: 0,
  selectionCount: 0,
  comments: new Map<string, any[]>(),
  addComment: mockAddComment,
  loadComments: mockLoadComments,
};

vi.mock('../../../../contexts/GalleryInteractionContext', () => ({
  useGalleryInteraction: () => mockContextValue,
}));

describe('CommentPanel', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockContextValue.comments = new Map();
  });

  it('renders when isOpen is true', () => {
    render(<CommentPanel assetId="asset-1" isOpen={true} onClose={onClose} />);
    expect(screen.getByText('Comments')).toBeTruthy();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <CommentPanel assetId="asset-1" isOpen={false} onClose={onClose} />,
    );
    expect(container.querySelector('[data-testid="comment-panel"]')).toBeNull();
  });

  it('calls loadComments on open', () => {
    render(<CommentPanel assetId="asset-1" isOpen={true} onClose={onClose} />);
    expect(mockLoadComments).toHaveBeenCalledWith('asset-1');
  });

  it('shows empty state when no comments exist', () => {
    render(<CommentPanel assetId="asset-1" isOpen={true} onClose={onClose} />);
    expect(screen.getByText('No comments yet')).toBeTruthy();
  });

  it('displays existing comments', () => {
    mockContextValue.comments = new Map([
      [
        'asset-1',
        [
          {
            id: 'c1',
            visitor_name: 'John',
            text: 'Great photo!',
            created_at: '2026-03-20T10:00:00Z',
          },
        ],
      ],
    ]);
    render(<CommentPanel assetId="asset-1" isOpen={true} onClose={onClose} />);
    expect(screen.getByText('Great photo!')).toBeTruthy();
    expect(screen.getByText('John')).toBeTruthy();
  });

  it('calls onClose when close button clicked', () => {
    render(<CommentPanel assetId="asset-1" isOpen={true} onClose={onClose} />);
    const closeBtn = screen.getByLabelText('Close comments');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('submits comment on send button click', async () => {
    render(<CommentPanel assetId="asset-1" isOpen={true} onClose={onClose} />);
    const textarea = screen.getByPlaceholderText('Add a comment...');
    fireEvent.change(textarea, { target: { value: 'Nice shot!' } });
    const sendBtn = screen.getByLabelText('Send comment');
    fireEvent.click(sendBtn);
    await waitFor(() => {
      expect(mockAddComment).toHaveBeenCalledWith('asset-1', 'Nice shot!');
    });
  });

  it('disables send button when textarea is empty', () => {
    render(<CommentPanel assetId="asset-1" isOpen={true} onClose={onClose} />);
    const sendBtn = screen.getByLabelText('Send comment');
    expect(sendBtn).toBeDisabled();
  });

  it('clears textarea after submitting', async () => {
    render(<CommentPanel assetId="asset-1" isOpen={true} onClose={onClose} />);
    const textarea = screen.getByPlaceholderText('Add a comment...') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Nice shot!' } });
    const sendBtn = screen.getByLabelText('Send comment');
    fireEvent.click(sendBtn);
    await waitFor(() => {
      expect(textarea.value).toBe('');
    });
  });
});
