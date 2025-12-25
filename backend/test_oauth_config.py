#!/usr/bin/env python3
"""
Test script to verify Google OAuth configuration.

This script verifies:
1. All required OAuth environment variables are set
2. The OAuth endpoints are reachable
3. The client ID format is valid

Run: python test_oauth_config.py
"""

import asyncio
import httpx
import sys
from pathlib import Path

# Add src to Python path
sys.path.insert(0, str(Path(__file__).parent / "src"))

# Check if we can import settings
try:
    from app.config.settings import get_settings, Environment
except ImportError as e:
    print(f"❌ Failed to import settings: {e}")
    print("   Make sure you're in the backend directory and have installed dependencies.")
    sys.exit(1)


def check_env_vars():
    """Check if all required environment variables are configured."""
    print("\n📋 Checking OAuth Environment Variables...")
    print("-" * 50)
    
    try:
        settings = get_settings()
    except Exception as e:
        print(f"❌ Failed to load settings: {e}")
        return False
    
    issues = []
    
    # Check Google Client ID
    client_id = settings.google_client_id
    if client_id == "dev-client-id":
        issues.append("GOOGLE_CLIENT_ID is set to default 'dev-client-id'")
        print(f"⚠️  GOOGLE_CLIENT_ID: {client_id} (default value)")
    elif not client_id.endswith(".apps.googleusercontent.com"):
        issues.append("GOOGLE_CLIENT_ID format looks invalid (should end with .apps.googleusercontent.com)")
        print(f"⚠️  GOOGLE_CLIENT_ID: {client_id[:20]}... (format may be invalid)")
    else:
        print(f"✅ GOOGLE_CLIENT_ID: {client_id[:25]}...{client_id[-25:]}")
    
    # Check Google Client Secret
    client_secret = settings.google_client_secret.get_secret_value()
    if client_secret == "dev-client-secret":
        issues.append("GOOGLE_CLIENT_SECRET is set to default 'dev-client-secret'")
        print(f"⚠️  GOOGLE_CLIENT_SECRET: (default value)")
    else:
        print(f"✅ GOOGLE_CLIENT_SECRET: ****{client_secret[-4:]}")
    
    # Check Redirect URI
    redirect_uri = str(settings.google_redirect_uri)
    print(f"✅ GOOGLE_REDIRECT_URI: {redirect_uri}")
    
    # Check environment
    env = settings.app_env
    print(f"✅ APP_ENV: {env.value}")
    
    if env == Environment.PRODUCTION and issues:
        print("\n❌ PRODUCTION MODE: Cannot use default OAuth credentials!")
        return False
    
    if issues:
        print("\n⚠️  Warnings:")
        for issue in issues:
            print(f"   - {issue}")
        return False
    
    return True


async def check_google_endpoints():
    """Verify Google OAuth endpoints are reachable."""
    print("\n🌐 Testing Google OAuth Endpoints...")
    print("-" * 50)
    
    endpoints = {
        "Authorization": "https://accounts.google.com/o/oauth2/v2/auth",
        "Token": "https://oauth2.googleapis.com/token",
        "UserInfo": "https://www.googleapis.com/oauth2/v3/userinfo",
    }
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        for name, url in endpoints.items():
            try:
                # Just check if endpoint is reachable (will get error response, but that's OK)
                response = await client.get(url)
                # For auth and token endpoints, 4xx is expected without proper params
                if response.status_code < 500:
                    print(f"✅ {name} endpoint: {url} (reachable)")
                else:
                    print(f"❌ {name} endpoint: {url} (error: {response.status_code})")
                    return False
            except httpx.RequestError as e:
                print(f"❌ {name} endpoint: {url} (network error: {e})")
                return False
    
    return True


async def check_redis_connection():
    """Check if Redis is available for state storage."""
    print("\n🔴 Testing Redis Connection (for OAuth state storage)...")
    print("-" * 50)
    
    try:
        from app.db.redis import get_redis_client
        redis = await get_redis_client()
        
        # Test set/get
        test_key = "oauth:test:connection"
        await redis.setex(test_key, 10, "test")
        value = await redis.get(test_key)
        await redis.delete(test_key)
        
        if value == "test":
            print("✅ Redis connection: OK")
            return True
        else:
            print("❌ Redis connection: Failed to read test value")
            return False
            
    except Exception as e:
        print(f"❌ Redis connection: {e}")
        return False


def print_oauth_urls():
    """Print the OAuth URLs that need to be configured in Google Console."""
    print("\n🔧 Required Google Cloud Console Configuration")
    print("-" * 50)
    
    try:
        settings = get_settings()
    except Exception:
        print("❌ Cannot load settings")
        return
    
    redirect_uri = str(settings.google_redirect_uri)
    
    # Parse origin from redirect URI
    from urllib.parse import urlparse
    parsed = urlparse(redirect_uri)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    
    print("\n📍 Authorized JavaScript Origins:")
    print(f"   • {origin}")
    print("   • http://localhost:5173  (for development)")
    print("   • http://localhost:3000  (for development)")
    
    print("\n📍 Authorized Redirect URIs:")
    print(f"   • {redirect_uri}")
    
    # Check the frontend redirect pattern
    print("\n⚠️  Important: Your frontend redirects to /workspace after login.")
    print("   The backend callback endpoint is:")
    print(f"   • {redirect_uri}")
    print("\n   Make sure this exact URI is added to Google Cloud Console!")


async def main():
    print("=" * 60)
    print("🔐 Google OAuth Configuration Test")
    print("=" * 60)
    
    env_ok = check_env_vars()
    endpoints_ok = await check_google_endpoints()
    redis_ok = await check_redis_connection()
    
    print_oauth_urls()
    
    print("\n" + "=" * 60)
    print("📊 Summary")
    print("=" * 60)
    
    if env_ok and endpoints_ok and redis_ok:
        print("✅ All checks passed! OAuth should be ready to use.")
        return 0
    else:
        print("⚠️  Some checks failed. Please review the issues above.")
        if not env_ok:
            print("   → Update your .env file with valid Google OAuth credentials")
        if not redis_ok:
            print("   → Make sure Redis is running and accessible")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
