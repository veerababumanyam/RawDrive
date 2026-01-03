"""Audit logging service for security event persistence.

Property 1: Audit Trail Completeness
All auth events must be logged.

Architecture (Zero Request Latency):
1. Events captured to in-memory async queue - ~0ms (non-blocking)
2. Background worker batches and pushes to Loki every N seconds
3. Loki stores logs with labels for efficient querying
4. Grafana dashboard for visualization/alerting

Benefits of Loki:
- Open-source (Apache 2.0)
- Optimized for logs (indexes labels only, not content)
- Horizontally scalable
- Native Grafana integration
- Simple HTTP push API (no agent needed)
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# Configuration
LOKI_URL = os.getenv("LOKI_URL", "http://localhost:3100")
LOKI_PUSH_PATH = "/loki/api/v1/push"
AUDIT_BATCH_SIZE = int(os.getenv("AUDIT_BATCH_SIZE", "100"))
AUDIT_FLUSH_INTERVAL = float(os.getenv("AUDIT_FLUSH_INTERVAL", "5.0"))  # seconds
LOKI_TENANT_ID = os.getenv("LOKI_TENANT_ID", "rawdrive")  # Multi-tenant support

# In-memory buffer - thread-safe deque, zero latency append
_audit_queue: deque[dict[str, Any]] = deque(maxlen=100000)
_flush_task: asyncio.Task | None = None
_http_client: httpx.AsyncClient | None = None


async def _get_http_client() -> httpx.AsyncClient:
    """Get or create HTTP client for Loki."""
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(timeout=10.0)
    return _http_client


async def _push_to_loki(events: list[dict[str, Any]]) -> bool:
    """Push batch of events to Loki.
    
    Loki expects format:
    {
        "streams": [
            {
                "stream": {"app": "rawdrive", "type": "audit", ...},
                "values": [["<nanosecond_timestamp>", "<json_line>"], ...]
            }
        ]
    }
    """
    if not events:
        return True

    try:
        client = await _get_http_client()
        
        # Group events by workspace for efficient labeling
        streams_by_workspace: dict[str, list] = {}
        
        for event in events:
            workspace_id = event.get("workspace_id") or "platform"
            if workspace_id not in streams_by_workspace:
                streams_by_workspace[workspace_id] = []
            
            # Loki timestamp is nanoseconds as string
            ts_ns = str(int(datetime.fromisoformat(event["created_at"]).timestamp() * 1e9))
            streams_by_workspace[workspace_id].append([ts_ns, json.dumps(event)])
        
        # Build Loki payload
        streams = []
        for workspace_id, values in streams_by_workspace.items():
            streams.append({
                "stream": {
                    "app": "rawdrive",
                    "type": "audit",
                    "workspace_id": workspace_id,
                    "env": os.getenv("APP_ENV", "development"),
                },
                "values": values,
            })
        
        payload = {"streams": streams}
        
        response = await client.post(
            f"{LOKI_URL}{LOKI_PUSH_PATH}",
            json=payload,
            headers={
                "Content-Type": "application/json",
                "X-Scope-OrgID": LOKI_TENANT_ID,
            },
        )
        
        if response.status_code == 204:
            logger.debug(f"Pushed {len(events)} audit events to Loki")
            return True
        else:
            logger.error(f"Loki push failed: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        logger.error(f"Failed to push to Loki: {e}")
        return False


async def _flush_worker():
    """Background worker that flushes audit queue to Loki."""
    while True:
        try:
            await asyncio.sleep(AUDIT_FLUSH_INTERVAL)
            
            # Drain queue
            batch = []
            while _audit_queue and len(batch) < AUDIT_BATCH_SIZE:
                try:
                    batch.append(_audit_queue.popleft())
                except IndexError:
                    break
            
            if batch:
                success = await _push_to_loki(batch)
                if not success:
                    # Re-queue failed events (at front)
                    for event in reversed(batch):
                        _audit_queue.appendleft(event)
                        
        except asyncio.CancelledError:
            # Final flush on shutdown
            batch = list(_audit_queue)
            if batch:
                await _push_to_loki(batch)
            break
        except Exception as e:
            logger.error(f"Audit flush worker error: {e}")


def start_audit_worker():
    """Start the background flush worker. Call on app startup."""
    global _flush_task
    if _flush_task is None:
        _flush_task = asyncio.create_task(_flush_worker())
        logger.info("Audit flush worker started")


async def stop_audit_worker():
    """Stop the background flush worker. Call on app shutdown."""
    global _flush_task, _http_client
    if _flush_task:
        _flush_task.cancel()
        try:
            await _flush_task
        except asyncio.CancelledError:
            pass
        _flush_task = None
    if _http_client:
        await _http_client.aclose()
        _http_client = None
    logger.info("Audit flush worker stopped")


class AuditEventType(str, Enum):
    """Types of audit events."""

    # Authentication events
    AUTH_SIGNUP = "auth.signup"
    AUTH_LOGIN = "auth.login"
    AUTH_LOGOUT = "auth.logout"
    AUTH_TOKEN_REFRESH = "auth.token_refresh"
    AUTH_OAUTH_CALLBACK = "auth.oauth_callback"
    AUTH_PASSWORD_CHANGE = "auth.password_change"
    AUTH_PASSWORD_RESET = "auth.password_reset"
    AUTH_EMAIL_VERIFIED = "auth.email_verified"
    AUTH_SESSION_INVALIDATED = "auth.session_invalidated"

    # Workspace events
    WORKSPACE_CREATED = "workspace.created"
    WORKSPACE_UPDATED = "workspace.updated"
    WORKSPACE_DELETED = "workspace.deleted"

    # Member events
    MEMBER_INVITED = "member.invited"
    MEMBER_JOINED = "member.joined"
    MEMBER_REMOVED = "member.removed"
    MEMBER_ROLE_CHANGED = "member.role_changed"

    # Role events
    ROLE_CREATED = "role.created"
    ROLE_UPDATED = "role.updated"
    ROLE_DELETED = "role.deleted"

    # Gallery events
    GALLERY_CREATED = "gallery.created"
    GALLERY_UPDATED = "gallery.updated"
    GALLERY_DELETED = "gallery.deleted"
    GALLERY_SHARED = "gallery.shared"

    # Asset events
    ASSET_UPLOADED = "asset.uploaded"
    ASSET_DOWNLOADED = "asset.downloaded"
    ASSET_DELETED = "asset.deleted"

    # Face group events
    FACE_GROUPS_MERGED = "face_group.merged"
    FACE_GROUP_SPLIT = "face_group.split"
    FACE_GROUP_PERSON_ASSIGNED = "face_group.person_assigned"

    # Deletion/Recycle Bin events
    GALLERY_SOFT_DELETED = "gallery.soft_deleted"
    GALLERY_RESTORED = "gallery.restored"
    GALLERY_PERMANENT_DELETED = "gallery.permanent_deleted"
    ASSET_SOFT_DELETED = "asset.soft_deleted"
    ASSET_RESTORED = "asset.restored"
    ASSET_PERMANENT_DELETED = "asset.permanent_deleted"
    RECYCLE_BIN_CLEANUP = "recycle_bin.cleanup"
    DELETION_FAILED = "deletion.failed"

    # Admin events
    ADMIN_ACTION = "admin.action"
    ADMIN_SUPPORT_ACCESS = "admin.support_access"

    # API events
    API_KEY_CREATED = "api.key_created"
    API_KEY_REVOKED = "api.key_revoked"

    # Company Profile events
    PROFILE_CREATED = "profile.created"
    PROFILE_UPDATED = "profile.updated"
    POLICY_GENERATED = "policy.generated"

    # User Profile events
    USER_PROFILE_UPDATED = "user.profile_updated"
    USER_AVATAR_UPLOADED = "user.avatar_uploaded"
    USER_AVATAR_DELETED = "user.avatar_deleted"
    USER_EMAIL_CHANGE_REQUESTED = "user.email_change_requested"
    USER_EMAIL_CHANGED = "user.email_changed"
    USER_2FA_ENABLED = "user.2fa_enabled"
    USER_2FA_DISABLED = "user.2fa_disabled"
    USER_SETTINGS_UPDATED = "user.settings_updated"
    SETTINGS_CHANGED = "settings.changed"  # Generic settings change (AI, platform, etc.)
    USER_DELETION_REQUESTED = "user.deletion_requested"
    USER_DELETION_CANCELLED = "user.deletion_cancelled"
    USER_DELETION_COMPLETED = "user.deletion_completed"  # GDPR: Record when data deleted
    USER_DELETION_FAILED = "user.deletion_failed"  # GDPR: Record deletion failures
    DATA_EXPORT_REQUESTED = "user.data_export_requested"

    # Invitation Lifecycle Events (020-invitation-rsvp-hardening)
    INVITATION_CREATED = "invitation.created"
    INVITATION_PUBLISHED = "invitation.published"
    INVITATION_ARCHIVED = "invitation.archived"
    INVITATION_DELETED = "invitation.deleted"
    INVITATION_ACCESS_DENIED = "invitation.access_denied"

    # RSVP Events (020-invitation-rsvp-hardening)
    RSVP_SUBMITTED = "rsvp.submitted"
    RSVP_UPDATED = "rsvp.updated"
    RSVP_DELETED = "rsvp.deleted"
    RSVP_EDIT_TOKEN_USED = "rsvp.edit_token_used"
    RSVP_EDIT_TOKEN_INVALID = "rsvp.edit_token_invalid"
    RSVP_EXPORTED = "rsvp.exported"


@dataclass
class AuditEvent:
    """Audit event for logging."""

    event_id: uuid.UUID
    event_type: AuditEventType
    workspace_id: uuid.UUID | None
    actor_user_id: uuid.UUID | None
    target_entity_type: str | None
    target_entity_id: uuid.UUID | None
    details: dict[str, Any]
    ip_address: str | None
    user_agent: str | None
    created_at: datetime


class AuditService:
    """Service for recording and querying audit events.
    
    Write path: In-memory queue → Loki (async, non-blocking)
    Read path: Query via Loki LogQL or Grafana
    """

    async def log_event(
        self,
        event_type: AuditEventType,
        workspace_id: uuid.UUID | None = None,
        actor_user_id: uuid.UUID | None = None,
        target_entity_type: str | None = None,
        target_entity_id: uuid.UUID | None = None,
        details: dict[str, Any] | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> AuditEvent:
        """Record an audit event (non-blocking, ~0ms latency).

        Property 1: Audit Trail Completeness
        """
        event_id = uuid.uuid4()
        now = datetime.now(timezone.utc)
        details = details or {}

        event = AuditEvent(
            event_id=event_id,
            event_type=event_type,
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
            target_entity_type=target_entity_type,
            target_entity_id=target_entity_id,
            details=details,
            ip_address=ip_address,
            user_agent=user_agent,
            created_at=now,
        )

        # Add to queue (non-blocking, ~0ms)
        log_entry = {
            "event_id": str(event_id),
            "event_type": event_type.value,
            "workspace_id": str(workspace_id) if workspace_id else None,
            "actor_user_id": str(actor_user_id) if actor_user_id else None,
            "target_entity_type": target_entity_type,
            "target_entity_id": str(target_entity_id) if target_entity_id else None,
            "details": details,
            "ip_address": ip_address,
            "user_agent": user_agent,
            "created_at": now.isoformat(),
        }
        _audit_queue.append(log_entry)

        return event

    async def query_events(
        self,
        workspace_id: uuid.UUID | None = None,
        event_type: str | None = None,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Query audit events from Loki.
        
        Uses LogQL to query Loki's API.
        """
        try:
            client = await _get_http_client()
            
            # Build LogQL query
            labels = ['app="rawdrive"', 'type="audit"']
            if workspace_id:
                labels.append(f'workspace_id="{workspace_id}"')
            
            query = '{' + ','.join(labels) + '}'
            if event_type:
                query += f' |= "{event_type}"'
            
            params = {
                "query": query,
                "limit": limit,
            }
            
            if start_time:
                params["start"] = str(int(start_time.timestamp() * 1e9))
            if end_time:
                params["end"] = str(int(end_time.timestamp() * 1e9))
            
            response = await client.get(
                f"{LOKI_URL}/loki/api/v1/query_range",
                params=params,
                headers={"X-Scope-OrgID": LOKI_TENANT_ID},
            )
            
            if response.status_code != 200:
                logger.error(f"Loki query failed: {response.text}")
                return []
            
            data = response.json()
            results = []
            
            for stream in data.get("data", {}).get("result", []):
                for value in stream.get("values", []):
                    try:
                        results.append(json.loads(value[1]))
                    except json.JSONDecodeError:
                        pass
            
            return results
            
        except Exception as e:
            logger.error(f"Failed to query Loki: {e}")
            return []

    async def query_events_from_db(
        self,
        workspace_id: uuid.UUID | None = None,
        actor_user_id: uuid.UUID | None = None,
        event_types: list[AuditEventType] | None = None,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[AuditEvent]:
        """Query audit events from PostgreSQL (for imported historical data)."""
        # Import here to avoid circular dependency and keep DB optional
        from app.db.postgres import get_postgres_pool
        pool = await get_postgres_pool()

        # Build query dynamically
        conditions = []
        params: list[Any] = []
        param_idx = 1

        if workspace_id:
            conditions.append(f"workspace_id = ${param_idx}")
            params.append(workspace_id)
            param_idx += 1

        if actor_user_id:
            conditions.append(f"actor_user_id = ${param_idx}")
            params.append(actor_user_id)
            param_idx += 1

        if event_types:
            placeholders = ", ".join(f"${param_idx + i}" for i in range(len(event_types)))
            conditions.append(f"event_type IN ({placeholders})")
            params.extend(et.value for et in event_types)
            param_idx += len(event_types)

        if start_date:
            conditions.append(f"created_at >= ${param_idx}")
            params.append(start_date)
            param_idx += 1

        if end_date:
            conditions.append(f"created_at <= ${param_idx}")
            params.append(end_date)
            param_idx += 1

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        query = f"""
            SELECT event_id, event_type, workspace_id, actor_user_id,
                   target_entity_type, target_entity_id, details,
                   ip_address, user_agent, created_at
            FROM audit_logs
            {where_clause}
            ORDER BY created_at DESC
            LIMIT ${param_idx} OFFSET ${param_idx + 1}
        """
        params.extend([limit, offset])

        rows = await pool.fetch(query, *params)

        return [
            AuditEvent(
                event_id=row["event_id"],
                event_type=AuditEventType(row["event_type"]),
                workspace_id=row["workspace_id"],
                actor_user_id=row["actor_user_id"],
                target_entity_type=row["target_entity_type"],
                target_entity_id=row["target_entity_id"],
                details=row["details"] or {},
                ip_address=row["ip_address"],
                user_agent=row["user_agent"],
                created_at=row["created_at"],
            )
            for row in rows
        ]

    async def get_user_activity(
        self,
        user_id: uuid.UUID,
        limit: int = 50,
    ) -> list[AuditEvent]:
        """Get recent activity for a specific user."""
        return await self.query_events(
            actor_user_id=user_id,
            limit=limit,
        )

    async def get_workspace_activity(
        self,
        workspace_id: uuid.UUID,
        limit: int = 100,
    ) -> list[AuditEvent]:
        """Get recent activity in a workspace."""
        return await self.query_events(
            workspace_id=workspace_id,
            limit=limit,
        )


# Convenience functions for common audit events


async def log_auth_event(
    event_type: AuditEventType,
    user_id: uuid.UUID | None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    details: dict[str, Any] | None = None,
) -> AuditEvent:
    """Log an authentication event."""
    service = AuditService()
    return await service.log_event(
        event_type=event_type,
        actor_user_id=user_id,
        target_entity_type="user",
        target_entity_id=user_id,
        ip_address=ip_address,
        user_agent=user_agent,
        details=details,
    )


async def log_workspace_event(
    event_type: AuditEventType,
    workspace_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    target_entity_type: str | None = None,
    target_entity_id: uuid.UUID | None = None,
    details: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> AuditEvent:
    """Log a workspace-related event."""
    service = AuditService()
    return await service.log_event(
        event_type=event_type,
        workspace_id=workspace_id,
        actor_user_id=actor_user_id,
        target_entity_type=target_entity_type,
        target_entity_id=target_entity_id,
        ip_address=ip_address,
        details=details,
    )
