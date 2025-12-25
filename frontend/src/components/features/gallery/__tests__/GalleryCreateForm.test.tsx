/**
 * GalleryCreateForm Tests
 * Tests for gallery creation form validation
 * Property 4: Gallery Title Validation
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GalleryCreateForm } from '../GalleryCreateForm';
import { AuthProvider } from '../../../../contexts/AuthContext';
import { ToastProvider } from '../../../ui/Toast';

// Mock the clients service used by ClientCombobox
vi.mock('../../../../services/clientService', () => ({
  clientService: {
    searchClients: vi.fn().mockResolvedValue({ clients: [], total: 0 }),
  },
}));

// Helper to render with required providers
const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <ToastProvider>
      <AuthProvider>{ui}</AuthProvider>
    </ToastProvider>
  );
};

describe('GalleryCreateForm', () => {
  const mockOnSubmit = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders form fields correctly', () => {
    renderWithProviders(<GalleryCreateForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    expect(screen.getByLabelText(/gallery title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    // ClientCombobox uses a non-standard label, check for text instead
    expect(screen.getByText(/client name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create gallery/i })).toBeInTheDocument();
  });

  it('rejects empty title (Property 4)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<GalleryCreateForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    const titleInput = screen.getByLabelText(/gallery title/i);
    const submitButton = screen.getByRole('button', { name: /create gallery/i });

    // Button should be disabled when title is empty
    expect(submitButton).toBeDisabled();

    // Type something to enable button, then clear it
    await user.type(titleInput, 'Test');
    await user.clear(titleInput);
    
    // Button should still be disabled after clearing
    expect(submitButton).toBeDisabled();
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only title (Property 4)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<GalleryCreateForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    const titleInput = screen.getByLabelText(/gallery title/i);
    const submitButton = screen.getByRole('button', { name: /create gallery/i });

    // Enter only whitespace - button should remain disabled
    await user.type(titleInput, '   \t\n   ');
    
    // Button should be disabled because trimmed value is empty
    expect(submitButton).toBeDisabled();
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('rejects title longer than 255 characters', async () => {
    const user = userEvent.setup();
    renderWithProviders(<GalleryCreateForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    const titleInput = screen.getByLabelText(/gallery title/i) as HTMLInputElement;
    const submitButton = screen.getByRole('button', { name: /create gallery/i });

    // Enter title longer than 255 chars
    const longTitle = 'a'.repeat(256);
    await user.clear(titleInput);
    await user.type(titleInput, longTitle);
    
    // Button should be enabled
    expect(submitButton).not.toBeDisabled();
    
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/must be 255 characters or less/i)).toBeInTheDocument();
    }, { timeout: 3000 });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('accepts valid title and submits form', async () => {
    const user = userEvent.setup();
    mockOnSubmit.mockResolvedValue(undefined);

    renderWithProviders(<GalleryCreateForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    const titleInput = screen.getByLabelText(/gallery title/i);
    const submitButton = screen.getByRole('button', { name: /create gallery/i });

    await user.type(titleInput, 'Johnson Wedding');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Johnson Wedding',
      }));
    });
  });

  it('trims whitespace from title before submission', async () => {
    const user = userEvent.setup();
    mockOnSubmit.mockResolvedValue(undefined);

    renderWithProviders(<GalleryCreateForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    const titleInput = screen.getByLabelText(/gallery title/i);
    const submitButton = screen.getByRole('button', { name: /create gallery/i });

    await user.type(titleInput, '  Johnson Wedding  ');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Johnson Wedding',
      }));
    });
  });

  it('includes optional fields when provided', async () => {
    const user = userEvent.setup();
    mockOnSubmit.mockResolvedValue(undefined);

    renderWithProviders(<GalleryCreateForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    const titleInput = screen.getByLabelText(/gallery title/i);
    const descriptionInput = screen.getByLabelText(/description/i);
    const submitButton = screen.getByRole('button', { name: /create gallery/i });

    await user.type(titleInput, 'Wedding Photos');
    await user.type(descriptionInput, 'Beautiful wedding ceremony');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Wedding Photos',
        description: 'Beautiful wedding ceremony',
      }));
    });
  });

  it('disables submit button when title is empty', () => {
    renderWithProviders(<GalleryCreateForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    const submitButton = screen.getByRole('button', { name: /create gallery/i });
    expect(submitButton).toBeDisabled();
  });

  it('calls onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<GalleryCreateForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it('displays error message on submit failure', async () => {
    const user = userEvent.setup();
    const errorMessage = 'Failed to create gallery';
    mockOnSubmit.mockRejectedValue(new Error(errorMessage));

    renderWithProviders(<GalleryCreateForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    const titleInput = screen.getByLabelText(/gallery title/i);
    const submitButton = screen.getByRole('button', { name: /create gallery/i });

    await user.type(titleInput, 'Test Gallery');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  it('validates description max length', async () => {
    const user = userEvent.setup();
    renderWithProviders(<GalleryCreateForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    const descriptionInput = screen.getByLabelText(/description/i);
    const submitButton = screen.getByRole('button', { name: /create gallery/i });

    // Enter description longer than 1000 chars
    const longDescription = 'a'.repeat(1001);
    await user.type(descriptionInput, longDescription);
    
    // Also need a valid title
    const titleInput = screen.getByLabelText(/gallery title/i);
    await user.type(titleInput, 'Test Gallery');
    
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/description must be 1000 characters or less/i)).toBeInTheDocument();
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });
});
