
import asyncio
import logging
import os
import sys
from dotenv import load_dotenv

backend_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
project_root = os.path.dirname(backend_root)
load_dotenv(os.path.join(backend_root, '.env'))
load_dotenv(os.path.join(project_root, '.env'))
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.postgres import get_postgres_pool, close_postgres_pool, init_postgres_pool
from app.config.settings import get_settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TEST_WORKSPACE_ID = "11111111-1111-1111-1111-000000000001"

async def enable_consent_and_retry():
    settings = get_settings()
    await init_postgres_pool(settings)
    pool = await get_postgres_pool()
    
    async with pool.acquire() as conn:
        # Get a user (admin usually first)
        user_id = await conn.fetchval("SELECT user_id FROM users LIMIT 1")
        if not user_id:
            logger.error("No users found to grant consent with.")
            return

        logger.info(f"Granting consent for workspace {TEST_WORKSPACE_ID} via user {user_id}")
        
        # Upsert consent
        await conn.execute(
            """
            INSERT INTO workspace_biometric_settings (
                workspace_id,
                face_detection_enabled,
                consent_status,
                consented_by,
                consented_at,
                consent_ip_address,
                consent_user_agent,
                consent_policy_version
            )
            VALUES ($1, TRUE, 'granted', $2, NOW(), '127.0.0.1', 'Remediation Script', '1.0')
            ON CONFLICT (workspace_id) DO UPDATE SET
                face_detection_enabled = TRUE,
                consent_status = 'granted',
                consented_by = $2,
                consented_at = NOW(),
                consent_ip_address = '127.0.0.1',
                consent_user_agent = 'Remediation Script',
                consent_policy_version = '1.0',
                withdrawn_by = NULL,
                withdrawn_at = NULL
            """,
            TEST_WORKSPACE_ID,
            user_id
        )
        logger.info("Consent granted.")
        
        # Reset failed jobs
        result = await conn.execute(
            """
            UPDATE face_detection_jobs
            SET status = 'pending', retry_count = 0, error_message = NULL
            WHERE status = 'failed'
            """
        )
        logger.info(f"Reset jobs: {result}")
    
    await close_postgres_pool()

if __name__ == "__main__":
    asyncio.run(enable_consent_and_retry())
