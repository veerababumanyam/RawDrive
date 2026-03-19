#!/usr/bin/env node
/**
 * secret-detection hook
 * PreToolUse hook that blocks secrets from being written into source code.
 */

const fs = require('fs');

const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
const toolName = input.tool_name;
const toolInput = input.tool_input || {};

if (!['Write', 'Edit'].includes(toolName)) {
  console.log(JSON.stringify({ decision: 'approve' }));
  process.exit(0);
}

const filePath = toolInput.file_path || toolInput.path || '';
const content = toolInput.content || toolInput.new_string || '';

// Skip .env files (they're supposed to have secrets, and are gitignored)
if (/\.env($|\.)/.test(filePath)) {
  console.log(JSON.stringify({ decision: 'approve' }));
  process.exit(0);
}

// Skip test files and fixtures
if (/\/(tests?|__tests__|fixtures|mocks)\//i.test(filePath) || /\.test\.|\.spec\./i.test(filePath)) {
  console.log(JSON.stringify({ decision: 'approve' }));
  process.exit(0);
}

const secretPatterns = [
  { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["'][a-zA-Z0-9_\-]{20,}["']/gi, name: 'API key' },
  { pattern: /(?:secret[_-]?key|secret)\s*[:=]\s*["'][a-zA-Z0-9_\-]{20,}["']/gi, name: 'Secret key' },
  { pattern: /(?:password|passwd|pwd)\s*[:=]\s*["'][^"']{8,}["']/gi, name: 'Password' },
  { pattern: /(?:token)\s*[:=]\s*["'][a-zA-Z0-9_\-]{20,}["']/gi, name: 'Token' },
  { pattern: /sk-[a-zA-Z0-9]{20,}/g, name: 'Stripe/OpenAI secret key' },
  { pattern: /pk_(?:live|test)_[a-zA-Z0-9]{20,}/g, name: 'Stripe publishable key' },
  { pattern: /ghp_[a-zA-Z0-9]{36,}/g, name: 'GitHub personal access token' },
  { pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g, name: 'Private key' },
  { pattern: /AKIA[0-9A-Z]{16}/g, name: 'AWS Access Key ID' },
  { pattern: /(?:mongodb|postgres|mysql|redis):\/\/[^"'\s]+:[^"'\s]+@/gi, name: 'Database connection string with credentials' },
];

const detectedSecrets = [];

for (const { pattern, name } of secretPatterns) {
  if (pattern.test(content)) {
    detectedSecrets.push(name);
  }
  pattern.lastIndex = 0; // Reset regex state
}

if (detectedSecrets.length > 0) {
  console.log(JSON.stringify({
    decision: 'block',
    reason: `🚫 SECRETS DETECTED in ${filePath}:\n${detectedSecrets.map(s => `• Possible ${s}`).join('\n')}\n\nUse environment variables instead. Store secrets in .env files (gitignored) and reference via os.environ or import.meta.env.`
  }));
} else {
  console.log(JSON.stringify({ decision: 'approve' }));
}
