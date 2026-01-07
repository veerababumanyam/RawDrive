import asyncio
import os
import sys
import uuid
from uuid import UUID

# Setup path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from app.services.subscription_service import SubscriptionService
from app.db.postgres import close_postgres_pool, init_postgres_pool

async def main():
    print("Starting debug script...")
    await init_postgres_pool()
    workspace_id = UUID("11111111-1111-1111-1111-000000000003")
    
    try:
        service = SubscriptionService()
        print(f"Fetching subscription for {workspace_id}")
        status = await service.get_subscription_status(workspace_id)
        print("Success!")
        print(status)
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await close_postgres_pool()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
