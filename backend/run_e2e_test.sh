#!/bin/bash
# Run end-to-end gallery workflow test

set -e

echo "🚀 Running Gallery Workflow End-to-End Test"
echo "=============================================="
echo ""

# Check if backend is running
if ! curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "❌ Error: Backend server is not running on http://localhost:8000"
    echo "   Please start the backend server first:"
    echo "   cd backend && npm run dev:backend"
    exit 1
fi

echo "✓ Backend server is running"
echo ""

# Run the test
cd "$(dirname "$0")"
./venv/bin/python -m tests.e2e.test_gallery_workflow

echo ""
echo "✅ Test completed!"


