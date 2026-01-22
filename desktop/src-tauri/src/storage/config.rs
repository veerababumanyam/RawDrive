//! Configuration storage for RawDrive Desktop Sync.
//! Feature: 029-pro-review-xmp-sync
//! Task: T065
//!
//! Stores application configuration including:
//! - Folder-to-gallery mappings
//! - Sync settings
//! - UI preferences

use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use thiserror::Error;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

const CONFIG_FILE: &str = "config.json";

#[derive(Error, Debug)]
pub enum ConfigError {
    #[error("Failed to find config directory")]
    NoConfigDir,
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    JsonError(#[from] serde_json::Error),
}

/// A folder-to-gallery mapping.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderMapping {
    /// Unique ID for this mapping
    pub id: String,
    /// Local folder path
    pub local_path: String,
    /// Remote gallery ID
    pub gallery_id: String,
    /// Gallery title (cached for display)
    pub gallery_title: String,
    /// Whether sync is enabled for this mapping
    pub enabled: bool,
    /// Sync direction
    pub direction: SyncDirection,
    /// Last sync timestamp
    pub last_sync_at: Option<String>,
    /// Created timestamp
    pub created_at: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum SyncDirection {
    /// Upload local changes to cloud
    LocalToCloud,
    /// Download cloud changes to local
    CloudToLocal,
    /// Bidirectional sync
    Bidirectional,
}

impl Default for SyncDirection {
    fn default() -> Self {
        Self::Bidirectional
    }
}

/// Application settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    /// Start on system login
    pub start_on_login: bool,
    /// Minimize to tray on close
    pub minimize_to_tray: bool,
    /// Show desktop notifications
    pub show_notifications: bool,
    /// Sync interval in seconds (0 = real-time)
    pub sync_interval_seconds: u32,
    /// Max concurrent uploads
    pub max_concurrent_uploads: u8,
    /// Show sync status in menubar (macOS)
    pub show_menubar_status: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            start_on_login: true,
            minimize_to_tray: true,
            show_notifications: true,
            sync_interval_seconds: 0, // Real-time
            max_concurrent_uploads: 3,
            show_menubar_status: true,
        }
    }
}

/// Full application configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    /// Schema version for migrations
    pub version: u32,
    /// Workspace ID from API key
    pub workspace_id: Option<String>,
    /// User ID from API key
    pub user_id: Option<String>,
    /// API key prefix for display (not the full key!)
    pub api_key_prefix: Option<String>,
    /// Folder mappings
    pub mappings: HashMap<String, FolderMapping>,
    /// Application settings
    pub settings: AppSettings,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            version: 1,
            workspace_id: None,
            user_id: None,
            api_key_prefix: None,
            mappings: HashMap::new(),
            settings: AppSettings::default(),
        }
    }
}

/// Configuration storage manager.
pub struct ConfigStore {
    config_path: PathBuf,
    config: AppConfig,
}

impl ConfigStore {
    /// Create a new config store, loading existing config if available.
    pub fn new() -> Result<Self, ConfigError> {
        let config_path = Self::get_config_path()?;
        let config = Self::load_or_default(&config_path);

        Ok(Self { config_path, config })
    }

    /// Get the configuration directory path.
    fn get_config_path() -> Result<PathBuf, ConfigError> {
        let project_dirs = ProjectDirs::from("in", "rawdrive", "RawDrive Sync")
            .ok_or(ConfigError::NoConfigDir)?;

        let config_dir = project_dirs.config_dir();

        // Ensure directory exists
        if !config_dir.exists() {
            fs::create_dir_all(config_dir)?;
            info!("Created config directory: {:?}", config_dir);
        }

        Ok(config_dir.join(CONFIG_FILE))
    }

    /// Load config from disk or return default.
    fn load_or_default(path: &PathBuf) -> AppConfig {
        if path.exists() {
            match fs::read_to_string(path) {
                Ok(contents) => match serde_json::from_str(&contents) {
                    Ok(config) => {
                        debug!("Loaded config from {:?}", path);
                        return config;
                    }
                    Err(e) => {
                        warn!("Failed to parse config, using defaults: {}", e);
                    }
                },
                Err(e) => {
                    warn!("Failed to read config, using defaults: {}", e);
                }
            }
        } else {
            debug!("No config file found, using defaults");
        }
        AppConfig::default()
    }

    /// Save config to disk.
    pub fn save(&self) -> Result<(), ConfigError> {
        let json = serde_json::to_string_pretty(&self.config)?;
        fs::write(&self.config_path, json)?;
        debug!("Config saved to {:?}", self.config_path);
        Ok(())
    }

    /// Get the current config.
    pub fn get(&self) -> &AppConfig {
        &self.config
    }

    /// Get mutable reference to config.
    pub fn get_mut(&mut self) -> &mut AppConfig {
        &mut self.config
    }

    /// Set workspace and user IDs after authentication.
    pub fn set_auth_info(&mut self, workspace_id: String, user_id: String, api_key_prefix: String) -> Result<(), ConfigError> {
        self.config.workspace_id = Some(workspace_id);
        self.config.user_id = Some(user_id);
        self.config.api_key_prefix = Some(api_key_prefix);
        self.save()
    }

    /// Clear auth info on logout.
    pub fn clear_auth_info(&mut self) -> Result<(), ConfigError> {
        self.config.workspace_id = None;
        self.config.user_id = None;
        self.config.api_key_prefix = None;
        self.config.mappings.clear();
        self.save()
    }

    /// Add a new folder mapping.
    pub fn add_mapping(&mut self, mapping: FolderMapping) -> Result<(), ConfigError> {
        self.config.mappings.insert(mapping.id.clone(), mapping);
        self.save()
    }

    /// Update an existing folder mapping.
    pub fn update_mapping(&mut self, mapping: FolderMapping) -> Result<(), ConfigError> {
        if self.config.mappings.contains_key(&mapping.id) {
            self.config.mappings.insert(mapping.id.clone(), mapping);
            self.save()
        } else {
            Err(ConfigError::IoError(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "Mapping not found",
            )))
        }
    }

    /// Remove a folder mapping.
    pub fn remove_mapping(&mut self, mapping_id: &str) -> Result<(), ConfigError> {
        self.config.mappings.remove(mapping_id);
        self.save()
    }

    /// Get all folder mappings.
    pub fn get_mappings(&self) -> Vec<&FolderMapping> {
        self.config.mappings.values().collect()
    }

    /// Get a specific folder mapping.
    pub fn get_mapping(&self, mapping_id: &str) -> Option<&FolderMapping> {
        self.config.mappings.get(mapping_id)
    }

    /// Update application settings.
    pub fn update_settings(&mut self, settings: AppSettings) -> Result<(), ConfigError> {
        self.config.settings = settings;
        self.save()
    }

    /// Check if user is authenticated.
    pub fn is_authenticated(&self) -> bool {
        self.config.workspace_id.is_some()
    }
}

impl FolderMapping {
    /// Create a new folder mapping.
    pub fn new(local_path: String, gallery_id: String, gallery_title: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            local_path,
            gallery_id,
            gallery_title,
            enabled: true,
            direction: SyncDirection::default(),
            last_sync_at: None,
            created_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}
