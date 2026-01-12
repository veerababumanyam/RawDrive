"""Test script for central configuration service integration.

This script demonstrates and tests the central config functionality.
Run this after starting both backend and invitations-service.
"""

import asyncio
import httpx
import json
from typing import Dict, Any


async def test_config_endpoint(base_url: str = "http://localhost:8000"):
    """Test the central config endpoint."""
    print(f"\n{'='*60}")
    print("Testing Central Configuration Service")
    print(f"{'='*60}\n")
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        # Test 1: Get config for invitations-service
        print("Test 1: Fetching config for invitations-service...")
        try:
            response = await client.get(
                f"{base_url}/api/v1/config/microservices/invitations-service"
            )
            response.raise_for_status()
            config_data = response.json()
            
            print(f"✓ Success! Received config for: {config_data['service_name']}")
            print(f"  Version: {config_data['version']}")
            print(f"  Last Updated: {config_data['last_updated']}")
            print(f"\n  Config Keys ({len(config_data['config'])}):")
            for key in sorted(config_data['config'].keys()):
                value = config_data['config'][key]
                # Mask sensitive values
                if any(sensitive in key.upper() for sensitive in ['SECRET', 'KEY', 'PASSWORD']):
                    display_value = "***" if value else "(not set)"
                else:
                    display_value = str(value)[:50] + "..." if len(str(value)) > 50 else str(value)
                print(f"    - {key}: {display_value}")
                
        except httpx.HTTPStatusError as e:
            print(f"✗ HTTP Error: {e.response.status_code}")
            print(f"  Response: {e.response.text}")
            return False
        except Exception as e:
            print(f"✗ Error: {e}")
            return False
        
        # Test 2: Test health endpoint
        print("\nTest 2: Testing config service health endpoint...")
        try:
            response = await client.get(f"{base_url}/api/v1/config/health")
            response.raise_for_status()
            health_data = response.json()
            print(f"✓ Health check passed: {health_data}")
        except Exception as e:
            print(f"✗ Health check failed: {e}")
            return False
        
        # Test 3: Test invalid service name
        print("\nTest 3: Testing invalid service name (should return 404)...")
        try:
            response = await client.get(
                f"{base_url}/api/v1/config/microservices/non-existent-service"
            )
            if response.status_code == 404:
                print("✓ Correctly returned 404 for invalid service")
            else:
                print(f"✗ Expected 404, got {response.status_code}")
                return False
        except Exception as e:
            print(f"✗ Error: {e}")
            return False
        
        print(f"\n{'='*60}")
        print("All tests passed! ✓")
        print(f"{'='*60}\n")
        return True


async def test_invitations_service_config_client(
    invitations_url: str = "http://localhost:8007",
    backend_url: str = "http://localhost:8000"
):
    """Test that invitations-service can fetch config from central service."""
    print(f"\n{'='*60}")
    print("Testing Invitations Service Config Client")
    print(f"{'='*60}\n")
    
    # Note: This test requires the invitations-service to be running
    # and CENTRAL_CONFIG_ENABLED=true
    print("Note: This test requires:")
    print("  1. Invitations service running")
    print("  2. CENTRAL_CONFIG_ENABLED=true")
    print("  3. BACKEND_SERVICE_URL configured")
    print("\nCheck service logs for config refresh messages.\n")


async def main():
    """Run all tests."""
    import sys
    
    backend_url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
    
    print("\n" + "="*60)
    print("Central Configuration Service Test Suite")
    print("="*60)
    print(f"\nBackend URL: {backend_url}")
    print("Invitations Service URL: http://localhost:8007 (if running)")
    
    # Test backend config endpoint
    success = await test_config_endpoint(backend_url)
    
    if success:
        # Test invitations service integration (if available)
        await test_invitations_service_config_client()
        print("\n✓ All backend tests passed!")
        print("\nNext steps:")
        print("  1. Start invitations-service with CENTRAL_CONFIG_ENABLED=true")
        print("  2. Check logs for: 'Settings reloaded from central config'")
        print("  3. Update backend environment variables")
        print("  4. Wait 60 seconds (or CENTRAL_CONFIG_REFRESH_INTERVAL)")
        print("  5. Verify invitations-service picked up changes in logs")
    else:
        print("\n✗ Some tests failed. Check backend is running and config endpoint is accessible.")
        return 1
    
    return 0


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    exit(exit_code)
