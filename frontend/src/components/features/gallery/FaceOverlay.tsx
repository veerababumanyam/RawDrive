
import React, { useState, useRef } from 'react';
import { FaceBox } from './FaceBox';
import { type FaceDetection, type Person } from '../../../services/metadataService';

interface FaceOverlayProps {
    faces: FaceDetection[];
    onTagFace: (faceId: string, personId: string) => Promise<void>;
    onCreateFace: (bbox: { x: number; y: number; width: number; height: number }) => Promise<void>;
    onDeleteFace: (faceId: string) => Promise<void>;
    onUntagFace: (faceId: string) => Promise<void>;
    onCreatePerson: (name: string) => Promise<Person>;
    isDrawingMode?: boolean;
    onDrawingComplete?: () => void;
    imageDimensions?: { width: number; height: number };
}

export const FaceOverlay: React.FC<FaceOverlayProps> = ({
    faces,
    onTagFace,
    onCreateFace,
    onDeleteFace,
    onUntagFace,
    onCreatePerson,
    isDrawingMode = false,
    onDrawingComplete,
}) => {
    const [selectedFaceId, setSelectedFaceId] = useState<string | null>(null);
    const [drawingBox, setDrawingBox] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!isDrawingMode) return;
        if (selectedFaceId) setSelectedFaceId(null);

        // Get coordinates relative to the container (which matches image size)
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        setDrawingBox({
            startX: x,
            startY: y,
            currentX: x,
            currentY: y,
        });

        // Prevent event from bubbling up to Lightbox (which might interpret as drag/pan)
        // e.stopPropagation(); 
        // Note: we might need to be careful here. If we stop propagation, pan might break.
        // The Lightbox implementation puts pan on the wrapper. Usually, we want to PREVENT pan when drawing.
        // We'll rely on `isDrawingMode` prop in Lightbox to disable pan there.
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!drawingBox) return;

        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        setDrawingBox(prev => prev ? { ...prev, currentX: x, currentY: y } : null);
    };

    const handleMouseUp = async () => {
        if (!drawingBox) return;

        // Calculate final box
        const width = Math.abs(drawingBox.currentX - drawingBox.startX);
        const height = Math.abs(drawingBox.currentY - drawingBox.startY);
        const x = Math.min(drawingBox.currentX, drawingBox.startX);
        const y = Math.min(drawingBox.currentY, drawingBox.startY);

        // Only create if box is big enough (e.g. > 20px)
        if (width > 20 && height > 20) {
            await onCreateFace({ x, y, width, height });
        }

        setDrawingBox(null);
        if (onDrawingComplete) onDrawingComplete();
    };

    // Calculate drawing box style
    const getDrawingBoxStyle = () => {
        if (!drawingBox) return {};
        const width = Math.abs(drawingBox.currentX - drawingBox.startX);
        const height = Math.abs(drawingBox.currentY - drawingBox.startY);
        const left = Math.min(drawingBox.currentX, drawingBox.startX);
        const top = Math.min(drawingBox.currentY, drawingBox.startY);

        return {
            position: 'absolute' as const,
            left,
            top,
            width,
            height,
            border: '2px dashed #ffff00',
            backgroundColor: 'rgba(255, 255, 0, 0.1)',
            pointerEvents: 'none' as const, // Don't block mouse events
        };
    };

    return (
        <div
            ref={containerRef}
            className="absolute inset-0 z-10"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => setDrawingBox(null)}
            style={{
                cursor: isDrawingMode ? 'crosshair' : 'default',
                // If not drawing and no box selected, maybe pass through clicks?
                // But we need to catch clicks to deselect.
                // pointerEvents: 'none' would let clicks go to image??
                // Actually we just want this overlay to be transparently sitting on top
            }}
            onClick={(e) => {
                if (selectedFaceId && e.target === containerRef.current) {
                    setSelectedFaceId(null);
                }
            }}
        >
            {faces.map((face) => (
                <FaceBox
                    key={face.face_id}
                    face={face}
                    isSelected={selectedFaceId === face.face_id}
                    onSelect={() => !isDrawingMode && setSelectedFaceId(face.face_id)}
                    onTag={(personId) => onTagFace(face.face_id, personId)}
                    onCreatePerson={onCreatePerson}
                    onUntag={() => onUntagFace(face.face_id)}
                    onDelete={() => onDeleteFace(face.face_id)}
                />
            ))}

            {drawingBox && (
                <div style={getDrawingBoxStyle()} />
            )}
        </div>
    );
};
