"""AI Service Client.

Provides integration with the existing ai-service microservice for:
- Semantic photo search (via Milvus + CLIP embeddings)
- Emotion detection
- AI-powered gallery insights

Architecture:
- gallery-service (PostgreSQL metadata) → ai-service (Milvus vectors + AI)
- Circuit breaker prevents cascading failures
- HTTP + MCP protocol support
"""

import os
from typing import Optional
from uuid import UUID
import httpx
from datetime import datetime

from src.services.ai_client.circuit_breaker import CircuitBreaker, CircuitBreakerError
from src.log_config import get_logger
from src.observability.metrics import get_metrics

logger = get_logger(__name__)
metrics = get_metrics()


class AIServiceClient:
    """Client for calling ai-service MCP tools and APIs.

    Handles:
    - Semantic photo search (Milvus vector search)
    - Emotion detection (Google Cloud Vision / Gemini)
    - AI-powered insights
    - Circuit breaker protection
    - Error handling and fallbacks

    Usage:
        client = AIServiceClient()
        results = await client.search_photos_semantic(
            workspace_id=workspace_id,
            query="happy family at beach",
            limit=20
        )
    """

    def __init__(
        self,
        ai_service_url: Optional[str] = None,
        timeout: int = 30,
        enable_circuit_breaker: bool = True,
    ):
        """Initialize AI service client.

        Args:
            ai_service_url: AI service base URL (default: env AI_SERVICE_URL)
            timeout: Request timeout in seconds
            enable_circuit_breaker: Enable circuit breaker protection
        """
        self.ai_service_url = ai_service_url or os.getenv(
            "AI_SERVICE_URL", "http://ai-service:8013"
        )
        self.timeout = timeout

        # Circuit breaker for resilience
        self.circuit_breaker = (
            CircuitBreaker(
                service_name="ai-service",
                failure_threshold=5,
                timeout=60,  # 60 seconds before retry
                success_threshold=2,
            )
            if enable_circuit_breaker
            else None
        )

        # HTTP client for API calls
        self.http_client = httpx.AsyncClient(
            base_url=self.ai_service_url,
            timeout=httpx.Timeout(timeout),
        )

        logger.info(
            f"AIServiceClient initialized: url={self.ai_service_url}, "
            f"circuit_breaker={enable_circuit_breaker}"
        )

    async def search_photos_semantic(
        self,
        workspace_id: UUID,
        query: str,
        gallery_id: Optional[UUID] = None,
        limit: int = 50,
        auth_context: Optional[dict] = None,
    ) -> dict:
        """Semantic photo search using AI embeddings and Milvus.

        Args:
            workspace_id: Workspace UUID
            query: Search query (e.g., "happy family at beach")
            gallery_id: Optional gallery to search within
            limit: Maximum number of results
            auth_context: Authentication context for MCP call

        Returns:
            {
                "results": [{"photo": {...}, "relevance_score": 0.95, "matched_tags": []}],
                "total": 10,
                "query": "happy family at beach"
            }

        Raises:
            CircuitBreakerError: If circuit breaker is open
            Exception: On API errors
        """
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
            # Use circuit breaker if enabled
            if self.circuit_breaker:
                result = await self.circuit_breaker.call(_call_mcp_search_photos)
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

            return result

        except CircuitBreakerError as e:
            logger.warning(f"Circuit breaker open for search_photos: {e}")
            metrics.counter_inc(
                "gallery_ai_service_calls_total",
                {"operation": "search_photos", "status": "circuit_breaker_open"}
            )
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
            raise

    async def analyze_photo_emotions(
        self,
        workspace_id: UUID,
        photo_id: UUID,
        provider: str = "cloud_vision",
        auth_context: Optional[dict] = None,
    ) -> dict:
        """Detect emotions in photo faces.

        Args:
            workspace_id: Workspace UUID
            photo_id: Photo UUID to analyze
            provider: AI provider (cloud_vision, gemini)
            auth_context: Authentication context for MCP call

        Returns:
            {
                "photo_id": "uuid",
                "faces": [{"emotion": "joy", "confidence": 0.95, ...}],
                "photo_level_summary": {"dominant_emotion": "joy", ...}
            }

        Raises:
            CircuitBreakerError: If circuit breaker is open
            Exception: On API errors
        """
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
            # Use circuit breaker if enabled
            if self.circuit_breaker:
                result = await self.circuit_breaker.call(_call_mcp_analyze_emotions)
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

            return result

        except CircuitBreakerError as e:
            logger.warning(f"Circuit breaker open for analyze_emotions: {e}")
            metrics.counter_inc(
                "gallery_ai_service_calls_total",
                {"operation": "analyze_emotions", "status": "circuit_breaker_open"}
            )
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
            raise

    async def search_photos_by_emotion(
        self,
        workspace_id: UUID,
        emotion: str,
        gallery_id: Optional[UUID] = None,
        min_confidence: float = 0.7,
        limit: int = 50,
        auth_context: Optional[dict] = None,
    ) -> dict:
        """Search photos by detected emotion.

        Args:
            workspace_id: Workspace UUID
            emotion: Emotion to search (joy, sadness, anger, surprise, fear, disgust, contentment)
            gallery_id: Optional gallery to filter
            min_confidence: Minimum confidence threshold (0-1)
            limit: Maximum number of results
            auth_context: Authentication context for MCP call

        Returns:
            {
                "photos": [{...}],
                "total": 10,
                "emotion": "joy",
                "min_confidence": 0.7
            }

        Raises:
            CircuitBreakerError: If circuit breaker is open
            ValueError: If invalid emotion type
            Exception: On API errors
        """
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
            # Use circuit breaker if enabled
            if self.circuit_breaker:
                result = await self.circuit_breaker.call(_call_mcp_search_emotions)
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

            return result

        except CircuitBreakerError as e:
            logger.warning(f"Circuit breaker open for search_by_emotion: {e}")
            metrics.counter_inc(
                "gallery_ai_service_calls_total",
                {"operation": "search_by_emotion", "status": "circuit_breaker_open"}
            )
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
            raise

    async def get_workspace_stats(
        self,
        workspace_id: UUID,
        auth_context: Optional[dict] = None,
    ) -> dict:
        """Get workspace statistics from ai-service.

        Args:
            workspace_id: Workspace UUID
            auth_context: Authentication context for MCP call

        Returns:
            Workspace statistics including gallery counts, photo counts, storage usage
        """
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
            # Use circuit breaker if enabled
            if self.circuit_breaker:
                result = await self.circuit_breaker.call(_call_mcp_workspace_stats)
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

            return result

        except CircuitBreakerError as e:
            logger.warning(f"Circuit breaker open for workspace_stats: {e}")
            metrics.counter_inc(
                "gallery_ai_service_calls_total",
                {"operation": "workspace_stats", "status": "circuit_breaker_open"}
            )
            raise

        except Exception as e:
            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            logger.error(f"Workspace stats failed: error={e}, duration={duration_ms}ms")
            metrics.counter_inc(
                "gallery_ai_service_calls_total",
                {"operation": "workspace_stats", "status": "error"}
            )
            raise

    def get_circuit_breaker_state(self) -> dict:
        """Get current circuit breaker state for monitoring.

        Returns:
            Circuit breaker state information
        """
        if self.circuit_breaker:
            return self.circuit_breaker.get_state()
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
