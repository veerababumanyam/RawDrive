# Technical Requirements: CLI Tooling & Automation

**Document Status:** Setera Standard v1.1 (2026 Ready)  
**Ownership:** Backend Infrastructure / Developer Experience (DX)  
**Technology:** Go (Cobra, Viper), OAuth2 (PKCE), TUS Client (Go)

---

## 1. Product Mission
Empower professional studios and power users with a "Headless" interface for RawDrive. The `rawdrive` CLI is designed for high-concurrency bulk operations, seamless gallery synchronization, and automated developer workflows that outpace traditional browser-based interactions.

## 2. CLI Architecture & Core Commands

### 2.1 The `rawdrive` Binary
- **Language:** Go (statically linked for Linux, macOS, and Windows).
- **Configuration:** Stored in `~/.rawdrive/config.yaml`.
- **Framework:** **Cobra** for command structuring and **Viper** for configuration management.
- **UI/UX:** Use of **Pterm** for high-quality terminal visuals (spinners, progress bars, interactive selects).

### 2.2 Functional Command Set

| Command | Action | Description |
| :--- | :--- | :--- |
| `rawdrive auth login` | OAuth2 (PKCE) | Opens browser for secure authentication; saves tokens locally. |
| `rawdrive auth logout` | Revoke Tokens | Purges local credentials and expires session. |
| `rawdrive upload ./dir` | TUS Bulk Ingest | Recursively uploads media using resumable chunks. |
| `rawdrive gallery list` | Read Metadata | Lists all active galleries with status and view counts. |
| `rawdrive gallery sync` | Delta Update | Synchronizes local folder changes with a remote gallery. |
| `rawdrive report billing` | Data Export | Generates a CSV/JSON report of GST and revenue metrics. |
| `rawdrive doctor` | Health Check | Connectivity, API status, and environment audit. |

---

## 3. Bulk Ingestion Engine (CLI-First)

### 3.1 High-Performance Uploads
- **Concurrent Workers:** Default to 4 parallel uploads, configurable via flag `--workers 8`.
- **TUS 1.0.0 Support:** Native Go TUS client for robust handling of large RAW/Video binary files.
- **Deduplication Check:** SHA-256 hashing of local files before upload to prevent duplicate storage writes in R2.

### 3.2 Resilience & Logging
- **Persistent State:** If an upload is interrupted, the CLI resumes automatically on the next run using stored TUS offsets.
- **Verbose Output:** Support for `--debug` flag to trace API requests and network latency.

---

## 4. Developer Automation & Webhooks

### 4.1 Local Webhook Testing
- **`rawdrive dev listen`:** Forwards production webhook events to a local development server (similar to Stripe CLI).
- **HMAC Verification:** Automated check of payload signatures to ensure local parity with production.

### 4.2 API Key Management
- **`rawdrive keys create`:** Provision scoped API keys for server-to-server integrations (e.g., automated Lightroom exports).

---

## 5. Security & Trust (CLI)
- **Token Storage:** Credentials stored in OS-level secret stores (Keychain on macOS/Windows Credential Manager) where possible, or encrypted local files.
- **Scope Limitation:** Interactive login should follow the "Least Privilege" principle, prompting the user for specific permission scopes.
- **Binary Integrity:** Every release must provide `sha256sum` and GPG signatures for secure installation.
