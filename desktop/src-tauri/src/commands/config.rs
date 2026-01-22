//! Configuration Tauri commands.
//! Feature: 029-pro-review-xmp-sync
//! Task: T068
//!
//! Commands for managing folder mappings and app settings.

use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::{debug, info};

use crate::storage::{AppSettings, FolderMapping, SyncDirection};
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct MappingInfo {
    pub id: String,
    pub local_path: String,
    pub gallery_id: String,
    pub gallery_title: String,
    pub enabled: bool,
    pub direction: String,
    pub last_sync_at: Option<String>,
    pub created_at: String,
}

impl From<&FolderMapping> for MappingInfo {
    fn from(m: &FolderMapping) -> Self {
        Self {
            id: m.id.clone(),
            local_path: m.local_path.clone(),
            gallery_id: m.gallery_id.clone(),
            gallery_title: m.gallery_title.clone(),
            enabled: m.enabled,
            direction: match m.direction {
                SyncDirection::LocalToCloud => "local_to_cloud".to_string(),
                SyncDirection::CloudToLocal => "cloud_to_local".to_string(),
                SyncDirection::Bidirectional => "bidirectional".to_string(),
            },
            last_sync_at: m.last_sync_at.clone(),
            created_at: m.created_at.clone(),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateMappingRequest {
    pub local_path: String,
    pub gallery_id: String,
    pub gallery_title: String,
    pub direction: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateMappingRequest {
    pub id: String,
    pub local_path: Option<String>,
    pub gallery_id: Option<String>,
    pub gallery_title: Option<String>,
    pub enabled: Option<bool>,
    pub direction: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SettingsInfo {
    pub start_on_login: bool,
    pub minimize_to_tray: bool,
    pub show_notifications: bool,
    pub sync_interval_seconds: u32,
    pub max_concurrent_uploads: u8,
    pub show_menubar_status: bool,
}

impl From<&AppSettings> for SettingsInfo {
    fn from(s: &AppSettings) -> Self {
        Self {
            start_on_login: s.start_on_login,
            minimize_to_tray: s.minimize_to_tray,
            show_notifications: s.show_notifications,
            sync_interval_seconds: s.sync_interval_seconds,
            max_concurrent_uploads: s.max_concurrent_uploads,
            show_menubar_status: s.show_menubar_status,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct UpdateSettingsRequest {
    pub start_on_login: Option<bool>,
    pub minimize_to_tray: Option<bool>,
    pub show_notifications: Option<bool>,
    pub sync_interval_seconds: Option<u32>,
    pub max_concurrent_uploads: Option<u8>,
    pub show_menubar_status: Option<bool>,
}

// =============================================================================
// Folder Mapping Commands
// =============================================================================

/// Get all folder mappings.
#[tauri::command]
pub async fn get_mappings(state: State<'_, AppState>) -> Result<Vec<MappingInfo>, String> {
    debug!("Getting all folder mappings");

    let config = state.config.lock().await;
    let mappings: Vec<MappingInfo> = config.get_mappings().iter().map(|m| (*m).into()).collect();

    Ok(mappings)
}

/// Get a specific folder mapping.
#[tauri::command]
pub async fn get_mapping(id: String, state: State<'_, AppState>) -> Result<Option<MappingInfo>, String> {
    debug!("Getting folder mapping: {}", id);

    let config = state.config.lock().await;
    let mapping = config.get_mapping(&id).map(|m| m.into());

    Ok(mapping)
}

/// Create a new folder mapping.
#[tauri::command]
pub async fn create_mapping(
    request: CreateMappingRequest,
    state: State<'_, AppState>,
) -> Result<MappingInfo, String> {
    info!("Creating folder mapping: {} -> {}", request.local_path, request.gallery_id);

    let direction = match request.direction.as_deref() {
        Some("local_to_cloud") => SyncDirection::LocalToCloud,
        Some("cloud_to_local") => SyncDirection::CloudToLocal,
        _ => SyncDirection::Bidirectional,
    };

    let mut mapping = FolderMapping::new(
        request.local_path,
        request.gallery_id,
        request.gallery_title,
    );
    mapping.direction = direction;

    let result: MappingInfo = (&mapping).into();

    let mut config = state.config.lock().await;
    config
        .add_mapping(mapping)
        .map_err(|e| format!("Failed to save mapping: {}", e))?;

    Ok(result)
}

/// Update an existing folder mapping.
#[tauri::command]
pub async fn update_mapping(
    request: UpdateMappingRequest,
    state: State<'_, AppState>,
) -> Result<MappingInfo, String> {
    info!("Updating folder mapping: {}", request.id);

    let mut config = state.config.lock().await;

    // Get existing mapping
    let existing = config
        .get_mapping(&request.id)
        .ok_or_else(|| "Mapping not found".to_string())?
        .clone();

    // Apply updates
    let mut updated = existing;

    if let Some(local_path) = request.local_path {
        updated.local_path = local_path;
    }
    if let Some(gallery_id) = request.gallery_id {
        updated.gallery_id = gallery_id;
    }
    if let Some(gallery_title) = request.gallery_title {
        updated.gallery_title = gallery_title;
    }
    if let Some(enabled) = request.enabled {
        updated.enabled = enabled;
    }
    if let Some(direction) = request.direction {
        updated.direction = match direction.as_str() {
            "local_to_cloud" => SyncDirection::LocalToCloud,
            "cloud_to_local" => SyncDirection::CloudToLocal,
            _ => SyncDirection::Bidirectional,
        };
    }

    let result: MappingInfo = (&updated).into();

    config
        .update_mapping(updated)
        .map_err(|e| format!("Failed to update mapping: {}", e))?;

    Ok(result)
}

/// Delete a folder mapping.
#[tauri::command]
pub async fn delete_mapping(id: String, state: State<'_, AppState>) -> Result<(), String> {
    info!("Deleting folder mapping: {}", id);

    let mut config = state.config.lock().await;
    config
        .remove_mapping(&id)
        .map_err(|e| format!("Failed to delete mapping: {}", e))?;

    Ok(())
}

/// Toggle a mapping's enabled state.
#[tauri::command]
pub async fn toggle_mapping(id: String, state: State<'_, AppState>) -> Result<MappingInfo, String> {
    debug!("Toggling folder mapping: {}", id);

    let mut config = state.config.lock().await;

    let existing = config
        .get_mapping(&id)
        .ok_or_else(|| "Mapping not found".to_string())?
        .clone();

    let mut updated = existing;
    updated.enabled = !updated.enabled;

    let result: MappingInfo = (&updated).into();

    config
        .update_mapping(updated)
        .map_err(|e| format!("Failed to toggle mapping: {}", e))?;

    Ok(result)
}

// =============================================================================
// Settings Commands
// =============================================================================

/// Get application settings.
#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<SettingsInfo, String> {
    debug!("Getting app settings");

    let config = state.config.lock().await;
    let settings: SettingsInfo = (&config.get().settings).into();

    Ok(settings)
}

/// Update application settings.
#[tauri::command]
pub async fn update_settings(
    request: UpdateSettingsRequest,
    state: State<'_, AppState>,
) -> Result<SettingsInfo, String> {
    info!("Updating app settings");

    let mut config = state.config.lock().await;
    let mut settings = config.get().settings.clone();

    // Apply updates
    if let Some(v) = request.start_on_login {
        settings.start_on_login = v;
    }
    if let Some(v) = request.minimize_to_tray {
        settings.minimize_to_tray = v;
    }
    if let Some(v) = request.show_notifications {
        settings.show_notifications = v;
    }
    if let Some(v) = request.sync_interval_seconds {
        settings.sync_interval_seconds = v;
    }
    if let Some(v) = request.max_concurrent_uploads {
        settings.max_concurrent_uploads = v;
    }
    if let Some(v) = request.show_menubar_status {
        settings.show_menubar_status = v;
    }

    let result: SettingsInfo = (&settings).into();

    config
        .update_settings(settings)
        .map_err(|e| format!("Failed to update settings: {}", e))?;

    Ok(result)
}
