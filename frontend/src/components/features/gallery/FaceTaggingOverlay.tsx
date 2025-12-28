/**
 * FaceTaggingOverlay Component
 * Displays detected face bounding boxes on a photo with click-to-name functionality
 */

import React, { useState, useCallback } from 'react';
import { User, UserPlus, Check, X, Loader2 } from 'lucide-react';
import { Face, FaceGroup, faceApiService } from '../../../services/faceApiService';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../ui/Toast';

interface FaceTaggingOverlayProps {
  faces: Face[];
  people: FaceGroup[];
  photoWidth: number;
  photoHeight: number;
  containerWidth: number;
  containerHeight: number;
  onFaceNamed?: (faceId: string, personId: string, personName: string) => void;
  onRefresh?: () => void;
  showLabels?: boolean;
  interactive?: boolean;
}

export const FaceTaggingOverlay: React.FC<FaceTaggingOverlayProps> = ({
  faces,
  people,
  photoWidth,
  photoHeight,
  containerWidth,
  containerHeight,
  onFaceNamed,
  onRefresh,
  showLabels = true,
  interactive = true,
}) => {
  const { workspace } = useAuth();
  const { addToast } = useToast();

  const [activeFaceId, setActiveFaceId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isNaming, setIsNaming] = useState(false);
  const [showPeopleDropdown, setShowPeopleDropdown] = useState(false);

  // Calculate scale factor to map face coordinates to container
  const scaleX = containerWidth / photoWidth;
  const scaleY = containerHeight / photoHeight;

  // Get person name for a face
  const getPersonName = useCallback(
    (face: Face): string | null => {
      if (!face.face_group_id) return null;
      const group = people.find((p) => p.id === face.face_group_id);
      return group?.person_name || group?.name || null;
    },
    [people]
  );

  // Handle face click
  const handleFaceClick = (faceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!interactive) return;

    if (activeFaceId === faceId) {
      setActiveFaceId(null);
      setShowPeopleDropdown(false);
    } else {
      setActiveFaceId(faceId);
      setShowPeopleDropdown(true);
      setEditingName('');
    }
  };

  // Handle assigning to existing person
  const handleAssignToPerson = async (faceId: string, groupId: string) => {
    if (!workspace?.workspace_id) return;

    setIsNaming(true);
    try {
      await faceApiService.assignFaceToGroup(workspace.workspace_id, faceId, groupId);
      const group = people.find((p) => p.id === groupId);
      addToast({ message: `Face assigned to ${group?.person_name || group?.name || 'person'}`, variant: 'success' });
      onFaceNamed?.(faceId, groupId, group?.person_name || group?.name || '');
      onRefresh?.();
      setActiveFaceId(null);
      setShowPeopleDropdown(false);
    } catch (err) {
      addToast({ message: 'Failed to assign face', variant: 'error' });
    } finally {
      setIsNaming(false);
    }
  };

  // Handle naming a new person
  const handleNameNewPerson = async (faceId: string) => {
    if (!workspace?.workspace_id || !editingName.trim()) return;

    const face = faces.find((f) => f.id === faceId);
    if (!face) return;

    setIsNaming(true);
    try {
      // If face already has a group, name that group
      // Otherwise, create a new group and assign face to it
      let groupId = face.face_group_id;

      if (!groupId) {
        // Create new group
        const newGroup = await faceApiService.createFaceGroup(workspace.workspace_id, {
          name: editingName.trim(),
        });
        groupId = newGroup.id;
        // Assign face to new group
        await faceApiService.assignFaceToGroup(workspace.workspace_id, faceId, groupId);
      } else {
        // Name existing group
        await faceApiService.namePerson(workspace.workspace_id, groupId, editingName.trim());
      }

      addToast({ message: `Named as ${editingName.trim()}`, variant: 'success' });
      onFaceNamed?.(faceId, groupId, editingName.trim());
      onRefresh?.();
      setActiveFaceId(null);
      setEditingName('');
      setShowPeopleDropdown(false);
    } catch (err) {
      addToast({ message: 'Failed to name person', variant: 'error' });
    } finally {
      setIsNaming(false);
    }
  };

  // Close dropdown when clicking outside
  const handleOverlayClick = () => {
    setActiveFaceId(null);
    setShowPeopleDropdown(false);
  };

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      onClick={handleOverlayClick}
    >
      {faces.map((face) => {
        const { bounding_box } = face;
        const personName = getPersonName(face);
        const isActive = activeFaceId === face.id;

        // Scale bounding box to container coordinates
        const left = bounding_box.x * scaleX;
        const top = bounding_box.y * scaleY;
        const width = bounding_box.width * scaleX;
        const height = bounding_box.height * scaleY;

        return (
          <div
            key={face.id}
            className="absolute pointer-events-auto"
            style={{
              left: `${left}px`,
              top: `${top}px`,
              width: `${width}px`,
              height: `${height}px`,
            }}
          >
            {/* Face bounding box */}
            <div
              className={`absolute inset-0 border-2 rounded transition-all cursor-pointer ${
                isActive
                  ? 'border-primary bg-primary/20'
                  : personName
                  ? 'border-accent/70 hover:border-accent'
                  : 'border-white/70 hover:border-white'
              }`}
              onClick={(e) => handleFaceClick(face.id, e)}
            />

            {/* Name label (below face box) */}
            {showLabels && personName && !isActive && (
              <div
                className="absolute left-1/2 -translate-x-1/2 mt-1 px-2 py-0.5 bg-black/75 text-white text-xs rounded whitespace-nowrap max-w-[150px] truncate"
                style={{ top: `${height}px` }}
              >
                {personName}
              </div>
            )}

            {/* Unnamed indicator */}
            {showLabels && !personName && !isActive && interactive && (
              <div
                className="absolute left-1/2 -translate-x-1/2 mt-1 flex items-center gap-1 px-2 py-0.5 bg-black/75 text-white/80 text-xs rounded cursor-pointer hover:text-white"
                style={{ top: `${height}px` }}
                onClick={(e) => handleFaceClick(face.id, e)}
              >
                <UserPlus className="w-3 h-3" />
                <span>Name</span>
              </div>
            )}

            {/* Active face popup */}
            {isActive && showPeopleDropdown && (
              <div
                className="absolute left-1/2 -translate-x-1/2 z-50 mt-2 w-56 bg-surface rounded-lg shadow-xl border border-border overflow-hidden"
                style={{ top: `${height}px` }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Name input */}
                <div className="p-2 border-b border-border">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && editingName.trim()) {
                          handleNameNewPerson(face.id);
                        }
                        if (e.key === 'Escape') {
                          setActiveFaceId(null);
                          setShowPeopleDropdown(false);
                        }
                      }}
                      placeholder="Enter name..."
                      className="flex-1 px-2 py-1.5 text-sm bg-surface-hover border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary/50"
                      autoFocus
                      disabled={isNaming}
                    />
                    {editingName.trim() && (
                      <button
                        onClick={() => handleNameNewPerson(face.id)}
                        disabled={isNaming}
                        className="p-1.5 rounded bg-primary text-white hover:bg-primary-hover disabled:opacity-50"
                      >
                        {isNaming ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setActiveFaceId(null);
                        setShowPeopleDropdown(false);
                      }}
                      className="p-1.5 rounded text-text-tertiary hover:text-text-primary hover:bg-surface-hover"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Existing people list */}
                {people.length > 0 && (
                  <div className="max-h-48 overflow-y-auto">
                    <div className="px-2 py-1 text-xs text-text-tertiary uppercase tracking-wider">
                      Or select existing
                    </div>
                    {people
                      .filter((p) => p.person_name || p.name)
                      .slice(0, 10)
                      .map((person) => (
                        <button
                          key={person.id}
                          onClick={() => handleAssignToPerson(face.id, person.id)}
                          disabled={isNaming}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-surface-hover disabled:opacity-50"
                        >
                          {person.representative_thumbnail_url ? (
                            <img
                              src={person.representative_thumbnail_url}
                              alt=""
                              className="w-6 h-6 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-surface-hover flex items-center justify-center">
                              <User className="w-3 h-3 text-text-tertiary" />
                            </div>
                          )}
                          <span className="truncate">
                            {person.person_name || person.name}
                          </span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default FaceTaggingOverlay;
