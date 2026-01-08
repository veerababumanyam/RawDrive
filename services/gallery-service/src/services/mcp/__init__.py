"""MCP (Model Context Protocol) server for gallery operations.

This module provides MCP tools that allow AI agents to interact with
gallery operations through a standardized protocol.
"""

from .mcp_server import app as mcp_app, mcp

__all__ = ["mcp_app", "mcp"]
