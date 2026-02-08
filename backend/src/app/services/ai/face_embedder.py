"""Face Embedder service using ArcFace (buffalo_l) ONNX model.

This module provides 512-dimensional face embeddings using the InsightFace ArcFace model
(w600k_r50.onnx) running via OpenCV DNN. This enables local face recognition and clustering.

Features:
- Retry logic with exponential backoff for model download
- Model validation after download
- Circuit breaker pattern for fault tolerance
- Proper error handling and recovery
"""

import asyncio
import hashlib
import logging
import os
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path
from typing import Any, Optional

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# InsightFace Buffalo_L Model Pack (contains w600k_r50.onnx and det_10g.onnx)
MODEL_URL = "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip"
MODEL_DIR = Path("/app/models/face_recognition")
MODEL_FILENAME = "w600k_r50.onnx"

# Expected model file hash for validation (SHA-256 of w600k_r50.onnx)
# This is a security measure to ensure the downloaded model is intact
EXPECTED_MODEL_HASH = None  # Set to actual hash if available

# Retry configuration
MAX_DOWNLOAD_RETRIES = 3
DOWNLOAD_TIMEOUT_SECONDS = 300  # 5 minutes
BASE_RETRY_DELAY = 2.0  # seconds
MAX_RETRY_DELAY = 30.0  # seconds

# Circuit breaker configuration
CIRCUIT_FAILURE_THRESHOLD = 3
CIRCUIT_RECOVERY_TIMEOUT = 60  # seconds


class ModelLoadError(Exception):
    """Raised when model loading fails after retries."""
    pass


class ModelValidationError(Exception):
    """Raised when model validation fails."""
    pass


class FaceEmbedder:
    """Generates face embeddings using ArcFace ONNX model.

    Implements retry logic, circuit breaker pattern, and model validation
    for robust operation in production environments.
    """

    def __init__(self):
        self._net = None
        self._initialized = False
        self._init_lock = asyncio.Lock()

        # Circuit breaker state
        self._circuit_failure_count = 0
        self._circuit_last_failure_time: Optional[float] = None
        self._circuit_open_until: Optional[float] = None

        # Model validation state
        self._model_validated = False
        self._model_hash: Optional[str] = None

    def _is_circuit_open(self) -> bool:
        """Check if the circuit breaker is currently open.

        Returns:
            True if circuit is open (should not attempt operations), False otherwise
        """
        if self._circuit_open_until is None:
            return False

        # Check if recovery timeout has passed
        if time.time() >= self._circuit_open_until:
            # Reset circuit breaker
            logger.info("Circuit breaker recovery timeout expired, resetting")
            self._circuit_failure_count = 0
            self._circuit_open_until = None
            self._circuit_last_failure_time = None
            return False

        return True

    def _record_success(self):
        """Record a successful operation, resetting circuit breaker state."""
        if self._circuit_failure_count > 0:
            logger.info("Model operation succeeded, resetting circuit breaker")
            self._circuit_failure_count = 0
            self._circuit_open_until = None
            self._circuit_last_failure_time = None

    def _record_failure(self):
        """Record a failed operation, potentially opening the circuit breaker."""
        self._circuit_failure_count += 1
        self._circuit_last_failure_time = time.time()

        logger.warning(
            f"Model operation failed (failure {self._circuit_failure_count}/{CIRCUIT_FAILURE_THRESHOLD})"
        )

        if self._circuit_failure_count >= CIRCUIT_FAILURE_THRESHOLD:
            # Open circuit breaker
            self._circuit_open_until = time.time() + CIRCUIT_RECOVERY_TIMEOUT
            logger.error(
                f"Circuit breaker opened due to {self._circuit_failure_count} failures. "
                f"Will retry operations after {CIRCUIT_RECOVERY_TIMEOUT} seconds."
            )

    async def ensure_initialized(self) -> bool:
        """Ensure the model is downloaded and loaded.

        Returns:
            True if initialization successful, False if circuit breaker is open

        Raises:
            ModelLoadError: If model loading fails after all retries
        """
        if self._initialized:
            return True

        # Check circuit breaker first
        if self._is_circuit_open():
            logger.warning("Cannot initialize: circuit breaker is open")
            return False

        async with self._init_lock:
            if self._initialized:
                return True

            # Double-check circuit breaker after acquiring lock
            if self._is_circuit_open():
                return False

            try:
                await self._load_model_with_retry()
                self._initialized = True
                self._record_success()
                logger.info("Face embedder initialized successfully")
                return True
            except Exception as e:
                self._record_failure()
                raise ModelLoadError(f"Face embedder initialization failed: {e}") from e

    def _calculate_retry_delay(self, attempt: int) -> float:
        """Calculate exponential backoff delay for retry.

        Args:
            attempt: The attempt number (0-indexed)

        Returns:
            Delay in seconds
        """
        delay = min(BASE_RETRY_DELAY * (2 ** attempt), MAX_RETRY_DELAY)
        # Add small jitter to avoid thundering herd
        import random
        jitter = random.uniform(0.1, 0.3) * delay
        return delay + jitter

    async def _load_model_with_retry(self):
        """Download and load the ONNX model with retry logic.

        Raises:
            ModelLoadError: If model loading fails after all retries
        """
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        model_path = MODEL_DIR / MODEL_FILENAME

        last_error = None

        for attempt in range(MAX_DOWNLOAD_RETRIES):
            try:
                # Check if model already exists and is valid
                if model_path.exists():
                    if self._validate_model_file(model_path):
                        logger.info(f"Using existing validated model: {model_path}")
                        await self._load_onnx_model(model_path)
                        return
                    else:
                        logger.warning("Existing model file validation failed, re-downloading")
                        model_path.unlink(missing_ok=True)

                # Download model
                await self._download_model()

                # Validate downloaded model
                if not self._validate_model_file(model_path):
                    raise ModelValidationError(f"Model validation failed for {model_path}")

                # Load into memory
                await self._load_onnx_model(model_path)
                logger.info("Face recognition model loaded successfully")
                return

            except Exception as e:
                last_error = e
                logger.warning(
                    f"Model load attempt {attempt + 1}/{MAX_DOWNLOAD_RETRIES} failed: {e}"
                )

                # Don't wait after the last attempt
                if attempt < MAX_DOWNLOAD_RETRIES - 1:
                    delay = self._calculate_retry_delay(attempt)
                    logger.info(f"Retrying in {delay:.2f} seconds...")
                    await asyncio.sleep(delay)

        # All retries failed
        raise ModelLoadError(f"Failed to load model after {MAX_DOWNLOAD_RETRIES} attempts. Last error: {last_error}")

    async def _download_model(self):
        """Download the model zip file with timeout.

        Raises:
            RuntimeError: If download fails
        """
        zip_path = MODEL_DIR / "buffalo_l.zip"
        logger.info(f"Downloading face recognition model from {MODEL_URL}...")

        def download_with_timeout():
            """Synchronous download with timeout."""
            try:
                # Use urllib with timeout
                import socket
                socket.setdefaulttimeout(DOWNLOAD_TIMEOUT_SECONDS)
                urllib.request.urlretrieve(MODEL_URL, str(zip_path))
            finally:
                socket.setdefaulttimeout(None)  # Reset timeout

        await asyncio.to_thread(download_with_timeout)

        # Verify zip file was downloaded
        if not zip_path.exists() or zip_path.stat().st_size == 0:
            raise RuntimeError(f"Download failed: {zip_path} is empty or does not exist")

        logger.info(f"Downloaded {zip_path.stat().st_size} bytes")

        # Extract zip
        logger.info("Extracting model...")
        await asyncio.to_thread(self._extract_zip, zip_path)

        # Cleanup zip
        zip_path.unlink()
        logger.info("Model extracted successfully")

    def _extract_zip(self, zip_path: Path):
        """Extract zip file synchronously."""
        with zipfile.ZipFile(zip_path, 'r') as z:
            # Validate zip structure
            namelist = z.namelist()
            logger.debug(f"Zip contains {len(namelist)} files")

            # Extract
            z.extractall(MODEL_DIR)

    def _validate_model_file(self, model_path: Path) -> bool:
        """Validate the downloaded model file.

        Checks:
        1. File exists and is not empty
        2. File has reasonable size (w600k_r50.onnx is ~100MB)
        3. Optional: SHA-256 hash verification

        Args:
            model_path: Path to the model file

        Returns:
            True if validation passes, False otherwise
        """
        try:
            if not model_path.exists():
                logger.warning(f"Model file does not exist: {model_path}")
                return False

            file_size = model_path.stat().st_size

            # Check file size (w600k_r50.onnx is typically 90-110MB)
            if file_size < 50 * 1024 * 1024:  # Less than 50MB is suspicious
                logger.warning(f"Model file too small: {file_size} bytes")
                return False
            if file_size > 200 * 1024 * 1024:  # More than 200MB is suspicious
                logger.warning(f"Model file too large: {file_size} bytes")
                return False

            # Optional: Verify hash if EXPECTED_MODEL_HASH is set
            if EXPECTED_MODEL_HASH:
                file_hash = self._calculate_file_hash(model_path)
                if file_hash != EXPECTED_MODEL_HASH:
                    logger.error(f"Model hash mismatch: expected {EXPECTED_MODEL_HASH}, got {file_hash}")
                    return False
                self._model_hash = file_hash

            logger.debug(f"Model validation passed: {model_path} ({file_size} bytes)")
            return True

        except Exception as e:
            logger.error(f"Model validation error: {e}")
            return False

    def _calculate_file_hash(self, file_path: Path) -> str:
        """Calculate SHA-256 hash of a file.

        Args:
            file_path: Path to the file

        Returns:
            Hex-encoded SHA-256 hash
        """
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()

    async def _load_onnx_model(self, model_path: Path):
        """Load ONNX model into OpenCV DNN.

        Args:
            model_path: Path to the .onnx model file

        Raises:
            RuntimeError: If model loading fails
        """
        logger.info(f"Loading ONNX model from {model_path}...")

        def load_model_sync():
            return cv2.dnn.readNetFromONNX(str(model_path))

        self._net = await asyncio.to_thread(load_model_sync)

        if self._net is None:
            raise RuntimeError(f"cv2.dnn.readNetFromONNX returned None for {model_path}")

        self._model_validated = True
        logger.info("ONNX model loaded into OpenCV DNN")

    async def _load_model(self):
        """Legacy method for backward compatibility.

        Delegates to new retry-based implementation.
        """
        await self._load_model_with_retry()

    async def generate_embedding(self, face_crop: np.ndarray) -> Optional[list[float]]:
        """Generate 512-d embedding for a face crop.

        Args:
            face_crop: BGR image numpy array of the face

        Returns:
            List of 512 floats (normalized) or None if failed

        Raises:
            ModelLoadError: If model initialization fails
        """
        if face_crop is None or face_crop.size == 0:
            return None

        # Check circuit breaker before attempting operation
        if self._is_circuit_open():
            logger.warning("Cannot generate embedding: circuit breaker is open")
            return None

        # Ensure model is initialized
        if not await self.ensure_initialized():
            return None

        try:
            result = await asyncio.to_thread(self._generate_sync, face_crop)
            if result is not None:
                self._record_success()
            return result
        except Exception as e:
            self._record_failure()
            logger.error(f"Embedding generation failed: {e}")
            return None
        
    def _generate_sync(self, face_crop: np.ndarray) -> list[float]:
        """Run synchronous inference."""
        try:
            # Preprocessing for ArcFace
            # 1. Resize to 112x112
            # 2. Normalize (pixel - 127.5) / 127.5
            blob = cv2.dnn.blobFromImage(
                face_crop,
                1.0 / 127.5,
                (112, 112),
                (127.5, 127.5, 127.5),
                swapRB=True # InsightFace models trained on RGB or BGR? 
                            # cv2.imread is BGR. blobFromImage default swapRB=False (so input BGR).
                            # InsightFace usually expects RGB. So swapRB=True.
            )
            
            self._net.setInput(blob)
            embedding = self._net.forward()
            
            # Result is (1, 512)
            embedding = embedding.flatten()
            
            # Normalize to unit length (L2 norm)
            norm = np.linalg.norm(embedding)
            if norm > 0:
                embedding /= norm
                
            return embedding.tolist()
            
        except Exception as e:
            logger.warning(f"Embedding generation failed: {e}")
            return None

    # =========================================================================
    # HEALTH CHECK & CIRCUIT BREAKER MANAGEMENT
    # =========================================================================

    def get_health_status(self) -> dict[str, Any]:
        """Get the current health status of the face embedder.

        Returns:
            Dictionary with health status information
        """
        return {
            "initialized": self._initialized,
            "model_validated": self._model_validated,
            "circuit_breaker_open": self._is_circuit_open(),
            "failure_count": self._circuit_failure_count,
            "model_loaded": self._net is not None,
            "model_path": str(MODEL_DIR / MODEL_FILENAME),
            "model_exists": (MODEL_DIR / MODEL_FILENAME).exists(),
        }

    def reset_circuit_breaker(self) -> bool:
        """Manually reset the circuit breaker.

        Useful for recovery after fixing issues that caused failures.

        Returns:
            True if reset was successful
        """
        if not self._is_circuit_open():
            logger.info("Circuit breaker is not open, nothing to reset")
            return False

        logger.info("Manually resetting circuit breaker")
        self._circuit_failure_count = 0
        self._circuit_open_until = None
        self._circuit_last_failure_time = None
        return True

    async def preload_model(self) -> bool:
        """Preload the model during service startup.

        This should be called during application startup to ensure
        the model is downloaded and loaded before requests arrive.

        Returns:
            True if preloading successful, False otherwise
        """
        logger.info("Preloading face recognition model...")
        try:
            result = await self.ensure_initialized()
            if result:
                logger.info("Model preloaded successfully")
            else:
                logger.warning("Model preloading failed (circuit breaker may be open)")
            return result
        except Exception as e:
            logger.error(f"Model preloading failed: {e}")
            return False

    @property
    def is_ready(self) -> bool:
        """Check if the embedder is ready to generate embeddings.

        Returns:
            True if ready, False otherwise
        """
        return (
            self._initialized
            and not self._is_circuit_open()
            and self._net is not None
            and self._model_validated
        )


# Singleton
_embedder: Optional[FaceEmbedder] = None

def get_face_embedder() -> FaceEmbedder:
    """Get the singleton face embedder instance."""
    global _embedder
    if _embedder is None:
        _embedder = FaceEmbedder()
    return _embedder


async def preload_face_embedder() -> bool:
    """Preload the face embedder model during service startup.

    This should be called during application startup to ensure
    the model is downloaded and loaded before requests arrive.

    Returns:
        True if preloading successful, False otherwise
    """
    embedder = get_face_embedder()
    return await embedder.preload_model()
