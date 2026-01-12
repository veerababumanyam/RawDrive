# RawDrive Quick Start Guide

**Last Updated**: 2026-01-09  
**Get up and running in 5 minutes**

## 🚀 One-Command Setup

### Windows
```powershell
.\setup-dev-environment.ps1
```

### Linux / macOS / WSL
```bash
bash scripts/setup-all.sh
```

**That's it!** The script will:
- ✅ Start all Docker services
- ✅ Run database migrations
- ✅ Seed test users
- ✅ Build shared packages
- ✅ Configure environment

## 🌐 Access the Application

### Frontend
Open your browser to: **http://localhost:5173**

### Test Login
- **Email**: `free@test.rawdrive.in`
- **Password**: `Test@123`

### Admin Dashboards
- **Grafana**: http://localhost:3000 (admin/admin)
- **Traefik**: http://localhost:8080
- **Prometheus**: http://localhost:9090

## 📋 Prerequisites

Make sure you have installed:
- **Docker Desktop** (Windows/Mac) or **Docker Engine** (Linux)
- **Node.js** 18+ and **pnpm** 8+
- **Git**

## 🛠️ Common Commands

### Start Development
```bash
# Start all services
manage-services.bat start

# Start frontend dev server
cd frontend && pnpm dev
```

### View Logs
```bash
# All services
manage-services.bat logs

# Specific service
manage-services.bat logs gallery-service
```

### Run Tests
```bash
# Frontend
cd frontend && pnpm test

# Backend
docker exec rawdrive-backend pytest
```

### Database
```bash
# Run migrations
docker exec rawdrive-backend alembic upgrade head

# Create migration
docker exec rawdrive-backend alembic revision -m "description"
```

## 🔍 Health Check

Verify all services are running:

```bash
# Check service status
docker compose -f infrastructure/docker/docker-compose.yml ps

# Test API endpoints
curl http://localhost:8000/health/live
curl http://localhost:8004/health/live
```

Expected: All services show `healthy` status

## 🎯 What's Running?

After setup, you'll have 20 services running:

### Microservices (8)
- **Backend** (8000) - Main API
- **Gallery Service** (8004) - Gallery viewing
- **Billing Service** (8005) - Payments
- **Upload Service** (8008) - File uploads
- **Onboarding Service** (8006) - Registration
- **Invitations Service** (8007) - Invitations
- **Webhooks Service** (8003) - Webhooks
- **Notifications Service** (8010) - Notifications

### Infrastructure (8)
- **PostgreSQL** (5432) - Database
- **Redis** (6379) - Cache
- **Traefik** (80, 8080) - API Gateway
- **Prometheus** (9090) - Metrics
- **Grafana** (3000) - Dashboards
- **Loki** (3100) - Logs
- **PgBouncer** (6432) - Connection pooling
- **One-API** (3002) - AI gateway

### Workers (4)
- Face detection, Content analysis, Quality scoring, Email processing

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Windows
netstat -ano | findstr :8004
taskkill /F /PID <PID>

# Linux/Mac
lsof -ti:8004 | xargs kill -9
```

### Service Won't Start
```bash
# Check logs
manage-services.bat logs <service-name>

# Rebuild service
docker compose -f infrastructure/docker/docker-compose.yml up -d --build <service-name>
```

### Frontend Build Errors
```bash
# Rebuild shared packages
pnpm build:packages

# Restart dev server
cd frontend && pnpm dev
```

### Reset Everything
```bash
# Stop and remove all containers
docker compose -f infrastructure/docker/docker-compose.yml down -v

# Start fresh
.\setup-dev-environment.ps1
```

## 📚 Next Steps

### For Developers
1. **[Development Setup](guides/development-setup.md)** - Detailed setup guide
2. **[Coding Standards](development/coding-standards.md)** - Code style guide
3. **[Testing Guide](guides/testing.md)** - Testing strategy
4. **[Test Users](development/test-users.md)** - All test accounts

### For Architects
1. **[Architecture Overview](architecture/overview.md)** - System design
2. **[Microservices](architecture/microservices.md)** - Service architecture
3. **[Database Design](architecture/database-design.md)** - Schema and models
4. **[Tech Stack](architecture/tech-stack.md)** - Technology choices

### For Product Managers
1. **[Feature Index](features/README.md)** - All features
2. **[PRD](../.claude/PRD.md)** - Product requirements
3. **[Business Features](Business_Features/README.md)** - Business specs

## 🆘 Need Help?

1. **Check**: [Troubleshooting Guide](guides/troubleshooting.md)
2. **Review**: [Documentation Index](README.md)
3. **Consult**: [Claude Code References](../.claude/reference/)
4. **View Logs**: `manage-services.bat logs <service>`

## 💡 Pro Tips

- **Auto-restart enabled**: Services start automatically with Docker Desktop
- **Hot reload**: Frontend and backend support hot module replacement
- **Shared packages**: Run `pnpm build:packages` after pulling changes
- **Database reset**: Use `down -v` to wipe data and start fresh
- **Test users**: Multiple test accounts for different subscription tiers

---

**Ready to dive deeper?** Check out the [full documentation](README.md) or start coding!

**Related Documentation**:
- [Development Setup](guides/development-setup.md)
- [Architecture Overview](architecture/overview.md)
- [Testing Guide](guides/testing.md)
- [API Documentation](api/README.md)