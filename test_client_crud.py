#!/usr/bin/env python3
"""
Client CRUD Operations Test Script
Tests Create, Read, Update, and Delete operations for the Client API
"""

import asyncio
import sys
from uuid import uuid4
from datetime import date
import httpx

# API Configuration
BASE_URL = "http://localhost:8000"
API_PREFIX = "/api/v1"

# Test credentials (from seed_user.py)
TEST_EMAIL = "professional@test.rawdrive.in"
TEST_PASSWORD = "Test@123"

# Global test workspace ID (will be set after login)
WORKSPACE_ID = None
AUTH_TOKEN = None


class Colors:
    """ANSI color codes for terminal output"""
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'


def print_success(message):
    print(f"{Colors.OKGREEN}✓ {message}{Colors.ENDC}")


def print_error(message):
    print(f"{Colors.FAIL}✗ {message}{Colors.ENDC}")


def print_info(message):
    print(f"{Colors.OKCYAN}ℹ {message}{Colors.ENDC}")


def print_header(message):
    print(f"\n{Colors.HEADER}{Colors.BOLD}{'=' * 60}")
    print(f"{message}")
    print(f"{'=' * 60}{Colors.ENDC}\n")


async def login(client: httpx.AsyncClient) -> tuple[str, str]:
    """Login and get auth token and workspace ID"""
    print_header("AUTHENTICATION")
    try:
        response = await client.post(
            f"{BASE_URL}{API_PREFIX}/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        response.raise_for_status()
        data = response.json()
        
        # Parse response structure: {"user": {...}, "tokens": {"access_token": "..."}}
        tokens = data.get("tokens", {})
        user = data.get("user", {})
        
        token = tokens.get("access_token")
        user_id = user.get("user_id")
        workspace_id = user.get("workspace_id")
        
        if not token:
            print_error("No access token in response")
            return None, None
        
        print_success(f"Logged in as user: {user_id}")
        
        # Use workspace from login response
        if workspace_id:
            print_success(f"Using workspace: {workspace_id}")
            return token, workspace_id
        
        # Fallback: Get user's first workspace
        response = await client.get(
            f"{BASE_URL}{API_PREFIX}/workspaces",
            headers={"Authorization": f"Bearer {token}"}
        )
        response.raise_for_status()
        workspaces = response.json()
        
        if not workspaces or len(workspaces) == 0:
            print_error("No workspaces found")
            return token, None
        
        workspace_id = workspaces[0]["workspace_id"]
        print_success(f"Using workspace: {workspace_id}")
        
        return token, workspace_id
        
    except httpx.HTTPStatusError as e:
        print_error(f"Login failed: {e.response.status_code} - {e.response.text}")
        return None, None
    except Exception as e:
        print_error(f"Login error: {str(e)}")
        return None, None


async def test_create_client(client: httpx.AsyncClient) -> str:
    """Test creating a new client (CREATE)"""
    print_header("TEST 1: CREATE CLIENT")
    
    client_data = {
        "full_name": "Jane Smith",
        "first_name": "Jane",
        "last_name": "Smith",
        "nickname": "Janey",
        "job_title": "Marketing Director",
        "organization": "Tech Corp",
        "language": "en",
        "timezone": "America/Los_Angeles",
        "internal_notes": "VIP client - referred by John Doe"
    }
    
    print_info(f"Creating client: {client_data['full_name']}")
    
    try:
        response = await client.post(
            f"{BASE_URL}{API_PREFIX}/workspaces/{WORKSPACE_ID}/clients",
            headers={"Authorization": f"Bearer {AUTH_TOKEN}"},
            json=client_data
        )
        response.raise_for_status()
        result = response.json()
        
        client_id = result.get("client_id")
        print_success(f"Client created successfully!")
        print_info(f"Client ID: {client_id}")
        print_info(f"Status: {result.get('status')}")
        print_info(f"Created at: {result.get('created_at')}")
        
        return client_id
        
    except httpx.HTTPStatusError as e:
        print_error(f"Failed to create client: {e.response.status_code}")
        print_error(f"Response: {e.response.text}")
        return None
    except Exception as e:
        print_error(f"Error: {str(e)}")
        return None


async def test_get_client(client: httpx.AsyncClient, client_id: str) -> bool:
    """Test retrieving a client (READ)"""
    print_header("TEST 2: GET CLIENT (READ)")
    
    print_info(f"Fetching client: {client_id}")
    
    try:
        response = await client.get(
            f"{BASE_URL}{API_PREFIX}/workspaces/{WORKSPACE_ID}/clients/{client_id}",
            headers={"Authorization": f"Bearer {AUTH_TOKEN}"}
        )
        response.raise_for_status()
        result = response.json()
        
        print_success("Client retrieved successfully!")
        print_info(f"Full Name: {result.get('full_name')}")
        print_info(f"Status: {result.get('status')}")
        print_info(f"Job Title: {result.get('job_title')}")
        print_info(f"Organization: {result.get('organization')}")
        print_info(f"Contacts: {len(result.get('contacts', []))}")
        print_info(f"Addresses: {len(result.get('addresses', []))}")
        print_info(f"Linked Galleries: {len(result.get('linked_galleries', []))}")
        
        if result.get("stats"):
            stats = result["stats"]
            print_info(f"Stats - Galleries: {stats.get('linked_galleries_count', 0)}, "
                      f"Activities: {stats.get('activities_count', 0)}")
        
        return True
        
    except httpx.HTTPStatusError as e:
        print_error(f"Failed to get client: {e.response.status_code}")
        print_error(f"Response: {e.response.text}")
        return False
    except Exception as e:
        print_error(f"Error: {str(e)}")
        return False


async def test_list_clients(client: httpx.AsyncClient) -> bool:
    """Test listing all clients"""
    print_header("TEST 3: LIST CLIENTS")
    
    print_info("Fetching clients list...")
    
    try:
        response = await client.get(
            f"{BASE_URL}{API_PREFIX}/workspaces/{WORKSPACE_ID}/clients",
            headers={"Authorization": f"Bearer {AUTH_TOKEN}"},
            params={"limit": 20, "page": 1}
        )
        response.raise_for_status()
        result = response.json()
        
        clients = result.get("clients", [])
        meta = result.get("meta", {})
        
        print_success(f"Retrieved {len(clients)} clients")
        print_info(f"Total: {meta.get('total', 0)}")
        print_info(f"Page: {meta.get('page', 1)} of {meta.get('total_pages', 1)}")
        
        if clients:
            print_info("\nRecent clients:")
            for idx, c in enumerate(clients[:5], 1):
                print(f"  {idx}. {c.get('full_name')} ({c.get('status')})")
        
        return True
        
    except httpx.HTTPStatusError as e:
        print_error(f"Failed to list clients: {e.response.status_code}")
        print_error(f"Response: {e.response.text}")
        return False
    except Exception as e:
        print_error(f"Error: {str(e)}")
        return False


async def test_update_client(client: httpx.AsyncClient, client_id: str) -> bool:
    """Test updating a client (UPDATE)"""
    print_header("TEST 4: UPDATE CLIENT")
    
    update_data = {
        "job_title": "Senior Marketing Director",
        "organization": "Tech Corp International",
        "status": "active",
        "internal_notes": "Updated VIP client - recently promoted"
    }
    
    print_info(f"Updating client: {client_id}")
    print_info(f"New job title: {update_data['job_title']}")
    
    try:
        response = await client.patch(
            f"{BASE_URL}{API_PREFIX}/workspaces/{WORKSPACE_ID}/clients/{client_id}",
            headers={"Authorization": f"Bearer {AUTH_TOKEN}"},
            json=update_data
        )
        response.raise_for_status()
        result = response.json()
        
        print_success("Client updated successfully!")
        print_info(f"Updated job title: {result.get('job_title')}")
        print_info(f"Updated organization: {result.get('organization')}")
        print_info(f"Updated at: {result.get('updated_at')}")
        
        return True
        
    except httpx.HTTPStatusError as e:
        print_error(f"Failed to update client: {e.response.status_code}")
        print_error(f"Response: {e.response.text}")
        return False
    except Exception as e:
        print_error(f"Error: {str(e)}")
        return False


async def test_add_contact(client: httpx.AsyncClient, client_id: str) -> str:
    """Test adding a contact to client"""
    print_header("TEST 5: ADD CONTACT")
    
    contact_data = {
        "contact_type": "email",
        "contact_subtype": "work",
        "value": "jane.smith@techcorp.com",
        "is_primary": True
    }
    
    print_info(f"Adding email contact: {contact_data['value']}")
    
    try:
        response = await client.post(
            f"{BASE_URL}{API_PREFIX}/workspaces/{WORKSPACE_ID}/clients/{client_id}/contacts",
            headers={"Authorization": f"Bearer {AUTH_TOKEN}"},
            json=contact_data
        )
        response.raise_for_status()
        result = response.json()
        
        contact_id = result.get("contact_id")
        print_success("Contact added successfully!")
        print_info(f"Contact ID: {contact_id}")
        print_info(f"Type: {result.get('contact_type')} ({result.get('contact_subtype')})")
        print_info(f"Primary: {result.get('is_primary')}")
        
        return contact_id
        
    except httpx.HTTPStatusError as e:
        print_error(f"Failed to add contact: {e.response.status_code}")
        print_error(f"Response: {e.response.text}")
        return None
    except Exception as e:
        print_error(f"Error: {str(e)}")
        return None


async def test_search_clients(client: httpx.AsyncClient) -> bool:
    """Test searching clients"""
    print_header("TEST 6: SEARCH CLIENTS")
    
    search_query = "Jane"
    print_info(f"Searching for: {search_query}")
    
    try:
        response = await client.get(
            f"{BASE_URL}{API_PREFIX}/workspaces/{WORKSPACE_ID}/clients/search",
            headers={"Authorization": f"Bearer {AUTH_TOKEN}"},
            params={"q": search_query, "limit": 10}
        )
        response.raise_for_status()
        results = response.json()
        
        print_success(f"Found {len(results)} matches")
        
        if results:
            for idx, r in enumerate(results, 1):
                print(f"  {idx}. {r.get('full_name')} - {r.get('primary_email', 'No email')}")
        
        return True
        
    except httpx.HTTPStatusError as e:
        print_error(f"Failed to search clients: {e.response.status_code}")
        print_error(f"Response: {e.response.text}")
        return False
    except Exception as e:
        print_error(f"Error: {str(e)}")
        return False


async def test_delete_client(client: httpx.AsyncClient, client_id: str) -> bool:
    """Test deleting a client (DELETE)"""
    print_header("TEST 7: DELETE CLIENT")
    
    print_info(f"Deleting client: {client_id}")
    
    try:
        response = await client.delete(
            f"{BASE_URL}{API_PREFIX}/workspaces/{WORKSPACE_ID}/clients/{client_id}",
            headers={"Authorization": f"Bearer {AUTH_TOKEN}"}
        )
        response.raise_for_status()
        result = response.json()
        
        print_success("Client deleted successfully!")
        print_info(f"Message: {result.get('message')}")
        print_info(f"Galleries unlinked: {result.get('galleries_unlinked', 0)}")
        
        # Verify deletion
        print_info("Verifying deletion...")
        try:
            verify_response = await client.get(
                f"{BASE_URL}{API_PREFIX}/workspaces/{WORKSPACE_ID}/clients/{client_id}",
                headers={"Authorization": f"Bearer {AUTH_TOKEN}"}
            )
            if verify_response.status_code == 404:
                print_success("Verified: Client no longer exists")
                return True
            else:
                print_error("Warning: Client still exists after deletion")
                return False
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                print_success("Verified: Client no longer exists")
                return True
            raise
        
    except httpx.HTTPStatusError as e:
        print_error(f"Failed to delete client: {e.response.status_code}")
        print_error(f"Response: {e.response.text}")
        return False
    except Exception as e:
        print_error(f"Error: {str(e)}")
        return False


async def run_all_tests():
    """Run all CRUD tests"""
    global WORKSPACE_ID, AUTH_TOKEN
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Authenticate
        AUTH_TOKEN, WORKSPACE_ID = await login(client)
        if not AUTH_TOKEN or not WORKSPACE_ID:
            print_error("Authentication failed. Cannot proceed with tests.")
            return False
        
        # Test results
        results = {
            "create": False,
            "read": False,
            "list": False,
            "update": False,
            "add_contact": False,
            "search": False,
            "delete": False
        }
        
        # Run CRUD tests
        client_id = await test_create_client(client)
        if client_id:
            results["create"] = True
            
            # Wait a moment for database consistency
            await asyncio.sleep(0.5)
            
            results["read"] = await test_get_client(client, client_id)
            results["list"] = await test_list_clients(client)
            results["update"] = await test_update_client(client, client_id)
            
            contact_id = await test_add_contact(client, client_id)
            if contact_id:
                results["add_contact"] = True
            
            results["search"] = await test_search_clients(client)
            results["delete"] = await test_delete_client(client, client_id)
        
        # Print summary
        print_header("TEST SUMMARY")
        
        total_tests = len(results)
        passed_tests = sum(1 for v in results.values() if v)
        
        for test_name, passed in results.items():
            status = "PASS" if passed else "FAIL"
            color = Colors.OKGREEN if passed else Colors.FAIL
            print(f"{color}{test_name.upper():<20} {status}{Colors.ENDC}")
        
        print(f"\n{Colors.BOLD}Total: {passed_tests}/{total_tests} tests passed{Colors.ENDC}")
        
        if passed_tests == total_tests:
            print_success("All tests passed! ✓")
            return True
        else:
            print_error(f"{total_tests - passed_tests} test(s) failed")
            return False


if __name__ == "__main__":
    print(f"{Colors.BOLD}Client CRUD Operations Test Suite{Colors.ENDC}")
    print(f"Testing API at: {BASE_URL}{API_PREFIX}")
    print(f"Using credentials: {TEST_EMAIL}")
    print("\nNote: Make sure the backend is running and credentials are correct")
    print("You can set TEST_EMAIL and TEST_PASSWORD in the script\n")
    
    success = asyncio.run(run_all_tests())
    sys.exit(0 if success else 1)
