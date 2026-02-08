#!/bin/bash
# RawDrive Tmux Development Session
# Usage: wsl bash ~/Desktop/RawDrive2/scripts/tmux-dev.sh

SESSION_NAME="rawdrive"

# Check if session already exists
if tmux has-session -t $SESSION_NAME 2>/dev/null; then
    echo "Session '$SESSION_NAME' already exists. Attaching..."
    tmux attach-session -t $SESSION_NAME
    exit 0
fi

# Create new session and set up windows
cd ~/Desktop/RawDrive2

# Window 1: Main (Editor/General)
tmux new-session -d -s $SESSION_NAME -n 'Main'
tmux send-keys -t $SESSION_NAME:Main 'cd ~/Desktop/RawDrive2' C-m

# Window 2: Frontend Dev Server
tmux new-window -t $SESSION_NAME -n 'Frontend'
tmux send-keys -t $SESSION_NAME:Frontend 'cd ~/Desktop/RawDrive2/frontend && pnpm dev' C-m

# Window 3: Backend Dev Server
tmux new-window -t $SESSION_NAME -n 'Backend'
tmux send-keys -t $SESSION_NAME:Backend 'cd ~/Desktop/RawDrive2/backend && uvicorn app.main:app --reload --port 8000' C-m

# Window 4: Docker Logs
tmux new-window -t $SESSION_NAME -n 'Docker'
tmux send-keys -t $SESSION_NAME:Docker 'cd ~/Desktop/RawDrive2 && docker compose -f infrastructure/docker/docker-compose.yml logs -f' C-m

# Window 5: Services (for microservices)
tmux new-window -t $SESSION_NAME -n 'Services'
tmux send-keys -t $SESSION_NAME:Services 'cd ~/Desktop/RawDrive2/services' C-m

# Window 6: Git
tmux new-window -t $SESSION_NAME -n 'Git'
tmux send-keys -t $SESSION_NAME:Git 'cd ~/Desktop/RawDrive2 && git status' C-m

# Window 7: Tests
tmux new-window -t $SESSION_NAME -n 'Tests'
tmux send-keys -t $SESSION_NAME:Tests 'cd ~/Desktop/RawDrive2' C-m

# Focus on main window
tmux select-window -t $SESSION_NAME:Main

echo "Tmux session '$SESSION_NAME' created with following windows:"
echo "  1. Main    - General workspace"
echo "  2. Frontend- React dev server"
echo "  3. Backend - FastAPI dev server"
echo "  4. Docker  - Docker logs"
echo "  5. Services- Microservices"
echo "  6. Git    - Git operations"
echo "  7. Tests  - Test runner"
echo ""
echo "Attaching to session..."
tmux attach-session -t $SESSION_NAME
