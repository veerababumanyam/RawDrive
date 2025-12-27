"""AI Usage Logging Service.

Logs AI API calls for monitoring, billing, and analytics.
Feature: 003-user-gemini-settings
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Feature Types
# ---------------------------------------------------------------------------

class AIFeatureType:
    """Types of AI features that can be logged."""

    PHOTO_ANALYSIS = "photo_analysis"
    FACE_DETECTION = "face_detection"
    AUTO_TAGGING = "auto_tagging"
    SMART_SEARCH = "smart_search"
    AUTO_CURATION = "auto_curation"
    CAPTION_GENERATION = "caption_generation"
    OTHER = "other"


# ---------------------------------------------------------------------------
# AI Usage Service
# ---------------------------------------------------------------------------


class AIUsageService:
    """Service for logging AI API usage."""

    async def log_ai_call(
        self,
        user_id: UUID,
        workspace_id: UUID,
        model_identifier: str,
        feature_type: str,
        success: bool,
        error_code: Optional[str] = None,
        tokens_used: Optional[int] = None,
        latency_ms: Optional[int] = None,
        metadata: Optional[dict] = None,
    ) -> UUID:
        """Log an AI API call.

        Args:
            user_id: The user who made the call
            workspace_id: The workspace context
            model_identifier: The Gemini model used (e.g., "gemini-2.0-flash")
            feature_type: The feature that triggered the call (e.g., "photo_analysis")
            success: Whether the call succeeded
            error_code: Error code if the call failed
            tokens_used: Number of tokens consumed (if available)
            latency_ms: Request latency in milliseconds
            metadata: Additional metadata to store

        Returns:
            The created log entry ID
        """
        pool = await get_postgres_pool()
        log_id = uuid4()

        await pool.execute(
            """
            INSERT INTO ai_usage_logs (
                log_id, user_id, workspace_id, model_identifier,
                feature_type, success, error_code, tokens_used,
                latency_ms, metadata, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            """,
            log_id,
            user_id,
            workspace_id,
            model_identifier,
            feature_type,
            success,
            error_code,
            tokens_used,
            latency_ms,
            metadata,
            datetime.utcnow(),
        )

        if not success:
            logger.info(
                "AI call failed",
                extra={
                    "log_id": str(log_id),
                    "user_id": str(user_id),
                    "model": model_identifier,
                    "feature": feature_type,
                    "error_code": error_code,
                },
            )

        return log_id

    async def get_user_stats(
        self,
        user_id: UUID,
        workspace_id: Optional[UUID] = None,
        since: Optional[datetime] = None,
    ) -> dict:
        """Get AI usage statistics for a user.

        Args:
            user_id: The user to get stats for
            workspace_id: Optional workspace filter
            since: Optional start date filter

        Returns:
            Dictionary with usage statistics
        """
        pool = await get_postgres_pool()

        conditions = ["user_id = $1"]
        params = [user_id]
        param_idx = 2

        if workspace_id:
            conditions.append(f"workspace_id = ${param_idx}")
            params.append(workspace_id)
            param_idx += 1

        if since:
            conditions.append(f"created_at >= ${param_idx}")
            params.append(since)
            param_idx += 1

        where_clause = " AND ".join(conditions)

        row = await pool.fetchrow(
            f"""
            SELECT
                COUNT(*) as total_calls,
                COUNT(*) FILTER (WHERE success = TRUE) as successful_calls,
                COUNT(*) FILTER (WHERE success = FALSE) as failed_calls,
                COALESCE(SUM(tokens_used), 0) as total_tokens,
                COALESCE(AVG(latency_ms), 0) as avg_latency_ms
            FROM ai_usage_logs
            WHERE {where_clause}
            """,
            *params,
        )

        return {
            "total_calls": row["total_calls"],
            "successful_calls": row["successful_calls"],
            "failed_calls": row["failed_calls"],
            "success_rate": (
                round(row["successful_calls"] / row["total_calls"] * 100, 1)
                if row["total_calls"] > 0
                else 0
            ),
            "total_tokens": row["total_tokens"],
            "avg_latency_ms": round(row["avg_latency_ms"]),
        }

    async def get_feature_breakdown(
        self,
        user_id: UUID,
        workspace_id: Optional[UUID] = None,
        since: Optional[datetime] = None,
    ) -> list[dict]:
        """Get AI usage breakdown by feature type.

        Returns:
            List of dictionaries with feature_type and call counts
        """
        pool = await get_postgres_pool()

        conditions = ["user_id = $1"]
        params = [user_id]
        param_idx = 2

        if workspace_id:
            conditions.append(f"workspace_id = ${param_idx}")
            params.append(workspace_id)
            param_idx += 1

        if since:
            conditions.append(f"created_at >= ${param_idx}")
            params.append(since)
            param_idx += 1

        where_clause = " AND ".join(conditions)

        rows = await pool.fetch(
            f"""
            SELECT
                feature_type,
                COUNT(*) as total_calls,
                COUNT(*) FILTER (WHERE success = TRUE) as successful_calls
            FROM ai_usage_logs
            WHERE {where_clause}
            GROUP BY feature_type
            ORDER BY total_calls DESC
            """,
            *params,
        )

        return [
            {
                "feature_type": row["feature_type"],
                "total_calls": row["total_calls"],
                "successful_calls": row["successful_calls"],
            }
            for row in rows
        ]

    async def get_recent_errors(
        self,
        user_id: UUID,
        limit: int = 10,
    ) -> list[dict]:
        """Get recent AI call errors for a user.

        Returns:
            List of recent error entries
        """
        pool = await get_postgres_pool()

        rows = await pool.fetch(
            """
            SELECT
                log_id, model_identifier, feature_type, error_code, created_at
            FROM ai_usage_logs
            WHERE user_id = $1 AND success = FALSE
            ORDER BY created_at DESC
            LIMIT $2
            """,
            user_id,
            limit,
        )

        return [
            {
                "log_id": str(row["log_id"]),
                "model": row["model_identifier"],
                "feature": row["feature_type"],
                "error_code": row["error_code"],
                "created_at": row["created_at"].isoformat(),
            }
            for row in rows
        ]


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_service_instance: Optional[AIUsageService] = None


def get_ai_usage_service() -> AIUsageService:
    """Get singleton instance of AIUsageService."""
    global _service_instance
    if _service_instance is None:
        _service_instance = AIUsageService()
    return _service_instance
