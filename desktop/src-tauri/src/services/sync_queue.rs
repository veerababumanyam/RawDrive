//! Sync queue service for managing file upload operations.
//! Feature: 029-pro-review-xmp-sync
//! Task: T080
//!
//! Manages a queue of files to sync with retry logic and progress tracking.

use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{mpsc, Mutex, RwLock};
use tracing::{debug, error, info, warn};

/// Maximum concurrent uploads.
const DEFAULT_MAX_CONCURRENT: usize = 3;

/// Maximum retry attempts per file.
const MAX_RETRIES: u32 = 3;

/// Base delay for exponential backoff (in milliseconds).
const BASE_RETRY_DELAY_MS: u64 = 1000;

/// Sync operation type.
#[derive(Debug, Clone, PartialEq)]
pub enum SyncOperation {
    Upload,
    Download,
    MetadataUpdate,
    Delete,
}

/// Sync item status.
#[derive(Debug, Clone, PartialEq)]
pub enum SyncItemStatus {
    Pending,
    InProgress,
    Completed,
    Failed { error: String, retries: u32 },
    Cancelled,
}

/// A sync item in the queue.
#[derive(Debug, Clone)]
pub struct SyncItem {
    pub id: String,
    pub mapping_id: String,
    pub local_path: PathBuf,
    pub gallery_id: String,
    pub operation: SyncOperation,
    pub status: SyncItemStatus,
    pub file_size: u64,
    pub bytes_transferred: u64,
    pub created_at: Instant,
    pub started_at: Option<Instant>,
    pub completed_at: Option<Instant>,
    pub retry_count: u32,
    pub priority: i32,
}

impl SyncItem {
    /// Create a new upload item.
    pub fn upload(
        mapping_id: String,
        local_path: PathBuf,
        gallery_id: String,
        file_size: u64,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            mapping_id,
            local_path,
            gallery_id,
            operation: SyncOperation::Upload,
            status: SyncItemStatus::Pending,
            file_size,
            bytes_transferred: 0,
            created_at: Instant::now(),
            started_at: None,
            completed_at: None,
            retry_count: 0,
            priority: 0,
        }
    }

    /// Create a metadata update item.
    pub fn metadata_update(
        mapping_id: String,
        local_path: PathBuf,
        gallery_id: String,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            mapping_id,
            local_path,
            gallery_id,
            operation: SyncOperation::MetadataUpdate,
            status: SyncItemStatus::Pending,
            file_size: 0,
            bytes_transferred: 0,
            created_at: Instant::now(),
            started_at: None,
            completed_at: None,
            retry_count: 0,
            priority: 1, // Higher priority for metadata
        }
    }
}

/// Queue statistics.
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct QueueStats {
    pub pending: usize,
    pub in_progress: usize,
    pub completed: usize,
    pub failed: usize,
    pub total_bytes: u64,
    pub bytes_transferred: u64,
}

impl QueueStats {
    /// Calculate overall progress (0.0 - 1.0).
    pub fn progress(&self) -> f64 {
        if self.total_bytes == 0 {
            if self.pending + self.in_progress == 0 {
                1.0
            } else {
                0.0
            }
        } else {
            self.bytes_transferred as f64 / self.total_bytes as f64
        }
    }
}

/// Sync queue service.
#[derive(Clone)]
pub struct SyncQueue {
    queue: Arc<Mutex<VecDeque<SyncItem>>>,
    in_progress: Arc<RwLock<HashMap<String, SyncItem>>>,
    completed: Arc<RwLock<Vec<SyncItem>>>,
    failed: Arc<RwLock<Vec<SyncItem>>>,
    max_concurrent: usize,
    paused: Arc<RwLock<bool>>,
    stats_tx: Option<mpsc::Sender<QueueStats>>,
}

impl SyncQueue {
    /// Create a new sync queue.
    pub fn new(max_concurrent: Option<usize>) -> Self {
        Self {
            queue: Arc::new(Mutex::new(VecDeque::new())),
            in_progress: Arc::new(RwLock::new(HashMap::new())),
            completed: Arc::new(RwLock::new(Vec::new())),
            failed: Arc::new(RwLock::new(Vec::new())),
            max_concurrent: max_concurrent.unwrap_or(DEFAULT_MAX_CONCURRENT),
            paused: Arc::new(RwLock::new(false)),
            stats_tx: None,
        }
    }

    /// Create with stats channel.
    pub fn with_stats_channel(
        max_concurrent: Option<usize>,
    ) -> (Self, mpsc::Receiver<QueueStats>) {
        let (tx, rx) = mpsc::channel(100);
        let mut queue = Self::new(max_concurrent);
        queue.stats_tx = Some(tx);
        (queue, rx)
    }

    /// Add an item to the queue.
    pub async fn enqueue(&self, item: SyncItem) {
        let mut queue = self.queue.lock().await;

        // Check for duplicates (same path + operation)
        let exists = queue.iter().any(|i| {
            i.local_path == item.local_path && i.operation == item.operation
        });

        if !exists {
            // Insert based on priority (higher priority first)
            let pos = queue
                .iter()
                .position(|i| i.priority < item.priority)
                .unwrap_or(queue.len());
            queue.insert(pos, item);

            debug!("Enqueued sync item, queue size: {}", queue.len());
            self.emit_stats().await;
        }
    }

    /// Get the next item ready for processing.
    pub async fn dequeue(&self) -> Option<SyncItem> {
        // Check if paused
        if *self.paused.read().await {
            return None;
        }

        // Check concurrent limit
        {
            let in_progress = self.in_progress.read().await;
            if in_progress.len() >= self.max_concurrent {
                return None;
            }
        }

        let mut queue = self.queue.lock().await;
        if let Some(mut item) = queue.pop_front() {
            item.status = SyncItemStatus::InProgress;
            item.started_at = Some(Instant::now());

            // Move to in_progress
            let id = item.id.clone();
            {
                let mut in_progress = self.in_progress.write().await;
                in_progress.insert(id, item.clone());
            }

            self.emit_stats().await;
            Some(item)
        } else {
            None
        }
    }

    /// Mark an item as completed.
    pub async fn complete(&self, id: &str) {
        let item = {
            let mut in_progress = self.in_progress.write().await;
            in_progress.remove(id)
        };

        if let Some(mut item) = item {
            item.status = SyncItemStatus::Completed;
            item.completed_at = Some(Instant::now());
            item.bytes_transferred = item.file_size;

            let mut completed = self.completed.write().await;
            completed.push(item);

            info!("Sync item completed: {}", id);
            self.emit_stats().await;
        }
    }

    /// Mark an item as failed.
    pub async fn fail(&self, id: &str, error: String) {
        let item = {
            let mut in_progress = self.in_progress.write().await;
            in_progress.remove(id)
        };

        if let Some(mut item) = item {
            item.retry_count += 1;

            if item.retry_count < MAX_RETRIES {
                // Requeue with backoff
                let delay = Duration::from_millis(
                    BASE_RETRY_DELAY_MS * 2u64.pow(item.retry_count - 1),
                );

                item.status = SyncItemStatus::Pending;
                item.started_at = None;

                warn!(
                    "Sync item failed, retrying ({}/{}): {} - {}",
                    item.retry_count, MAX_RETRIES, id, error
                );

                // Delay before requeue
                tokio::time::sleep(delay).await;

                let mut queue = self.queue.lock().await;
                queue.push_back(item);
            } else {
                // Max retries exceeded
                item.status = SyncItemStatus::Failed {
                    error: error.clone(),
                    retries: item.retry_count,
                };
                item.completed_at = Some(Instant::now());

                error!("Sync item failed permanently: {} - {}", id, error);

                let mut failed = self.failed.write().await;
                failed.push(item);
            }

            self.emit_stats().await;
        }
    }

    /// Update progress for an in-progress item.
    pub async fn update_progress(&self, id: &str, bytes_transferred: u64) {
        let mut in_progress = self.in_progress.write().await;
        if let Some(item) = in_progress.get_mut(id) {
            item.bytes_transferred = bytes_transferred;
        }
        drop(in_progress);

        self.emit_stats().await;
    }

    /// Pause the queue.
    pub async fn pause(&self) {
        let mut paused = self.paused.write().await;
        *paused = true;
        info!("Sync queue paused");
    }

    /// Resume the queue.
    pub async fn resume(&self) {
        let mut paused = self.paused.write().await;
        *paused = false;
        info!("Sync queue resumed");
    }

    /// Check if paused.
    pub async fn is_paused(&self) -> bool {
        *self.paused.read().await
    }

    /// Cancel an item.
    pub async fn cancel(&self, id: &str) -> bool {
        // Try to remove from queue
        {
            let mut queue = self.queue.lock().await;
            if let Some(pos) = queue.iter().position(|i| i.id == id) {
                queue.remove(pos);
                info!("Cancelled queued sync item: {}", id);
                self.emit_stats().await;
                return true;
            }
        }

        // Can't cancel in-progress items safely
        false
    }

    /// Clear all pending items.
    pub async fn clear_pending(&self) {
        let mut queue = self.queue.lock().await;
        let count = queue.len();
        queue.clear();
        info!("Cleared {} pending sync items", count);
        self.emit_stats().await;
    }

    /// Clear completed items.
    pub async fn clear_completed(&self) {
        let mut completed = self.completed.write().await;
        completed.clear();
    }

    /// Clear failed items.
    pub async fn clear_failed(&self) {
        let mut failed = self.failed.write().await;
        failed.clear();
    }

    /// Retry all failed items.
    pub async fn retry_failed(&self) {
        let items: Vec<SyncItem> = {
            let mut failed = self.failed.write().await;
            std::mem::take(&mut *failed)
        };

        for mut item in items {
            item.status = SyncItemStatus::Pending;
            item.retry_count = 0;
            item.started_at = None;
            item.completed_at = None;
            self.enqueue(item).await;
        }
    }

    /// Get current queue statistics.
    pub async fn get_stats(&self) -> QueueStats {
        let queue = self.queue.lock().await;
        let in_progress = self.in_progress.read().await;
        let completed = self.completed.read().await;
        let failed = self.failed.read().await;

        let pending = queue.len();
        let in_progress_count = in_progress.len();
        let completed_count = completed.len();
        let failed_count = failed.len();

        let total_bytes: u64 = queue.iter().map(|i| i.file_size).sum::<u64>()
            + in_progress.values().map(|i| i.file_size).sum::<u64>()
            + completed.iter().map(|i| i.file_size).sum::<u64>();

        let bytes_transferred: u64 = in_progress
            .values()
            .map(|i| i.bytes_transferred)
            .sum::<u64>()
            + completed.iter().map(|i| i.bytes_transferred).sum::<u64>();

        QueueStats {
            pending,
            in_progress: in_progress_count,
            completed: completed_count,
            failed: failed_count,
            total_bytes,
            bytes_transferred,
        }
    }

    /// Get all pending items.
    pub async fn get_pending(&self) -> Vec<SyncItem> {
        let queue = self.queue.lock().await;
        queue.iter().cloned().collect()
    }

    /// Get all in-progress items.
    pub async fn get_in_progress(&self) -> Vec<SyncItem> {
        let in_progress = self.in_progress.read().await;
        in_progress.values().cloned().collect()
    }

    /// Emit stats through channel if available.
    async fn emit_stats(&self) {
        if let Some(ref tx) = self.stats_tx {
            let stats = self.get_stats().await;
            let _ = tx.send(stats).await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_enqueue_dequeue() {
        let queue = SyncQueue::new(Some(1));

        let item = SyncItem::upload(
            "mapping-1".to_string(),
            PathBuf::from("/test/photo.jpg"),
            "gallery-1".to_string(),
            1000,
        );

        queue.enqueue(item).await;

        let stats = queue.get_stats().await;
        assert_eq!(stats.pending, 1);

        let dequeued = queue.dequeue().await;
        assert!(dequeued.is_some());

        let stats = queue.get_stats().await;
        assert_eq!(stats.pending, 0);
        assert_eq!(stats.in_progress, 1);
    }

    #[tokio::test]
    async fn test_complete() {
        let queue = SyncQueue::new(Some(1));

        let item = SyncItem::upload(
            "mapping-1".to_string(),
            PathBuf::from("/test/photo.jpg"),
            "gallery-1".to_string(),
            1000,
        );

        queue.enqueue(item).await;
        let dequeued = queue.dequeue().await.unwrap();

        queue.complete(&dequeued.id).await;

        let stats = queue.get_stats().await;
        assert_eq!(stats.completed, 1);
        assert_eq!(stats.in_progress, 0);
    }

    #[tokio::test]
    async fn test_priority() {
        let queue = SyncQueue::new(Some(1));

        // Add low priority item first
        let item1 = SyncItem::upload(
            "mapping-1".to_string(),
            PathBuf::from("/test/photo1.jpg"),
            "gallery-1".to_string(),
            1000,
        );

        // Add high priority item second
        let item2 = SyncItem::metadata_update(
            "mapping-1".to_string(),
            PathBuf::from("/test/photo2.xmp"),
            "gallery-1".to_string(),
        );

        queue.enqueue(item1).await;
        queue.enqueue(item2).await;

        // High priority should come out first
        let first = queue.dequeue().await.unwrap();
        assert_eq!(first.operation, SyncOperation::MetadataUpdate);
    }
}
