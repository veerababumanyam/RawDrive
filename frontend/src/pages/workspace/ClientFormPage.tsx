import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Save,
  User,
  Building2,
  Calendar,
  Globe,
  MessageSquare,
  Phone,
  Mail,
  MapPin,
  Tag,
  Plus,
  Trash2,
  Loader2,
} from 'lucide-react';
import { staggerContainer, staggerItem } from '../../components/landing/animations/presets';
import { useAuth } from '../../contexts/AuthContext';
import { AppButton } from '../../components/ui/AppButton';
import { AppBadge } from '../../components/ui/AppBadge';
import { useToast } from '../../components/ui/Toast';
import { clientService } from '../../services/clientService';
import type {
  CreateClientRequest,
  ClientDetail,
  ClientContact,
  ClientAddress,
  ClientTag,
  AddContactRequest,
  AddAddressRequest,
  ContactType,
  AddressType,
} from '../../types/client';

/* =============================================================================
   ClientFormPage Component

   Create and Edit client form with all sections in a single page.
   ============================================================================= */

const ClientFormPage: React.FC = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { workspace } = useAuth();
  const { addToast } = useToast();

  const isEditMode = !!clientId;

  // Form state
  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const [client, setClient] = useState<ClientDetail | null>(null);

  // Basic info form
  const [formData, setFormData] = useState<CreateClientRequest>({
    full_name: '',
    first_name: '',
    last_name: '',
    nickname: '',
    job_title: '',
    organization: '',
    language: '',
    timezone: '',
    date_of_birth: '',
    anniversary_date: '',
    internal_notes: '',
    referred_by_client_id: '',
  });

  // Contacts state
  const [contacts, setContacts] = useState<ClientContact[]>([]);
  const [newContact, setNewContact] = useState<AddContactRequest>({
    contact_type: 'email',
    contact_subtype: '',
    value: '',
    is_primary: false,
  });

  // Addresses state
  const [addresses, setAddresses] = useState<ClientAddress[]>([]);
  const [newAddress, setNewAddress] = useState<AddAddressRequest>({
    address_type: 'home',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    country: '',
    postal_code: '',
    is_primary: false,
  });

  // Tags state
  const [clientTags, setClientTags] = useState<ClientTag[]>([]);
  const [availableTags, setAvailableTags] = useState<ClientTag[]>([]);

  // Fetch client data for edit mode
  const fetchClient = useCallback(async () => {
    if (!workspace?.workspace_id || !clientId) return;

    setLoading(true);
    try {
      const clientData = await clientService.getClient(workspace.workspace_id, clientId);
      setClient(clientData);
      setFormData({
        full_name: clientData.full_name,
        first_name: clientData.first_name,
        last_name: clientData.last_name || '',
        nickname: clientData.nickname || '',
        job_title: clientData.job_title || '',
        organization: clientData.organization || '',
        language: clientData.language || '',
        timezone: clientData.timezone || '',
        date_of_birth: clientData.date_of_birth || '',
        anniversary_date: clientData.anniversary_date || '',
        internal_notes: clientData.internal_notes || '',
        referred_by_client_id: clientData.referred_by_client_id || '',
      });
      setContacts(clientData.contacts);
      setAddresses(clientData.addresses);
      setClientTags(clientData.tags);
    } catch (err) {
      addToast({
        variant: 'error',
        message: err instanceof Error ? err.message : 'Failed to fetch client',
      });
    } finally {
      setLoading(false);
    }
  }, [workspace?.workspace_id, clientId, addToast]);

  // Fetch available tags
  const fetchTags = useCallback(async () => {
    if (!workspace?.workspace_id) return;

    try {
      const tags = await clientService.getWorkspaceTags(workspace.workspace_id);
      setAvailableTags(Array.isArray(tags) ? tags : []);
    } catch (err) {
      console.error('Failed to fetch tags:', err);
      setAvailableTags([]); // Ensure it's always an array even on error
    }
  }, [workspace?.workspace_id]);

  useEffect(() => {
    if (isEditMode) {
      fetchClient();
    }
    fetchTags();
  }, [isEditMode, fetchClient, fetchTags]);

  // Handlers
  const handleBack = () => {
    if (isEditMode) {
      navigate(`/workspace/clients/${clientId}`);
    } else {
      navigate('/workspace/clients');
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Auto-generate full_name if first_name or last_name changes
    if (name === 'first_name' || name === 'last_name') {
      const firstName = name === 'first_name' ? value : formData.first_name;
      const lastName = name === 'last_name' ? value : formData.last_name;
      setFormData((prev) => ({
        ...prev,
        [name]: value,
        full_name: [firstName, lastName].filter(Boolean).join(' '),
      }));
    }
  };

  const handleSave = async () => {
    if (!workspace?.workspace_id) return;

    // Validation
    if (!formData.first_name.trim()) {
      addToast({ variant: 'error', message: 'First name is required' });
      return;
    }

    setSaving(true);
    try {
      // Sanitize payload: remove empty strings for optional fields
      // This prevents 422 errors where backend expects UUID/Date but gets ""
      const sanitizePayload = (data: CreateClientRequest) => {
        const cleaned = { ...data };
        Object.keys(cleaned).forEach((key) => {
          const k = key as keyof CreateClientRequest;
          if (cleaned[k] === '') {
            // @ts-ignore - dynamic assignment
            cleaned[k] = undefined;
          }
        });
        return cleaned;
      };

      const payload = sanitizePayload(formData);

      console.log('Creating/updating client with payload:', payload);

      if (isEditMode && clientId) {
        await clientService.updateClient(workspace.workspace_id, clientId, payload);
        addToast({ variant: 'success', message: 'Client updated successfully' });
      } else {
        const response = await clientService.createClient(workspace.workspace_id, payload);
        addToast({ variant: 'success', message: 'Client created successfully' });
        navigate(`/workspace/clients/${response.client_id}`);
        return;
      }

      handleBack();
    } catch (err) {
      console.error('Failed to save client:', err);
      addToast({
        variant: 'error',
        message: err instanceof Error ? err.message : 'Failed to save client',
      });
    } finally {
      setSaving(false);
    }
  };

  // Contact handlers
  const handleAddContact = async () => {
    if (!workspace?.workspace_id || !clientId || !newContact.value.trim()) return;

    try {
      await clientService.addContact(workspace.workspace_id, clientId, newContact);
      addToast({ variant: 'success', message: 'Contact added successfully' });
      setNewContact({ contact_type: 'email', contact_subtype: '', value: '', is_primary: false });
      fetchClient();
    } catch (err) {
      addToast({
        variant: 'error',
        message: err instanceof Error ? err.message : 'Failed to add contact',
      });
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!workspace?.workspace_id || !clientId) return;

    try {
      await clientService.deleteContact(workspace.workspace_id, clientId, contactId);
      addToast({ variant: 'success', message: 'Contact removed' });
      setContacts((prev) => prev.filter((c) => c.contact_id !== contactId));
    } catch (err) {
      addToast({
        variant: 'error',
        message: err instanceof Error ? err.message : 'Failed to delete contact',
      });
    }
  };

  // Address handlers
  const handleAddAddress = async () => {
    if (!workspace?.workspace_id || !clientId) return;

    if (!newAddress.address_line1?.trim() && !newAddress.city?.trim()) {
      addToast({ variant: 'error', message: 'Please enter address details' });
      return;
    }

    try {
      await clientService.addAddress(workspace.workspace_id, clientId, newAddress);
      addToast({ variant: 'success', message: 'Address added successfully' });
      setNewAddress({
        address_type: 'home',
        address_line1: '',
        address_line2: '',
        city: '',
        state: '',
        country: '',
        postal_code: '',
        is_primary: false,
      });
      fetchClient();
    } catch (err) {
      addToast({
        variant: 'error',
        message: err instanceof Error ? err.message : 'Failed to add address',
      });
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    if (!workspace?.workspace_id || !clientId) return;

    try {
      await clientService.deleteAddress(workspace.workspace_id, clientId, addressId);
      addToast({ variant: 'success', message: 'Address removed' });
      setAddresses((prev) => prev.filter((a) => a.address_id !== addressId));
    } catch (err) {
      addToast({
        variant: 'error',
        message: err instanceof Error ? err.message : 'Failed to delete address',
      });
    }
  };

  // Tag handlers
  const handleAddTag = async (tagId: string) => {
    if (!workspace?.workspace_id || !clientId) return;

    try {
      await clientService.addTags(workspace.workspace_id, clientId, { tag_ids: [tagId] });
      const tag = availableTags.find((t) => t.tag_id === tagId);
      if (tag) {
        setClientTags((prev) => [...prev, tag]);
      }
      addToast({ variant: 'success', message: 'Tag added' });
    } catch (err) {
      addToast({
        variant: 'error',
        message: err instanceof Error ? err.message : 'Failed to add tag',
      });
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!workspace?.workspace_id || !clientId) return;

    try {
      await clientService.removeTag(workspace.workspace_id, clientId, tagId);
      setClientTags((prev) => prev.filter((t) => t.tag_id !== tagId));
      addToast({ variant: 'success', message: 'Tag removed' });
    } catch (err) {
      addToast({
        variant: 'error',
        message: err instanceof Error ? err.message : 'Failed to remove tag',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={32} className="text-primary animate-spin" />
      </div>
    );
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="space-y-6 max-w-4xl mx-auto pb-12"
    >
      {/* Header */}
      <motion.div
        variants={staggerItem}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-4">
          <AppButton
            variant="ghost"
            size="icon"
            onClick={handleBack}
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </AppButton>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">
              {isEditMode ? 'Edit Client' : 'New Client'}
            </h1>
            {isEditMode && client && (
              <p className="text-text-secondary">{client.full_name}</p>
            )}
          </div>
        </div>
        <AppButton
          variant="primary"
          onClick={handleSave}
          isLoading={saving}
          leftIcon={<Save size={18} />}
          shine
        >
          {isEditMode ? 'Save Changes' : 'Create Client'}
        </AppButton>
      </motion.div>

      {/* Single Page Form */}
      <motion.div variants={staggerItem} className="card-glass rounded-2xl p-6 space-y-8">
        {/* Personal Information Section */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            <User size={20} className="text-primary" />
            <h2 className="text-xl font-semibold text-text-primary">Personal Information</h2>
          </div>
          <div className="space-y-6">
            {/* Name */}
            <div>
              <h3 className="font-medium text-text-primary mb-4">Name</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    First Name <span className="text-error">*</span>
                  </label>
                  <input
                    type="text"
                    name="first_name"
                    value={formData.first_name}
                    onChange={handleInputChange}
                    placeholder="John"
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-surface focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    Last Name
                  </label>
                  <input
                    type="text"
                    name="last_name"
                    value={formData.last_name || ''}
                    onChange={handleInputChange}
                    placeholder="Doe"
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-surface focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    Nickname
                  </label>
                  <input
                    type="text"
                    name="nickname"
                    value={formData.nickname || ''}
                    onChange={handleInputChange}
                    placeholder="Johnny"
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-surface focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Divider */}
            <hr className="border-border/50" />

            {/* Work Information */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Building2 size={18} className="text-accent" />
                <h3 className="font-medium text-text-primary">Work</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    Organization
                  </label>
                  <input
                    type="text"
                    name="organization"
                    value={formData.organization || ''}
                    onChange={handleInputChange}
                    placeholder="Acme Corp"
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-surface focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    Job Title
                  </label>
                  <input
                    type="text"
                    name="job_title"
                    value={formData.job_title || ''}
                    onChange={handleInputChange}
                    placeholder="Marketing Manager"
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-surface focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Divider */}
            <hr className="border-border/50" />

            {/* Important Dates */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Calendar size={18} className="text-success" />
                <h3 className="font-medium text-text-primary">Important Dates</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    name="date_of_birth"
                    value={formData.date_of_birth || ''}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-surface focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    Anniversary Date
                  </label>
                  <input
                    type="date"
                    name="anniversary_date"
                    value={formData.anniversary_date || ''}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-surface focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Divider */}
            <hr className="border-border/50" />

            {/* Locale */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Globe size={18} className="text-info" />
                <h3 className="font-medium text-text-primary">Locale</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    Language
                  </label>
                  <select
                    name="language"
                    value={formData.language || ''}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-surface focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  >
                    <option value="">Select language</option>
                    <option value="en-US">English (US)</option>
                    <option value="en-GB">English (UK)</option>
                    <option value="en-IN">English (India)</option>
                    <option value="hi-IN">Hindi</option>
                    <option value="es-ES">Spanish</option>
                    <option value="fr-FR">French</option>
                    <option value="de-DE">German</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    Timezone
                  </label>
                  <select
                    name="timezone"
                    value={formData.timezone || ''}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-surface focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  >
                    <option value="">Select timezone</option>
                    <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                    <option value="America/New_York">America/New_York (EST)</option>
                    <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                    <option value="Europe/London">Europe/London (GMT)</option>
                    <option value="Europe/Paris">Europe/Paris (CET)</option>
                    <option value="Australia/Sydney">Australia/Sydney (AEST)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section Divider */}
        <div className="border-t-2 border-border/30" />

        {/* Contacts Section */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            <Phone size={20} className="text-primary" />
            <h2 className="text-xl font-semibold text-text-primary">Contact Information</h2>
            {contacts.length > 0 && (
              <AppBadge variant="default" size="sm">{contacts.length}</AppBadge>
            )}
          </div>

          <ContactsSection
            contacts={contacts}
            newContact={newContact}
            setNewContact={setNewContact}
            onAdd={handleAddContact}
            onDelete={handleDeleteContact}
            isEditMode={isEditMode}
          />
        </section>

        {/* Section Divider */}
        <div className="border-t-2 border-border/30" />

        {/* Addresses Section */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            <MapPin size={20} className="text-primary" />
            <h2 className="text-xl font-semibold text-text-primary">Addresses</h2>
            {addresses.length > 0 && (
              <AppBadge variant="default" size="sm">{addresses.length}</AppBadge>
            )}
          </div>

          <AddressesSection
            addresses={addresses}
            newAddress={newAddress}
            setNewAddress={setNewAddress}
            onAdd={handleAddAddress}
            onDelete={handleDeleteAddress}
            isEditMode={isEditMode}
          />
        </section>

        {/* Section Divider */}
        <div className="border-t-2 border-border/30" />

        {/* Tags Section */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            <Tag size={20} className="text-primary" />
            <h2 className="text-xl font-semibold text-text-primary">Tags</h2>
            {clientTags.length > 0 && (
              <AppBadge variant="default" size="sm">{clientTags.length}</AppBadge>
            )}
          </div>

          <TagsSection
            clientTags={clientTags}
            availableTags={availableTags}
            onAdd={handleAddTag}
            onRemove={handleRemoveTag}
            isEditMode={isEditMode}
          />
        </section>

        {/* Section Divider */}
        <div className="border-t-2 border-border/30" />

        {/* Notes Section */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            <MessageSquare size={20} className="text-primary" />
            <h2 className="text-xl font-semibold text-text-primary">Internal Notes</h2>
          </div>

          <div>
            <p className="text-sm text-text-tertiary mb-4">
              These notes are private and will not be visible to the client.
            </p>
            <textarea
              name="internal_notes"
              value={formData.internal_notes || ''}
              onChange={handleInputChange}
              placeholder="Add private notes about this client..."
              rows={6}
              className="w-full px-4 py-3 rounded-xl border border-border bg-surface focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all resize-none"
            />
          </div>
        </section>
      </motion.div>
    </motion.div>
  );
};

/* =============================================================================
   Contacts Section Component
   ============================================================================= */

interface ContactsSectionProps {
  contacts: ClientContact[];
  newContact: AddContactRequest;
  setNewContact: React.Dispatch<React.SetStateAction<AddContactRequest>>;
  onAdd: () => void;
  onDelete: (id: string) => void;
  isEditMode: boolean;
}

const ContactsSection: React.FC<ContactsSectionProps> = ({
  contacts,
  newContact,
  setNewContact,
  onAdd,
  onDelete,
  isEditMode,
}) => {
  const contactTypes: { value: ContactType; label: string; icon: React.ReactNode }[] = [
    { value: 'email', label: 'Email', icon: <Mail size={16} /> },
    { value: 'phone', label: 'Phone', icon: <Phone size={16} /> },
    { value: 'website', label: 'Website', icon: <Globe size={16} /> },
    { value: 'social', label: 'Social', icon: <User size={16} /> },
  ];

  return (
    <div className="space-y-6">
      {/* Existing Contacts */}
      {contacts.length > 0 && (
        <div className="space-y-3">
          {contacts.map((contact) => (
            <div
              key={contact.contact_id}
              className="flex items-center gap-3 p-4 rounded-xl bg-surface-hover/30 hover:bg-surface-hover/50 transition-colors"
            >
              {contact.contact_type === 'email' && <Mail size={18} className="text-primary flex-shrink-0" />}
              {contact.contact_type === 'phone' && <Phone size={18} className="text-success flex-shrink-0" />}
              {contact.contact_type === 'website' && <Globe size={18} className="text-accent flex-shrink-0" />}
              {contact.contact_type === 'social' && <User size={18} className="text-info flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-text-primary truncate">{contact.value}</p>
                <p className="text-sm text-text-tertiary capitalize">
                  {contact.contact_subtype || contact.contact_type}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {contact.is_primary && (
                  <AppBadge variant="primary" size="sm">Primary</AppBadge>
                )}
                {contact.verified && (
                  <AppBadge variant="success" size="sm">Verified</AppBadge>
                )}
                {isEditMode && (
                  <button
                    onClick={() => onDelete(contact.contact_id)}
                    className="p-2 rounded-lg hover:bg-error/10 text-text-tertiary hover:text-error transition-colors"
                    aria-label="Delete contact"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add New Contact */}
      {isEditMode && (
        <div className="p-4 rounded-xl border border-dashed border-border bg-surface-hover/20">
          <h4 className="font-medium text-text-primary mb-4">Add New Contact</h4>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">Type</label>
              <select
                value={newContact.contact_type}
                onChange={(e) =>
                  setNewContact((prev) => ({ ...prev, contact_type: e.target.value as ContactType }))
                }
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface"
              >
                {contactTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">Subtype</label>
              <input
                type="text"
                value={newContact.contact_subtype || ''}
                onChange={(e) =>
                  setNewContact((prev) => ({ ...prev, contact_subtype: e.target.value }))
                }
                placeholder="work, personal..."
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-text-secondary mb-1.5">Value</label>
              <input
                type="text"
                value={newContact.value}
                onChange={(e) =>
                  setNewContact((prev) => ({ ...prev, value: e.target.value }))
                }
                placeholder={
                  newContact.contact_type === 'email'
                    ? 'john@example.com'
                    : newContact.contact_type === 'phone'
                      ? '+1 234 567 8900'
                      : 'https://...'
                }
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface"
              />
            </div>
          </div>
          <div className="flex items-center justify-between mt-4">
            <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={newContact.is_primary}
                onChange={(e) =>
                  setNewContact((prev) => ({ ...prev, is_primary: e.target.checked }))
                }
                className="rounded border-border"
              />
              Set as primary
            </label>
            <AppButton
              variant="primary"
              size="sm"
              onClick={onAdd}
              leftIcon={<Plus size={16} />}
              disabled={!newContact.value.trim()}
            >
              Add Contact
            </AppButton>
          </div>
        </div>
      )}

      {!isEditMode && contacts.length === 0 && (
        <div className="p-8 rounded-xl border border-dashed border-border bg-surface-hover/10 text-center">
          <Phone size={32} className="mx-auto text-text-tertiary mb-3" />
          <p className="text-text-tertiary">
            Contacts can be added after creating the client
          </p>
        </div>
      )}
    </div>
  );
};

/* =============================================================================
   Addresses Section Component
   ============================================================================= */

interface AddressesSectionProps {
  addresses: ClientAddress[];
  newAddress: AddAddressRequest;
  setNewAddress: React.Dispatch<React.SetStateAction<AddAddressRequest>>;
  onAdd: () => void;
  onDelete: (id: string) => void;
  isEditMode: boolean;
}

const AddressesSection: React.FC<AddressesSectionProps> = ({
  addresses,
  newAddress,
  setNewAddress,
  onAdd,
  onDelete,
  isEditMode,
}) => {
  const addressTypes: AddressType[] = ['home', 'work', 'billing', 'shipping'];

  return (
    <div className="space-y-6">
      {/* Existing Addresses */}
      {addresses.length > 0 && (
        <div className="space-y-3">
          {addresses.map((address) => (
            <div
              key={address.address_id}
              className="p-4 rounded-xl bg-surface-hover/30"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <MapPin size={18} className="text-accent" />
                  <AppBadge variant="outline" size="sm" className="capitalize">
                    {address.address_type}
                  </AppBadge>
                  {address.is_primary && (
                    <AppBadge variant="primary" size="sm">Primary</AppBadge>
                  )}
                </div>
                {isEditMode && (
                  <button
                    onClick={() => onDelete(address.address_id)}
                    className="p-2 rounded-lg hover:bg-error/10 text-text-tertiary hover:text-error transition-colors"
                    aria-label="Delete address"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              <p className="text-text-primary">
                {[address.address_line1, address.address_line2].filter(Boolean).join(', ')}
              </p>
              <p className="text-text-secondary">
                {[address.city, address.state, address.postal_code].filter(Boolean).join(', ')}
              </p>
              {address.country && (
                <p className="text-text-tertiary">{address.country}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add New Address */}
      {isEditMode && (
        <div className="p-4 rounded-xl border border-dashed border-border bg-surface-hover/20">
          <h4 className="font-medium text-text-primary mb-4">Add New Address</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">Type</label>
              <select
                value={newAddress.address_type}
                onChange={(e) =>
                  setNewAddress((prev) => ({ ...prev, address_type: e.target.value as AddressType }))
                }
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface capitalize"
              >
                {addressTypes.map((type) => (
                  <option key={type} value={type} className="capitalize">
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">Address Line 1</label>
              <input
                type="text"
                value={newAddress.address_line1 || ''}
                onChange={(e) =>
                  setNewAddress((prev) => ({ ...prev, address_line1: e.target.value }))
                }
                placeholder="123 Main Street"
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface"
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">Address Line 2</label>
              <input
                type="text"
                value={newAddress.address_line2 || ''}
                onChange={(e) =>
                  setNewAddress((prev) => ({ ...prev, address_line2: e.target.value }))
                }
                placeholder="Apt 4B"
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface"
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">City</label>
              <input
                type="text"
                value={newAddress.city || ''}
                onChange={(e) =>
                  setNewAddress((prev) => ({ ...prev, city: e.target.value }))
                }
                placeholder="New York"
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface"
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">State/Province</label>
              <input
                type="text"
                value={newAddress.state || ''}
                onChange={(e) =>
                  setNewAddress((prev) => ({ ...prev, state: e.target.value }))
                }
                placeholder="NY"
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface"
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">Postal Code</label>
              <input
                type="text"
                value={newAddress.postal_code || ''}
                onChange={(e) =>
                  setNewAddress((prev) => ({ ...prev, postal_code: e.target.value }))
                }
                placeholder="10001"
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface"
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">Country</label>
              <input
                type="text"
                value={newAddress.country || ''}
                onChange={(e) =>
                  setNewAddress((prev) => ({ ...prev, country: e.target.value }))
                }
                placeholder="United States"
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface"
              />
            </div>
          </div>
          <div className="flex items-center justify-between mt-4">
            <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={newAddress.is_primary}
                onChange={(e) =>
                  setNewAddress((prev) => ({ ...prev, is_primary: e.target.checked }))
                }
                className="rounded border-border"
              />
              Set as primary
            </label>
            <AppButton
              variant="primary"
              size="sm"
              onClick={onAdd}
              leftIcon={<Plus size={16} />}
            >
              Add Address
            </AppButton>
          </div>
        </div>
      )}

      {!isEditMode && addresses.length === 0 && (
        <div className="p-8 rounded-xl border border-dashed border-border bg-surface-hover/10 text-center">
          <MapPin size={32} className="mx-auto text-text-tertiary mb-3" />
          <p className="text-text-tertiary">
            Addresses can be added after creating the client
          </p>
        </div>
      )}
    </div>
  );
};

/* =============================================================================
   Tags Section Component
   ============================================================================= */

interface TagsSectionProps {
  clientTags: ClientTag[];
  availableTags: ClientTag[];
  onAdd: (tagId: string) => void;
  onRemove: (tagId: string) => void;
  isEditMode: boolean;
}

const TagsSection: React.FC<TagsSectionProps> = ({
  clientTags,
  availableTags,
  onAdd,
  onRemove,
  isEditMode,
}) => {
  // Ensure availableTags is always an array
  const safeTags = Array.isArray(availableTags) ? availableTags : [];
  const unassignedTags = safeTags.filter(
    (tag) => !clientTags.some((ct) => ct.tag_id === tag.tag_id)
  );

  return (
    <div className="space-y-6">
      {/* Current Tags */}
      <div>
        <h4 className="font-medium text-text-primary mb-4">Assigned Tags</h4>
        {clientTags.length === 0 ? (
          <p className="text-text-tertiary">No tags assigned</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {clientTags.map((tag) => (
              <AppBadge
                key={tag.tag_id}
                variant="outline"
                removable={isEditMode}
                onRemove={() => onRemove(tag.tag_id)}
                icon={
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: tag.color || '#6B7280' }}
                  />
                }
              >
                {tag.name}
              </AppBadge>
            ))}
          </div>
        )}
      </div>

      {/* Add Tags */}
      {isEditMode && (
        <div>
          <h4 className="font-medium text-text-primary mb-4">Available Tags</h4>
          {unassignedTags.length === 0 ? (
            <p className="text-text-tertiary">All tags are assigned</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {unassignedTags.map((tag) => (
                <button
                  key={tag.tag_id}
                  onClick={() => onAdd(tag.tag_id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-dashed border-border text-sm text-text-secondary hover:border-primary hover:text-primary transition-colors"
                >
                  <Plus size={14} />
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: tag.color || '#6B7280' }}
                  />
                  {tag.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!isEditMode && clientTags.length === 0 && (
        <div className="p-8 rounded-xl border border-dashed border-border bg-surface-hover/10 text-center">
          <Tag size={32} className="mx-auto text-text-tertiary mb-3" />
          <p className="text-text-tertiary">
            Tags can be added after creating the client
          </p>
        </div>
      )}
    </div>
  );
};

export default ClientFormPage;
