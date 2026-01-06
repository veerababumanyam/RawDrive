/**
 * Collaboration Types for Real-time Gallery Editing
 *
 * Provides type definitions for collaborative gallery editing features including:
 * - Edit sessions and presence tracking
 * - Real-time cursor positions
 * - Conflict resolution
 * - Change notifications
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * Status of an edit session
 */
export enum EditSessionStatus {
  ACTIVE = 'active',
  IDLE = 'idle',
  DISCONNECTED = 'disconnected',
  EXPIRED = 'expired',
}

/**
 * Type of collaborative action being performed
 */
export enum CollaborativeActionType {
  // Asset actions
  ASSET_ADD = 'asset:add',
  ASSET_REMOVE = 'asset:remove',
  ASSET_MOVE = 'asset:move',
  ASSET_REORDER = 'asset:reorder',
  ASSET_UPDATE = 'asset:update',
  ASSET_FAVORITE = 'asset:favorite',
  ASSET_SELECT = 'asset:select',

  // Collection/sub-gallery actions
  COLLECTION_CREATE = 'collection:create',
  COLLECTION_DELETE = 'collection:delete',
  COLLECTION_RENAME = 'collection:rename',
  COLLECTION_REORDER = 'collection:reorder',

  // Gallery metadata actions
  GALLERY_UPDATE = 'gallery:update',
  GALLERY_SETTINGS = 'gallery:settings',

  // AI suggestion actions
  AI_SUGGESTION_APPLY = 'ai:apply',
  AI_SUGGESTION_REJECT = 'ai:reject',
  AI_SUGGESTION_REQUEST = 'ai:request',

  // Cursor/selection actions
  CURSOR_MOVE = 'cursor:move',
  SELECTION_CHANGE = 'selection:change',
}

/**
 * Type of resource lock
 */
export enum LockType {
  EXCLUSIVE = 'exclusive',
  SHARED = 'shared',
}

/**
 * Conflict resolution strategy
 */
export enum ConflictResolutionStrategy {
  LAST_WRITE_WINS = 'last_write_wins',
  FIRST_WRITE_WINS = 'first_write_wins',
  MANUAL = 'manual',
  MERGE = 'merge',
}

/**
 * WebSocket message types for collaboration
 */
export enum CollaborationMessageType {
  // Connection lifecycle
  JOIN_SESSION = 'collab:join',
  LEAVE_SESSION = 'collab:leave',
  SESSION_JOINED = 'collab:session_joined',
  SESSION_LEFT = 'collab:session_left',

  // Presence
  PRESENCE_UPDATE = 'collab:presence',
  CURSOR_UPDATE = 'collab:cursor',
  SELECTION_UPDATE = 'collab:selection',

  // Actions
  ACTION_BROADCAST = 'collab:action',
  ACTION_ACK = 'collab:action_ack',
  ACTION_CONFLICT = 'collab:conflict',

  // Locking
  LOCK_REQUEST = 'collab:lock_request',
  LOCK_ACQUIRED = 'collab:lock_acquired',
  LOCK_RELEASED = 'collab:lock_released',
  LOCK_DENIED = 'collab:lock_denied',

  // Sync
  SYNC_STATE = 'collab:sync_state',
  SYNC_REQUEST = 'collab:sync_request',

  // Notifications
  CHANGE_NOTIFICATION = 'collab:notification',
  TYPING_INDICATOR = 'collab:typing',
}

// ---------------------------------------------------------------------------
// Core Interfaces
// ---------------------------------------------------------------------------

/**
 * Represents a user's presence in a collaborative session
 */
export interface CollaboratorPresence {
  /** User ID */
  user_id: string;
  /** Display name */
  display_name: string;
  /** Avatar URL (optional) */
  avatar_url?: string;
  /** Assigned color for visual identification */
  color: string;
  /** Current session status */
  status: EditSessionStatus;
  /** Current cursor position */
  cursor?: CursorPosition;
  /** Currently selected asset IDs */
  selected_assets: string[];
  /** Currently focused element/area */
  focus_area?: string;
  /** Last activity timestamp */
  last_activity: string;
  /** Session join timestamp */
  joined_at: string;
}

/**
 * Cursor position within the gallery editor
 */
export interface CursorPosition {
  /** X coordinate (normalized 0-1 or pixel position) */
  x: number;
  /** Y coordinate (normalized 0-1 or pixel position) */
  y: number;
  /** Target element ID or area */
  target?: string;
  /** Sub-gallery ID if in a sub-gallery view */
  sub_gallery_id?: string;
  /** Viewport scroll position */
  viewport?: {
    scroll_x: number;
    scroll_y: number;
    zoom: number;
  };
}

/**
 * Represents an edit session for a gallery
 */
export interface EditSession {
  /** Unique session ID */
  session_id: string;
  /** Gallery being edited */
  gallery_id: string;
  /** Workspace ID */
  workspace_id: string;
  /** Active collaborators */
  collaborators: CollaboratorPresence[];
  /** Session creation timestamp */
  created_at: string;
  /** Last activity in session */
  last_activity: string;
  /** Current version/revision number for conflict detection */
  version: number;
}

/**
 * Represents a collaborative action/operation
 */
export interface CollaborativeAction {
  /** Unique action ID */
  action_id: string;
  /** Type of action */
  action_type: CollaborativeActionType;
  /** User who performed the action */
  user_id: string;
  /** Session ID */
  session_id: string;
  /** Gallery ID */
  gallery_id: string;
  /** Action payload/data */
  payload: CollaborativeActionPayload;
  /** Version this action is based on */
  base_version: number;
  /** Timestamp of action */
  timestamp: string;
  /** Whether the action is undoable */
  undoable: boolean;
}

/**
 * Union type for action payloads
 */
export type CollaborativeActionPayload =
  | AssetAddPayload
  | AssetRemovePayload
  | AssetMovePayload
  | AssetReorderPayload
  | AssetUpdatePayload
  | CollectionCreatePayload
  | CollectionDeletePayload
  | CollectionRenamePayload
  | CollectionReorderPayload
  | GalleryUpdatePayload
  | AISuggestionPayload
  | CursorMovePayload
  | SelectionChangePayload;

// ---------------------------------------------------------------------------
// Action Payload Interfaces
// ---------------------------------------------------------------------------

export interface AssetAddPayload {
  asset_ids: string[];
  sub_gallery_id?: string;
  position?: number;
}

export interface AssetRemovePayload {
  asset_ids: string[];
}

export interface AssetMovePayload {
  asset_ids: string[];
  from_sub_gallery_id?: string;
  to_sub_gallery_id?: string;
}

export interface AssetReorderPayload {
  asset_ids: string[];
  sub_gallery_id?: string;
}

export interface AssetUpdatePayload {
  asset_id: string;
  updates: {
    title?: string;
    description?: string;
    tags?: string[];
    is_private?: boolean;
    is_favorited?: boolean;
    is_selected?: boolean;
  };
}

export interface CollectionCreatePayload {
  name: string;
  position?: number;
}

export interface CollectionDeletePayload {
  sub_gallery_id: string;
}

export interface CollectionRenamePayload {
  sub_gallery_id: string;
  name: string;
}

export interface CollectionReorderPayload {
  sub_gallery_ids: string[];
}

export interface GalleryUpdatePayload {
  updates: {
    title?: string;
    description?: string;
    settings?: Record<string, unknown>;
  };
}

export interface AISuggestionPayload {
  suggestion_id: string;
  suggestion_type: string;
  affected_assets?: string[];
  parameters?: Record<string, unknown>;
}

export interface CursorMovePayload {
  position: CursorPosition;
}

export interface SelectionChangePayload {
  asset_ids: string[];
  sub_gallery_id?: string;
}

// ---------------------------------------------------------------------------
// Lock Interfaces
// ---------------------------------------------------------------------------

/**
 * Represents a lock on a resource
 */
export interface ResourceLock {
  /** Lock ID */
  lock_id: string;
  /** Type of resource being locked */
  resource_type: 'gallery' | 'sub_gallery' | 'asset' | 'settings';
  /** Resource ID */
  resource_id: string;
  /** User holding the lock */
  user_id: string;
  /** Lock type */
  lock_type: LockType;
  /** Lock acquired timestamp */
  acquired_at: string;
  /** Lock expiry timestamp */
  expires_at: string;
  /** Optional reason for the lock */
  reason?: string;
}

/**
 * Request to acquire a lock
 */
export interface LockRequest {
  resource_type: 'gallery' | 'sub_gallery' | 'asset' | 'settings';
  resource_id: string;
  lock_type: LockType;
  duration_seconds?: number;
  reason?: string;
}

/**
 * Response to a lock request
 */
export interface LockResponse {
  success: boolean;
  lock?: ResourceLock;
  error?: string;
  holder?: {
    user_id: string;
    display_name: string;
  };
}

// ---------------------------------------------------------------------------
// Conflict Interfaces
// ---------------------------------------------------------------------------

/**
 * Represents a conflict between concurrent edits
 */
export interface EditConflict {
  /** Conflict ID */
  conflict_id: string;
  /** Conflicting actions */
  actions: [CollaborativeAction, CollaborativeAction];
  /** Type of conflict */
  conflict_type: 'concurrent_edit' | 'stale_version' | 'lock_violation';
  /** Affected resource */
  resource_type: string;
  resource_id: string;
  /** Suggested resolution */
  suggested_resolution: ConflictResolutionStrategy;
  /** Resolution options */
  resolution_options?: ConflictResolutionOption[];
  /** Timestamp of conflict detection */
  detected_at: string;
}

/**
 * Option for resolving a conflict
 */
export interface ConflictResolutionOption {
  /** Option ID */
  option_id: string;
  /** Description of the resolution */
  description: string;
  /** Preview of the result */
  preview?: unknown;
  /** Recommended option */
  recommended?: boolean;
}

/**
 * Request to resolve a conflict
 */
export interface ConflictResolutionRequest {
  conflict_id: string;
  resolution_option_id: string;
  /** Custom merge data if using MERGE strategy */
  merge_data?: unknown;
}

// ---------------------------------------------------------------------------
// WebSocket Message Interfaces
// ---------------------------------------------------------------------------

/**
 * Base WebSocket message
 */
export interface CollaborationMessage {
  type: CollaborationMessageType;
  session_id: string;
  timestamp: string;
}

/**
 * Join session request
 */
export interface JoinSessionMessage extends CollaborationMessage {
  type: CollaborationMessageType.JOIN_SESSION;
  gallery_id: string;
  user_id: string;
}

/**
 * Session joined response
 */
export interface SessionJoinedMessage extends CollaborationMessage {
  type: CollaborationMessageType.SESSION_JOINED;
  session: EditSession;
  your_color: string;
}

/**
 * Presence update message
 */
export interface PresenceUpdateMessage extends CollaborationMessage {
  type: CollaborationMessageType.PRESENCE_UPDATE;
  collaborator: CollaboratorPresence;
  event: 'joined' | 'left' | 'updated';
}

/**
 * Cursor update message
 */
export interface CursorUpdateMessage extends CollaborationMessage {
  type: CollaborationMessageType.CURSOR_UPDATE;
  user_id: string;
  cursor: CursorPosition;
}

/**
 * Action broadcast message
 */
export interface ActionBroadcastMessage extends CollaborationMessage {
  type: CollaborationMessageType.ACTION_BROADCAST;
  action: CollaborativeAction;
}

/**
 * Action acknowledgment message
 */
export interface ActionAckMessage extends CollaborationMessage {
  type: CollaborationMessageType.ACTION_ACK;
  action_id: string;
  success: boolean;
  new_version: number;
  error?: string;
}

/**
 * Conflict notification message
 */
export interface ConflictMessage extends CollaborationMessage {
  type: CollaborationMessageType.ACTION_CONFLICT;
  conflict: EditConflict;
}

/**
 * Change notification message
 */
export interface ChangeNotificationMessage extends CollaborationMessage {
  type: CollaborationMessageType.CHANGE_NOTIFICATION;
  user_id: string;
  user_name: string;
  action_type: CollaborativeActionType;
  summary: string;
  affected_items: string[];
}

// ---------------------------------------------------------------------------
// API Request/Response Interfaces
// ---------------------------------------------------------------------------

/**
 * Request to create an edit session
 */
export interface CreateEditSessionRequest {
  gallery_id: string;
}

/**
 * Response from creating an edit session
 */
export interface CreateEditSessionResponse {
  session: EditSession;
  websocket_url: string;
  token: string;
}

/**
 * Request to get session history
 */
export interface GetSessionHistoryRequest {
  session_id: string;
  from_version?: number;
  limit?: number;
}

/**
 * Response with session history
 */
export interface GetSessionHistoryResponse {
  actions: CollaborativeAction[];
  from_version: number;
  to_version: number;
}

/**
 * Request to undo an action
 */
export interface UndoActionRequest {
  action_id: string;
  session_id: string;
}

/**
 * Request to redo an action
 */
export interface RedoActionRequest {
  action_id: string;
  session_id: string;
}

// ---------------------------------------------------------------------------
// AI Suggestion Interfaces (for collaborative AI features)
// ---------------------------------------------------------------------------

/**
 * AI suggestion for gallery organization
 */
export interface AISuggestion {
  /** Suggestion ID */
  suggestion_id: string;
  /** Type of suggestion */
  suggestion_type: 'auto_organize' | 'smart_collection' | 'duplicate_detection' | 'quality_filter' | 'face_grouping';
  /** Description of the suggestion */
  description: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Preview data */
  preview: AISuggestionPreview;
  /** Estimated impact */
  impact: {
    assets_affected: number;
    collections_affected: number;
  };
  /** Actions to apply this suggestion */
  actions: CollaborativeAction[];
  /** Timestamp when suggestion was generated */
  generated_at: string;
  /** Expiry timestamp */
  expires_at: string;
}

/**
 * Preview of an AI suggestion
 */
export interface AISuggestionPreview {
  /** Before state (simplified) */
  before?: {
    collections: { id: string; name: string; asset_count: number }[];
    uncategorized_count: number;
  };
  /** After state (simplified) */
  after?: {
    collections: { id: string; name: string; asset_count: number }[];
    uncategorized_count: number;
  };
  /** Sample asset movements */
  sample_movements?: {
    asset_id: string;
    from_collection?: string;
    to_collection: string;
  }[];
}

/**
 * Request AI suggestions for a gallery
 */
export interface RequestAISuggestionsRequest {
  gallery_id: string;
  suggestion_types?: AISuggestion['suggestion_type'][];
}

/**
 * Response with AI suggestions
 */
export interface RequestAISuggestionsResponse {
  suggestions: AISuggestion[];
  processing_time_ms: number;
}
