"""Repository for onboarding session data operations.

This module provides the OnboardingSessionRepository class that handles all CRUD
operations for onboarding sessions, tracking user progress through the multi-step
onboarding flow.

Feature: Automated Onboarding System
Task: T011 - Create OnboardingRepository for session management
"""

from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID, uuid4

from app.db.postgres import get_postgres_pool


logger = logging.getLogger(__name__)


class OnboardingSessionRepository:
    """Data access layer for onboarding session records.

    This repository handles all CRUD operations for onboarding sessions,
    tracking user progress through plan selection, registration, email
    verification, payment, and workspace setup.

    Key Features:
    - Secure session token generation and hashing
    - Step progression tracking
    - Session expiry management
    - UTM/source tracking for analytics
    """

    # Session token is valid for 24 hours
    DEFAULT_SESSION_TTL_HOURS = 24

    # =========================================================================
    # SESSION CREATE OPERATIONS
    # =========================================================================

    async def create(
        self,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        utm_source: Optional[str] = None,
        utm_medium: Optional[str] = None,
        utm_campaign: Optional[str] = None,
        utm_content: Optional[str] = None,
        utm_term: Optional[str] = None,
        referrer_url: Optional[str] = None,
        landing_page: Optional[str] = None,
        promo_code: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> tuple[dict[str, Any], str]:
        """Create a new onboarding session and return the session token.

        Args:
            ip_address: Client IP address
            user_agent: Client user agent string
            utm_source: UTM source parameter
            utm_medium: UTM medium parameter
            utm_campaign: UTM campaign parameter
            utm_content: UTM content parameter
            utm_term: UTM term parameter
            referrer_url: HTTP referrer URL
            landing_page: Landing page URL
            promo_code: Promotional code if any
            metadata: Additional metadata

        Returns:
            Tuple of (session record dict, plain session token)
        """
        pool = await get_postgres_pool()

        # Generate secure session token
        session_token = secrets.token_urlsafe(32)
        session_token_hash = self._hash_token(session_token)

        session_id = uuid4()
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(hours=self.DEFAULT_SESSION_TTL_HOURS)

        # Default step completion state
        steps_completed = {
            "plan_selection": False,
            "registration": False,
            "email_verification": False,
            "payment": False,
            "workspace_setup": False,
        }

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO onboarding_sessions (
                    session_id, session_token_hash,
                    current_step, steps_completed, status,
                    billing_interval, currency,
                    registration_method, registration_data,
                    payment_status, email_verified,
                    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
                    referrer_url, landing_page, promo_code,
                    ip_address, user_agent,
                    metadata, error_count,
                    created_at, updated_at, expires_at, last_activity_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23,
                    $24, $25, $26, $27
                )
                RETURNING *
                """,
                session_id,
                session_token_hash,
                "plan_selection",
                steps_completed,
                "active",
                "monthly",
                "INR",
                "email",
                {},
                "none",
                False,
                utm_source,
                utm_medium,
                utm_campaign,
                utm_content,
                utm_term,
                referrer_url,
                landing_page,
                promo_code,
                ip_address,
                user_agent,
                metadata or {},
                0,
                now,
                now,
                expires_at,
                now,
            )

            logger.info(
                "Onboarding session created",
                extra={
                    "session_id": str(session_id),
                    "utm_source": utm_source,
                    "promo_code": promo_code,
                },
            )

            return self._row_to_dict(row), session_token

    # =========================================================================
    # SESSION READ OPERATIONS
    # =========================================================================

    async def get_by_id(self, session_id: UUID) -> Optional[dict[str, Any]]:
        """Get a session by ID.

        Args:
            session_id: Session ID to retrieve

        Returns:
            Session record as dict or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM onboarding_sessions
                WHERE session_id = $1
                """,
                session_id,
            )
            return self._row_to_dict(row) if row else None

    async def get_by_token(self, session_token: str) -> Optional[dict[str, Any]]:
        """Get a session by token (validates and returns session).

        Only returns active, non-expired sessions.

        Args:
            session_token: Plain session token

        Returns:
            Session record as dict or None if not found/invalid
        """
        token_hash = self._hash_token(session_token)
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM onboarding_sessions
                WHERE session_token_hash = $1
                  AND status = 'active'
                  AND expires_at > NOW()
                """,
                token_hash,
            )

            if row:
                # Update last activity
                await conn.execute(
                    """
                    UPDATE onboarding_sessions
                    SET last_activity_at = NOW()
                    WHERE session_id = $1
                    """,
                    row["session_id"],
                )

            return self._row_to_dict(row) if row else None

    async def get_by_user_id(self, user_id: UUID) -> Optional[dict[str, Any]]:
        """Get the most recent session for a user.

        Args:
            user_id: User ID to look up

        Returns:
            Most recent session record or None
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM onboarding_sessions
                WHERE user_id = $1
                ORDER BY created_at DESC
                LIMIT 1
                """,
                user_id,
            )
            return self._row_to_dict(row) if row else None

    async def get_active_by_email(self, email: str) -> Optional[dict[str, Any]]:
        """Get active session by email in registration data.

        Args:
            email: Email to look up

        Returns:
            Active session record or None
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM onboarding_sessions
                WHERE registration_data->>'email' = $1
                  AND status = 'active'
                  AND expires_at > NOW()
                ORDER BY created_at DESC
                LIMIT 1
                """,
                email.lower(),
            )
            return self._row_to_dict(row) if row else None

    # =========================================================================
    # SESSION UPDATE OPERATIONS
    # =========================================================================

    async def update(
        self,
        session_id: UUID,
        user_id: Optional[UUID] = None,
        workspace_id: Optional[UUID] = None,
        plan_id: Optional[UUID] = None,
        billing_interval: Optional[str] = None,
        currency: Optional[str] = None,
        current_step: Optional[str] = None,
        steps_completed: Optional[dict[str, bool]] = None,
        registration_method: Optional[str] = None,
        registration_data: Optional[dict[str, Any]] = None,
        stripe_payment_intent_id: Optional[str] = None,
        stripe_setup_intent_id: Optional[str] = None,
        payment_status: Optional[str] = None,
        email_verified: Optional[bool] = None,
        email_verification_sent_at: Optional[datetime] = None,
        status: Optional[str] = None,
        promo_code: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
        last_error: Optional[str] = None,
        completed_at: Optional[datetime] = None,
    ) -> Optional[dict[str, Any]]:
        """Update an onboarding session.

        Only updates fields that are explicitly provided (not None).

        Args:
            session_id: Session ID to update
            (other args): Fields to update

        Returns:
            Updated session record or None if not found
        """
        # Build dynamic update query
        updates: list[str] = []
        params: list[Any] = []
        param_index = 1

        field_updates = {
            "user_id": user_id,
            "workspace_id": workspace_id,
            "plan_id": plan_id,
            "billing_interval": billing_interval,
            "currency": currency,
            "current_step": current_step,
            "steps_completed": steps_completed,
            "registration_method": registration_method,
            "registration_data": registration_data,
            "stripe_payment_intent_id": stripe_payment_intent_id,
            "stripe_setup_intent_id": stripe_setup_intent_id,
            "payment_status": payment_status,
            "email_verified": email_verified,
            "email_verification_sent_at": email_verification_sent_at,
            "status": status,
            "promo_code": promo_code,
            "metadata": metadata,
            "last_error": last_error,
            "completed_at": completed_at,
        }

        for field, value in field_updates.items():
            if value is not None:
                updates.append(f"{field} = ${param_index}")
                params.append(value)
                param_index += 1

        if not updates:
            return await self.get_by_id(session_id)

        # Always update last_activity_at
        updates.append(f"last_activity_at = ${param_index}")
        params.append(datetime.now(timezone.utc))
        param_index += 1

        params.append(session_id)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            query = f"""
                UPDATE onboarding_sessions
                SET {", ".join(updates)}
                WHERE session_id = ${param_index}
                RETURNING *
            """
            row = await conn.fetchrow(query, *params)

            if row:
                logger.info(
                    "Onboarding session updated",
                    extra={
                        "session_id": str(session_id),
                        "updated_fields": [k for k, v in field_updates.items() if v is not None],
                    },
                )

            return self._row_to_dict(row) if row else None

    async def update_step(
        self,
        session_id: UUID,
        step: str,
        completed: bool = True,
        next_step: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        """Mark a step as completed and optionally advance to next step.

        Args:
            session_id: Session ID to update
            step: Step name to mark (plan_selection, registration, etc.)
            completed: Whether step is completed
            next_step: Optional next step to advance to

        Returns:
            Updated session record or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Update steps_completed JSONB and optionally current_step
            if next_step:
                row = await conn.fetchrow(
                    """
                    UPDATE onboarding_sessions
                    SET steps_completed = jsonb_set(steps_completed, $2, $3),
                        current_step = $4,
                        last_activity_at = NOW()
                    WHERE session_id = $1
                    RETURNING *
                    """,
                    session_id,
                    [step],
                    str(completed).lower(),
                    next_step,
                )
            else:
                row = await conn.fetchrow(
                    """
                    UPDATE onboarding_sessions
                    SET steps_completed = jsonb_set(steps_completed, $2, $3),
                        last_activity_at = NOW()
                    WHERE session_id = $1
                    RETURNING *
                    """,
                    session_id,
                    [step],
                    str(completed).lower(),
                )

            if row:
                logger.info(
                    "Onboarding step updated",
                    extra={
                        "session_id": str(session_id),
                        "step": step,
                        "completed": completed,
                        "next_step": next_step,
                    },
                )

            return self._row_to_dict(row) if row else None

    async def increment_error(
        self,
        session_id: UUID,
        error_message: str,
    ) -> Optional[dict[str, Any]]:
        """Increment error count and record last error.

        Args:
            session_id: Session ID to update
            error_message: Error message to record

        Returns:
            Updated session record or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE onboarding_sessions
                SET error_count = error_count + 1,
                    last_error = $2,
                    last_activity_at = NOW()
                WHERE session_id = $1
                RETURNING *
                """,
                session_id,
                error_message,
            )

            if row:
                logger.warning(
                    "Onboarding error recorded",
                    extra={
                        "session_id": str(session_id),
                        "error_count": row["error_count"],
                        "error": error_message,
                    },
                )

            return self._row_to_dict(row) if row else None

    async def complete(
        self,
        session_id: UUID,
        user_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Mark session as completed.

        Args:
            session_id: Session ID to complete
            user_id: Created user ID
            workspace_id: Created workspace ID

        Returns:
            Updated session record or None if not found
        """
        now = datetime.now(timezone.utc)
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE onboarding_sessions
                SET status = 'completed',
                    current_step = 'completed',
                    user_id = $2,
                    workspace_id = $3,
                    completed_at = $4,
                    last_activity_at = $4,
                    steps_completed = jsonb_set(
                        jsonb_set(steps_completed, '{workspace_setup}', 'true'),
                        '{completed}', 'true'
                    )
                WHERE session_id = $1
                RETURNING *
                """,
                session_id,
                user_id,
                workspace_id,
                now,
            )

            if row:
                logger.info(
                    "Onboarding completed",
                    extra={
                        "session_id": str(session_id),
                        "user_id": str(user_id),
                        "workspace_id": str(workspace_id),
                    },
                )

            return self._row_to_dict(row) if row else None

    async def abandon(self, session_id: UUID) -> Optional[dict[str, Any]]:
        """Mark session as abandoned.

        Args:
            session_id: Session ID to abandon

        Returns:
            Updated session record or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE onboarding_sessions
                SET status = 'abandoned',
                    last_activity_at = NOW()
                WHERE session_id = $1
                RETURNING *
                """,
                session_id,
            )

            if row:
                logger.info(
                    "Onboarding session abandoned",
                    extra={"session_id": str(session_id)},
                )

            return self._row_to_dict(row) if row else None

    async def expire_old_sessions(self) -> int:
        """Expire all sessions past their expiry time.

        Returns:
            Number of sessions expired
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE onboarding_sessions
                SET status = 'expired'
                WHERE status = 'active'
                  AND expires_at < NOW()
                """
            )

            # Parse "UPDATE N" result
            count = int(result.split()[-1]) if result else 0

            if count > 0:
                logger.info(
                    "Expired old onboarding sessions",
                    extra={"count": count},
                )

            return count

    # =========================================================================
    # ANALYTICS QUERIES
    # =========================================================================

    async def get_funnel_stats(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> dict[str, Any]:
        """Get onboarding funnel statistics.

        Args:
            start_date: Start of date range (default: 30 days ago)
            end_date: End of date range (default: now)

        Returns:
            Dict with funnel statistics
        """
        if not start_date:
            start_date = datetime.now(timezone.utc) - timedelta(days=30)
        if not end_date:
            end_date = datetime.now(timezone.utc)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total_sessions,
                    COUNT(*) FILTER (WHERE steps_completed->>'plan_selection' = 'true') as plan_selected,
                    COUNT(*) FILTER (WHERE steps_completed->>'registration' = 'true') as registered,
                    COUNT(*) FILTER (WHERE steps_completed->>'email_verification' = 'true') as email_verified,
                    COUNT(*) FILTER (WHERE steps_completed->>'payment' = 'true') as payment_completed,
                    COUNT(*) FILTER (WHERE status = 'completed') as completed,
                    COUNT(*) FILTER (WHERE status = 'abandoned') as abandoned,
                    COUNT(*) FILTER (WHERE status = 'expired') as expired
                FROM onboarding_sessions
                WHERE created_at BETWEEN $1 AND $2
                """,
                start_date,
                end_date,
            )

            return dict(row) if row else {}

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    def _hash_token(self, token: str) -> str:
        """Hash a session token for secure storage.

        Args:
            token: Plain session token

        Returns:
            SHA-256 hash of token
        """
        return hashlib.sha256(token.encode()).hexdigest()

    def _row_to_dict(self, row) -> dict[str, Any]:
        """Convert a database row to a dictionary.

        Args:
            row: asyncpg Record object

        Returns:
            Dictionary representation of the row
        """
        if row is None:
            return {}

        result = dict(row)

        # Convert UUIDs to strings
        uuid_fields = ["session_id", "user_id", "workspace_id", "plan_id"]
        for field in uuid_fields:
            if field in result and result[field] is not None:
                result[field] = str(result[field])

        # Convert datetimes to ISO format strings
        datetime_fields = [
            "created_at",
            "updated_at",
            "expires_at",
            "completed_at",
            "last_activity_at",
            "email_verification_sent_at",
        ]
        for field in datetime_fields:
            if field in result and result[field] is not None:
                result[field] = result[field].isoformat()

        return result


# =============================================================================
# SINGLETON FACTORY
# =============================================================================

_onboarding_repository: Optional[OnboardingSessionRepository] = None


def get_onboarding_repository() -> OnboardingSessionRepository:
    """Get the singleton OnboardingSessionRepository instance.

    Returns:
        OnboardingSessionRepository singleton instance
    """
    global _onboarding_repository
    if _onboarding_repository is None:
        _onboarding_repository = OnboardingSessionRepository()
    return _onboarding_repository
