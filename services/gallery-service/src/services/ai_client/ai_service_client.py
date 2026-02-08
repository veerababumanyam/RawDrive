"""AI Service Client with Circuit Breaker and Fallback Support.

Provides integration with the existing ai-service microservice for:
- Semantic photo search (via Milvus + CLIP embeddings)
- Emotion detection
- AI-powered gallery insights

Features:
- 2-second timeout to prevent cascading failures (configurable)
- Circuit breaker pattern with exponential backoff
- Fallback responses for graceful degradation
- Retry logic with jitter for transient errors

Architecture:
- gallery-service (PostgreSQL metadata) → ai-service (Milvus vectors + AI)
- Circuit breaker prevents cascading failures
- HTTP + MCP protocol support
"""

import os
import asyncio
from typing import Optional, Any
from uuid import UUID
import httpx
from datetime import datetime
from dataclasses import dataclass

from src.services.ai_client.circuit_breaker import (
    CircuitBreaker,
    CircuitBreakerError,
    BackoffConfig,
)
from src.config import settings
from src.log_config import get_logger
from src.observability.metrics import get_metrics

logger = get_logger(__name__)
metrics = get_metrics()


@dataclass
class FallbackResponse:
    """Container for fallback responses when AI service is unavailable.

    These responses allow gallery operations to continue gracefully
    when the AI service is slow or down.
    """

    @staticmethod
    def search_photos_fallback(query: str) -> dict:
        """Fallback for semantic photo search - returns empty results."""
        return {
            "results": [],
            "total": 0,
            "query": query,
            "fallback": True,
            "reason": "AI service unavailable - returning empty results",
        }

    @staticmethod
    def analyze_emotions_fallback(photo_id: UUID) -> dict:
        """Fallback for emotion analysis - indicates unavailable."""
        return {
            "photo_id": str(photo_id),
            "faces": [],
            "photo_level_summary": None,
            "fallback": True,
            "reason": "AI service unavailable - emotion analysis not available",
        }

    @staticmethod
    def emotion_search_fallback(emotion: str) -> dict:
        """Fallback for emotion-based search - returns empty results."""
        return {
            "photos": [],
            "total": 0,
            "emotion": emotion,
            "fallback": True,
            "reason": "AI service unavailable - returning empty results",
        }

    @staticmethod
    def workspace_stats_fallback(workspace_id: UUID) -> dict:
        """Fallback for workspace stats - indicates unavailable."""
        return {
            "workspace_id": str(workspace_id),
            "stats_available": False,
            "fallback": True,
            "reason": "AI service unavailable - stats not available",
        }


class AIServiceClient:
    """Client for calling ai-service MCP tools and APIs with resilience patterns.

    Handles:
    - Semantic photo search (Milvus vector search)
    - Emotion detection (Google Cloud Vision / Gemini)
    - AI-powered insights
    - Circuit breaker protection with 2-second timeout
    - Exponential backoff for retries
    - Fallback responses for graceful degradation

    Usage:
        # With automatic fallbacks
        client = AIServiceClient()
        results = await client.search_photos_semantic(
            workspace_id=workspace_id,
            query="happy family at beach",
            limit=20,
            use_fallback=True  # Returns empty results if AI is down
        )

        # Without fallbacks (raises exception on failure)
        results = await client.search_photos_semantic(
            workspace_id=workspace_id,
            query="happy family at beach",
            use_fallback=False  # Raises CircuitBreakerError if AI is down
        )

    Configuration (via environment variables):
        AI_SERVICE_URL: Base URL of AI service (default: http://ai-service:8013)
        AI_SERVICE_TIMEOUT_SECONDS: Request timeout (default: 2.0 seconds)
        AI_SERVICE_CONNECT_TIMEOUT: Connection timeout (default: 1.0 second)
        AI_SERVICE_MAX_RETRIES: Max retry attempts (default: 3)
        AI_SERVICE_FALLBACK_ENABLED: Enable fallback responses (default: true)
    """

    def __init__(
        self,
        ai_service_url: Optional[str] = None,
        timeout: Optional[float] = None,
        connect_timeout: Optional[float] = None,
        enable_circuit_breaker: bool = True,
        enable_fallback: Optional[bool] = None,
        max_retries: Optional[int] = None,
    ):
        """Initialize AI service client with resilience configuration.

        Args:
            ai_service_url: AI service base URL (default: from settings)
            timeout: Request timeout in seconds (default: 2.0s from settings)
            connect_timeout: Connection timeout in seconds (default: 1.0s)
            enable_circuit_breaker: Enable circuit breaker protection
            enable_fallback: Enable fallback responses (default: from settings)
            max_retries: Maximum retry attempts (default: from settings)
        """
        # Load configuration from settings or use provided values
        self.ai_service_url = ai_service_url or settings.AI_SERVICE_URL
        self.timeout = timeout if timeout is not None else settings.AI_SERVICE_TIMEOUT_SECONDS
        self.connect_timeout = connect_timeout if connect_timeout is not None else settings.AI_SERVICE_CONNECT_TIMEOUT
        self.enable_fallback = enable_fallback if enable_fallback is not None else settings.AI_SERVICE_FALLBACK_ENABLED
        self.max_retries = max_retries if max_retries is not None else settings.AI_SERVICE_MAX_RETRIES

        # Backoff configuration for retries
        self.backoff_config = BackoffConfig(
            max_retries=self.max_retries,
            base_delay=settings.AI_SERVICE_BASE_DELAY,
            max_delay=settings.AI_SERVICE_MAX_DELAY,
            jitter=settings.AI_SERVICE_JITTER,
        )

        # Circuit breaker for resilience
        self.circuit_breaker = (
            CircuitBreaker(
                service_name="ai-service",
                failure_threshold=settings.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
                timeout=settings.CIRCUIT_BREAKER_RECOVERY_TIMEOUT,
                success_threshold=2,
                backoff_config=self.backoff_config,
            )
            if enable_circuit_breaker
            else None
        )

        # HTTP client with strict timeout configuration
        # CRITICAL: 2-second timeout prevents cascading failures
        self.http_client = httpx.AsyncClient(
            base_url=self.ai_service_url,
            timeout=httpx.Timeout(
                timeout=self.timeout,
                connect=self.connect_timeout,
            ),
        )

        logger.info(
            f"AIServiceClient initialized: url={self.ai_service_url}, "
            f"timeout={self.timeout}s, connect_timeout={self.connect_timeout}s, "
            f"circuit_breaker={enable_circuit_breaker}, fallback={self.enable_fallback}, "
            f"max_retries={self.max_retries}"
        )

    async def search_photos_semantic(
        self,
        workspace_id: UUID,
        query: str,
        gallery_id: Optional[UUID] = None,
        limit: int = 50,
        auth_context: Optional[dict] = None,
        use_fallback: Optional[bool] = None,
    ) -> dict:
        """Semantic photo search using AI embeddings and Milvus.

        Args:
            workspace_id: Workspace UUID
            query: Search query (e.g., "happy family at beach")
            gallery_id: Optional gallery to search within
            limit: Maximum number of results
            auth_context: Authentication context for MCP call
            use_fallback: Use fallback response if AI service unavailable
                         (default: from client settings)

        Returns:
            {
                "results": [{"photo": {...}, "relevance_score": 0.95, "matched_tags": []}],
                "total": 10,
                "query": "happy family at beach",
                "fallback": false  # true if fallback response
            }

        Raises:
            CircuitBreakerError: If circuit breaker is open and fallback disabled
            Exception: On API errors and fallback disabled
        """
        use_fallback = use_fallback if use_fallback is not None else self.enable_fallback
        start_time = datetime.utcnow()

        async def _call_mcp_search_photos():
            """Internal function to call ai-service MCP tool."""
            # Call ai-service MCP tool: search_photos
            response = await self.http_client.post(
                "/mcp/tools/search_photos",
                json={
                    "workspace_id": str(workspace_id),
                    "query": query,
                    "gallery_id": str(gallery_id) if gallery_id else None,
                    "limit": limit,
                    "context": auth_context or {},
                },
            )
            response.raise_for_status()
            return response.json()

        try:
            # Use circuit breaker with retry if enabled
            if self.circuit_breaker:
                result = await self.circuit_breaker.call_with_retry(
                    _call_mcp_search_photos,
                    retryable_exceptions=(asyncio.TimeoutError, httpx.TimeoutException, httpx.ConnectError, OSError),
                )
            else:
                result = await _call_mcp_search_photos()

            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

            # Track metrics
            metrics.counter_inc(
                "gallery_ai_service_calls_total",
                {"operation": "search_photos", "status": "success"}
            )
            metrics.histogram_observe(
                "gallery_ai_service_duration_seconds",
                duration_ms / 1000,
                {"operation": "search_photos"}
            )

            logger.info(
                f"Semantic search completed: query='{query}', "
                f"results={result.get('total', 0)}, duration={duration_ms}ms"
            )

            result["fallback"] = False
            return result

        except CircuitBreakerError as e:
            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            logger.warning(f"Circuit breaker open for search_photos: {e}, duration={duration_ms}ms")
            metrics.counter_inc(
                "gallery_ai_service_calls_total",
                {"operation": "search_photos", "status": "circuit_breaker_open"}
            )

            if use_fallback:
                metrics.counter_inc(
                    "gallery_ai_service_fallback_total",
                    {"operation": "search_photos"}
                )
                return FallbackResponse.search_photos_fallback(query)
            raise

        except (asyncio.TimeoutError, httpx.TimeoutException) as e:
            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            logger.error(
                f"Semantic search timeout: query='{query}', error={e}, "
                f"duration={duration_ms}ms (timeout={self.timeout}s)"
            )
            metrics.counter_inc(
                "gallery_ai_service_calls_total",
                {"operation": "search_photos", "status": "timeout"}
            )

            if use_fallback:
                metrics.counter_inc(
                    "gallery_ai_service_fallback_total",
                    {"operation": "search_photos"}
                )
                return FallbackResponse.search_photos_fallback(query)
            raise

        except Exception as e:
            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            logger.error(
                f"Semantic search failed: query='{query}', error={e}, "
                f"duration={duration_ms}ms"
            )
            metrics.counter_inc(
                "gallery_ai_service_calls_total",
                {"operation": "search_photos", "status": "error"}
            )

            if use_fallback:
                metrics.counter_inc(
                    "gallery_ai_service_fallback_total",
                    {"operation": "search_photos"}
                )
                return FallbackResponse.search_photos_fallback(query)
            raise

    async def analyze_photo_emotions(
        self,
        workspace_id: UUID,
        photo_id: UUID,
        provider: str = "cloud_vision",
        auth_context: Optional[dict] = None,
        use_fallback: Optional[bool] = None,
    ) -> dict:
        """Detect emotions in photo faces.

        Args:
            workspace_id: Workspace UUID
            photo_id: Photo UUID to analyze
            provider: AI provider (cloud_vision, gemini)
            auth_context: Authentication context for MCP call
            use_fallback: Use fallback response if AI service unavailable

        Returns:
            {
                "photo_id": "uuid",
                "faces": [{"emotion": "joy", "confidence": 0.95, ...}],
                "photo_level_summary": {"dominant_emotion": "joy", ...},
                "fallback": false
            }

        Raises:
            CircuitBreakerError: If circuit breaker is open and fallback disabled
            Exception: On API errors and fallback disabled
        """
        use_fallback = use_fallback if use_fallback is not None else self.enable_fallback
        start_time = datetime.utcnow()

        async def _call_mcp_analyze_emotions():
            """Internal function to call ai-service MCP tool."""
            response = await self.http_client.post(
                "/mcp/tools/analyze_photo_emotions",
                json={
                    "photo_id": str(photo_id),
                    "workspace_id": str(workspace_id),
                    "provider": provider,
                    "context": auth_context or {},
                },
            )
            response.raise_for_status()
            return response.json()

        try:
            # Use circuit breaker with retry if enabled
            if self.circuit_breaker:
                result = await self.circuit_breaker.call_with_retry(
                    _call_mcp_analyze_emotions,
                    retryable_exceptions=(asyncio.TimeoutError, httpx.TimeoutException, httpx.ConnectError, OSError),
                )
            else:
                result = await _call_mcp_analyze_emotions()

            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

            # Track metrics
            metrics.counter_inc(
                "gallery_ai_service_calls_total",
                {"operation": "analyze_emotions", "status": "success"}
            )
            metrics.histogram_observe(
                "gallery_ai_service_duration_seconds",
                duration_ms / 1000,
                {"operation": "analyze_emotions"}
            )

            logger.info(
                f"Emotion analysis completed: photo={photo_id}, "
                f"provider={provider}, duration={duration_ms}ms"
            )

            result["fallback"] = False
            return result

        except CircuitBreakerError as e:
            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            logger.warning(f"Circuit breaker open for analyze_emotions: {e}, duration={duration_ms}ms")
            metrics.counter_inc(
                "gallery_ai_service_calls_total",
                {"operation": "analyze_emotions", "status": "circuit_breaker_open"}
            )

            if use_fallback:
                metrics.counter_inc(
                    "gallery_ai_service_fallback_total",
                    {"operation": "analyze_emotions"}
                )
                return FallbackResponse.analyze_emotions_fallback(photo_id)
            raise

        except (asyncio.TimeoutError, httpx.TimeoutException) as e:
            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            logger.error(
                f"Emotion analysis timeout: photo={photo_id}, error={e}, "
                f"duration={duration_ms}ms (timeout={self.timeout}s)"
            )
            metrics.counter_inc(
                "gallery_ai_service_calls_total",
                {"operation": "analyze_emotions", "status": "timeout"}
            )

            if use_fallback:
                metrics.counter_inc(
                    "gallery_ai_service_fallback_total",
                    {"operation": "analyze_emotions"}
                )
                return FallbackResponse.analyze_emotions_fallback(photo_id)
            raise

        except Exception as e:
            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            logger.error(
                f"Emotion analysis failed: photo={photo_id}, error={e}, "
                f"duration={duration_ms}ms"
            )
            metrics.counter_inc(
                "gallery_ai_service_calls_total",
                {"operation": "analyze_emotions", "status": "error"}
            )

            if use_fallback:
                metrics.counter_inc(
                    "gallery_ai_service_fallback_total",
                    {"operation": "analyze_emotions"}
                )
                return FallbackResponse.analyze_emotions_fallback(photo_id)
            raise

    async def search_photos_by_emotion(
        self,
        workspace_id: UUID,
        emotion: str,
        gallery_id: Optional[UUID] = None,
        min_confidence: float = 0.7,
        limit: int = 50,
        auth_context: Optional[dict] = None,
        use_fallback: Optional[bool] = None,
    ) -> dict:
        """Search photos by detected emotion.

        Args:
            workspace_id: Workspace UUID
            emotion: Emotion to search (joy, sadness, anger, surprise, fear, disgust, contentment)
            gallery_id: Optional gallery to filter
            min_confidence: Minimum confidence threshold (0-1)
            limit: Maximum number of results
            auth_context: Authentication context for MCP call
            use_fallback: Use fallback response if AI service unavailable

        Returns:
            {
                "photos": [{...}],
                "total": 10,
                "emotion": "joy",
                "min_confidence": 0.7,
                "fallback": false
            }

        Raises:
            CircuitBreakerError: If circuit breaker is open and fallback disabled
            ValueError: If invalid emotion type
            Exception: On API errors and fallback disabled
        """
        use_fallback = use_fallback if use_fallback is not None else self.enable_fallback
        start_time = datetime.utcnow()

        async def _call_mcp_search_emotions():
            """Internal function to call ai-service MCP tool."""
            response = await self.http_client.post(
                "/mcp/tools/search_photos_by_emotion",
                json={
                    "workspace_id": str(workspace_id),
                    "emotion": emotion,
                    "gallery_id": str(gallery_id) if gallery_id else None,
                    "min_confidence": min_confidence,
                    "limit": limit,
                    "context": auth_context or {},
                },
            )
            response.raise_for_status()
            return response.json()

        try:
            # Use circuit breaker with retry if enabled
            if self.circuit_breaker:
                result = await self.circuit_breaker.call_with_retry(
                    _call_mcp_search_emotions,
                    retryable_exceptions=(asyncio.TimeoutError, httpx.TimeoutException, httpx.ConnectError, OSError),
                )
            else:
                result = await _call_mcp_search_emotions()

            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

            # Track metrics
            metrics.counter_inc(
                "gallery_ai_service_calls_total",
                {"operation": "search_by_emotion", "status": "success"}
            )
            metrics.histogram_observe(
                "gallery_ai_service_duration_seconds",
                duration_ms / 1000,
                {"operation": "search_by_emotion"}
            )

            logger.info(
                f"Emotion search completed: emotion={emotion}, "
                f"results={result.get('total', 0)}, duration={duration_ms}ms"
            )

            result["fallback"] = False
            return result

        except CircuitBreakerError as e:
            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            logger.warning(f"Circuit breaker open for search_by_emotion: {e}, duration={duration_ms}ms")
            metrics.counter_inc(
                "gallery_ai_service_calls_total",
                {"operation": "search_by_emotion", "status": "circuit_breaker_open"}
            )

            if use_fallback:
                metrics.counter_inc(
                    "gallery_ai_service_fallback_total",
                    {"operation": "search_by_emotion"}
                )
                return FallbackResponse.emotion_search_fallback(emotion)
            raise

        except (asyncio.TimeoutError, httpx.TimeoutException) as e:
            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            logger.error(
                f"Emotion search timeout: emotion={emotion}, error={e}, "
                f"duration={duration_ms}ms (timeout={self.timeout}s)"
            )
            metrics.counter_inc(
                "gallery_ai_service_calls_total",
                {"operation": "search_by_emotion", "status": "timeout"}
            )

            if use_fallback:
                metrics.counter_inc(
                    "gallery_ai_service_fallback_total",
                    {"operation": "search_by_emotion"}
                )
                return FallbackResponse.emotion_search_fallback(emotion)
            raise

        except Exception as e:
            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            logger.error(
                f"Emotion search failed: emotion={emotion}, error={e}, "
                f"duration={duration_ms}ms"
            )
            metrics.counter_inc(
                "gallery_ai_service_calls_total",
                {"operation": "search_by_emotion", "status": "error"}
            )

            if use_fallback:
                metrics.counter_inc(
                    "gallery_ai_service_fallback_total",
                    {"operation": "search_by_emotion"}
                )
                return FallbackResponse.emotion_search_fallback(emotion)
            raise

    async def get_workspace_stats(
        self,
        workspace_id: UUID,
        auth_context: Optional[dict] = None,
        use_fallback: Optional[bool] = None,
    ) -> dict:
        """Get workspace statistics from ai-service.

        Args:
            workspace_id: Workspace UUID
            auth_context: Authentication context for MCP call
            use_fallback: Use fallback response if AI service unavailable

        Returns:
            Workspace statistics including gallery counts, photo counts, storage usage
        """
        use_fallback = use_fallback if use_fallback is not None else self.enable_fallback
        start_time = datetime.utcnow()

        async def _call_mcp_workspace_stats():
            """Internal function to call ai-service MCP tool."""
            response = await self.http_client.post(
                "/mcp/tools/get_workspace_stats",
                json={
                    "workspace_id": str(workspace_id),
                    "context": auth_context or {},
                },
            )
            response.raise_for_status()
            return response.json()

        try:
            # Use circuit breaker with retry if enabled
            if self.circuit_breaker:
                result = await self.circuit_breaker.call_with_retry(
                    _call_mcp_workspace_stats,
                    retryable_exceptions=(asyncio.TimeoutError, httpx.TimeoutException, httpx.ConnectError, OSError),
                )
            else:
                result = await _call_mcp_workspace_stats()

            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

            # Track metrics
            metrics.counter_inc(
                "gallery_ai_service_calls_total",
                {"operation": "workspace_stats", "status": "success"}
            )
            metrics.histogram_observe(
                "gallery_ai_service_duration_seconds",
                duration_ms / 1000,
                {"operation": "workspace_stats"}
            )

            result["fallback"] = False
            return result

        except CircuitBreakerError as e:
            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            logger.warning(f"Circuit breaker open for workspace_stats: {e}, duration={duration_ms}ms")
            metrics.counter_inc(
                "gallery_ai_service_calls_total",
                {"operation": "workspace_stats", "status": "circuit_breaker_open"}
            )

            if use_fallback:
                metrics.counter_inc(
                    "gallery_ai_service_fallback_total",
                    {"operation": "workspace_stats"}
                )
                return FallbackResponse.workspace_stats_fallback(workspace_id)
            raise

        except (asyncio.TimeoutError, httpx.TimeoutException) as e:
            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            logger.error(
                f"Workspace stats timeout: error={e}, "
                f"duration={duration_ms}ms (timeout={self.timeout}s)"
            )
            metrics.counter_inc(
                "gallery_ai_service_calls_total",
                {"operation": "workspace_stats", "status": "timeout"}
            )

            if use_fallback:
                metrics.counter_inc(
                    "gallery_ai_service_fallback_total",
                    {"operation": "workspace_stats"}
                )
                return FallbackResponse.workspace_stats_fallback(workspace_id)
            raise

        except Exception as e:
            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            logger.error(f"Workspace stats failed: error={e}, duration={duration_ms}ms")
            metrics.counter_inc(
                "gallery_ai_service_calls_total",
                {"operation": "workspace_stats", "status": "error"}
            )

            if use_fallback:
                metrics.counter_inc(
                    "gallery_ai_service_fallback_total",
                    {"operation": "workspace_stats"}
                )
                return FallbackResponse.workspace_stats_fallback(workspace_id)
            raise

    def get_circuit_breaker_state(self) -> dict:
        """Get current circuit breaker state for monitoring.

        Returns:
            Circuit breaker state information including:
            - Circuit state (closed/open/half_open)
            - Failure/success counts
            - Retry statistics
            - Configuration details
        """
        if self.circuit_breaker:
            state = self.circuit_breaker.get_state()
            # Add client-level configuration
            state["client_config"] = {
                "timeout_seconds": self.timeout,
                "connect_timeout_seconds": self.connect_timeout,
                "fallback_enabled": self.enable_fallback,
                "max_retries": self.max_retries,
                "ai_service_url": self.ai_service_url,
            }
            return state
        return {"enabled": False}

    async def health_check(self) -> dict:
        """Check ai-service health.

        Returns:
            {"status": "healthy" | "unhealthy", "circuit_breaker": {...}}
        """
        try:
            response = await self.http_client.get("/health", timeout=5.0)
            response.raise_for_status()

            return {
                "status": "healthy",
                "circuit_breaker": self.get_circuit_breaker_state(),
            }

        except Exception as e:
            logger.error(f"AI service health check failed: {e}")
            return {
                "status": "unhealthy",
                "error": str(e),
                "circuit_breaker": self.get_circuit_breaker_state(),
            }

    async def close(self):
        """Close HTTP client connections."""
        await self.http_client.aclose()
        logger.info("AIServiceClient closed")

    async def __aenter__(self):
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()
