#!/usr/bin/env node
/**
 * workspace-id-guard hook
 * PreToolUse hook that checks for missing workspace_id in database queries.
 * Enforces multi-tenant isolation by flagging queries that don't filter by workspace_id.
 */

const fs = require('fs');

const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
const toolName = input.tool_name;
const toolInput = input.tool_input || {};

// Only check Write and Edit tools for backend Python files
if (!['Write', 'Edit'].includes(toolName)) {
  console.log(JSON.stringify({ decision: 'approve' }));
  process.exit(0);
}

const filePath = toolInput.file_path || toolInput.path || '';
const content = toolInput.content || toolInput.new_string || '';

// Only check Python backend files (repositories, services, API endpoints)
const isBackendPython = /backend\/src\/app\/(repositories|services|api)\/.*\.py$/.test(filePath) ||
                        /services\/[^/]+\/src\/(repositories|services|api)\/.*\.py$/.test(filePath);

if (!isBackendPython) {
  console.log(JSON.stringify({ decision: 'approve' }));
  process.exit(0);
}

// Check for SQL queries without workspace_id filtering
const hasSQLQuery = /select\s*\(|\.execute\s*\(|text\s*\(|\.query\s*\(/i.test(content);
const hasWorkspaceFilter = /workspace_id/i.test(content);

// Check for repository methods without workspace_id parameter
const hasRepoMethod = /async\s+def\s+(get|list|create|update|delete|find|search|count)/i.test(content);
const hasWorkspaceParam = /workspace_id\s*[:=]/i.test(content);

const warnings = [];

if (hasSQLQuery && !hasWorkspaceFilter) {
  warnings.push('SQL query detected without workspace_id filter — multi-tenant isolation may be violated');
}

if (hasRepoMethod && !hasWorkspaceParam) {
  warnings.push('Repository method detected without workspace_id parameter — every data access must be tenant-scoped');
}

if (warnings.length > 0) {
  console.log(JSON.stringify({
    decision: 'approve',
    message: `⚠️ MULTI-TENANT WARNING:\n${warnings.join('\n')}\n\nEvery database query MUST filter by workspace_id extracted from the JWT. See the multi-tenant-security skill for patterns.`
  }));
} else {
  console.log(JSON.stringify({ decision: 'approve' }));
}
