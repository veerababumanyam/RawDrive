# RawDrive

<div align="center">
  <img src="frontend/public/android-chrome-192x192.png" alt="RawDrive Logo" width="150" height="150">

  ## Enterprise SaaS Professional Photography Management Platform

  [![Version](https://img.shields.io/badge/version-0.2.6-blue.svg)](https://github.com/rawdrive/RawDrive)
  [![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
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
- **🤖 AI-Powered Intelligence**: Automatic tagging, face recognition, scene detection, and smart search powered by Google Gemini, OpenAI, Anthropic, or Azure
- **🏢 Enterprise Multi-Tenancy**: Complete workspace isolation with customizable permissions and governance
- **🔒 SOC 2 Compliance**: Enterprise-grade security with end-to-end encryption and audit trails
- **☁️ BYOS (Bring Your Own Storage)**: Full support for S3-compatible storage with customer-controlled data sovereignty
- **📱 Client Galleries**: Beautiful, branded galleries with advanced sharing and approval workflows
- **📊 Advanced Analytics**: Comprehensive insights into photography business metrics and performance
- **🔗 API-First Architecture**: RESTful APIs with comprehensive SDKs for seamless integrations

### 🎨 Professional Features

- **✨ AI-Enhanced Curation**: Smart photo selection and automated quality scoring with credit-based system
- **👥 Face Recognition**: Automatic people clustering and identification across photo libraries with privacy controls
- **🔍 Semantic Search**: Natural language search powered by CLIP embeddings and vector similarity
- **🎭 Custom Branding**: White-label galleries with custom domains and gradient branding themes
- **📅 Event Management**: Complete event lifecycle from booking to delivery
- **💰 Automated Pricing**: Dynamic pricing calculators and automated invoicing
- **📧 Marketing Automation**: Email campaigns, client notifications, and engagement tracking
- **🔄 Workflow Automation**: Custom approval processes and automated delivery pipelines

### 💌 Digital Invitations & Events (NEW)

- **🎉 Save The Date**: Create beautiful digital event invitations with customizable templates
- **📋 RSVP Management**: Collect and manage guest responses with party size, dietary preferences, and plus-ones
- **🌐 Multi-Language Support**: Support for Indian languages (Hindi, Tamil, Telugu, Malayalam, Marathi, Bengali, Gujarati)
- **📊 Real-Time Analytics**: Track views, RSVPs, and guest engagement in real-time
- **🔐 Security Hardening**: Workspace isolation, duplicate prevention, and comprehensive audit logging
- **📤 Export & Reporting**: CSV and PDF exports for guest lists with filtering and search
- **✅ Event Check-In**: QR code-based check-in system for event management
- **📧 Automated Reminders**: Smart email reminders for guests with customizable schedules

### 👤 Public Profile & Digital Identity (NEW)

- **🌟 Professional Profiles**: Showcase your work with custom photographer and company profiles
- **🎨 Brand Customization**: Custom colors, fonts, logos, and gradient themes
- **📍 Location-Based Discovery**: Service area mapping and geo-based client targeting
- **📸 Portfolio Galleries**: Feature galleries and best work showcase on public pages
- **💼 Service Offerings**: Display packages, pricing, and specializations
- **📱 Mobile-Responsive**: Fully responsive design across all devices
- **🔍 SEO Optimized**: Search engine optimization for client discovery
- **📞 Lead Generation**: Contact forms and booking integration

### 🎯 Client Experience Features (NEW)

- **⭐ Client Favorites**: Allow clients to mark and manage their favorite photos
- **💬 Interactive Feedback**: Comment system for client feedback on specific photos
- **🔄 Selection Sync**: Real-time synchronization of client selections across devices
- **🔐 Password Protection**: Advanced PIN and password protection for galleries
- **📥 Smart Downloads**: Configurable download policies (view-only, watermarked, original)
- **📱 Proofing Portal**: Streamlined client approval workflows
- **🎨 Custom Gallery Themes**: Multiple gradient themes and branding options
- **🖼️ Magic Link Grid**: Auto-layout grid system for beautiful gallery displays

### 🧠 Enhanced AI Features (NEW)

- **🏷️ Smart Tagging Cache**: Local tagging layer for faster AI-powered organization
- **👥 Face Group Merge**: Advanced face clustering with merge and split capabilities
- **🎯 Quality Scoring**: Automated photo quality assessment and ranking
- **💡 Smart Suggestions**: AI-powered recommendations for gallery organization
- **🔍 Content Analysis**: Scene detection, object recognition, and metadata enrichment
- **📊 Tagging Health**: Monitor and optimize AI tagging coverage across workspace
- **🔄 Bulk Reanalysis**: Re-analyze photos with improved AI models
- **⚙️ Multi-Provider Support**: Switch between Gemini, OpenAI, Anthropic, or local models

---

## 🏗️ Architecture

```mermaid
graph TB
    A[Client Applications] --> B[API Gateway]
    B --> C[Authentication Service]
    B --> D[Asset Management API]
    B --> E[Gallery Service]
    B --> F[AI Service]

    D --> G[(PostgreSQL + pgvector)]
    D --> H[(Redis Cache)]
    D --> I[(Object Storage)]

    F --> J[Face Recognition]
    F --> K[Semantic Search]
    F --> L[Auto Tagging]

    M[Background Workers] --> N[BullMQ Queues]
    N --> O[Asset Processing]
    N --> P[AI Analysis]
    N --> Q[Storage Lifecycle]

    R[External Integrations] --> S[Calendar APIs]
    R --> T[Payment Processors]
    R --> U[Email Services]
```

### 🛠️ Tech Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Frontend** | React 19 + TypeScript + Vite + Tailwind CSS | Modern web application with design system |
| **Backend** | Express 5 + TypeScript + FastAPI | RESTful API services (Node) + AI services (Python) |
| **AI Service** | Python FastAPI + FastMCP | AI/ML processing and Model Context Protocol |
| **Database** | PostgreSQL 16 + pgvector + PostGIS | Relational data + vector embeddings + geo search |
| **Cache** | Redis 7 + BullMQ | Caching, sessions, job queues |
| **Storage** | Cloudflare R2 / BYOS S3 | Object storage with CDN |
| **AI Providers** | Gemini / OpenAI / Anthropic / Azure / Local | Multi-provider AI with credit system |
| **Infrastructure** | Docker + Kubernetes | Container orchestration |
| **Monitoring** | Grafana + Loki + Prometheus | Observability and alerting |
| **Authentication** | Google OAuth (OIDC) + Local Auth | Enterprise authentication with MFA |

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
- **Python** 3.11+
- **Docker** and Docker Compose
- **PostgreSQL** 16+ and **Redis** 7+

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/rawdrive/RawDrive.git
   cd RawDrive
   ```

2. **Start development infrastructure**
   ```bash
   npm run docker:dev:up
   ```

3. **Install dependencies**
   ```bash
   # Frontend
   cd frontend && npm install

   # Backend
   cd ../backend && npm install

   # AI Service
   cd ../ai-service && pip install -r requirements.txt
   ```

4. **Set up environment**
   ```bash
   cp .env.example .env
   # Configure your environment variables
   ```

5. **Initialize database**
   ```bash
   cd backend
   npm run db:migrate
   npm run db:seed
   ```

6. **Start development servers**
   ```bash
   # Option 1: Start all services
   npm run dev:all

   # Option 2: Start individually
   npm run dev          # Frontend (localhost:3000)
   npm run dev:backend  # Backend (localhost:3001)
   cd ai-service && python -m uvicorn main:app --reload  # AI Service (localhost:8000)
   ```

### 🧪 Testing

```bash
# Frontend tests
cd frontend && npm test

# Backend tests
cd backend && npm test

# AI Service tests
cd ai-service && pytest

# Full test suite
npm run verify
```

### 📦 Production Build

```bash
# Build all services
npm run build:prod

# Start production containers
docker-compose -f infrastructure/docker/docker-compose.yml up -d
```

---

## 📁 Project Structure

```
RawDrive/
├── frontend/                 # React 19 + TypeScript + Vite
│   ├── public/              # Static assets and logos
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── pages/          # Route components
│   │   ├── services/       # API client services
│   │   └── types/          # TypeScript type definitions
│   └── tailwind.config.js   # Tailwind CSS configuration
├── backend/                 # Express 5 + TypeScript
│   ├── src/
│   │   ├── app/            # Application core
│   │   ├── routes/         # API route handlers
│   │   ├── services/       # Business logic services
│   │   └── config/         # Configuration modules
│   └── tests/              # Backend test suites
├── ai-service/              # Python FastAPI + AI/ML
│   ├── src/
│   │   ├── mcp/            # Model Context Protocol tools
│   │   ├── services/       # AI processing services
│   │   └── models/         # ML model definitions
│   └── tests/              # AI service tests
├── infrastructure/          # Docker, nginx, monitoring
├── docs/                   # Comprehensive documentation
└── CLAUDE.md               # AI assistant context
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

# AI Service
AI_PROVIDER=openai|anthropic|google
AI_API_KEY=your-ai-api-key
AI_MODEL=gpt-4|claude-3|gemini-pro

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

- **Face Recognition**: Automatic face detection and people clustering using advanced computer vision
- **Semantic Search**: Natural language photo search powered by CLIP embeddings
- **Auto Tagging**: Intelligent content recognition and metadata generation with local caching layer
- **Quality Scoring**: Automated assessment of photo quality and technical metrics
- **Scene Detection**: Automatic categorization of photo types and settings
- **Smart Curation**: AI-powered photo selection for galleries with confidence scoring
- **Duplicate Detection**: Identify and manage duplicate photos across libraries
- **Content Analysis**: Advanced image understanding with contextual insights

### AI Features by Tier

RawDrive's AI capabilities are included in each subscription tier:

**AI Features Access:**
- **Starter**: Basic AI tagging and organization
- **Professional**: Full AI tagging, face detection, and smart search
- **Business**: Advanced AI curation, duplicate detection, and bulk operations
- **Enterprise**: Unlimited AI processing with priority queuing and custom models
- **Trial**: Full Business-tier AI features for 30 days

**Available AI Operations:**
- Automatic photo tagging and categorization
- Face detection and people clustering
- Smart gallery curation and photo selection
- Duplicate detection across libraries
- Content analysis and metadata enrichment

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

### Supported AI Providers

- **Google Gemini**: Default provider for vision and multimodal tasks (hosted)
- **OpenAI**: GPT-4, DALL-E for image generation and analysis
- **Anthropic**: Claude 3 for advanced reasoning and content analysis
- **Azure AI**: Azure OpenAI and Azure AI Foundry hosted models
- **Local Models**: OpenAI-compatible endpoints (Ollama, LM Studio) for privacy-focused deployments

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

#### Digital Invitations & Events (Specs 016-020)
- **Save The Date & Wedding Invitations**: Create beautiful digital event invitations with customizable templates and themes
- **RSVP System**: Complete guest management with real-time responses, party size tracking, and dietary preferences
- **Multi-Language Support**: Indian language support (Hindi, Tamil, Telugu, Malayalam, Marathi, Bengali, Gujarati)
- **Guest List Management**: CSV imports, bulk operations, and export capabilities
- **Event Check-In**: QR code-based check-in system for event venues
- **Security Hardening**: Workspace isolation, duplicate RSVP prevention, and comprehensive audit logging

#### Public Profile & Branding (Specs 013, 021)
- **Photographer Profiles**: Showcase your work with custom public profiles
- **Company Profiles**: Professional business profiles with service offerings
- **Custom Branding**: Gradient themes, custom fonts, and logo integration
- **Mobile Responsive**: Fully optimized for mobile devices and tablets
- **SEO Optimization**: Search engine friendly pages for client discovery

#### Client Experience Enhancements (Specs 011-015)
- **Client Favorites**: Allow clients to mark and manage favorite photos with sync
- **Selection Sync**: Real-time synchronization of client selections across devices
- **Gallery Branding**: Custom gradient themes and enhanced visual presentation
- **Magic Link Grid**: Auto-layout system for beautiful gallery displays
- **Download Policies**: Fine-grained control over client download permissions

#### AI & Smart Features (Specs 005, 008, 010)
- **Smart Tagging Cache**: Local caching layer for faster AI operations
- **Face Group Merge**: Advanced face clustering with merge/split capabilities
- **AI Provider Settings**: Multi-provider support (Gemini, OpenAI, Anthropic, Azure)
- **Tagging Health Monitoring**: Track AI coverage and optimization across workspace
- **Bulk Reanalysis**: Re-process photos with improved AI models

#### Platform Improvements
- **Admin Microservice**: Platform-wide administration tools (Spec 001)
- **User Profile Settings**: Enhanced user management and preferences (Spec 002)
- **Shared Packages**: Reusable components and libraries (Spec 022)
- **Error Handling**: Comprehensive error boundaries and retry mechanisms

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

### Docker Compose (Development)

```bash
# Start all services
docker-compose -f infrastructure/docker/docker-compose.yml up -d

# View logs
docker-compose logs -f
```

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
- **🥇 AI Innovation Award** - Photography industry AI integration with multi-provider support
- **🏆 SaaS Excellence** - Outstanding user experience and platform reliability
- **🌟 Best Client Portal** - Professional gallery and client management system
- **🚀 Innovation in Events** - Digital invitation and RSVP management platform

---

## 💼 Subscription Tiers

| Feature | Starter | Professional | Business | Enterprise |
|---------|---------|--------------|----------|------------|
| **Storage** | 50 GB | 250 GB | 1 TB | Unlimited |
| **Workspaces** | 1 | 3 | 10 | Unlimited |
| **AI Credits/Month** | 100 | 500 | 2,000 | 10,000 |
| **Team Members** | 1 | 3 | 10 | Unlimited |
| **Galleries** | 10 | 50 | 200 | Unlimited |
| **Custom Domain** | ❌ | ✅ | ✅ | ✅ |
| **Face Recognition** | ❌ | ✅ | ✅ | ✅ |
| **Digital Invitations** | ❌ | Limited | ✅ | ✅ |
| **Public Profile** | Basic | ✅ | ✅ | ✅ |
| **API Access** | ❌ | Limited | ✅ | ✅ |
| **Priority Support** | ❌ | ❌ | ✅ | ✅ |
| **SLA Guarantee** | ❌ | ❌ | ❌ | 99.9% |
| **Dedicated Support** | ❌ | ❌ | ❌ | ✅ |

**Trial Period**: 30 days with Business-tier features and 2,000 AI credits

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

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**Built with ❤️ for professional photographers worldwide**

[🌟 Star us on GitHub](https://github.com/rawdrive/RawDrive) • [📧 Contact Us](mailto:hello@rawdrive.com) • [🌐 Visit RawDrive](https://rawdrive.com)

</div>

---

*RawDrive - Where Professional Photography Meets Enterprise Power* 🚀
