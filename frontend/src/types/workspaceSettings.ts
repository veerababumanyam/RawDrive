/**
 * Workspace Settings Types
 */

export enum AIProvider {
    GEMINI = 'gemini',
    OPENAI = 'openai',
    ANTHROPIC = 'anthropic',
}

export enum AIStatus {
    NOT_CONFIGURED = 'not_configured',
    CONNECTED = 'connected',
    VALIDATION_FAILED = 'validation_failed',
}

export enum DeletionReason {
    NO_LONGER_NEEDED = 'no_longer_needed',
    SWITCHING_SERVICE = 'switching_service',
    TOO_EXPENSIVE = 'too_expensive',
    MISSING_FEATURES = 'missing_features',
    OTHER = 'other',
}

// AI Settings
export interface WorkspaceAISettings {
    workspace_id: string;
    provider: AIProvider;
    selected_model?: string;
    selected_model_id?: string;
    status: AIStatus;
    credits_used: number;
    last_validated_at?: string; // ISO date
    validation_error?: string;
    created_at: string; // ISO date
    updated_at: string; // ISO date
    has_api_key: boolean;
    api_key_masked?: string; // Optional (frontend convenience if we add it to backend response)
}

export interface UpdateWorkspaceAISettingsRequest {
    provider?: AIProvider;
    api_key?: string;
    selected_model?: string;
    selected_model_id?: string;
}

// Security Settings
export interface WorkspaceSecuritySettings {
    workspace_id: string;
    require_2fa: boolean;
    password_policy?: PasswordPolicy;
    session_timeout_minutes: number;
    max_active_sessions?: number;
    ip_whitelist?: string[];
    created_at: string;
    updated_at: string;
}

export interface PasswordPolicy {
    min_length?: number;
    require_special?: boolean;
    require_numbers?: boolean;
}

export interface UpdateWorkspaceSecuritySettingsRequest {
    require_2fa?: boolean;
    password_policy?: PasswordPolicy;
    session_timeout_minutes?: number;
    max_active_sessions?: number;
    ip_whitelist?: string[];
}

// Notification Settings
export interface WorkspaceNotificationSettings {
    workspace_id: string;
    default_email_preferences?: Record<string, boolean>;
    default_in_app_preferences?: Record<string, boolean>;
    notification_channels?: Record<string, any>;
    created_at: string;
    updated_at: string;
}

export interface UpdateWorkspaceNotificationSettingsRequest {
    default_email_preferences?: Record<string, boolean>;
    default_in_app_preferences?: Record<string, boolean>;
    notification_channels?: Record<string, any>;
}

// Privacy Settings
export interface WorkspacePrivacySettings {
    workspace_id: string;
    analytics_enabled: boolean;
    public_profile_enabled: boolean;
    data_retention_days?: number;
    gdpr_compliance_mode: boolean;
    search_engine_indexing_enabled: boolean;
    created_at: string;
    updated_at: string;
}

export interface UpdateWorkspacePrivacySettingsRequest {
    analytics_enabled?: boolean;
    public_profile_enabled?: boolean;
    data_retention_days?: number;
    gdpr_compliance_mode?: boolean;
    search_engine_indexing_enabled?: boolean;
}

// Deletion Request
export interface WorkspaceDeletionRequest {
    reason: DeletionReason;
    reason_details?: string;
    confirmation_phrase: string;
}
