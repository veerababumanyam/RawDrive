/**
 * Client CRM Types
 * TypeScript interfaces matching backend client_schemas.py
 */

// ---------------------------------------------------------------------------
// Enums and Literals
// ---------------------------------------------------------------------------

export type ClientStatus = 'active' | 'inactive';
export type ContactType = 'email' | 'phone' | 'website' | 'social_media' | 'other';
export type ContactSubtype = 'work' | 'personal' | 'instagram' | 'whatsapp' | 'facebook' | 'twitter' | 'linkedin' | 'other';
export type AddressType = 'home' | 'work' | 'billing' | 'shipping';
export type GalleryRole = 'primary' | 'secondary' | 'guest';
export type CommunicationType = 'email' | 'phone' | 'whatsapp' | 'sms' | 'in_person' | 'other';
export type CommunicationDirection = 'outbound' | 'inbound';
export type ActivityEntityType = 'gallery' | 'asset' | 'payment' | 'communication' | 'contact' | 'address' | 'tag' | 'note';
export type SmartListFilterType = 'and' | 'or';
export type SmartListOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'not_contains';
export type ExportFormat = 'csv' | 'json';

// ---------------------------------------------------------------------------
// Request Types
// ---------------------------------------------------------------------------

export interface CreateClientRequest {
  full_name: string;
  first_name: string;
  last_name?: string;
  nickname?: string;
  job_title?: string;
  organization?: string;
  language?: string;
  timezone?: string;
  date_of_birth?: string;
  anniversary_date?: string;
  internal_notes?: string;
  referred_by_client_id?: string;
  avatar_asset_id?: string;
  avatar_crop_data?: Record<string, unknown>;
}

export interface UpdateClientRequest {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  nickname?: string;
  job_title?: string;
  organization?: string;
  status?: ClientStatus;
  language?: string;
  timezone?: string;
  date_of_birth?: string;
  anniversary_date?: string;
  internal_notes?: string;
  avatar_asset_id?: string;
  avatar_crop_data?: Record<string, unknown>;
}

export interface AddContactRequest {
  contact_type: ContactType;
  label?: string;
  value: string;
  country_code?: string;
  is_primary?: boolean;
}

export interface UpdateContactRequest {
  value?: string;
  country_code?: string;
  is_primary?: boolean;
}

export interface AddAddressRequest {
  address_type?: AddressType;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  google_map_link?: string;
  is_primary?: boolean;
}

export interface UpdateAddressRequest {
  address_type?: AddressType;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  google_map_link?: string;
  is_primary?: boolean;
}

export interface LinkGalleryRequest {
  gallery_id: string;
  role?: GalleryRole;
}

export interface UpdateGalleryRoleRequest {
  role: GalleryRole;
}

export interface AddTagsRequest {
  tag_ids: string[];
}

export interface LogCommunicationRequest {
  communication_type: CommunicationType;
  direction: CommunicationDirection;
  subject?: string;
  notes?: string;
  duration_minutes?: number;
  follow_up_required?: boolean;
  follow_up_date?: string;
}

export interface DetectDuplicatesRequest {
  email?: string;
  phone?: string;
}

export interface MergeClientsRequest {
  primary_client_id: string;
  duplicate_client_id: string;
}

export interface RecordActivityRequest {
  activity_type: string;
  title: string;
  description?: string;
  related_entity_type?: ActivityEntityType;
  related_entity_id?: string;
  metadata?: Record<string, unknown>;
}

export interface AddNoteRequest {
  note: string;
}

export interface AvatarUploadRequest {
  crop_x?: number;
  crop_y?: number;
  crop_scale?: number;
}

export interface SelectGalleryPhotoRequest {
  asset_id: string;
  crop_x?: number;
  crop_y?: number;
  crop_scale?: number;
}

// ---------------------------------------------------------------------------
// Response Types - Core Entities
// ---------------------------------------------------------------------------

export interface ClientContact {
  contact_id: string;
  contact_type: ContactType;
  label?: string;
  value: string;
  country_code?: string;
  is_primary: boolean;
  is_verified: boolean;
  created_at: string;
  updated_at?: string;
}

export interface ClientAddress {
  address_id: string;
  address_type: AddressType;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  google_map_link?: string;
  is_primary: boolean;
  created_at: string;
}

export interface ClientTag {
  tag_id: string;
  name: string;
  color?: string;
}

export interface ClientGalleryLink {
  link_id: string;
  gallery_id: string;
  gallery_title?: string;
  role: GalleryRole;
  created_at: string;
}

export interface ClientStats {
  linked_galleries_count: number;
  referrals_count: number;
  activities_count: number;
  communications_count: number;
}

// ---------------------------------------------------------------------------
// Response Types - Client
// ---------------------------------------------------------------------------

export interface ClientDetail {
  client_id: string;
  workspace_id: string;
  full_name: string;
  first_name: string;
  last_name?: string;
  nickname?: string;
  initials?: string;
  avatar_url?: string;
  job_title?: string;
  organization?: string;
  status: ClientStatus;
  language?: string;
  timezone?: string;
  date_of_birth?: string;
  age?: number;
  anniversary_date?: string;
  internal_notes?: string;
  referred_by_client_id?: string;
  portal_access_enabled: boolean;
  primary_email?: string;
  primary_country_code?: string;
  primary_phone?: string;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  contacts?: ClientContact[];
  addresses?: ClientAddress[];
  tags?: ClientTag[];
  linked_galleries?: ClientGalleryLink[];
  stats?: ClientStats;
}

export interface ClientListItem {
  client_id: string;
  full_name: string;
  first_name: string;
  last_name?: string;
  initials?: string;
  avatar_url?: string;
  organization?: string;
  status: ClientStatus;
  primary_email?: string;
  primary_country_code?: string;
  primary_phone?: string;
  linked_galleries_count: number;
  tags?: ClientTag[]; // Optional - API may not always include tags in list responses
  created_at: string;
}

export interface ClientListMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface ClientListResponse {
  clients: ClientListItem[];
  meta: ClientListMeta;
}

export interface ClientCreateResponse {
  client_id: string;
  full_name: string;
  status: ClientStatus;
  created_at: string;
}

export interface ClientUpdateResponse {
  client_id: string;
  full_name: string;
  status: ClientStatus;
  updated_at: string;
}

export interface ClientDeleteResponse {
  message: string;
  galleries_unlinked: number;
}

export interface ClientSearchResult {
  client_id: string;
  full_name: string;
  first_name: string;
  last_name?: string;
  avatar_url?: string;
  avatar_asset_id?: string;
  organization?: string;
  primary_email?: string;
  primary_phone?: string;
  status: ClientStatus;
}

// ---------------------------------------------------------------------------
// Response Types - Contact
// ---------------------------------------------------------------------------

export interface ContactCreateResponse {
  contact_id: string;
  contact_type: ContactType;
  value: string;
  country_code?: string;
  is_primary: boolean;
}

// ---------------------------------------------------------------------------
// Response Types - Address
// ---------------------------------------------------------------------------

export interface AddressCreateResponse {
  address_id: string;
  address_type: AddressType;
  google_map_link?: string;
  is_primary: boolean;
  inferred_timezone?: string;
}

// ---------------------------------------------------------------------------
// Response Types - Gallery Link
// ---------------------------------------------------------------------------

export interface GalleryLinkCreateResponse {
  link_id: string;
  gallery_id: string;
  gallery_title?: string;
  role: GalleryRole;
  created_at?: string;
}

export interface GalleryLinkDetail {
  link_id: string;
  gallery_id: string;
  role: GalleryRole;
  link_created_at?: string;
  title?: string;
  description?: string;
  cover_asset_id?: string;
  status?: string;
  gallery_created_at?: string;
  gallery_updated_at?: string;
  asset_count: number;
  picks_count: number;
  favorites_count: number;
}

export interface GalleryLinkedClient {
  link_id: string;
  client_id: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
  avatar_asset_id?: string;
  initials: string;
  status: ClientStatus;
  role: GalleryRole;
  link_created_at?: string;
}

export interface GalleryRoleUpdateResponse {
  link_id: string;
  gallery_id: string;
  gallery_title?: string;
  role: GalleryRole;
  message: string;
}

// ---------------------------------------------------------------------------
// Response Types - Activity
// ---------------------------------------------------------------------------

export interface ClientActivity {
  activity_id: string;
  activity_type: string;
  related_entity_type?: string;
  related_entity_id?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  created_by_user_id?: string;
  created_at: string;
}

export interface ClientActivityListResponse {
  activities: ClientActivity[];
  meta: ClientListMeta;
}

export interface ActivityCreateResponse {
  activity_id: string;
  activity_type: string;
  description?: string;
  related_entity_type?: string;
  related_entity_id?: string;
  metadata?: Record<string, unknown>;
  created_by_user_id?: string;
  created_at: string;
}

export interface ActivitySummary {
  total_activities: number;
  last_activity_at?: string;
  by_type: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Response Types - Communication
// ---------------------------------------------------------------------------

export interface ClientCommunication {
  communication_id: string;
  communication_type: CommunicationType;
  direction: CommunicationDirection;
  subject?: string;
  notes?: string;
  duration_minutes?: number;
  follow_up_required: boolean;
  follow_up_date?: string;
  created_by_user_id: string;
  created_at: string;
}

export interface ClientCommunicationListResponse {
  communications: ClientCommunication[];
  meta: ClientListMeta;
}

export interface CommunicationCreateResponse {
  communication_id: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Response Types - Duplicate Detection
// ---------------------------------------------------------------------------

export interface DuplicateClient {
  client_id: string;
  full_name: string;
  primary_email?: string;
  primary_phone?: string;
  confidence: number;
}

export interface DetectDuplicatesResponse {
  duplicates: DuplicateClient[];
  confidence: number;
}

export interface MergeClientsResponse {
  client_id: string;
  galleries_merged: number;
  activities_merged: number;
}

// ---------------------------------------------------------------------------
// Response Types - Avatar
// ---------------------------------------------------------------------------

export interface AvatarUploadResponse {
  avatar_asset_id: string;
  avatar_url: string;
  thumbnails: Record<string, string>;
}

export interface AvatarSelectResponse {
  avatar_asset_id: string;
  avatar_url: string;
}

export interface AvatarInfo {
  avatar_url?: string;
  initials: string;
  has_avatar: boolean;
}

// ---------------------------------------------------------------------------
// Smart List Types
// ---------------------------------------------------------------------------

export interface SmartListFilterCondition {
  field: string;
  operator: SmartListOperator;
  value?: string | number | boolean;
}

export interface SmartListFilterCriteria {
  type: SmartListFilterType;
  conditions: SmartListFilterCondition[];
}

export interface CreateSmartListRequest {
  name: string;
  description?: string;
  filter_criteria: SmartListFilterCriteria;
}

export interface UpdateSmartListRequest {
  name?: string;
  description?: string;
  filter_criteria?: SmartListFilterCriteria;
}

export interface SmartList {
  list_id: string;
  name: string;
  description?: string;
  filter_criteria: SmartListFilterCriteria;
  is_system: boolean;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface SmartListWithCount extends SmartList {
  client_count: number;
}

export interface SmartListEvaluationResponse {
  clients: ClientListItem[];
  meta: ClientListMeta;
}

// ---------------------------------------------------------------------------
// Import/Export Types
// ---------------------------------------------------------------------------

export interface ExportClientsRequest {
  format?: ExportFormat;
  status?: ClientStatus;
  tags?: string[];
  include_contacts?: boolean;
  include_addresses?: boolean;
  include_tags?: boolean;
}

export interface ExportClientsResponse {
  content: string;
  content_type: string;
  filename: string;
  count: number;
}

export interface ImportErrorDetail {
  row: number;
  field?: string;
  error: string;
  data?: Record<string, unknown>;
}

export interface ImportClientsResponse {
  imported: number;
  updated: number;
  skipped: number;
  errors_count: number;
  errors: ImportErrorDetail[];
  total_rows: number;
}

export interface ImportTemplateResponse {
  content: string;
  content_type: string;
  filename: string;
}

// ---------------------------------------------------------------------------
// Analytics Types
// ---------------------------------------------------------------------------

export interface ClientAnalyticsSummary {
  total_clients: number;
  active_clients: number;
  inactive_clients: number;
  new_clients_period: number;
  growth_rate_percent: number;
  clients_with_galleries: number;
  recently_active: number;
}

export interface MonthlyTrendItem {
  month: string;
  count: number;
}

export interface AnalyticsPeriod {
  start: string;
  end: string;
  days?: number;
}

export interface ClientAnalyticsResponse {
  summary: ClientAnalyticsSummary;
  clients_by_status: Record<string, number>;
  monthly_trend: MonthlyTrendItem[];
  period: AnalyticsPeriod;
}

export interface EngagementSummary {
  total_activities: number;
  total_communications: number;
  avg_communications_per_client: number;
  gallery_links_created: number;
  follow_up_completion_rate: number;
  avg_response_time_hours?: number;
}

export interface EngagementMetricsResponse {
  summary: EngagementSummary;
  activities_by_type: Record<string, number>;
  communications_by_type: Record<string, number>;
  period: AnalyticsPeriod;
}

export interface ReferralSummary {
  total_referred_clients: number;
  referral_rate_percent: number;
  clients_who_refer: number;
  avg_referrals_per_referrer: number;
}

export interface TopReferrer {
  client_id: string;
  full_name: string;
  referral_count: number;
}

export interface ReferralAnalyticsResponse {
  summary: ReferralSummary;
  top_referrers: TopReferrer[];
  monthly_trend: MonthlyTrendItem[];
}

export interface RevenueSummary {
  total_clients: number;
  high_value_clients: number;
  returning_clients: number;
  note?: string;
}

export interface TopClientByGalleries {
  client_id: string;
  full_name: string;
  gallery_count: number;
  first_gallery_date?: string;
}

export interface RevenueAnalyticsResponse {
  summary: RevenueSummary;
  top_clients_by_galleries: TopClientByGalleries[];
  period: AnalyticsPeriod;
}

export interface UpcomingFollowUp {
  communication_id: string;
  client_id: string;
  client_name: string;
  subject?: string;
  follow_up_date?: string;
}

export interface RecentClient {
  client_id: string;
  full_name: string;
  created_at?: string;
}

export interface RecentActivityItem {
  activity_id: string;
  client_id: string;
  client_name: string;
  activity_type: string;
  description?: string;
  created_at?: string;
}

export interface DashboardAnalyticsResponse {
  overview: ClientAnalyticsSummary;
  engagement: EngagementSummary;
  referrals: ReferralSummary;
  upcoming_followups: UpcomingFollowUp[];
  recent_clients: RecentClient[];
  recent_activity: RecentActivityItem[];
  monthly_trend: MonthlyTrendItem[];
  generated_at: string;
}

// ---------------------------------------------------------------------------
// Query Parameters
// ---------------------------------------------------------------------------

export interface ClientListParams {
  page?: number;
  limit?: number;
  status?: ClientStatus;
  search?: string;
  tag_ids?: string[];
  sort_by?: 'full_name' | 'created_at' | 'updated_at';
  sort_order?: 'asc' | 'desc';
}

export interface ActivityListParams {
  page?: number;
  limit?: number;
  activity_type?: string;
}

export interface CommunicationListParams {
  page?: number;
  limit?: number;
  communication_type?: CommunicationType;
  direction?: CommunicationDirection;
}

export interface AnalyticsParams {
  days?: number;
  start_date?: string;
  end_date?: string;
}
