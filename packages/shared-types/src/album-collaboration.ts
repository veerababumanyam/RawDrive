/**
 * Album Collaboration Types for Real-time Collaborative Album Design
 *
 * Provides type definitions for collaborative album editing features including:
 * - Album and spread management
 * - Real-time CRDT-based collaboration
 * - Version history and rollback
 * - Commenting with @mentions
 * - Template system for album layouts
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * Album status
 */
export enum AlbumStatus {
  DRAFT = 'draft',
  IN_PROGRESS = 'in_progress',
  REVIEW = 'review',
  APPROVED = 'approved',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

/**
 * Album type/category
 */
export enum AlbumType {
  WEDDING = 'wedding',
  PORTRAIT = 'portrait',
  EVENT = 'event',
  FAMILY = 'family',
  NEWBORN = 'newborn',
  CORPORATE = 'corporate',
  CUSTOM = 'custom',
}

/**
 * Spread type within an album
 */
export enum SpreadType {
  COVER = 'cover',
  FULL_SPREAD = 'full_spread',
  SINGLE_PAGE = 'single_page',
  BACK_COVER = 'back_cover',
}

/**
 * Element type on a spread
 */
export enum ElementType {
  PHOTO = 'photo',
  TEXT = 'text',
  SHAPE = 'shape',
  BACKGROUND = 'background',
  FRAME = 'frame',
  EMBELLISHMENT = 'embellishment',
}

/**
 * Album collaboration operation types
 */
export enum AlbumOperationType {
  // Album operations
  ALBUM_UPDATE = 'album:update',
  ALBUM_SETTINGS = 'album:settings',

  // Spread operations
  SPREAD_ADD = 'spread:add',
  SPREAD_REMOVE = 'spread:remove',
  SPREAD_REORDER = 'spread:reorder',
  SPREAD_UPDATE = 'spread:update',
  SPREAD_LAYOUT = 'spread:layout',

  // Element operations
  ELEMENT_ADD = 'element:add',
  ELEMENT_REMOVE = 'element:remove',
  ELEMENT_UPDATE = 'element:update',
  ELEMENT_MOVE = 'element:move',
  ELEMENT_RESIZE = 'element:resize',
  ELEMENT_STYLE = 'element:style',

  // Caption/text operations
  CAPTION_UPDATE = 'caption:update',

  // Cursor/selection (for presence)
  CURSOR_MOVE = 'cursor:move',
  SELECTION_CHANGE = 'selection:change',
}

/**
 * Comment status
 */
export enum CommentStatus {
  OPEN = 'open',
  RESOLVED = 'resolved',
  DELETED = 'deleted',
}

/**
 * Collaboration session status
 */
export enum AlbumCollaborationSessionStatus {
  ACTIVE = 'active',
  IDLE = 'idle',
  CLOSED = 'closed',
}

/**
 * WebSocket message types for album collaboration
 */
export enum AlbumCollaborationMessageType {
  // Session lifecycle
  JOIN_SESSION = 'album:join',
  LEAVE_SESSION = 'album:leave',
  SESSION_JOINED = 'album:session_joined',
  SESSION_LEFT = 'album:session_left',

  // Presence
  PRESENCE_UPDATE = 'album:presence',
  CURSOR_UPDATE = 'album:cursor',
  SELECTION_UPDATE = 'album:selection',

  // Operations
  OPERATION_BROADCAST = 'album:operation',
  OPERATION_ACK = 'album:operation_ack',
  OPERATION_CONFLICT = 'album:conflict',

  // Sync
  SYNC_STATE = 'album:sync_state',
  SYNC_REQUEST = 'album:sync_request',

  // Comments
  COMMENT_ADDED = 'album:comment_added',
  COMMENT_RESOLVED = 'album:comment_resolved',
  COMMENT_MENTION = 'album:comment_mention',

  // Version
  VERSION_CREATED = 'album:version_created',
  VERSION_RESTORED = 'album:version_restored',

  // Lock
  LOCK_ACQUIRED = 'album:lock_acquired',
  LOCK_RELEASED = 'album:lock_released',
}

// ---------------------------------------------------------------------------
// Core Album Interfaces
// ---------------------------------------------------------------------------

/**
 * Album entity
 */
export interface Album {
  id: string;
  workspace_id: string;
  gallery_id?: string;
  name: string;
  description?: string;
  album_type: AlbumType;
  status: AlbumStatus;
  template_id?: string;
  width: number;
  height: number;
  page_count: number;
  cover_image_url?: string;
  settings: AlbumSettings;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/**
 * Album settings configuration
 */
export interface AlbumSettings {
  bleed_margin: number;
  safe_margin: number;
  background_color: string;
  default_font_family: string;
  default_font_size: number;
  auto_save_interval: number;
  show_guides: boolean;
  snap_to_grid: boolean;
  grid_size: number;
}

/**
 * Album spread (page or page pair)
 */
export interface AlbumSpread {
  id: string;
  album_id: string;
  spread_type: SpreadType;
  page_numbers: number[];
  layout_template_id?: string;
  background_color?: string;
  background_image_url?: string;
  elements: AlbumSpreadElement[];
  metadata?: Record<string, unknown>;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * Element on an album spread
 */
export interface AlbumSpreadElement {
  id: string;
  spread_id: string;
  element_type: ElementType;
  asset_id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z_index: number;
  opacity: number;
  content?: ElementContent;
  style?: ElementStyle;
  locked: boolean;
  visible: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Element content based on type
 */
export interface ElementContent {
  // For text elements
  text?: string;
  html?: string;

  // For photo elements
  crop?: CropSettings;
  filters?: ImageFilters;

  // For shape elements
  shape_type?: string;
  path_data?: string;
}

/**
 * Crop settings for photo elements
 */
export interface CropSettings {
  x: number;
  y: number;
  width: number;
  height: number;
  aspect_ratio?: number;
}

/**
 * Image filter settings
 */
export interface ImageFilters {
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: boolean;
  sepia: number;
  blur: number;
}

/**
 * Element styling
 */
export interface ElementStyle {
  // Typography (for text)
  font_family?: string;
  font_size?: number;
  font_weight?: string;
  font_style?: string;
  text_align?: 'left' | 'center' | 'right' | 'justify';
  line_height?: number;
  letter_spacing?: number;
  text_color?: string;

  // Fill & stroke
  fill_color?: string;
  stroke_color?: string;
  stroke_width?: number;

  // Effects
  shadow?: ShadowStyle;
  border?: BorderStyle;
  border_radius?: number;

  // Frame (for photos)
  frame_style?: string;
  frame_color?: string;
  frame_width?: number;
}

/**
 * Shadow styling
 */
export interface ShadowStyle {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
}

/**
 * Border styling
 */
export interface BorderStyle {
  width: number;
  style: 'solid' | 'dashed' | 'dotted';
  color: string;
}

// ---------------------------------------------------------------------------
// Template Interfaces
// ---------------------------------------------------------------------------

/**
 * Album template
 */
export interface AlbumTemplate {
  id: string;
  name: string;
  description?: string;
  album_type: AlbumType;
  preview_url?: string;
  default_width: number;
  default_height: number;
  default_page_count: number;
  spread_templates: SpreadTemplate[];
  default_settings: Partial<AlbumSettings>;
  is_system: boolean;
  is_premium: boolean;
  sort_order: number;
  created_at: string;
}

/**
 * Spread template within an album template
 */
export interface SpreadTemplate {
  id: string;
  name: string;
  spread_type: SpreadType;
  layout: SpreadLayout;
  preview_url?: string;
  is_default: boolean;
}

/**
 * Layout configuration for a spread
 */
export interface SpreadLayout {
  columns: number;
  rows: number;
  gap: number;
  padding: number;
  slots: LayoutSlot[];
}

/**
 * A slot in a spread layout
 */
export interface LayoutSlot {
  id: string;
  element_type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  constraints?: SlotConstraints;
}

/**
 * Constraints for a layout slot
 */
export interface SlotConstraints {
  min_width?: number;
  max_width?: number;
  min_height?: number;
  max_height?: number;
  aspect_ratio?: number;
  allow_resize?: boolean;
  allow_move?: boolean;
}

// ---------------------------------------------------------------------------
// Collaboration Interfaces
// ---------------------------------------------------------------------------

/**
 * Album collaboration session
 */
export interface AlbumCollaborationSession {
  id: string;
  album_id: string;
  workspace_id: string;
  status: AlbumCollaborationSessionStatus;
  participants: AlbumCollaboratorPresence[];
  lamport_clock: number;
  last_operation_at?: string;
  created_at: string;
}

/**
 * Collaborator presence in an album session
 */
export interface AlbumCollaboratorPresence {
  user_id: string;
  display_name: string;
  avatar_url?: string;
  color: string;
  status: 'active' | 'idle' | 'away';
  cursor?: AlbumCursorPosition;
  selected_elements: string[];
  current_spread_id?: string;
  joined_at: string;
  last_activity: string;
}

/**
 * Cursor position in album editor
 */
export interface AlbumCursorPosition {
  spread_id: string;
  x: number;
  y: number;
  element_id?: string;
}

/**
 * CRDT operation for album collaboration
 */
export interface AlbumOperation {
  id: string;
  session_id: string;
  user_id: string;
  operation_type: AlbumOperationType;
  target_id: string;
  target_type: 'album' | 'spread' | 'element';
  data: Record<string, unknown>;
  lamport_timestamp: number;
  vector_clock: Record<string, number>;
  is_undo: boolean;
  parent_operation_id?: string;
  created_at: string;
}

/**
 * Vector clock for causality tracking
 */
export interface VectorClock {
  [userId: string]: number;
}

// ---------------------------------------------------------------------------
// Version History Interfaces
// ---------------------------------------------------------------------------

/**
 * Album version snapshot
 */
export interface AlbumVersion {
  id: string;
  album_id: string;
  version_number: number;
  name?: string;
  description?: string;
  snapshot_data: AlbumSnapshot;
  created_by: string;
  created_by_name: string;
  created_at: string;
}

/**
 * Album snapshot data for version history
 */
export interface AlbumSnapshot {
  album: Partial<Album>;
  spreads: AlbumSpread[];
  metadata?: Record<string, unknown>;
}

/**
 * Version comparison result
 */
export interface VersionComparison {
  from_version: number;
  to_version: number;
  changes: VersionChange[];
  summary: {
    spreads_added: number;
    spreads_removed: number;
    spreads_modified: number;
    elements_added: number;
    elements_removed: number;
    elements_modified: number;
  };
}

/**
 * Individual change in version comparison
 */
export interface VersionChange {
  change_type: 'added' | 'removed' | 'modified';
  target_type: 'album' | 'spread' | 'element';
  target_id: string;
  field?: string;
  old_value?: unknown;
  new_value?: unknown;
}

// ---------------------------------------------------------------------------
// Comment Interfaces
// ---------------------------------------------------------------------------

/**
 * Comment on an album spread or element
 */
export interface AlbumComment {
  id: string;
  album_id: string;
  spread_id?: string;
  element_id?: string;
  parent_comment_id?: string;
  author_id: string;
  author_name: string;
  author_avatar?: string;
  content: string;
  mentioned_users: MentionedUser[];
  status: CommentStatus;
  position?: CommentPosition;
  replies_count: number;
  resolved_by?: string;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
}

/**
 * User mentioned in a comment
 */
export interface MentionedUser {
  id: string;
  name: string;
  email?: string;
}

/**
 * Position of a comment anchor point
 */
export interface CommentPosition {
  x: number;
  y: number;
  spread_page: number;
}

// ---------------------------------------------------------------------------
// API Request/Response Interfaces
// ---------------------------------------------------------------------------

/**
 * Request to create an album
 */
export interface CreateAlbumRequest {
  name: string;
  description?: string;
  album_type: AlbumType;
  gallery_id?: string;
  template_id?: string;
  width?: number;
  height?: number;
  settings?: Partial<AlbumSettings>;
}

/**
 * Request to update an album
 */
export interface UpdateAlbumRequest {
  name?: string;
  description?: string;
  status?: AlbumStatus;
  settings?: Partial<AlbumSettings>;
  cover_image_url?: string;
}

/**
 * Request to create a spread
 */
export interface CreateSpreadRequest {
  spread_type: SpreadType;
  page_numbers: number[];
  layout_template_id?: string;
  background_color?: string;
  background_image_url?: string;
  position?: number;
}

/**
 * Request to update a spread
 */
export interface UpdateSpreadRequest {
  layout_template_id?: string;
  background_color?: string;
  background_image_url?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Request to create an element
 */
export interface CreateElementRequest {
  spread_id: string;
  element_type: ElementType;
  asset_id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  z_index?: number;
  opacity?: number;
  content?: ElementContent;
  style?: ElementStyle;
}

/**
 * Request to update an element
 */
export interface UpdateElementRequest {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  z_index?: number;
  opacity?: number;
  content?: Partial<ElementContent>;
  style?: Partial<ElementStyle>;
  locked?: boolean;
  visible?: boolean;
}

/**
 * Request to create a collaboration session
 */
export interface CreateAlbumSessionRequest {
  album_id: string;
}

/**
 * Response from creating a collaboration session
 */
export interface CreateAlbumSessionResponse {
  session: AlbumCollaborationSession;
  websocket_url: string;
  token: string;
}

/**
 * Request to apply an operation
 */
export interface ApplyOperationRequest {
  operation_type: AlbumOperationType;
  target_id: string;
  target_type: 'album' | 'spread' | 'element';
  data: Record<string, unknown>;
  lamport_timestamp: number;
  vector_clock: VectorClock;
}

/**
 * Response from applying an operation
 */
export interface ApplyOperationResponse {
  success: boolean;
  operation_id?: string;
  new_lamport_timestamp: number;
  conflict?: OperationConflict;
}

/**
 * Operation conflict details
 */
export interface OperationConflict {
  conflicting_operation_id: string;
  conflicting_user_id: string;
  conflicting_user_name: string;
  field: string;
  your_value: unknown;
  their_value: unknown;
  resolved_value: unknown;
  resolution_strategy: 'last_write_wins' | 'merge' | 'manual';
}

/**
 * Request to create a version snapshot
 */
export interface CreateVersionRequest {
  name?: string;
  description?: string;
}

/**
 * Request to rollback to a version
 */
export interface RollbackVersionRequest {
  version_id: string;
}

/**
 * Request to add a comment
 */
export interface CreateCommentRequest {
  spread_id?: string;
  element_id?: string;
  parent_comment_id?: string;
  content: string;
  mentioned_user_ids?: string[];
  position?: CommentPosition;
}

/**
 * Request to resolve a comment
 */
export interface ResolveCommentRequest {
  comment_id: string;
}

// ---------------------------------------------------------------------------
// WebSocket Message Interfaces
// ---------------------------------------------------------------------------

/**
 * Base album collaboration message
 */
export interface AlbumCollaborationMessage {
  type: AlbumCollaborationMessageType;
  session_id: string;
  album_id: string;
  timestamp: string;
}

/**
 * Join session message
 */
export interface JoinAlbumSessionMessage extends AlbumCollaborationMessage {
  type: AlbumCollaborationMessageType.JOIN_SESSION;
  user_id: string;
}

/**
 * Session joined response
 */
export interface AlbumSessionJoinedMessage extends AlbumCollaborationMessage {
  type: AlbumCollaborationMessageType.SESSION_JOINED;
  session: AlbumCollaborationSession;
  your_color: string;
  current_state: AlbumSnapshot;
}

/**
 * Presence update message
 */
export interface AlbumPresenceUpdateMessage extends AlbumCollaborationMessage {
  type: AlbumCollaborationMessageType.PRESENCE_UPDATE;
  collaborator: AlbumCollaboratorPresence;
  event: 'joined' | 'left' | 'updated';
}

/**
 * Cursor update message
 */
export interface AlbumCursorUpdateMessage extends AlbumCollaborationMessage {
  type: AlbumCollaborationMessageType.CURSOR_UPDATE;
  user_id: string;
  cursor: AlbumCursorPosition;
}

/**
 * Operation broadcast message
 */
export interface AlbumOperationBroadcastMessage extends AlbumCollaborationMessage {
  type: AlbumCollaborationMessageType.OPERATION_BROADCAST;
  operation: AlbumOperation;
}

/**
 * Operation acknowledgment message
 */
export interface AlbumOperationAckMessage extends AlbumCollaborationMessage {
  type: AlbumCollaborationMessageType.OPERATION_ACK;
  operation_id: string;
  success: boolean;
  new_lamport_timestamp: number;
  error?: string;
}

/**
 * Comment added message
 */
export interface AlbumCommentAddedMessage extends AlbumCollaborationMessage {
  type: AlbumCollaborationMessageType.COMMENT_ADDED;
  comment: AlbumComment;
}

/**
 * Comment mention notification
 */
export interface AlbumCommentMentionMessage extends AlbumCollaborationMessage {
  type: AlbumCollaborationMessageType.COMMENT_MENTION;
  comment_id: string;
  comment_preview: string;
  mentioned_by: string;
  mentioned_by_name: string;
  spread_id?: string;
}

/**
 * Version created message
 */
export interface AlbumVersionCreatedMessage extends AlbumCollaborationMessage {
  type: AlbumCollaborationMessageType.VERSION_CREATED;
  version: AlbumVersion;
}

/**
 * Version restored message
 */
export interface AlbumVersionRestoredMessage extends AlbumCollaborationMessage {
  type: AlbumCollaborationMessageType.VERSION_RESTORED;
  version_number: number;
  restored_by: string;
  restored_by_name: string;
  new_state: AlbumSnapshot;
}

// ---------------------------------------------------------------------------
// List/Query Interfaces
// ---------------------------------------------------------------------------

/**
 * Query parameters for listing albums
 */
export interface ListAlbumsQuery {
  gallery_id?: string;
  album_type?: AlbumType;
  status?: AlbumStatus;
  search?: string;
  sort_by?: 'name' | 'created_at' | 'updated_at';
  sort_order?: 'asc' | 'desc';
  page?: number;
  page_size?: number;
}

/**
 * Response for listing albums
 */
export interface ListAlbumsResponse {
  albums: Album[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

/**
 * Query parameters for listing versions
 */
export interface ListVersionsQuery {
  page?: number;
  page_size?: number;
}

/**
 * Response for listing versions
 */
export interface ListVersionsResponse {
  versions: AlbumVersion[];
  total: number;
  page: number;
  page_size: number;
}

/**
 * Query parameters for listing comments
 */
export interface ListCommentsQuery {
  spread_id?: string;
  element_id?: string;
  status?: CommentStatus;
  page?: number;
  page_size?: number;
}

/**
 * Response for listing comments
 */
export interface ListCommentsResponse {
  comments: AlbumComment[];
  total: number;
  page: number;
  page_size: number;
}

/**
 * Query parameters for listing templates
 */
export interface ListTemplatesQuery {
  album_type?: AlbumType;
  is_premium?: boolean;
  search?: string;
}

/**
 * Response for listing templates
 */
export interface ListTemplatesResponse {
  templates: AlbumTemplate[];
  total: number;
}
