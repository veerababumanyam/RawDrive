/**
 * Design Studio Collaboration Types
 *
 * Types for real-time multi-user collaborative editing in the Gallery Design Studio.
 * Includes presence indicators, live cursor tracking, and conflict resolution.
 */

import type { CollaboratorPresence, CursorPosition, EditConflict } from '@rawdrive/shared-types';
import type { GalleryDesignConfig } from './gallery-design';

// ---------------------------------------------------------------------------
// Design Section Types
// ---------------------------------------------------------------------------

/**
 * Sections of the Design Studio that can be edited
 */
export type DesignSection = 'cover' | 'typography' | 'theme' | 'grid' | 'layout' | 'branding';

/**
 * Lock status for a design section
 */
export interface DesignSectionLock {
  section: DesignSection;
  lockedByUserId: string;
  lockedByUserName: string;
  lockedByColor: string;
  lockedAt: string;
  lockId: string;
}

// ---------------------------------------------------------------------------
// Cursor and Presence Types
// ---------------------------------------------------------------------------

/**
 * Design Studio specific cursor position
 */
export interface DesignCursorPosition extends CursorPosition {
  /** Active panel (controls or preview) */
  panel: 'controls' | 'preview';
  /** Section being edited */
  section?: DesignSection;
  /** Specific control being hovered/focused */
  control?: string;
  /** Preview element being pointed at */
  previewElement?: string;
}

/**
 * Enhanced collaborator presence for Design Studio
 */
export interface DesignStudioCollaborator extends CollaboratorPresence {
  /** Design-specific cursor */
  designCursor?: DesignCursorPosition;
  /** Currently editing section */
  activeSection?: DesignSection;
  /** Whether user is typing in a field */
  isTyping?: boolean;
  /** Field being typed in */
  typingField?: string;
  /** Current action being performed */
  currentAction?: string;
}

// ---------------------------------------------------------------------------
// Real-time Update Types
// ---------------------------------------------------------------------------

/**
 * Design update message from a collaborator
 */
export interface DesignUpdateMessage {
  type: 'design:update';
  sessionId: string;
  userId: string;
  userName: string;
  userColor: string;
  config: Partial<GalleryDesignConfig>;
  section?: DesignSection;
  timestamp: string;
}

/**
 * Cursor update message
 */
export interface DesignCursorMessage {
  type: 'design:cursor';
  sessionId: string;
  userId: string;
  cursor: DesignCursorPosition;
  timestamp: string;
}

/**
 * Typing indicator message
 */
export interface DesignTypingMessage {
  type: 'design:typing';
  sessionId: string;
  userId: string;
  userName: string;
  isTyping: boolean;
  field?: string;
  section?: DesignSection;
}

/**
 * Section focus change message
 */
export interface DesignFocusMessage {
  type: 'design:focus';
  sessionId: string;
  userId: string;
  userName: string;
  userColor: string;
  section: DesignSection | null;
}

// ---------------------------------------------------------------------------
// Conflict Resolution Types
// ---------------------------------------------------------------------------

/**
 * Design-specific conflict types
 */
export type DesignConflictType =
  | 'concurrent_theme_change'
  | 'concurrent_cover_change'
  | 'concurrent_typography_change'
  | 'concurrent_grid_change'
  | 'stale_publish';

/**
 * Design conflict with resolution options
 */
export interface DesignConflict extends EditConflict {
  section: DesignSection;
  /** Field that was modified (optional) */
  field?: string;
  /** My changes */
  myChange: Partial<GalleryDesignConfig>;
  myValue: Record<string, unknown>;
  myTimestamp: string;
  /** Their changes */
  theirChange: Partial<GalleryDesignConfig>;
  theirValue: Record<string, unknown>;
  theirTimestamp: string;
  theirUserName: string;
  theirUserColor: string;
}

/**
 * Resolution choice for a design conflict
 */
export interface DesignConflictResolution {
  conflictId: string;
  resolution: 'mine' | 'theirs' | 'merge';
  mergedConfig?: Partial<GalleryDesignConfig>;
}

// ---------------------------------------------------------------------------
// Collaboration State Types
// ---------------------------------------------------------------------------

/**
 * Overall collaboration state for Design Studio
 */
export interface DesignStudioCollaborationState {
  /** Whether collaboration is active */
  isCollaborating: boolean;
  /** Connection status */
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  /** Active collaborators in the session */
  collaborators: DesignStudioCollaborator[];
  /** Current user's assigned color */
  myColor: string;
  /** Current user's ID */
  myUserId: string;
  /** Sections currently locked by others */
  lockedSections: Map<DesignSection, DesignSectionLock>;
  /** Sections I have locked */
  myLockedSections: Set<DesignSection>;
  /** Active conflicts */
  conflicts: DesignConflict[];
  /** Recent activity feed */
  activityFeed: DesignActivityItem[];
  /** Session version for conflict detection */
  version: number;
  /** Error message if any */
  error: string | null;
}

/**
 * Activity feed item for collaboration history
 */
export interface DesignActivityItem {
  id: string;
  userId: string;
  userName: string;
  userColor: string;
  action: string;
  section?: DesignSection;
  description: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Collaboration Actions
// ---------------------------------------------------------------------------

/**
 * Actions available for collaboration
 */
export interface DesignStudioCollaborationActions {
  /** Join collaboration session */
  joinSession: () => Promise<void>;
  /** Leave collaboration session */
  leaveSession: () => Promise<void>;
  /** Update cursor position */
  updateCursor: (cursor: DesignCursorPosition) => void;
  /** Lock a section for editing */
  lockSection: (section: DesignSection) => Promise<{ success: boolean; error?: string }>;
  /** Unlock a section */
  unlockSection: (section: DesignSection) => Promise<boolean>;
  /** Broadcast design changes */
  broadcastUpdate: (config: Partial<GalleryDesignConfig>, section?: DesignSection) => void;
  /** Set typing indicator */
  setTyping: (isTyping: boolean, field?: string, section?: DesignSection) => void;
  /** Set focused section */
  setFocusedSection: (section: DesignSection | null) => void;
  /** Resolve a conflict */
  resolveConflict: (resolution: DesignConflictResolution) => Promise<void>;
}

/**
 * Combined hook return type
 */
export interface UseDesignStudioCollaborationReturn
  extends DesignStudioCollaborationState,
          DesignStudioCollaborationActions {
  /** Check if a section is locked by someone else */
  isSectionLockedByOther: (section: DesignSection) => boolean;
  /** Get the user who locked a section */
  getSectionLocker: (section: DesignSection) => DesignSectionLock | undefined;
}

// ---------------------------------------------------------------------------
// WebSocket Message Types
// ---------------------------------------------------------------------------

/**
 * Union of all collaboration message types
 */
export type DesignCollaborationMessage =
  | DesignUpdateMessage
  | DesignCursorMessage
  | DesignTypingMessage
  | DesignFocusMessage
  | DesignPresenceMessage
  | DesignLockMessage
  | DesignConflictMessage;

/**
 * Presence update message
 */
export interface DesignPresenceMessage {
  type: 'design:presence';
  sessionId: string;
  event: 'joined' | 'left' | 'updated';
  collaborator: DesignStudioCollaborator;
}

/**
 * Lock event message
 */
export interface DesignLockMessage {
  type: 'design:lock';
  sessionId: string;
  event: 'acquired' | 'released';
  section: DesignSection;
  userId: string;
  userName: string;
  userColor: string;
  lockId?: string;
}

/**
 * Conflict notification message
 */
export interface DesignConflictMessage {
  type: 'design:conflict';
  sessionId: string;
  conflict: DesignConflict;
}

// ---------------------------------------------------------------------------
// UI Component Props Types
// ---------------------------------------------------------------------------

/**
 * Props for presence indicators
 */
export interface PresenceIndicatorsProps {
  collaborators: DesignStudioCollaborator[];
  myUserId: string;
  maxVisible?: number;
  size?: 'sm' | 'md' | 'lg';
  showStatus?: boolean;
  onClick?: (collaborator: DesignStudioCollaborator) => void;
}

/**
 * Props for live cursor overlay
 */
export interface LiveCursorOverlayProps {
  collaborators: DesignStudioCollaborator[];
  myUserId: string;
  containerRef: React.RefObject<HTMLElement>;
  showNames?: boolean;
  enabled?: boolean;
}

/**
 * Props for section lock indicator
 */
export interface SectionLockIndicatorProps {
  section: DesignSection;
  lock: DesignSectionLock | undefined;
  isMyLock: boolean;
  onRequestLock?: () => void;
  onReleaseLock?: () => void;
}

/**
 * Props for conflict resolution modal
 */
export interface ConflictResolutionModalProps {
  conflict: DesignConflict;
  onResolve: (resolution: 'mine' | 'theirs' | 'merge') => Promise<void>;
  onCancel: () => void;
}

/**
 * Props for collaborators list panel
 */
export interface CollaboratorsListProps {
  collaborators: DesignStudioCollaborator[];
  myUserId: string;
  locks: Map<DesignSection, DesignSectionLock>;
  activityFeed: DesignActivityItem[];
  onUnlockSection?: (section: DesignSection) => void;
  onJumpToCursor?: (userId: string) => void;
}
