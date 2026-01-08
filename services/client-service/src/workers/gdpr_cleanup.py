"""
GDPR Cleanup Background Worker.

Permanently deletes clients whose retention period has expired.
Implements GDPR Article 17 (Right to Erasure) retention policy.

This worker should be scheduled to run daily via Celery Beat or cron.
"""

import asyncio
from datetime import datetime
from typing import Dict, Any, List

from src.database import execute_query
from src.services.audit_service import get_audit_service
from src.config import settings
from src.log_config import get_logger

logger = get_logger(__name__)


async def cleanup_expired_clients() -> Dict[str, Any]:
    """
    Permanently delete clients whose retention period has expired.

    GDPR Article 17: Right to Erasure
    - Clients marked for deletion (deleted=TRUE)
    - retention_expires_at < NOW()

    This is a PERMANENT deletion - data cannot be recovered.

    Returns:
        Dict with cleanup statistics

    Process:
        1. Find expired clients
        2. Log deletion in audit_logs (for compliance)
        3. Permanently delete client data (cascade to related entities)
        4. Return statistics
    """
    audit_service = get_audit_service()

    try:
        # Find all clients whose retention period has expired
        find_expired_query = """
            SELECT
                client_id,
                workspace_id,
                full_name,
                deleted_at,
                retention_expires_at
            FROM clients
            WHERE deleted = TRUE
              AND retention_expires_at IS NOT NULL
              AND retention_expires_at <= NOW()
            ORDER BY retention_expires_at
        """

        expired_clients = await execute_query(
            find_expired_query,
            read_only=True,
            fetch_all=True,
        )

        if not expired_clients:
            logger.info("GDPR cleanup: No expired clients found")
            return {
                "status": "success",
                "deleted_count": 0,
                "message": "No expired clients found",
            }

        deleted_count = 0
        deleted_ids = []

        for client in expired_clients:
            client_id = str(client["client_id"])
            workspace_id = str(client["workspace_id"])

            try:
                # Log the permanent deletion in audit logs (for compliance)
                # This audit log will remain even after client is deleted
                await audit_service.log_change(
                    workspace_id=workspace_id,
                    user_id=None,  # System action
                    entity_type="client",
                    entity_id=client_id,
                    action="delete",
                    before={
                        "client_id": client_id,
                        "full_name": client["full_name"],
                        "deleted_at": client["deleted_at"].isoformat() if client["deleted_at"] else None,
                        "retention_expires_at": client["retention_expires_at"].isoformat() if client["retention_expires_at"] else None,
                        "permanent_deletion": True,
                        "gdpr_compliance": "Article_17_Right_to_Erasure",
                    },
                    after=None,  # Permanently deleted
                    ip_address=None,
                    user_agent="gdpr_cleanup_worker",
                )

                # Permanently delete client and cascade to related entities
                # This DELETE will cascade to:
                # - client_contacts
                # - client_addresses
                # - client_activities
                # - client_communications
                # - client_tag_assignments
                # - client_gallery_links
                delete_query = """
                    DELETE FROM clients
                    WHERE client_id = $1 AND workspace_id = $2
                """

                await execute_query(
                    delete_query,
                    client_id,
                    workspace_id,
                    fetch_all=False,
                )

                deleted_count += 1
                deleted_ids.append(client_id)

                logger.info(
                    "GDPR cleanup: Client permanently deleted",
                    extra={
                        "client_id": client_id,
                        "workspace_id": workspace_id,
                        "full_name": client["full_name"],
                        "retention_expired_at": client["retention_expires_at"].isoformat() if client["retention_expires_at"] else None,
                    },
                )

            except Exception as e:
                logger.error(
                    "GDPR cleanup: Failed to delete client",
                    extra={
                        "client_id": client_id,
                        "workspace_id": workspace_id,
                        "error": str(e),
                    },
                )
                # Continue with next client even if one fails

        result = {
            "status": "success",
            "deleted_count": deleted_count,
            "deleted_client_ids": deleted_ids,
            "total_found": len(expired_clients),
            "timestamp": datetime.utcnow().isoformat(),
        }

        logger.info(
            "GDPR cleanup completed",
            extra=result,
        )

        return result

    except Exception as e:
        logger.error(
            "GDPR cleanup failed",
            extra={"error": str(e)},
        )
        return {
            "status": "error",
            "deleted_count": 0,
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat(),
        }


async def cleanup_old_audit_logs() -> Dict[str, Any]:
    """
    Clean up audit logs older than retention period.

    SOC2 CC6.7: Log Retention
    - Default: 7 years (2555 days)
    - Configurable via AUDIT_LOG_RETENTION_DAYS

    Returns:
        Dict with cleanup statistics
    """
    try:
        retention_days = settings.AUDIT_LOG_RETENTION_DAYS

        # Find and delete audit logs older than retention period
        delete_query = """
            DELETE FROM audit_logs
            WHERE created_at < NOW() - ($1 || ' days')::INTERVAL
        """

        result = await execute_query(
            delete_query,
            retention_days,
            fetch_all=False,
        )

        # Extract deleted count from result string (e.g., "DELETE 42")
        deleted_count = 0
        if result and isinstance(result, str) and "DELETE" in result:
            try:
                deleted_count = int(result.split()[-1])
            except (IndexError, ValueError):
                deleted_count = 0

        logger.info(
            "Audit log cleanup completed",
            extra={
                "deleted_count": deleted_count,
                "retention_days": retention_days,
            },
        )

        return {
            "status": "success",
            "deleted_count": deleted_count,
            "retention_days": retention_days,
            "timestamp": datetime.utcnow().isoformat(),
        }

    except Exception as e:
        logger.error(
            "Audit log cleanup failed",
            extra={"error": str(e)},
        )
        return {
            "status": "error",
            "deleted_count": 0,
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat(),
        }


# ==============================================================================
# Celery Task Integration (if using Celery)
# ==============================================================================

try:
    from celery import shared_task

    @shared_task(name="gdpr_cleanup_expired_clients")
    def celery_cleanup_expired_clients():
        """
        Celery task wrapper for cleanup_expired_clients.

        Schedule this task to run daily via Celery Beat:

        CELERYBEAT_SCHEDULE = {
            'gdpr-cleanup-daily': {
                'task': 'gdpr_cleanup_expired_clients',
                'schedule': crontab(hour=2, minute=0),  # Run at 2:00 AM daily
            },
        }
        """
        return asyncio.run(cleanup_expired_clients())

    @shared_task(name="cleanup_old_audit_logs")
    def celery_cleanup_audit_logs():
        """
        Celery task wrapper for cleanup_old_audit_logs.

        Schedule this task to run weekly:

        CELERYBEAT_SCHEDULE = {
            'audit-cleanup-weekly': {
                'task': 'cleanup_old_audit_logs',
                'schedule': crontab(hour=3, minute=0, day_of_week=0),  # Sundays at 3 AM
            },
        }
        """
        return asyncio.run(cleanup_old_audit_logs())

except ImportError:
    # Celery not available - tasks can be called directly via asyncio
    logger.info("Celery not available - GDPR cleanup tasks will run without Celery")


# ==============================================================================
# CLI Entry Point (for manual execution or cron)
# ==============================================================================

async def main():
    """
    CLI entry point for manual execution.

    Usage:
        python -m src.workers.gdpr_cleanup
    """
    logger.info("Starting GDPR cleanup job")

    # Run client cleanup
    client_result = await cleanup_expired_clients()
    print(f"Client cleanup: {client_result}")

    # Run audit log cleanup
    audit_result = await cleanup_old_audit_logs()
    print(f"Audit log cleanup: {audit_result}")


if __name__ == "__main__":
    asyncio.run(main())
