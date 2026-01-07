#!/bin/bash

echo "========================================="
echo "Testing RawDrive Services Health"
echo "========================================="

echo -e "\n1. Backend (port 8000):"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:8000/health || echo "  FAILED"

echo -e "\n2. Onboarding Service (port 8006):"
curl -s http://localhost:8006/health || echo "  FAILED"

echo -e "\n3. Gallery Service (port 8004):"
curl -s http://localhost:8004/health || echo "  FAILED"

echo -e "\n4. Billing Service (port 8005):"
curl -s http://localhost:8005/health || echo "  FAILED"

echo -e "\n5. Invitations API (port 8007):"
curl -s http://localhost:8007/health || echo "  FAILED"

echo -e "\n6. Upload Service (port 8008):"
curl -s http://localhost:8008/health || echo "  FAILED"

echo -e "\n========================================="
echo "Checking Loki Logging Service"
echo "========================================="

echo -e "\n7. Loki Ready Check:"
curl -s http://localhost:3100/ready && echo " ✓ Loki is ready" || echo "  FAILED"

echo -e "\n8. Loki Labels:"
curl -s 'http://localhost:3100/loki/api/v1/labels'

echo -e "\n\n9. Recent Logs Query:"
curl -s 'http://localhost:3100/loki/api/v1/query_range?query=%7Bjob%3D%22rawdrive%22%7D&limit=5'

echo -e "\n\n========================================="
echo "Test Complete"
echo "========================================="
