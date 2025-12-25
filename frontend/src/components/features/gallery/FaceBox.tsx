
import React, { useState } from 'react';
import { X, User } from 'lucide-react';
import { PersonSelector } from './PersonSelector';
import type { FaceDetection, Person } from '../../../services/metadataService';

interface FaceBoxProps {
    face: FaceDetection;
    imageDimensions?: { width: number; height: number }; // Used if bbox is normalized (0-1), but assuming API returns pixels or we handle normalization
    isSelected?: boolean;
    onSelect: () => void;
    onTag: (personId: string) => Promise<void>;
    onCreatePerson: (name: string) => Promise<Person>;
    onUntag: () => Promise<void>;
    onDelete: () => Promise<void>;
}

export const FaceBox: React.FC<FaceBoxProps> = ({
    face,
    isSelected,
    onSelect,
    onTag,
    onCreatePerson,
    onUntag,
    onDelete,
}) => {
    // Note: Assuming bbox is in pixels relative to the original image dimensions.
    // The rendered image might be scaled, but the container scaling in Lightbox updates the implementation to wrap the image.
    // If we put the overlay INSIDE the transformed wrapper, we can use the original pixel coordinates directly!
    // That's the key architectural decision from the plan.

    // However, we need to handle if bbox is normalized (0-1) or absolute pixels.
    // Looking at backend `reproduce_issue.py` or existing code might clarify, but usually object detection returns either.
    // Let's assume absolute pixels for now as per standard, or check `FaceDetection` type.
    // The type has `x, y, width, height`.

    const [isHovered, setIsHovered] = useState(false);

    const style: React.CSSProperties = {
        position: 'absolute',
        left: face.bbox.x,
        top: face.bbox.y,
        width: face.bbox.width,
        height: face.bbox.height,
        // Using a border that remains visible against any background
        boxShadow: isSelected
            ? '0 0 0 2px #3b82f6, 0 0 0 4px rgba(59, 130, 246, 0.3)'
            : isHovered
                ? '0 0 0 2px rgba(255, 255, 255, 0.8)'
                : '0 0 0 1px rgba(255, 255, 255, 0.4)',
        cursor: 'pointer',
        zIndex: isSelected ? 20 : 10,
    };

    const handleSelectPerson = async (person: Person) => {
        await onTag(person.person_id);
    };

    return (
        <>
            {/* The Bounding Box */}
            <div
                style={style}
                onClick={(e) => {
                    e.stopPropagation();
                    onSelect();
                }}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                className="transition-shadow duration-200"
            >
                {/* Delete button (only show on hover or selected) */}
                {(isHovered || isSelected) && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete();
                        }}
                        className="absolute -top-3 -right-3 w-6 h-6 bg-error rounded-full flex items-center justify-center text-white shadow-sm hover:bg-error/90 z-30 transition-transform hover:scale-110"
                        title="Delete face detection"
                    >
                        <X size={12} />
                    </button>
                )}

                {/* Name Label (if tagged and not editing) */}
                {face.person_name && !isSelected && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-0.5 bg-black/60 text-white text-xs rounded whitespace-nowrap backdrop-blur-sm pointer-events-none">
                        {face.person_name}
                    </div>
                )}
            </div>

            {/* Selection Popover (rendered separately to be on top layer if possible, or usually ok absolutely positioned here if z-index is managed) */}
            {isSelected && (
                <div
                    style={{
                        position: 'absolute',
                        left: face.bbox.x,
                        top: face.bbox.y + face.bbox.height + 8,
                        width: 200,
                        zIndex: 30,
                    }}
                    onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
                >
                    <div className="bg-black/90 border border-white/20 rounded-lg p-3 shadow-2xl backdrop-blur-md">
                        {face.person_name ? (
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                                        <User size={16} className="text-white" />
                                    </div>
                                    <span className="text-white font-medium truncat">{face.person_name}</span>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => onUntag()}
                                        className="flex-1 px-2 py-1 bg-white/10 hover:bg-white/20 text-white text-xs rounded transition-colors"
                                    >
                                        Untag
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                <span className="text-xs text-white/70 font-medium uppercase tracking-wider">Who is this?</span>
                                <PersonSelector
                                    onSelect={handleSelectPerson}
                                    onCreate={onCreatePerson}
                                    autoFocus
                                    onCancel={() => { /* parent handles click outside deselection */ }}
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};
