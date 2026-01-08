/**
 * ContactForm Component
 *
 * Modal form for adding or editing client contact information.
 * Supports email, phone, website, and social media contacts with validation.
 */

import React, { useState, useEffect } from 'react';
import {
  Mail,
  Phone,
  Globe,
  MessageSquare,
  Star,
} from 'lucide-react';
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
} from '../../ui/Modal';
import { AppButton } from '../../ui/AppButton';
import { AppInput } from '../../ui/AppInput';
import { useToast } from '../../ui/Toast';
import { clientService } from '../../../services/clientService';
import type {
  ClientContact,
  ContactType,
  ContactSubtype,
  AddContactRequest,
  UpdateContactRequest,
} from '../../../types/client';

/* =============================================================================
   Types
   ============================================================================= */

interface ContactFormProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal closes */
  onClose: () => void;
  /** Workspace ID */
  workspaceId: string;
  /** Client ID */
  clientId: string;
  /** Contact to edit (if editing) */
  contact?: ClientContact;
  /** Callback after successful save */
  onSaved?: () => void;
}

interface ContactTypeOption {
  value: ContactType;
  label: string;
  icon: React.ElementType;
  placeholder: string;
  subtypes?: Array<{ value: ContactSubtype; label: string }>;
}

/* =============================================================================
   Contact Type Configuration
   ============================================================================= */

const CONTACT_TYPES: ContactTypeOption[] = [
  {
    value: 'email',
    label: 'Email',
    icon: Mail,
    placeholder: 'john@example.com',
    subtypes: [
      { value: 'work', label: 'Work' },
      { value: 'personal', label: 'Personal' },
      { value: 'other', label: 'Other' },
    ],
  },
  {
    value: 'phone',
    label: 'Phone',
    icon: Phone,
    placeholder: '(555) 123-4567',
    subtypes: [
      { value: 'work', label: 'Work' },
      { value: 'personal', label: 'Personal' },
      { value: 'whatsapp', label: 'WhatsApp' },
      { value: 'other', label: 'Other' },
    ],
  },
  {
    value: 'website',
    label: 'Website',
    icon: Globe,
    placeholder: 'https://example.com',
    subtypes: [
      { value: 'personal', label: 'Personal' },
      { value: 'work', label: 'Work' },
      { value: 'other', label: 'Other' },
    ],
  },
  {
    value: 'social',
    label: 'Social Media',
    icon: MessageSquare,
    placeholder: '@username',
    subtypes: [
      { value: 'instagram', label: 'Instagram' },
      { value: 'facebook', label: 'Facebook' },
      { value: 'twitter', label: 'Twitter' },
      { value: 'linkedin', label: 'LinkedIn' },
      { value: 'other', label: 'Other' },
    ],
  },
];

/* =============================================================================
   ContactForm Component
   ============================================================================= */

export const ContactForm: React.FC<ContactFormProps> = ({
  isOpen,
  onClose,
  workspaceId,
  clientId,
  contact,
  onSaved,
}) => {
  const { addToast } = useToast();
  const isEditing = !!contact;

  // Form state
  const [contactType, setContactType] = useState<ContactType>('email');
  const [contactSubtype, setContactSubtype] = useState<ContactSubtype | ''>('');
  const [value, setValue] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);

  // Initialize form with contact data (if editing)
  useEffect(() => {
    if (isOpen && contact) {
      setContactType(contact.contact_type);
      setContactSubtype((contact.contact_subtype as ContactSubtype) || '');
      setValue(contact.value);
      setIsPrimary(contact.is_primary);
    } else if (isOpen && !contact) {
      // Reset for new contact
      setContactType('email');
      setContactSubtype('');
      setValue('');
      setIsPrimary(false);
    }
  }, [isOpen, contact]);

  // Get current contact type config
  const currentTypeConfig = CONTACT_TYPES.find((t) => t.value === contactType);
  const Icon = currentTypeConfig?.icon || Mail;

  // Validate form
  const validateForm = (): { valid: boolean; error?: string } => {
    if (!value.trim()) {
      return { valid: false, error: 'Please enter a value' };
    }

    if (contactType === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        return { valid: false, error: 'Please enter a valid email address' };
      }
    }

    if (contactType === 'phone') {
      const phoneRegex = /^[\d\s\-\(\)\+]+$/;
      if (!phoneRegex.test(value) || value.replace(/\D/g, '').length < 10) {
        return { valid: false, error: 'Please enter a valid phone number (at least 10 digits)' };
      }
    }

    if (contactType === 'website') {
      try {
        new URL(value.startsWith('http') ? value : `https://${value}`);
      } catch {
        return { valid: false, error: 'Please enter a valid website URL' };
      }
    }

    return { valid: true };
  };

  const validation = validateForm();

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validation.valid) {
      addToast({
        variant: 'error',
        message: validation.error || 'Please check your input',
      });
      return;
    }

    setLoading(true);

    try {
      if (isEditing && contact) {
        // Update existing contact - only value and is_primary can be updated
        const payload: UpdateContactRequest = {
          value: value.trim(),
          is_primary: isPrimary,
        };

        await clientService.updateContact(
          workspaceId,
          clientId,
          contact.contact_id,
          payload
        );

        addToast({
          variant: 'success',
          message: 'Contact updated successfully',
        });
      } else {
        // Add new contact
        const payload: AddContactRequest = {
          contact_type: contactType,
          value: value.trim(),
          is_primary: isPrimary,
        };

        if (contactSubtype) {
          payload.contact_subtype = contactSubtype as string;
        }

        await clientService.addContact(workspaceId, clientId, payload);

        addToast({
          variant: 'success',
          message: 'Contact added successfully',
        });
      }

      // Close modal and trigger callback
      onClose();
      onSaved?.();
    } catch (error) {
      addToast({
        variant: 'error',
        message: error instanceof Error ? error.message : 'Failed to save contact',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <form onSubmit={handleSubmit}>
        <ModalHeader>
          <ModalTitle>{isEditing ? 'Edit Contact' : 'Add Contact'}</ModalTitle>
        </ModalHeader>

        <ModalBody>
          <div className="space-y-4">
            {/* Contact Type */}
            <div>
              <label htmlFor="contact-type" className="block text-sm font-medium text-gray-700 mb-2">
                Type <span className="text-red-500">*</span>
              </label>
              <select
                id="contact-type"
                value={contactType}
                onChange={(e) => {
                  setContactType(e.target.value as ContactType);
                  setContactSubtype(''); // Reset subtype when type changes
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                {CONTACT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Contact Subtype (conditional) */}
            {currentTypeConfig?.subtypes && currentTypeConfig.subtypes.length > 0 && (
              <div>
                <label htmlFor="contact-subtype" className="block text-sm font-medium text-gray-700 mb-2">
                  Category
                </label>
                <select
                  id="contact-subtype"
                  value={contactSubtype}
                  onChange={(e) => setContactSubtype(e.target.value as ContactSubtype)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select category (optional)</option>
                  {currentTypeConfig.subtypes.map((subtype) => (
                    <option key={subtype.value} value={subtype.value}>
                      {subtype.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Value */}
            <div>
              <AppInput
                type={contactType === 'email' ? 'email' : 'text'}
                label={currentTypeConfig?.label || 'Value'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={currentTypeConfig?.placeholder}
                leftIcon={<Icon className="h-4 w-4" />}
                required
                error={!validation.valid && value ? validation.error : undefined}
              />

              {/* Helper text */}
              <p className="text-xs text-gray-500 mt-1">
                {contactType === 'email' && 'Enter a valid email address'}
                {contactType === 'phone' && 'Enter phone number with area code'}
                {contactType === 'website' && 'Include https:// or http://'}
                {contactType === 'social' && 'Enter username or handle (@ optional)'}
              </p>
            </div>

            {/* Primary Toggle */}
            <div className="border-t border-gray-200 pt-4">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPrimary}
                  onChange={(e) => setIsPrimary(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <div className="flex items-center space-x-2">
                  <Star className="h-4 w-4 text-yellow-500" />
                  <span className="text-sm font-medium text-gray-700">Set as primary contact</span>
                </div>
              </label>
              <p className="text-xs text-gray-500 mt-1 ml-7">
                This will be the main {contactType} for contacting the client
              </p>
            </div>
          </div>
        </ModalBody>

        <ModalFooter>
          <AppButton variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </AppButton>
          <AppButton
            type="submit"
            variant="primary"
            isLoading={loading}
            disabled={!validation.valid}
            leftIcon={<Icon className="h-4 w-4" />}
          >
            {isEditing ? 'Update Contact' : 'Add Contact'}
          </AppButton>
        </ModalFooter>
      </form>
    </Modal>
  );
};
