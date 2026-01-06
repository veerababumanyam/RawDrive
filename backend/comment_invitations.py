#!/usr/bin/env python3
"""Temporarily comment out invitation routes to allow backend to start."""

import re

file_path = "src/app/api/v1/__init__.py"

with open(file_path, 'r') as f:
    content = f.read()

# Pattern to match invitation imports and their corresponding router.include_router() calls
# We'll do this in multiple steps

# Step 1: Comment out 'from app.api.v1.invitation_* import router as *_router' lines
content = re.sub(
    r'^(from app\.api\.v1\.invitation_\w+ import router as \w+_router)$',
    r'# \1  # Temporarily disabled',
    content,
    flags=re.MULTILINE
)

# Step 2: Comment out router.include_router blocks for invitation routes
# This is trickier as they span multiple lines
lines = content.split('\n')
output_lines = []
i = 0
while i < len(lines):
    line = lines[i]

    # Check if this is a router.include_router( line
    if line.strip().startswith('router.include_router('):
        # Look ahead to see if it references an invitation router
        router_block = [line]
        j = i + 1
        while j < len(lines) and not lines[j].strip().startswith(')'):
            router_block.append(lines[j])
            j += 1
        if j < len(lines):
            router_block.append(lines[j])  # closing )

        block_text = '\n'.join(router_block)

        # Check if this block references an invitation router
        if 'invitation' in block_text.lower():
            # Comment out the entire block
            for block_line in router_block:
                output_lines.append(f'# {block_line}  # Temporarily disabled')
            i = j + 1
            continue

    output_lines.append(line)
    i += 1

# Write the modified content
with open(file_path, 'w') as f:
    f.write('\n'.join(output_lines))

print("Invitation routes commented out successfully")
