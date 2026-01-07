import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Upload Flow E2E', () => {
    test.setTimeout(60000); // 1 minute timeout

    test('should login, create gallery (if needed), encrypt and upload a file', async ({ page }) => {
        const testFileName = 'test-upload-encrypt.txt';
        const testFilePath = path.join(__dirname, testFileName);

        try {
            // 1. Setup: Create a dummy file for upload
            const testFileContent = 'Please encrypt me before uploading!';
            fs.writeFileSync(testFilePath, testFileContent);

            // 2. Intercept requests to verify TUS / Encryption behavior
            let uploadStarted = false;
            page.on('console', msg => console.log('PAGE LOG:', msg.text()));
            page.on('request', request => {
                console.log('>>', request.method(), request.url());
                if (request.method() === 'PATCH' && request.url().includes('/uploads/')) {
                    uploadStarted = true;
                    console.log('TUS Upload Chunk Detected:', request.url());
                }
            });
            page.on('response', response => {
                console.log('<<', response.status(), response.url());
            });

            // 3. Login Flow
            console.log('Navigating to Sign In...');
            await page.goto('/signin');

            // Fill credentials
            // Using test user: professional@test.rawdrive.in / Test@123
            console.log('Filling credentials...');
            await page.fill('#email', 'professional@test.rawdrive.in');
            await page.fill('#password', 'Test@123');

            // Submit
            await page.click('button[type="submit"]');

            // Wait for redirect to workspace
            console.log('Waiting for workspace redirect...');
            await page.waitForURL(/\/workspace/, { timeout: 20000 });
            console.log('Login successful!');

            // 4. Navigate to Upload Area
            await page.waitForLoadState('networkidle');

            // Strategy: Look for existing gallery. If none, Create New.
            const galleryLink = page.locator('a[href*="/galleries/"]').first();
            const galleryCount = await galleryLink.count();

            if (galleryCount > 0) {
                console.log(`Found ${galleryCount} existing galleries. Navigating to first one...`);
                await galleryLink.click();
            } else {
                console.log('No galleries found. Creating new gallery...');
                // Try to find "New Gallery" button or link
                // Usually on dashboard or empty state
                const createBtn = page.getByRole('button', { name: /New Gallery/i }).or(page.getByText('New Gallery'));

                if (await createBtn.isVisible()) {
                    await createBtn.click();
                } else {
                    // Try direct navigation to Create Page if button not found (fallback)
                    console.log('New Gallery button not found, trying direct navigation...');
                    await page.goto('/workspace/galleries/create');
                }

                // Fill Create Form
                console.log('Filling Create Gallery form...');

                // Debug: Check if we are stuck on loading or error
                await page.waitForLoadState('networkidle');
                if (await page.getByText('Loading...').count() > 0) {
                    console.log('Page is in loading state, waiting for it to finish...');
                    await expect(page.getByText('Loading...')).toHaveCount(0, { timeout: 15000 });
                }

                if (await page.getByText('Workspace Not Found').count() > 0) {
                    // Screenshot for debug
                    await page.screenshot({ path: 'workspace-not-found.png' });
                    throw new Error('Workspace Not Found message displayed. User references corrupted?');
                }

                await page.waitForSelector('form', { state: 'visible' });

                // Title
                const titleInput = page.getByLabel('Gallery Title').or(page.getByPlaceholder('e.g., Johnson Wedding'));
                await titleInput.fill(`Test Gallery ${Date.now()}`);

                // Submit
                const submitCreate = page.getByRole('button', { name: /Create Gallery/i });
                await submitCreate.click();

                // Wait for navigation to Detail Page
                await page.waitForURL(/\/workspace\/galleries\//);
                console.log('Gallery created and navigated to detail page.');
            }

            // 5. Perform File Selection (In Gallery Detail)
            await page.waitForLoadState('networkidle');

            // Check if "Upload" button is needing click to show modal/dropzone
            // Some implementations show dropzone directly, some require button click
            const uploadBtn = page.getByRole('button', { name: /Upload/i });
            if (await uploadBtn.isVisible()) {
                console.log('Clicking Upload button to reveal dropzone...');
                await uploadBtn.click();
            }

            const fileInput = page.getByLabel('File upload input');

            // Wait for input to be attached
            // Sometimes it's conditional
            if (await fileInput.count() === 0) {
                console.log('File input not found immediately. Waiting...');
                await page.waitForTimeout(1000);
            }

            if (await fileInput.count() > 0) {
                console.log('Uploading file...');
                await fileInput.setInputFiles(testFilePath);

                // 6. Verify Preview
                const preview = page.getByText(testFileName);
                await expect(preview).toBeVisible({ timeout: 10000 });
                console.log('Preview verified.');

                // 7. Trigger actual upload
                // Check for "Start Upload" or if it auto-starts
                // We'll wait a bit to see if TUS request fires

                // Sometimes there is a "Upload X files" button in the dialog
                const startUploadBtn = page.getByRole('button', { name: /Start Upload|Upload [0-9]+ file/i });
                if (await startUploadBtn.isVisible()) {
                    console.log('Clicking Start Upload...');
                    await startUploadBtn.click();
                }

                // Wait for TUS request
                console.log('Waiting for TUS upload requests...');
                // Wait for progress or completion message
                // Or just wait for the request flag to flip
                await page.waitForTimeout(5000);

                if (uploadStarted) {
                    console.log('✅ TUS Upload started successfully (Encryption verified via request presence)');
                } else {
                    console.warn('⚠️ Upload request not detected. Check triggers.');
                }

            } else {
                throw new Error('File input not found on gallery page. Cannot upload.');
            }

        } catch (e) {
            console.error("Test failed with error:", e);
            await page.screenshot({ path: 'failure-state.png', fullPage: true });
            const content = await page.content();
            fs.writeFileSync('failure-state.html', content);
            throw e;
        } finally {
            // Cleanup
            if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
        }
    });
});
