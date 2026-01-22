//! Authentication Tauri commands.
//! Feature: 029-pro-review-xmp-sync
//! Task: T067
//!
//! Commands for login, logout, and API key validation.

use serde::Serialize;
use tauri::State;
use tracing::{debug, info};

use crate::services::RawDriveClient;
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct AuthStatus {
    pub authenticated: bool,
    pub workspace_id: Option<String>,
    pub user_id: Option<String>,
    pub api_key_prefix: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LoginResult {
    pub success: bool,
    pub workspace_id: Option<String>,
    pub user_id: Option<String>,
    pub permissions: Vec<String>,
    pub scoped_gallery_ids: Vec<String>,
    pub galleries_accessible: i32,
    pub error: Option<String>,
}

/// Login with an API key.
#[tauri::command]
pub async fn login(
    api_key: String,
    state: State<'_, AppState>,
) -> Result<LoginResult, String> {
    debug!("Attempting login with API key");

    // Validate the API key
    let client = RawDriveClient::new();
    let validation = client
        .validate_api_key(&api_key)
        .await
        .map_err(|e| format!("Validation failed: {}", e))?;

    if !validation.valid {
        return Ok(LoginResult {
            success: false,
            workspace_id: None,
            user_id: None,
            permissions: vec![],
            scoped_gallery_ids: vec![],
            galleries_accessible: 0,
            error: validation.error,
        });
    }

    let workspace_id = validation.workspace_id.clone().unwrap_or_default();
    let user_id = validation.user_id.clone().unwrap_or_default();
    let api_key_prefix = if api_key.len() >= 12 {
        api_key[..12].to_string()
    } else {
        api_key.clone()
    };

    // Store the API key securely
    {
        let keyring = state.keyring.lock().await;
        keyring
            .store_api_key(&api_key)
            .map_err(|e| format!("Failed to store API key: {}", e))?;
    }

    // Update config with auth info
    {
        let mut config = state.config.lock().await;
        config
            .set_auth_info(workspace_id.clone(), user_id.clone(), api_key_prefix)
            .map_err(|e| format!("Failed to save config: {}", e))?;
    }

    // Update the API client
    {
        let mut client = state.api_client.lock().await;
        client.set_api_key(&api_key);
    }

    // Get gallery count
    let client_locked = state.api_client.lock().await;
    let connection_info = client_locked.get_connection_info().await.ok();
    let galleries_accessible = connection_info
        .as_ref()
        .map(|c| c.galleries_accessible)
        .unwrap_or(0);

    info!("Login successful for workspace {}", workspace_id);

    Ok(LoginResult {
        success: true,
        workspace_id: Some(workspace_id),
        user_id: Some(user_id),
        permissions: validation.permissions,
        scoped_gallery_ids: validation.scoped_gallery_ids,
        galleries_accessible,
        error: None,
    })
}

/// Logout and clear credentials.
#[tauri::command]
pub async fn logout(state: State<'_, AppState>) -> Result<(), String> {
    info!("Logging out");

    // Clear API key from keyring
    {
        let keyring = state.keyring.lock().await;
        keyring
            .delete_api_key()
            .map_err(|e| format!("Failed to delete API key: {}", e))?;
    }

    // Clear auth info from config
    {
        let mut config = state.config.lock().await;
        config
            .clear_auth_info()
            .map_err(|e| format!("Failed to clear config: {}", e))?;
    }

    // Clear API client
    {
        let mut client = state.api_client.lock().await;
        client.clear_api_key();
    }

    info!("Logout complete");
    Ok(())
}

/// Check current authentication status.
#[tauri::command]
pub async fn get_auth_status(state: State<'_, AppState>) -> Result<AuthStatus, String> {
    debug!("Checking auth status");

    let config = state.config.lock().await;
    let is_auth = config.is_authenticated();

    if !is_auth {
        return Ok(AuthStatus {
            authenticated: false,
            workspace_id: None,
            user_id: None,
            api_key_prefix: None,
            error: None,
        });
    }

    let app_config = config.get();

    Ok(AuthStatus {
        authenticated: true,
        workspace_id: app_config.workspace_id.clone(),
        user_id: app_config.user_id.clone(),
        api_key_prefix: app_config.api_key_prefix.clone(),
        error: None,
    })
}

/// Validate the current stored API key.
#[tauri::command]
pub async fn validate_stored_key(state: State<'_, AppState>) -> Result<LoginResult, String> {
    debug!("Validating stored API key");

    // Get API key from keyring
    let api_key = {
        let keyring = state.keyring.lock().await;
        keyring.get_api_key().map_err(|e| format!("No stored key: {}", e))?
    };

    // Validate with server
    let client = RawDriveClient::new();
    let validation = client
        .validate_api_key(&api_key)
        .await
        .map_err(|e| format!("Validation failed: {}", e))?;

    if !validation.valid {
        // Key is invalid, clear it
        let keyring = state.keyring.lock().await;
        let _ = keyring.delete_api_key();

        let mut config = state.config.lock().await;
        let _ = config.clear_auth_info();

        return Ok(LoginResult {
            success: false,
            workspace_id: None,
            user_id: None,
            permissions: vec![],
            scoped_gallery_ids: vec![],
            galleries_accessible: 0,
            error: validation.error,
        });
    }

    // Update API client
    {
        let mut client = state.api_client.lock().await;
        client.set_api_key(&api_key);
    }

    // Get gallery count
    let client_locked = state.api_client.lock().await;
    let connection_info = client_locked.get_connection_info().await.ok();
    let galleries_accessible = connection_info
        .as_ref()
        .map(|c| c.galleries_accessible)
        .unwrap_or(0);

    Ok(LoginResult {
        success: true,
        workspace_id: validation.workspace_id,
        user_id: validation.user_id,
        permissions: validation.permissions,
        scoped_gallery_ids: validation.scoped_gallery_ids,
        galleries_accessible,
        error: None,
    })
}
