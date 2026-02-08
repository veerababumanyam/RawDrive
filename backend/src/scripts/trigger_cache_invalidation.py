
import asyncio
import logging
import os
import sys
import httpx

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_URL = "http://localhost:8000"
TEST_WORKSPACE_ID = "11111111-1111-1111-1111-000000000001"
ADMIN_EMAIL = "superadmin@test.rawdrive.ai"
ADMIN_PASSWORD = "Test@123"

async def invalidate_cache():
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10.0) as client:
        # 1. Login
        logger.info(f"Logging in as {ADMIN_EMAIL}...")
        try:
            resp = await client.post("/api/v1/auth/login", json={
                "email": ADMIN_EMAIL,
                "password": ADMIN_PASSWORD,
            })
            resp.raise_for_status()
            data = resp.json()
            token = data["tokens"]["access_token"]
            logger.info("Login successful.")
        except httpx.HTTPError as e:
            logger.error(f"Login failed: {e}")
            if e.response:
                logger.error(f"Response: {e.response.text}")
            return

        headers = {"Authorization": f"Bearer {token}"}

        # 2. Withdraw Consent
        # This forces a cache invalidation because it checks DB directly
        logger.info("Withdrawing consent to clear cache...")
        try:
            resp = await client.post(
                f"/api/v1/workspaces/{TEST_WORKSPACE_ID}/biometric/consent/withdraw",
                headers=headers,
                json={"reason": "Cache Invalidation Script"}
            )
            if resp.status_code == 400 and "No active consent" in resp.text:
                logger.info("Consent was already not granted (or cache was weird). Proceeding to grant.")
            else:
                resp.raise_for_status()
                logger.info("Consent withdrawn.")
        except httpx.HTTPError as e:
             logger.warning(f"Withdraw failed (might be already withdrawn): {e}")

        # 3. Grant Consent
        # This re-enables it and populates cache
        logger.info("Granting consent...")
        try:
            resp = await client.post(
                f"/api/v1/workspaces/{TEST_WORKSPACE_ID}/biometric/consent/grant",
                headers=headers,
                json={"policy_version": "1.0"}
            )
            resp.raise_for_status()
            logger.info("Consent granted successfully.")
        except httpx.HTTPError as e:
            logger.error(f"Grant failed: {e}")
            if e.response:
                logger.error(f"Response: {e.response.text}")
            return
            
        logger.info("Backend cache should now be invalidated and re-populated.")

if __name__ == "__main__":
    asyncio.run(invalidate_cache())
