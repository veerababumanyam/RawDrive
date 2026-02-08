import sys
import os

# Set up project path
project_root = os.path.abspath(os.path.join(os.getcwd(), "backend", "src"))
sys.path.insert(0, project_root)

try:
    from app.models import AssetEmbeddingsCache
    print("Successfully imported AssetEmbeddingsCache from app.models")
except ImportError as e:
    print(f"Import Error: {e}")
    sys.exit(1)
from sqlalchemy import select

print(f"--- Diagnostic for AssetEmbeddingsCache ---")
print(f"Type: {type(AssetEmbeddingsCache)}")
print(f"Inheritance: {AssetEmbeddingsCache.__mro__}")
print(f"Dir (class): {dir(AssetEmbeddingsCache)}")

try:
    s = select(AssetEmbeddingsCache)
    print(f"Select(Class): {s}")
except Exception as e:
    print(f"Select(Class) Error: {e}")

# Check if it has asset_id on class level
print(f"Has asset_id on class: {hasattr(AssetEmbeddingsCache, 'asset_id')}")
if hasattr(AssetEmbeddingsCache, 'asset_id'):
    attr = getattr(AssetEmbeddingsCache, 'asset_id')
    print(f"AssetEmbeddingsCache.asset_id: {attr} (Type: {type(attr)})")

# Test equality expression
try:
    expr = AssetEmbeddingsCache.asset_id == "test"
    print(f"Expr (AssetEmbeddingsCache.asset_id == 'test'): {expr} (Type: {type(expr)})")
except Exception as e:
    print(f"Expr Error: {e}")
