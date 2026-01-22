//! Storage modules for RawDrive Desktop Sync.
//! Feature: 029-pro-review-xmp-sync

pub mod config;
pub mod keyring;

pub use config::{AppConfig, AppSettings, ConfigStore, FolderMapping, SyncDirection};
pub use keyring::KeyringStore;
