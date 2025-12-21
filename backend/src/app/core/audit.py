import logging

logger = logging.getLogger(__name__)

async def audit_log(*, workspace_id=None, user_id=None, action=None, resource_type=None, resource_id=None, details=None):
    logger.info(f"Audit Log: action={action} user={user_id} workspace={workspace_id} resource={resource_type}:{resource_id} details={details}")
