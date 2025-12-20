
import React, { useState, useEffect, useRef } from 'react';
import { User, Search, Plus, Loader2 } from 'lucide-react';
import { peopleService, type Person } from '../../../services/metadataService';
import { useAuth } from '../../../contexts/AuthContext';

interface PersonSelectorProps {
    /** Called when a person is selected */
    onSelect: (person: Person) => void;
    /** Called when creation of a new person is requested */
    onCreate?: (name: string) => Promise<Person>;
    /** Initial search query */
    initialQuery?: string;
    /** Placeholder text */
    placeholder?: string;
    /** Auto-focus the input */
    autoFocus?: boolean;
    /** Class name */
    className?: string;
    /** On Cancel/Blur */
    onCancel?: () => void;
}

export const PersonSelector: React.FC<PersonSelectorProps> = ({
    onSelect,
    onCreate,
    initialQuery = '',
    placeholder = 'Search people...',
    autoFocus = false,
    className = '',
    onCancel,
}) => {
    const { workspace } = useAuth();
    const [query, setQuery] = useState(initialQuery);
    const [suggestions, setSuggestions] = useState<Person[]>([]);
    const [loading, setLoading] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Initial focus
    useEffect(() => {
        if (autoFocus && inputRef.current) {
            inputRef.current.focus();
        }
    }, [autoFocus]);

    // Click outside to close/cancel
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                if (onCancel) onCancel();
                setShowSuggestions(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onCancel]);

    // Fetch suggestions
    useEffect(() => {
        if (!workspace?.workspace_id || !query.trim()) {
            setSuggestions([]);
            return;
        }

        const fetchSuggestions = async () => {
            setLoading(true);
            try {
                const result = await peopleService.listPeople(workspace.workspace_id, {
                    search: query,
                    limit: 5,
                });
                setSuggestions(result.data);
                setShowSuggestions(true);
            } catch (error) {
                console.error('Failed to fetch people:', error);
            } finally {
                setLoading(false);
            }
        };

        const timer = setTimeout(fetchSuggestions, 300);
        return () => clearTimeout(timer);
    }, [workspace?.workspace_id, query]);

    const handleKeyDown = async (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            if (onCancel) onCancel();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (suggestions.length > 0) {
                // Select first suggestion if exact match or if it's the only one? 
                // Creating a new person usually requires explicit action to avoid duplicates
                // But for good UX, if exact match exists, pick it.
                const exactMatch = suggestions.find(s => s.display_name?.toLowerCase() === query.toLowerCase());
                if (exactMatch) {
                    onSelect(exactMatch);
                    return;
                }
            }

            // If no match and onCreate is provided, allow creating
            if (onCreate && query.trim()) {
                try {
                    setLoading(true);
                    const newPerson = await onCreate(query.trim());
                    onSelect(newPerson);
                } catch (error) {
                    console.error('Failed to create person:', error);
                } finally {
                    setLoading(false);
                }
            }
        }
    };

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-white/50" size={14} />
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className="w-full bg-black/50 border border-white/20 rounded-md py-1 pl-8 pr-8 text-sm text-white focus:outline-none focus:border-primary placeholder:text-white/30"
                />
                {loading && (
                    <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 animate-spin" size={14} />
                )}
            </div>

            {showSuggestions && (query.trim().length > 0) && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-gray-900 border border-white/10 rounded-md shadow-xl overflow-hidden z-[10000]">
                    {suggestions.length > 0 ? (
                        <ul className="max-h-40 overflow-y-auto">
                            {suggestions.map((person) => (
                                <li
                                    key={person.person_id}
                                    onClick={() => onSelect(person)}
                                    className="px-3 py-2 hover:bg-white/10 cursor-pointer flex items-center gap-2 text-sm text-white"
                                >
                                    <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
                                        <User size={14} />
                                    </div>
                                    <span>{person.display_name || 'Unnamed Person'}</span>
                                    <span className="text-xs text-white/40 ml-auto">
                                        {person.face_count} faces
                                    </span>
                                </li>
                            ))}
                        </ul>
                    ) : null}

                    {onCreate && query.trim() && !suggestions.some(s => s.display_name?.toLowerCase() === query.trim().toLowerCase()) && (
                        <div
                            onClick={async () => {
                                try {
                                    setLoading(true);
                                    const newPerson = await onCreate(query.trim());
                                    onSelect(newPerson);
                                } catch (error) {
                                    console.error('Failed to create person:', error);
                                } finally {
                                    setLoading(false);
                                }
                            }}
                            className="px-3 py-2 hover:bg-white/10 cursor-pointer flex items-center gap-2 text-sm text-primary border-t border-white/10"
                        >
                            <Plus size={14} />
                            <span>Create "{query}"</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
