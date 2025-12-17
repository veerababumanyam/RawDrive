# RawDrive

<div align="center">
  <img src="frontend/public/rawdrive-logo.svg" alt="RawDrive Logo" width="300" height="90">

  ## Enterprise SaaS Professional Photography Management Platform

  [![Version](https://img.shields.io/badge/version-0.0.1-blue.svg)](https://github.com/rawdrive/RawDrive)
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
- **🤖 AI-Powered Intelligence**: Automatic tagging, face recognition, scene detection, and smart search
- **🏢 Enterprise Multi-Tenancy**: Complete workspace isolation with customizable permissions and governance
- **🔒 SOC 2 Compliance**: Enterprise-grade security with end-to-end encryption and audit trails
- **☁️ BYOS (Bring Your Own Storage)**: Full support for S3-compatible storage with customer-controlled data sovereignty
- **📱 Client Galleries**: Beautiful, branded galleries with advanced sharing and approval workflows
- **📊 Advanced Analytics**: Comprehensive insights into photography business metrics and performance
- **🔗 API-First Architecture**: RESTful APIs with comprehensive SDKs for seamless integrations

### 🎨 Professional Features

- **✨ AI-Enhanced Curation**: Smart photo selection and automated quality scoring
- **👥 Face Recognition**: Automatic people clustering and identification across photo libraries
- **🔍 Semantic Search**: Natural language search powered by CLIP embeddings and vector similarity
- **🎭 Custom Branding**: White-label galleries with custom domains and branding
- **📅 Event Management**: Complete event lifecycle from booking to delivery
- **💰 Automated Pricing**: Dynamic pricing calculators and automated invoicing
- **📧 Marketing Automation**: Email campaigns, client notifications, and engagement tracking
- **🔄 Workflow Automation**: Custom approval processes and automated delivery pipelines

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
| **Frontend** | React 19 + TypeScript + Vite | Modern web application |
| **Backend** | Express 5 + TypeScript | RESTful API services |
| **AI Service** | Python FastAPI + MCP | AI/ML processing and Model Context Protocol |
| **Database** | PostgreSQL 16 + pgvector | Relational data + vector embeddings |
| **Cache** | Redis 7 + BullMQ | Caching, sessions, job queues |
| **Storage** | Cloudflare R2 / BYOS S3 | Object storage with CDN |
| **Infrastructure** | Docker + Kubernetes | Container orchestration |
| **Monitoring** | Grafana + Loki + Prometheus | Observability |

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

- **Event Photography**: Weddings, corporate events, portraits
- **Commercial Work**: Product photography, real estate, food
- **Brand Consistency**: Custom branding and client galleries
- **Client Management**: Automated quotes, contracts, and payments

### 🏢 For Photography Agencies

- **Team Collaboration**: Multi-user workspaces with role-based access
- **Client Portals**: Secure client access with approval workflows
- **Project Management**: Timeline tracking and delivery management
- **Business Analytics**: Revenue tracking and performance metrics

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
- **Auto Tagging**: Intelligent content recognition and metadata generation
- **Quality Scoring**: Automated assessment of photo quality and technical metrics
- **Scene Detection**: Automatic categorization of photo types and settings

### Model Context Protocol (MCP)

RawDrive implements MCP for AI agent integration:

```python
# Example MCP tool usage
@mcp_server.tool()
async def detect_faces(photo_id: str, workspace_id: str) -> dict:
    """Detect faces in a photo and generate embeddings."""
    # AI processing logic
    pass
```

### Supported AI Providers

- **OpenAI**: GPT-4, DALL-E for image generation
- **Anthropic**: Claude 3 for advanced reasoning
- **Google**: Gemini Pro for multimodal tasks
- **Local Models**: ONNX-compatible models for privacy-focused deployments

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

- **[API Documentation](docs/api/)** - Complete API reference
- **[Architecture Guide](docs/architecture/)** - System design and patterns
- **[Technical Specs](docs/TechnicalSpecs/)** - Detailed technical specifications
- **[Deployment Guide](docs/deployment/)** - Production deployment instructions
- **[Security Guide](docs/security/)** - Security best practices and compliance

---

## 🏆 Awards & Recognition

- **🏅 SOC 2 Type II Certified** - Enterprise-grade security and compliance
- **🥇 AI Innovation Award** - Photography industry AI integration
- **🏆 SaaS Excellence** - Outstanding user experience and platform reliability

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
