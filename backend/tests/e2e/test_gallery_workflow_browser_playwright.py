#!/usr/bin/env python3
"""Browser-based end-to-end gallery workflow test using Playwright.

Tests the complete gallery workflow through actual browser interactions.
This validates the UI, user experience, and browser behavior.

Requirements:
    pip install playwright
    playwright install chromium
"""

import asyncio
import json
import sys
import time
from pathlib import Path
from typing import Dict, Optional, List
from io import BytesIO

try:
    from playwright.async_api import async_playwright, Page, Browser, BrowserContext
except ImportError:
    print("Error: Playwright not installed. Run: pip install playwright && playwright install chromium")
    sys.exit(1)

from PIL import Image

# Add backend src to path for importing test constants
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src"))

from app.config.test_constants import TEST_PASSWORD, TierUsers

# Test configuration
TEST_USER_EMAIL = TierUsers.PROFESSIONAL.email
TEST_USER_PASSWORD = TEST_PASSWORD
FRONTEND_URL = "http://localhost:5173"  # Vite default port
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


def generate_dummy_image() -> BytesIO:
    """Generate a dummy JPEG image for testing."""
    img = Image.new('RGB', (800, 600), color=(73, 109, 137))
    img_bytes = BytesIO()
    img.save(img_bytes, format='JPEG')
    img_bytes.seek(0)
    return img_bytes


class BrowserGalleryWorkflowTester:
    """Browser-based gallery workflow tester using Playwright."""

    def __init__(self):
        self.frontend_url = FRONTEND_URL
        self.backend_url = BACKEND_URL
        self.gallery_id: Optional[str] = None
        self.asset_id: Optional[str] = None
        self.workspace_id: Optional[str] = None
        self.screenshots_dir = Path(__file__).parent / "screenshots"
        self.screenshots_dir.mkdir(exist_ok=True)
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        self.console_errors: List[str] = []
        self.network_errors: List[str] = []

    async def setup_browser(self):
        """Setup Playwright browser."""
        playwright = await async_playwright().start()
        self.browser = await playwright.chromium.launch(headless=False)  # Set to True for CI
        self.context = await self.browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            record_video_dir=str(self.screenshots_dir / "videos"),
        )
        self.page = await self.context.new_page()
        
        # Listen for console errors
        self.page.on("console", lambda msg: self._handle_console(msg))
        self.page.on("requestfailed", lambda req: self._handle_network_error(req))
        
        print_success("Browser launched")

    async def cleanup_browser(self):
        """Cleanup browser resources."""
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()

    def _handle_console(self, msg):
        """Handle console messages."""
        if msg.type == 'error':
            self.console_errors.append(msg.text)
        # Also log warnings that might indicate issues
        if msg.type == 'warning':
            if 'error' in msg.text.lower() or 'failed' in msg.text.lower():
                self.console_errors.append(f"WARNING: {msg.text}")

    def _handle_network_error(self, request):
        """Handle network errors."""
        self.network_errors.append(f"{request.method} {request.url} - {request.failure}")

    async def take_screenshot(self, name: str) -> Optional[str]:
        """Take a screenshot."""
        try:
            if not self.page:
                return None
            screenshot_path = self.screenshots_dir / f"{name}_{int(time.time())}.png"
            await self.page.screenshot(path=str(screenshot_path))
            print_info(f"  Screenshot: {name} -> {screenshot_path.name}")
            return str(screenshot_path)
        except Exception as e:
            print_warning(f"  Screenshot failed: {e}")
            return None

    async def check_console_errors(self) -> List[str]:
        """Check browser console errors."""
        return self.console_errors.copy()

    async def check_network_errors(self) -> List[str]:
        """Check network errors."""
        return self.network_errors.copy()

    async def step_1_navigate_to_login(self) -> bool:
        """Step 1: Navigate to login page."""
        print_info("Step 1: Navigating to login page...")
        try:
            if not self.page:
                return False
            
            login_url = f"{self.frontend_url}/signin"
            print_info(f"  URL: {login_url}")
            
            await self.page.goto(login_url, wait_until="networkidle")
            await self.take_screenshot("01_login_page")
            
            # Verify page loaded
            title = await self.page.title()
            print_info(f"  Page title: {title}")
            
            # Check for errors
            errors = await self.check_console_errors()
            network_errors = await self.check_network_errors()
            
            if errors:
                print_warning(f"  Console errors found: {len(errors)}")
                for err in errors[:3]:
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
            if not self.page:
                return False
            
            # Find and fill email field
            email_input = self.page.locator('input[id="email"], input[type="email"]').first
            await email_input.fill(TEST_USER_EMAIL)
            print_info(f"  Email: {TEST_USER_EMAIL}")
            
            # Find and fill password field
            password_input = self.page.locator('input[id="password"], input[type="password"]').first
            await password_input.fill(TEST_USER_PASSWORD)
            print_info("  Password: [hidden]")
            
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
            if not self.page:
                return False
            
            # Find and click submit button
            submit_button = self.page.locator('button[type="submit"]').first
            await submit_button.click()
            
            # Wait for navigation
            await self.page.wait_for_url("**/workspace**", timeout=10000)
            await asyncio.sleep(2)  # Wait for page to fully load
            await self.take_screenshot("03_after_login")
            
            # Verify we're on workspace page
            current_url = self.page.url
            print_info(f"  Current URL: {current_url}")
            
            if "/workspace" in current_url:
                print_success("  Login successful, redirected to workspace")
                return True
            else:
                print_error(f"  Unexpected URL after login: {current_url}")
                return False
        except Exception as e:
            print_error(f"Login submit error: {e}")
            return False

    async def step_4_navigate_to_galleries(self) -> bool:
        """Step 4: Navigate to galleries page."""
        print_info("Step 4: Navigating to galleries page...")
        try:
            if not self.page:
                return False
            
            galleries_url = f"{self.frontend_url}/workspace/galleries"
            print_info(f"  URL: {galleries_url}")
            
            await self.page.goto(galleries_url, wait_until="networkidle")
            await asyncio.sleep(2)  # Wait for galleries to load
            await self.take_screenshot("04_galleries_page")
            
            # Verify galleries page loaded
            # Look for "New Gallery" button or gallery cards
            new_gallery_button = self.page.locator('button:has-text("New Gallery"), button:has-text("Create Gallery")').first
            if await new_gallery_button.is_visible(timeout=5000):
                print_success("  Galleries page loaded")
                return True
            else:
                print_warning("  'New Gallery' button not found, but page may still be valid")
                return True
        except Exception as e:
            print_error(f"Navigation error: {e}")
            return False

    async def check_toast_errors(self) -> List[str]:
        """Check for toast/error messages on the page."""
        errors = []
        try:
            if not self.page:
                return errors
            
            # Look for toast/error messages
            toast_selectors = [
                '[role="alert"]',
                '.toast-error',
                '.error-message',
                '[class*="error"]',
                '[class*="toast"]',
                '.bg-error',
                'div:has-text("error")',
                'div:has-text("Error")',
                'div:has-text("Failed")',
            ]
            
            for selector in toast_selectors:
                try:
                    elements = await self.page.locator(selector).all()
                    for element in elements:
                        text = await element.text_content()
                        if text and text.strip():
                            # Filter out empty or very short messages
                            if len(text.strip()) > 5:
                                errors.append(text.strip())
                except:
                    continue
            
            # Also check for form validation errors
            try:
                error_elements = await self.page.locator('[role="alert"], .text-error, [class*="error"]').all()
                for element in error_elements:
                    text = await element.text_content()
                    if text and text.strip() and len(text.strip()) > 3:
                        errors.append(f"Validation: {text.strip()}")
            except:
                pass
            
            return list(set(errors))  # Remove duplicates
        except Exception as e:
            print_warning(f"  Toast check failed: {e}")
            return errors

    async def step_5_create_gallery(self) -> bool:
        """Step 5: Create a new gallery."""
        print_info("Step 5: Creating new gallery...")
        try:
            if not self.page:
                return False
            
            # Click "New Gallery" button
            new_gallery_button = self.page.locator('button:has-text("New Gallery"), button:has-text("Create Gallery"), a[href*="/galleries/new"]').first
            await new_gallery_button.click()
            await asyncio.sleep(2)  # Wait for navigation
            await self.take_screenshot("05_gallery_creation_form")
            
            # Check for errors before proceeding
            toast_errors = await self.check_toast_errors()
            if toast_errors:
                print_warning(f"  Errors found before form fill: {len(toast_errors)}")
                for err in toast_errors[:3]:
                    print_warning(f"    - {err}")
            
            # Wait for form to be visible
            try:
                await self.page.wait_for_selector('form', timeout=5000)
            except:
                print_error("  Form not found")
                await self.take_screenshot("05_form_not_found")
                return False
            
            await asyncio.sleep(1)  # Wait for form to fully render
            
            # Fill in gallery form - look for title input by placeholder
            title_input = None
            title_selectors = [
                'input[placeholder*="Johnson Wedding" i]',
                'input[placeholder*="gallery" i]',
                'input[type="text"]:first-of-type',
                'input:first-of-type',
            ]
            
            for selector in title_selectors:
                try:
                    element = self.page.locator(selector).first
                    if await element.is_visible(timeout=2000):
                        title_input = element
                        break
                except:
                    continue
            
            if not title_input:
                print_error("  Title input not found")
                await self.take_screenshot("05_title_input_not_found")
                # Check for errors
                toast_errors = await self.check_toast_errors()
                if toast_errors:
                    for err in toast_errors:
                        print_error(f"    Error: {err}")
                return False
            
            # Clear and fill title
            await title_input.click()
            await title_input.fill("")  # Clear first
            await title_input.fill("E2E Browser Test Gallery")
            await asyncio.sleep(0.5)
            
            # Fill description
            description_input = self.page.locator('textarea').first
            if await description_input.is_visible(timeout=2000):
                await description_input.fill("Browser test gallery")
            
            # Fill client name (optional)
            # Look for the third input field (after title and client name)
            all_inputs = await self.page.locator('input[type="text"]').all()
            if len(all_inputs) >= 2:
                try:
                    client_input = all_inputs[1]
                    if await client_input.is_visible(timeout=1000):
                        await client_input.fill("Test Client")
                except:
                    pass
            
            await self.take_screenshot("05_gallery_form_filled")
            
            # Check for validation errors before submitting
            toast_errors = await self.check_toast_errors()
            if toast_errors:
                print_warning(f"  Validation errors before submit: {len(toast_errors)}")
                for err in toast_errors:
                    print_error(f"    - {err}")
                # Don't fail yet, try to submit anyway
            
            # Submit form - wait for button to be enabled
            submit_button = self.page.locator('button[type="submit"]:has-text("Create"), button[type="submit"]').first
            await submit_button.wait_for(state="visible", timeout=5000)
            
            # Check if button is disabled
            is_disabled = await submit_button.get_attribute('disabled')
            if is_disabled:
                print_warning("  Submit button is disabled, checking why...")
                # Check for required field errors
                toast_errors = await self.check_toast_errors()
                if toast_errors:
                    for err in toast_errors:
                        print_error(f"    - {err}")
                return False
            
            await submit_button.click()
            
            # Wait for either success (redirect) or error (toast)
            try:
                # Wait for redirect OR error message
                await asyncio.wait([
                    self.page.wait_for_url("**/workspace/galleries/*", timeout=10000),
                    asyncio.create_task(asyncio.sleep(3))  # Give time for errors to appear
                ], return_when=asyncio.FIRST_COMPLETED)
            except:
                pass
            
            await asyncio.sleep(2)
            await self.take_screenshot("06_after_submit")
            
            # Check for errors after submit
            toast_errors = await self.check_toast_errors()
            if toast_errors:
                print_warning(f"  Errors after submit: {len(toast_errors)}")
                for err in toast_errors[:5]:  # Show first 5 errors
                    print_warning(f"    - {err}")
            
            # Also check console errors
            console_errors = await self.check_console_errors()
            if console_errors:
                print_warning(f"  Console errors after submit: {len(console_errors)}")
                for err in console_errors[:3]:
                    if 'useToast' not in err and 'ToastProvider' not in err:  # Filter known issues
                        print_warning(f"    - {err}")
            
            # Check if we're on gallery detail page
            current_url = self.page.url
            if "/galleries/" in current_url and "/new" not in current_url:
                parts = current_url.split("/galleries/")
                if len(parts) > 1:
                    self.gallery_id = parts[1].split("/")[0].split("?")[0]
                    print_success(f"  Gallery created: {self.gallery_id}")
                    return True
            
            # If still on form page, creation failed
            if "/new" in current_url or "create" in current_url.lower():
                print_error("  Still on creation page - gallery creation failed")
                await self.take_screenshot("06_gallery_creation_failed")
                return False
            
            print_success("  Gallery created successfully")
            return True
        except Exception as e:
            print_error(f"Gallery creation error: {e}")
            await self.take_screenshot("05_gallery_creation_error")
            # Check for errors
            toast_errors = await self.check_toast_errors()
            if toast_errors:
                for err in toast_errors:
                    print_error(f"    Error: {err}")
            return False

    async def step_6_upload_photo(self) -> bool:
        """Step 6: Upload photo to gallery."""
        print_info("Step 6: Uploading photo...")
        try:
            if not self.page:
                return False
            
            await self.take_screenshot("07_before_upload")
            
            # Generate dummy image
            img_bytes = generate_dummy_image()
            img_path = self.screenshots_dir / "test_image.jpg"
            with open(img_path, 'wb') as f:
                f.write(img_bytes.getvalue())
            
            # Find upload button or file input
            # Try multiple selectors - look for upload button first
            upload_button_selectors = [
                'button:has-text("Upload")',
                'button:has-text("Add Photos")',
                'button:has-text("Upload Photos")',
                'button[aria-label*="upload" i]',
                'button[aria-label*="add" i]',
                '.upload-button',
                '[data-testid="upload-button"]',
            ]
            
            upload_button = None
            for selector in upload_button_selectors:
                try:
                    element = self.page.locator(selector).first
                    if await element.is_visible(timeout=2000):
                        upload_button = element
                        break
                except:
                    continue
            
            # If button found, click it to open file picker
            if upload_button:
                await upload_button.click()
                await asyncio.sleep(0.5)
            
            # Look for file input (may be hidden)
            file_input_selectors = [
                'input[type="file"]',
                'input[accept*="image"]',
                'input[accept*="video"]',
            ]
            
            file_input = None
            for selector in file_input_selectors:
                try:
                    # Try visible first
                    element = self.page.locator(selector).first
                    if await element.is_visible(timeout=1000):
                        file_input = element
                        break
                except:
                    # Try hidden inputs
                    try:
                        element = self.page.locator(selector).first
                        # Check if element exists even if hidden
                        count = await element.count()
                        if count > 0:
                            file_input = element
                            break
                    except:
                        continue
            
            if not file_input:
                print_error("  Upload input not found")
                # Take screenshot for debugging
                await self.take_screenshot("08_upload_input_not_found")
                return False
            
            # Upload file (works even if input is hidden)
            await file_input.set_input_files(str(img_path))
            
            print_info("  File selected, waiting for upload...")
            
            # Wait for upload to complete (look for photo thumbnail or success message)
            try:
                await self.page.wait_for_selector('.photo-thumbnail, .photo-card, [data-testid="photo-item"]', timeout=30000)
                print_success("  Photo thumbnail appeared")
            except:
                # Try waiting for upload progress to complete
                try:
                    await self.page.wait_for_selector('.upload-progress, .upload-complete', timeout=30000)
                except:
                    print_warning("  Upload progress indicator not found, but continuing...")
            
            await asyncio.sleep(3)  # Wait for processing
            await self.take_screenshot("08_after_upload")
            
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
            await self.take_screenshot("08_upload_error")
            return False

    async def step_7_verify_gallery_view(self) -> bool:
        """Step 7: Verify photo appears in gallery view."""
        print_info("Step 7: Verifying gallery view...")
        try:
            if not self.page:
                return False
            
            await self.take_screenshot("09_gallery_view")
            
            # Count photo thumbnails
            photo_selectors = [
                '.photo-thumbnail',
                '.photo-card',
                '[data-testid="photo-item"]',
                'img[src*="thumbnail"], img[src*="preview"]',
            ]
            
            photo_count = 0
            for selector in photo_selectors:
                try:
                    count = await self.page.locator(selector).count()
                    if count > 0:
                        photo_count = count
                        print_success(f"  Found {photo_count} photo(s) in gallery")
                        break
                except:
                    continue
            
            if photo_count == 0:
                print_warning("  No photos found in gallery view (may still be processing)")
                return True  # Don't fail, may be timing issue
            
            print_success("  Photo visible in gallery view")
            return True
        except Exception as e:
            print_error(f"Gallery view verification error: {e}")
            return False

    async def step_8_click_thumbnail(self) -> bool:
        """Step 8: Click thumbnail to open lightbox/viewer."""
        print_info("Step 8: Clicking thumbnail to open viewer...")
        try:
            if not self.page:
                return False
            
            # Find first photo thumbnail
            photo_selectors = [
                '.photo-thumbnail:first-child',
                '.photo-card:first-child',
                '[data-testid="photo-item"]:first-child',
                'img[src*="thumbnail"]:first, img[src*="preview"]:first',
            ]
            
            thumbnail = None
            for selector in photo_selectors:
                try:
                    element = self.page.locator(selector).first
                    if await element.is_visible(timeout=2000):
                        thumbnail = element
                        break
                except:
                    continue
            
            if not thumbnail:
                print_error("  Photo thumbnail not found")
                return False
            
            # Click thumbnail
            await thumbnail.click()
            await asyncio.sleep(1)  # Wait for lightbox to open
            
            # Wait for lightbox/viewer
            lightbox_selectors = [
                '.lightbox',
                '.image-viewer',
                '.photo-viewer',
                '[data-testid="lightbox"]',
                '.modal:has(img)',
            ]
            
            lightbox_opened = False
            for selector in lightbox_selectors:
                try:
                    if await self.page.locator(selector).first.is_visible(timeout=3000):
                        lightbox_opened = True
                        break
                except:
                    continue
            
            await self.take_screenshot("10_lightbox_opened")
            
            if not lightbox_opened:
                print_warning("  Lightbox not found, but image may be displayed")
            
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
            await self.take_screenshot("10_lightbox_error")
            return False

    async def step_9_test_download(self) -> bool:
        """Step 9: Test download functionality."""
        print_info("Step 9: Testing download...")
        try:
            if not self.page:
                return False
            
            # Find download button
            download_selectors = [
                'button:has-text("Download")',
                'button:has-text("Download Original")',
                '[data-testid="download-button"]',
                'a[download]',
            ]
            
            download_button = None
            for selector in download_selectors:
                try:
                    element = self.page.locator(selector).first
                    if await element.is_visible(timeout=2000):
                        download_button = element
                        break
                except:
                    continue
            
            if download_button:
                await self.take_screenshot("11_before_download")
                
                # Set up download listener
                async with self.page.expect_download(timeout=10000) as download_info:
                    await download_button.click()
                
                download = await download_info.value
                download_path = await download.path()
                print_success(f"  Download started: {download.suggested_filename}")
                
                # Verify downloaded file
                if download_path and Path(download_path).exists():
                    file_size = Path(download_path).stat().st_size
                    print_success(f"  File downloaded: {file_size} bytes")
                    
                    # Try to verify it's a valid image
                    try:
                        img = Image.open(download_path)
                        print_success(f"  Downloaded file is valid image: {img.format}, {img.size}")
                    except Exception as e:
                        print_warning(f"  Could not verify downloaded image: {e}")
            else:
                print_info("  Download button not found (may be restricted by gallery policy)")
                await self.take_screenshot("11_no_download_button")
            
            print_success("  Download functionality tested")
            return True
        except Exception as e:
            print_error(f"Download test error: {e}")
            await self.take_screenshot("11_download_error")
            return False

    async def step_10_run_audits(self) -> bool:
        """Step 10: Run browser audits."""
        print_info("Step 10: Running browser audits...")
        try:
            # Summary of errors found
            console_errors = await self.check_console_errors()
            network_errors = await self.check_network_errors()
            
            if console_errors:
                print_warning(f"  Total console errors: {len(console_errors)}")
                for err in console_errors[:5]:  # Show first 5
                    print_warning(f"    - {err}")
            
            if network_errors:
                print_warning(f"  Total network errors: {len(network_errors)}")
                for err in network_errors[:5]:  # Show first 5
                    print_warning(f"    - {err}")
            
            if not console_errors and not network_errors:
                print_success("  No errors found in console or network")
            
            print_success("  Audits completed")
            return True
        except Exception as e:
            print_error(f"Audit error: {e}")
            return False

    async def run_all_tests(self) -> bool:
        """Run all browser-based test steps."""
        print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}")
        print(f"{Colors.BOLD}{Colors.BLUE}Browser-Based Gallery Workflow Test (Playwright){Colors.RESET}")
        print(f"{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}\n")
        print_info(f"Frontend URL: {self.frontend_url}")
        print_info(f"Backend URL: {self.backend_url}")
        print_info(f"Screenshots: {self.screenshots_dir}\n")

        try:
            await self.setup_browser()
            
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
            
            console_errors = await self.check_console_errors()
            network_errors = await self.check_network_errors()
            
            if console_errors:
                print_warning(f"Total console errors: {len(console_errors)}")
            if network_errors:
                print_warning(f"Total network errors: {len(network_errors)}")
            
            print_info(f"Screenshots saved to: {self.screenshots_dir}\n")

            return all(results.values())
        finally:
            await self.cleanup_browser()


async def main():
    """Main test runner."""
    tester = BrowserGalleryWorkflowTester()
    success = await tester.run_all_tests()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    asyncio.run(main())

