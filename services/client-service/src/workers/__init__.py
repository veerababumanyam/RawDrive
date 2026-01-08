"""Background workers for client-service."""

from src.workers.gdpr_cleanup import cleanup_expired_clients

__all__ = ["cleanup_expired_clients"]
