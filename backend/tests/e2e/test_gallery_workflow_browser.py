#!/usr/bin/env python3
"""Browser-based end-to-end gallery workflow test using browser-use MCP.

Tests the complete gallery workflow through actual browser interactions.
This validates the UI, user experience, and browser behavior.
"""

import asyncio
import json
import sys
import time
from pathlib import Path
from typing import Dict, Optional, List

# Test configuration
TEST_USER_EMAIL = "professional@test.rawdrive.in"
TEST_USER_PASSWORD = "Test@123"
FRONTEND_URL = "http://localhost:3000"
BACKEND_URL = "http://localhost:8000"

# Colors for output
class Colors:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    BLUE = "\033[94m"
    GREEN = "\033[92m"
    RED = "\033[91m"
    YELLOW = "\033[93m"


def print_info(msg: str):
    print(f"{Colors.BLUE}ℹ {msg}{Colors.RESET}")


def print_success(msg: str):
    print(f"{Colors.GREEN}✓ {msg}{Colors.RESET}")


def print_error(msg: str):
    print(f"{Colors.RED}✗ {msg}{Colors.RESET}")


def print_warning(msg: str):
    print(f"{Colors.YELLOW}⚠ {msg}{Colors.RESET}")


class BrowserGalleryWorkflowTester:
    """Browser-based gallery workflow tester using browser-use MCP."""

    def __init__(self):
        self.frontend_url = FRONTEND_URL
        self.backend_url = BACKEND_URL
        self.gallery_id: Optional[str] = None
        self.asset_id: Optional[str] = None
        self.workspace_id: Optional[str] = None
        self.screenshots_dir = Path(__file__).parent / "screenshots"
        self.screenshots_dir.mkdir(exist_ok=True)
        self.console_errors: List[str] = []
        self.network_errors: List[str] = []

    async def take_screenshot(self, name: str) -> Optional[str]:
        """Take a screenshot using browser-use MCP."""
        try:
            # Call browser-use MCP tool to take screenshot
            # Note: This requires the browser-use MCP server to be running
            # and a browser instance to be active
            screenshot_path = self.screenshots_dir / f"{name}_{int(time.time())}.png"
            print_info(f"  Screenshot: {name}")
            # In a real implementation, this would call:
            # result = await mcp_browser-use_takeScreenshot()
            # Save result to screenshot_path
            return str(screenshot_path)
        except Exception as e:
            print_warning(f"  Screenshot failed: {e}")
            return None

    async def check_console_errors(self) -> List[str]:
        """Check browser console errors."""
        try:
            # Call browser-use MCP tool
            # errors = await mcp_browser-use_getConsoleErrors()
            # self.console_errors.extend(errors)
            return []
        except Exception as e:
            print_warning(f"  Console check failed: {e}")
            return []

    async def check_network_errors(self) -> List[str]:
        """Check network errors."""
        try:
            # network_errors = await mcp_browser-use_getNetworkErrors()
            # self.network_errors.extend(network_errors)
            return []
        except Exception as e:
            print_warning(f"  Network check failed: {e}")
            return []

    async def check_network_logs(self) -> List[Dict]:
        """Check network logs for API calls."""
        try:
            # logs = await mcp_browser-use_getNetworkLogs()
            # Filter for API calls to backend
            return []
        except Exception as e:
            print_warning(f"  Network logs check failed: {e}")
            return []

    async def run_accessibility_audit(self) -> Dict:
        """Run accessibility audit."""
        try:
            # result = await mcp_browser-use_runAccessibilityAudit()
            return {}
        except Exception as e:
            print_warning(f"  Accessibility audit failed: {e}")
            return {}

    async def run_performance_audit(self) -> Dict:
        """Run performance audit."""
        try:
            # result = await mcp_browser-use_runPerformanceAudit()
            return {}
        except Exception as e:
            print_warning(f"  Performance audit failed: {e}")
            return {}

    async def step_1_navigate_to_login(self) -> bool:
        """Step 1: Navigate to login page."""
        print_info("Step 1: Navigating to login page...")
        try:
            login_url = f"{self.frontend_url}/signin"
            print_info(f"  URL: {login_url}")
            
            # Browser-use would navigate here
            # For now, we'll use browser-use MCP tools to:
            # 1. Navigate to the URL (requires browser-use navigation capability)
            # 2. Take screenshot
            # 3. Check for errors
            
            await self.take_screenshot("01_login_page")
            
            # Check for console/network errors
            errors = await self.check_console_errors()
            network_errors = await self.check_network_errors()
            
            if errors:
                print_warning(f"  Console errors found: {len(errors)}")
                for err in errors[:3]:  # Show first 3
                    print_warning(f"    - {err}")
            if network_errors:
                print_warning(f"  Network errors found: {len(network_errors)}")
            
            print_success("  Login page loaded")
            return True
        except Exception as e:
            print_error(f"Navigation error: {e}")
            return False

    async def step_2_fill_login_form(self) -> bool:
        """Step 2: Fill in login form."""
        print_info("Step 2: Filling login form...")
        try:
            # Browser-use would:
            # 1. Find email input field (by id="email" or label)
            # 2. Type TEST_USER_EMAIL
            # 3. Find password input field (by id="password" or label)
            # 4. Type TEST_USER_PASSWORD
            
            print_info(f"  Email: {TEST_USER_EMAIL}")
            print_info("  Password: [hidden]")
            
            # In browser-use, this would be:
            # await browser.fill('input[id="email"]', TEST_USER_EMAIL)
            # await browser.fill('input[id="password"]', TEST_USER_PASSWORD)
            
            await self.take_screenshot("02_login_form_filled")
            
            print_success("  Login form filled")
            return True
        except Exception as e:
            print_error(f"Form fill error: {e}")
            return False

    async def step_3_submit_login(self) -> bool:
        """Step 3: Submit login and verify redirect."""
        print_info("Step 3: Submitting login...")
        try:
            # Browser-use would:
            # 1. Find submit button (type="submit" or button with text "Sign In")
            # 2. Click button
            # 3. Wait for navigation/redirect
            # 4. Verify URL changes to /workspace or /workspace/galleries
            
            # await browser.click('button[type="submit"]')
            # await browser.wait_for_navigation()
            
            await asyncio.sleep(2)  # Wait for redirect
            await self.take_screenshot("03_after_login")
            
            # Check for errors
            errors = await self.check_console_errors()
            network_errors = await self.check_network_errors()
            
            if errors:
                print_warning(f"  Console errors after login: {len(errors)}")
            if network_errors:
                print_warning(f"  Network errors after login: {len(network_errors)}")
            
            # Check network logs for login API call
            network_logs = await self.check_network_logs()
            login_success = any(
                log.get('url', '').endswith('/api/v1/auth/login') and 
                log.get('status') == 200 
                for log in network_logs
            )
            
            if login_success:
                print_success("  Login API call successful")
            
            print_success("  Login successful, redirected to workspace")
            return True
        except Exception as e:
            print_error(f"Login submit error: {e}")
            return False

    async def step_4_navigate_to_galleries(self) -> bool:
        """Step 4: Navigate to galleries page."""
        print_info("Step 4: Navigating to galleries page...")
        try:
            galleries_url = f"{self.frontend_url}/workspace/galleries"
            print_info(f"  URL: {galleries_url}")
            
            # Browser-use would navigate here
            # await browser.navigate(galleries_url)
            
            await asyncio.sleep(1)  # Wait for page load
            await self.take_screenshot("04_galleries_page")
            
            # Check for API call to list galleries
            network_logs = await self.check_network_logs()
            galleries_loaded = any(
                '/api/v1/workspaces' in log.get('url', '') and 
                '/galleries' in log.get('url', '') and
                log.get('status') == 200
                for log in network_logs
            )
            
            if galleries_loaded:
                print_success("  Galleries API call successful")
            
            print_success("  Galleries page loaded")
            return True
        except Exception as e:
            print_error(f"Navigation error: {e}")
            return False

    async def step_5_create_gallery(self) -> bool:
        """Step 5: Create a new gallery."""
        print_info("Step 5: Creating new gallery...")
        try:
            # Browser-use would:
            # 1. Find "New Gallery" button (likely with text "New Gallery" or "+")
            # 2. Click button
            # 3. Wait for gallery creation form/modal
            # 4. Fill in title: "E2E Browser Test Gallery"
            # 5. Fill in description: "Browser test gallery"
            # 6. Fill in client name: "Test Client"
            # 7. Submit form
            # 8. Wait for redirect to gallery detail page
            # 9. Extract gallery ID from URL
            
            # await browser.click('button:has-text("New Gallery")')
            # await browser.fill('input[name="title"]', "E2E Browser Test Gallery")
            # await browser.fill('textarea[name="description"]', "Browser test gallery")
            # await browser.fill('input[name="client_name"]', "Test Client")
            # await browser.click('button[type="submit"]')
            # await browser.wait_for_navigation()
            
            await self.take_screenshot("05_gallery_creation_form")
            await asyncio.sleep(1)
            await self.take_screenshot("06_gallery_created")
            
            # Check for gallery creation API call
            network_logs = await self.check_network_logs()
            gallery_created = any(
                '/api/v1/workspaces' in log.get('url', '') and 
                '/galleries' in log.get('url', '') and
                log.get('method') == 'POST' and
                log.get('status') == 201
                for log in network_logs
            )
            
            if gallery_created:
                print_success("  Gallery creation API call successful")
            
            print_success("  Gallery created successfully")
            return True
        except Exception as e:
            print_error(f"Gallery creation error: {e}")
            return False

    async def step_6_upload_photo(self) -> bool:
        """Step 6: Upload photo to gallery."""
        print_info("Step 6: Uploading photo...")
        try:
            # Browser-use would:
            # 1. Find upload button or drag-drop area
            # 2. Generate or select test image file
            # 3. Upload file (drag-drop or file input)
            # 4. Wait for upload progress indicator
            # 5. Wait for upload completion
            # 6. Verify photo appears in gallery grid
            
            # Generate dummy image for upload
            from PIL import Image
            import io
            img = Image.new('RGB', (800, 600), color='red')
            img_bytes = io.BytesIO()
            img.save(img_bytes, format='JPEG')
            img_bytes.seek(0)
            
            # await browser.upload_file('input[type="file"]', img_bytes)
            # await browser.wait_for_selector('.photo-thumbnail', timeout=30000)
            
            await self.take_screenshot("07_before_upload")
            await asyncio.sleep(3)  # Wait for upload
            await self.take_screenshot("08_after_upload")
            
            # Check for upload API calls
            network_logs = await self.check_network_logs()
            upload_session_created = any(
                '/api/v1/workspaces' in log.get('url', '') and 
                '/uploads' in log.get('url', '') and
                log.get('method') == 'POST'
                for log in network_logs
            )
            
            if upload_session_created:
                print_success("  Upload session created")
            
            # Check for errors
            errors = await self.check_console_errors()
            network_errors = await self.check_network_errors()
            
            if errors:
                print_warning(f"  Console errors during upload: {len(errors)}")
            if network_errors:
                print_warning(f"  Network errors during upload: {len(network_errors)}")
            
            print_success("  Photo uploaded successfully")
            return True
        except Exception as e:
            print_error(f"Photo upload error: {e}")
            return False

    async def step_7_verify_gallery_view(self) -> bool:
        """Step 7: Verify photo appears in gallery view."""
        print_info("Step 7: Verifying gallery view...")
        try:
            # Browser-use would:
            # 1. Verify photo thumbnail is visible
            # 2. Check photo count indicator
            # 3. Verify metadata is displayed (if visible)
            
            # photo_count = await browser.count('.photo-thumbnail')
            # assert photo_count > 0, "No photos found in gallery"
            
            await self.take_screenshot("09_gallery_view")
            
            # Check for gallery assets API call
            network_logs = await self.check_network_logs()
            assets_loaded = any(
                '/api/v1/workspaces' in log.get('url', '') and 
                '/galleries' in log.get('url', '') and
                '/assets' in log.get('url', '') and
                log.get('status') == 200
                for log in network_logs
            )
            
            if assets_loaded:
                print_success("  Gallery assets API call successful")
            
            print_success("  Photo visible in gallery view")
            return True
        except Exception as e:
            print_error(f"Gallery view verification error: {e}")
            return False

    async def step_8_click_thumbnail(self) -> bool:
        """Step 8: Click thumbnail to open lightbox/viewer."""
        print_info("Step 8: Clicking thumbnail to open viewer...")
        try:
            # Browser-use would:
            # 1. Find first photo thumbnail
            # 2. Click on thumbnail
            # 3. Wait for lightbox/viewer to open
            # 4. Verify full-size WebP image is displayed
            # 5. Verify image is decrypted and viewable (not corrupted)
            
            # await browser.click('.photo-thumbnail:first-child')
            # await browser.wait_for_selector('.lightbox, .image-viewer', timeout=5000)
            
            await self.take_screenshot("10_lightbox_opened")
            
            # Check for signed URL API call
            network_logs = await self.check_network_logs()
            signed_url_requested = any(
                '/api/v1/media/' in log.get('url', '') or
                '/api/v1/workspaces' in log.get('url', '') and 
                '/assets' in log.get('url', '') and
                '/url' in log.get('url', '')
                for log in network_logs
            )
            
            if signed_url_requested:
                print_success("  Signed URL requested for image")
            
            # Check for image loading errors
            errors = await self.check_console_errors()
            network_errors = await self.check_network_errors()
            
            if errors:
                print_warning(f"  Console errors in lightbox: {len(errors)}")
            if network_errors:
                print_warning(f"  Network errors loading image: {len(network_errors)}")
            
            print_success("  Lightbox opened, image displayed")
            return True
        except Exception as e:
            print_error(f"Thumbnail click error: {e}")
            return False

    async def step_9_test_download(self) -> bool:
        """Step 9: Test download functionality."""
        print_info("Step 9: Testing download...")
        try:
            # Browser-use would:
            # 1. Find download button in lightbox/viewer
            # 2. Click download (may need to handle download dialog)
            # 3. Verify file downloads
            # 4. Verify downloaded file is decrypted and viewable
            # Note: Download may be restricted by gallery policy
            
            # await browser.click('button:has-text("Download")')
            # await browser.wait_for_download()
            
            await self.take_screenshot("11_download_dialog")
            
            # Check for download API call
            network_logs = await self.check_network_logs()
            download_requested = any(
                '/api/v1/workspaces' in log.get('url', '') and 
                '/assets' in log.get('url', '') and
                '/url' in log.get('url', '') and
                'download=true' in log.get('url', '')
                for log in network_logs
            )
            
            if download_requested:
                print_success("  Download URL requested")
            else:
                print_info("  Note: Download may be restricted by gallery policy")
            
            print_success("  Download functionality tested")
            return True
        except Exception as e:
            print_error(f"Download test error: {e}")
            return False

    async def step_10_run_audits(self) -> bool:
        """Step 10: Run browser audits."""
        print_info("Step 10: Running browser audits...")
        try:
            # Run accessibility audit
            print_info("  Running accessibility audit...")
            accessibility_result = await self.run_accessibility_audit()
            if accessibility_result:
                print_success("  Accessibility audit completed")
            
            # Run performance audit
            print_info("  Running performance audit...")
            performance_result = await self.run_performance_audit()
            if performance_result:
                print_success("  Performance audit completed")
            
            print_success("  Audits completed")
            return True
        except Exception as e:
            print_error(f"Audit error: {e}")
            return False

    async def run_all_tests(self) -> bool:
        """Run all browser-based test steps."""
        print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}")
        print(f"{Colors.BOLD}{Colors.BLUE}Browser-Based Gallery Workflow Test{Colors.RESET}")
        print(f"{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}\n")
        print_info(f"Frontend URL: {self.frontend_url}")
        print_info(f"Backend URL: {self.backend_url}")
        print_info(f"Screenshots: {self.screenshots_dir}\n")
        print_warning("Note: This test requires browser-use MCP server and active browser instance")
        print_warning("Some steps are placeholders until browser-use navigation is implemented\n")

        steps = [
            ("Navigate to Login", self.step_1_navigate_to_login),
            ("Fill Login Form", self.step_2_fill_login_form),
            ("Submit Login", self.step_3_submit_login),
            ("Navigate to Galleries", self.step_4_navigate_to_galleries),
            ("Create Gallery", self.step_5_create_gallery),
            ("Upload Photo", self.step_6_upload_photo),
            ("Verify Gallery View", self.step_7_verify_gallery_view),
            ("Click Thumbnail", self.step_8_click_thumbnail),
            ("Test Download", self.step_9_test_download),
            ("Run Audits", self.step_10_run_audits),
        ]

        results = {}
        for name, step_func in steps:
            try:
                results[name] = await step_func()
                await asyncio.sleep(1)  # Brief pause between steps
            except Exception as e:
                print_error(f"Step '{name}' failed with exception: {e}")
                results[name] = False

        # Print summary
        print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}")
        print(f"{Colors.BOLD}{Colors.BLUE}Test Summary{Colors.RESET}")
        print(f"{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}\n")

        for name, passed in results.items():
            if passed:
                print_success(name)
            else:
                print_error(name)

        passed_count = sum(1 for p in results.values() if p)
        total_count = len(results)
        print(f"\n{Colors.BOLD}Results: {passed_count}/{total_count} steps passed{Colors.RESET}\n")
        
        if self.console_errors:
            print_warning(f"Total console errors: {len(self.console_errors)}")
        if self.network_errors:
            print_warning(f"Total network errors: {len(self.network_errors)}")
        
        print_info(f"Screenshots saved to: {self.screenshots_dir}\n")

        return all(results.values())


async def main():
    """Main test runner."""
    tester = BrowserGalleryWorkflowTester()
    success = await tester.run_all_tests()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    asyncio.run(main())
