"""Redis-backed session storage service.

Handles session lifecycle: creation, lookup, refresh, invalidation.
Sessions are stored in Redis with configurable TTL and tracked in PostgreSQL
for audit/management.

Requirements: 2.1, 2.4, 23.1, 23.3
"""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from app.config.settings import AppSettings, get_settings
from app.db.postgres import get_postgres_pool
from app.db.redis import get_redis_client

logger = logging.getLogger(__name__)


@dataclass
class SessionData:
    """Session metadata stored in Redis."""

    session_id: uuid.UUID
    user_id: uuid.UUID
    workspace_id: uuid.UUID | None
    refresh_token_hash: str
    device_info: dict[str, Any] = field(default_factory=dict)
    device_fingerprint: str | None = None
    ip_address: str | None = None
    last_ip_address: str | None = None
    ip_changed_at: datetime | None = None
    user_agent: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    last_used_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "session_id": str(self.session_id),
            "user_id": str(self.user_id),
            "workspace_id": str(self.workspace_id) if self.workspace_id else None,
            "refresh_token_hash": self.refresh_token_hash,
            "device_info": self.device_info,
            "device_fingerprint": self.device_fingerprint,
            "ip_address": self.ip_address,
            "last_ip_address": self.last_ip_address,
            "ip_changed_at": self.ip_changed_at.isoformat() if self.ip_changed_at else None,
            "user_agent": self.user_agent,
            "created_at": self.created_at.isoformat(),
            "last_used_at": self.last_used_at.isoformat(),
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "SessionData":
        return cls(
            session_id=uuid.UUID(data["session_id"]),
            user_id=uuid.UUID(data["user_id"]),
            workspace_id=uuid.UUID(data["workspace_id"]) if data.get("workspace_id") else None,
            refresh_token_hash=data["refresh_token_hash"],
            device_info=data.get("device_info", {}),
            device_fingerprint=data.get("device_fingerprint"),
            ip_address=data.get("ip_address"),
            last_ip_address=data.get("last_ip_address"),
            ip_changed_at=datetime.fromisoformat(data["ip_changed_at"]) if data.get("ip_changed_at") else None,
            user_agent=data.get("user_agent"),
            created_at=datetime.fromisoformat(data["created_at"]),
            last_used_at=datetime.fromisoformat(data["last_used_at"]),
            expires_at=datetime.fromisoformat(data["expires_at"]) if data.get("expires_at") else None,
        )


def _hash_token(token: str) -> str:
    """SHA-256 hash of token for storage."""
    return hashlib.sha256(token.encode()).hexdigest()


def _session_key(session_id: uuid.UUID) -> str:
    """Redis key for session data."""
    return f"session:{session_id}"


def _user_sessions_key(user_id: uuid.UUID) -> str:
    """Redis key for user's session list."""
    return f"user_sessions:{user_id}"


class SessionService:
    """Manages user sessions in Redis and PostgreSQL."""

    MAX_SESSIONS_PER_USER = 5

    def __init__(self, settings: AppSettings | None = None):
        self._settings = settings or get_settings()
        self._ttl_seconds = self._settings.refresh_token_ttl_days * 86400

    async def create_session(
        self,
        user_id: uuid.UUID,
        workspace_id: uuid.UUID | None,
        refresh_token: str,
        device_info: dict[str, Any] | None = None,
        device_fingerprint: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> SessionData:
        """Create a new session and store in Redis + PostgreSQL.

        Enforces maximum sessions per user (Property 16).
        """
        redis = await get_redis_client()
        pool = await get_postgres_pool()

        session_id = uuid.uuid4()
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(seconds=self._ttl_seconds)
        token_hash = _hash_token(refresh_token)

        session = SessionData(
            session_id=session_id,
            user_id=user_id,
            workspace_id=workspace_id,
            refresh_token_hash=token_hash,
            device_info=device_info or {},
            device_fingerprint=device_fingerprint,
            ip_address=ip_address,
            last_ip_address=ip_address,  # Initialize with current IP
            ip_changed_at=None,  # No change yet
            user_agent=user_agent,
            created_at=now,
            last_used_at=now,
            expires_at=expires_at,
        )

        # Store session in Redis
        await redis.setex(
            _session_key(session_id),
            self._ttl_seconds,
            json.dumps(session.to_dict()),
        )

        # Add to user's session set
        await redis.sadd(_user_sessions_key(user_id), str(session_id))

        # Enforce max sessions (Property 16)
        await self._enforce_max_sessions(user_id)

        # Store in PostgreSQL for persistence/audit
        try:
            await pool.execute(
                """
                INSERT INTO sessions (
                    session_id, user_id, workspace_id, refresh_token_hash,
                    device_info, device_fingerprint,
                    ip_address, last_ip_address, ip_changed_at,
                    user_agent, created_at, last_used_at, expires_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                """,
                session_id,
                user_id,
                workspace_id,
                token_hash,
                json.dumps(device_info or {}),
                device_fingerprint,
                ip_address,
                ip_address,  # last_ip_address initialized same as ip_address
                None,  # ip_changed_at
                user_agent,
                now,  # $11 - created_at
                now,  # $12 - last_used_at
                expires_at,  # $13
            )
        except Exception as e:
            logger.error(
                "Failed to create session in PostgreSQL",
                extra={
                    "error_type": type(e).__name__,
                    "error_message": str(e),
                    "user_id": str(user_id),
                    "workspace_id": str(workspace_id) if workspace_id else None,
                    "session_id": str(session_id),
                },
                exc_info=True,
            )
            raise

        logger.info("Session created", extra={"session_id": str(session_id), "user_id": str(user_id)})
        return session

    async def get_session(self, session_id: uuid.UUID) -> SessionData | None:
        """Retrieve session from Redis."""
        redis = await get_redis_client()
        data = await redis.get(_session_key(session_id))

        if data is None:
            return None

        return SessionData.from_dict(json.loads(data))

    async def get_session_by_token_hash(self, token_hash: str, user_id: uuid.UUID) -> SessionData | None:
        """Find session by refresh token hash."""
        redis = await get_redis_client()
        session_ids = await redis.smembers(_user_sessions_key(user_id))

        for sid_bytes in session_ids:
            sid = uuid.UUID(sid_bytes.decode() if isinstance(sid_bytes, bytes) else sid_bytes)
            session = await self.get_session(sid)
            if session and session.refresh_token_hash == token_hash:
                return session

        return None

    async def update_session_token(
        self,
        session_id: uuid.UUID,
        new_refresh_token: str,
    ) -> SessionData | None:
        """Update session with new refresh token (rotation).

        Property 4: Token Refresh Rotation
        """
        redis = await get_redis_client()
        pool = await get_postgres_pool()

        session = await self.get_session(session_id)
        if session is None:
            return None

        now = datetime.now(timezone.utc)
        new_hash = _hash_token(new_refresh_token)

        session.refresh_token_hash = new_hash
        session.last_used_at = now

        # Update Redis
        remaining_ttl = await redis.ttl(_session_key(session_id))
        if remaining_ttl > 0:
            await redis.setex(
                _session_key(session_id),
                remaining_ttl,
                json.dumps(session.to_dict()),
            )

        # Update PostgreSQL
        await pool.execute(
            "UPDATE sessions SET refresh_token_hash = $1, last_used_at = $2 WHERE session_id = $3",
            new_hash,
            now,
            session_id,
        )

        logger.debug("Session token rotated", extra={"session_id": str(session_id)})
        return session

    async def invalidate_session(self, session_id: uuid.UUID) -> bool:
        """Invalidate/revoke a session.

        Property 9: Session Termination Token Invalidation
        """
        redis = await get_redis_client()
        pool = await get_postgres_pool()

        session = await self.get_session(session_id)
        if session is None:
            return False

        # Remove from Redis
        await redis.delete(_session_key(session_id))
        await redis.srem(_user_sessions_key(session.user_id), str(session_id))

        # Mark revoked in PostgreSQL
        await pool.execute(
            "UPDATE sessions SET revoked_at = NOW() WHERE session_id = $1",
            session_id,
        )

        logger.info("Session invalidated", extra={"session_id": str(session_id)})
        return True

    async def invalidate_all_user_sessions(self, user_id: uuid.UUID) -> int:
        """Invalidate all sessions for a user (e.g., password change).

        Property 18: Password Change Token Revocation
        """
        redis = await get_redis_client()
        pool = await get_postgres_pool()

        session_ids = await redis.smembers(_user_sessions_key(user_id))
        count = 0

        for sid_bytes in session_ids:
            sid = uuid.UUID(sid_bytes.decode() if isinstance(sid_bytes, bytes) else sid_bytes)
            await redis.delete(_session_key(sid))
            count += 1

        await redis.delete(_user_sessions_key(user_id))

        # Mark all revoked in PostgreSQL
        await pool.execute(
            "UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL",
            user_id,
        )

        logger.info("All user sessions invalidated", extra={"user_id": str(user_id), "count": count})
        return count

    async def list_user_sessions(self, user_id: uuid.UUID) -> list[SessionData]:
        """List all active sessions for a user."""
        redis = await get_redis_client()
        session_ids = await redis.smembers(_user_sessions_key(user_id))

        sessions: list[SessionData] = []
        for sid_bytes in session_ids:
            sid = uuid.UUID(sid_bytes.decode() if isinstance(sid_bytes, bytes) else sid_bytes)
            session = await self.get_session(sid)
            if session:
                sessions.append(session)

        return sorted(sessions, key=lambda s: s.created_at, reverse=True)

    async def _enforce_max_sessions(self, user_id: uuid.UUID) -> None:
        """Enforce maximum sessions per user by terminating oldest.

        Property 16: Maximum Session Enforcement
        """
        sessions = await self.list_user_sessions(user_id)

        if len(sessions) <= self.MAX_SESSIONS_PER_USER:
            return

        # Sort by creation time, oldest first
        sessions.sort(key=lambda s: s.created_at)

        # Terminate oldest sessions
        excess = len(sessions) - self.MAX_SESSIONS_PER_USER
        for session in sessions[:excess]:
            await self.invalidate_session(session.session_id)
            logger.info(
                "Oldest session terminated (max sessions enforced)",
                extra={"session_id": str(session.session_id), "user_id": str(user_id)},
            )

    async def terminate_session(self, session_id: uuid.UUID) -> bool:
        """Terminate a specific session.

        Alias for invalidate_session for API consistency.
        """
        return await self.invalidate_session(session_id)

    async def terminate_all_sessions(
        self,
        user_id: uuid.UUID,
        except_session_id: uuid.UUID | None = None,
    ) -> int:
        """Terminate all sessions for a user, optionally keeping one.

        Args:
            user_id: User whose sessions to terminate
            except_session_id: Session ID to keep (current session)

        Returns:
            Number of sessions terminated
        """
        redis = await get_redis_client()
        pool = await get_postgres_pool()

        session_ids = await redis.smembers(_user_sessions_key(user_id))
        count = 0

        for sid_bytes in session_ids:
            sid = uuid.UUID(sid_bytes.decode() if isinstance(sid_bytes, bytes) else sid_bytes)
            
            # Skip the session we want to keep
            if except_session_id and sid == except_session_id:
                continue
                
            await redis.delete(_session_key(sid))
            await redis.srem(_user_sessions_key(user_id), str(sid))
            count += 1

        # Mark revoked in PostgreSQL (except the one to keep)
        if except_session_id:
            await pool.execute(
                """
                UPDATE sessions SET revoked_at = NOW() 
                WHERE user_id = $1 AND revoked_at IS NULL AND session_id != $2
                """,
                user_id,
                except_session_id,
            )
        else:
            await pool.execute(
                "UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL",
                user_id,
            )

        logger.info(
            "User sessions terminated",
            extra={"user_id": str(user_id), "count": count, "kept": str(except_session_id) if except_session_id else None},
        )
        return count

    async def update_session_ip(self, session_id: uuid.UUID, new_ip: str) -> SessionData | None:
        """Update session with new IP address when it changes.

        Tracks IP changes for security monitoring.
        """
        redis = await get_redis_client()
        pool = await get_postgres_pool()

        session = await self.get_session(session_id)
        if session is None:
            return None

        now = datetime.now(timezone.utc)

        # Update session data
        old_ip = session.last_ip_address
        session.last_ip_address = new_ip
        session.ip_changed_at = now
        session.last_used_at = now

        # Update Redis
        remaining_ttl = await redis.ttl(_session_key(session_id))
        if remaining_ttl > 0:
            await redis.setex(
                _session_key(session_id),
                remaining_ttl,
                json.dumps(session.to_dict()),
            )

        # Update PostgreSQL
        await pool.execute(
            """
            UPDATE sessions
            SET last_ip_address = $1, ip_changed_at = $2, last_used_at = $3
            WHERE session_id = $4
            """,
            new_ip,
            now,
            now,
            session_id,
        )

        logger.warning(
            "Session IP address changed",
            extra={
                "session_id": str(session_id),
                "old_ip": old_ip,
                "new_ip": new_ip,
                "user_id": str(session.user_id),
            },
        )
        return session
