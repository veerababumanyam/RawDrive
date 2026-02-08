#!/usr/bin/env python3
"""
Google OAuth Diagnostic Test Script
Tests the OAuth flow end-to-end to identify issues
"""

import os
import sys
import json
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
from threading import Thread
import webbrowser
import requests

# Colors for output
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def print_header(msg):
    print(f"\n{Colors.HEADER}{Colors.BOLD}{'='*60}{Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}{msg:^60}{Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}{'='*60}{Colors.ENDC}\n")

def print_success(msg):
    print(f"{Colors.OKGREEN}[OK] {msg}{Colors.ENDC}")

def print_error(msg):
    print(f"{Colors.FAIL}[FAIL] {msg}{Colors.ENDC}")

def print_warning(msg):
    print(f"{Colors.WARNING}[WARN] {msg}{Colors.ENDC}")

def print_info(msg):
    print(f"{Colors.OKCYAN}[INFO] {msg}{Colors.ENDC}")

# Test Configuration
BASE_URL = "http://localhost"  # Traefik on port 80
ALT_BASE_URL = "http://localhost:8000"  # Direct backend

def test_backend_health(base_url):
    """Test if backend is accessible"""
    print_info(f"Testing backend health at {base_url}/health/live...")
    try:
        response = requests.get(f"{base_url}/health/live", timeout=5)
        if response.status_code == 200:
            print_success(f"Backend is healthy at {base_url}")
            return True
        else:
            print_error(f"Backend returned status {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print_error(f"Cannot connect to backend at {base_url}")
        return False
    except Exception as e:
        print_error(f"Error: {e}")
        return False

def test_oauth_start_endpoint(base_url):
    """Test the OAuth start endpoint"""
    print_info(f"Testing OAuth start endpoint at {base_url}/api/v1/auth/oauth/google/start...")
    try:
        # Use the frontend's redirect URL (through Traefik)
        redirect_uri = "http://localhost/workspace"
        url = f"{base_url}/api/v1/auth/oauth/google/start?redirect_uri={urllib.parse.quote(redirect_uri)}"

        response = requests.get(url, allow_redirects=False, timeout=10)

        if response.status_code == 302:
            google_url = response.headers.get('Location', '')
            if 'accounts.google.com' in google_url:
                print_success(f"OAuth start endpoint redirects to Google")
                print_info(f"Google Auth URL: {google_url[:100]}...")

                # Extract the redirect_uri parameter from the Google URL
                parsed = urllib.parse.urlparse(google_url)
                params = urllib.parse.parse_qs(parsed.query)
                google_redirect = params.get('redirect_uri', [None])[0]

                if google_redirect:
                    print_info(f"Google OAuth will redirect to: {google_redirect}")

                    if 'localhost:8000' in google_redirect or 'localhost:3000' in google_redirect:
                        print_warning("⚠ CRITICAL: The redirect_uri contains a port number!")
                        print_warning("This should be 'http://localhost/api/v1/auth/oauth/google/callback' (no port)")
                        print_warning("For OAuth to work with Traefik, the callback URL must NOT have a port.")
                    elif 'localhost/api/v1/auth/oauth/google/callback' in google_redirect:
                        print_success("✓ Redirect URI is correct for Traefik setup!")
                return True, google_url
            else:
                print_error(f"Redirect URL doesn't point to Google: {google_url}")
                return False, None
        else:
            print_error(f"Expected 302 redirect, got status {response.status_code}")
            print_info(f"Response: {response.text[:500]}")
            return False, None

    except Exception as e:
        print_error(f"Error testing OAuth start: {e}")
        return False, None

def check_env_config():
    """Check environment configuration"""
    print_info("Checking environment configuration...")

    # Check if running in Docker
    print_info("Checking if backend is running in Docker...")
    try:
        response = requests.get("http://localhost/health/live", timeout=2)
        docker_running = True
    except:
        docker_running = False

    if docker_running:
        print_success("Backend is accessible via Traefik (port 80)")
    else:
        print_warning("Backend not accessible via Traefik")

    try:
        response = requests.get("http://localhost:8000/health/live", timeout=2)
        direct_running = True
    except:
        direct_running = False

    if direct_running:
        print_success("Backend is accessible directly (port 8000)")
    else:
        print_warning("Backend not accessible directly on port 8000")

    return docker_running, direct_running

def main():
    print_header("Google OAuth Diagnostic Tool")

    # Step 1: Check environment
    print_header("Step 1: Environment Check")
    docker_running, direct_running = check_env_config()

    if not docker_running and not direct_running:
        print_error("Backend is not running! Please start the backend first.")
        print_info("Run: docker compose up -d")
        sys.exit(1)

    # Step 2: Test OAuth on different endpoints
    print_header("Step 2: Testing OAuth Endpoints")

    if docker_running:
        print_info("\n--- Testing via Traefik (port 80) ---")
        success, google_url = test_oauth_start_endpoint("http://localhost")
        if success:
            print_success("✓ OAuth flow via Traefik works!")
            print_warning("IMPORTANT: For this to work, configure Google Cloud Console with:")
            print_warning("  Authorized redirect URI: http://localhost/api/v1/auth/oauth/google/callback")

    if direct_running:
        print_info("\n--- Testing Direct Backend (port 8000) ---")
        success, google_url = test_oauth_start_endpoint("http://localhost:8000")
        if success:
            print_success("✓ OAuth flow via direct backend works!")
            print_warning("IMPORTANT: For this to work, configure Google Cloud Console with:")
            print_warning("  Authorized redirect URI: http://localhost:8000/api/v1/auth/oauth/google/callback")

    # Step 3: Show configuration recommendations
    print_header("Step 3: Configuration Recommendations")

    print_info("Based on your setup, here's what you need to configure:")

    if docker_running:
        print_warning("\n🔧 USING TRAEFIK (Recommended for production-like setup)")
        print("  In your .env file:")
        print("    GOOGLE_REDIRECT_URI=http://localhost/api/v1/auth/oauth/google/callback")
        print("\n  In Google Cloud Console:")
        print("    Authorized redirect URI: http://localhost/api/v1/auth/oauth/google/callback")

    if direct_running:
        print_warning("\n🔧 USING DIRECT BACKEND (For development)")
        print("  In your .env file:")
        print("    GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/auth/oauth/google/callback")
        print("\n  In Google Cloud Console:")
        print("    Authorized redirect URI: http://localhost:8000/api/v1/auth/oauth/google/callback")

    # Step 4: Manual test instructions
    print_header("Step 4: Manual Test Instructions")
    print_info("To manually test the OAuth flow:")
    print_info("1. Open the Google Auth URL shown above in a browser")
    print_info("2. Sign in with your Google account")
    print_info("3. After authorization, observe the redirect URL")
    print_warning("If you see 'no available server', the redirect URI doesn't match!")

    print_header("Test Complete")
    print_info("If OAuth is still not working, check:")
    print_info("  1. Backend logs: docker logs rawdrive-backend")
    print_info("  2. Traefik logs: docker logs rawdrive-traefik")
    print_info("  3. Google Cloud Console authorized redirect URIs")

if __name__ == "__main__":
    main()
