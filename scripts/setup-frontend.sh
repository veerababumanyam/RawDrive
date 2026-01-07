#!/bin/bash
# Frontend Setup Script
# Builds shared packages and sets up frontend dependencies

set -e

echo "========================================================================="
echo "RawDrive Frontend Setup"
echo "========================================================================="

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Step 1: Install pnpm if not available
echo -e "\n${GREEN}[1/5] Checking pnpm installation...${NC}"
if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}pnpm not found, installing...${NC}"
    npm install -g pnpm
fi
echo -e "${GREEN}✓ pnpm available${NC}"

# Step 2: Install root dependencies
echo -e "\n${GREEN}[2/5] Installing root dependencies...${NC}"
pnpm install

# Step 3: Build shared packages
echo -e "\n${GREEN}[3/5] Building shared packages...${NC}"

# List of shared packages to build
SHARED_PACKAGES=(
    "shared-types"
    "shared-constants"
    "shared-validation"
    "shared-utils"
)

for pkg in "${SHARED_PACKAGES[@]}"; do
    PKG_DIR="packages/$pkg"

    if [ -d "$PKG_DIR" ]; then
        echo -e "${GREEN}Building @rawdrive/$pkg...${NC}"
        cd "$PKG_DIR"

        # Clean dist directory
        rm -rf dist

        # Build package
        if [ -f "package.json" ]; then
            # Check if build script exists
            if grep -q '"build"' package.json; then
                pnpm build || {
                    echo -e "${RED}✗ Failed to build $pkg${NC}"
                    exit 1
                }

                # Verify build output
                if [ -d "dist" ] && [ "$(ls -A dist)" ]; then
                    echo -e "${GREEN}✓ $pkg built successfully${NC}"
                else
                    echo -e "${YELLOW}⚠ Warning: $pkg build produced no output${NC}"
                fi
            else
                echo -e "${YELLOW}⚠ No build script for $pkg${NC}"
            fi
        fi

        cd "$PROJECT_ROOT"
    else
        echo -e "${YELLOW}⚠ Package $pkg not found, skipping${NC}"
    fi
done

# Step 4: Generate Python types from TypeScript
echo -e "\n${GREEN}[4/5] Generating Python types from TypeScript...${NC}"
if [ -f "scripts/generate-python-types.ts" ]; then
    pnpm generate:python || {
        echo -e "${YELLOW}⚠ Warning: Python type generation failed${NC}"
    }
else
    echo -e "${YELLOW}⚠ Python type generator script not found${NC}"
fi

# Step 5: Install frontend dependencies
echo -e "\n${GREEN}[5/5] Installing frontend dependencies...${NC}"
cd frontend
pnpm install

# Verify shared packages are linked
echo -e "\n${GREEN}Verifying shared package linking...${NC}"
for pkg in "${SHARED_PACKAGES[@]}"; do
    if pnpm list "@rawdrive/$pkg" 2>&1 | grep -q "@rawdrive/$pkg"; then
        echo -e "${GREEN}✓ @rawdrive/$pkg linked${NC}"
    else
        echo -e "${YELLOW}⚠ @rawdrive/$pkg not found in dependencies${NC}"
    fi
done

cd "$PROJECT_ROOT"

echo -e "\n${GREEN}=========================================================================${NC}"
echo -e "${GREEN}✅ Frontend setup complete!${NC}"
echo -e "${GREEN}=========================================================================${NC}"

echo -e "\nNext steps:"
echo -e "  1. Start frontend: ${GREEN}cd frontend && pnpm dev${NC}"
echo -e "  2. Access app: ${GREEN}http://localhost:5173${NC}"
