//! RawDrive Desktop Sync Application
//! Feature: 029-pro-review-xmp-sync
//!
//! Main entry point for the Tauri desktop application.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

// Use the library crate
use rawdrive_sync::commands::SyncEngine;
use rawdrive_sync::services::RawDriveClient;
use rawdrive_sync::storage::{ConfigStore, KeyringStore};
use rawdrive_sync::AppState;

fn main() {
    // Initialize logging
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::DEBUG)
        .with_target(true)
        .with_thread_ids(true)
        .with_file(true)
        .with_line_number(true)
        .finish();

    tracing::subscriber::set_global_default(subscriber)
        .expect("Failed to set tracing subscriber");

    info!("Starting RawDrive Desktop Sync");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            info!("Setting up application state");

            // Initialize keyring store
            let keyring = KeyringStore::new()
                .map_err(|e| format!("Failed to initialize keyring: {}", e))?;

            // Initialize config store
            let config = ConfigStore::new()
                .map_err(|e| format!("Failed to initialize config: {}", e))?;

            // Initialize API client
            let mut api_client = RawDriveClient::new();

            // Restore API key if available
            if let Ok(api_key) = keyring.get_api_key() {
                info!("Restored API key from keyring");
                api_client.set_api_key(&api_key);
            }

            // Initialize sync engine
            let sync_engine = SyncEngine::new();

            // Create app state
            let state = AppState {
                keyring: Arc::new(Mutex::new(keyring)),
                config: Arc::new(Mutex::new(config)),
                api_client: Arc::new(Mutex::new(api_client)),
                sync_engine: Arc::new(Mutex::new(sync_engine)),
            };

            app.manage(state);

            info!("Application setup complete");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Auth commands - use full path to where #[tauri::command] is defined
            rawdrive_sync::commands::auth::login,
            rawdrive_sync::commands::auth::logout,
            rawdrive_sync::commands::auth::get_auth_status,
            rawdrive_sync::commands::auth::validate_stored_key,
            // Config commands
            rawdrive_sync::commands::config::get_mappings,
            rawdrive_sync::commands::config::get_mapping,
            rawdrive_sync::commands::config::create_mapping,
            rawdrive_sync::commands::config::update_mapping,
            rawdrive_sync::commands::config::delete_mapping,
            rawdrive_sync::commands::config::toggle_mapping,
            rawdrive_sync::commands::config::get_settings,
            rawdrive_sync::commands::config::update_settings,
            // Sync commands
            rawdrive_sync::commands::sync::start_sync,
            rawdrive_sync::commands::sync::stop_sync,
            rawdrive_sync::commands::sync::pause_sync,
            rawdrive_sync::commands::sync::resume_sync,
            rawdrive_sync::commands::sync::get_sync_status,
            rawdrive_sync::commands::sync::get_queue_stats,
            rawdrive_sync::commands::sync::scan_mapping,
            rawdrive_sync::commands::sync::retry_failed,
            rawdrive_sync::commands::sync::clear_completed,
            rawdrive_sync::commands::sync::check_network,
            rawdrive_sync::commands::sync::read_xmp_metadata,
            rawdrive_sync::commands::sync::write_xmp_metadata,
        ])
        .run(tauri::generate_context!())
        .expect("Error while running RawDrive Desktop");
}
