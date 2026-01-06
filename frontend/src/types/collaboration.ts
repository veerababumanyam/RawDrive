/**
 * Frontend Collaboration Types
 *
 * Re-exports from shared types package and adds frontend-specific types.
 */

// Re-export all collaboration types from shared package
export type {
  // Core types
  CollaboratorPresence,
  CursorPosition,
  EditSession,
  CollaborativeAction,
  CollaborativeActionPayload,

  // Action payloads
  AssetAddPayload,
  AssetRemovePayload,
  AssetMovePayload,
  AssetReorderPayload,
  AssetUpdatePayload,
  CollectionCreatePayload,
  CollectionDeletePayload,
  CollectionRenamePayload,
  CollectionReorderPayload,
  GalleryUpdatePayload,
  AISuggestionPayload,
  CursorMovePayload,
  SelectionChangePayload,

  // Locking
  ResourceLock,
  LockRequest,
  LockResponse,

  // Conflicts
  EditConflict,
  ConflictResolutionOption,
  ConflictResolutionRequest,

  // WebSocket messages
  CollaborationMessage,
  JoinSessionMessage,
  SessionJoinedMessage,
  PresenceUpdateMessage,
  CursorUpdateMessage,
  ActionBroadcastMessage,
  ActionAckMessage,
  ConflictMessage,
  ChangeNotificationMessage,

  // API types
  CreateEditSessionRequest,
  CreateEditSessionResponse,
  GetSessionHistoryRequest,
  GetSessionHistoryResponse,
  UndoActionRequest,
  RedoActionRequest,

  // AI suggestions
  AISuggestion,
  AISuggestionPreview,
  RequestAISuggestionsRequest,
  RequestAISuggestionsResponse,
} from '@rawdrive/shared-types';

// Re-export enums
export {
  EditSessionStatus,
  CollaborativeActionType,
  LockType,
  ConflictResolutionStrategy,
  CollaborationMessageType,
} from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// Frontend-specific Types
// ---------------------------------------------------------------------------

/**
 * Notification item for UI display
 */
export interface CollaborationNotificationItem {
  id: string;
  userName: string;
  action: string;
  summary: string;
  timestamp: Date;
}

/**
 * State for collaborative gallery hook
 */
export interface CollaborativeGalleryState {
  isCollaborative: boolean;
  collaborators: import('@rawdrive/shared-types').CollaboratorPresence[];
  myColor: string;
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  activeLocks: import('@rawdrive/shared-types').ResourceLock[];
  notifications: CollaborationNotificationItem[];
  error: string | null;
}

/**
 * Options for starting a collaborative session
 */
export interface StartCollaborationOptions {
  autoJoin?: boolean;
  showCursors?: boolean;
  showSelections?: boolean;
  enableLocking?: boolean;
}

/**
 * Collaboration event detail for custom events
 */
export interface CollaborationEventDetail {
  action: import('@rawdrive/shared-types').CollaborativeAction;
  newVersion: number;
  galleryId: string;
}
