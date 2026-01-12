import React, { useState } from 'react';
import { Smile, Image as ImageIcon, Sparkles, ChevronDown } from 'lucide-react';
import { AppInput } from '@/components/ui/AppInput';
import { MediaUploader } from '@/components/features/media/MediaUploader';
import { TaglineConfig } from '@/types/invitations';

interface TaglineEditorProps {
    tagline?: TaglineConfig;
    eventType: string;
    workspaceId: string;
    invitationId?: string;
    onChange: (tagline: TaglineConfig) => void;
}

export const TaglineEditor: React.FC<TaglineEditorProps> = ({
    tagline,
    eventType,
    workspaceId,
    invitationId,
    onChange,
}) => {
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);

    // Default state if tagline is undefined
    const currentTagline: TaglineConfig = tagline || {
        text: "You're Invited",
        type: 'emoji',
    };

    const getEventTypeEmoji = (type: string): string => {
        const emojis: Record<string, string> = {
            wedding: '💒',
            birthday: '🎂',
            anniversary: '💑',
            baby_shower: '👶',
            engagement: '💍',
            festival: '🎉',
            corporate: '🏢',
            other: '✨',
        };
        return emojis[type] || '✨';
    };

    const currentEmoji = getEventTypeEmoji(eventType);

    const handleTypeChange = (type: 'emoji' | 'icon' | 'image') => {
        onChange({
            ...currentTagline,
            // If they click Emoji tab, we stay on 'emoji' type. 'icon' is deprecated in UI but kept in type for safety.
            type: type as any,
            value: type === 'emoji' ? undefined : currentTagline.value,
        });
    };

    const handleTextChange = (text: string) => {
        onChange({
            ...currentTagline,
            text,
        });
    };

    const handleEmojiSelect = (emoji: string) => {
        onChange({ ...currentTagline, value: emoji });
        setShowEmojiPicker(false);
    };

    return (
        <div className="space-y-4 p-4 bg-surface-hover/50 rounded-lg border border-border">
            {/* 1. Text Input First */}
            <AppInput
                label="Tagline Text"
                value={currentTagline.text}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder="e.g. You're Invited"
            />

            {/* 2. Type Toggles */}
            <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                    Style
                </label>
                <div className="flex bg-surface rounded-lg p-1 border border-border">
                    <button
                        type="button"
                        onClick={() => handleTypeChange('emoji')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${currentTagline.type === 'emoji' || currentTagline.type === 'icon' // fallback for old data
                            ? 'bg-white shadow-sm text-primary'
                            : 'text-text-secondary hover:text-text-primary'
                            }`}
                    >
                        <Smile className="w-4 h-4" />
                        Emoji
                    </button>
                    <button
                        type="button"
                        onClick={() => handleTypeChange('image')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${currentTagline.type === 'image'
                            ? 'bg-white shadow-sm text-primary'
                            : 'text-text-secondary hover:text-text-primary'
                            }`}
                    >
                        <ImageIcon className="w-4 h-4" />
                        Image
                    </button>
                </div>
            </div>

            {/* 3. Specific Editors */}
            <div className="space-y-4">
                {(currentTagline.type === 'emoji' || currentTagline.type === 'icon') && (
                    <div className="relative">
                        <label className="block text-sm font-medium text-text-primary mb-2">
                            Select Emoji
                        </label>

                        {/* Dropdown Trigger */}
                        <button
                            type="button"
                            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                            className="flex items-center gap-3 px-4 py-3 bg-surface border border-border rounded-lg w-full text-left hover:border-primary/50 transition-colors"
                        >
                            <span className="text-2xl leading-none">
                                {currentTagline.value || currentEmoji}
                            </span>
                            <span className="flex-1 text-sm text-text-secondary">
                                {currentTagline.value ? 'Custom selection' : `Default for ${eventType}`}
                            </span>
                            <ChevronDown className={`w-4 h-4 text-text-tertiary transition-transform ${showEmojiPicker ? 'rotate-180' : ''}`} />
                        </button>

                        {/* Dropdown Content */}
                        {showEmojiPicker && (
                            <div className="absolute top-full left-0 right-0 mt-2 p-3 bg-surface border border-border rounded-xl shadow-xl z-20 animate-in fade-in zoom-in-95 duration-200">
                                <div className="grid grid-cols-8 gap-2">
                                    {[
                                        // Celebration
                                        '🎉', '🎊', '🎀', '🎁', '🎈', '🕯️', '🍰', '🎂', '🥂',
                                        // Love & Wedding
                                        '💒', '💍', '💎', '💌', '💑', '💐', '🌹', '💖', '💘',
                                        // Travel & Fun
                                        '🏖️', '✈️', '🌴', '💃', '🕺', '🎵', '🎼', '🎭', '🎪',
                                        // Premium/Sparkles
                                        '✨', '⭐', '🌟', '💫', '👑', '🎩', '🏛️', '🎬', '📸',
                                        // Objects
                                        '🦁', '🐘', '🦄', '🍎', '🍓', '🍒', '🏀', '⚽', '🎸'
                                    ].map(emoji => (
                                        <button
                                            key={emoji}
                                            type="button"
                                            onClick={() => handleEmojiSelect(emoji)}
                                            className={`
                                                text-xl p-2 rounded-lg transition-all duration-200
                                                hover:bg-primary/10 hover:scale-110 active:scale-95
                                                ${(currentTagline.value || currentEmoji) === emoji
                                                    ? 'bg-primary/20 ring-1 ring-primary/30'
                                                    : 'bg-transparent'
                                                }
                                            `}
                                        >
                                            {emoji}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {currentTagline.type === 'image' && (
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-text-primary">
                            Upload Image/Logo
                        </label>
                        {currentTagline.value ? (
                            <div className="relative w-fit">
                                <img
                                    src={currentTagline.value}
                                    alt="Tagline Logo"
                                    className="h-16 w-auto object-contain rounded border border-border bg-white"
                                />
                                <button
                                    type="button"
                                    onClick={() => onChange({ ...currentTagline, value: undefined })}
                                    className="absolute -top-2 -right-2 bg-error text-white rounded-full p-1 shadow-sm hover:bg-error-hover"
                                >
                                    <Sparkles className="w-3 h-3 rotate-45" />
                                </button>
                            </div>
                        ) : (
                            invitationId ? (
                                <MediaUploader
                                    workspaceId={workspaceId}
                                    invitationId={invitationId}
                                    onUploadComplete={(media) => {
                                        onChange({
                                            ...currentTagline,
                                            value: media.url || media.media_url || media.original_url
                                        });
                                    }}
                                    acceptedTypes={['image/*']}
                                    maxSizeMB={2}
                                />
                            ) : (
                                <div className="p-4 border border-dashed border-border rounded-lg text-center bg-surface">
                                    <p className="text-sm text-text-secondary mb-1">
                                        Save your invitation draft to upload images.
                                    </p>
                                    <p className="text-xs text-text-tertiary">
                                        Continue to the next step to save automatically.
                                    </p>
                                </div>
                            )
                        )}
                        <p className="text-xs text-text-tertiary">
                            Recommended: Transparent PNG or SVG, max height 64px.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
