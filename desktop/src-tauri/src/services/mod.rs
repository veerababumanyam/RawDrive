//! Services modules for RawDrive Desktop Sync.
//! Feature: 029-pro-review-xmp-sync

pub mod api_client;
pub mod file_watcher;
pub mod sync_queue;
pub mod xmp_handler;

pub use api_client::RawDriveClient;
pub use file_watcher::{FileChange, FileChangeType, FileWatcher, FileWatcherError, WatcherConfig};
pub use sync_queue::{QueueStats, SyncItem, SyncItemStatus, SyncOperation, SyncQueue};
pub use xmp_handler::{XmpError, XmpMetadata};
