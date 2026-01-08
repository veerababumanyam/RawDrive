#!/bin/bash
# Run integration tests for upload-service

set -e

echo "Running Upload Service Integration Tests..."

# Navigate to service directory
cd "$(dirname "$0")/.."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -q -r requirements.txt

# Check if Docker services are running
if ! docker info > /dev/null 2>&1; then
    echo "Warning: Docker is not running. Some tests may fail."
fi

# Run pytest with integration tests
echo "Running integration tests..."
pytest tests/integration/ -v \
    --cov=src \
    --cov-report=term-missing \
    --cov-report=html \
    -m "not load"

# Check exit code
if [ $? -eq 0 ]; then
    echo "✅ All integration tests passed!"
    echo "Coverage report generated at htmlcov/index.html"
else
    echo "❌ Some tests failed. Check the output above."
    exit 1
fi
