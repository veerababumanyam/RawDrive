import React, { useState } from 'react';
// import { useTranslation } from 'react-i18next';
import { Mail, Phone, User } from 'lucide-react';
import { Modal, ModalHeader, ModalTitle, ModalBody, ModalFooter } from '../../ui/Modal';
import { AppInput } from '../../ui/AppInput';
import { AppButton } from '../../ui/AppButton';

interface ClientEmailModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: {
        email: string;
        first_name: string;
        last_name: string;
        phone: string;
    }) => Promise<void>;
    isLoading?: boolean;
}

export const ClientEmailModal: React.FC<ClientEmailModalProps> = ({
    isOpen,
    onClose,
    onSubmit,
    isLoading = false,
}) => {
    const [formData, setFormData] = useState({
        email: '',
        first_name: '',
        last_name: '',
        phone: '',
    });
    const [errors, setErrors] = useState<Record<string, string>>({});

    const validate = () => {
        const newErrors: Record<string, string> = {};
        if (!formData.email) {
            newErrors.email = 'Email is required';
        } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
            newErrors.email = 'Invalid email address';
        }

        // Name is optional in backend but prompt said "try capturing Name..."
        // Let's make First Name required for better lead quality if they are forced to register.
        if (!formData.first_name) {
            newErrors.first_name = 'First name is required';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;

        try {
            await onSubmit(formData);
        } catch (error) {
            console.error('Registration failed', error);
            // setErrors can be used for API errors if passed down
        }
    };

    const handleChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[field];
                return newErrors;
            });
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="sm"
            closeOnBackdropClick={false}
            closeOnEscape={false}
            showCloseButton={false}
        >
            <form onSubmit={handleSubmit}>
                <ModalHeader>
                    <ModalTitle>Welcome to the Gallery</ModalTitle>
                </ModalHeader>

                <ModalBody className="space-y-4">
                    <p className="text-sm text-text-secondary mb-4">
                        Please enter your details to view this gallery.
                    </p>

                    <AppInput
                        label="Email Address"
                        value={formData.email}
                        onChange={(e) => handleChange('email', e.target.value)}
                        error={errors.email}
                        leftIcon={<Mail size={16} />}
                        placeholder="you@example.com"
                        required
                        autoFocus
                    />

                    <div className="grid grid-cols-2 gap-4">
                        <AppInput
                            label="First Name"
                            value={formData.first_name}
                            onChange={(e) => handleChange('first_name', e.target.value)}
                            error={errors.first_name}
                            leftIcon={<User size={16} />}
                            placeholder="John"
                            required
                        />
                        <AppInput
                            label="Last Name"
                            value={formData.last_name}
                            onChange={(e) => handleChange('last_name', e.target.value)}
                            error={errors.last_name}
                            placeholder="Doe"
                        />
                    </div>

                    <AppInput
                        label="Phone Number (Optional)"
                        value={formData.phone}
                        onChange={(e) => handleChange('phone', e.target.value)}
                        error={errors.phone}
                        leftIcon={<Phone size={16} />}
                        placeholder="+1 234 567 8900"
                    />
                </ModalBody>

                <ModalFooter>
                    <AppButton
                        type="submit"
                        variant="accent"
                        isLoading={isLoading}
                        fullWidth
                    >
                        Enter Gallery
                    </AppButton>
                </ModalFooter>
            </form>
        </Modal>
    );
};
