"""
Verify A2A Service Registration

Tests that all microservices can register in the A2A Service Registry
and that service discovery works correctly.
"""

import asyncio
import sys
import os
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent.parent / "backend" / "src"
sys.path.insert(0, str(backend_path))

import redis.asyncio as redis
from uuid import uuid4


async def verify_service_registry():
    """Verify service registry functionality."""
    print("=" * 80)
    print("A2A Service Registration Verification")
    print("=" * 80)
    print()

    # Connect to Redis
    print("1. Connecting to Redis...")
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    redis_client = redis.from_url(redis_url, decode_responses=True)

    try:
        await redis_client.ping()
        print("   [OK] Redis connection successful")
    except Exception as e:
        print(f"   [FAIL] Redis connection failed: {e}")
        return False

    print()

    # Import service registry after Redis is available
    from app.services.service_registry import (
        get_service_registry,
        ServiceRegistration,
        ServiceCapability,
    )

    registry = get_service_registry()

    # Test service registration
    print("2. Testing service registration...")
    test_service_id = str(uuid4())

    try:
        registration = ServiceRegistration(
            service_name="test-service",
            service_id=test_service_id,
            base_url="http://test-service:9999",
            capabilities=[
                ServiceCapability(name="test:read", version="1.0", endpoint="/api/v1/test"),
                ServiceCapability(name="test:write", version="1.0", endpoint="/api/v1/test"),
            ],
            health_check_endpoint="/health",
        )

        await registry.register(registration)
        print(f"   [OK] Service registered: test-service ({test_service_id})")
    except Exception as e:
        print(f"   [FAIL] Registration failed: {e}")
        return False

    print()

    # Test service discovery
    print("3. Testing service discovery...")

    try:
        # Discover by capability
        services = await registry.discover("test:read")
        if services and len(services) > 0:
            print(f"   [OK] Discovered {len(services)} service(s) with 'test:read' capability")
            for svc in services:
                print(f"      - {svc.service_name} at {svc.base_url}")
        else:
            print("   [FAIL] No services discovered")
            return False
    except Exception as e:
        print(f"   [FAIL] Discovery failed: {e}")
        return False

    print()

    # Test heartbeat
    print("4. Testing heartbeat...")

    try:
        await registry.heartbeat("test-service", test_service_id)
        print("   [OK] Heartbeat successful")
    except Exception as e:
        print(f"   [FAIL] Heartbeat failed: {e}")
        return False

    print()

    # Check registered services in Redis
    print("5. Checking registered services in Redis...")

    try:
        # List all service keys
        service_keys = await redis_client.keys("service:*")
        print(f"   [OK] Found {len(service_keys)} registered service(s)")

        for key in service_keys[:10]:  # Show first 10
            service_data = await redis_client.get(key)
            if service_data:
                import json
                data = json.loads(service_data)
                print(f"      - {key}: {data.get('service_name', 'Unknown')}")

        if len(service_keys) > 10:
            print(f"      ... and {len(service_keys) - 10} more")
    except Exception as e:
        print(f"   [FAIL] Redis check failed: {e}")
        return False

    print()

    # Check capability indexes
    print("6. Checking capability indexes...")

    try:
        capability_keys = await redis_client.keys("capability:*")
        print(f"   [OK] Found {len(capability_keys)} capability index(es)")

        for key in capability_keys[:10]:  # Show first 10
            count = await redis_client.scard(key)
            capability_name = key.replace("capability:", "")
            print(f"      - {capability_name}: {count} service(s)")

        if len(capability_keys) > 10:
            print(f"      ... and {len(capability_keys) - 10} more")
    except Exception as e:
        print(f"   [FAIL] Capability index check failed: {e}")
        return False

    print()

    # Cleanup test service
    print("7. Cleaning up test service...")

    try:
        await registry.unregister("test-service", test_service_id)
        print("   [OK] Test service unregistered")
    except Exception as e:
        print(f"   [WARN] Cleanup failed: {e}")

    print()

    # Close Redis connection
    await redis_client.close()

    print("=" * 80)
    print("[SUCCESS] ALL VERIFICATION CHECKS PASSED")
    print("=" * 80)
    print()
    print("Next steps:")
    print("  1. Start all microservices to register them")
    print("  2. Use `docker exec -it rawdrive-redis redis-cli` to inspect")
    print("  3. Check service keys: KEYS 'service:*'")
    print("  4. Check capabilities: SMEMBERS 'capability:gallery:read'")
    print()

    return True


async def list_expected_services():
    """List all services that should be registered."""
    print("Expected Services (when running):")
    print("=" * 80)

    services = [
        ("Backend", "http://backend:8000", 6, ["auth:login", "users:manage", "workspaces:manage"]),
        ("Gallery Service", "http://gallery-service:8004", 5, ["gallery:read", "gallery:write", "photo:search"]),
        ("Upload Service", "http://upload-service:8008", 4, ["upload:create", "upload:resume", "upload:complete"]),
        ("Billing Service", "http://billing-service:8005", 5, ["subscription:read", "subscription:write", "payment:process"]),
        ("Onboarding Service", "http://onboarding-service:8006", 3, ["onboarding:register", "onboarding:verify", "onboarding:complete"]),
        ("Invitations Service", "http://invitations-api:8007", 3, ["invitations:create", "invitations:rsvp", "invitations:bulk"]),
        ("AI Service", "http://ai-service:8001", 4, ["ai:analyze", "ai:duplicate", "ai:curate"]),
    ]

    for idx, (name, url, cap_count, sample_caps) in enumerate(services, 1):
        print(f"{idx}. {name}")
        print(f"   URL: {url}")
        print(f"   Capabilities: {cap_count}")
        print(f"   Sample: {', '.join(sample_caps)}")
        print()

    print(f"Total: {len(services)} services, 30 capabilities")
    print("=" * 80)
    print()


if __name__ == "__main__":
    print()
    asyncio.run(list_expected_services())

    try:
        success = asyncio.run(verify_service_registry())
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n[WARN] Verification interrupted")
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] Verification failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
