#!/usr/bin/env python3
"""
Route Inspector - Lists all registered FastAPI routes
Helps diagnose routing issues by showing exactly what routes are registered
"""

import sys
import os
from pathlib import Path

backend_dir = Path(__file__).resolve().parents[1]
backend_src = backend_dir / "src"
sys.path.insert(0, str(backend_src))

try:
    from app.main import app
    
    print("=" * 80)
    print("REGISTERED FASTAPI ROUTES")
    print("=" * 80)
    
    routes_by_prefix = {}
    
    for route in app.routes:
        if hasattr(route, 'path') and hasattr(route, 'methods'):
            path = route.path
            methods = ', '.join(sorted(route.methods))
            
            # Group by prefix
            prefix = '/'.join(path.split('/')[:4]) if '/' in path else path
            if prefix not in routes_by_prefix:
                routes_by_prefix[prefix] = []
            routes_by_prefix[prefix].append((methods, path))
    
    # Print grouped by prefix
    for prefix in sorted(routes_by_prefix.keys()):
        print(f"\n{prefix}:")
        for methods, path in sorted(routes_by_prefix[prefix]):
            print(f"  {methods:20} {path}")
    
    print("\n" + "=" * 80)
    print(f"Total routes: {sum(len(routes) for routes in routes_by_prefix.values())}")
    print("=" * 80)
    
    # Check specifically for company-profile
    company_profile_routes = [
        (m, p) for routes in routes_by_prefix.values() 
        for m, p in routes 
        if 'company-profile' in p
    ]
    
    print(f"\nCompany Profile Routes Found: {len(company_profile_routes)}")
    for methods, path in company_profile_routes:
        print(f"  {methods:20} {path}")
        
except ImportError as e:
    print(f"Error importing app: {e}")
    print("\nMake sure you run this from the project root directory")
    print("and that all dependencies are installed.")
    sys.exit(1)
except Exception as e:
    print(f"Unexpected error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
