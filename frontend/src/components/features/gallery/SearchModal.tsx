/**
 * SearchModal Component
 * Global search modal with unified search across galleries, photos, tags, and people
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Loader2, Image, FolderOpen, Tag, User, MessageSquare, ArrowRight } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { searchService, type SearchResults } from '../../../services/metadataService';

interface SearchModalProps {
    /** Whether the modal is open */
    isOpen: boolean;
    /** Callback when modal should close */
    onClose: () => void;
    /** Callback when navigating to a result */
    onNavigate?: (type: string, id: string) => void;
    /** Optional gallery ID to scope search */
    galleryId?: string;
}

export const SearchModal: React.FC<SearchModalProps> = ({
    isOpen,
    onClose,
    onNavigate,
    galleryId,
}) => {
    const { workspace } = useAuth();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResults | null>(null);
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const resultsRef = useRef<HTMLDivElement>(null);

    // Focus input when modal opens
    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setResults(null);
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Keyboard shortcut to open search
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                if (!isOpen) {
                    // This would be handled by parent
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    // Search when query changes
    useEffect(() => {
        if (!workspace?.workspace_id || !query.trim()) {
            setResults(null);
            return;
        }

        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const searchResults = await searchService.quickSearch(workspace.workspace_id, query, {
                    galleryId,
                });
                setResults(searchResults);
                setSelectedIndex(0);
            } catch (error) {
                console.error('Search failed:', error);
                setResults(null);
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [query, workspace?.workspace_id, galleryId]);

    // Get flattened results for keyboard navigation
    const getFlatResults = useCallback(() => {
        if (!results) return [];

        const flat: Array<{ type: string; id: string; title: string; subtitle?: string }> = [];

        if (results.results.galleries) {
            results.results.galleries.forEach((g) => {
                flat.push({ type: 'gallery', id: g.gallery_id, title: g.title, subtitle: g.client_name });
            });
        }
        if (results.results.assets) {
            results.results.assets.forEach((a) => {
                flat.push({ type: 'asset', id: a.asset_id, title: a.file_name, subtitle: a.match_type });
            });
        }
        if (results.results.tags) {
            results.results.tags.forEach((t) => {
                flat.push({ type: 'tag', id: t.tag_id, title: t.name, subtitle: `${t.usage_count} uses` });
            });
        }
        if (results.results.people) {
            results.results.people.forEach((p) => {
                flat.push({ type: 'person', id: p.person_id, title: p.display_name || 'Unknown', subtitle: `${p.face_count} photos` });
            });
        }
        if (results.results.comments) {
            results.results.comments.forEach((c) => {
                flat.push({ type: 'comment', id: c.comment_id, title: c.body.slice(0, 50), subtitle: c.author_name });
            });
        }

        return flat;
    }, [results]);

    // Keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        const flatResults = getFlatResults();

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex((prev) => Math.min(prev + 1, flatResults.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex((prev) => Math.max(prev - 1, 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (flatResults[selectedIndex]) {
                    const result = flatResults[selectedIndex];
                    onNavigate?.(result.type, result.id);
                    onClose();
                }
                break;
            case 'Escape':
                onClose();
                break;
        }
    };

    // Scroll selected item into view
    useEffect(() => {
        if (resultsRef.current) {
            const selectedEl = resultsRef.current.querySelector(`[data-index="${selectedIndex}"]`);
            selectedEl?.scrollIntoView({ block: 'nearest' });
        }
    }, [selectedIndex]);

    if (!isOpen) return null;

    // flatResults is used for counting/indexing during render
    let currentFlatIndex = 0;

    const modal = (
        <div
            className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="w-full max-w-2xl bg-background border border-border rounded-xl shadow-2xl overflow-hidden">
                {/* Search Input */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                    <Search size={20} className="text-muted-foreground shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={galleryId ? 'Search in this gallery...' : 'Search galleries, photos, tags, people...'}
                        className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
                    />
                    {loading && <Loader2 size={20} className="animate-spin text-muted-foreground shrink-0" />}
                    <button
                        onClick={onClose}
                        className="p-1 rounded hover:bg-accent shrink-0"
                        aria-label="Close search"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Results */}
                <div ref={resultsRef} className="max-h-[60vh] overflow-y-auto">
                    {!query.trim() ? (
                        <div className="p-8 text-center text-muted-foreground">
                            <Search size={32} className="mx-auto mb-2 opacity-50" />
                            <p>Start typing to search</p>
                            <p className="text-xs mt-1">Search galleries, photos, tags, and people</p>
                        </div>
                    ) : loading && !results ? (
                        <div className="p-8 text-center">
                            <Loader2 size={24} className="animate-spin mx-auto text-muted-foreground" />
                        </div>
                    ) : results && results.total === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                            <p>No results found for "{query}"</p>
                        </div>
                    ) : results ? (
                        <div className="py-2">
                            {/* Galleries */}
                            {results.results.galleries && results.results.galleries.length > 0 && (
                                <div className="px-3 py-2">
                                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1 px-2">
                                        <FolderOpen size={14} />
                                        Galleries
                                    </div>
                                    {results.results.galleries.map((gallery) => {
                                        const index = currentFlatIndex++;
                                        return (
                                            <button
                                                key={gallery.gallery_id}
                                                data-index={index}
                                                onClick={() => {
                                                    onNavigate?.('gallery', gallery.gallery_id);
                                                    onClose();
                                                }}
                                                className={`w-full px-3 py-2 text-left rounded-md flex items-center gap-3 ${selectedIndex === index ? 'bg-accent' : 'hover:bg-accent/50'
                                                    }`}
                                            >
                                                <FolderOpen size={18} className="text-muted-foreground shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium truncate">{gallery.title}</div>
                                                    {gallery.client_name && (
                                                        <div className="text-xs text-muted-foreground truncate">
                                                            {gallery.client_name}
                                                        </div>
                                                    )}
                                                </div>
                                                <ArrowRight size={14} className="text-muted-foreground shrink-0" />
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Photos/Assets */}
                            {results.results.assets && results.results.assets.length > 0 && (
                                <div className="px-3 py-2">
                                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1 px-2">
                                        <Image size={14} />
                                        Photos
                                    </div>
                                    {results.results.assets.map((asset) => {
                                        const index = currentFlatIndex++;
                                        return (
                                            <button
                                                key={asset.asset_id}
                                                data-index={index}
                                                onClick={() => {
                                                    onNavigate?.('asset', asset.asset_id);
                                                    onClose();
                                                }}
                                                className={`w-full px-3 py-2 text-left rounded-md flex items-center gap-3 ${selectedIndex === index ? 'bg-accent' : 'hover:bg-accent/50'
                                                    }`}
                                            >
                                                <Image size={18} className="text-muted-foreground shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium truncate">{asset.file_name}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        Match: {asset.match_type}
                                                    </div>
                                                </div>
                                                <ArrowRight size={14} className="text-muted-foreground shrink-0" />
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Tags */}
                            {results.results.tags && results.results.tags.length > 0 && (
                                <div className="px-3 py-2">
                                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1 px-2">
                                        <Tag size={14} />
                                        Tags
                                    </div>
                                    {results.results.tags.map((tag) => {
                                        const index = currentFlatIndex++;
                                        return (
                                            <button
                                                key={tag.tag_id}
                                                data-index={index}
                                                onClick={() => {
                                                    onNavigate?.('tag', tag.tag_id);
                                                    onClose();
                                                }}
                                                className={`w-full px-3 py-2 text-left rounded-md flex items-center gap-3 ${selectedIndex === index ? 'bg-accent' : 'hover:bg-accent/50'
                                                    }`}
                                            >
                                                <Tag size={18} className="text-muted-foreground shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium">{tag.name}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {tag.usage_count} photos
                                                    </div>
                                                </div>
                                                <ArrowRight size={14} className="text-muted-foreground shrink-0" />
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {/* People */}
                            {results.results.people && results.results.people.length > 0 && (
                                <div className="px-3 py-2">
                                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1 px-2">
                                        <User size={14} />
                                        People
                                    </div>
                                    {results.results.people.map((person) => {
                                        const index = currentFlatIndex++;
                                        return (
                                            <button
                                                key={person.person_id}
                                                data-index={index}
                                                onClick={() => {
                                                    onNavigate?.('person', person.person_id);
                                                    onClose();
                                                }}
                                                className={`w-full px-3 py-2 text-left rounded-md flex items-center gap-3 ${selectedIndex === index ? 'bg-accent' : 'hover:bg-accent/50'
                                                    }`}
                                            >
                                                <User size={18} className="text-muted-foreground shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium">{person.display_name || 'Unknown Person'}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {person.face_count} photos
                                                    </div>
                                                </div>
                                                <ArrowRight size={14} className="text-muted-foreground shrink-0" />
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Comments */}
                            {results.results.comments && results.results.comments.length > 0 && (
                                <div className="px-3 py-2">
                                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1 px-2">
                                        <MessageSquare size={14} />
                                        Comments
                                    </div>
                                    {results.results.comments.map((comment) => {
                                        const index = currentFlatIndex++;
                                        return (
                                            <button
                                                key={comment.comment_id}
                                                data-index={index}
                                                onClick={() => {
                                                    onNavigate?.('comment', comment.comment_id);
                                                    onClose();
                                                }}
                                                className={`w-full px-3 py-2 text-left rounded-md flex items-center gap-3 ${selectedIndex === index ? 'bg-accent' : 'hover:bg-accent/50'
                                                    }`}
                                            >
                                                <MessageSquare size={18} className="text-muted-foreground shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium truncate">{comment.body}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        by {comment.author_name}
                                                    </div>
                                                </div>
                                                <ArrowRight size={14} className="text-muted-foreground shrink-0" />
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>

                {/* Footer */}
                <div className="px-4 py-2 border-t border-border bg-muted/30">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px]">↑↓</kbd>
                            Navigate
                        </span>
                        <span className="flex items-center gap-1">
                            <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px]">↵</kbd>
                            Open
                        </span>
                        <span className="flex items-center gap-1">
                            <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px]">Esc</kbd>
                            Close
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(modal, document.body);
};

export default SearchModal;
