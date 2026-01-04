---
name: webapp-testing
aliases: [e2e, playwright, browser-testing, screenshots, ui-testing]
description: E2E and browser testing for RawDrive using Playwright MCP. Use for testing UI flows, verifying frontend functionality, debugging visual issues, and capturing screenshots.
---

# RawDrive E2E Testing

Browser-based testing for RawDrive using **Playwright MCP** integration.

> **For unit/integration tests**: See the `testing` skill (Vitest, pytest).

## Playwright MCP Tools

RawDrive has Playwright MCP configured. Use these tools directly:

| Tool | Purpose |
|------|---------|
| `mcp__playwright__browser_navigate` | Navigate to URL |
| `mcp__playwright__browser_snapshot` | Get accessibility tree (preferred over screenshot) |
| `mcp__playwright__browser_click` | Click elements |
| `mcp__playwright__browser_type` | Type into inputs |
| `mcp__playwright__browser_fill_form` | Fill multiple form fields |
| `mcp__playwright__browser_take_screenshot` | Capture screenshot |
| `mcp__playwright__browser_console_messages` | Get browser console logs |

## RawDrive Test URLs

| Environment | URL |
|-------------|-----|
| Local Frontend | `http://localhost:3000` |
| Local Backend | `http://localhost:8000` |
| Public Gallery | `http://localhost:3000/g/{slug}` |
| Workspace | `http://localhost:3000/workspace/{id}` |

## Common Test Flows

### 1. Login Flow

```typescript
// Navigate to login
await mcp__playwright__browser_navigate({ url: 'http://localhost:3000/login' });

// Fill login form
await mcp__playwright__browser_fill_form({
  fields: [
    { name: 'email', type: 'textbox', ref: 'email-input', value: 'test@example.com' },
    { name: 'password', type: 'textbox', ref: 'password-input', value: 'password123' }
  ]
});

// Click login button
await mcp__playwright__browser_click({ element: 'Login button', ref: 'login-submit' });

// Wait for redirect
await mcp__playwright__browser_wait_for({ text: 'Dashboard' });
```

### 2. Gallery View Test

```typescript
// Navigate to gallery
await mcp__playwright__browser_navigate({ url: 'http://localhost:3000/workspace/{id}/galleries/{id}' });

// Snapshot to verify content
await mcp__playwright__browser_snapshot({});

// Check for photo grid
await mcp__playwright__browser_click({ element: 'First photo', ref: 'photo-0' });

// Verify lightbox opens
await mcp__playwright__browser_snapshot({});
```

### 3. Public Gallery (No Auth)

```typescript
// Navigate to public gallery
await mcp__playwright__browser_navigate({ url: 'http://localhost:3000/g/wedding-2024' });

// Verify gallery loads
await mcp__playwright__browser_snapshot({});

// Test favorite button (client-side)
await mcp__playwright__browser_click({ element: 'Favorite button', ref: 'favorite-btn' });
```

### 4. Upload Flow

```typescript
// Navigate to upload page
await mcp__playwright__browser_navigate({ url: 'http://localhost:3000/workspace/{id}/upload' });

// Upload file
await mcp__playwright__browser_file_upload({
  paths: ['/path/to/test-image.jpg']
});

// Wait for upload completion
await mcp__playwright__browser_wait_for({ text: 'Upload complete' });
```

## Test Patterns

### Snapshot-First Approach

Always take a snapshot before interacting:

```typescript
// 1. Navigate
await mcp__playwright__browser_navigate({ url: 'http://localhost:3000/...' });

// 2. Snapshot to understand page structure
const snapshot = await mcp__playwright__browser_snapshot({});
// Examine snapshot to find correct element refs

// 3. Interact with discovered refs
await mcp__playwright__browser_click({ element: '...', ref: 'discovered-ref' });
```

### Wait for Dynamic Content

RawDrive uses React Query - content loads asynchronously:

```typescript
// Wait for specific text to appear
await mcp__playwright__browser_wait_for({ text: 'Gallery Name' });

// Or wait for loading to complete
await mcp__playwright__browser_wait_for({ textGone: 'Loading...' });
```

### Debug with Console Logs

```typescript
// Get console messages to debug issues
const logs = await mcp__playwright__browser_console_messages({ level: 'error' });
```

## Test Data (Seed Users)

RawDrive seeds test users. See `docs/TEST_USERS.md`:

| User | Email | Password | Workspace |
|------|-------|----------|-----------|
| Demo Photographer | demo@rawdrive.com | demo123 | Demo Studio |
| Test Admin | admin@rawdrive.com | admin123 | Admin Workspace |

## RawDrive-Specific Selectors

Common UI elements and their typical selectors:

| Element | Selector Pattern |
|---------|-----------------|
| App buttons | `[data-testid="btn-*"]` or by text |
| Photo cards | `.photo-card`, `[data-asset-id]` |
| Gallery grid | `.gallery-grid` |
| Modal dialogs | `[role="dialog"]` |
| Toast notifications | `[role="alert"]` |
| Navigation | `nav`, `[role="navigation"]` |

## Scripts (Legacy)

The skill includes helper scripts for standalone Playwright:

| Script | Purpose |
|--------|---------|
| `scripts/with_server.py` | Manages server lifecycle for standalone tests |

For most cases, prefer using **Playwright MCP tools** directly over scripts.

## Best Practices

### Do's
- Use `browser_snapshot` over `browser_take_screenshot` for understanding page structure
- Wait for content (`wait_for`) before assertions
- Test user flows, not implementation details
- Check console for errors after each navigation
- Use seed test users for authenticated flows

### Don'ts
- Don't interact with elements before confirming they exist (snapshot first)
- Don't hardcode workspace/gallery IDs (use test fixtures)
- Don't skip waiting for async content
- Don't leave browser open after tests
