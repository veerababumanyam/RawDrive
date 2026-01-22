#!/bin/bash
# Database initialization script for RawDrive
# This script ensures all required databases exist and are properly initialized

set -e

POSTGRES_HOST=${POSTGRES_HOST:-postgres}
POSTGRES_USER=${POSTGRES_USER:-rawdrive}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-rawdrive}
POSTGRES_DB=${POSTGRES_DB:-rawdrive}

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
until pg_isready -h "$POSTGRES_HOST" -U "$POSTGRES_USER" >/dev/null 2>&1; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 2
done

echo "PostgreSQL is ready!"

# List of databases to create
DATABASES=(
  "rawdrive"
  "one_api"
)

# Create databases if they don't exist
for db in "${DATABASES[@]}"; do
  echo "Ensuring database '$db' exists..."
  PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = '$db'" | grep -q 1 || \
  PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE $db;"

  if [ $? -eq 0 ]; then
    echo "✓ Database '$db' is ready"
  else
    echo "✗ Failed to create database '$db'"
  fi
done

# Enable pgvector extension on main database
echo "Enabling pgvector extension..."
PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE EXTENSION IF NOT EXISTS pgvector;" 2>/dev/null || true

echo "✓ Database initialization complete!"
