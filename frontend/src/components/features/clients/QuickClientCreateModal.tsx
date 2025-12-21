import React, { useState } from 'react';
import { Modal } from '../../ui/Modal';
import { AppInput } from '../../ui/AppInput';
import { AppButton } from '../../ui/AppButton';
import { clientService } from '../../../services/clientService';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../components/ui/Toast';
import type { ClientCreateResponse } from '../../../types/client';

interface QuickClientCreateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (client: ClientCreateResponse) => void;
    initialName?: string;
}

export const QuickClientCreateModal: React.FC<QuickClientCreateModalProps> = ({
    isOpen,
    onClose,
    onSuccess,
    initialName = '',
}) => {
    const { workspace } = useAuth();
    const { addToast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    // Parse initial name into first and last name
    const nameParts = initialName.trim().split(' ');
    const initialFirstName = nameParts[0] || '';
    const initialLastName = nameParts.slice(1).join(' ') || '';

    const [formData, setFormData] = useState({
        firstName: initialFirstName,
        lastName: initialLastName,
        email: '',
    });

    // Update form data when initialName changes and modal opens
    React.useEffect(() => {
        if (isOpen) {
            const parts = initialName.trim().split(' ');
            setFormData({
                firstName: parts[0] || '',
                lastName: parts.slice(1).join(' ') || '',
                email: '',
            });
        }
    }, [isOpen, initialName]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!workspace?.workspace_id) return;

        if (!formData.firstName.trim()) {
            addToast({ variant: 'error', message: 'First name is required' });
            return;
        }

        setIsLoading(true);
        try {
            const newClient = await clientService.createClient(workspace.workspace_id, {
                first_name: formData.firstName,
                last_name: formData.lastName || undefined,
                full_name: `${formData.firstName} ${formData.lastName}`.trim(),
            });

            // If email provided, add it as a contact
            if (formData.email.trim()) {
                try {
                    await clientService.addContact(workspace.workspace_id, newClient.client_id, {
                        contact_type: 'email',
                        value: formData.email,
                        is_primary: true,
                    });
                } catch (contactError) {
                    console.error('Failed to add email contact:', contactError);
                    // Don't fail the whole operation if contact addition fails, just warn
                    addToast({
                        variant: 'warning',
                        message: 'Client created, but failed to add email contact'
                    });
                }
            }

            addToast({ variant: 'success', message: 'Client created successfully' });
            onSuccess(newClient);
            onClose();
        } catch (error) {
            addToast({
                variant: 'error',
                message: error instanceof Error ? error.message : 'Failed to create client',
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create New Client" size="md">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <AppInput
                        label="First Name"
                        value={formData.firstName}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                        placeholder="John"
                        isRequired
                        autoFocus
                    />
                    <AppInput
                        label="Last Name"
                        value={formData.lastName}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                        placeholder="Doe"
                    />
                </div>

                <AppInput
                    label="Email Address"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="john.doe@example.com"
                    helperText="Optional"
                />

                <div className="flex justify-end gap-3 pt-4">
                    <AppButton type="button" variant="ghost" onClick={onClose} disabled={isLoading}>
                        Cancel
                    </AppButton>
                    <AppButton type="submit" variant="primary" isLoading={isLoading}>
                        Create Client
                    </AppButton>
                </div>
            </form>
        </Modal>
    );
};
