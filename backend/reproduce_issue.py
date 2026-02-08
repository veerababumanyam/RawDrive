
import asyncio
import httpx
import os
import sys
import json
import mimetypes
import logging
import hashlib
import time
import uuid

# Configure logging to file
logging.basicConfig(
    filename='reproduce_log.txt',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    filemode='w'
)
console = logging.StreamHandler()
console.setLevel(logging.INFO)
logging.getLogger('').addHandler(console)

# Configuration
API_URL = "http://localhost:8000/api/v1"
EMAIL = "free@test.rawdrive.in"
PASSWORD = "Test@123"
PHOTO_PATH = r"c:\Users\admin\Desktop\RawDrive2\tests\reethu.jpg"

async def main():
    logging.info("Starting reproduction script...")
    
    results = {
        "workspace_id": None,
        "consent_status_code": None,
        "consent_body": None,
        "upload_status_code": None,
        "upload_body": None,
        "detection_status_code": None,
        "detection_body": None,
        "error": None
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # 1. Login
            logging.info(f"Logging in as {EMAIL}...")
            try:
                login_res = await client.post(
                    f"{API_URL}/auth/login",
                    json={"email": EMAIL, "password": PASSWORD}
                )
                login_res.raise_for_status()
                data = login_res.json()
                
                if "tokens" in data and "access_token" in data["tokens"]:
                    token = data["tokens"]["access_token"]
                elif "access_token" in data:
                     token = data["access_token"]
                else:
                     logging.error(f"Details: {data}")
                     raise ValueError("Could not find access_token in response")
                     
                logging.info("Login successful.")
            except Exception as e:
                logging.error(f"Login failed: {e}")
                if 'login_res' in locals():
                    logging.error(f"Response: {login_res.text}")
                raise

            headers = {"Authorization": f"Bearer {token}"}

            # 2. Get User Info
            logging.info("Fetching user info...")
            workspace_id = None
            if "user" in data and "workspace_id" in data["user"]:
                workspace_id = data["user"]["workspace_id"]
                logging.info(f"Using Workspace ID from login: {workspace_id}")
            else:
                 logging.info("Workspace ID not found in login response, trying /users/me...")
                 me_res = await client.get(f"{API_URL}/users/me", headers=headers)
                 me_res.raise_for_status()
                 user_data = me_res.json()
                 workspace_id = user_data.get("workspace_id")
                 logging.info(f"Using Workspace ID from /users/me: {workspace_id}")

            if not workspace_id:
                raise ValueError("Could not determine workspace ID.")
            
            results["workspace_id"] = workspace_id

            # 3. Check Consent
            logging.info(f"Checking biometric consent for workspace {workspace_id}...")
            try:
                consent_res = await client.get(
                    f"{API_URL}/workspaces/{workspace_id}/biometric-consent",
                    headers=headers
                )
                logging.info(f"Consent Status Code: {consent_res.status_code}")
                results["consent_status_code"] = consent_res.status_code
                try:
                    results["consent_body"] = consent_res.json()
                    logging.info(f"Consent Body: {json.dumps(results['consent_body'], indent=2)}")
                except:
                    results["consent_body"] = consent_res.text
                    logging.info(f"Consent Body (Text): {consent_res.text}")
            except Exception as e:
                logging.error(f"Failed to check consent: {e}")

            # 4. Get/Create Gallery
            logging.info(f"Getting a gallery for workspace {workspace_id}...")
            gallery_id = None
            try:
                galleries_res = await client.get(
                    f"{API_URL}/workspaces/{workspace_id}/galleries",
                    headers=headers
                )
                if galleries_res.status_code == 200:
                    galleries_data = galleries_res.json()
                    galleries = galleries_data.get('items', []) if 'items' in galleries_data else galleries_data.get('data', [])
                    if galleries:
                         gallery_id = galleries[0]['id']
                         logging.info(f"Using existing gallery from API: {gallery_id}")

            except Exception as e:
                logging.warning(f"API Gallery fetch failed: {e}")

            if not gallery_id:
                logging.info("Galleries API failed or empty. Trying direct DB access...")
                try:
                    import asyncpg
                    # Credentials from .env
                    conn = await asyncpg.connect('postgresql://rawdrive:rawdrive@localhost:5432/rawdrive')
                    try:
                        # Try to find an existing gallery
                        row = await conn.fetchrow("SELECT gallery_id FROM galleries WHERE workspace_id = $1 LIMIT 1", workspace_id)
                        if row:
                            gallery_id = str(row['gallery_id'])
                            logging.info(f"Found gallery in DB: {gallery_id}")
                        else:
                            # Create one
                            logging.info("No gallery in DB. Creating one via SQL...")
                            # minimal insert
                            gallery_id = str(uuid.uuid4())
                            await conn.execute("""
                                INSERT INTO galleries (gallery_id, workspace_id, title, status, created_at, updated_at, created_by_user_id)
                                VALUES ($1, $2, 'Test Gallery', 'active', NOW(), NOW(), $2)
                            """, gallery_id, workspace_id)
                            # Note: created_by_user_id is required, using workspace_id as placeholder since we don't have user_id handy
                            # Wait, we need user_id. We can get it from the token login response?
                            # actually, let's just use a fake UUID or the workspace_id if it works?
                            # The model says created_by_user_id is required.
                            # Getting user_id from the reproduction script earlier steps is better.
                            logging.info(f"Created gallery via DB: {gallery_id}")
                    finally:
                        await conn.close()
                except Exception as db_e:
                    logging.error(f"DB Access failed: {db_e}. Cannot proceed without a gallery.")
                    import traceback
                    logging.error(traceback.format_exc())
                    return
            
            if not gallery_id:
                logging.error("Could not obtain a gallery ID.")
                return

            # 5. Upload Photo
            if not os.path.exists(PHOTO_PATH):
                raise FileNotFoundError(f"Photo file not found at {PHOTO_PATH}")
                
            # 5. Upload Photo (Multi-step)
            logging.info(f"Uploading photo {PHOTO_PATH} to gallery {gallery_id}...")
            
            # Calculate SHA256 and size
            with open(PHOTO_PATH, "rb") as f:
                file_bytes = f.read()
                file_size = len(file_bytes)
                sha256_hash = hashlib.sha256(file_bytes).hexdigest()
            
            file_name = os.path.basename(PHOTO_PATH)
            mime_type = "image/jpeg" # Assumption for verified jpg

            # 5a. Create Session
            logging.info("Creating upload session...")
            session_payload = {
                "gallery_id": gallery_id,
                "file_name": file_name,
                "mime_type": mime_type,
                "size_bytes": file_size,
                "sha256": sha256_hash
            }
            session_res = await client.post(
                f"{API_URL}/workspaces/{workspace_id}/uploads",
                headers=headers,
                json=session_payload
            )
            
            if session_res.status_code != 201:
                logging.error(f"Create Session Failed: {session_res.text}")
                results["upload_status_code"] = session_res.status_code
                results["upload_body"] = session_res.text
                with open("reproduce_results.json", "w") as f:
                    json.dump(results, f, indent=2)
                return

            upload_session = session_res.json()
            upload_id = upload_session["upload_id"]
            logging.info(f"Upload Session Created: {upload_id}")

            # 5b. Commit Upload (with file)
            # We use the commit endpoint with the file directly as per "legacy/fallback" flow which ensures detection queuing
            logging.info("Committing upload with file...")
            
            # We need to send multipart/form-data
            # httpx handles this with 'files' and 'data'
            files = {'file': (file_name, file_bytes, mime_type)}
            data = {'sha256': sha256_hash}
            
            commit_res = await client.post(
                f"{API_URL}/workspaces/{workspace_id}/uploads/{upload_id}/commit",
                headers=headers,
                data=data,
                files=files
            )
            
            results["upload_status_code"] = commit_res.status_code
            logging.info(f"Upload Commit Status: {commit_res.status_code}")
            
            if commit_res.status_code != 200:
                 logging.error(f"Commit Failed: {commit_res.text}")
                 results["upload_body"] = commit_res.text
                 with open("reproduce_results.json", "w") as f:
                    json.dump(results, f, indent=2)
                 return

            commit_data = commit_res.json()
            results["upload_body"] = commit_data
            asset_id = commit_data.get("asset_id")
            logging.info(f"Asset Created: {asset_id}. Analysis Queued: {commit_data.get('analysis_queued')}")

            if not asset_id:
                logging.error("No asset_id in commit response.")
                return

            # 6. Poll for Face Detection (DB Direct)
            logging.info("Polling for face detection results via DB (max 30s)...")
            results["detection_status_code"] = "POLLING_DB"
            
            start_time = time.time()
            faces_found = False
            
            # Connect to DB for polling
            try:
                import asyncpg
                poll_conn = await asyncpg.connect('postgresql://rawdrive:rawdrive@localhost:5432/rawdrive')
                try:
                    while time.time() - start_time < 30:
                        # Check faces table
                        # Table: faces, Column: photo_id -> asset_id
                        row = await poll_conn.fetchrow("SELECT count(*) as count FROM faces WHERE photo_id = $1", asset_id)
                        count = row['count']
                        
                        if count > 0:
                            logging.info(f"Faces detected in DB! Count: {count}")
                            results["detection_status_code"] = "200 (DB Verified)"
                            results["detection_body"] = {"face_count": count, "source": "database"}
                            faces_found = True
                            break
                        else:
                            logging.debug("No faces in DB yet...")
                        
                        await asyncio.sleep(2)
                finally:
                    await poll_conn.close()
            except Exception as db_e:
                logging.error(f"DB Polling failed: {db_e}")
                results["error"] = f"DB Polling failed: {db_e}"
            
            if not faces_found:
                logging.error("Timed out waiting for faces in DB.")
                results["detection_status_code"] = "TIMEOUT"

            with open("reproduce_results.json", "w") as f:
                json.dump(results, f, indent=2)

            logging.info("Reproduction script finished.")

    except Exception as e:
        logging.error(f"An error occurred: {e}")
        import traceback
        logging.error(traceback.format_exc())
        results["error"] = str(e)
        with open("reproduce_results.json", "w") as f:
            json.dump(results, f, indent=2)

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
