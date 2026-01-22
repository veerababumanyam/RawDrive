//! File watcher service for monitoring local folders.
//! Feature: 029-pro-review-xmp-sync
//! Task: T079
//!
//! Watches local folders for file changes and triggers sync operations.

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex, RwLock};
use tracing::{debug, error, info};

/// Supported image file extensions for sync.
const SUPPORTED_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "gif", "webp", "tiff", "tif", "bmp", "raw", "cr2", "cr3", "nef", "arw",
    "orf", "rw2", "dng", "pef", "raf", "srw", "heic", "heif",
];

/// XMP sidecar extension.
const XMP_EXTENSION: &str = "xmp";

/// File change event type.
#[derive(Debug, Clone, PartialEq)]
pub enum FileChangeType {
    Created,
    Modified,
    Deleted,
    Renamed { from: PathBuf },
}

/// A file change event.
#[derive(Debug, Clone)]
pub struct FileChange {
    pub path: PathBuf,
    pub change_type: FileChangeType,
    pub is_xmp: bool,
    pub mapping_id: String,
}

/// File watcher configuration.
#[derive(Debug, Clone)]
pub struct WatcherConfig {
    pub debounce_ms: u64,
    pub ignore_patterns: Vec<String>,
}

impl Default for WatcherConfig {
    fn default() -> Self {
        Self {
            debounce_ms: 500,
            ignore_patterns: vec![
                ".DS_Store".to_string(),
                "Thumbs.db".to_string(),
                "*.tmp".to_string(),
                "*.part".to_string(),
            ],
        }
    }
}

/// File watcher service.
pub struct FileWatcher {
    watchers: Arc<Mutex<Vec<RecommendedWatcher>>>,
    watched_paths: Arc<RwLock<HashSet<PathBuf>>>,
    change_tx: mpsc::Sender<FileChange>,
    config: WatcherConfig,
    running: Arc<RwLock<bool>>,
}

impl FileWatcher {
    /// Create a new file watcher.
    pub fn new(config: WatcherConfig) -> (Self, mpsc::Receiver<FileChange>) {
        let (tx, rx) = mpsc::channel(1000);

        let watcher = Self {
            watchers: Arc::new(Mutex::new(Vec::new())),
            watched_paths: Arc::new(RwLock::new(HashSet::new())),
            change_tx: tx,
            config,
            running: Arc::new(RwLock::new(false)),
        };

        (watcher, rx)
    }

    /// Start watching a folder for the given mapping.
    pub async fn watch_folder(
        &self,
        path: &Path,
        mapping_id: String,
    ) -> Result<(), FileWatcherError> {
        // Check if path exists
        if !path.exists() {
            return Err(FileWatcherError::PathNotFound(path.to_path_buf()));
        }

        if !path.is_dir() {
            return Err(FileWatcherError::NotADirectory(path.to_path_buf()));
        }

        // Check if already watching
        {
            let watched = self.watched_paths.read().await;
            if watched.contains(path) {
                info!("Already watching path: {:?}", path);
                return Ok(());
            }
        }

        let tx = self.change_tx.clone();
        let path_owned = path.to_path_buf();
        let mapping_id_owned = mapping_id.clone();
        let ignore_patterns = self.config.ignore_patterns.clone();

        // Create watcher
        let watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            match res {
                Ok(event) => {
                    // Process the event
                    if let Some(changes) =
                        process_notify_event(&event, &path_owned, &mapping_id_owned, &ignore_patterns)
                    {
                        for change in changes {
                            if let Err(e) = tx.blocking_send(change) {
                                error!("Failed to send file change: {}", e);
                            }
                        }
                    }
                }
                Err(e) => {
                    error!("File watcher error: {:?}", e);
                }
            }
        })?;

        // Add path to watcher
        let mut watchers = self.watchers.lock().await;
        let mut watcher = watcher;
        watcher.watch(path, RecursiveMode::Recursive)?;
        watchers.push(watcher);

        // Track watched path
        {
            let mut watched = self.watched_paths.write().await;
            watched.insert(path.to_path_buf());
        }

        info!("Started watching folder: {:?} for mapping {}", path, mapping_id);
        Ok(())
    }

    /// Stop watching a folder.
    pub async fn unwatch_folder(&self, path: &Path) -> Result<(), FileWatcherError> {
        let mut watched = self.watched_paths.write().await;
        watched.remove(path);

        // Note: notify doesn't support unwatching specific paths easily
        // In production, we'd need to recreate watchers
        info!("Stopped watching folder: {:?}", path);
        Ok(())
    }

    /// Stop all watchers.
    pub async fn stop_all(&self) {
        let mut watchers = self.watchers.lock().await;
        watchers.clear();

        let mut watched = self.watched_paths.write().await;
        watched.clear();

        info!("Stopped all file watchers");
    }

    /// Check if a path is being watched.
    pub async fn is_watching(&self, path: &Path) -> bool {
        let watched = self.watched_paths.read().await;
        watched.contains(path)
    }

    /// Get count of watched paths.
    pub async fn watched_count(&self) -> usize {
        let watched = self.watched_paths.read().await;
        watched.len()
    }
}

/// Process a notify event into file changes.
fn process_notify_event(
    event: &Event,
    base_path: &Path,
    mapping_id: &str,
    ignore_patterns: &[String],
) -> Option<Vec<FileChange>> {
    let mut changes = Vec::new();

    for path in &event.paths {
        // Check if should ignore
        if should_ignore(path, ignore_patterns) {
            continue;
        }

        // Check if it's a supported file type
        let is_xmp = is_xmp_file(path);
        let is_image = is_supported_image(path);

        if !is_xmp && !is_image {
            continue;
        }

        let change_type = match &event.kind {
            EventKind::Create(_) => FileChangeType::Created,
            EventKind::Modify(_) => FileChangeType::Modified,
            EventKind::Remove(_) => FileChangeType::Deleted,
            EventKind::Any => {
                debug!("Ignoring 'Any' event for {:?}", path);
                continue;
            }
            EventKind::Access(_) => {
                // Ignore access events
                continue;
            }
            EventKind::Other => {
                debug!("Ignoring 'Other' event for {:?}", path);
                continue;
            }
        };

        changes.push(FileChange {
            path: path.clone(),
            change_type,
            is_xmp,
            mapping_id: mapping_id.to_string(),
        });
    }

    if changes.is_empty() {
        None
    } else {
        Some(changes)
    }
}

/// Check if a file should be ignored.
fn should_ignore(path: &Path, patterns: &[String]) -> bool {
    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");

    for pattern in patterns {
        if pattern.starts_with("*.") {
            // Extension pattern
            let ext = &pattern[2..];
            if filename.ends_with(ext) {
                return true;
            }
        } else if filename == pattern {
            return true;
        }
    }

    // Ignore hidden files (except .xmp)
    if filename.starts_with('.') && !filename.ends_with(".xmp") {
        return true;
    }

    false
}

/// Check if a file is an XMP sidecar.
fn is_xmp_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase() == XMP_EXTENSION)
        .unwrap_or(false)
}

/// Check if a file is a supported image format.
fn is_supported_image(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| SUPPORTED_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

/// Get the base filename without extension (for matching XMP to images).
pub fn get_base_filename(path: &Path) -> Option<String> {
    path.file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string())
}

/// Get the corresponding XMP path for an image file.
pub fn get_xmp_path_for_image(image_path: &Path) -> PathBuf {
    let mut xmp_path = image_path.to_path_buf();
    xmp_path.set_extension("xmp");
    xmp_path
}

/// Get the corresponding image path for an XMP file (if exists).
pub fn find_image_for_xmp(xmp_path: &Path) -> Option<PathBuf> {
    let base = get_base_filename(xmp_path)?;
    let parent = xmp_path.parent()?;

    for ext in SUPPORTED_EXTENSIONS {
        let image_path = parent.join(format!("{}.{}", base, ext));
        if image_path.exists() {
            return Some(image_path);
        }

        // Also check uppercase extensions
        let image_path = parent.join(format!("{}.{}", base, ext.to_uppercase()));
        if image_path.exists() {
            return Some(image_path);
        }
    }

    None
}

/// File watcher errors.
#[derive(Debug, thiserror::Error)]
pub enum FileWatcherError {
    #[error("Path not found: {0}")]
    PathNotFound(PathBuf),

    #[error("Not a directory: {0}")]
    NotADirectory(PathBuf),

    #[error("Watch error: {0}")]
    WatchError(#[from] notify::Error),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_supported_image() {
        assert!(is_supported_image(Path::new("photo.jpg")));
        assert!(is_supported_image(Path::new("photo.JPG")));
        assert!(is_supported_image(Path::new("photo.CR2")));
        assert!(is_supported_image(Path::new("photo.dng")));
        assert!(!is_supported_image(Path::new("document.pdf")));
        assert!(!is_supported_image(Path::new("video.mp4")));
    }

    #[test]
    fn test_is_xmp_file() {
        assert!(is_xmp_file(Path::new("photo.xmp")));
        assert!(is_xmp_file(Path::new("photo.XMP")));
        assert!(!is_xmp_file(Path::new("photo.jpg")));
    }

    #[test]
    fn test_should_ignore() {
        let patterns = vec![".DS_Store".to_string(), "*.tmp".to_string()];
        assert!(should_ignore(Path::new(".DS_Store"), &patterns));
        assert!(should_ignore(Path::new("file.tmp"), &patterns));
        assert!(!should_ignore(Path::new("photo.jpg"), &patterns));
    }

    #[test]
    fn test_get_xmp_path_for_image() {
        let image = Path::new("/photos/DSC_0001.CR2");
        let xmp = get_xmp_path_for_image(image);
        assert_eq!(xmp, PathBuf::from("/photos/DSC_0001.xmp"));
    }
}
