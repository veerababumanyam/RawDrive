"""
Load Testing Script for Gallery Service.

Simulates 50K concurrent users accessing Magic Link galleries.
Uses locust for distributed load testing.

Run with:
    locust -f load_test.py --host=http://localhost:8004

For distributed testing:
    locust -f load_test.py --master
    locust -f load_test.py --worker --master-host=localhost
"""

import json
import random
import string
from typing import Optional
from locust import HttpUser, task, between, events
from locust.env import Environment


# =============================================================================
# Test Configuration
# =============================================================================

# Sample gallery IDs for testing (would be populated from seed data)
SAMPLE_GALLERY_IDS = [
    "550e8400-e29b-41d4-a716-446655440001",
    "550e8400-e29b-41d4-a716-446655440002",
    "550e8400-e29b-41d4-a716-446655440003",
    "550e8400-e29b-41d4-a716-446655440004",
    "550e8400-e29b-41d4-a716-446655440005",
]

SAMPLE_ASSET_IDS = [
    "660e8400-e29b-41d4-a716-446655440001",
    "660e8400-e29b-41d4-a716-446655440002",
    "660e8400-e29b-41d4-a716-446655440003",
    "660e8400-e29b-41d4-a716-446655440004",
    "660e8400-e29b-41d4-a716-446655440005",
]


def generate_visitor_id() -> str:
    """Generate a random visitor ID."""
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=24))


# =============================================================================
# Gallery Viewer User (Public Magic Link Access)
# =============================================================================


class GalleryViewerUser(HttpUser):
    """
    Simulates a gallery viewer accessing via Magic Link.

    User flow:
    1. Access gallery metadata (GET /api/v1/public/galleries/{id})
    2. Fetch gallery assets with pagination (GET /api/v1/public/galleries/{id}/assets)
    3. Occasionally favorite/select images (POST /api/v1/public/galleries/{id}/proof/*)
    """

    # Wait between 1-5 seconds between tasks (realistic browsing)
    wait_time = between(1, 5)

    def on_start(self):
        """Initialize user session."""
        self.visitor_id = generate_visitor_id()
        self.gallery_id = random.choice(SAMPLE_GALLERY_IDS)
        self.magic_link_token = f"test-token-{self.visitor_id}"
        self.headers = {
            "X-Magic-Link-Token": self.magic_link_token,
            "X-Visitor-ID": self.visitor_id,
            "Content-Type": "application/json",
        }

    @task(10)  # High weight - most common action
    def view_gallery(self):
        """View gallery metadata."""
        with self.client.get(
            f"/api/v1/public/galleries/{self.gallery_id}",
            headers=self.headers,
            catch_response=True,
        ) as response:
            if response.status_code == 200:
                response.success()
            elif response.status_code == 404:
                # Gallery not found is acceptable in test
                response.success()
            else:
                response.failure(f"Unexpected status: {response.status_code}")

    @task(8)  # Second most common - browsing assets
    def view_gallery_assets(self):
        """View gallery assets with pagination."""
        page = random.randint(1, 10)
        limit = random.choice([20, 50, 100])

        with self.client.get(
            f"/api/v1/public/galleries/{self.gallery_id}/assets",
            params={"page": page, "limit": limit},
            headers=self.headers,
            catch_response=True,
        ) as response:
            if response.status_code in [200, 404]:
                response.success()
            else:
                response.failure(f"Unexpected status: {response.status_code}")

    @task(2)  # Occasional - favoriting images
    def favorite_asset(self):
        """Toggle favorite on an asset."""
        asset_id = random.choice(SAMPLE_ASSET_IDS)
        value = random.choice([True, False])

        with self.client.post(
            f"/api/v1/public/galleries/{self.gallery_id}/proof/favorite",
            json={
                "asset_id": asset_id,
                "action": "favorite",
                "value": value,
            },
            headers=self.headers,
            catch_response=True,
        ) as response:
            if response.status_code in [200, 404]:
                response.success()
            else:
                response.failure(f"Unexpected status: {response.status_code}")

    @task(1)  # Rare - selecting images
    def select_asset(self):
        """Toggle selection on an asset."""
        asset_id = random.choice(SAMPLE_ASSET_IDS)
        value = random.choice([True, False])

        with self.client.post(
            f"/api/v1/public/galleries/{self.gallery_id}/proof/select",
            json={
                "asset_id": asset_id,
                "action": "select",
                "value": value,
            },
            headers=self.headers,
            catch_response=True,
        ) as response:
            if response.status_code in [200, 404]:
                response.success()
            else:
                response.failure(f"Unexpected status: {response.status_code}")


# =============================================================================
# Proofing User (Heavy Interaction)
# =============================================================================


class ProofingUser(HttpUser):
    """
    Simulates a user actively proofing images.

    Heavier interaction patterns with more favorites/selections.
    """

    wait_time = between(0.5, 2)  # Faster interactions

    def on_start(self):
        """Initialize proofing session."""
        self.visitor_id = generate_visitor_id()
        self.gallery_id = random.choice(SAMPLE_GALLERY_IDS)
        self.magic_link_token = f"proof-token-{self.visitor_id}"
        self.headers = {
            "X-Magic-Link-Token": self.magic_link_token,
            "X-Visitor-ID": self.visitor_id,
            "X-Visitor-Name": f"Proofer-{self.visitor_id[:8]}",
            "Content-Type": "application/json",
        }

    @task(5)
    def batch_favorite(self):
        """Batch favorite multiple assets."""
        actions = [
            {
                "asset_id": random.choice(SAMPLE_ASSET_IDS),
                "action": "favorite",
                "value": True,
            }
            for _ in range(random.randint(1, 5))
        ]

        with self.client.post(
            f"/api/v1/public/galleries/{self.gallery_id}/proof/batch",
            json={"actions": actions},
            headers=self.headers,
            catch_response=True,
        ) as response:
            if response.status_code in [200, 404]:
                response.success()
            else:
                response.failure(f"Unexpected status: {response.status_code}")

    @task(3)
    def add_comment(self):
        """Add a comment to an asset."""
        asset_id = random.choice(SAMPLE_ASSET_IDS)
        comments = [
            "Love this shot!",
            "Can we get this one edited?",
            "Perfect for the album",
            "Maybe crop a bit?",
            "This is my favorite!",
        ]

        with self.client.post(
            f"/api/v1/public/galleries/{self.gallery_id}/proof/comment",
            json={
                "asset_id": asset_id,
                "comment": random.choice(comments),
            },
            headers=self.headers,
            catch_response=True,
        ) as response:
            if response.status_code in [200, 404]:
                response.success()
            else:
                response.failure(f"Unexpected status: {response.status_code}")


# =============================================================================
# Health Check User (Monitoring)
# =============================================================================


class HealthCheckUser(HttpUser):
    """
    Simulates monitoring health checks.

    Low frequency, ensures service availability.
    """

    wait_time = between(5, 10)

    @task(1)
    def health_check(self):
        """Check service health."""
        with self.client.get("/health", catch_response=True) as response:
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == "healthy":
                    response.success()
                else:
                    response.failure(f"Unhealthy status: {data}")
            else:
                response.failure(f"Health check failed: {response.status_code}")

    @task(1)
    def readiness_check(self):
        """Check service readiness."""
        with self.client.get("/ready", catch_response=True) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Readiness check failed: {response.status_code}")


# =============================================================================
# Event Hooks for Metrics
# =============================================================================


@events.request.add_listener
def on_request(request_type, name, response_time, response_length, exception, **kwargs):
    """Track request metrics for analysis."""
    pass  # Locust handles this internally


@events.test_start.add_listener
def on_test_start(environment: Environment, **kwargs):
    """Log test start."""
    print("=" * 60)
    print("Gallery Service Load Test Starting")
    print("Target: 50K concurrent users")
    print("=" * 60)


@events.test_stop.add_listener
def on_test_stop(environment: Environment, **kwargs):
    """Log test results."""
    stats = environment.stats
    print("\n" + "=" * 60)
    print("Load Test Results")
    print("=" * 60)
    print(f"Total Requests: {stats.total.num_requests}")
    print(f"Total Failures: {stats.total.num_failures}")
    print(f"Average Response Time: {stats.total.avg_response_time:.2f}ms")
    print(f"P50 Response Time: {stats.total.get_response_time_percentile(0.5):.2f}ms")
    print(f"P95 Response Time: {stats.total.get_response_time_percentile(0.95):.2f}ms")
    print(f"P99 Response Time: {stats.total.get_response_time_percentile(0.99):.2f}ms")
    print(f"Requests/sec: {stats.total.total_rps:.2f}")
    print("=" * 60)
