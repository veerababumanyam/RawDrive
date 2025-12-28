# Quickstart Guide - Smart Local Tagging Layer

This guide provides step-by-step instructions to get the Smart Local Tagging Layer up and running.

## Prerequisites

- Node.js 18+
- Python 3.9+
- Docker & Docker Compose
- PostgreSQL 15+ with pgvector extension
- Redis

## 1. Environment Setup

### Start Development Containers
```bash
npm run docker:dev:up
```

This starts PostgreSQL + pgvector and Redis containers.

### Install Dependencies
```bash
# Frontend
cd frontend && npm install

# Backend
cd backend && npm install

# AI Service
cd ai-service && pip install -r requirements.txt
```

## 2. Database Setup

### Run Migrations
```bash
cd backend && npm run db:migrate
```

### Seed Development Data
```bash
cd backend && npm run db:seed
```

## 3. Start Services

### Development Mode (Concurrent)
```bash
npm run dev:all
```

This starts:
- Frontend: http://localhost:3000
- Backend: http://localhost:3001
- AI Service: http://localhost:3002

### Individual Services
```bash
# Frontend only
npm run dev

# Backend only
npm run dev:backend

# AI Service only
cd ai-service && python -m uvicorn main:app --reload
```

## 4. Start Background Workers

```bash
cd backend && npm run workers
```

This starts the content detection worker for AI tagging.

## 5. Verify Installation

### Health Check
```bash
curl http://localhost:3001/api/v1/health
```

### Test AI Tagging
1. Upload a photo via the frontend
2. Check gallery health dashboard for AI analysis status
3. Use search with tags/people filters

## Troubleshooting

### Database Connection Issues
- Ensure Docker containers are running: `docker ps`
- Check connection: `cd backend && npm run db:check`

### Worker Not Processing
- Check worker logs: `cd backend && npm run workers:logs`
- Verify Redis connection

### AI Provider Issues
- Check AI service logs
- Verify API keys in environment variables

## Next Steps

- Explore the [API Documentation](./docs/api/)
- Review [Architecture Overview](./docs/architecture/)
- Check [Development Roadmap](./docs/DEVELOPMENT_ROADMAP.md)</content>
<parameter name="filePath">/Users/v13478/Desktop/RawDrive/docs/quickstart.md