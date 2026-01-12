
import asyncio
import os
import sys
from pathlib import Path
import json

# Add src to python path
current_dir = Path(__file__).parent
src_dir = current_dir / "src"
sys.path.append(str(src_dir))

def load_env_file(env_path):
    print(f"Loading .env from {env_path}")
    if not env_path.exists():
        print(f"WARNING: .env file not found at {env_path}")
        return

    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            
            if "=" in line:
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip()
                # Remove quotes if present
                if value.startswith('"') and value.endswith('"'):
                    value = value[1:-1]
                elif value.startswith("'") and value.endswith("'"):
                    value = value[1:-1]
                
                os.environ[key] = value

async def check_config():
    try:
        from app.services.face_configuration_service import FaceConfigurationService
        from app.services.ai.providers.cloud_vision_provider import CloudVisionProvider
        from app.services.face_exceptions import ProviderNotConfiguredError
    except ImportError as e:
        print(f"Failed to import app modules: {e}")
        return

    print("\n--- Checking Face Configuration ---\n")
    
    config_service = FaceConfigurationService()
    
    # 1. Check Cloud Vision
    print("Checking 'cloud_vision' configuration...")
    try:
        creds = await config_service.get_provider_credentials("cloud_vision")
        print("  [OK] Cloud Vision credentials found.")
        print(f"  Project ID: {creds.get('project_id')}")
        print(f"  Client Email: {creds.get('client_email')}")
    except ProviderNotConfiguredError:
        print("  [FAIL] Cloud Vision Provider Not Configured.")
    except Exception as e:
        print(f"  [ERROR] Checking Cloud Vision: {e}")

    # 2. Check Environment Variables Specifics
    print("\nChecking Environment Variables:")
    vision_creds_path = os.environ.get("GOOGLE_CLOUD_VISION_CREDENTIALS")
    app_creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    
    print(f"  GOOGLE_CLOUD_VISION_CREDENTIALS: {vision_creds_path}")
    if vision_creds_path:
        path = Path(vision_creds_path)
        if path.exists():
            print(f"    -> File exists: {path}")
            # Try to read it to ensure it is valid JSON
            try:
                with open(path, 'r') as f:
                    data = json.load(f)
                    print(f"    -> Valid JSON. Project ID: {data.get('project_id')}")
            except Exception as e:
                print(f"    -> INVALID JSON: {e}")
        else:
            print(f"    -> FILE MISSING: {path}")
            # Check relative to backend root just in case
            rel_path = current_dir / vision_creds_path
            if rel_path.exists():
                 print(f"    -> NOTE: Found at relative path: {rel_path}")

    print(f"  GOOGLE_APPLICATION_CREDENTIALS: {app_creds_path}")
    if app_creds_path:
        path = Path(app_creds_path)
        if path.exists():
            print(f"    -> File exists: {path}")
        else:
            print(f"    -> FILE MISSING: {path}")

    # 3. Check Gemini
    print("\nChecking 'gemini' configuration...")
    try:
        creds = await config_service.get_provider_credentials("gemini")
        print("  [OK] Gemini credentials found.")
        print(f"  API Key: {creds.get('api_key')[:5]}...{creds.get('api_key')[-5:] if creds.get('api_key') else ''}")
    except Exception as e:
        print(f"  [FAIL] Gemini Check: {e}")

if __name__ == "__main__":
    # Load .env from parent of backend (project root)
    env_path = current_dir.parent / ".env"
    load_env_file(env_path)
    
    try:
        asyncio.run(check_config())
    except Exception:
        import traceback
        traceback.print_exc()
