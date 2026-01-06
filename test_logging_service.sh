#!/bin/bash

# Test logging service with different test users
# Password for all test users: Test@123

BASE_URL="http://localhost:8000"
PASSWORD="Test@123"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;37m'
NC='\033[0m' # No Color

# Test users
declare -a TEST_USERS=(
    "free@test.rawdrive.in:Free"
    "starter@test.rawdrive.in:Starter"
    "professional@test.rawdrive.in:Professional"
    "business@test.rawdrive.in:Business"
    "enterprise@test.rawdrive.in:Enterprise"
)

echo -e "${CYAN}========================================"
echo -e "Testing Logging Service with Test Users"
echo -e "========================================${NC}\n"

# Wait for backend to be ready
echo -e "${YELLOW}Checking if backend is ready...${NC}"
for i in {1..10}; do
    if curl -s -f http://localhost:8000/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Backend is ready!${NC}\n"
        break
    fi
    echo "  Waiting for backend... (attempt $i/10)"
    sleep 2
done

# Test each user
for user_entry in "${TEST_USERS[@]}"; do
    IFS=':' read -r email plan <<< "$user_entry"
    
    echo -e "${YELLOW}Testing user: $plan - $email${NC}"
    
    # Login request
    login_response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$email\",\"password\":\"$PASSWORD\"}")
    
    http_code=$(echo "$login_response" | tail -n1)
    response_body=$(echo "$login_response" | sed '$d')
    
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}  ✓ Login successful!${NC}"
        
        user_id=$(echo "$response_body" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
        access_token=$(echo "$response_body" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
        
        echo -e "${GRAY}  User ID: $user_id${NC}"
        echo -e "${GRAY}  Token: ${access_token:0:20}...${NC}"
        
        # Test authenticated request (this generates logs)
        profile_response=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/api/v1/users/me" \
            -H "Authorization: Bearer $access_token")
        
        profile_http_code=$(echo "$profile_response" | tail -n1)
        
        if [ "$profile_http_code" = "200" ]; then
            echo -e "${GREEN}  ✓ Profile fetch successful!${NC}"
        else
            echo -e "${RED}  ✗ Profile fetch failed (HTTP $profile_http_code)${NC}"
        fi
    else
        echo -e "${RED}  ✗ Login failed (HTTP $http_code)${NC}"
        echo -e "${RED}  Error: $response_body${NC}"
    fi
    
    echo ""
    sleep 0.5
done

echo -e "${CYAN}========================================"
echo -e "Checking Loki Logs"
echo -e "========================================${NC}\n"

# Query Loki for recent logs
LOKI_URL="http://localhost:3100"
QUERY='{job="rawdrive"}'

echo -e "${GRAY}Querying Loki for logs...${NC}"

loki_response=$(curl -s "$LOKI_URL/loki/api/v1/query_range?query=$(echo -n "$QUERY" | jq -sRr @uri)&limit=100")

result_count=$(echo "$loki_response" | grep -o '"result":\[' | wc -l)

if [ "$result_count" -gt 0 ]; then
    echo -e "${GREEN}  ✓ Found log streams in Loki${NC}\n"
    
    echo -e "${YELLOW}Sample log entries:${NC}"
    echo "$loki_response" | jq -r '.data.result[]?.values[]?[1]' 2>/dev/null | head -n 10 | while read -r log_line; do
        echo -e "${GRAY}  $log_line${NC}"
    done
else
    echo -e "${YELLOW}  ⚠ No logs found in Loki${NC}"
fi

echo -e "\n${CYAN}Test completed!${NC}"
