#!/usr/bin/env python3
import inspect
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parents[1]
backend_src = backend_dir / "src"
sys.path.insert(0, str(backend_src))

import app.services.gallery_service as m
import os

print(f"File: {m.__file__}")
try:
    lines, start_line = inspect.getsourcelines(m.GalleryService)
    end_line = start_line + len(lines) - 1
    print(f"GalleryService defined lines: {start_line} to {end_line}")
    print(f"Number of lines in class: {len(lines)}")
except Exception as e:
    print(f"Error inspecting class: {e}")

try:
    with open(m.__file__, 'r') as f:
        file_lines = f.readlines()
        for i, line in enumerate(file_lines):
            if 'def remove_assets' in line:
                 print(f"remove_assets found at line {i+1}")
                 # Print previous 5 non-empty lines to check for method scope break
                 for j in range(max(0, i-10), i):
                     if file_lines[j].strip():
                         print(f"{j+1}: {repr(file_lines[j])}")
except Exception as e:
    print(f"Error reading file: {e}")
