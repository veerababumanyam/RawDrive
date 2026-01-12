"""R2StorageService: Cloudflare R2 storage integration using boto3 (open-source).

Implements S3-compatible API for R2 with encrypted file storage.

Includes circuit breaker pattern for resilience against R2 service failures.
"""

from __future__ import annotations

import asyncio
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Optional, TypeVar
from uuid import UUID

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError, BotoCoreError

from src.config import settings

logger = logging.getLogger(__name__)

# Type variable for generic circuit breaker results
T = TypeVar("T")


class StorageError(Exception):
    """Base storage error."""

    def __init__(self, message: str, code: str = "STORAGE_ERROR"):
        super().__init__(message)
        self.code = code


class StorageUnavailableError(StorageError):
    """Raised when storage service is unavailable due to circuit breaker being open."""

    def __init__(
        self,
        message: str = "Storage service temporarily unavailable",
        recovery_time_remaining_ms: int = 0,
    ):
        super().__init__(message, code="STORAGE_UNAVAILABLE")
        self.recovery_time_remaining_ms = recovery_time_remaining_ms


# =============================================================================
# CIRCUIT BREAKER FOR R2 STORAGE
# =============================================================================


class StorageCircuitState(str, Enum):
    """Circuit breaker states for storage operations.

    - CLOSED: Normal operation, requests flow through to R2
    - OPEN: Failures exceeded threshold, requests rejected immediately
    - HALF_OPEN: Testing recovery, limited requests allowed through
    """
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class StorageCircuitBreakerConfig:
    """Configuration for storage circuit breaker behavior.

    Tuned for cloud storage characteristics (higher latency, transient failures).

    Attributes:
        failure_threshold: Number of consecutive failures before opening circuit
        recovery_time_ms: Time in ms to wait before attempting recovery
        half_open_requests: Number of successful requests needed to close circuit
        name: Optional name for logging and identification
    """
    failure_threshold: int = 5
    recovery_time_ms: int = 30000  # 30 seconds (shorter than AI providers)
    half_open_requests: int = 2   # Fewer successes needed for storage
    name: str = "r2_storage"

    def __post_init__(self) -> None:
        """Validate configuration values."""
        if self.failure_threshold < 1:
            raise ValueError("failure_threshold must be at least 1")
        if self.recovery_time_ms < 1000:
            raise ValueError("recovery_time_ms must be at least 1000ms")
        if self.half_open_requests < 1:
            raise ValueError("half_open_requests must be at least 1")


@dataclass
class StorageCircuitBreakerStats:
    """Statistics for storage circuit breaker monitoring.

    Useful for dashboards, Prometheus metrics, and alerting.
    """
    state: StorageCircuitState
    failure_count: int
    success_count: int
    last_failure_time: Optional[datetime]
    last_success_time: Optional[datetime]
    total_requests: int
    total_failures: int
    total_successes: int
    time_in_current_state_ms: int


class StorageCircuitBreaker:
    """Implements Circuit Breaker pattern for R2 storage operations.

    Prevents cascading failures when R2 becomes unavailable or unresponsive.
    When failures exceed the threshold, the circuit opens and rejects requests
    immediately without attempting R2 operations.

    Thread-safe implementation using asyncio locks.

    Example:
        breaker = StorageCircuitBreaker(StorageCircuitBreakerConfig(
            failure_threshold=5,
            recovery_time_ms=30000,
            half_open_requests=2,
            name="r2_uploads",
        ))

        try:
            result = await breaker.execute(lambda: storage.upload_file(...))
        except StorageUnavailableError:
            # Circuit is open, R2 temporarily unavailable
            pass
    """

    def __init__(self, config: Optional[StorageCircuitBreakerConfig] = None) -> None:
        """Initialize the storage circuit breaker.

        Args:
            config: Configuration for circuit breaker behavior (defaults provided)
        """
        self._config = config or StorageCircuitBreakerConfig()
        self._state = StorageCircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._half_open_successes = 0
        self._half_open_failures = 0
        self._last_failure_time: Optional[float] = None
        self._last_success_time: Optional[float] = None
        self._state_changed_at: float = time.time()

        # Statistics for monitoring
        self._total_requests = 0
        self._total_failures = 0
        self._total_successes = 0

        # Lock for thread-safe state management
        self._lock = asyncio.Lock()

        logger.info(
            f"Storage circuit breaker initialized: {self._config.name}",
            extra={
                "breaker_name": self._config.name,
                "failure_threshold": self._config.failure_threshold,
                "recovery_time_ms": self._config.recovery_time_ms,
                "half_open_requests": self._config.half_open_requests,
            },
        )

    @property
    def config(self) -> StorageCircuitBreakerConfig:
        """Get the circuit breaker configuration."""
        return self._config

    @property
    def state(self) -> StorageCircuitState:
        """Get the current circuit state."""
        return self._state

    @property
    def failure_count(self) -> int:
        """Get the current consecutive failure count."""
        return self._failure_count

    async def execute(
        self,
        operation: Callable[[], Any],
        operation_name: str = "storage_operation",
    ) -> T:
        """Execute a storage operation through the circuit breaker.

        Args:
            operation: The async callable to execute
            operation_name: Name for logging purposes

        Returns:
            The result of the operation

        Raises:
            StorageUnavailableError: If circuit is open
            StorageError: If operation fails
        """
        async with self._lock:
            self._total_requests += 1

            # Check if we should attempt recovery from open state
            if self._state == StorageCircuitState.OPEN:
                if self._should_attempt_recovery():
                    # Transition to half-open to test recovery
                    self._transition_to(StorageCircuitState.HALF_OPEN)
                    logger.info(
                        f"Storage circuit breaker entering half-open state for recovery test",
                        extra={
                            "breaker_name": self._config.name,
                            "operation": operation_name,
                        },
                    )
                else:
                    # Circuit is open - fail fast without calling R2
                    recovery_remaining = self._get_recovery_time_remaining()
                    logger.warning(
                        f"Storage circuit breaker is open, rejecting {operation_name}",
                        extra={
                            "breaker_name": self._config.name,
                            "state": self._state.value,
                            "recovery_in_ms": recovery_remaining,
                            "operation": operation_name,
                        },
                    )
                    raise StorageUnavailableError(
                        message=f"R2 storage temporarily unavailable, retry in {recovery_remaining}ms",
                        recovery_time_remaining_ms=recovery_remaining,
                    )

        # Execute the operation outside the lock to avoid blocking
        try:
            # Handle both sync and async operations
            if asyncio.iscoroutinefunction(operation):
                result = await operation()
            else:
                result = operation()
                # If result is a coroutine, await it
                if asyncio.iscoroutine(result):
                    result = await result

            # Record success
            async with self._lock:
                self._record_success(operation_name)

            return result

        except Exception as error:
            # Only count retryable errors toward circuit breaker
            if self._is_circuit_breaker_error(error):
                async with self._lock:
                    self._record_failure(operation_name, error)
            raise

    def _is_circuit_breaker_error(self, error: Exception) -> bool:
        """Determine if an error should count toward circuit breaker threshold.

        Only transient/server errors should trigger circuit breaker.
        Client errors (4xx) indicate bad requests, not service issues.

        Args:
            error: The exception to evaluate

        Returns:
            True if error should count toward circuit breaker threshold
        """
        if isinstance(error, ClientError):
            error_code = error.response.get("Error", {}).get("Code", "")
            http_status = error.response.get("ResponseMetadata", {}).get("HTTPStatusCode", 0)

            # Server errors (5xx) and throttling indicate service issues
            if http_status >= 500:
                return True
            if error_code in ("Throttling", "SlowDown", "ServiceUnavailable", "InternalError"):
                return True
            # Client errors (4xx) don't indicate service issues
            return False

        if isinstance(error, BotoCoreError):
            # Network/connection errors indicate service issues
            return True

        if isinstance(error, (ConnectionError, TimeoutError, OSError)):
            return True

        if isinstance(error, StorageError):
            # Don't count validation errors
            if error.code in ("INVALID_VARIANT", "FILE_NOT_FOUND"):
                return False
            return True

        return False

    def is_open(self) -> bool:
        """Check if the circuit breaker is currently open.

        Returns:
            True if circuit is open and should not accept requests
        """
        if self._state == StorageCircuitState.OPEN and self._should_attempt_recovery():
            return False
        return self._state == StorageCircuitState.OPEN

    def is_healthy(self) -> bool:
        """Check if the circuit breaker indicates healthy storage.

        Returns:
            True if circuit is closed (healthy)
        """
        return self._state == StorageCircuitState.CLOSED

    def get_stats(self) -> StorageCircuitBreakerStats:
        """Get statistics for monitoring and metrics.

        Returns:
            StorageCircuitBreakerStats with current metrics
        """
        return StorageCircuitBreakerStats(
            state=self._state,
            failure_count=self._failure_count,
            success_count=self._success_count,
            last_failure_time=(
                datetime.fromtimestamp(self._last_failure_time, tz=timezone.utc)
                if self._last_failure_time else None
            ),
            last_success_time=(
                datetime.fromtimestamp(self._last_success_time, tz=timezone.utc)
                if self._last_success_time else None
            ),
            total_requests=self._total_requests,
            total_failures=self._total_failures,
            total_successes=self._total_successes,
            time_in_current_state_ms=int((time.time() - self._state_changed_at) * 1000),
        )

    def _should_attempt_recovery(self) -> bool:
        """Determine if enough time has passed to attempt recovery.

        Returns:
            True if recovery should be attempted
        """
        if self._last_failure_time is None:
            return False

        elapsed_ms = (time.time() - self._last_failure_time) * 1000
        return elapsed_ms >= self._config.recovery_time_ms

    def _get_recovery_time_remaining(self) -> int:
        """Calculate remaining time until recovery attempt (in ms).

        Returns:
            Milliseconds until recovery, or 0 if ready
        """
        if self._last_failure_time is None:
            return 0

        elapsed_ms = (time.time() - self._last_failure_time) * 1000
        return max(0, int(self._config.recovery_time_ms - elapsed_ms))

    def _record_success(self, operation_name: str) -> None:
        """Record a successful operation.

        Args:
            operation_name: Name of the operation for logging
        """
        self._success_count += 1
        self._total_successes += 1
        self._last_success_time = time.time()

        if self._state == StorageCircuitState.HALF_OPEN:
            self._half_open_successes += 1

            logger.debug(
                f"Storage circuit breaker half-open success: {operation_name}",
                extra={
                    "breaker_name": self._config.name,
                    "half_open_successes": self._half_open_successes,
                    "required": self._config.half_open_requests,
                    "operation": operation_name,
                },
            )

            # Check if we've had enough successes to close the circuit
            if self._half_open_successes >= self._config.half_open_requests:
                self._transition_to(StorageCircuitState.CLOSED)

        elif self._state == StorageCircuitState.CLOSED:
            # Reset failure count on success in closed state
            self._failure_count = 0

    def _record_failure(self, operation_name: str, error: Exception) -> None:
        """Record a failed operation.

        Args:
            operation_name: Name of the operation for logging
            error: The exception that occurred
        """
        self._failure_count += 1
        self._total_failures += 1
        self._last_failure_time = time.time()

        if self._state == StorageCircuitState.HALF_OPEN:
            # Any failure in half-open immediately reopens the circuit
            self._half_open_failures += 1
            logger.warning(
                f"Storage circuit breaker half-open failure, reopening: {operation_name}",
                extra={
                    "breaker_name": self._config.name,
                    "operation": operation_name,
                    "error": str(error),
                },
            )
            self._transition_to(StorageCircuitState.OPEN)

        elif self._failure_count >= self._config.failure_threshold:
            # Threshold exceeded - open the circuit
            logger.warning(
                f"Storage circuit breaker failure threshold exceeded, opening circuit",
                extra={
                    "breaker_name": self._config.name,
                    "failure_count": self._failure_count,
                    "threshold": self._config.failure_threshold,
                    "operation": operation_name,
                    "error": str(error),
                },
            )
            self._transition_to(StorageCircuitState.OPEN)

    def _transition_to(self, new_state: StorageCircuitState) -> None:
        """Transition to a new state with logging and counter reset.

        Args:
            new_state: The state to transition to
        """
        previous_state = self._state
        self._state = new_state
        self._state_changed_at = time.time()

        # Reset counters based on new state
        if new_state == StorageCircuitState.CLOSED:
            self._failure_count = 0
            self._success_count = 0
            self._half_open_successes = 0
            self._half_open_failures = 0
        elif new_state == StorageCircuitState.HALF_OPEN:
            self._half_open_successes = 0
            self._half_open_failures = 0

        logger.info(
            f"Storage circuit breaker state transition: {previous_state.value} -> {new_state.value}",
            extra={
                "breaker_name": self._config.name,
                "previous_state": previous_state.value,
                "new_state": new_state.value,
                "failure_count": self._failure_count,
                "last_failure": (
                    datetime.fromtimestamp(self._last_failure_time, tz=timezone.utc).isoformat()
                    if self._last_failure_time else None
                ),
            },
        )

    def reset(self) -> None:
        """Manually reset the circuit breaker to closed state.

        Use with caution - typically for admin override scenarios.
        """
        logger.info(
            f"Storage circuit breaker manually reset",
            extra={
                "breaker_name": self._config.name,
                "previous_state": self._state.value,
            },
        )
        self._transition_to(StorageCircuitState.CLOSED)
        self._last_failure_time = None

    def force_open(self) -> None:
        """Manually open the circuit breaker.

        Useful for maintenance or known R2 issues.
        """
        logger.info(
            f"Storage circuit breaker manually opened",
            extra={
                "breaker_name": self._config.name,
                "previous_state": self._state.value,
            },
        )
        self._transition_to(StorageCircuitState.OPEN)
        self._last_failure_time = time.time()


class R2StorageService:
    """Service for Cloudflare R2 storage operations using boto3 (open-source).

    Features:
    - S3-compatible API for Cloudflare R2
    - Circuit breaker pattern for resilience against service failures
    - Multipart uploads for large files
    - Thread-pool execution for async compatibility
    """

    def __init__(
        self,
        circuit_breaker_config: Optional[StorageCircuitBreakerConfig] = None,
    ):
        """Initialize R2 storage service with credentials from settings.

        Args:
            circuit_breaker_config: Optional custom circuit breaker configuration.
                                   Defaults are tuned for R2 storage characteristics.
        """
        from src.config import settings

        self.settings = settings
        self._s3_client = None
        self.bucket_name = settings.R2_BUCKET_NAME
        # Thread pool for running synchronous boto3 operations
        self.executor = ThreadPoolExecutor(max_workers=10)

        # Initialize circuit breaker for resilience
        self._circuit_breaker = StorageCircuitBreaker(
            circuit_breaker_config or StorageCircuitBreakerConfig(
                failure_threshold=5,
                recovery_time_ms=30000,  # 30 seconds
                half_open_requests=2,
                name="r2_storage",
            )
        )

        # Lazy initialization - only create boto3 client when actually needed
        # In development, allow missing credentials (will fail on actual use)
        if not settings.DEBUG:
            self._initialize_client()

    @property
    def circuit_breaker(self) -> StorageCircuitBreaker:
        """Get the circuit breaker instance for monitoring/admin operations."""
        return self._circuit_breaker
    
    def _initialize_client(self):
        """Initialize boto3 S3 client for R2."""
        if self._s3_client is not None:
            return
            
        settings = self.settings
        
        # Build endpoint URL - use R2_ENDPOINT from config
        endpoint_url = settings.R2_ENDPOINT
        if not endpoint_url:
            logger.warning("R2_ENDPOINT not configured - R2 storage operations will fail")
            return

        # Initialize boto3 S3 client for R2 (S3-compatible API)
        self._s3_client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            config=Config(
                signature_version="s3v4",
                s3={
                    "addressing_style": "path",
                },
            ),
        )
    
    @property
    def s3_client(self):
        """Lazy-initialize and return S3 client."""
        if self._s3_client is None:
            self._initialize_client()
        return self._s3_client

    async def _execute_with_circuit_breaker(
        self,
        operation: Callable[[], Any],
        operation_name: str,
    ) -> Any:
        """Execute a storage operation through the circuit breaker.

        This wrapper provides circuit breaker protection for R2 operations.
        When the circuit is open (too many failures), operations fail fast
        without attempting to call R2.

        Args:
            operation: Async callable to execute
            operation_name: Name for logging and metrics

        Returns:
            Result of the operation

        Raises:
            StorageUnavailableError: If circuit breaker is open
            StorageError: If operation fails
        """
        return await self._circuit_breaker.execute(operation, operation_name)

    def _build_object_key(
        self,
        workspace_id: UUID,
        gallery_id: Optional[UUID],
        asset_id: UUID,
        variant: str,
        filename: str,
    ) -> str:
        """Build object key for R2 storage.

        Format: galleries/{gallery_id}/{variant}/{asset_id}/{filename}.enc

        Args:
            workspace_id: Workspace UUID (for validation)
            gallery_id: Gallery UUID or None (for library)
            asset_id: Asset UUID
            variant: Media variant ('thumbnail', 'preview', 'original')
            filename: Original filename

        Returns:
            Object key string
        """
        # Validate variant
        valid_variants = {"thumbnail", "medium", "preview", "original"}
        if variant not in valid_variants:
            raise StorageError(
                f"Invalid variant: {variant}. Must be one of {valid_variants}",
                "INVALID_VARIANT",
            )

        # Ensure filename has .enc extension for encrypted files
        if not filename.endswith(".enc"):
            # Add .enc extension
            base_name = filename.rsplit(".", 1)[0] if "." in filename else filename
            filename = f"{base_name}.enc"

        if gallery_id:
             return f"workspaces/{workspace_id}/galleries/{gallery_id}/{variant}/{asset_id}/{filename}"
        else:
             return f"workspaces/{workspace_id}/library/{variant}/{asset_id}/{filename}"

    # Threshold for using multipart upload (10MB)
    MULTIPART_THRESHOLD = 10 * 1024 * 1024
    # Size of each part in multipart uploads (5MB - S3 minimum)
    MULTIPART_PART_SIZE = 5 * 1024 * 1024

    async def upload_encrypted_file(
        self,
        workspace_id: UUID,
        gallery_id: Optional[UUID],
        asset_id: UUID,
        variant: str,
        filename: str,
        encrypted_data: bytes,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Upload encrypted file to R2 with circuit breaker protection.

        Automatically uses multipart upload for files > 10MB to improve
        memory efficiency and enable parallel uploads.

        Circuit breaker protection prevents cascading failures when R2
        is unavailable or experiencing issues.

        Args:
            workspace_id: Workspace UUID
            gallery_id: Gallery UUID
            asset_id: Asset UUID
            variant: Media variant ('thumbnail', 'preview', 'original')
            filename: Original filename
            encrypted_data: Encrypted file bytes
            content_type: MIME type of encrypted content

        Returns:
            Object key in R2

        Raises:
            StorageUnavailableError: If circuit breaker is open
            StorageError: If upload fails
        """
        object_key = self._build_object_key(
            workspace_id, gallery_id, asset_id, variant, filename
        )

        async def _do_upload():
            # Use multipart upload for large files
            if len(encrypted_data) > self.MULTIPART_THRESHOLD:
                await self._upload_large_file_multipart_internal(
                    object_key=object_key,
                    data=encrypted_data,
                    content_type=content_type,
                )
                logger.info(
                    f"Uploaded encrypted file to R2 (multipart): {object_key} "
                    f"(workspace={workspace_id}, asset={asset_id}, variant={variant}, "
                    f"size={len(encrypted_data)})"
                )
            else:
                # Standard single-request upload for smaller files
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(
                    self.executor,
                    lambda: self.s3_client.put_object(
                        Bucket=self.bucket_name,
                        Key=object_key,
                        Body=encrypted_data,
                        ContentType=content_type,
                        Metadata={
                            "workspace_id": str(workspace_id),
                            "gallery_id": str(gallery_id) if gallery_id else "library",
                            "asset_id": str(asset_id),
                            "variant": variant,
                        },
                    ),
                )
                logger.info(
                    f"Uploaded encrypted file to R2: {object_key} "
                    f"(workspace={workspace_id}, asset={asset_id}, variant={variant})"
                )
            return object_key

        try:
            return await self._execute_with_circuit_breaker(
                _do_upload,
                f"upload_encrypted_file:{variant}",
            )
        except StorageUnavailableError:
            # Re-raise circuit breaker errors as-is
            raise
        except (ClientError, BotoCoreError) as e:
            logger.error(f"Failed to upload to R2: {e}")
            raise StorageError(f"Upload failed: {e}", "UPLOAD_FAILED") from e

    async def upload_bytes(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Upload raw bytes to R2 with circuit breaker protection.

        This method is used for uploading non-encrypted content like
        face thumbnails or other derived assets.

        Args:
            key: Full object key path in R2
            data: Raw bytes to upload
            content_type: MIME type of the content

        Returns:
            Object key in R2

        Raises:
            StorageUnavailableError: If circuit breaker is open
            StorageError: If upload fails
        """
        async def _do_upload():
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.put_object(
                    Bucket=self.bucket_name,
                    Key=key,
                    Body=data,
                    ContentType=content_type,
                ),
            )
            logger.debug(f"Uploaded bytes to R2: {key}")
            return key

        try:
            return await self._execute_with_circuit_breaker(
                _do_upload,
                "upload_bytes",
            )
        except StorageUnavailableError:
            raise
        except (ClientError, BotoCoreError) as e:
            logger.error(f"Failed to upload bytes to R2: {e}")
            raise StorageError(f"Upload failed: {e}", "UPLOAD_FAILED") from e

    async def download_encrypted_file(
        self,
        workspace_id: UUID,
        gallery_id: Optional[UUID],
        asset_id: UUID,
        variant: str,
        filename: str,
    ) -> bytes:
        """Download encrypted file from R2 with circuit breaker protection.

        Args:
            workspace_id: Workspace UUID
            gallery_id: Gallery UUID
            asset_id: Asset UUID
            variant: Media variant ('thumbnail', 'preview', 'original')
            filename: Original filename

        Returns:
            Encrypted file bytes

        Raises:
            StorageUnavailableError: If circuit breaker is open
            StorageError: If download fails or file not found
        """
        object_key = self._build_object_key(
            workspace_id, gallery_id, asset_id, variant, filename
        )

        async def _do_download():
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.get_object(Bucket=self.bucket_name, Key=object_key),
            )
            encrypted_data = await loop.run_in_executor(
                self.executor,
                lambda: response["Body"].read(),
            )
            logger.debug(
                f"Downloaded encrypted file from R2: {object_key} "
                f"(workspace={workspace_id}, asset={asset_id}, variant={variant})"
            )
            return encrypted_data

        try:
            return await self._execute_with_circuit_breaker(
                _do_download,
                f"download_encrypted_file:{variant}",
            )
        except StorageUnavailableError:
            raise
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "Unknown")
            if error_code == "NoSuchKey":
                raise StorageError(
                    f"File not found: {object_key}",
                    "FILE_NOT_FOUND",
                ) from e
            logger.error(f"Failed to download from R2: {e}")
            raise StorageError(f"Download failed: {e}", "DOWNLOAD_FAILED") from e
        except BotoCoreError as e:
            logger.error(f"R2 client error: {e}")
            raise StorageError(f"Storage error: {e}", "STORAGE_ERROR") from e

    async def download_by_object_key(self, object_key: str) -> bytes:
        """Download encrypted file from R2 by raw object key with circuit breaker protection.

        This method is useful when you have the full object key from the database.
        The object key should NOT include .enc extension - it will be added automatically.

        Args:
            object_key: Full object key path (without .enc extension)

        Returns:
            Encrypted file bytes

        Raises:
            StorageUnavailableError: If circuit breaker is open
            StorageError: If download fails or file not found
        """
        # Add .enc extension if not present (encrypted files have .enc suffix)
        if not object_key.endswith(".enc"):
            # Get base name without extension and add .enc
            if "." in object_key.rsplit("/", 1)[-1]:
                base = object_key.rsplit(".", 1)[0]
                key_with_enc = f"{base}.enc"
            else:
                key_with_enc = f"{object_key}.enc"
        else:
            key_with_enc = object_key

        async def _do_download():
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.get_object(Bucket=self.bucket_name, Key=key_with_enc),
            )
            encrypted_data = await loop.run_in_executor(
                self.executor,
                lambda: response["Body"].read(),
            )
            logger.debug(f"Downloaded encrypted file from R2: {key_with_enc}")
            return encrypted_data

        try:
            return await self._execute_with_circuit_breaker(
                _do_download,
                "download_by_object_key",
            )
        except StorageUnavailableError:
            raise
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "Unknown")
            if error_code == "NoSuchKey":
                raise StorageError(
                    f"File not found: {key_with_enc}",
                    "FILE_NOT_FOUND",
                ) from e
            logger.error(f"Failed to download from R2: {e}")
            raise StorageError(f"Download failed: {e}", "DOWNLOAD_FAILED") from e
        except BotoCoreError as e:
            logger.error(f"R2 client error: {e}")
            raise StorageError(f"Storage error: {e}", "STORAGE_ERROR") from e

    async def delete_file(
        self,
        workspace_id: UUID,
        gallery_id: Optional[UUID],
        asset_id: UUID,
        variant: str,
        filename: str,
    ) -> None:
        """Delete file from R2 with circuit breaker protection.

        Args:
            workspace_id: Workspace UUID
            gallery_id: Gallery UUID
            asset_id: Asset UUID
            variant: Media variant ('thumbnail', 'preview', 'original')
            filename: Original filename

        Raises:
            StorageUnavailableError: If circuit breaker is open
            StorageError: If deletion fails
        """
        object_key = self._build_object_key(
            workspace_id, gallery_id, asset_id, variant, filename
        )

        async def _do_delete():
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.delete_object(Bucket=self.bucket_name, Key=object_key),
            )
            logger.info(
                f"Deleted file from R2: {object_key} "
                f"(workspace={workspace_id}, asset={asset_id}, variant={variant})"
            )

        try:
            await self._execute_with_circuit_breaker(
                _do_delete,
                f"delete_file:{variant}",
            )
        except StorageUnavailableError:
            raise
        except (ClientError, BotoCoreError) as e:
            logger.error(f"Failed to delete from R2: {e}")
            raise StorageError(f"Deletion failed: {e}", "DELETE_FAILED") from e

    async def file_exists(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        asset_id: UUID,
        variant: str,
        filename: str,
    ) -> bool:
        """Check if file exists in R2 with circuit breaker protection.

        Args:
            workspace_id: Workspace UUID
            gallery_id: Gallery UUID
            asset_id: Asset UUID
            variant: Media variant ('thumbnail', 'preview', 'original')
            filename: Original filename

        Returns:
            True if file exists, False otherwise

        Raises:
            StorageUnavailableError: If circuit breaker is open
            StorageError: If check fails (other than 404)
        """
        object_key = self._build_object_key(
            workspace_id, gallery_id, asset_id, variant, filename
        )

        async def _do_check():
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.head_object(Bucket=self.bucket_name, Key=object_key),
            )
            return True

        try:
            return await self._execute_with_circuit_breaker(
                _do_check,
                "file_exists",
            )
        except StorageUnavailableError:
            raise
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "Unknown")
            if error_code == "404":
                return False
            # Re-raise other errors
            raise StorageError(f"Failed to check file existence: {e}", "CHECK_FAILED") from e

    async def delete_object(self, object_key: str) -> None:
        """Delete an object from R2 by key with circuit breaker protection.

        This generic delete method works with any object key.

        Args:
            object_key: Full object key path in R2

        Raises:
            StorageUnavailableError: If circuit breaker is open
            StorageError: If deletion fails
        """
        async def _do_delete():
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.delete_object(
                    Bucket=self.bucket_name,
                    Key=object_key,
                ),
            )
            logger.debug(f"Deleted object from R2: {object_key}")

        try:
            await self._execute_with_circuit_breaker(
                _do_delete,
                "delete_object",
            )
        except StorageUnavailableError:
            raise
        except (ClientError, BotoCoreError) as e:
            logger.error(f"Failed to delete object from R2: {e}")
            raise StorageError(f"Deletion failed: {e}", "DELETE_FAILED") from e

    async def generate_presigned_put_url(
        self,
        object_key: str,
        content_type: str,
        expiry_seconds: int = 3600,
    ) -> str:
        """Generate a presigned URL for uploading (PUT) an object.

        Args:
            object_key: R2 object key
            content_type: Content-Type header value (must match client upload)
            expiry_seconds: URL expiry time in seconds

        Returns:
            Presigned URL for PUT request
        """
        loop = asyncio.get_event_loop()
        url = await loop.run_in_executor(
            self.executor,
            lambda: self.s3_client.generate_presigned_url(
                "put_object",
                Params={
                    "Bucket": self.bucket_name,
                    "Key": object_key,
                    "ContentType": content_type,
                },
                ExpiresIn=expiry_seconds,
            ),
        )
        return url

    async def generate_presigned_get_url(
        self,
        object_key: str,
        expiry_seconds: int = 3600,
    ) -> str:
        """Generate a presigned URL for downloading (GET) an object.

        Args:
            object_key: R2 object key
            expiry_seconds: URL expiry time in seconds

        Returns:
            Presigned URL for GET request
        """
        loop = asyncio.get_event_loop()
        url = await loop.run_in_executor(
            self.executor,
            lambda: self.s3_client.generate_presigned_url(
                "get_object",
                Params={
                    "Bucket": self.bucket_name,
                    "Key": object_key,
                },
                ExpiresIn=expiry_seconds,
            ),
        )
        return url

    # -------------------------------------------------------------------------
    # Multipart Upload Methods (Phase 4.1 - Upload Performance)
    # -------------------------------------------------------------------------

    async def create_multipart_upload(
        self,
        object_key: str,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Create a multipart upload session with circuit breaker protection.

        Used for large files (>10MB) to upload in chunks.

        Args:
            object_key: R2 object key
            content_type: MIME type of the content

        Returns:
            Upload ID for the multipart upload session

        Raises:
            StorageUnavailableError: If circuit breaker is open
            StorageError: If creation fails
        """
        async def _do_create():
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.create_multipart_upload(
                    Bucket=self.bucket_name,
                    Key=object_key,
                    ContentType=content_type,
                ),
            )
            upload_id = response["UploadId"]
            logger.debug(f"Created multipart upload: {object_key} (upload_id={upload_id})")
            return upload_id

        try:
            return await self._execute_with_circuit_breaker(
                _do_create,
                "create_multipart_upload",
            )
        except StorageUnavailableError:
            raise
        except (ClientError, BotoCoreError) as e:
            logger.error(f"Failed to create multipart upload: {e}")
            raise StorageError(f"Multipart create failed: {e}", "MULTIPART_CREATE_FAILED") from e

    async def upload_part(
        self,
        object_key: str,
        upload_id: str,
        part_number: int,
        data: bytes,
    ) -> dict:
        """Upload a single part of a multipart upload with circuit breaker protection.

        Part numbers start at 1 and go up to 10,000.
        Each part must be at least 5MB (except the last part).

        Args:
            object_key: R2 object key
            upload_id: Multipart upload ID from create_multipart_upload
            part_number: Part number (1-10000)
            data: Part data bytes

        Returns:
            Dict with ETag and PartNumber for complete_multipart_upload

        Raises:
            StorageUnavailableError: If circuit breaker is open
            StorageError: If upload fails
        """
        async def _do_upload_part():
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.upload_part(
                    Bucket=self.bucket_name,
                    Key=object_key,
                    UploadId=upload_id,
                    PartNumber=part_number,
                    Body=data,
                ),
            )
            etag = response["ETag"]
            logger.debug(
                f"Uploaded part {part_number} for {object_key} "
                f"(size={len(data)}, etag={etag})"
            )
            return {"ETag": etag, "PartNumber": part_number}

        try:
            return await self._execute_with_circuit_breaker(
                _do_upload_part,
                f"upload_part:{part_number}",
            )
        except StorageUnavailableError:
            raise
        except (ClientError, BotoCoreError) as e:
            logger.error(f"Failed to upload part {part_number}: {e}")
            raise StorageError(f"Part upload failed: {e}", "PART_UPLOAD_FAILED") from e

    async def complete_multipart_upload(
        self,
        object_key: str,
        upload_id: str,
        parts: list[dict],
    ) -> str:
        """Complete a multipart upload with circuit breaker protection.

        Must be called after all parts are uploaded successfully.

        Args:
            object_key: R2 object key
            upload_id: Multipart upload ID
            parts: List of {"ETag": ..., "PartNumber": ...} from upload_part

        Returns:
            Object ETag

        Raises:
            StorageUnavailableError: If circuit breaker is open
            StorageError: If completion fails
        """
        async def _do_complete():
            # Sort parts by PartNumber (required by S3)
            sorted_parts = sorted(parts, key=lambda p: p["PartNumber"])

            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.complete_multipart_upload(
                    Bucket=self.bucket_name,
                    Key=object_key,
                    UploadId=upload_id,
                    MultipartUpload={"Parts": sorted_parts},
                ),
            )
            etag = response.get("ETag", "")
            logger.info(f"Completed multipart upload: {object_key} (etag={etag})")
            return etag

        try:
            return await self._execute_with_circuit_breaker(
                _do_complete,
                "complete_multipart_upload",
            )
        except StorageUnavailableError:
            raise
        except (ClientError, BotoCoreError) as e:
            logger.error(f"Failed to complete multipart upload: {e}")
            raise StorageError(f"Multipart complete failed: {e}", "MULTIPART_COMPLETE_FAILED") from e

    async def abort_multipart_upload(
        self,
        object_key: str,
        upload_id: str,
    ) -> None:
        """Abort a multipart upload.

        Called when an upload fails partway through to clean up.
        Note: Abort does not use circuit breaker to allow cleanup even when breaker is open.

        Args:
            object_key: R2 object key
            upload_id: Multipart upload ID

        Raises:
            StorageError: If abort fails
        """
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.abort_multipart_upload(
                    Bucket=self.bucket_name,
                    Key=object_key,
                    UploadId=upload_id,
                ),
            )
            logger.info(f"Aborted multipart upload: {object_key} (upload_id={upload_id})")
        except (ClientError, BotoCoreError) as e:
            logger.warning(f"Failed to abort multipart upload (may already be complete): {e}")

    async def upload_large_file_multipart(
        self,
        object_key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
        part_size: int = 5 * 1024 * 1024,  # 5MB default
    ) -> str:
        """Upload a large file using multipart upload.

        Convenience method that handles the full multipart workflow.

        Args:
            object_key: R2 object key
            data: Complete file bytes
            content_type: MIME type
            part_size: Size of each part (min 5MB)

        Returns:
            Object ETag

        Raises:
            StorageError: If upload fails
        """
        upload_id = await self.create_multipart_upload(object_key, content_type)

        try:
            parts = []
            total_size = len(data)
            part_number = 1

            for offset in range(0, total_size, part_size):
                chunk = data[offset:offset + part_size]
                part_info = await self.upload_part(
                    object_key, upload_id, part_number, chunk
                )
                parts.append(part_info)
                part_number += 1

            return await self.complete_multipart_upload(object_key, upload_id, parts)
        except Exception as e:
            # Clean up on failure
            await self.abort_multipart_upload(object_key, upload_id)
            raise


# Export singleton instance
_r2_storage_service: Optional[R2StorageService] = None

# Export constants
MULTIPART_PART_SIZE = R2StorageService.MULTIPART_PART_SIZE


def get_r2_storage_service() -> R2StorageService:
    """Get singleton R2 storage service instance."""
    global _r2_storage_service
    if _r2_storage_service is None:
        _r2_storage_service = R2StorageService()
    return _r2_storage_service

