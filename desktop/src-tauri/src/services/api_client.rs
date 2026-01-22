//! RawDrive API client for desktop sync.
//! Feature: 029-pro-review-xmp-sync
//! Task: T066
//!
//! HTTP client for communicating with RawDrive backend.

use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use serde::{de::DeserializeOwned, Deserialize};
use thiserror::Error;
use tracing::{debug, error};

/// Default API base URL (can be overridden via config)
const DEFAULT_API_BASE: &str = "https://api.rawdrive.in/api/v1";

#[derive(Error, Debug)]
pub enum ApiError {
    #[error("Network error: {0}")]
    NetworkError(#[from] reqwest::Error),
    #[error("Authentication failed: {0}")]
    AuthError(String),
    #[error("Permission denied: {0}")]
    PermissionError(String),
    #[error("Not found: {0}")]
    NotFoundError(String),
    #[error("Server error: {0}")]
    ServerError(String),
    #[error("Invalid response: {0}")]
    InvalidResponse(String),
}

/// API key validation response.
#[derive(Debug, Deserialize)]
pub struct ApiKeyValidation {
    pub valid: bool,
    pub key_id: Option<String>,
    pub workspace_id: Option<String>,
    pub user_id: Option<String>,
    pub permissions: Vec<String>,
    pub scoped_gallery_ids: Vec<String>,
    pub error: Option<String>,
}

/// Gallery summary for sync.
#[derive(Debug, Deserialize)]
pub struct GallerySummary {
    pub gallery_id: String,
    pub workspace_id: String,
    pub title: String,
    pub slug: Option<String>,
    pub asset_count: i32,
    pub cover_asset_url: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub status: String,
}

/// Gallery list response.
#[derive(Debug, Deserialize)]
pub struct GalleryListResponse {
    pub data: Vec<GallerySummary>,
    pub total: i32,
    pub has_more: bool,
    pub page: i32,
    pub limit: i32,
}

/// Connection info response.
#[derive(Debug, Deserialize)]
pub struct ConnectionInfo {
    pub connected: bool,
    pub key_id: String,
    pub workspace_id: String,
    pub user_id: String,
    pub permissions: Vec<String>,
    pub scoped_gallery_ids: Vec<String>,
    pub galleries_accessible: i32,
}

/// API client for RawDrive backend.
pub struct RawDriveClient {
    client: reqwest::Client,
    base_url: String,
    api_key: Option<String>,
}

impl RawDriveClient {
    /// Create a new API client.
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            client,
            base_url: DEFAULT_API_BASE.to_string(),
            api_key: None,
        }
    }

    /// Create a new API client with a custom base URL.
    pub fn with_base_url(base_url: &str) -> Self {
        let mut client = Self::new();
        client.base_url = base_url.to_string();
        client
    }

    /// Set the API key for authentication.
    pub fn set_api_key(&mut self, api_key: &str) {
        self.api_key = Some(api_key.to_string());
    }

    /// Clear the API key.
    pub fn clear_api_key(&mut self) {
        self.api_key = None;
    }

    /// Build default headers with API key.
    fn build_headers(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        if let Some(ref api_key) = self.api_key {
            headers.insert(
                "X-Api-Key",
                HeaderValue::from_str(api_key).unwrap_or_else(|_| HeaderValue::from_static("")),
            );
        }

        headers
    }

    /// Handle API response, converting errors appropriately.
    async fn handle_response<T: DeserializeOwned>(&self, response: reqwest::Response) -> Result<T, ApiError> {
        let status = response.status();

        if status.is_success() {
            response
                .json::<T>()
                .await
                .map_err(|e| ApiError::InvalidResponse(e.to_string()))
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());

            match status.as_u16() {
                401 => Err(ApiError::AuthError(error_text)),
                403 => Err(ApiError::PermissionError(error_text)),
                404 => Err(ApiError::NotFoundError(error_text)),
                500..=599 => Err(ApiError::ServerError(error_text)),
                _ => Err(ApiError::InvalidResponse(error_text)),
            }
        }
    }

    /// Validate an API key (without storing it).
    pub async fn validate_api_key(&self, api_key: &str) -> Result<ApiKeyValidation, ApiError> {
        let url = format!("{}/sync/auth/validate", self.base_url);

        debug!("Validating API key at {}", url);

        let response = self
            .client
            .post(&url)
            .header(CONTENT_TYPE, "application/json")
            .json(&serde_json::json!({ "api_key": api_key }))
            .send()
            .await?;

        self.handle_response(response).await
    }

    /// Get connection info (requires authenticated client).
    pub async fn get_connection_info(&self) -> Result<ConnectionInfo, ApiError> {
        let url = format!("{}/sync/connection", self.base_url);

        debug!("Getting connection info from {}", url);

        let response = self
            .client
            .get(&url)
            .headers(self.build_headers())
            .send()
            .await?;

        self.handle_response(response).await
    }

    /// List accessible galleries.
    pub async fn list_galleries(&self, page: i32, limit: i32) -> Result<GalleryListResponse, ApiError> {
        let url = format!("{}/sync/galleries?page={}&limit={}", self.base_url, page, limit);

        debug!("Listing galleries from {}", url);

        let response = self
            .client
            .get(&url)
            .headers(self.build_headers())
            .send()
            .await?;

        self.handle_response(response).await
    }

    /// Get a specific gallery.
    pub async fn get_gallery(&self, gallery_id: &str) -> Result<GallerySummary, ApiError> {
        let url = format!("{}/sync/galleries/{}", self.base_url, gallery_id);

        debug!("Getting gallery {} from {}", gallery_id, url);

        let response = self
            .client
            .get(&url)
            .headers(self.build_headers())
            .send()
            .await?;

        self.handle_response(response).await
    }
}

impl Default for RawDriveClient {
    fn default() -> Self {
        Self::new()
    }
}
