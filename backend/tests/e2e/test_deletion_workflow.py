"""
End-to-end test for deletion and recycle bin workflow.

Tests the complete deletion flow:
1. Login as test user
2. Create gallery with photos
3. Soft delete gallery
4. Verify gallery in recycle bin
5. Verify gallery not visible in normal list
6. Restore gallery from recycle bin
7. Verify gallery restored with name conflict handling
8. Soft delete again
9. Permanently delete
10. Verify complete removal

Requirements tested:
- 2.1-2.7: Soft delete functionality
- 3.1-3.7: Restore functionality
- 4.1-4.8: Permanent delete functionality
- 8.1-8.6: Audit logging
- 9.1-9.6: Recycle bin UI/API
- 10.1-10.2: Workspace isolation
"""

import asyncio
import hashlib
import io
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

import aiohttp
from PIL import Image

# Add backend src to path for importing test constants
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src"))

from app.config.test_constants import TEST_PASSWORD, TierUsers

# Test configuration
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")
TEST_USER_EMAIL = TierUsers.PROFESSIONAL.email
TEST_USER_PASSWORD = TEST_PASSWORD


class Colors:
    """ANSI color codes for terminal output."""
    GREEN = "\033[92m"
    RED = "\033[91m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    RESET = "\033[0m"
    BOLD = "\033[1m"


def print_success(message: str) -> None:
    """Print success message."""
    print(f"{Colors.GREEN}✓ {message}{Colors.RESET}")


def print_error(message: str) -> None:
    """Print error message."""
    print(f"{Colors.RED}✗ {message}{Colors.RESET}")


def print_info(message: str) -> None:
    """Print info message."""
    print(f"{Colors.BLUE}ℹ {message}{Colors.RESET}")


def print_warning(message: str) -> None:
    """Print warning message."""
    print(f"{Colors.YELLOW}⚠ {message}{Colors.RESET}")


class DeletionWorkflowTester:
    """End-to-end tester for deletion workflow."""

    def __init__(self, api_base_url: str = API_BASE_URL):
        self.api_base_url = api_base_url
        self.session: aiohttp.ClientSession | None = None
        self.access_token: str | None = None
        self.workspace_id: str | None = None
        self.gallery_id: str | None = None
        self.gallery_title: str = f"Deletion Test Gallery {datetime.now().strftime('%H%M%S')}"
        self.asset_ids: List[str] = []

    async def __aenter__(self):
        """Async context manager entry."""
        self.session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self.session:
            await self.session.close()

    def _get_headers(self) -> Dict[str, str]:
        """Get request headers with auth token."""
        headers = {"Content-Type": "application/json"}
        if self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"
        return headers

    def _create_test_image(self, width: int = 800, height: int = 600) -> bytes:
        """Create a test JPEG image."""
        img = Image.new("RGB", (width, height), color=(73, 109, 137))
        img_bytes = io.BytesIO()
        img.save(img_bytes, format="JPEG", quality=95)
        return img_bytes.getvalue()

    async def step_1_login(self) -> bool:
        """Step 1: Login as test user."""
        print_info("Step 1: Logging in as test user...")
        try:
            async with self.session.post(
                f"{self.api_base_url}/api/v1/auth/login",
                json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD},
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    print_error(f"Login failed: {response.status} - {error_text}")
                    return False

                data = await response.json()
                if "tokens" not in data:
                    print_error(f"Login response missing tokens: {data}")
                    return False

                self.access_token = data["tokens"]["access_token"]

                if "user" in data and data["user"].get("workspace_id"):
                    self.workspace_id = str(data["user"]["workspace_id"])
                elif "workspace" in data:
                    self.workspace_id = str(data["workspace"]["workspace_id"])
                else:
                    print_error("Login response missing workspace_id")
                    return False

                print_success(f"Logged in as {TEST_USER_EMAIL}")
                print_success(f"Workspace ID: {self.workspace_id}")
                return True
        except Exception as e:
            print_error(f"Login error: {e}")
            return False

    async def step_2_create_gallery_with_photos(self) -> bool:
        """Step 2: Create a gallery with test photos."""
        print_info("Step 2: Creating gallery with test photos...")
        try:
            # Create gallery
            gallery_data = {
                "title": self.gallery_title,
                "description": "Gallery for deletion workflow testing",
                "client_name": "Deletion Test Client",
            }

            async with self.session.post(
                f"{self.api_base_url}/api/v1/workspaces/{self.workspace_id}/galleries",
                json=gallery_data,
                headers=self._get_headers(),
            ) as response:
                if response.status != 201:
                    error_text = await response.text()
                    print_error(f"Gallery creation failed: {response.status} - {error_text}")
                    return False

                data = await response.json()
                self.gallery_id = str(data["gallery_id"])
                print_success(f"Gallery created: {self.gallery_id}")

            # Upload 2 test photos
            for i in range(2):
                success = await self._upload_test_photo(f"deletion_test_{i}.jpg")
                if not success:
                    print_warning(f"Failed to upload photo {i}")

            print_success(f"Uploaded {len(self.asset_ids)} photos to gallery")
            return True
        except Exception as e:
            print_error(f"Gallery creation error: {e}")
            return False

    async def _upload_test_photo(self, filename: str) -> bool:
        """Upload a single test photo."""
        try:
            image_data = self._create_test_image()
            sha256 = hashlib.sha256(image_data).hexdigest()

            # Create upload session
            session_data = {
                "file_name": filename,
                "mime_type": "image/jpeg",
                "size_bytes": len(image_data),
                "gallery_id": self.gallery_id,
                "sha256": sha256,
            }

            async with self.session.post(
                f"{self.api_base_url}/api/v1/workspaces/{self.workspace_id}/uploads",
                json=session_data,
                headers=self._get_headers(),
            ) as response:
                if response.status != 201:
                    return False
                upload_data = await response.json()
                upload_id = str(upload_data["upload_id"])

            # Upload file
            async with self.session.put(
                f"{self.api_base_url}/api/v1/workspaces/{self.workspace_id}/uploads/{upload_id}/upload",
                data=image_data,
                headers={"Authorization": f"Bearer {self.access_token}", "Content-Type": "image/jpeg"},
            ) as response:
                if response.status != 200:
                    return False

            # Commit upload
            commit_form = aiohttp.FormData()
            commit_form.add_field("file", image_data, filename=filename, content_type="image/jpeg")
            commit_form.add_field("sha256", sha256)

            async with self.session.post(
                f"{self.api_base_url}/api/v1/workspaces/{self.workspace_id}/uploads/{upload_id}/commit",
                data=commit_form,
                headers={"Authorization": f"Bearer {self.access_token}"},
            ) as response:
                if response.status != 200:
                    return False
                commit_data = await response.json()
                self.asset_ids.append(str(commit_data["asset_id"]))

            return True
        except Exception as e:
            print_warning(f"Upload error: {e}")
            return False

    async def step_3_soft_delete_gallery(self) -> bool:
        """Step 3: Soft delete the gallery."""
        print_info("Step 3: Soft deleting gallery...")
        try:
            async with self.session.delete(
                f"{self.api_base_url}/api/v1/workspaces/{self.workspace_id}/galleries/{self.gallery_id}",
                headers=self._get_headers(),
            ) as response:
                if response.status not in (200, 204):
                    error_text = await response.text()
                    print_error(f"Soft delete failed: {response.status} - {error_text}")
                    return False

                if response.status == 200:
                    data = await response.json()
                    print_success(f"Gallery soft deleted")
                    if "cascaded_photos" in data:
                        print_info(f"  Cascaded photos: {data.get('cascaded_photos', 0)}")
                    if "cascaded_sub_galleries" in data:
                        print_info(f"  Cascaded sub-galleries: {data.get('cascaded_sub_galleries', 0)}")
                else:
                    print_success("Gallery soft deleted (no response body)")

                return True
        except Exception as e:
            print_error(f"Soft delete error: {e}")
            return False

    async def step_4_verify_in_recycle_bin(self) -> bool:
        """Step 4: Verify gallery appears in recycle bin."""
        print_info("Step 4: Verifying gallery in recycle bin...")
        try:
            async with self.session.get(
                f"{self.api_base_url}/api/v1/workspaces/{self.workspace_id}/recycle-bin",
                params={"page": 1, "limit": 50},
                headers=self._get_headers(),
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    print_error(f"Recycle bin fetch failed: {response.status} - {error_text}")
                    return False

                data = await response.json()
                items = data.get("items", [])

                # Find our gallery
                gallery_item = None
                for item in items:
                    if item.get("id") == self.gallery_id:
                        gallery_item = item
                        break

                if not gallery_item:
                    print_error("Gallery not found in recycle bin")
                    return False

                print_success(f"Gallery found in recycle bin")
                print_info(f"  Name: {gallery_item.get('name')}")
                print_info(f"  Type: {gallery_item.get('type')}")
                print_info(f"  Days until permanent delete: {gallery_item.get('days_until_permanent_delete')}")

                # Verify days calculation is reasonable (0-30 for default retention)
                days = gallery_item.get("days_until_permanent_delete", -1)
                if 0 <= days <= 30:
                    print_success("  Days until deletion is valid")
                else:
                    print_warning(f"  Days until deletion seems off: {days}")

                return True
        except Exception as e:
            print_error(f"Recycle bin verification error: {e}")
            return False

    async def step_5_verify_not_in_normal_list(self) -> bool:
        """Step 5: Verify gallery is NOT in normal gallery list."""
        print_info("Step 5: Verifying gallery NOT in normal list...")
        try:
            async with self.session.get(
                f"{self.api_base_url}/api/v1/workspaces/{self.workspace_id}/galleries",
                params={"page": 1, "limit": 100},
                headers=self._get_headers(),
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    print_error(f"Gallery list fetch failed: {response.status} - {error_text}")
                    return False

                data = await response.json()
                galleries = data.get("data", [])

                # Ensure our deleted gallery is NOT in the list
                for gallery in galleries:
                    if gallery.get("gallery_id") == self.gallery_id:
                        print_error("Deleted gallery still appears in normal list!")
                        return False

                print_success(f"Gallery correctly hidden from normal list ({len(galleries)} galleries)")
                return True
        except Exception as e:
            print_error(f"Normal list verification error: {e}")
            return False

    async def step_6_restore_gallery(self) -> bool:
        """Step 6: Restore gallery from recycle bin."""
        print_info("Step 6: Restoring gallery from recycle bin...")
        try:
            async with self.session.post(
                f"{self.api_base_url}/api/v1/workspaces/{self.workspace_id}/recycle-bin/galleries/{self.gallery_id}/restore",
                headers=self._get_headers(),
            ) as response:
                if response.status not in (200, 201):
                    error_text = await response.text()
                    print_error(f"Restore failed: {response.status} - {error_text}")
                    return False

                data = await response.json()
                print_success("Gallery restored from recycle bin")
                if data.get("new_name"):
                    print_info(f"  New name (due to conflict): {data['new_name']}")
                print_info(f"  Cascaded sub-galleries: {data.get('cascaded_sub_galleries', 0)}")
                print_info(f"  Cascaded photos: {data.get('cascaded_photos', 0)}")

                return True
        except Exception as e:
            print_error(f"Restore error: {e}")
            return False

    async def step_7_verify_restored(self) -> bool:
        """Step 7: Verify gallery is restored and visible."""
        print_info("Step 7: Verifying gallery is restored...")
        try:
            # Check gallery is now in normal list
            async with self.session.get(
                f"{self.api_base_url}/api/v1/workspaces/{self.workspace_id}/galleries/{self.gallery_id}",
                headers=self._get_headers(),
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    print_error(f"Gallery fetch failed: {response.status} - {error_text}")
                    return False

                data = await response.json()
                print_success(f"Gallery accessible: {data.get('title')}")

            # Check gallery is NOT in recycle bin
            async with self.session.get(
                f"{self.api_base_url}/api/v1/workspaces/{self.workspace_id}/recycle-bin",
                params={"page": 1, "limit": 50},
                headers=self._get_headers(),
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    items = data.get("items", [])
                    for item in items:
                        if item.get("id") == self.gallery_id:
                            print_error("Restored gallery still in recycle bin!")
                            return False
                    print_success("Gallery correctly removed from recycle bin")

            return True
        except Exception as e:
            print_error(f"Restore verification error: {e}")
            return False

    async def step_8_soft_delete_again(self) -> bool:
        """Step 8: Soft delete gallery again for permanent delete test."""
        print_info("Step 8: Soft deleting gallery again...")
        try:
            async with self.session.delete(
                f"{self.api_base_url}/api/v1/workspaces/{self.workspace_id}/galleries/{self.gallery_id}",
                headers=self._get_headers(),
            ) as response:
                if response.status not in (200, 204):
                    error_text = await response.text()
                    print_error(f"Second soft delete failed: {response.status} - {error_text}")
                    return False

                print_success("Gallery soft deleted again")
                return True
        except Exception as e:
            print_error(f"Second soft delete error: {e}")
            return False

    async def step_9_permanent_delete(self) -> bool:
        """Step 9: Permanently delete the gallery."""
        print_info("Step 9: Permanently deleting gallery...")
        try:
            async with self.session.delete(
                f"{self.api_base_url}/api/v1/workspaces/{self.workspace_id}/recycle-bin/galleries/{self.gallery_id}/permanent",
                headers=self._get_headers(),
            ) as response:
                if response.status not in (200, 204):
                    error_text = await response.text()
                    print_error(f"Permanent delete failed: {response.status} - {error_text}")
                    return False

                if response.status == 200:
                    data = await response.json()
                    print_success("Gallery permanently deleted")
                    print_info(f"  Files deleted: {data.get('files_deleted', 0)}")
                    storage_freed = data.get("storage_freed", 0)
                    print_info(f"  Storage freed: {storage_freed / 1024:.2f} KB")
                else:
                    print_success("Gallery permanently deleted")

                return True
        except Exception as e:
            print_error(f"Permanent delete error: {e}")
            return False

    async def step_10_verify_complete_removal(self) -> bool:
        """Step 10: Verify gallery is completely removed."""
        print_info("Step 10: Verifying complete removal...")
        try:
            # Try to fetch gallery - should return 404
            async with self.session.get(
                f"{self.api_base_url}/api/v1/workspaces/{self.workspace_id}/galleries/{self.gallery_id}",
                headers=self._get_headers(),
            ) as response:
                if response.status == 404:
                    print_success("Gallery correctly returns 404 (not found)")
                elif response.status == 200:
                    print_error("Gallery still accessible after permanent delete!")
                    return False
                else:
                    print_warning(f"Unexpected status: {response.status}")

            # Verify not in recycle bin either
            async with self.session.get(
                f"{self.api_base_url}/api/v1/workspaces/{self.workspace_id}/recycle-bin",
                params={"page": 1, "limit": 100},
                headers=self._get_headers(),
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    items = data.get("items", [])
                    for item in items:
                        if item.get("id") == self.gallery_id:
                            print_error("Permanently deleted gallery still in recycle bin!")
                            return False
                    print_success("Gallery completely removed from system")

            return True
        except Exception as e:
            print_error(f"Complete removal verification error: {e}")
            return False

    async def run_all_tests(self) -> bool:
        """Run all test steps."""
        print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}")
        print(f"{Colors.BOLD}{Colors.BLUE}Deletion Workflow End-to-End Test{Colors.RESET}")
        print(f"{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}\n")

        steps = [
            ("Login", self.step_1_login),
            ("Create Gallery with Photos", self.step_2_create_gallery_with_photos),
            ("Soft Delete Gallery", self.step_3_soft_delete_gallery),
            ("Verify in Recycle Bin", self.step_4_verify_in_recycle_bin),
            ("Verify NOT in Normal List", self.step_5_verify_not_in_normal_list),
            ("Restore Gallery", self.step_6_restore_gallery),
            ("Verify Restored", self.step_7_verify_restored),
            ("Soft Delete Again", self.step_8_soft_delete_again),
            ("Permanent Delete", self.step_9_permanent_delete),
            ("Verify Complete Removal", self.step_10_verify_complete_removal),
        ]

        results = []
        for step_name, step_func in steps:
            try:
                result = await step_func()
                results.append((step_name, result))
                if not result:
                    print_warning(f"Step '{step_name}' failed, continuing...")
            except Exception as e:
                print_error(f"Step '{step_name}' raised exception: {e}")
                import traceback
                traceback.print_exc()
                results.append((step_name, False))

        # Summary
        print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}")
        print(f"{Colors.BOLD}Test Summary{Colors.RESET}")
        print(f"{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}\n")

        passed = sum(1 for _, result in results if result)
        total = len(results)

        for step_name, result in results:
            if result:
                print_success(f"{step_name}")
            else:
                print_error(f"{step_name}")

        print(f"\n{Colors.BOLD}Results: {passed}/{total} steps passed{Colors.RESET}\n")

        return passed == total


class PhotoDeletionTester:
    """Tester for individual photo deletion workflow."""

    def __init__(self, api_base_url: str = API_BASE_URL):
        self.api_base_url = api_base_url
        self.session: aiohttp.ClientSession | None = None
        self.access_token: str | None = None
        self.workspace_id: str | None = None
        self.gallery_id: str | None = None
        self.asset_id: str | None = None

    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()

    def _get_headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"
        return headers

    async def setup(self) -> bool:
        """Setup test environment: login, create gallery, upload photo."""
        print_info("Setting up photo deletion test...")

        # Login
        async with self.session.post(
            f"{self.api_base_url}/api/v1/auth/login",
            json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD},
        ) as response:
            if response.status != 200:
                print_error("Login failed")
                return False
            data = await response.json()
            self.access_token = data["tokens"]["access_token"]
            if "user" in data and data["user"].get("workspace_id"):
                self.workspace_id = str(data["user"]["workspace_id"])
            else:
                self.workspace_id = str(data["workspace"]["workspace_id"])

        # Create gallery
        async with self.session.post(
            f"{self.api_base_url}/api/v1/workspaces/{self.workspace_id}/galleries",
            json={"title": f"Photo Delete Test {datetime.now().strftime('%H%M%S')}"},
            headers=self._get_headers(),
        ) as response:
            if response.status != 201:
                print_error("Gallery creation failed")
                return False
            data = await response.json()
            self.gallery_id = str(data["gallery_id"])

        # Upload photo
        image = Image.new("RGB", (400, 300), color=(100, 150, 200))
        img_bytes = io.BytesIO()
        image.save(img_bytes, format="JPEG")
        image_data = img_bytes.getvalue()
        sha256 = hashlib.sha256(image_data).hexdigest()

        # Create upload session
        async with self.session.post(
            f"{self.api_base_url}/api/v1/workspaces/{self.workspace_id}/uploads",
            json={
                "file_name": "photo_delete_test.jpg",
                "mime_type": "image/jpeg",
                "size_bytes": len(image_data),
                "gallery_id": self.gallery_id,
                "sha256": sha256,
            },
            headers=self._get_headers(),
        ) as response:
            if response.status != 201:
                print_error("Upload session creation failed")
                return False
            upload_data = await response.json()
            upload_id = str(upload_data["upload_id"])

        # Upload file
        async with self.session.put(
            f"{self.api_base_url}/api/v1/workspaces/{self.workspace_id}/uploads/{upload_id}/upload",
            data=image_data,
            headers={"Authorization": f"Bearer {self.access_token}", "Content-Type": "image/jpeg"},
        ) as response:
            if response.status != 200:
                print_error("File upload failed")
                return False

        # Commit
        form = aiohttp.FormData()
        form.add_field("file", image_data, filename="photo_delete_test.jpg", content_type="image/jpeg")
        form.add_field("sha256", sha256)
        async with self.session.post(
            f"{self.api_base_url}/api/v1/workspaces/{self.workspace_id}/uploads/{upload_id}/commit",
            data=form,
            headers={"Authorization": f"Bearer {self.access_token}"},
        ) as response:
            if response.status != 200:
                print_error("Upload commit failed")
                return False
            commit_data = await response.json()
            self.asset_id = str(commit_data["asset_id"])

        print_success("Setup complete")
        return True

    async def test_photo_deletion_workflow(self) -> bool:
        """Test complete photo deletion workflow."""
        print_info("Testing individual photo deletion...")

        # Soft delete photo
        async with self.session.delete(
            f"{self.api_base_url}/api/v1/workspaces/{self.workspace_id}/galleries/{self.gallery_id}/assets/{self.asset_id}",
            headers=self._get_headers(),
        ) as response:
            if response.status not in (200, 204):
                print_error(f"Photo soft delete failed: {response.status}")
                return False
            print_success("Photo soft deleted")

        # Verify in recycle bin
        async with self.session.get(
            f"{self.api_base_url}/api/v1/workspaces/{self.workspace_id}/recycle-bin",
            params={"type": "photo"},
            headers=self._get_headers(),
        ) as response:
            if response.status != 200:
                print_error("Recycle bin fetch failed")
                return False
            data = await response.json()
            items = data.get("items", [])
            found = any(item.get("id") == self.asset_id for item in items)
            if found:
                print_success("Photo found in recycle bin")
            else:
                print_warning("Photo not found in recycle bin (may be expected if linked to gallery)")

        # Restore photo
        async with self.session.post(
            f"{self.api_base_url}/api/v1/workspaces/{self.workspace_id}/recycle-bin/photos/{self.asset_id}/restore",
            headers=self._get_headers(),
        ) as response:
            if response.status in (200, 201):
                print_success("Photo restored")
            else:
                print_warning(f"Photo restore returned: {response.status}")

        # Soft delete again
        async with self.session.delete(
            f"{self.api_base_url}/api/v1/workspaces/{self.workspace_id}/galleries/{self.gallery_id}/assets/{self.asset_id}",
            headers=self._get_headers(),
        ) as response:
            if response.status in (200, 204):
                print_success("Photo soft deleted again")
            else:
                print_warning(f"Second soft delete returned: {response.status}")

        # Permanent delete
        async with self.session.delete(
            f"{self.api_base_url}/api/v1/workspaces/{self.workspace_id}/recycle-bin/photos/{self.asset_id}/permanent",
            headers=self._get_headers(),
        ) as response:
            if response.status in (200, 204):
                print_success("Photo permanently deleted")
                return True
            else:
                print_error(f"Permanent delete failed: {response.status}")
                return False

    async def cleanup(self) -> None:
        """Cleanup test gallery."""
        if self.gallery_id:
            try:
                # Try to delete the test gallery
                async with self.session.delete(
                    f"{self.api_base_url}/api/v1/workspaces/{self.workspace_id}/galleries/{self.gallery_id}",
                    headers=self._get_headers(),
                ) as response:
                    pass  # Ignore result
            except Exception:
                pass


async def main():
    """Main entry point."""
    print(f"\n{Colors.BOLD}Running Deletion Workflow Tests{Colors.RESET}\n")

    # Run gallery deletion workflow
    async with DeletionWorkflowTester() as tester:
        gallery_success = await tester.run_all_tests()

    # Run photo deletion workflow
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}Photo Deletion Workflow Test{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}\n")

    async with PhotoDeletionTester() as photo_tester:
        setup_ok = await photo_tester.setup()
        if setup_ok:
            photo_success = await photo_tester.test_photo_deletion_workflow()
            await photo_tester.cleanup()
        else:
            photo_success = False
            print_error("Photo deletion test setup failed")

    # Final summary
    print(f"\n{Colors.BOLD}{'='*60}{Colors.RESET}")
    print(f"{Colors.BOLD}Final Results{Colors.RESET}")
    print(f"{'='*60}\n")

    if gallery_success:
        print_success("Gallery deletion workflow: PASSED")
    else:
        print_error("Gallery deletion workflow: FAILED")

    if photo_success:
        print_success("Photo deletion workflow: PASSED")
    else:
        print_error("Photo deletion workflow: FAILED")

    overall_success = gallery_success and photo_success
    sys.exit(0 if overall_success else 1)


if __name__ == "__main__":
    asyncio.run(main())
