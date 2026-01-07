#!/bin/bash
# =============================================================================
# Photo Sync Service Development Script
# =============================================================================
#
# Starts the Photo Sync Service for local development.
#
# Usage:
#   ./scripts/dev-photo-sync-service.sh [options]
#
# Options:
#   --worker    Also start the worker process
#   --debug     Enable debug logging
#   --clean     Clean and rebuild before starting
#
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
START_WORKER=false
DEBUG_MODE=false
CLEAN_BUILD=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --worker)
      START_WORKER=true
      shift
      ;;
    --debug)
      DEBUG_MODE=true
      shift
      ;;
    --clean)
      CLEAN_BUILD=true
      shift
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Navigate to service directory
cd "$(dirname "$0")/../services/photo-sync-service"

echo -e "${GREEN}=== Photo Sync Service Development ===${NC}"
echo ""

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
  echo -e "${YELLOW}Installing dependencies...${NC}"
  npm install
fi

# Clean build if requested
if [ "$CLEAN_BUILD" = true ]; then
  echo -e "${YELLOW}Cleaning previous build...${NC}"
  rm -rf dist
  npm run build
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
  echo -e "${YELLOW}Creating .env file from .env.example...${NC}"
  cp .env.example .env
  echo -e "${YELLOW}Please update .env with your credentials${NC}"
fi

# Set debug logging if requested
if [ "$DEBUG_MODE" = true ]; then
  export LOG_LEVEL=debug
fi

# Start the service
echo -e "${GREEN}Starting Photo Sync Service...${NC}"
echo ""

if [ "$START_WORKER" = true ]; then
  echo -e "${YELLOW}Starting API and Worker processes...${NC}"
  # Use concurrently to run both processes
  npx concurrently \
    --names "api,worker" \
    --prefix-colors "cyan,magenta" \
    "npm run dev" \
    "npm run worker:dev"
else
  echo -e "${YELLOW}Starting API process only...${NC}"
  echo -e "${YELLOW}Use --worker flag to also start the worker${NC}"
  echo ""
  npm run dev
fi
