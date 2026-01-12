"""Central Configuration Service API.

Provides centralized configuration management for microservices.
Microservices can fetch their configuration from this endpoint, and
when config is updated centrally, all services automatically reflect
the changes on their next refresh.

Feature: Centralized Configuration Management
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from app.config.settings import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/config", tags=["config"])


class MicroserviceConfigResponse(BaseModel):
    """Configuration response for a microservice."""
    service_name: str
    config: dict[str, Any]
    version: str
    last_updated: str


@router.get(
    "/microservices/{service_name}",
    response_model=MicroserviceConfigResponse,
    summary="Get microservice configuration",
    description="Returns configuration for a specific microservice. Used by microservices to fetch their config. Can be called without auth for service-to-service communication.",
)
async def get_microservice_config(
    service_name: str,
    # Optional auth - allow service-to-service calls
    # For production, consider using service mesh authentication or API keys
    request: Request,
) -> MicroserviceConfigResponse:
    """
    Get configuration for a microservice.
    
    This endpoint serves environment variable-based configuration to microservices.
    Microservices call this periodically to refresh their configuration.
    
    Returns configuration relevant to the specified microservice based on
    environment variables in the backend service.
    """
    settings = get_settings()
    
    # Map service names to their required config keys
    # These values are read from backend environment variables and served to microservices
    service_configs: dict[str, dict[str, Any]] = {
        "invitations-service": {
            "DATABASE_URL": str(settings.database_url),
            "REDIS_URL": str(settings.redis_url),
            "R2_ENDPOINT": settings.r2_endpoint_url if hasattr(settings, "r2_endpoint_url") and settings.r2_endpoint_url else "",
            "R2_ACCESS_KEY_ID": settings.r2_access_key_id if hasattr(settings, "r2_access_key_id") and settings.r2_access_key_id else "",
            "R2_SECRET_ACCESS_KEY": settings.r2_secret_access_key.get_secret_value() if hasattr(settings, "r2_secret_access_key") and settings.r2_secret_access_key else "",
            "R2_BUCKET_NAME": settings.r2_bucket_name if hasattr(settings, "r2_bucket_name") and settings.r2_bucket_name else "invitations",
            "ENCRYPTION_MASTER_KEY": settings.encryption_master_key.get_secret_value() if hasattr(settings, "encryption_master_key") and settings.encryption_master_key else "",
            "SENDGRID_API_KEY": settings.sendgrid_api_key.get_secret_value() if hasattr(settings, "sendgrid_api_key") and settings.sendgrid_api_key else "",
            "JWT_SECRET": settings.jwt_secret.get_secret_value() if hasattr(settings.jwt_secret, "get_secret_value") else str(settings.jwt_secret),
            "BACKEND_SERVICE_URL": settings.api_base_url or f"http://localhost:{settings.api_port}",
            "MAGIC_LINK_SERVICE_URL": (settings.invitations_service_url if settings.invitations_service_url else "http://localhost:8001"),
            "CELERY_BROKER_URL": getattr(settings, "celery_broker_url", "") or str(settings.redis_url).replace("/0", "/1"),
            "CELERY_RESULT_BACKEND": getattr(settings, "celery_result_backend", "") or str(settings.redis_url).replace("/0", "/2"),
        },
        "gallery-service": {
            "DATABASE_URL": str(settings.database_url),
            "REDIS_URL": str(settings.redis_url),
            "R2_ENDPOINT": settings.r2_endpoint_url if hasattr(settings, "r2_endpoint_url") and settings.r2_endpoint_url else "",
            "R2_ACCESS_KEY_ID": settings.r2_access_key_id if hasattr(settings, "r2_access_key_id") and settings.r2_access_key_id else "",
            "R2_SECRET_ACCESS_KEY": settings.r2_secret_access_key.get_secret_value() if hasattr(settings, "r2_secret_access_key") and settings.r2_secret_access_key else "",
        },
        "notifications-service": {
            "DATABASE_URL": str(settings.database_url),
            "REDIS_URL": str(settings.redis_url),
            "SENDGRID_API_KEY": settings.sendgrid_api_key.get_secret_value() if hasattr(settings, "sendgrid_api_key") and settings.sendgrid_api_key else "",
        },
    }
    
    if service_name not in service_configs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Configuration not found for service: {service_name}",
        )
    
    from datetime import datetime, timezone
    config = service_configs[service_name]
    
    return MicroserviceConfigResponse(
        service_name=service_name,
        config=config,
        version="1.0",
        last_updated=datetime.now(timezone.utc).isoformat(),
    )


@router.get(
    "/health",
    summary="Config service health check",
)
async def config_health():
    """Health check for config service."""
    return {"status": "healthy", "service": "config"}
