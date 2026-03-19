#!/usr/bin/env node
/**
 * docker-health-check hook
 * PreToolUse hook that verifies Docker containers are running before exec commands.
 */

const fs = require('fs');
const { execFileSync } = require('child_process');

const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
const toolName = input.tool_name;
const toolInput = input.tool_input || {};

if (toolName !== 'Bash') {
  console.log(JSON.stringify({ decision: 'approve' }));
  process.exit(0);
}

const command = toolInput.command || '';

// Check if this is a docker exec command
const execMatch = command.match(/docker\s+exec\s+(?:-[a-z]+\s+)*([a-zA-Z0-9_-]+)/);
if (!execMatch) {
  console.log(JSON.stringify({ decision: 'approve' }));
  process.exit(0);
}

const containerName = execMatch[1];

try {
  const status = execFileSync('docker', ['inspect', '-f', '{{.State.Status}}', containerName], {
    encoding: 'utf8',
    timeout: 5000,
    stdio: ['pipe', 'pipe', 'pipe']
  }).trim();

  if (status !== 'running') {
    console.log(JSON.stringify({
      decision: 'approve',
      message: `⚠️ Container "${containerName}" is ${status || 'not found'}. The exec command may fail. Consider running: docker compose -f infrastructure/docker/docker-compose.yml up -d`
    }));
  } else {
    // Check health status if available
    try {
      const health = execFileSync('docker', ['inspect', '-f', '{{.State.Health.Status}}', containerName], {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();

      if (health && health !== 'healthy' && health !== '<no value>') {
        console.log(JSON.stringify({
          decision: 'approve',
          message: `⚠️ Container "${containerName}" is running but health status is: ${health}. Command may encounter issues.`
        }));
      } else {
        console.log(JSON.stringify({ decision: 'approve' }));
      }
    } catch {
      console.log(JSON.stringify({ decision: 'approve' }));
    }
  }
} catch {
  console.log(JSON.stringify({
    decision: 'approve',
    message: `⚠️ Could not check container "${containerName}" status. Docker may not be running. Ensure Docker Desktop is started and run: docker compose -f infrastructure/docker/docker-compose.yml up -d`
  }));
}
