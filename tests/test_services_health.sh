#!/bin/bash

# Test onboarding service which is healthy

echo "Testing Onboarding Service Health..."
curl -s http://localhost:8006/health | jq . || echo "Failed to connect to onboarding service"

echo -e "\nTesting Gallery Service Health..."
curl -s http://localhost:8004/health | jq . || echo "Failed to connect to gallery service"

echo -e "\nTesting Billing Service Health..."
curl -s http://localhost:8005/health | jq . || echo "Failed to connect to billing service"

echo -e "\nTesting Invitations API Health..."
curl -s http://localhost:8007/health | jq . || echo "Failed to connect to invitations API"

echo -e "\nChecking Loki status..."
curl -s http://localhost:3100/ready || echo "Loki not ready"

echo -e "\n\nChecking recent logs in Loki..."
curl -s 'http://localhost:3100/loki/api/v1/labels' | jq .

echo -e "\n\nTest complete!"
