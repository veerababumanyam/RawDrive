"""Face Detection Configuration Service.

This module provides configuration management for the face detection service,
implementing admin settings priority with environment variable fallback.

Key features:
- Admin settings take priority over environment variables
- Secure credential decryption for database-stored credentials
- Provider-specific credential loading (Cloud Vision, Gemini)
- Face detection settings with sensible defaults

Requirements covered:
- 3.6: Environment variable fallback when admin settings not configured
- 3.7: Credential encryption for database-stored credentials
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, Optional, TYPE_CHECKING

from app.api.face_schemas import FaceDetectionErrorCode
from app.services.face_exceptions import (
    FaceDetectionError,
    ProviderNotConfiguredError,
    InvalidConfigurationError,
)

if TYPE_CHECKING:
    from app.services.face_admin_settings_service import FaceAdminSettingsService

logger = logging.getLogger(__name__)


# =============================================================================
# DEFAULT CONFIGURATION VALUES
# =============================================================================

# Face detection thresholds
DEFAULT_SIMILARITY_THRESHOLD = 0.85  # 85% similarity for face matching
DEFAULT_MIN_CONFIDENCE = 0.7  # 70% confidence for face storage
DEFAULT_MAX_FACES_PER_PHOTO = 50  # Maximum faces to detect per photo
DEFAULT_AUTO_CLUSTER_THRESHOLD = 0.8  # 80% similarity for auto-clustering

# Provider defaults
DEFAULT_CLOUD_VISION_MAX_RESULTS = 50
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
DEFAULT_GEMINI_TEMPERATURE = 0.1
DEFAULT_GEMINI_MAX_OUTPUT_TOKENS = 4096

# Embedding configuration
EMBEDDING_DIMENSION = 512  # Standard face embedding dimension


# =============================================================================
# CONFIGURATION SERVICE
# =============================================================================


class FaceConfigurationService:
    """Service for managing face detection configuration.
    
    This service provides a unified interface for retrieving configuration
    values with the following priority:
    1. Admin settings (stored in database)
    2. Environment variables
    3. Default values
    
    Credentials are stored encrypted in the database and decrypted on retrieval.
    
    Example:
        config_service = FaceConfigurationService(admin_settings_service)
        
        # Get provider credentials
        credentials = await config_service.get_provider_credentials("cloud_vision")
        
        # Get face detection setting
        threshold = await config_service.get_similarity_threshold()
    """

    def __init__(
        self, 
        admin_settings_service: Optional["FaceAdminSettingsService"] = None,
    ) -> None:
        """Initialize the configuration service.
        
        Args:
            admin_settings_service: Service for accessing admin settings.
                If None, only environment variables will be used.
        """
        self._admin_settings = admin_settings_service
        
    # =========================================================================
    # PROVIDER CREDENTIALS
    # =========================================================================

    async def get_provider_credentials(
        self, 
        provider_name: str,
    ) -> dict[str, Any]:
        """Retrieves provider credentials with admin settings priority.
        
        For Cloud Vision: Returns service account JSON credentials
        For Gemini: Returns API key and model configuration
        
        Priority order:
        1. Admin settings (encrypted in database)
        2. Environment variables
        
        Args:
            provider_name: The provider to get credentials for 
                          ("cloud_vision" or "gemini")
        
        Returns:
            Decrypted credentials dictionary
            
        Raises:
            ProviderNotConfiguredError: If credentials not found anywhere
            InvalidConfigurationError: If credentials are invalid
        """
        # First, try to get credentials from admin settings
        if self._admin_settings:
            try:
                config = await self._admin_settings.get_provider_config(provider_name)
                
                if config and config.get("credentials_decrypted"):
                    logger.debug(
                        "Loading credentials from admin settings",
                        extra={"provider": provider_name}
                    )
                    return config["credentials_decrypted"]
            except Exception as e:
                # Admin settings unavailable - fall through to env vars
                logger.debug(
                    "Admin settings unavailable, falling back to env",
                    extra={"provider": provider_name, "error": str(e)}
                )

        # Fallback to environment variables
        logger.debug(
            "Loading credentials from environment",
            extra={"provider": provider_name}
        )
        return self._get_credentials_from_env(provider_name)

    def _get_credentials_from_env(self, provider_name: str) -> dict[str, Any]:
        """Loads credentials from environment variables.
        
        Args:
            provider_name: The provider to get credentials for
            
        Returns:
            Credentials dictionary from environment
            
        Raises:
            ProviderNotConfiguredError: If required env vars not set
        """
        if provider_name == "cloud_vision":
            return self._load_cloud_vision_credentials()
        elif provider_name == "gemini":
            return self._load_gemini_credentials()
        else:
            raise ProviderNotConfiguredError(provider_name)

    def _load_cloud_vision_credentials(self) -> dict[str, Any]:
        """Loads Google Cloud Vision credentials from environment.
        
        Supports two methods:
        1. GOOGLE_CLOUD_VISION_CREDENTIALS - Path to service account JSON file
        2. GOOGLE_APPLICATION_CREDENTIALS - Standard Google Cloud env var
        
        Returns:
            Service account credentials dictionary
            
        Raises:
            ProviderNotConfiguredError: If credentials path not set
            InvalidConfigurationError: If credentials file is invalid
        """
        # Try face-detection specific env var first
        cred_path = os.environ.get("GOOGLE_CLOUD_VISION_CREDENTIALS")
        
        # Fall back to standard Google Cloud env var
        if not cred_path:
            cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        
        if not cred_path:
            raise FaceDetectionError(
                code=FaceDetectionErrorCode.PROVIDER_NOT_CONFIGURED,
                message=(
                    "GOOGLE_CLOUD_VISION_CREDENTIALS or "
                    "GOOGLE_APPLICATION_CREDENTIALS environment variable not set"
                ),
                user_message=(
                    "Face detection has not been configured. "
                    "Please contact your administrator."
                ),
            )

        try:
            # Read and parse service account JSON file
            cred_file = Path(cred_path)
            if not cred_file.exists():
                raise FileNotFoundError(f"Credentials file not found: {cred_path}")
                
            credentials_json = cred_file.read_text(encoding="utf-8")
            credentials = json.loads(credentials_json)
            
            # Validate required fields for service account
            required_fields = ["client_email", "private_key", "project_id"]
            missing_fields = [f for f in required_fields if f not in credentials]
            
            if missing_fields:
                raise InvalidConfigurationError(
                    setting="cloud_vision_credentials",
                    reason=f"Missing required fields: {', '.join(missing_fields)}",
                )

            return credentials
            
        except json.JSONDecodeError as e:
            raise InvalidConfigurationError(
                setting="cloud_vision_credentials",
                reason=f"Invalid JSON in credentials file: {e}",
            )
        except FileNotFoundError as e:
            raise FaceDetectionError(
                code=FaceDetectionErrorCode.PROVIDER_NOT_CONFIGURED,
                message=str(e),
                user_message=(
                    "Face detection configuration is invalid. "
                    "Please contact your administrator."
                ),
            )
        except Exception as e:
            raise InvalidConfigurationError(
                setting="cloud_vision_credentials",
                reason=f"Failed to load credentials: {e}",
            )

    def _load_gemini_credentials(self) -> dict[str, Any]:
        """Loads Google Gemini credentials from environment.
        
        Environment variables:
        - GEMINI_API_KEY: Required API key
        - GEMINI_MODEL_FAST: Optional model name (default: gemini-2.5-flash)
        
        Returns:
            Credentials dictionary with API key and model config
            
        Raises:
            ProviderNotConfiguredError: If API key not set
        """
        api_key = os.environ.get("GEMINI_API_KEY")
        
        if not api_key:
            raise FaceDetectionError(
                code=FaceDetectionErrorCode.PROVIDER_NOT_CONFIGURED,
                message="GEMINI_API_KEY environment variable not set",
                user_message=(
                    "Face detection has not been configured. "
                    "Please contact your administrator."
                ),
            )

        return {
            "api_key": api_key,
            "model": os.environ.get("GEMINI_MODEL_FAST", DEFAULT_GEMINI_MODEL),
            "temperature": float(
                os.environ.get("GEMINI_TEMPERATURE", str(DEFAULT_GEMINI_TEMPERATURE))
            ),
            "max_output_tokens": int(
                os.environ.get(
                    "GEMINI_MAX_OUTPUT_TOKENS", 
                    str(DEFAULT_GEMINI_MAX_OUTPUT_TOKENS)
                )
            ),
        }

    # =========================================================================
    # FACE DETECTION SETTINGS
    # =========================================================================

    async def get_face_detection_setting(
        self, 
        key: str, 
        default_value: str,
    ) -> str:
        """Gets a face detection setting with admin priority and env fallback.
        
        Priority order:
        1. Admin settings (key prefixed with "face.")
        2. Environment variable (key uppercased with FACE_ prefix)
        3. Default value
        
        Args:
            key: Setting key (without "face." prefix)
            default_value: Default value if not configured anywhere
            
        Returns:
            The setting value as a string
            
        Example:
            threshold = await config.get_face_detection_setting(
                "similarity_threshold", 
                "0.85"
            )
        """
        # Try admin settings first
        if self._admin_settings:
            try:
                value = await self._admin_settings.get_setting(f"face.{key}")
                if value is not None:
                    logger.debug(
                        "Loaded setting from admin settings",
                        extra={"key": key, "source": "admin"}
                    )
                    return value
            except Exception as e:
                # Admin settings unavailable - continue to env
                logger.debug(
                    "Admin settings unavailable for key",
                    extra={"key": key, "error": str(e)}
                )

        # Try environment variable
        env_key = f"FACE_{key.upper()}"
        env_value = os.environ.get(env_key)
        
        if env_value is not None:
            logger.debug(
                "Loaded setting from environment",
                extra={"key": key, "env_key": env_key, "source": "env"}
            )
            return env_value

        # Return default
        logger.debug(
            "Using default value for setting",
            extra={"key": key, "source": "default"}
        )
        return default_value

    async def get_similarity_threshold(self) -> float:
        """Gets the similarity threshold for face matching.
        
        Faces with similarity above this threshold are considered matches.
        
        Returns:
            Similarity threshold (0-1), default: 0.85
        """
        value = await self.get_face_detection_setting(
            "similarity_threshold", 
            str(DEFAULT_SIMILARITY_THRESHOLD)
        )
        return self._parse_float_setting(value, "similarity_threshold", 0.0, 1.0)

    async def get_min_confidence_threshold(self) -> float:
        """Gets the minimum confidence threshold for face detection.
        
        Faces below this confidence are marked as low-confidence
        and excluded from automatic clustering.
        
        Returns:
            Minimum confidence threshold (0-1), default: 0.7
        """
        value = await self.get_face_detection_setting(
            "min_confidence", 
            str(DEFAULT_MIN_CONFIDENCE)
        )
        return self._parse_float_setting(value, "min_confidence", 0.0, 1.0)

    async def get_auto_cluster_threshold(self) -> float:
        """Gets the threshold for automatic face clustering.
        
        Faces with similarity above this threshold are automatically
        assigned to the same cluster.
        
        Returns:
            Auto-cluster threshold (0-1), default: 0.8
        """
        value = await self.get_face_detection_setting(
            "auto_cluster_threshold", 
            str(DEFAULT_AUTO_CLUSTER_THRESHOLD)
        )
        return self._parse_float_setting(value, "auto_cluster_threshold", 0.0, 1.0)

    async def get_max_faces_per_photo(self) -> int:
        """Gets the maximum number of faces to detect per photo.
        
        Returns:
            Maximum faces per photo, default: 50
        """
        value = await self.get_face_detection_setting(
            "max_faces_per_photo", 
            str(DEFAULT_MAX_FACES_PER_PHOTO)
        )
        return self._parse_int_setting(value, "max_faces_per_photo", 1, 100)

    async def is_face_detection_enabled(self, workspace_id: str) -> bool:
        """Checks if face detection is enabled for a workspace.
        
        Args:
            workspace_id: The workspace to check
            
        Returns:
            True if face detection is enabled, False otherwise
        """
        if self._admin_settings:
            try:
                setting = await self._admin_settings.get_setting(
                    f"workspace.{workspace_id}.face_detection_enabled"
                )
                if setting is not None:
                    return setting.lower() != "false"
            except Exception:
                pass
        
        # Default to enabled if setting unavailable
        return True

    async def is_auto_detect_on_upload_enabled(self, workspace_id: str) -> bool:
        """Checks if auto-detection on upload is enabled for a workspace.
        
        Args:
            workspace_id: The workspace to check
            
        Returns:
            True if auto-detection is enabled, False otherwise
        """
        if self._admin_settings:
            try:
                setting = await self._admin_settings.get_setting(
                    f"workspace.{workspace_id}.auto_detect_on_upload"
                )
                if setting is not None:
                    return setting.lower() != "false"
            except Exception:
                pass
        
        # Default to enabled if setting unavailable
        return True

    # =========================================================================
    # PROVIDER CONFIGURATION
    # =========================================================================

    async def get_provider_timeout_ms(self, provider_name: str) -> int:
        """Gets the timeout for a provider in milliseconds.
        
        Args:
            provider_name: The provider to get timeout for
            
        Returns:
            Timeout in milliseconds, default: 30000 (30 seconds)
        """
        default_timeout = 30000
        
        if self._admin_settings:
            try:
                config = await self._admin_settings.get_provider_config(provider_name)
                if config and "timeout_ms" in config:
                    return config["timeout_ms"]
            except Exception:
                pass
        
        # Try environment variable
        env_key = f"{provider_name.upper()}_TIMEOUT_MS"
        env_value = os.environ.get(env_key)
        if env_value:
            try:
                return int(env_value)
            except ValueError:
                pass
        
        return default_timeout

    async def get_provider_rate_limit(self, provider_name: str) -> int:
        """Gets the rate limit for a provider (requests per minute).
        
        Args:
            provider_name: The provider to get rate limit for
            
        Returns:
            Rate limit per minute, default: 1800
        """
        default_rate_limit = 1800
        
        if self._admin_settings:
            try:
                config = await self._admin_settings.get_provider_config(provider_name)
                if config and "rate_limit_per_minute" in config:
                    return config["rate_limit_per_minute"]
            except Exception:
                pass
        
        return default_rate_limit

    async def is_provider_enabled(self, provider_name: str) -> bool:
        """Checks if a provider is enabled.
        
        Args:
            provider_name: The provider to check
            
        Returns:
            True if provider is enabled, False otherwise
        """
        if self._admin_settings:
            try:
                config = await self._admin_settings.get_provider_config(provider_name)
                if config and "is_enabled" in config:
                    return config["is_enabled"]
            except Exception:
                pass
        
        # Default to enabled if setting unavailable
        return True

    async def get_provider_priority(self, provider_name: str) -> int:
        """Gets the priority for a provider (lower = higher priority).
        
        Args:
            provider_name: The provider to get priority for
            
        Returns:
            Priority value, default: 0 for cloud_vision, 1 for gemini
        """
        default_priorities = {
            "cloud_vision": 0,  # Primary provider
            "gemini": 1,  # Fallback provider
        }
        
        if self._admin_settings:
            try:
                config = await self._admin_settings.get_provider_config(provider_name)
                if config and "priority" in config:
                    return config["priority"]
            except Exception:
                pass
        
        return default_priorities.get(provider_name, 99)

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    def _parse_float_setting(
        self, 
        value: str, 
        setting_name: str, 
        min_val: float, 
        max_val: float,
    ) -> float:
        """Parses and validates a float setting.
        
        Args:
            value: String value to parse
            setting_name: Name of setting (for error messages)
            min_val: Minimum allowed value
            max_val: Maximum allowed value
            
        Returns:
            Parsed float value
            
        Raises:
            InvalidConfigurationError: If value is invalid
        """
        try:
            parsed = float(value)
            if parsed < min_val or parsed > max_val:
                raise InvalidConfigurationError(
                    setting=setting_name,
                    reason=f"Value {parsed} out of range [{min_val}, {max_val}]",
                )
            return parsed
        except ValueError:
            raise InvalidConfigurationError(
                setting=setting_name,
                reason=f"Invalid float value: {value}",
            )

    def _parse_int_setting(
        self, 
        value: str, 
        setting_name: str, 
        min_val: int, 
        max_val: int,
    ) -> int:
        """Parses and validates an integer setting.
        
        Args:
            value: String value to parse
            setting_name: Name of setting (for error messages)
            min_val: Minimum allowed value
            max_val: Maximum allowed value
            
        Returns:
            Parsed integer value
            
        Raises:
            InvalidConfigurationError: If value is invalid
        """
        try:
            parsed = int(value)
            if parsed < min_val or parsed > max_val:
                raise InvalidConfigurationError(
                    setting=setting_name,
                    reason=f"Value {parsed} out of range [{min_val}, {max_val}]",
                )
            return parsed
        except ValueError:
            raise InvalidConfigurationError(
                setting=setting_name,
                reason=f"Invalid integer value: {value}",
            )


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================

_configuration_service: Optional[FaceConfigurationService] = None


def get_face_configuration_service() -> FaceConfigurationService:
    """Get singleton configuration service instance.
    
    Note: This returns a service without admin settings integration.
    For full functionality, create an instance with FaceAdminSettingsService.
    """
    global _configuration_service
    if _configuration_service is None:
        _configuration_service = FaceConfigurationService()
    return _configuration_service
