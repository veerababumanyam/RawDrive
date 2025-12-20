
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PersonSelector } from '../PersonSelector';
import { peopleService } from '../../../../services/metadataService';

// Mock peopleService
vi.mock('../../../../services/metadataService', () => ({
    peopleService: {
        listPeople: vi.fn(),
    },
}));

// Mock AuthContext
vi.mock('../../../../contexts/AuthContext', () => ({
    useAuth: () => ({
        workspace: { workspace_id: 'ws-123' },
    }),
}));

describe('PersonSelector', () => {
    const mockOnSelect = vi.fn();
    const mockOnCreate = vi.fn();
    const mockOnCancel = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders input field with placeholder', () => {
        render(<PersonSelector onSelect={mockOnSelect} />);
        expect(screen.getByPlaceholderText('Search people...')).toBeInTheDocument();
    });

    it('fetches and displays suggestions when typing', async () => {
        const mockPeople = [
            { person_id: 'p1', display_name: 'John Doe', face_count: 5 },
            { person_id: 'p2', display_name: 'Jane Smith', face_count: 2 },
        ];
        (peopleService.listPeople as any).mockResolvedValue({ data: mockPeople, meta: {} });

        render(<PersonSelector onSelect={mockOnSelect} />);
        const input = screen.getByPlaceholderText('Search people...');

        fireEvent.change(input, { target: { value: 'John' } });

        await waitFor(() => {
            expect(peopleService.listPeople).toHaveBeenCalledWith('ws-123', expect.objectContaining({ search: 'John' }));
        });

        await waitFor(() => {
            expect(screen.getByText('John Doe')).toBeInTheDocument();
        });
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });

    it('calls onSelect when a suggestion is clicked', async () => {
        const mockPeople = [{ person_id: 'p1', display_name: 'John Doe', face_count: 5 }];
        (peopleService.listPeople as any).mockResolvedValue({ data: mockPeople, meta: {} });

        render(<PersonSelector onSelect={mockOnSelect} />);
        const input = screen.getByPlaceholderText('Search people...');
        fireEvent.change(input, { target: { value: 'John' } });

        await waitFor(() => {
            expect(screen.getByText('John Doe')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('John Doe'));
        expect(mockOnSelect).toHaveBeenCalledWith(mockPeople[0]);
    });

    it('shows create option if no exact match and onCreate provided', async () => {
        (peopleService.listPeople as any).mockResolvedValue({ data: [], meta: {} });

        render(<PersonSelector onSelect={mockOnSelect} onCreate={mockOnCreate} />);
        const input = screen.getByPlaceholderText('Search people...');

        fireEvent.change(input, { target: { value: 'New Person' } });

        await waitFor(() => {
            expect(screen.getByText('Create "New Person"')).toBeInTheDocument();
        });

        const newPerson = { person_id: 'new1', display_name: 'New Person' };
        mockOnCreate.mockResolvedValue(newPerson);

        fireEvent.click(screen.getByText('Create "New Person"'));

        await waitFor(() => {
            expect(mockOnCreate).toHaveBeenCalledWith('New Person');
            expect(mockOnSelect).toHaveBeenCalledWith(newPerson);
        });
    });

    it('calls onCancel when clicking outside or pressing Escape', async () => {
        render(<PersonSelector onSelect={mockOnSelect} onCancel={mockOnCancel} />);
        const input = screen.getByPlaceholderText('Search people...');

        fireEvent.keyDown(input, { key: 'Escape' });
        expect(mockOnCancel).toHaveBeenCalled();
    });
});
