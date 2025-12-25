/**
 * TagInput Component
 * Allows adding and removing tags on an asset
 */

import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Tag as TagIcon, Loader2 } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { tagService, type AssetTag, type Tag } from '../../../services/metadataService';

interface TagInputProps {
    /** Asset ID to manage tags for */
    assetId: string;
    /** Current tags on the asset */
    tags?: AssetTag[];
    /** Callback when tags change */
    onTagsChange?: (tags: AssetTag[]) => void;
    /** Whether component is read-only */
    readOnly?: boolean;
    /** Optional class name */
    className?: string;
}

// Predefined tag colors
const TAG_COLORS = [
    { name: 'gray', bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' },
    { name: 'red', bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' },
    { name: 'orange', bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' },
    { name: 'yellow', bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
    { name: 'green', bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
    { name: 'blue', bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
    { name: 'purple', bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300' },
    { name: 'pink', bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-300' },
];

const getTagColorClasses = (color?: string) => {
    const found = TAG_COLORS.find((c) => c.name === color);
    return found || TAG_COLORS[0];
};

export const TagInput: React.FC<TagInputProps> = ({
    assetId,
    tags: initialTags = [],
    onTagsChange,
    readOnly = false,
    className = '',
}) => {
    const { workspace } = useAuth();
    const [tags, setTags] = useState<AssetTag[]>(initialTags);
    const [suggestions, setSuggestions] = useState<Tag[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Update local tags when prop changes
    useEffect(() => {
        setTags(initialTags);
    }, [initialTags]);

    // Fetch tags for asset if not provided or to ensure freshness
    useEffect(() => {
        if (!workspace?.workspace_id || !assetId) return;

        // Only fetch if initialTags is empty, or maybe always fetch to be safe?
        // For now, let's fetch if we're not in a read-only mode to ensure we have latest
        if (!readOnly) {
            const fetchTags = async () => {
                try {
                    const assetTags = await tagService.getAssetTags(workspace.workspace_id, assetId);
                    setTags(assetTags);
                } catch (error) {
                    console.error('Failed to fetch tags:', error);
                }
            };
            fetchTags();
        }
    }, [workspace?.workspace_id, assetId, readOnly]);

    // Fetch suggestions when typing
    useEffect(() => {
        if (!workspace?.workspace_id || !inputValue.trim() || readOnly) {
            setSuggestions([]);
            return;
        }

        const timer = setTimeout(async () => {
            setLoadingSuggestions(true);
            try {
                const result = await tagService.listTags(workspace.workspace_id, {
                    search: inputValue,
                    limit: 10,
                });
                // Filter out already-added tags
                const filtered = result.data.filter(
                    (tag) => !tags.some((t) => t.tag_id === tag.tag_id)
                );
                setSuggestions(filtered);
            } catch (error) {
                console.error('Failed to fetch tag suggestions:', error);
                setSuggestions([]);
            } finally {
                setLoadingSuggestions(false);
            }
        }, 200);

        return () => clearTimeout(timer);
    }, [inputValue, workspace?.workspace_id, tags, readOnly]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const addTag = async (tag: Tag | { name: string }) => {
        if (!workspace?.workspace_id || loading) return;

        setLoading(true);
        try {
            let newTag: AssetTag;

            if ('tag_id' in tag) {
                // Adding existing tag
                await tagService.addTagToAsset(workspace.workspace_id, assetId, tag.tag_id);
                newTag = { tag_id: tag.tag_id, name: tag.name, type: tag.type, color: tag.color };
            } else {
                // Creating new tag
                newTag = await tagService.createAndAddTag(workspace.workspace_id, assetId, {
                    name: tag.name,
                    type: 'keyword',
                });
            }

            const updatedTags = [...tags, newTag];
            setTags(updatedTags);
            onTagsChange?.(updatedTags);
            setInputValue('');
            setSuggestions([]);
            setIsOpen(false);
        } catch (error) {
            console.error('Failed to add tag:', error);
        } finally {
            setLoading(false);
        }
    };

    const removeTag = async (tagId: string) => {
        if (!workspace?.workspace_id || loading || readOnly) return;

        setLoading(true);
        try {
            await tagService.removeTagFromAsset(workspace.workspace_id, assetId, tagId);
            const updatedTags = tags.filter((t) => t.tag_id !== tagId);
            setTags(updatedTags);
            onTagsChange?.(updatedTags);
        } catch (error) {
            console.error('Failed to remove tag:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && inputValue.trim()) {
            e.preventDefault();
            // If there's a matching suggestion, use it
            const matchingSuggestion = suggestions.find(
                (s) => s.name.toLowerCase() === inputValue.toLowerCase()
            );
            if (matchingSuggestion) {
                addTag(matchingSuggestion);
            } else {
                // Create new tag
                addTag({ name: inputValue.trim() });
            }
        } else if (e.key === 'Escape') {
            setIsOpen(false);
            setInputValue('');
        } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
            // Remove last tag on backspace when input is empty
            removeTag(tags[tags.length - 1].tag_id);
        }
    };

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <div className="flex items-center gap-1 mb-2">
                <TagIcon size={16} className="text-muted-foreground" />
                <span className="text-sm font-medium">Tags</span>
            </div>

            {/* Tags Display */}
            <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map((tag) => {
                    const colorClasses = getTagColorClasses(tag.color);
                    return (
                        <span
                            key={tag.tag_id}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colorClasses.bg} ${colorClasses.text} border ${colorClasses.border}`}
                        >
                            {tag.name}
                            {!readOnly && (
                                <button
                                    onClick={() => removeTag(tag.tag_id)}
                                    className="hover:text-error transition-colors ml-0.5 -mr-0.5"
                                    disabled={loading}
                                    aria-label={`Remove tag ${tag.name}`}
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </span>
                    );
                })}
                {tags.length === 0 && readOnly && (
                    <span className="text-xs text-muted-foreground">No tags</span>
                )}
            </div>

            {/* Input for adding tags */}
            {!readOnly && (
                <div className="relative">
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <input
                                ref={inputRef}
                                type="text"
                                value={inputValue}
                                onChange={(e) => {
                                    setInputValue(e.target.value);
                                    setIsOpen(true);
                                }}
                                onFocus={() => setIsOpen(true)}
                                onKeyDown={handleKeyDown}
                                placeholder="Add tag..."
                                disabled={loading}
                                className="w-full h-8 px-3 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
                            />
                            {loading && (
                                <Loader2 size={14} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
                            )}
                        </div>
                    </div>

                    {/* Suggestions Dropdown */}
                    {isOpen && inputValue.trim() && (
                        <div className="absolute z-10 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                            {loadingSuggestions ? (
                                <div className="p-2 text-sm text-muted-foreground flex items-center gap-2">
                                    <Loader2 size={14} className="animate-spin" />
                                    Searching...
                                </div>
                            ) : suggestions.length > 0 ? (
                                <>
                                    {suggestions.map((tag) => {
                                        const colorClasses = getTagColorClasses(tag.color);
                                        return (
                                            <button
                                                key={tag.tag_id}
                                                onClick={() => addTag(tag)}
                                                className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center gap-2"
                                            >
                                                <span
                                                    className={`px-2 py-0.5 rounded-full text-xs ${colorClasses.bg} ${colorClasses.text}`}
                                                >
                                                    {tag.name}
                                                </span>
                                                {tag.usage_count !== undefined && (
                                                    <span className="text-xs text-muted-foreground">
                                                        ({tag.usage_count} uses)
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </>
                            ) : (
                                <button
                                    onClick={() => addTag({ name: inputValue.trim() })}
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center gap-2"
                                >
                                    <Plus size={14} />
                                    Create tag "{inputValue.trim()}"
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default TagInput;
