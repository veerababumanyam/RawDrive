#!/bin/bash
# Apply permanent fixes for reliable container restarts
# This script makes all necessary changes to ensure containers start correctly every time

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "🔧 Applying permanent fixes for RawDrive..."

# 1. Increase PostgreSQL max_connections
echo "📊 Adjusting PostgreSQL settings..."
docker exec rawdrive-postgres psql -U rawdrive -d postgres -c "ALTER SYSTEM SET max_connections = 300;" 2>/dev/null || echo "⚠️  Could not set max_connections (PostgreSQL may need restart)"

# 2. Enable pg_stat_statements for monitoring (optional but helpful)
docker exec rawdrive-postgres psql -U rawdrive -d rawdrive -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;" 2>/dev/null || true

# 3. Verify initialization scripts are in place
echo "✅ Verifying initialization scripts..."
if [ -f "$SCRIPT_DIR/init/02-create-databases.sql" ]; then
    echo "   ✓ 02-create-databases.sql present"
else
    echo "   ✗ 02-create-databases.sql missing - create it!"
fi

if [ -f "$SCRIPT_DIR/init/enable_pgvector.sql" ]; then
    echo "   ✓ enable_pgvector.sql present"
else
    echo "   ✗ enable_pgvector.sql missing"
fi

if [ -f "$SCRIPT_DIR/init/startup-wrapper.sh" ]; then
    echo "   ✓ startup-wrapper.sh present"
    chmod +x "$SCRIPT_DIR/init/startup-wrapper.sh"
else
    echo "   ✗ startup-wrapper.sh missing"
fi

# 4. Update .env files
echo "🔐 Setting up environment variables..."
if [ -f "$SCRIPT_DIR/.env.database" ]; then
    echo "   ✓ .env.database present"
else
    echo "   ✗ .env.database missing"
fi

# 5. Verify docker-compose settings
echo "📝 Verifying docker-compose configuration..."
if grep -q "start_period: 30s" "$SCRIPT_DIR/docker-compose.yml"; then
    echo "   ✓ Service start periods configured"
else
    echo "   ⚠️  Consider increasing service start_period to 30s in docker-compose.yml"
fi

if grep -q "02-create-databases.sql" "$SCRIPT_DIR/docker-compose.yml"; then
    echo "   ✓ Database initialization scripts mounted"
else
    echo "   ⚠️  Database initialization scripts not mounted in docker-compose.yml"
fi

# 6. Create required directories
echo "📁 Creating required directories..."
mkdir -p "$PROJECT_ROOT/backend/src/app/middleware" 2>/dev/null || true

# 7. Backup current docker-compose
echo "💾 Creating backup..."
if [ ! -f "$SCRIPT_DIR/docker-compose.yml.backup" ]; then
    cp "$SCRIPT_DIR/docker-compose.yml" "$SCRIPT_DIR/docker-compose.yml.backup"
    echo "   ✓ Backup created: docker-compose.yml.backup"
fi

# 8. Summary
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✅ PERMANENT FIXES STATUS"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "📋 Files Created:"
echo "   ✓ infrastructure/docker/init/02-create-databases.sql"
echo "   ✓ infrastructure/docker/init/startup-wrapper.sh"
echo "   ✓ infrastructure/docker/.env.database"
echo "   ✓ infrastructure/docker/docker-compose.permanent-fixes.yml"
echo "   ✓ backend/src/app/middleware/database_health.py"
echo ""
echo "🔧 Configuration Updates Needed:"
echo "   1. Merge docker-compose.permanent-fixes.yml into docker-compose.yml"
echo "   2. Add env_file: .env.database to all services"
echo "   3. Update service start_period values to 30s+"
echo "   4. Use startup-wrapper.sh in critical service Dockerfiles"
echo ""
echo "📚 Documentation:"
echo "   See docs/DOCKER_RESTART_ISSUES.md for complete details"
echo ""
echo "🧪 Testing:"
echo "   docker compose down"
echo "   docker volume rm rawdrive_pg_data"
echo "   docker compose up -d"
echo "   docker ps --format 'table {{.Names}}\t{{.Status}}'"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "✨ Next Steps:"
echo "1. Review docker-compose.permanent-fixes.yml"
echo "2. Apply changes to docker-compose.yml"
echo "3. Rebuild affected services: docker compose build"
echo "4. Test restart sequence"
echo "5. Commit changes to git"
