import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Plus, Check, Loader2, X } from 'lucide-react';
import { clientService } from '../../../services/clientService';
import { useAuth } from '../../../contexts/AuthContext';
import { useClientAvatars } from '../../../hooks/useClientAvatars';
import { QuickClientCreateModal } from './QuickClientCreateModal';
import type { ClientSearchResult, ClientCreateResponse, ClientListItem } from '../../../types/client';

interface ClientComboboxProps {
    value?: string;           // Selected client ID
    onChange: (clientId: string | null, clientName?: string) => void;
    placeholder?: string;
    error?: string;
    helperText?: string;
    label?: string;
}

export const ClientCombobox: React.FC<ClientComboboxProps> = ({
    value,
    onChange,
    placeholder = "Search clients...",
    error,
    helperText,
    label = "Client Name"
}) => {
    const { workspace } = useAuth();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ClientSearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [selectedClient, setSelectedClient] = useState<ClientSearchResult | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Convert search results to ClientListItem format for useClientAvatars hook
    const resultsAsListItems = useMemo((): ClientListItem[] =>
        results.map(r => ({
            client_id: r.client_id,
            full_name: r.full_name,
            first_name: r.first_name,
            last_name: r.last_name,
            avatar_url: r.avatar_url,
            status: r.status,
            initials: `${r.first_name[0] || ''}${r.last_name?.[0] || ''}`,
            created_at: '',
            linked_galleries_count: 0,
            tags: [],
        })),
        [results]
    );

    // Fetch authenticated avatar URLs for search results
    const { avatarBlobUrls } = useClientAvatars(workspace?.workspace_id, resultsAsListItems, 64);

    // Initial load if value is provided
    useEffect(() => {
        const fetchInitialClient = async () => {
            if (value && workspace?.workspace_id && !selectedClient) {
                try {
                    const client = await clientService.getClient(workspace.workspace_id, value);
                    setSelectedClient({
                        client_id: client.client_id,
                        full_name: client.full_name,
                        first_name: client.first_name,
                        last_name: client.last_name,
                        avatar_url: client.avatar_url,
                        status: client.status
                    });
                    setQuery(client.full_name);
                } catch (err) {
                    console.error('Failed to fetch initial client', err);
                }
            }
        };
        fetchInitialClient();
    }, [value, workspace?.workspace_id]);

    // Search clients with debounce
    useEffect(() => {
        const searchClients = async () => {
            if (!query.trim() || !workspace?.workspace_id) {
                setResults([]);
                return;
            }

            // Don't search if query matches selected client exactly
            if (selectedClient && query === selectedClient.full_name) {
                return;
            }

            setIsLoading(true);
            try {
                const searchResults = await clientService.searchClients(workspace.workspace_id, query);
                setResults(searchResults);
            } catch (err) {
                console.error('Failed to search clients', err);
                setResults([]);
            } finally {
                setIsLoading(false);
            }
        };

        const timeoutId = setTimeout(searchClients, 300);
        return () => clearTimeout(timeoutId);
    }, [query, workspace?.workspace_id, selectedClient]);

    // Handle outside click to close dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                // Reset query to selected client name if blur without selection change
                if (selectedClient && query !== selectedClient.full_name) {
                    setQuery(selectedClient.full_name);
                }
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [selectedClient, query]);

    const handleSelect = (client: ClientSearchResult) => {
        setSelectedClient(client);
        setQuery(client.full_name);
        onChange(client.client_id, client.full_name);
        setIsOpen(false);
    };

    const handleClear = () => {
        setSelectedClient(null);
        setQuery('');
        onChange(null, '');
        inputRef.current?.focus();
    };

    const handleCreateSuccess = (newClient: ClientCreateResponse) => {
        const clientResult: ClientSearchResult = {
            client_id: newClient.client_id,
            full_name: newClient.full_name,
            first_name: newClient.full_name.split(' ')[0],
            status: newClient.status
        };
        handleSelect(clientResult);
    };

    return (
        <div ref={containerRef} className="relative">
            {label && (
                <label className="block text-sm font-medium text-text-primary mb-1.5">
                    {label}
                </label>
            )}

            <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none">
                    {isLoading ? (
                        <Loader2 size={18} className="animate-spin" />
                    ) : (
                        <Search size={18} />
                    )}
                </div>

                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setIsOpen(true);
                        if (!e.target.value) {
                            onChange(null, '');
                            setSelectedClient(null);
                        } else {
                            // Allow free text input - also passes the text as clientName so parent can use it if no ID selected
                            onChange(selectedClient?.client_id || null, e.target.value);
                        }
                    }}
                    onFocus={() => setIsOpen(true)}
                    placeholder={placeholder}
                    className={`
            w-full pl-10 pr-10 py-3
            bg-surface border rounded-xl
            text-text-primary placeholder:text-text-tertiary
            focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
            transition-all
            ${error ? 'border-error' : 'border-border'}
          `}
                />

                {query && (
                    <button
                        onClick={handleClear}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary p-1 rounded-full hover:bg-surface-hover transition-colors"
                    >
                        <X size={16} />
                    </button>
                )}
            </div>

            {error && (
                <p className="mt-1 text-sm text-error">{error}</p>
            )}

            {helperText && !error && (
                <p className="mt-1 text-sm text-text-tertiary">{helperText}</p>
            )}

            {/* Dropdown */}
            {isOpen && query.trim() && (
                <div className="absolute z-50 w-full mt-2 bg-surface-card border border-border rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                    {results.length > 0 ? (
                        <ul className="divide-y divide-border/30">
                            {results.map((client) => {
                                const avatarUrl = avatarBlobUrls[client.client_id];
                                return (
                                    <li key={client.client_id}>
                                        <button
                                            onClick={() => handleSelect(client)}
                                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors text-left group"
                                        >
                                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm group-hover:bg-primary group-hover:text-white transition-colors overflow-hidden">
                                                {avatarUrl ? (
                                                    <img src={avatarUrl} alt={client.full_name} className="w-full h-full rounded-full object-cover" />
                                                ) : (
                                                    <span>{client.first_name[0]}{client.last_name?.[0]}</span>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-text-primary truncate">
                                                    {client.full_name}
                                                </p>
                                                <p className="text-xs text-text-tertiary truncate">
                                                    {client.primary_email || client.organization || 'No contact details'}
                                                </p>
                                            </div>
                                            {selectedClient?.client_id === client.client_id && (
                                                <Check size={16} className="text-primary" />
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        !isLoading && (
                            <div className="px-4 py-3 text-sm text-text-tertiary text-center">
                                No existing clients found
                            </div>
                        )
                    )}

                    {/* Create New Option - Always visible if query doesn't match a selected client */}
                    {(!selectedClient || selectedClient.full_name !== query) && (
                        <div className={`p-2 ${results.length > 0 ? 'border-t border-border/50' : ''}`}>
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-primary hover:bg-primary/10 transition-colors text-sm font-medium"
                            >
                                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                                    <Plus size={16} />
                                </div>
                                Create new client "{query}"
                            </button>
                        </div>
                    )}
                </div>
            )}

            <QuickClientCreateModal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                onSuccess={handleCreateSuccess}
                initialName={query}
            />
        </div>
    );
};
