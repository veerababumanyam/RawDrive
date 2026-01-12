#!/bin/bash
# Test script for client activities and communications endpoints

# Configuration
BASE_URL="${BASE_URL:-http://localhost}"
WORKSPACE_ID="${WORKSPACE_ID:-11111111-1111-1111-1111-000000000003}"
CLIENT_ID="${CLIENT_ID:-bbcb9575-788c-4f52-b7c2-8a609cc11d8a}"
TOKEN="${TOKEN:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Testing Client Activities & Communications"
echo "=========================================="
echo ""

# Check if token is provided
if [ -z "$TOKEN" ]; then
    echo -e "${YELLOW}Warning: TOKEN not set. Set it as environment variable:${NC}"
    echo "export TOKEN='your-jwt-token'"
    echo ""
fi

# Test 1: Record Activity
echo -e "${YELLOW}Test 1: Record Activity${NC}"
ACTIVITY_PAYLOAD=$(cat <<EOF
{
  "activity_type": "note",
  "title": "Test Activity",
  "description": "This is a test activity created via script",
  "metadata": {
    "activity_date": "2026-01-09"
  }
}
EOF
)

echo "Payload: $ACTIVITY_PAYLOAD"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "${BASE_URL}/api/v1/workspaces/${WORKSPACE_ID}/clients/${CLIENT_ID}/activities" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "$ACTIVITY_PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 201 ] || [ "$HTTP_CODE" -eq 200 ]; then
    echo -e "${GREEN}✓ Activity recorded successfully (HTTP $HTTP_CODE)${NC}"
    echo "Response: $BODY"
else
    echo -e "${RED}✗ Failed to record activity (HTTP $HTTP_CODE)${NC}"
    echo "Response: $BODY"
fi
echo ""

# Test 2: Log Communication
echo -e "${YELLOW}Test 2: Log Communication${NC}"
COMM_PAYLOAD=$(cat <<EOF
{
  "communication_type": "email",
  "direction": "outbound",
  "subject": "Test Communication",
  "notes": "This is a test communication logged via script",
  "follow_up_required": false
}
EOF
)

echo "Payload: $COMM_PAYLOAD"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "${BASE_URL}/api/v1/workspaces/${WORKSPACE_ID}/clients/${CLIENT_ID}/communications" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "$COMM_PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 201 ] || [ "$HTTP_CODE" -eq 200 ]; then
    echo -e "${GREEN}✓ Communication logged successfully (HTTP $HTTP_CODE)${NC}"
    echo "Response: $BODY"
else
    echo -e "${RED}✗ Failed to log communication (HTTP $HTTP_CODE)${NC}"
    echo "Response: $BODY"
fi
echo ""

# Test 3: Get Activities
echo -e "${YELLOW}Test 3: Get Activities${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
  "${BASE_URL}/api/v1/workspaces/${WORKSPACE_ID}/clients/${CLIENT_ID}/activities?page=1&limit=10" \
  -H "Authorization: Bearer ${TOKEN}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
    echo -e "${GREEN}✓ Activities retrieved successfully (HTTP $HTTP_CODE)${NC}"
    echo "Response structure: $(echo "$BODY" | jq 'keys' 2>/dev/null || echo 'JSON parse failed')"
else
    echo -e "${RED}✗ Failed to get activities (HTTP $HTTP_CODE)${NC}"
    echo "Response: $BODY"
fi
echo ""

# Test 4: Get Communications
echo -e "${YELLOW}Test 4: Get Communications${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
  "${BASE_URL}/api/v1/workspaces/${WORKSPACE_ID}/clients/${CLIENT_ID}/communications?page=1&limit=10" \
  -H "Authorization: Bearer ${TOKEN}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
    echo -e "${GREEN}✓ Communications retrieved successfully (HTTP $HTTP_CODE)${NC}"
    echo "Response structure: $(echo "$BODY" | jq 'keys' 2>/dev/null || echo 'JSON parse failed')"
else
    echo -e "${RED}✗ Failed to get communications (HTTP $HTTP_CODE)${NC}"
    echo "Response: $BODY"
fi
echo ""

echo "=========================================="
echo "Tests completed"
echo "=========================================="
