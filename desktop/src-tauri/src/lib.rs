//! RawDrive Desktop Sync Library
//! Feature: 029-pro-review-xmp-sync
//!
//! Library crate for the Tauri desktop application.

pub mod commands;
pub mod services;
pub mod state;
pub mod storage;

pub use services::RawDriveClient;
pub use state::AppState;
pub use storage::{ConfigStore, KeyringStore};
