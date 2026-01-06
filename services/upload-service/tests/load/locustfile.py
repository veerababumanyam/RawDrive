"""Locust load test for Upload Service.

Simulates 5K concurrent upload users to validate KEDA autoscaling.

Usage:
    locust -f locustfile.py --host=http://localhost:8080

    # For 5K concurrent users
    locust -f locustfile.py --host=http://localhost:8080 -u 5000 -r 100

    # Headless mode
    locust -f locustfile.py --host=http://localhost:8080 -u 5000 -r 100 --headless -t 10m
"""

import os
import random
import hashlib
from uuid import uuid4
from datetime import datetime, timezone

from locust import HttpUser, task, between, events
from locust.runners import MasterRunner


# Configuration
WORKSPACE_ID = os.environ.get("TEST_WORKSPACE_ID", str(uuid4()))
AUTH_TOKEN = os.environ.get("TEST_AUTH_TOKEN", "test-token")

# Simulated file sizes (bytes)
FILE_SIZES = [
    1 * 1024 * 1024,    # 1MB - small image
    5 * 1024 * 1024,    # 5MB - typical photo
    15 * 1024 * 1024,   # 15MB - large photo
    30 * 1024 * 1024,   # 30MB - RAW file
    50 * 1024 * 1024,   # 50MB - large RAW
]

# File types to simulate
FILE_TYPES = [
    ("photo.jpg", "image/jpeg"),
    ("image.png", "image/png"),
    ("photo.heic", "image/heic"),
    ("raw.cr2", "application/octet-stream"),
    ("raw.nef", "application/octet-stream"),
    ("video.mp4", "video/mp4"),
]

# Chunk size for uploads
CHUNK_SIZE = 5 * 1024 * 1024  # 5MB


class UploadUser(HttpUser):
    """Simulated upload user for load testing."""

    # Wait 1-3 seconds between tasks
    wait_time = between(1, 3)

    def on_start(self):
        """Initialize user state."""
        self.headers = {
            "Authorization": f"Bearer {AUTH_TOKEN}",
            "X-Workspace-ID": WORKSPACE_ID,
        }
        self.upload_sessions = []

    @task(10)
    def create_upload_session(self):
        """Create a new upload session."""
        filename, mime_type = random.choice(FILE_TYPES)
        size_bytes = random.choice(FILE_SIZES)

        payload = {
            "file_name": f"{uuid4()}_{filename}",
            "mime_type": mime_type,
            "size_bytes": size_bytes,
            "gallery_id": str(uuid4()),
        }

        with self.client.post(
            "/api/v1/upload/session",
            json=payload,
            headers=self.headers,
            name="POST /upload/session",
            catch_response=True,
        ) as response:
            if response.status_code == 201:
                data = response.json()
                self.upload_sessions.append({
                    "upload_id": data["upload_id"],
                    "size_bytes": size_bytes,
                    "uploaded_bytes": 0,
                })
                response.success()
            elif response.status_code == 402:
                # Storage quota exceeded - expected in some cases
                response.success()
            else:
                response.failure(f"Failed to create session: {response.status_code}")

    @task(20)
    def upload_chunk(self):
        """Upload a chunk to an active session."""
        if not self.upload_sessions:
            return

        # Pick a random session that's not complete
        session = random.choice(self.upload_sessions)
        upload_id = session["upload_id"]
        size_bytes = session["size_bytes"]
        uploaded_bytes = session["uploaded_bytes"]

        if uploaded_bytes >= size_bytes:
            # Session complete, remove it
            self.upload_sessions.remove(session)
            return

        # Calculate chunk size
        remaining = size_bytes - uploaded_bytes
        chunk_size = min(CHUNK_SIZE, remaining)

        # Generate random chunk data
        chunk_data = os.urandom(chunk_size)

        headers = {
            **self.headers,
            "Content-Type": "application/offset+octet-stream",
            "Upload-Offset": str(uploaded_bytes),
            "Upload-Length": str(size_bytes),
            "Tus-Resumable": "1.0.0",
        }

        with self.client.patch(
            f"/api/v1/upload/chunk/{upload_id}",
            data=chunk_data,
            headers=headers,
            name="PATCH /upload/chunk/{id}",
            catch_response=True,
        ) as response:
            if response.status_code == 204:
                # Update session state
                new_offset = int(response.headers.get("Upload-Offset", uploaded_bytes + chunk_size))
                session["uploaded_bytes"] = new_offset
                response.success()
            elif response.status_code == 404:
                # Session expired or not found
                self.upload_sessions.remove(session)
                response.success()
            elif response.status_code == 409:
                # Offset mismatch - get correct offset from response
                response.success()
            else:
                response.failure(f"Failed to upload chunk: {response.status_code}")

    @task(5)
    def check_upload_status(self):
        """Check status of an upload (HEAD request)."""
        if not self.upload_sessions:
            return

        session = random.choice(self.upload_sessions)
        upload_id = session["upload_id"]

        with self.client.head(
            f"/api/v1/upload/chunk/{upload_id}",
            headers=self.headers,
            name="HEAD /upload/chunk/{id}",
            catch_response=True,
        ) as response:
            if response.status_code == 200:
                response.success()
            elif response.status_code == 404:
                # Session not found - remove from list
                self.upload_sessions.remove(session)
                response.success()
            else:
                response.failure(f"Status check failed: {response.status_code}")

    @task(3)
    def complete_upload(self):
        """Complete an upload session."""
        # Find sessions that have uploaded all bytes
        complete_sessions = [
            s for s in self.upload_sessions
            if s["uploaded_bytes"] >= s["size_bytes"]
        ]

        if not complete_sessions:
            return

        session = random.choice(complete_sessions)
        upload_id = session["upload_id"]

        # Generate fake SHA256
        sha256 = hashlib.sha256(os.urandom(32)).hexdigest()

        payload = {
            "sha256": sha256,
            "total_size": session["size_bytes"],
        }

        with self.client.post(
            f"/api/v1/upload/complete/{upload_id}",
            json=payload,
            headers=self.headers,
            name="POST /upload/complete/{id}",
            catch_response=True,
        ) as response:
            # Remove session regardless of outcome
            self.upload_sessions.remove(session)

            if response.status_code == 200:
                response.success()
            elif response.status_code in (400, 404, 409, 410):
                # Expected errors
                response.success()
            else:
                response.failure(f"Complete failed: {response.status_code}")

    @task(2)
    def check_duplicate(self):
        """Check for duplicate files."""
        sha256 = hashlib.sha256(os.urandom(32)).hexdigest()

        payload = {"sha256": sha256}

        with self.client.post(
            "/api/v1/upload/check-duplicate",
            json=payload,
            headers=self.headers,
            name="POST /upload/check-duplicate",
            catch_response=True,
        ) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Duplicate check failed: {response.status_code}")

    @task(1)
    def cancel_upload(self):
        """Cancel a random upload session."""
        if not self.upload_sessions:
            return

        session = random.choice(self.upload_sessions)
        upload_id = session["upload_id"]

        with self.client.delete(
            f"/api/v1/upload/chunk/{upload_id}",
            headers=self.headers,
            name="DELETE /upload/chunk/{id}",
            catch_response=True,
        ) as response:
            # Remove session regardless of outcome
            self.upload_sessions.remove(session)

            if response.status_code in (204, 404, 410):
                response.success()
            else:
                response.failure(f"Cancel failed: {response.status_code}")


class HealthCheckUser(HttpUser):
    """Lightweight user that only checks health endpoints."""

    wait_time = between(5, 10)
    weight = 1  # Low weight compared to upload users

    @task
    def health_check(self):
        """Check health endpoint."""
        with self.client.get("/health", name="GET /health") as response:
            if response.status_code != 200:
                response.failure(f"Health check failed: {response.status_code}")

    @task
    def ready_check(self):
        """Check readiness endpoint."""
        with self.client.get("/ready", name="GET /ready") as response:
            if response.status_code not in (200, 503):
                response.failure(f"Ready check failed: {response.status_code}")


# Event handlers for reporting
@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    """Log test start."""
    print(f"Load test starting at {datetime.now(timezone.utc).isoformat()}")
    print(f"Target host: {environment.host}")


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    """Log test completion."""
    print(f"Load test completed at {datetime.now(timezone.utc).isoformat()}")


@events.request.add_listener
def on_request(request_type, name, response_time, response_length, exception, **kwargs):
    """Track request metrics for KEDA validation."""
    if response_time > 300:  # P95 target is 300ms
        print(f"SLOW REQUEST: {request_type} {name} took {response_time}ms")
