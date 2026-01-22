//! Tauri commands for RawDrive Desktop Sync.
//! Feature: 029-pro-review-xmp-sync

pub mod auth;
pub mod config;
pub mod sync;

pub use auth::{get_auth_status, login, logout, validate_stored_key};
pub use config::{
    create_mapping, delete_mapping, get_mapping, get_mappings, get_settings, toggle_mapping,
    update_mapping, update_settings,
};
pub use sync::{
    check_network, clear_completed, get_queue_stats, get_sync_status, pause_sync,
    read_xmp_metadata, resume_sync, retry_failed, scan_mapping, start_sync, stop_sync,
    write_xmp_metadata, MappingSyncStatus, NetworkStatus, SyncEngine, SyncStatus,
};
