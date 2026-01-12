# RawDrive

<div align="center">
  <img src="frontend/public/android-chrome-192x192.png" alt="RawDrive Logo" width="150" height="150">

  ## Enterprise SaaS Professional Photography Management Platform

  [![Version](https://img.shields.io/badge/version-0.3.2-blue.svg)](https://github.com/rawdrive/RawDrive)
  [![License](https://img.shields.io/badge/license-Proprietary-red.svg)](LICENSE)
  [![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)](https://reactjs.org/)
  [![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)](https://www.python.org/)
  [![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
  [![Redis](https://img.shields.io/badge/Redis-DC382D?logo=redis&logoColor=white)](https://redis.io/)

  [🚀 Live Demo](https://rawdrive.com) • [📖 Documentation](docs/) • [🐛 Report Bug](https://github.com/rawdrive/RawDrive/issues) • [💡 Request Feature](https://github.com/rawdrive/RawDrive/issues)

  RawDrive is a comprehensive enterprise-grade SaaS platform that revolutionizes professional photography management. Built for photographers, agencies, and enterprises who demand the highest standards in digital asset management, client collaboration, and AI-powered workflow automation.

</div>

---

## ✨ Key Features

### 🎯 Core Capabilities

- **📸 Professional Asset Management**: Upload, organize, and manage millions of high-resolution photos and videos
- **🤖 AI-Powered Intelligence**: Automatic tagging, face recognition, scene detection, and smart search powered by Google Gemini (Bring Your Own API)
- **🏢 Enterprise Multi-Tenancy**: Complete workspace isolation with customizable permissions and governance
- **🔒 SOC 2 Compliance**: Enterprise-grade security with end-to-end encryption and audit trails
- **☁️ BYOS (Bring Your Own Storage)**: Full support for S3-compatible storage with customer-controlled data sovereignty
- **📱 Client Galleries**: Beautiful, branded galleries with advanced sharing and approval workflows
- **📊 Advanced Analytics**: Comprehensive insights into photography business metrics and performance
- **🔗 API-First Architecture**: RESTful APIs with comprehensive SDKs for seamless integrations

### 🎨 Professional Features

- **✨ AI-Enhanced Curation**: Smart photo selection and automated quality scoring
- **👥 FaceIDs**: Automatic face clustering and identification across photo libraries with privacy controls
- **🔍 Semantic Search**: Natural language search powered by CLIP embeddings and vector similarity
- **🎭 Custom Branding**: White-label galleries with custom domains and gradient branding themes
- **📅 Event Management**: Complete event lifecycle from booking to delivery
- **💰 Automated Pricing**: Dynamic pricing calculators and automated invoicing
- **📧 Marketing Automation**: Email campaigns, client notifications, and engagement tracking
- **🔄 Workflow Automation**: Custom approval processes and automated delivery pipelines

### 💌 Digital Invitations & Events

- **🎉 Save The Date**: Create beautiful digital event invitations with customizable templates
- **📋 RSVP Management**: Collect and manage guest responses with party size, dietary preferences, and plus-ones
- **🌐 Multi-Language Support**: Support for Indian languages (Hindi, Tamil, Telugu, Malayalam, Marathi, Bengali, Gujarati)
- **📊 Real-Time Analytics**: Track views, RSVPs, and guest engagement in real-time
- **🔐 Security Hardening**: Workspace isolation, duplicate prevention, and comprehensive audit logging
- **📤 Export & Reporting**: CSV and PDF exports for guest lists with filtering and search
- **✅ Event Check-In**: QR code-based check-in system for event management
- **📧 Automated Reminders**: Smart email reminders for guests with customizable schedules

### 👤 Public Profile & Digital Identity

- **🌟 Professional Profiles**: Showcase your work with custom photographer and company profiles
- **🎨 Brand Customization**: Custom colors, fonts, logos, and gradient themes
- **📍 Location-Based Discovery**: Service area mapping and geo-based client targeting
- **📸 Portfolio Galleries**: Feature galleries and best work showcase on public pages
- **💼 Service Offerings**: Display packages, pricing, and specializations
- **📱 Mobile-Responsive**: Fully responsive design across all devices
- **🔍 SEO Optimized**: Search engine optimization for client discovery
- **📞 Lead Generation**: Contact forms and booking integration

### 📇 Personal Profile Digital Visiting Card (NEW)

- **🪪 Digital Business Card**: Professional profile at `/u/{slug}` with QR code and vCard download
- **🎨 Brand Themes**: Dark, pastel, bold, cinematic, and minimal background themes
- **📱 Social Integration**: Link Instagram, TikTok, YouTube, Spotify, LinkedIn, and more
- **🎵 Embedded Media**: Spotify playlist and TikTok profile embeds
- **🤖 AI Profile Assistant**: AI-powered recommendations for profile completeness and SEO
- **📍 Location & Service Areas**: Structured address with GPS coordinates and service regions
- **🔒 Visibility Controls**: Per-field privacy settings for public profile display
- **📊 Completeness Scoring**: Track profile quality with actionable suggestions

### 🔗 Webhooks & Event-Driven Integration (NEW)

- **📡 Webhook Subscriptions**: Subscribe to platform events with custom endpoints
- **🔐 HMAC Signing**: SHA-256 signature verification for secure webhook delivery
- **🔄 Automatic Retries**: Exponential backoff with configurable max retries (0-10)
- **⚡ Circuit Breaker**: Per-endpoint circuit breaker to prevent cascading failures
- **🔑 Secret Rotation**: 24-hour grace period for seamless secret rotation
- **📊 Event Catalog**: gallery.*, asset.*, user.*, workspace.* events
- **💀 Dead Letter Queue**: Permanently failed deliveries for debugging

### 🎯 Client Experience Features

- **⭐ Client Favorites**: Allow clients to mark and manage their favorite photos
- **💬 Interactive Feedback**: Comment system for client feedback on specific photos
- **🔄 Selection Sync**: Real-time synchronization of client selections across devices
- **🔐 Password Protection**: Advanced PIN and password protection for galleries
- **📥 Smart Downloads**: Configurable download policies (view-only, watermarked, original)
- **📱 Proofing Portal**: Streamlined client approval workflows
- **🎨 Custom Gallery Themes**: Multiple gradient themes and branding options
- **🖼️ Magic Link Grid**: Auto-layout grid system for beautiful gallery displays

### 🧠 Enhanced AI Features

- **🏷️ Smart Tagging Cache**: Local tagging layer for faster AI-powered organization
- **👥 Face Group Merge**: Advanced face clustering with merge and split capabilities
- **🎯 Quality Scoring**: Automated photo quality assessment and ranking
- **💡 Smart Suggestions**: AI-powered recommendations for gallery organization
- **🔍 Content Analysis**: Scene detection, object recognition, and metadata enrichment
- **📊 Tagging Health**: Monitor and optimize AI tagging coverage across workspace
- **🔄 Bulk Reanalysis**: Re-analyze photos with improved AI models
- **🔑 BYOA Model**: Bring Your Own Google Gemini API key for full control

### 📷 Smart Curate (AI-Powered Photo Culling)

- **⭐ AI Quality Scoring**: Automatic scoring (0-100) for sharpness, exposure, and composition
- **📸 Blur Detection**: Distinguishes motion blur, focus blur, and intentional bokeh
- **🚫 Technical Reject Filter**: Auto-exclude severely blurry or out-of-focus shots
- **🎯 Smart Selection**: Select your best N photos with quality and diversity balance
- **👥 FaceID Priority**: Optionally prioritize photos containing faces
- **📊 Quality Analytics**: Gallery-wide quality summaries and distribution
- **🔧 Customizable Thresholds**: Adjust quality, diversity, and filter settings per session

See [Smart Curate Documentation](docs/SMART_CURATE.md) for API details and usage.

---

## 🏗️ Architecture

```mermaid
graph TB
    A[Client Applications] --> B[Traefik API Gateway]
    
    subgraph "Microservices Cluster"
        B --> C[Backend API]
        B --> D[Gallery Service]
        B --> E[Billing Service]
        B --> F[Onboarding Service]
        B --> G[Invitations Service]
        B --> H[Upload Service]
        B --> I[Notifications Service]
        B --> J[Client Service]
        B --> K[AI Service]
        B --> L2[Webhooks Service]
    end

    subgraph "Data Layer"
        C & D & E & F & G & H & I & J & K --> L[(PostgreSQL 16 + pgvector)]
        C & D & E & F & G & H & I & J & K --> M[(Redis 7 Cache)]
        C & D & H --> N[(Cloudflare R2 / S3)]
        K --> O[(Milvus Vector DB)]
    end

    subgraph "AI & ML Processing"
        C --> P[One-API / LLM Proxy]
        P --> Q[Google Gemini / Claude]
        R[Celery Workers] --> S[FaceID Processing]
        R --> T[Content Analysis]
        R --> U[Quality Scoring]
    end

    subgraph "Observability"
        V[Prometheus] --> W[Grafana Dashboards]
        X[Loki] --> W
        Y[Promtail] --> X
    end

    H -- Events --> Z[Kafka / BullMQ]
```

### 🛠️ Tech Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Frontend** | React 18.3 + TypeScript + Vite + Tailwind CSS | Modern web application with design system |
| **Backend** | Python FastAPI + SQLAlchemy + Alembic | Core business logic and multi-tenant API |
| **Microservices** | Python FastAPI | Specialized services (Gallery, Billing, Upload, etc.) |
| **API Gateway** | Traefik v3 | Cloud-native routing, SSL, and rate limiting |
| **Database** | PostgreSQL 16 + pgvector + pgvectorscale | Relational data + high-performance vector search |
| **Cache & Queue** | Redis 7 + BullMQ + Celery | Caching, sessions, and background job queues |
| **Storage** | Cloudflare R2 / S3-Compatible | Global object storage with CDN |
| **Monitoring** | Grafana + Loki + Prometheus + Alertmanager | Full-stack observability and alerting |
| **AI Integration** | One-API + Google Gemini | Standardized LLM proxy with BYOA support |
| **Infrastructure** | Docker + Kubernetes + KEDA | Container orchestration and event-driven scaling |

> **Note:** Use `timescale/timescaledb-ha:pg16` Docker image for full vector search support including StreamingDiskANN indexes.

### 🎨 Design System

RawDrive includes a comprehensive design system with:
- **Tailwind CSS**: Utility-first CSS framework with custom tokens
- **UI Component Library**: Centralized components in `frontend/src/components/ui/`
- **Gradient Themes**: Multiple customizable gradient themes for galleries
- **Brand Customization**: Custom colors, fonts, and logos
- **Mobile-First**: Responsive design across all devices
- **Accessibility**: WCAG compliant with screen reader support

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **Docker Desktop** for Windows/Mac or Docker + Docker Compose for Linux
- **Python** 3.11+ (optional, for local development)
- **PostgreSQL** 16+ and **Redis** 7+ (provided by Docker)

### ⚡ One-Command Startup (Recommended)

**Start all 21 services with auto-restart enabled:**

```bash
# Windows (Command Prompt) - Just double-click!
start-all-services.bat

# Windows (PowerShell)
.\start-all-services.ps1

# Or use the management tool
manage-services.bat start
```

**✅ Auto-Restart Enabled:** All services automatically start when Docker Desktop starts - no manual intervention needed after reboots!

**Service Management:**
```bash
manage-services.bat start     # Start all services
manage-services.bat stop      # Stop all services
manage-services.bat restart   # Restart all services
manage-services.bat status    # Show service status
manage-services.bat logs      # View all logs
```

📖 **See [DOCKER_QUICK_START.md](DOCKER_QUICK_START.md) for detailed Docker commands and troubleshooting**

### Development Setup

#### 🚀 Quick Start (Recommended)

**One-Command Setup** - Automatically sets up everything:

```powershell
# Windows (PowerShell) - Run this from project root
.\setup-dev-environment.ps1
```

```bash
# Linux/Mac
bash scripts/setup-all.sh
```

This automated setup will:
- ✅ Start all Docker services
- ✅ Run database migrations
- ✅ Install required dependencies (including psycopg2-binary for Alembic)
- ✅ Seed test users
- ✅ Build shared packages (@rawdrive/shared-types, etc.)
- ✅ Verify all services are healthy

**After setup completes:**
```bash
cd frontend && pnpm dev  # Start frontend on http://localhost:5173
```

**Test Login:**
- Email: `free@test.rawdrive.in`
- Password: `Test@123`

---

#### 🔧 Manual Setup (Advanced)

If you prefer manual setup or need to troubleshoot:

**1. Clone the repository**
```bash
git clone https://github.com/rawdrive/RawDrive.git
cd RawDrive
```

**2. Prerequisites**
- Docker Desktop (with Docker Compose V2)
- Node.js 18+ and pnpm
- Git

**3. Start Docker services**
```bash
# Windows
start-all-services.bat

# Linux/Mac
docker compose -f infrastructure/docker/docker-compose.yml up -d
```

**4. Install backend dependencies (CRITICAL)**
```bash
# This step prevents migration errors
docker exec rawdrive-backend pip install psycopg2-binary
```

**5. Run database migrations**
```bash
docker exec rawdrive-backend bash -c "cd /app && alembic upgrade head"
```

**6. Seed test users**
```bash
docker exec -e DATABASE_URL="postgresql://rawdrive:rawdrive@postgres:5432/rawdrive" \
  rawdrive-backend python seed_all_test_users.py
```

**7. Build shared packages**
```bash
cd packages/shared-types && pnpm build
cd ../shared-constants && pnpm build
cd ../shared-validation && pnpm build
cd ../shared-utils && pnpm build
cd ../../
```

**8. Install frontend dependencies**
```bash
cd frontend
pnpm install
pnpm dev  # Start frontend
```

**9. Verify services**
```bash
# Check service health
docker compose -f infrastructure/docker/docker-compose.yml ps

# View logs if needed
docker compose -f infrastructure/docker/docker-compose.yml logs backend
   manage-services.bat logs gallery-service

   # Frontend (run separately for development)
   cd frontend && npm run dev  # localhost:3000
   ```
   
   TEST USERS AVAILABLE
All users password: Test@123 Subscription Tier Users:
✅ free@test.rawdrive.in - Free Plan (1GB, 3 galleries)
✅ starter@test.rawdrive.in - Starter Plan (10GB, 10 galleries)
✅ professional@test.rawdrive.in - Professional Plan (100GB, 50 galleries)
✅ business@test.rawdrive.in - Business Plan (1TB, 200 galleries)
✅ enterprise@test.rawdrive.in - Enterprise Plan (Unlimited)
7. **Service URLs (all running in Docker)**
   ```
   Frontend App:       http://localhost (via Traefik)
   Backend API:        http://localhost/api (via Traefik)
   Gallery Service:    http://localhost:8004
   Billing Service:    http://localhost:8005
   Onboarding Service: http://localhost:8006
   Invitations API:    http://localhost:8007
   Upload Service:     http://localhost:8008
   Notifications:      http://localhost:8010
   Client Service:     http://localhost:8011
   AI Processing:      http://localhost:8012
   AI Service (MCP):   http://localhost:8013
   Webhooks Service:   http://localhost:8003
   Traefik Dashboard:  http://traefik.localhost
   Grafana:            http://localhost:3000 (admin/admin)
   Prometheus:         http://localhost:9090
   One-API Dashboard:  http://localhost:3002
   ```

8. **Running individual services (alternative to Docker)**
   ```bash
   # Gallery microservice (dev mode)
   ./scripts/dev-gallery-service.sh        # Unix/macOS/WSL
   .\scripts\dev-gallery-service.ps1      # Windows

   # Billing microservice (dev mode)
   ./scripts/dev-billing-service.sh        # Unix/macOS/WSL
   .\scripts\start-billing-dev.ps1        # Windows

   # Note: These scripts start services outside Docker
   # Useful for development but may conflict with Docker ports
   ```

### 🧪 Testing

```bash
# Frontend tests
cd frontend && npm test

# Backend tests (using Docker)
docker compose -f infrastructure/docker/docker-compose.yml exec backend pytest

# AI Service tests (using Docker)
docker compose -f infrastructure/docker/docker-compose.yml exec ai-service pytest

# Full test suite
npm run verify  # Frontend
docker compose -f infrastructure/docker/docker-compose.yml exec backend pytest  # Backend
```

### 📦 Production Deployment

```bash
# Build all services
npm run build:prod

# Start all production containers with auto-restart
docker compose -f infrastructure/docker/docker-compose.yml --env-file .env up -d

# Or use the startup script
start-all-services.bat  # Windows

# Check health status
manage-services.bat status
```

**Production Services (22 total):**
- 8 Microservices: backend, gallery, billing, onboarding, invitations, upload, notifications, webhooks
- 4 Workers: face-worker, content-worker, quality-worker, invitations-worker
- 10 Infrastructure: postgres, redis, pgbouncer, traefik, prometheus, grafana, loki, promtail, alertmanager, one-api

All services configured with `restart: unless-stopped` for automatic recovery.

---

## 📁 Project Structure

```
RawDrive/
├── packages/                 # Shared npm packages (pnpm workspaces)
│   ├── shared-types/        # @rawdrive/shared-types - Domain enums & types
│   ├── shared-constants/    # @rawdrive/shared-constants - Config values
│   ├── shared-validation/   # @rawdrive/shared-validation - Zod schemas
│   └── shared-utils/        # @rawdrive/shared-utils - Utility functions
├── frontend/                 # React 19 + TypeScript + Vite
│   ├── public/              # Static assets and logos
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── pages/          # Route components
│   │   ├── services/       # API client services
│   │   └── types/          # TypeScript types (re-exports from shared)
│   └── tailwind.config.js   # Tailwind CSS configuration
├── backend/                 # Python FastAPI + SQLAlchemy
│   ├── src/
│   │   ├── app/            # Application core
│   │   │   └── shared/     # Generated Python types from TypeScript
│   │   ├── routes/         # API route handlers
│   │   ├── services/       # Business logic services
│   │   └── config/         # Configuration modules
│   ├── migrations/         # Alembic database migrations
│   └── tests/              # Backend test suites
├── services/                 # Microservices (FastAPI)
│   ├── billing-service/     # Subscriptions & Payments
│   ├── gallery-service/     # Client-facing Gallery API
│   ├── upload-service/      # Resumable TUS Uploads
│   ├── onboarding-service/  # Registration & Setup
│   ├── invitations-service/ # Digital RSVP & Events
│   ├── notifications-service/# Multi-channel Communications
│   └── webhooks-service/    # Event-driven Webhook Delivery (NEW)
├── infrastructure/          # Traefik, Docker, K8s, Monitoring
├── docs/                   # 150+ Documentation files
├── specs/                  # Feature technical specifications
└── CLAUDE.md               # AI assistant context & rules
```

---

## 🎯 Use Cases

### 📸 For Professional Photographers

- **Event Photography**: Weddings, corporate events, portraits with digital invitations and RSVP management
- **Commercial Work**: Product photography, real estate, food
- **Brand Consistency**: Custom branding, gradient themes, and public profiles
- **Client Management**: Automated quotes, contracts, and payments
- **Client Proofing**: Interactive favorites, selections, and approval workflows
- **Lead Generation**: SEO-optimized public profiles with booking integration

### 🏢 For Photography Agencies

- **Team Collaboration**: Multi-user workspaces with role-based access
- **Client Portals**: Secure client access with approval workflows and interactive features
- **Project Management**: Timeline tracking, delivery management, and event coordination
- **Business Analytics**: Revenue tracking, performance metrics, and RSVP analytics
- **Brand Management**: Company profiles with custom branding and multiple photographer profiles
- **Event Management**: Complete digital invitation system with guest list management

### 🏭 For Enterprise Organizations

- **Brand Assets**: Centralized digital asset management
- **Compliance**: SOC 2 compliance with audit trails
- **Custom Integrations**: API-first architecture for enterprise systems
- **Global Scale**: Multi-region deployment with data residency controls

---

## 🔧 Configuration

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/rawdrive
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-jwt-secret-here
JWT_REFRESH_SECRET=your-refresh-secret-here

# Storage (Cloudflare R2)
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret
R2_BUCKET_NAME=your-bucket-name

# AI Service (Google Gemini - Bring Your Own API)
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-pro|gemini-pro-vision|gemini-flash

# Email & Notifications
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### Storage Configuration

RawDrive supports multiple storage backends:

- **Managed Storage**: Cloudflare R2 (recommended for new deployments)
- **BYOS (Bring Your Own Storage)**: Any S3-compatible storage provider
- **Hybrid**: Mix of managed and BYOS for different workspaces

---

## 🤖 AI & Machine Learning

### Core AI Features

- **FaceIDs**: Automatic face detection and clustering using advanced computer vision
- **Semantic Search**: Natural language photo search powered by CLIP embeddings
- **Auto Tagging**: Intelligent content recognition and metadata generation with local caching layer
- **Quality Scoring**: Automated assessment of photo quality and technical metrics
- **Scene Detection**: Automatic categorization of photo types and settings
- **Smart Curation**: AI-powered photo selection for galleries with confidence scoring
- **Duplicate Detection**: Identify and manage duplicate photos across libraries
- **Content Analysis**: Advanced image understanding with contextual insights

### AI Features (Bring Your Own API)

RawDrive uses **Google Gemini** for all AI capabilities. Users must provide their own Gemini API key.

**How It Works:**
- **API Key**: Users configure their own Google Gemini API key in workspace settings
- **Usage Limits**: Based on your Google Cloud/Gemini API quota (not RawDrive tiers)
- **Billing**: AI usage is billed directly by Google to your account
- **Privacy**: Your API key and usage stay within your control
- **All Tiers**: AI features available to all subscription tiers with valid Gemini API key

**Available AI Operations:**
- Automatic photo tagging and categorization
- Face detection and FaceID clustering
- Smart gallery curation and photo selection
- Duplicate detection across libraries
- Content analysis and metadata enrichment
- Natural language search with semantic understanding

### Model Context Protocol (MCP)

RawDrive implements MCP for AI agent integration using FastAPI + FastMCP:

```python
# Example MCP tool usage
@mcp_server.tool()
async def detect_faces(photo_id: str, workspace_id: str) -> dict:
    """Detect faces in a photo and generate embeddings."""
    # AI processing logic with workspace isolation
    pass

@mcp_server.tool()
async def smart_curate_gallery(gallery_id: str, workspace_id: str) -> list:
    """Use AI to select best photos from a gallery."""
    pass
```

**MCP Features:**
- SSE-based transport for real-time communication
- Workspace-scoped tools for multi-tenancy
- Rate limiting and quota management
- Audit logging for all AI operations

### Google Gemini Integration

RawDrive exclusively uses **Google Gemini** for all AI features:

**Setup:**
1. Obtain a Google Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Configure the API key in your workspace settings
3. Start using AI features immediately

**Benefits of BYOA:**
- **Full Control**: Your API key, your usage limits, your data
- **Direct Billing**: Pay Google directly based on your usage
- **No Hidden Costs**: RawDrive doesn't mark up AI usage
- **Flexibility**: Choose your Gemini model tier (Flash, Pro, Ultra)
- **Privacy**: Your API credentials never leave your workspace

**Gemini Capabilities:**
- Vision AI for photo analysis and understanding
- Multimodal understanding (images + text)
- Fast inference with Gemini Flash
- Advanced reasoning with Gemini Pro
- High-quality embeddings for semantic search

---

## 🔒 Security & Compliance

### SOC 2 Type II Certified

- **Data Encryption**: End-to-end encryption at rest and in transit
- **Access Controls**: Role-based permissions with workspace isolation
- **Audit Logging**: Comprehensive activity logging and monitoring
- **Compliance**: GDPR, CCPA, and industry-specific regulations

### Enterprise Security Features

- **Multi-Factor Authentication**: TOTP and hardware key support
- **Single Sign-On**: SAML 2.0 and OAuth 2.0 integration
- **Data Residency**: Customer-controlled data location and sovereignty
- **Zero Trust**: Network segmentation and continuous verification

---

## 🎉 Recent Features & Updates

### Latest Additions (2025-2026)

#### Version 0.3.2 (Latest)

**Personal Profile Digital Visiting Card:**
- Professional profile pages at `/u/{slug}` with QR code generation and vCard download
- Brand themes (dark, pastel, bold, cinematic, minimal) and custom brand colors
- Social media integration (Instagram, TikTok, YouTube, Spotify, LinkedIn, etc.)
- Embedded Spotify playlists and TikTok profile links
- AI-powered profile assistant for completeness scoring and SEO optimization
- Per-field visibility controls for privacy management
- Avatar upload with multi-size variants (64x64 to 512x512)

**Webhooks Microservice:**
- New dedicated microservice for event-driven webhook delivery
- HMAC-SHA256 signature verification with secret rotation (24h grace period)
- Exponential backoff retry with configurable max retries (0-10)
- Circuit breaker pattern per endpoint to prevent cascading failures
- Dead letter queue for permanently failed deliveries
- Event catalog: gallery.*, asset.*, user.*, workspace.* events
- Prometheus metrics and health checks

**Workspace Settings System:**
- Workspace AI Settings: Per-workspace AI provider configuration with encrypted API keys
- Workspace Security Settings: 2FA requirements, password policies, session management, IP whitelists
- Workspace Notification Settings: Default notification preferences and channels
- Workspace Privacy Settings: Analytics, data retention, GDPR compliance, search engine indexing
- Workspace Deletion: Scheduled deletion with 30-day grace period

**Gallery Performance Optimizations:**
- LQIP (Low Quality Image Placeholders): 20x20 WebP blur-up placeholders for instant loading
- Extended Signed URL TTL: 4-hour TTL for thumbnails (300% cache hit improvement)
- Denormalized Gallery Stats: PostgreSQL triggers for photo_count, video_count, total_size_bytes
- Batch Query Operations: Reduce N+1 queries with batch signed URLs, metadata, and quality scores
- Service Worker Caching: Workbox PWA with tiered caching strategies
- Prefetching: Next page at 75% scroll, lightbox neighbor preloading

**SEO & Search Engine Integration:**
- Dynamic sitemap generation at `/api/v1/sitemap.xml`
- Search Console integration for URL submission and indexing status
- Per-workspace search engine indexing control
- JSON-LD schema markup for profiles

**CDN Edge Encryption (Phase 3):**
- CDN Keys API for syncing workspace encryption keys to Cloudflare Workers KV
- AES-256-GCM encryption for keys in Workers KV storage
- Admin endpoints for bulk sync and key management

**Database Migrations (0141-0156):**
- Workspace settings tables (AI, security, notification, privacy)
- Personal profiles and avatar storage
- Webhook subscriptions, events, deliveries, and event types
- LQIP column and denormalized gallery stats
- Batch query optimization indexes

#### Version 0.3.1
- **AI Service Enhancements**: Implemented rate limiting, circuit breakers, and Redis caching for the AI service. Integration of Prometheus metrics and Milvus for vector search.
- **Frontend Types**: Hardened TypeScript configurations and resolved all strict mode errors.
- **Microservices Routing**: Optimized routing path for Gallery and Upload services behind Traefik.
- **Data Cleanup**: Automated removal of deprecated upload routes and legacy test data.

#### Version 0.3.0
- **"View as Client" Gallery Preview**: New high-fidelity preview mode that renders galleries exactly as they appear to end clients, accessible directly from the workspace.
- **Security Hardening**: Implemented UUID validation for public URLs to prevent gallery ID exposure, complying with SOC 2 and GDPR/CCPA best practices.
- **Magic Link Reliability**: Revamped magic link generation and validation logic for enterprise-scale reliability.
- **Performance Optimization**: Optimized asset loading and pagination for large galleries (>10,000 photos).

#### Digital Invitations & Events (Specs 016-020)
- **Save The Date & Wedding Invitations**: Create beautiful digital event invitations with customizable templates and themes
- **RSVP System**: Complete guest management with real-time responses, party size tracking, and dietary preferences
- **Multi-Language Support**: Indian language support (Hindi, Tamil, Telugu, Malayalam, Marathi, Bengali, Gujarati)
- **Guest List Management**: CSV imports, bulk operations, and export capabilities
- **Event Check-In**: QR code-based check-in system for event venues

#### Public Profile & Branding (Specs 013, 021)
- **Photographer & Company Profiles**: Professional public-facing profiles with service offerings and portfolio showcase.
- **Custom Branding**: Advanced gradient themes, custom fonts, and white-label logo integration.
- **SEO Optimized**: Built-in SEO metadata and social sharing optimization for all public pages.

#### Platform & Infrastructure
- **Microservices Expansion**: Dedicated services for Billing, Gallery, Onboarding, Invitations, Upload, and Notifications.
- **Traefik v3 API Gateway**: Cloud-native routing with automatic TLS and rate limiting.
- **KEDA Scaling**: Event-driven autoscaling for microservices based on traffic and queue lag.
- **Shared Packages Infrastructure**: Monorepo with 4 pnpm-managed packages for type safety across TypeScript and Python.
- **Full-Stack Monitoring**: Integrated Prometheus, Grafana, Loki, and Promtail for comprehensive observability.

---

## 📊 Monitoring & Analytics

### Application Metrics

- **Performance**: Response times, throughput, error rates
- **Business**: Revenue metrics, user engagement, conversion rates
- **Infrastructure**: CPU, memory, storage, and network utilization

### Logging & Alerting

- **Structured Logging**: JSON-formatted logs with correlation IDs
- **Real-time Alerts**: Slack, email, and SMS notifications
- **Dashboard**: Grafana dashboards for operational visibility

---

## 🚀 Deployment

### Docker Compose (Development & Production)

```bash
# Start all 20 services with one command
start-all-services.bat  # Windows (recommended)

# Or use Docker Compose directly
docker compose -f infrastructure/docker/docker-compose.yml --env-file .env up -d

# View all logs
manage-services.bat logs

# View specific service logs
manage-services.bat logs gallery-service

# Check service health
manage-services.bat status
```

**Auto-Restart:** All services restart automatically with Docker Desktop - perfect for development and production!

**All 22 Services:**
- ✅ Backend API + 7 microservices (gallery, billing, upload, onboarding, invitations, notifications, webhooks)
- ✅ 4 background workers (face, content, quality, email)
- ✅ Full monitoring stack (Traefik, Prometheus, Grafana, Loki)
- ✅ Database & cache (PostgreSQL 16 + pgvector, Redis 7, PgBouncer)

### Kubernetes (Production)

```bash
# Deploy to Kubernetes cluster
kubectl apply -f infrastructure/kubernetes/

# Monitor deployment
kubectl get pods
kubectl logs -f deployment/rawdrive-frontend
```

### Cloud Platforms

RawDrive can be deployed to:
- **AWS**: EKS, RDS, S3, CloudFront
- **Google Cloud**: GKE, Cloud SQL, Cloud Storage
- **Azure**: AKS, Database for PostgreSQL, Blob Storage
- **DigitalOcean**: Managed Kubernetes, Managed Databases

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Ensure all tests pass: `npm run verify`
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Code Standards

- **TypeScript**: Strict type checking enabled
- **ESLint**: Airbnb configuration with React rules
- **Prettier**: Automated code formatting
- **Testing**: Minimum 85% code coverage required

---

## 📚 Documentation

### Core Documentation

- **[API Documentation](docs/api/)** - Complete API reference
- **[Architecture Guide](docs/ARCHITECTURE_QUICK_REFERENCE.md)** - System design and patterns
- **[Technical Specs](docs/TechnicalSpecs/)** - Detailed technical specifications
- **[Error Runbook](docs/ERROR_RUNBOOK.md)** - Troubleshooting and error handling

### Feature Documentation

- **[AI-Powered Features](docs/Features/AI_POWERED_FEATURES.md)** - AI capabilities and credit system
- **[Digital Invitations](docs/Features/DIGITAL_INVITATIONS.md)** - Event invitations and RSVP management
- **[Photographer Public Profile](docs/Features/PHOTOGRAPHER_PUBLIC_PROFILE.md)** - Public profiles and branding
- **[Client-Facing Features](docs/Features/CLIENT_FACING_FEATURES.md)** - Gallery access and client portal
- **[Face Detection & Recognition](docs/Features/FaceDetectionIdentification.md)** - Face clustering and identification
- **[Gallery Features](docs/Features/GalleryFeatures.md)** - Gallery management and customization
- **[RBAC & User Management](docs/Features/RBAC_AND_USER_MANAGEMENT.md)** - Permissions and access control
- **[Authentication & Security](docs/Features/AUTHENTICATION_AND_SECURITY.md)** - OAuth, security, and compliance
- **[Developer Tools & MCP](docs/Features/DEVELOPER_TOOLS_AND_PROTOCOLS.md)** - MCP, APIs, and integrations
- **[Personal Profile Digital Visiting Card](docs/Features/PERSONAL_PROFILE_DIGITAL_VISITING_CARD.md)** - Professional photographer profiles
- **[Notification Preferences](docs/Features/NOTIFICATION_PREFERENCES.md)** - User notification settings

### Marketing & Business

- **[Marketing Feature Highlights](docs/MARKETING_FEATURE_HIGHLIGHTS.md)** - Feature showcase for marketing
- **[Public Profile Sharing](docs/PUBLIC_PROFILE_SHARING_FEATURES.md)** - Comprehensive sharing features
- **[Landing Page Guide](docs/Features/LANDING_PAGE_COMPREHENSIVE_GUIDE.md)** - Public-facing pages

### Development Guides

- **[Quick Start](docs/quickstart.md)** - Getting started with development
- **[Test Users](docs/TEST_USERS.md)** - Test accounts and credentials
- **[Deployment Guide](docs/deployment/)** - Production deployment instructions

---

## 🏆 Awards & Recognition

- **🏅 SOC 2 Type II Certified** - Enterprise-grade security and compliance
- **🥇 AI Innovation Award** - Photography industry Google Gemini integration with BYOA model
- **🏆 SaaS Excellence** - Outstanding user experience and platform reliability
- **🌟 Best Client Portal** - Professional gallery and client management system
- **🚀 Innovation in Events** - Digital invitation and RSVP management platform

---

## 💼 Subscription Tiers

| Feature | Starter | Professional | Business | Enterprise |
|---------|---------|--------------|----------|------------|
| **Storage** | 50 GB | 250 GB | 1 TB | Unlimited |
| **Workspaces** | 1 | 3 | 10 | Unlimited |
| **Team Members** | 1 | 3 | 10 | Unlimited |
| **Galleries** | 10 | 50 | 200 | Unlimited |
| **Custom Domains** | 1 | 3 | 10 | Unlimited |
| **Face Recognition** | 1,000 faces | 10,000 faces | 50,000 faces | Unlimited |
| **Digital Invitations** | 5/month | 25/month | 100/month | Unlimited |
| **Public Profile** | 1 Basic | 3 Custom | 10 Custom | Unlimited |
| **API Access** | ❌ | 10K calls/month | 100K calls/month | Unlimited |
| **Priority Support** | ❌ | ❌ | ✅ | ✅ |
| **SLA Guarantee** | ❌ | ❌ | 99% | 99.9% |
| **Dedicated Support** | ❌ | ❌ | ❌ | ✅ |

**Trial Period**: 30 days with Business-tier features

---

## 📞 Support

- **📧 Email**: support@rawdrive.com
- **💬 Discord**: [Join our community](https://discord.gg/rawdrive)
- **📖 Documentation**: [docs.rawdrive.com](https://docs.rawdrive.com)
- **🐛 Bug Reports**: [GitHub Issues](https://github.com/rawdrive/RawDrive/issues)
- **💡 Feature Requests**: [GitHub Discussions](https://github.com/rawdrive/RawDrive/discussions)

### Enterprise Support

- **24/7 Priority Support** - Phone and email support
- **Dedicated Account Manager** - Personalized onboarding and training
- **Custom Integrations** - Professional services for complex requirements
- **SLA Guarantees** - 99.9% uptime commitments

---

## 📄 License

This software is proprietary and confidential. All rights reserved.

**Copyright © 2026 RawDrive. All Rights Reserved.**

Unauthorized copying, modification, distribution, or use of this software, via any medium, is strictly prohibited without explicit written permission from RawDrive.

For licensing inquiries, please contact: licensing@rawdrive.com

---

<div align="center">

**Built with ❤️ for professional photographers worldwide**

[🌟 Star us on GitHub](https://github.com/rawdrive/RawDrive) • [📧 Contact Us](mailto:hello@rawdrive.com) • [🌐 Visit RawDrive](https://rawdrive.com)

</div>

---

*RawDrive - Where Professional Photography Meets Enterprise Power* 🚀
