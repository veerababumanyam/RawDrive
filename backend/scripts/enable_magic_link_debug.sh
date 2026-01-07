#!/bin/bash
# Enable DEBUG logging for magic link debugging
# Usage: source enable_magic_link_debug.sh

export LOG_LEVEL=DEBUG
export DEBUG_MAGIC_LINKS=true
export LOG_FORMAT=console

echo "✅ Debug logging enabled for magic links"
echo "   LOG_LEVEL=$LOG_LEVEL"
echo "   DEBUG_MAGIC_LINKS=$DEBUG_MAGIC_LINKS"
echo "   LOG_FORMAT=$LOG_FORMAT"
echo ""
echo "Restart your backend server to apply changes"
