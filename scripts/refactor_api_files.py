"""
Script to remove duplicate verify_workspace_access functions from API files.
"""

import re
from pathlib import Path

API_DIR = Path("services/client-service/src/api/v1")

FILES_TO_REFACTOR = [
    "activities.py",
    "analytics.py",
    "bulk_ops.py",
    "communications.py",
    "duplicates.py",
    "galleries.py",
    "import_export.py",
    "smart_lists.py",
    "tags.py",
    "visitors.py",
]

# Pattern to match and remove the duplicate function
PATTERN = r"""

# =============================================================================
# Dependency Injection
# =============================================================================


def get_service\(\).*?:
    \"\"\".*?\"\"\"
    return get_\w+_service\(\)


async def verify_workspace_access\(
    workspace_id: UUID = Path\(\.\.\.\),
    current_user: JWTPayload = Depends\(get_current_user\),
\) -> UUID:
    \"\"\"
    Verify user has access to workspace\.

    Args:
        workspace_id: Workspace ID from path
        current_user: JWT payload from auth middleware

    Returns:
        UUID: Validated workspace_id

    Raises:
        HTTPException: 403 if user doesn't have access
    \"\"\"
    if str\(current_user\.workspace_id\) != str\(workspace_id\):
        logger\.warning\(
            "Workspace access denied",
            extra=\{
                "user_id": str\(current_user\.user_id\),
                "requested_workspace": str\(workspace_id\),
                "user_workspace": str\(current_user\.workspace_id\),
            \},
        \)
        raise HTTPException\(
            status_code=status\.HTTP_403_FORBIDDEN,
            detail=ErrorResponse\(
                error="WORKSPACE_ACCESS_DENIED",
                message="You do not have access to this workspace",
            \)\.model_dump\(\),
        \)

    return workspace_id


"""

for filename in FILES_TO_REFACTOR:
    filepath = API_DIR / filename
    if not filepath.exists():
        print(f"Skipping {filename} - not found")
        continue

    print(f"Processing {filename}...")
    content = filepath.read_text()

    # Remove duplicate function block
    new_content = re.sub(PATTERN, "\n\n", content, flags=re.DOTALL)

    # Also update service dependency references
    service_name = filename.replace(".py", "")
    new_content = re.sub(
        r"service: \w+Service = Depends\(get_service\),",
        f"service: {service_name.title().replace('_', '')}Service = Depends(get_{service_name}_service),",
        new_content
    )

    filepath.write_text(new_content)
    print(f"  [OK] Refactored {filename}")

print("\n[OK] All files refactored successfully!")
