//! Application state module for RawDrive Desktop.
//! Feature: 029-pro-review-xmp-sync
//!
//! Defines the shared application state accessible across all Tauri commands.

use std::sync::Arc;
use tokio::sync::Mutex;

use crate::commands::SyncEngine;
use crate::services::RawDriveClient;
use crate::storage::{ConfigStore, KeyringStore};

/// Application state shared across all Tauri commands.
pub struct AppState {
    pub keyring: Arc<Mutex<KeyringStore>>,
    pub config: Arc<Mutex<ConfigStore>>,
    pub api_client: Arc<Mutex<RawDriveClient>>,
    pub sync_engine: Arc<Mutex<SyncEngine>>,
}
