@echo off
REM RawDrive Tmux Development Session Launcher
REM Launches tmux in WSL with pre-configured development environment

echo Starting RawDrive Tmux Development Session...
echo.
echo Windows Terminal will open with the tmux session.
echo.
echo Available tmux shortcuts:
echo   Ctrl-a + c   - Create new window
echo   Ctrl-a + n   - Next window
echo   Ctrl-a + p   - Previous window
echo   Ctrl-a + |   - Split horizontal
echo   Ctrl-a + -   - Split vertical
echo   Ctrl-a + h/j/k/l - Navigate panes
echo   Ctrl-a + d   - Detach (keeps session running)
echo.

REM Launch Windows Terminal with WSL tmux
wt.exe wsl.exe bash ~/Desktop/RawDrive2/scripts/tmux-dev.sh
