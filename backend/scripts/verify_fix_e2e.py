import asyncio
import json
import logging
import sys
import os
import aiohttp

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

# Constants
API_BASE_URL = "http://localhost:8000/api/v1"
EMAIL = "business@test.rawdrive.in"
PASSWORD = "Test@123"

async def verify_fix():
    logger.info(f"Starting verification for user: {EMAIL}")
    
    async with aiohttp.ClientSession() as session:
        # 1. Login
        login_url = f"{API_BASE_URL}/auth/login"
        logger.info(f"Logging in at {login_url}...")
        
        try:
            async with session.post(login_url, json={"email": EMAIL, "password": PASSWORD}) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    logger.error(f"Login failed: {resp.status} - {text}")
                    return False
                
                data = await resp.json()
                access_token = data.get("tokens", {}).get("access_token")
                if not access_token:
                    logger.error(f"No access token in response: {data}")
                    return False
                
                logger.info("Login successful. Access token received.")
        except Exception as e:
            logger.error(f"Login request failed: {e}")
            return False

        # 2. Get Workspaces (to find ID)
        workspaces_url = f"{API_BASE_URL}/workspaces"
        headers = {"Authorization": f"Bearer {access_token}"}
        
        try:
            async with session.get(workspaces_url, headers=headers) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    logger.error(f"Failed to list workspaces: {resp.status} - {text}")
                    return False
                
                workspaces = await resp.json()
                if not workspaces:
                    logger.error("No workspaces found")
                    return False
                
                # Use the first workspace
                ws = workspaces[0]
                workspace_id = ws["workspace"]["workspace_id"]
                logger.info(f"Found workspace: {ws['workspace']['name']} ({workspace_id})")
        except Exception as e:
            logger.error(f"Workspace list request failed: {e}")
            return False

        # 3. Check Subscription (The Fix Verification)
        sub_url = f"{API_BASE_URL}/workspaces/{workspace_id}/subscription"
        logger.info(f"Fetching subscription at {sub_url}...")
        
        try:
            async with session.get(sub_url, headers=headers) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    logger.info("✅ SUCCESS: Subscription fetched successfully!")
                    logger.info(f"Plan: {data['plan']['name']}")
                    logger.info(f"Status: {data['status']}")
                    return True
                elif resp.status == 403:
                    logger.error("❌ FAILED: 403 Forbidden - Permission issue still persists.")
                    return False
                else:
                    text = await resp.text()
                    logger.error(f"❌ FAILED: Unexpected status {resp.status} - {text}")
                    return False
        except Exception as e:
            logger.error(f"Subscription request failed: {e}")
            return False

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        
    success = asyncio.run(verify_fix())
    if not success:
        sys.exit(1)
