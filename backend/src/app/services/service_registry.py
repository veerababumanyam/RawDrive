"""Service Registry for A2A (Agent-to-Agent) Communication.

Manages service discovery, registration, and health monitoring using Redis.
Enables microservices to find and communicate with each other by capability.

Phase 4: Google A2A ADKS Integration
"""

import json
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
from uuid import uuid4

import redis.asyncio as aioredis
from pydantic import BaseModel, Field

from app.core.config import settings


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class ServiceCapability(BaseModel):
    """Service capability definition."""

    name: str = Field(..., description="Capability name (e.g., 'gallery:read', 'photo:search')")
    version: str = Field(default="v1", description="Capability version")
    endpoint: Optional[str] = Field(None, description="Endpoint path if applicable")


class ServiceRegistration(BaseModel):
    """Service registration information."""

    service_name: str = Field(..., description="Unique service identifier")
    service_id: str = Field(default_factory=lambda: str(uuid4()), description="Instance ID")
    capabilities: List[ServiceCapability] = Field(default_factory=list)
    health_endpoint: str = Field(..., description="Health check endpoint URL")
    base_url: str = Field(..., description="Service base URL")
    version: str = Field(default="v1", description="Service version")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")
    registered_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ServiceInfo(BaseModel):
    """Service information from registry."""

    service_name: str
    service_id: str
    capabilities: List[ServiceCapability]
    health_endpoint: str
    base_url: str
    version: str
    metadata: Dict[str, Any]
    registered_at: datetime
    last_heartbeat: datetime
    is_healthy: bool = True


# ---------------------------------------------------------------------------
# Service Registry
# ---------------------------------------------------------------------------


class ServiceRegistry:
    """Redis-based service registry for A2A communication."""

    def __init__(self, redis_url: Optional[str] = None, ttl_seconds: int = 30):
        """Initialize service registry.

        Args:
            redis_url: Redis connection URL (default from settings)
            ttl_seconds: Service registration TTL in seconds (default 30)
        """
        self.redis_url = redis_url or settings.REDIS_URL
        self.ttl_seconds = ttl_seconds
        self._redis: Optional[aioredis.Redis] = None

    async def connect(self):
        """Connect to Redis."""
        if self._redis is None:
            self._redis = await aioredis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=True,
            )
            logger.info("Service registry connected to Redis")

    async def disconnect(self):
        """Disconnect from Redis."""
        if self._redis:
            await self._redis.close()
            self._redis = None
            logger.info("Service registry disconnected from Redis")

    def _service_key(self, service_name: str, service_id: str) -> str:
        """Generate Redis key for service registration."""
        return f"service:{service_name}:{service_id}"

    def _capability_key(self, capability: str) -> str:
        """Generate Redis key for capability index."""
        return f"capability:{capability}"

    async def register(
        self,
        registration: ServiceRegistration,
        auto_renew: bool = False,
    ) -> str:
        """Register a service in the registry.

        Args:
            registration: Service registration information
            auto_renew: If True, automatically renew registration on heartbeat

        Returns:
            Service ID

        Example:
            ```python
            registry = ServiceRegistry()
            await registry.connect()

            registration = ServiceRegistration(
                service_name="gallery-service",
                capabilities=[
                    ServiceCapability(name="gallery:read", endpoint="/galleries"),
                    ServiceCapability(name="photo:search", endpoint="/photos/search"),
                ],
                health_endpoint="http://gallery-service:8004/health",
                base_url="http://gallery-service:8004",
                version="v1",
            )

            service_id = await registry.register(registration)
            ```
        """
        await self.connect()

        service_key = self._service_key(registration.service_name, registration.service_id)

        # Store service registration
        service_data = registration.model_dump(mode="json")
        service_data["last_heartbeat"] = datetime.now(timezone.utc).isoformat()
        service_data["is_healthy"] = True
        service_data["auto_renew"] = auto_renew

        await self._redis.setex(
            service_key,
            self.ttl_seconds,
            json.dumps(service_data),
        )

        # Index by capabilities
        for capability in registration.capabilities:
            capability_key = self._capability_key(capability.name)
            await self._redis.sadd(capability_key, service_key)
            await self._redis.expire(capability_key, self.ttl_seconds * 2)  # Longer TTL for index

        logger.info(
            f"Registered service: {registration.service_name} "
            f"(ID: {registration.service_id}, capabilities: {len(registration.capabilities)})"
        )

        return registration.service_id

    async def heartbeat(self, service_name: str, service_id: str) -> bool:
        """Send heartbeat to renew service registration.

        Args:
            service_name: Service name
            service_id: Service instance ID

        Returns:
            True if heartbeat successful, False otherwise
        """
        await self.connect()

        service_key = self._service_key(service_name, service_id)

        # Check if service exists
        exists = await self._redis.exists(service_key)
        if not exists:
            logger.warning(
                f"Heartbeat failed: service {service_name} (ID: {service_id}) not found"
            )
            return False

        # Get current data
        data = await self._redis.get(service_key)
        if not data:
            return False

        service_data = json.loads(data)

        # Update last heartbeat
        service_data["last_heartbeat"] = datetime.now(timezone.utc).isoformat()
        service_data["is_healthy"] = True

        # Renew TTL
        await self._redis.setex(
            service_key,
            self.ttl_seconds,
            json.dumps(service_data),
        )

        logger.debug(f"Heartbeat: {service_name} (ID: {service_id})")

        return True

    async def unregister(self, service_name: str, service_id: str):
        """Unregister a service from the registry.

        Args:
            service_name: Service name
            service_id: Service instance ID
        """
        await self.connect()

        service_key = self._service_key(service_name, service_id)

        # Get service data to remove from capability indexes
        data = await self._redis.get(service_key)
        if data:
            service_data = json.loads(data)
            for capability in service_data.get("capabilities", []):
                capability_key = self._capability_key(capability["name"])
                await self._redis.srem(capability_key, service_key)

        # Remove service
        await self._redis.delete(service_key)

        logger.info(f"Unregistered service: {service_name} (ID: {service_id})")

    async def discover(self, capability: str) -> List[ServiceInfo]:
        """Discover services by capability.

        Args:
            capability: Capability name (e.g., 'gallery:read')

        Returns:
            List of services offering the capability

        Example:
            ```python
            # Find all services that can read galleries
            services = await registry.discover("gallery:read")

            for service in services:
                print(f"{service.service_name} at {service.base_url}")
            ```
        """
        await self.connect()

        capability_key = self._capability_key(capability)

        # Get all services with this capability
        service_keys = await self._redis.smembers(capability_key)

        services = []
        for service_key in service_keys:
            data = await self._redis.get(service_key)
            if data:
                try:
                    service_data = json.loads(data)

                    # Convert to ServiceInfo
                    service_info = ServiceInfo(
                        service_name=service_data["service_name"],
                        service_id=service_data["service_id"],
                        capabilities=[
                            ServiceCapability(**cap) for cap in service_data["capabilities"]
                        ],
                        health_endpoint=service_data["health_endpoint"],
                        base_url=service_data["base_url"],
                        version=service_data["version"],
                        metadata=service_data.get("metadata", {}),
                        registered_at=datetime.fromisoformat(service_data["registered_at"]),
                        last_heartbeat=datetime.fromisoformat(service_data["last_heartbeat"]),
                        is_healthy=service_data.get("is_healthy", True),
                    )

                    services.append(service_info)
                except Exception as e:
                    logger.error(f"Failed to parse service data for {service_key}: {e}")
            else:
                # Service key exists in index but service is gone (cleanup needed)
                await self._redis.srem(capability_key, service_key)

        logger.debug(f"Discovered {len(services)} services for capability '{capability}'")

        return services

    async def get_service(self, service_name: str, service_id: str) -> Optional[ServiceInfo]:
        """Get service information by name and ID.

        Args:
            service_name: Service name
            service_id: Service instance ID

        Returns:
            Service information or None if not found
        """
        await self.connect()

        service_key = self._service_key(service_name, service_id)
        data = await self._redis.get(service_key)

        if not data:
            return None

        try:
            service_data = json.loads(data)

            return ServiceInfo(
                service_name=service_data["service_name"],
                service_id=service_data["service_id"],
                capabilities=[
                    ServiceCapability(**cap) for cap in service_data["capabilities"]
                ],
                health_endpoint=service_data["health_endpoint"],
                base_url=service_data["base_url"],
                version=service_data["version"],
                metadata=service_data.get("metadata", {}),
                registered_at=datetime.fromisoformat(service_data["registered_at"]),
                last_heartbeat=datetime.fromisoformat(service_data["last_heartbeat"]),
                is_healthy=service_data.get("is_healthy", True),
            )
        except Exception as e:
            logger.error(f"Failed to parse service data for {service_key}: {e}")
            return None

    async def list_all_services(self) -> List[ServiceInfo]:
        """List all registered services.

        Returns:
            List of all services in the registry
        """
        await self.connect()

        # Scan for all service keys
        services = []
        async for key in self._redis.scan_iter(match="service:*"):
            # Skip capability index keys
            if key.startswith("capability:"):
                continue

            data = await self._redis.get(key)
            if data:
                try:
                    service_data = json.loads(data)

                    service_info = ServiceInfo(
                        service_name=service_data["service_name"],
                        service_id=service_data["service_id"],
                        capabilities=[
                            ServiceCapability(**cap) for cap in service_data["capabilities"]
                        ],
                        health_endpoint=service_data["health_endpoint"],
                        base_url=service_data["base_url"],
                        version=service_data["version"],
                        metadata=service_data.get("metadata", {}),
                        registered_at=datetime.fromisoformat(service_data["registered_at"]),
                        last_heartbeat=datetime.fromisoformat(service_data["last_heartbeat"]),
                        is_healthy=service_data.get("is_healthy", True),
                    )

                    services.append(service_info)
                except Exception as e:
                    logger.error(f"Failed to parse service data for {key}: {e}")

        logger.debug(f"Listed {len(services)} total services")

        return services

    async def mark_unhealthy(self, service_name: str, service_id: str):
        """Mark a service as unhealthy.

        Args:
            service_name: Service name
            service_id: Service instance ID
        """
        await self.connect()

        service_key = self._service_key(service_name, service_id)
        data = await self._redis.get(service_key)

        if data:
            service_data = json.loads(data)
            service_data["is_healthy"] = False

            # Don't reset TTL - let unhealthy services expire naturally
            await self._redis.set(service_key, json.dumps(service_data))

            logger.warning(f"Marked service as unhealthy: {service_name} (ID: {service_id})")


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------


_service_registry: Optional[ServiceRegistry] = None


def get_service_registry() -> ServiceRegistry:
    """Get the global service registry instance."""
    global _service_registry
    if _service_registry is None:
        _service_registry = ServiceRegistry()
    return _service_registry
