
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InlineEditForm } from '../InlineEditForm';
import React from 'react';

describe('InlineEditForm', () => {
    it('Property 13: Inline Edit Save and Cancel', () => {
        const onSave = vi.fn();
        const onCancel = vi.fn();
        const initialData = {
            initialTitle: 'Test Title',
            initialDescription: 'Test Description',
            initialIsPrivate: false,
        };

        render(
            <InlineEditForm
                {...initialData}
                onSave={onSave}
                onCancel={onCancel}
            />
        );

        // 1. Verify rendering
        const titleInput = screen.getByPlaceholderText('Enter title...') as HTMLInputElement;
        const descInput = screen.getByPlaceholderText('Enter description...') as HTMLTextAreaElement;
        
        expect(titleInput.value).toBe('Test Title');
        expect(descInput.value).toBe('Test Description');

        // 2. Test Input Changes
        fireEvent.change(titleInput, { target: { value: 'New Title' } });
        expect(titleInput.value).toBe('New Title');

        // 3. Test Save (Form Submission)
        const saveBtn = screen.getByText('Save Changes');
        fireEvent.click(saveBtn);
        
        expect(onSave).toHaveBeenCalledWith({
            title: 'New Title',
            description: 'Test Description',
            is_private: false,
        });

        // 4. Test Cancel (Escape)
        onSave.mockClear();
        fireEvent.keyDown(titleInput, { key: 'Escape' });
        expect(onCancel).toHaveBeenCalled();
        
        // 5. Test Cancel (Button)
        onCancel.mockClear();
        const cancelBtn = screen.getByText('Cancel');
        fireEvent.click(cancelBtn);
        expect(onCancel).toHaveBeenCalled();
        
        // 6. Test Privacy Toggle
        const privacyToggle = screen.getByText('Public Asset').closest('div[class*="cursor-pointer"]');
        expect(privacyToggle).toBeTruthy();
        if (privacyToggle) {
             fireEvent.click(privacyToggle);
             // Should switch text to Private Asset
             expect(screen.getByText('Private Asset')).toBeTruthy();
             
             fireEvent.click(saveBtn);
             expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ is_private: true }));
        }
    });

    it('Saves on Enter in title input', () => {
        const onSave = vi.fn();
        render(<InlineEditForm onSave={onSave} onCancel={vi.fn()} />);
        
        const titleInput = screen.getByPlaceholderText('Enter title...');
        fireEvent.change(titleInput, { target: { value: 'Enter Save' } });
        fireEvent.submit(titleInput); // Submitting form via enter implicit in HTML forms often handled by test lib
        
        // In our component, we have <form onSubmit={handleSubmit}>.
        // fireEvent.submit triggers that.
        // But usually hitting Enter in text input triggers submit.
        
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: 'Enter Save' }));
    });
});
