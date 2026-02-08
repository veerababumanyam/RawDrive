# Tmux Guide for RawDrive Development

## Overview

Tmux is installed in WSL Ubuntu 22.04 and configured for RawDrive development workflow.

## Quick Start

### Option 1: Windows Launcher (Recommended)
```batch
# Double-click from File Explorer or run from PowerShell:
scripts\tmux-dev.bat
```

### Option 2: Direct from WSL
```bash
wsl
~/Desktop/RawDrive2/scripts/tmux-dev.sh
```

### Option 3: Manual Session
```bash
wsl
cd ~/Desktop/RawDrive2
tmux new-session -s rawdrive
```

## Tmux Sessions

### Attach to existing session
```bash
tmux attach-session -t rawdrive
# or shorthand
tmux a -t rawdrive
```

### List all sessions
```bash
tmux list-sessions
# or
tmux ls
```

### Kill session
```bash
tmux kill-server  # Kill all sessions
tmux kill-session -t rawdrive  # Kill specific session
```

## Essential Tmux Shortcuts

**Prefix**: `Ctrl+a` (press Ctrl and a together, then release before typing the next key)

| Shortcut | Action |
|----------|--------|
| `Ctrl+a + c` | Create new window |
| `Ctrl+a + n` | Next window |
| `Ctrl+a + p` | Previous window |
| `Ctrl+a + 0-9` | Switch to window by number |
| `Ctrl+a + ,` | Rename window |
| `Ctrl+a + \|` | Split pane horizontally |
| `Ctrl+a + -` | Split pane vertically |
| `Ctrl+a + h/j/k/l` | Navigate panes (left/down/up/right) |
| `Ctrl+a + o` | Cycle through panes |
| `Ctrl+a + x` | Kill current pane |
| `Ctrl+a + d` | Detach from session (keeps it running) |
| `Ctrl+a + [` | Enter scroll/copy mode (vi keys) |
| `Ctrl+a + r` | Reload config file |

## RawDrive Keybindings (Custom)

| Shortcut | Action |
|----------|--------|
| `Ctrl+a + W` | Open RawDrive main window |
| `Ctrl+a + F` | Open Frontend dev server |
| `Ctrl+a + B` | Open Backend dev server |
| `Ctrl+a + D` | Open Docker logs |
| `Ctrl+a + T` | Run tests (prompts for test command) |
| `Ctrl+a + G` | Run git command (prompts for command) |

## Pre-configured Windows

The `tmux-dev.sh` script creates 7 windows:

1. **Main** - General workspace for editing files
2. **Frontend** - React dev server (pnpm dev)
3. **Backend** - FastAPI dev server (uvicorn)
4. **Docker** - Docker compose logs
5. **Services** - Microservices directory
6. **Git** - Git operations
7. **Tests** - Test runner

## Configuration

Config file location: `~/.tmux.conf` (in WSL) and `.tmux.conf` (in project root)

Key settings:
- Prefix: `Ctrl+a` (more ergonomic than default `Ctrl+b`)
- Mouse support enabled
- 256-color terminal
- Vim-like pane navigation (h/j/k/l)
- Status bar shows git branch and time

## Copy-Paste in Tmux

### Enter copy mode
```
Ctrl+a + [
```

### Navigate (vim keys)
- `j`/`k` - down/up
- `h`/`l` - left/right
- `w`/`b` - forward/backward by word
- `g` - go to top
- `G` - go to bottom

### Select text
- `v` - start selection (visual mode)
- `y` - copy selection

### Paste
- `Ctrl+a + ]` - paste

## Useful Tmux Commands

```bash
# Show all keybindings
tmux list-keys

# Show all options
tmux show-options -g

# Show pane info
tmux display-pane

# Send command to all panes
tmux setw synchronize-panes on  # Toggle on/off
```

## Tips for RawDrive Development

1. **Keep sessions alive** - Use `Ctrl+a + d` to detach; services keep running
2. **Multiple panes for logs** - Split window to see multiple service logs at once
3. **Sync panes** - Turn on synchronize-panes to run commands across all panes
4. **Persist sessions** - Tmux sessions survive WSL shutdown; use `tmux a` to reattach

## Troubleshooting

### "Server not running"
```bash
tmux start-server
```

### Can't attach to session
```bash
# Kill orphaned socket
rm /tmp/tmux-*/default
# Then start fresh session
```

### Config not loading
```bash
tmux source-file ~/.tmux.conf
```

## Resources

- [Tmux GitHub](https://github.com/tmux/tmux)
- [Tmux Manual](https://man.openbsd.org/tmux.1)
- [Awesome Tmux](https://github.com/rothgar/awesome-tmux)

## Status Bar

The custom status bar shows:
- **Left**: "RawDrive" logo + day of week + time
- **Right**: Current git branch + date
- **Windows**: Window number and name (highlighted for active window)
- **Borders**: Active pane has blue border

---

**Note**: This configuration uses Catppuccin Mocha color scheme for dark theme aesthetics.
