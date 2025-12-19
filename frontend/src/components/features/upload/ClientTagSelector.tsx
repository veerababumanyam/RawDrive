/**
 * ClientTagSelector Component
 * Dropdown selector for tagging photos with clients
 * Shows existing clients from workspace CRM
 * Allows inline creation of new client (name + optional email)
 * Supports applying same tag to all photos or individual tagging
 */

import React, { useState, useCallback, useMemo } from 'react';
import { UserPlus, X, Check, User } from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { AppInput } from '../../ui/AppInput';
import { AppCard } from '../../ui/AppCard';

export interface Client {
  client_id?: string; // Optional - for future CRM integration
  name: string;
  email?: string;
}

export interface ClientTagSelectorProps {
  /** Existing clients from workspace CRM */
  existingClients?: Client[];
  /** Selected client IDs (for multi-select) */
  selectedClientIds?: Set<string>;
  /** Callback when client selection changes */
  onClientSelect?: (clientId: string | null) => void;
  /** Callback when multiple clients are selected */
  onClientsSelect?: (clientIds: Set<string>) => void;
  /** Callback when new client is created */
  onCreateClient?: (client: Client) => Promise<Client>;
  /** Whether to allow multiple client selection */
  multiple?: boolean;
  /** Whether to show inline creation form */
  allowCreate?: boolean;
  /** Label for the selector */
  label?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Whether selector is disabled */
  disabled?: boolean;
  className?: string;
}

export const ClientTagSelector: React.FC<ClientTagSelectorProps> = ({
  existingClients = [],
  selectedClientIds = new Set(),
  onClientSelect,
  onClientsSelect,
  onCreateClient,
  multiple = false,
  allowCreate = true,
  label = 'Tag with Client',
  placeholder = 'Select or create client...',
  disabled = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter clients by search query
  const filteredClients = useMemo(() => {
    if (!searchQuery.trim()) {
      return existingClients;
    }
    const query = searchQuery.toLowerCase();
    return existingClients.filter(
      (client) =>
        client.name.toLowerCase().includes(query) ||
        client.email?.toLowerCase().includes(query)
    );
  }, [existingClients, searchQuery]);

  // Get selected client names for display
  const selectedClients = useMemo(() => {
    if (multiple) {
      return existingClients.filter((client) =>
        client.client_id ? selectedClientIds.has(client.client_id) : false
      );
    }
    const selectedId = Array.from(selectedClientIds)[0];
    return existingClients.filter((client) => client.client_id === selectedId);
  }, [existingClients, selectedClientIds, multiple]);

  // Handle client selection
  const handleClientClick = useCallback(
    (client: Client) => {
      if (disabled) return;

      if (multiple) {
        const newSelection = new Set(selectedClientIds);
        const clientId = client.client_id || client.name; // Fallback to name if no ID

        if (newSelection.has(clientId)) {
          newSelection.delete(clientId);
        } else {
          newSelection.add(clientId);
        }

        onClientsSelect?.(newSelection);
      } else {
        const clientId = client.client_id || client.name;
        onClientSelect?.(clientId);
        setIsOpen(false);
      }
    },
    [disabled, multiple, selectedClientIds, onClientSelect, onClientsSelect]
  );

  // Handle create new client
  const handleCreateClient = useCallback(async () => {
    if (!newClientName.trim() || !onCreateClient) return;

    setIsCreating(true);
    try {
      const newClient: Client = {
        name: newClientName.trim(),
        email: newClientEmail.trim() || undefined,
      };

      const created = await onCreateClient(newClient);

      // Select the newly created client
      if (multiple) {
        const newSelection = new Set(selectedClientIds);
        const clientId = created.client_id || created.name;
        newSelection.add(clientId);
        onClientsSelect?.(newSelection);
      } else {
        const clientId = created.client_id || created.name;
        onClientSelect?.(clientId);
      }

      // Reset form
      setNewClientName('');
      setNewClientEmail('');
      setIsCreating(false);
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to create client:', error);
      setIsCreating(false);
    }
  }, [
    newClientName,
    newClientEmail,
    onCreateClient,
    multiple,
    selectedClientIds,
    onClientSelect,
    onClientsSelect,
  ]);

  // Check if client is selected
  const isClientSelected = useCallback(
    (client: Client) => {
      const clientId = client.client_id || client.name;
      return selectedClientIds.has(clientId);
    },
    [selectedClientIds]
  );

  return (
    <div className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full flex items-center justify-between gap-2
          px-4 py-2 rounded-lg border
          bg-surface text-text-primary
          border-border hover:border-primary/50
          transition-colors
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          touch-target
        `}
        aria-label={label}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <User size={16} className="text-text-tertiary flex-shrink-0" />
          <span className="text-sm truncate">
            {selectedClients.length === 0
              ? placeholder
              : multiple
                ? `${selectedClients.length} client${selectedClients.length !== 1 ? 's' : ''} selected`
                : selectedClients[0]?.name || placeholder}
          </span>
        </div>
        {selectedClients.length > 0 && !multiple && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClientSelect?.(null);
            }}
            className="p-1 hover:bg-surface-hover rounded touch-target"
            aria-label="Clear selection"
          >
            <X size={14} className="text-text-tertiary" />
          </button>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          {/* Dropdown Panel */}
          <AppCard
            padding="md"
            className="absolute z-50 w-full mt-2 max-h-[400px] flex flex-col"
          >
            {/* Search Input */}
            <div className="mb-3">
              <AppInput
                type="text"
                placeholder="Search clients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
                autoFocus
              />
            </div>

            {/* Client List */}
            <div className="flex-1 overflow-y-auto space-y-1 mb-3">
              {filteredClients.length === 0 && !allowCreate && (
                <div className="text-sm text-text-tertiary text-center py-4">
                  No clients found
                </div>
              )}

              {filteredClients.map((client) => {
                const selected = isClientSelected(client);
                return (
                  <button
                    key={client.client_id || client.name}
                    type="button"
                    onClick={() => handleClientClick(client)}
                    className={`
                      w-full flex items-center gap-3 p-2 rounded-lg
                      transition-colors text-left
                      ${
                        selected
                          ? 'bg-primary/10 border border-primary'
                          : 'hover:bg-surface-hover border border-transparent'
                      }
                      touch-target
                    `}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text-primary truncate">
                        {client.name}
                      </div>
                      {client.email && (
                        <div className="text-xs text-text-tertiary truncate">
                          {client.email}
                        </div>
                      )}
                    </div>
                    {selected && (
                      <Check size={16} className="text-primary flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Create New Client Form */}
            {allowCreate && (
              <div className="border-t border-border pt-3">
                {!isCreating ? (
                  <AppButton
                    variant="outline"
                    size="sm"
                    onClick={() => setIsCreating(true)}
                    className="w-full"
                    leftIcon={<UserPlus size={16} />}
                  >
                    Create New Client
                  </AppButton>
                ) : (
                  <div className="space-y-2">
                    <AppInput
                      type="text"
                      placeholder="Client name *"
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      className="w-full"
                      autoFocus
                    />
                    <AppInput
                      type="email"
                      placeholder="Email (optional)"
                      value={newClientEmail}
                      onChange={(e) => setNewClientEmail(e.target.value)}
                      className="w-full"
                    />
                    <div className="flex items-center gap-2">
                      <AppButton
                        variant="primary"
                        size="sm"
                        onClick={handleCreateClient}
                        disabled={!newClientName.trim()}
                        className="flex-1"
                      >
                        Create
                      </AppButton>
                      <AppButton
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setIsCreating(false);
                          setNewClientName('');
                          setNewClientEmail('');
                        }}
                      >
                        Cancel
                      </AppButton>
                    </div>
                  </div>
                )}
              </div>
            )}
          </AppCard>
        </>
      )}

      {/* Selected Tags (for multiple selection) */}
      {multiple && selectedClients.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {selectedClients.map((client) => (
            <div
              key={client.client_id || client.name}
              className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-lg text-sm"
            >
              <span>{client.name}</span>
              <button
                type="button"
                onClick={() => handleClientClick(client)}
                className="hover:bg-primary/20 rounded touch-target"
                aria-label={`Remove ${client.name}`}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

