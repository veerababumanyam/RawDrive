# Google Stitch MCP

This repo-local Codex plugin exposes the `StitchMCP` remote server at `https://stitch.googleapis.com/mcp`.

## Setup

Set your API key in the environment before launching or reloading Codex.

### PowerShell

```powershell
$env:STITCH_API_KEY="your-api-key"
```

To persist it for future sessions:

```powershell
setx STITCH_API_KEY "your-api-key"
```

After setting the variable, restart Codex so the plugin can resolve `${STITCH_API_KEY}` when it launches `mcp-remote`.
