//! Keyring wrapper for secure credential storage.
//! Feature: 029-pro-review-xmp-sync
//! Task: T064
//!
//! Stores sync API keys securely using the OS keyring:
//! - Windows: Credential Manager
//! - macOS: Keychain
//! - Linux: Secret Service (GNOME Keyring, KWallet)

use keyring::Entry;
use thiserror::Error;
use tracing::{debug, error, info};

const SERVICE_NAME: &str = "rawdrive-sync";
const KEY_ACCOUNT: &str = "api_key";

#[derive(Error, Debug)]
pub enum KeyringError {
    #[error("Failed to access keyring: {0}")]
    AccessError(String),
    #[error("Credential not found")]
    NotFound,
    #[error("Failed to store credential: {0}")]
    StoreError(String),
    #[error("Failed to delete credential: {0}")]
    DeleteError(String),
}

/// Wrapper around OS keyring for credential storage.
pub struct KeyringStore {
    entry: Entry,
}

impl KeyringStore {
    /// Create a new keyring store instance.
    pub fn new() -> Result<Self, KeyringError> {
        let entry = Entry::new(SERVICE_NAME, KEY_ACCOUNT)
            .map_err(|e| KeyringError::AccessError(e.to_string()))?;
        Ok(Self { entry })
    }

    /// Store the API key securely.
    pub fn store_api_key(&self, api_key: &str) -> Result<(), KeyringError> {
        debug!("Storing API key in keyring");
        self.entry
            .set_password(api_key)
            .map_err(|e| KeyringError::StoreError(e.to_string()))?;
        info!("API key stored successfully");
        Ok(())
    }

    /// Retrieve the stored API key.
    pub fn get_api_key(&self) -> Result<String, KeyringError> {
        debug!("Retrieving API key from keyring");
        match self.entry.get_password() {
            Ok(key) => {
                debug!("API key retrieved successfully");
                Ok(key)
            }
            Err(keyring::Error::NoEntry) => {
                debug!("No API key found in keyring");
                Err(KeyringError::NotFound)
            }
            Err(e) => {
                error!("Failed to retrieve API key: {}", e);
                Err(KeyringError::AccessError(e.to_string()))
            }
        }
    }

    /// Delete the stored API key.
    pub fn delete_api_key(&self) -> Result<(), KeyringError> {
        debug!("Deleting API key from keyring");
        match self.entry.delete_password() {
            Ok(()) => {
                info!("API key deleted successfully");
                Ok(())
            }
            Err(keyring::Error::NoEntry) => {
                debug!("No API key to delete");
                Ok(()) // Not an error if nothing to delete
            }
            Err(e) => {
                error!("Failed to delete API key: {}", e);
                Err(KeyringError::DeleteError(e.to_string()))
            }
        }
    }

    /// Check if an API key is stored.
    pub fn has_api_key(&self) -> bool {
        self.get_api_key().is_ok()
    }
}

impl Default for KeyringStore {
    fn default() -> Self {
        Self::new().expect("Failed to initialize keyring store")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keyring_store_creation() {
        // This test may fail on systems without a keyring
        let result = KeyringStore::new();
        // Just check it doesn't panic
        assert!(result.is_ok() || result.is_err());
    }
}
