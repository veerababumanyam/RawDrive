//! Sync commands for RawDrive Desktop.
//! Feature: 029-pro-review-xmp-sync
//! Task: T082
//!
//! Tauri commands for controlling file synchronization.

use crate::services::{
    file_watcher::{FileWatcher, WatcherConfig},
    sync_queue::{QueueStats, SyncItem, SyncQueue},
    xmp_handler::{self, XmpMetadata},
};
use crate::AppState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::State;
use tokio::sync::mpsc;
use tracing::{debug, error, info};

/// Sync status for a mapping.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MappingSyncStatus {
    pub mapping_id: String,
    pub local_path: String,
    pub gallery_id: String,
    pub gallery_title: String,
    pub is_syncing: bool,
    pub is_paused: bool,
    pub files_pending: usize,
    pub files_uploading: usize,
    pub files_completed: usize,
    pub files_failed: usize,
    pub current_file: Option<String>,
    pub progress_percent: f64,
    pub last_sync: Option<String>,
    pub last_error: Option<String>,
}

/// Overall sync status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatus {
    pub is_running: bool,
    pub is_paused: bool,
    pub total_pending: usize,
    pub total_uploading: usize,
    pub total_completed: usize,
    pub total_failed: usize,
    pub total_bytes: u64,
    pub bytes_transferred: u64,
    pub overall_progress: f64,
    pub mappings: Vec<MappingSyncStatus>,
    pub network_status: NetworkStatus,
}

/// Network connectivity status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NetworkStatus {
    Connected,
    Disconnected,
    Reconnecting,
}

/// Sync engine state (stored in AppState).
pub struct SyncEngine {
    pub file_watcher: Option<FileWatcher>,
    pub sync_queue: SyncQueue,
    pub is_running: bool,
    pub is_paused: bool,
    pub network_status: NetworkStatus,
    pub mapping_status: HashMap<String, MappingSyncStatus>,
    shutdown_tx: Option<mpsc::Sender<()>>,
}

impl SyncEngine {
    pub fn new() -> Self {
        Self {
            file_watcher: None,
            sync_queue: SyncQueue::new(Some(3)),
            is_running: false,
            is_paused: false,
            network_status: NetworkStatus::Connected,
            mapping_status: HashMap::new(),
            shutdown_tx: None,
        }
    }
}

impl Default for SyncEngine {
    fn default() -> Self {
        Self::new()
    }
}

/// Start syncing all enabled mappings.
#[tauri::command]
pub async fn start_sync(state: State<'_, AppState>) -> Result<SyncStatus, String> {
    info!("Starting sync engine");

    // Get enabled mappings
    let mappings: Vec<_> = {
        let config = state.config.lock().await;
        config
            .get_mappings()
            .into_iter()
            .filter(|m| m.enabled)
            .cloned()
            .collect()
    };

    if mappings.is_empty() {
        return Err("No enabled mappings to sync".to_string());
    }

    // Initialize sync engine
    let mut sync_engine = state.sync_engine.lock().await;

    if sync_engine.is_running {
        return Err("Sync is already running".to_string());
    }

    // Create file watcher
    let watcher_config = WatcherConfig::default();
    let (file_watcher, mut change_rx) = FileWatcher::new(watcher_config);

    // Watch all enabled mapping folders
    for mapping in &mappings {
        let path = PathBuf::from(&mapping.local_path);
        if let Err(e) = file_watcher
            .watch_folder(&path, mapping.id.clone())
            .await
        {
            error!("Failed to watch folder {}: {}", mapping.local_path, e);
        } else {
            // Initialize mapping status
            sync_engine.mapping_status.insert(
                mapping.id.clone(),
                MappingSyncStatus {
                    mapping_id: mapping.id.clone(),
                    local_path: mapping.local_path.clone(),
                    gallery_id: mapping.gallery_id.clone(),
                    gallery_title: mapping.gallery_title.clone(),
                    is_syncing: true,
                    is_paused: false,
                    files_pending: 0,
                    files_uploading: 0,
                    files_completed: 0,
                    files_failed: 0,
                    current_file: None,
                    progress_percent: 0.0,
                    last_sync: None,
                    last_error: None,
                },
            );
        }
    }

    sync_engine.file_watcher = Some(file_watcher);
    sync_engine.is_running = true;
    sync_engine.is_paused = false;

    // Create shutdown channel
    let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);
    sync_engine.shutdown_tx = Some(shutdown_tx);

    // Spawn file change processor
    let sync_queue = sync_engine.sync_queue.clone();
    let api_client = state.api_client.clone();
    let config_store = state.config.clone();

    tokio::spawn(async move {
        loop {
            tokio::select! {
                Some(change) = change_rx.recv() => {
                    debug!("File change detected: {:?}", change.path);

                    // Get mapping details
                    let mapping = {
                        let config = config_store.lock().await;
                        config.get_mapping(&change.mapping_id).cloned()
                    };

                    if let Some(mapping) = mapping {
                        // Create sync item based on change type
                        let file_size = std::fs::metadata(&change.path)
                            .map(|m| m.len())
                            .unwrap_or(0);

                        let item = if change.is_xmp {
                            SyncItem::metadata_update(
                                mapping.id.clone(),
                                change.path.clone(),
                                mapping.gallery_id.clone(),
                            )
                        } else {
                            SyncItem::upload(
                                mapping.id.clone(),
                                change.path.clone(),
                                mapping.gallery_id.clone(),
                                file_size,
                            )
                        };

                        sync_queue.enqueue(item).await;
                    }
                }
                _ = shutdown_rx.recv() => {
                    info!("Sync processor received shutdown signal");
                    break;
                }
            }
        }
    });

    // Return current status
    get_sync_status_internal(&sync_engine).await
}

/// Stop all syncing.
#[tauri::command]
pub async fn stop_sync(state: State<'_, AppState>) -> Result<(), String> {
    info!("Stopping sync engine");

    let mut sync_engine = state.sync_engine.lock().await;

    if !sync_engine.is_running {
        return Ok(());
    }

    // Send shutdown signal
    if let Some(tx) = sync_engine.shutdown_tx.take() {
        let _ = tx.send(()).await;
    }

    // Stop file watcher
    if let Some(watcher) = &sync_engine.file_watcher {
        watcher.stop_all().await;
    }

    // Clear queue
    sync_engine.sync_queue.clear_pending().await;

    sync_engine.is_running = false;
    sync_engine.file_watcher = None;
    sync_engine.mapping_status.clear();

    Ok(())
}

/// Pause syncing.
#[tauri::command]
pub async fn pause_sync(state: State<'_, AppState>) -> Result<(), String> {
    info!("Pausing sync");

    let mut sync_engine = state.sync_engine.lock().await;

    if !sync_engine.is_running {
        return Err("Sync is not running".to_string());
    }

    sync_engine.sync_queue.pause().await;
    sync_engine.is_paused = true;

    // Update all mapping statuses
    for status in sync_engine.mapping_status.values_mut() {
        status.is_paused = true;
    }

    Ok(())
}

/// Resume syncing.
#[tauri::command]
pub async fn resume_sync(state: State<'_, AppState>) -> Result<(), String> {
    info!("Resuming sync");

    let mut sync_engine = state.sync_engine.lock().await;

    if !sync_engine.is_running {
        return Err("Sync is not running".to_string());
    }

    sync_engine.sync_queue.resume().await;
    sync_engine.is_paused = false;

    // Update all mapping statuses
    for status in sync_engine.mapping_status.values_mut() {
        status.is_paused = false;
    }

    Ok(())
}

/// Get current sync status.
#[tauri::command]
pub async fn get_sync_status(state: State<'_, AppState>) -> Result<SyncStatus, String> {
    let sync_engine = state.sync_engine.lock().await;
    get_sync_status_internal(&sync_engine).await
}

/// Internal function to get sync status.
async fn get_sync_status_internal(sync_engine: &SyncEngine) -> Result<SyncStatus, String> {
    let queue_stats = sync_engine.sync_queue.get_stats().await;

    Ok(SyncStatus {
        is_running: sync_engine.is_running,
        is_paused: sync_engine.is_paused,
        total_pending: queue_stats.pending,
        total_uploading: queue_stats.in_progress,
        total_completed: queue_stats.completed,
        total_failed: queue_stats.failed,
        total_bytes: queue_stats.total_bytes,
        bytes_transferred: queue_stats.bytes_transferred,
        overall_progress: queue_stats.progress(),
        mappings: sync_engine.mapping_status.values().cloned().collect(),
        network_status: sync_engine.network_status.clone(),
    })
}

/// Get queue statistics.
#[tauri::command]
pub async fn get_queue_stats(state: State<'_, AppState>) -> Result<QueueStats, String> {
    let sync_engine = state.sync_engine.lock().await;
    Ok(sync_engine.sync_queue.get_stats().await)
}

/// Trigger initial scan of a mapping folder.
#[tauri::command]
pub async fn scan_mapping(
    state: State<'_, AppState>,
    mapping_id: String,
) -> Result<usize, String> {
    info!("Scanning mapping: {}", mapping_id);

    let mapping = {
        let config = state.config.lock().await;
        config.get_mapping(&mapping_id).cloned()
    };

    let mapping = mapping.ok_or("Mapping not found")?;
    let path = PathBuf::from(&mapping.local_path);

    if !path.exists() {
        return Err("Folder does not exist".to_string());
    }

    // Scan for image files
    let mut files_found = 0;
    let sync_engine = state.sync_engine.lock().await;

    for entry in walkdir::WalkDir::new(&path)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let entry_path = entry.path();

        // Check if it's an image file
        if let Some(ext) = entry_path.extension() {
            let ext_lower = ext.to_string_lossy().to_lowercase();
            let is_image = matches!(
                ext_lower.as_str(),
                "jpg" | "jpeg" | "png" | "gif" | "webp" | "tiff" | "tif" | "bmp" | "raw"
                    | "cr2" | "cr3" | "nef" | "arw" | "orf" | "rw2" | "dng" | "pef" | "raf"
                    | "srw" | "heic" | "heif"
            );

            if is_image {
                let file_size = std::fs::metadata(entry_path)
                    .map(|m| m.len())
                    .unwrap_or(0);

                let item = SyncItem::upload(
                    mapping.id.clone(),
                    entry_path.to_path_buf(),
                    mapping.gallery_id.clone(),
                    file_size,
                );

                sync_engine.sync_queue.enqueue(item).await;
                files_found += 1;
            }
        }
    }

    info!("Scan complete: found {} files", files_found);
    Ok(files_found)
}

/// Retry all failed items.
#[tauri::command]
pub async fn retry_failed(state: State<'_, AppState>) -> Result<(), String> {
    let sync_engine = state.sync_engine.lock().await;
    sync_engine.sync_queue.retry_failed().await;
    Ok(())
}

/// Clear completed items from queue.
#[tauri::command]
pub async fn clear_completed(state: State<'_, AppState>) -> Result<(), String> {
    let sync_engine = state.sync_engine.lock().await;
    sync_engine.sync_queue.clear_completed().await;
    Ok(())
}

/// Check network connectivity.
#[tauri::command]
pub async fn check_network(state: State<'_, AppState>) -> Result<NetworkStatus, String> {
    let api_client = state.api_client.lock().await;

    match api_client.get_connection_info().await {
        Ok(_) => {
            drop(api_client); // Release lock before acquiring sync_engine
            let mut sync_engine = state.sync_engine.lock().await;
            sync_engine.network_status = NetworkStatus::Connected;
            Ok(NetworkStatus::Connected)
        }
        Err(_) => {
            drop(api_client); // Release lock before acquiring sync_engine
            let mut sync_engine = state.sync_engine.lock().await;
            sync_engine.network_status = NetworkStatus::Disconnected;
            Ok(NetworkStatus::Disconnected)
        }
    }
}

/// Read XMP metadata from a file.
#[tauri::command]
pub async fn read_xmp_metadata(path: String) -> Result<XmpMetadata, String> {
    let path = PathBuf::from(path);
    xmp_handler::read_xmp_file(&path).map_err(|e| e.to_string())
}

/// Write XMP metadata to a file.
#[tauri::command]
pub async fn write_xmp_metadata(path: String, metadata: XmpMetadata) -> Result<(), String> {
    let path = PathBuf::from(path);
    xmp_handler::write_xmp_file(&path, &metadata).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sync_engine_default() {
        let engine = SyncEngine::new();
        assert!(!engine.is_running);
        assert!(!engine.is_paused);
        assert!(engine.mapping_status.is_empty());
    }
}
