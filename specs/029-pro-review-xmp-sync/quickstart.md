# Quickstart: Pro Review Mode & Desktop Sync

**Feature**: 029-pro-review-xmp-sync | **Date**: 2026-01-22

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | 20.x LTS | Frontend development |
| pnpm | 8.x+ | Package management |
| Python | 3.11+ | Backend services |
| Docker | 24.x+ | Database and services |
| Rust | 1.75+ | Desktop app (Tauri) |

### Optional (for desktop app development)

| Software | Version | Purpose |
|----------|---------|---------|
| Visual Studio Build Tools | 2022 | Windows native compilation |
| Xcode Command Line Tools | 15+ | macOS native compilation |

---

## 1. Environment Setup

### Clone and Branch

```bash
# Clone repository (if not already)
git clone https://github.com/rawdrive/rawdrive.git
cd rawdrive

# Create feature branch
git checkout -b 029-pro-review-xmp-sync
```

### Start Core Services

```bash
# Start Docker services (PostgreSQL, Redis)
docker compose -f infrastructure/docker/docker-compose.yml up -d

# Verify services are running
curl http://localhost:8000/health/live
curl http://localhost:8004/health/live
```

### Run Database Migrations

```bash
# Apply existing migrations
docker exec rawdrive-backend alembic upgrade head

# After creating new migrations for this feature:
docker exec rawdrive-backend alembic upgrade head
```

---

## 2. Web Development (Review Mode)

### Frontend Setup

```bash
cd frontend

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

Frontend will be available at: `http://localhost:5173`

### Backend Setup

The backend runs in Docker by default. For local development:

```bash
cd services/gallery-service

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt

# Run locally (connects to Docker PostgreSQL/Redis)
uvicorn src.main:app --reload --port 8004
```

### Key Files to Create

```
frontend/src/
├── components/features/gallery/review/
│   ├── ReviewWorkbench.tsx       # Main 3-pane layout
│   ├── ReviewFilmstrip.tsx       # Horizontal thumbnail strip
│   ├── ReviewCanvas.tsx          # Main image display
│   ├── ReviewMetadataPanel.tsx   # Right sidebar
│   └── KeyboardShortcutHelp.tsx  # ? key overlay
├── hooks/
│   ├── useReviewMode.ts          # State management
│   └── useKeyboardShortcuts.ts   # Hotkey handling
└── services/
    └── xmpSyncService.ts         # API client

services/gallery-service/src/
├── api/v1/
│   ├── xmp_sync.py               # XMP endpoints
│   └── sync_keys.py              # API key endpoints
├── services/
│   ├── xmp_service.py            # XMP parsing/generation
│   └── sync_key_service.py       # Key management
└── schemas/
    └── xmp_sync.py               # Pydantic models
```

---

## 3. Desktop App Development (Tauri)

### Install Rust and Tauri CLI

```bash
# Install Rust (if not installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Install Tauri CLI
cargo install create-tauri-app
cargo install tauri-cli
```

### Windows Additional Setup

```powershell
# Install Visual Studio Build Tools
# Download from: https://visualstudio.microsoft.com/visual-cpp-build-tools/
# Select "Desktop development with C++"
```

### macOS Additional Setup

```bash
# Install Xcode Command Line Tools
xcode-select --install
```

### Initialize Desktop Project

```bash
# Create Tauri project
cd desktop
pnpm create tauri-app . --template react-ts

# Or manually initialize if project structure exists
pnpm install
cargo tauri init
```

### Desktop Project Structure

```bash
desktop/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs
│       └── lib.rs
├── src/
│   ├── App.tsx
│   └── main.tsx
├── package.json
└── vite.config.ts
```

### Run Desktop App in Development

```bash
cd desktop

# Start Tauri development mode
pnpm tauri dev
```

### Build Desktop App

```bash
# Build for current platform
pnpm tauri build

# Output locations:
# Windows: desktop/src-tauri/target/release/bundle/msi/
# macOS: desktop/src-tauri/target/release/bundle/dmg/
```

---

## 4. Testing

### Frontend Tests

```bash
cd frontend

# Run unit tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run E2E tests
pnpm test:e2e
```

### Backend Tests

```bash
cd services/gallery-service

# Run tests
pytest

# Run with coverage
pytest --cov=src --cov-report=html

# Run specific test file
pytest tests/services/test_xmp_service.py -v
```

### Desktop App Tests

```bash
cd desktop/src-tauri

# Run Rust tests
cargo test

# Run with verbose output
cargo test -- --nocapture
```

---

## 5. XMP Testing

### Sample XMP Files

Create test XMP files in `services/gallery-service/tests/fixtures/xmp/`:

```xml
<!-- tests/fixtures/xmp/sample_5star_pick.xmp -->
<?xml version="1.0" encoding="UTF-8"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description
      xmlns:xmp="http://ns.adobe.com/xap/1.0/"
      xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"
      xmp:Rating="5"
      xmp:Label="Green"
      photoshop:Urgency="1">
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
```

### Generate Test XMP from Lightroom

1. Open Lightroom Classic
2. Select test images
3. Apply ratings/flags/labels
4. Metadata > Save Metadata to Files (Ctrl+S)
5. Copy generated .xmp files to test fixtures

---

## 6. API Key Testing

### Create Test API Key

```bash
# Using httpie
http POST http://localhost:8004/api/v1/galleries/{gallery_id}/sync-keys \
  Authorization:"Bearer {jwt_token}" \
  name="Test Desktop Sync" \
  permissions:='{"read": true, "write": true, "delete": false}'

# Response includes api_key (shown only once)
```

### Test API Key Authentication

```bash
# Validate key
http POST http://localhost:8004/api/v1/sync/auth/validate \
  api_key="rdsync_gal_abc123_..."

# Use key for sync operations
http GET http://localhost:8004/api/v1/sync/galleries/{gallery_id}/files \
  X-Sync-Api-Key:"rdsync_gal_abc123_..."
```

---

## 7. Environment Variables

### Frontend (.env.local)

```env
VITE_API_URL=http://localhost:8000
VITE_GALLERY_SERVICE_URL=http://localhost:8004
```

### Backend (.env)

```env
DATABASE_URL=postgresql://rawdrive:rawdrive@localhost:5432/rawdrive
REDIS_URL=redis://localhost:6379/0
JWT_SECRET=your-development-secret
```

### Desktop App (.env)

```env
RAWDRIVE_API_URL=http://localhost:8004
TAURI_DEBUG=1
```

---

## 8. Code Quality

### Linting

```bash
# Frontend
cd frontend && pnpm lint

# Backend
cd services/gallery-service && ruff check src/

# Rust
cd desktop/src-tauri && cargo clippy
```

### Formatting

```bash
# Frontend
cd frontend && pnpm format

# Backend
cd services/gallery-service && ruff format src/

# Rust
cd desktop/src-tauri && cargo fmt
```

---

## 9. Common Issues

### Issue: Tauri build fails on Windows

```
error: linker `link.exe` not found
```

**Solution**: Install Visual Studio Build Tools with C++ workload.

### Issue: XMP parsing errors

```
XMLSyntaxError: ...
```

**Solution**: Ensure XMP files are valid XML. Use Lightroom to generate reference files.

### Issue: API key not working

```
401 Unauthorized
```

**Solution**: Check key hasn't expired and has required permissions.

---

## 10. Development Workflow

1. **Start services**: `docker compose up -d`
2. **Run migrations**: `docker exec rawdrive-backend alembic upgrade head`
3. **Start frontend**: `cd frontend && pnpm dev`
4. **Start desktop app**: `cd desktop && pnpm tauri dev`
5. **Run tests before commit**: `pnpm test && cargo test`
6. **Create PR**: Follow git-workflow skill guidelines

---

## Quick Reference

| Task | Command |
|------|---------|
| Start all services | `docker compose up -d` |
| Frontend dev server | `cd frontend && pnpm dev` |
| Backend dev server | `cd services/gallery-service && uvicorn src.main:app --reload` |
| Desktop dev mode | `cd desktop && pnpm tauri dev` |
| Run frontend tests | `cd frontend && pnpm test` |
| Run backend tests | `cd services/gallery-service && pytest` |
| Build desktop app | `cd desktop && pnpm tauri build` |
| Apply migrations | `docker exec rawdrive-backend alembic upgrade head` |
| Create migration | `docker exec rawdrive-backend alembic revision -m "description"` |

---

**Quickstart Status**: Complete
**Last Updated**: 2026-01-22
