/**
 * ContactsSection Component
 *
 * Displays and manages client contact information (email, phone, website, social).
 * Supports multiple contacts per client with primary contact designation.
 */

import React, { useState } from 'react';
import {
  Mail,
  Phone,
  Globe,
  Instagram,
  Facebook,
  Twitter,
  Linkedin,
  MessageSquare,
  Copy,
  CheckCircle,
  Plus,
  Edit,
  Trash2,
  Star,
} from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { AppBadge } from '../../ui/AppBadge';
import { useToast } from '../../ui/Toast';
import { ConfirmDialog } from '../../ui/Modal';
import { clientService } from '../../../services/clientService';
import type { ClientContact, ContactType, ContactSubtype } from '../../../types/client';

/* =============================================================================
   Types
   ============================================================================= */

interface ContactsSectionProps {
  /** Workspace ID */
  workspaceId: string;
  /** Client ID */
  clientId: string;
  /** Array of client contacts */
  contacts: ClientContact[];
  /** Callback when contacts are modified */
  onContactsChanged?: () => void;
  /** Callback to open contact form */
  onAddContact?: () => void;
  /** Callback to edit contact */
  onEditContact?: (contact: ClientContact) => void;
  /** Whether the section is read-only */
  readOnly?: boolean;
}

/* =============================================================================
   Contact Icon & Label Mapping
   ============================================================================= */

const getContactIcon = (type: ContactType, subtype?: string): React.ElementType => {
  if (type === 'social') {
    const socialIconMap: Record<string, React.ElementType> = {
      instagram: Instagram,
      facebook: Facebook,
      twitter: Twitter,
      linkedin: Linkedin,
      whatsapp: MessageSquare,
    };
    return socialIconMap[subtype || ''] || MessageSquare;
  }

  const iconMap: Record<ContactType, React.ElementType> = {
    email: Mail,
    phone: Phone,
    website: Globe,
    social: MessageSquare,
  };

  return iconMap[type];
};

const getContactTypeLabel = (type: ContactType, subtype?: string): string => {
  if (type === 'social' && subtype) {
    return subtype.charAt(0).toUpperCase() + subtype.slice(1);
  }

  const labelMap: Record<ContactType, string> = {
    email: 'Email',
    phone: 'Phone',
    website: 'Website',
    social: 'Social',
  };

  return labelMap[type];
};

const getContactColor = (type: ContactType, subtype?: string): string => {
  if (type === 'social') {
    const colorMap: Record<string, string> = {
      instagram: 'text-pink-600 bg-pink-100',
      facebook: 'text-blue-600 bg-blue-100',
      twitter: 'text-sky-600 bg-sky-100',
      linkedin: 'text-indigo-600 bg-indigo-100',
      whatsapp: 'text-green-600 bg-green-100',
    };
    return colorMap[subtype || ''] || 'text-gray-600 bg-gray-100';
  }

  const colorMap: Record<ContactType, string> = {
    email: 'text-purple-600 bg-purple-100',
    phone: 'text-green-600 bg-green-100',
    website: 'text-blue-600 bg-blue-100',
    social: 'text-gray-600 bg-gray-100',
  };

  return colorMap[type];
};

/* =============================================================================
   ContactsSection Component
   ============================================================================= */

export const ContactsSection: React.FC<ContactsSectionProps> = ({
  workspaceId,
  clientId,
  contacts,
  onContactsChanged,
  onAddContact,
  onEditContact,
  readOnly = false,
}) => {
  const { addToast } = useToast();

  // State
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Copy to clipboard
  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(value);
      addToast({
        variant: 'success',
        message: 'Copied to clipboard',
      });

      // Reset after 2 seconds
      setTimeout(() => {
        setCopiedValue(null);
      }, 2000);
    } catch (error) {
      addToast({
        variant: 'error',
        message: 'Failed to copy to clipboard',
      });
    }
  };

  // Delete contact
  const handleDelete = async (contactId: string) => {
    setDeleting(true);

    try {
      await clientService.deleteContact(workspaceId, clientId, contactId);

      addToast({
        variant: 'success',
        message: 'Contact deleted successfully',
      });

      setDeleteConfirm(null);
      onContactsChanged?.();
    } catch (error) {
      addToast({
        variant: 'error',
        message: error instanceof Error ? error.message : 'Failed to delete contact',
      });
    } finally {
      setDeleting(false);
    }
  };

  // Format contact value for display
  const formatContactValue = (type: ContactType, value: string): string => {
    if (type === 'phone') {
      // Simple phone formatting (can be enhanced)
      const cleaned = value.replace(/\D/g, '');
      if (cleaned.length === 10) {
        return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
      }
      return value;
    }

    if (type === 'social') {
      // Remove @ if present
      return value.startsWith('@') ? value.slice(1) : value;
    }

    return value;
  };

  // Get contact link (for clickable contacts)
  const getContactLink = (contact: ClientContact): string | null => {
    if (contact.contact_type === 'email') {
      return `mailto:${contact.value}`;
    }

    if (contact.contact_type === 'phone') {
      return `tel:${contact.value}`;
    }

    if (contact.contact_type === 'website') {
      return contact.value.startsWith('http') ? contact.value : `https://${contact.value}`;
    }

    if (contact.contact_type === 'social') {
      const socialLinks: Record<string, string> = {
        instagram: `https://instagram.com/${contact.value.replace('@', '')}`,
        facebook: `https://facebook.com/${contact.value.replace('@', '')}`,
        twitter: `https://twitter.com/${contact.value.replace('@', '')}`,
        linkedin: `https://linkedin.com/in/${contact.value.replace('@', '')}`,
      };

      return socialLinks[contact.contact_subtype || ''] || null;
    }

    return null;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Contact Information</h3>
        {!readOnly && onAddContact && (
          <AppButton onClick={onAddContact} size="sm" leftIcon={<Plus className="h-4 w-4" />}>
            Add Contact
          </AppButton>
        )}
      </div>

      {/* Contacts List */}
      {contacts.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <Mail className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-4">No contact information yet</p>
          {!readOnly && onAddContact && (
            <AppButton onClick={onAddContact} size="sm">
              Add First Contact
            </AppButton>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map((contact) => {
            const Icon = getContactIcon(contact.contact_type, contact.contact_subtype);
            const colorClasses = getContactColor(contact.contact_type, contact.contact_subtype);
            const typeLabel = getContactTypeLabel(contact.contact_type, contact.contact_subtype);
            const formattedValue = formatContactValue(contact.contact_type, contact.value);
            const link = getContactLink(contact);
            const isCopied = copiedValue === contact.value;

            return (
              <div
                key={contact.contact_id}
                className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
              >
                {/* Left: Icon, Type, Value */}
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  {/* Icon */}
                  <div className={`flex-shrink-0 w-10 h-10 rounded-full ${colorClasses} flex items-center justify-center`}>
                    <Icon className="h-5 w-5" />
                  </div>

                  {/* Type & Value */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-medium text-gray-500 uppercase">
                        {typeLabel}
                      </span>
                      {contact.is_primary && (
                        <AppBadge variant="primary" size="sm" icon={<Star className="h-3 w-3" />}>
                          Primary
                        </AppBadge>
                      )}
                      {contact.verified && (
                        <span title="Verified">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        </span>
                      )}
                    </div>

                    {link ? (
                      <a
                        href={link}
                        target={contact.contact_type === 'website' || contact.contact_type === 'social' ? '_blank' : undefined}
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-700 hover:underline truncate block"
                      >
                        {formattedValue}
                      </a>
                    ) : (
                      <p className="text-sm text-gray-900 truncate">{formattedValue}</p>
                    )}

                    {contact.contact_subtype && contact.contact_type !== 'social' && (
                      <p className="text-xs text-gray-400 capitalize">
                        {contact.contact_subtype}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: Actions */}
                {!readOnly && (
                  <div className="flex items-center space-x-1 ml-2">
                    {/* Copy Button */}
                    <AppButton
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopy(contact.value)}
                      title="Copy to clipboard"
                    >
                      {isCopied ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </AppButton>

                    {/* Edit Button */}
                    {onEditContact && (
                      <AppButton
                        variant="ghost"
                        size="icon"
                        onClick={() => onEditContact(contact)}
                        title="Edit contact"
                      >
                        <Edit className="h-4 w-4" />
                      </AppButton>
                    )}

                    {/* Delete Button */}
                    <AppButton
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteConfirm(contact.contact_id)}
                      title="Delete contact"
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </AppButton>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setDeleteConfirm(null)}
          onConfirm={() => handleDelete(deleteConfirm)}
          title="Delete Contact"
          message="Are you sure you want to delete this contact? This action cannot be undone."
          confirmText="Delete"
          cancelText="Cancel"
          variant="destructive"
          isLoading={deleting}
        />
      )}
    </div>
  );
};
