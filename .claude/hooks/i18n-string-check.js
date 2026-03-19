#!/usr/bin/env node
/**
 * i18n-string-check hook
 * PostToolUse hook that flags hardcoded user-facing strings in React components.
 */

const fs = require('fs');

const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
const toolName = input.tool_name;
const toolInput = input.tool_input || {};

if (!['Write', 'Edit'].includes(toolName)) {
  console.log(JSON.stringify({}));
  process.exit(0);
}

const filePath = toolInput.file_path || toolInput.path || '';
const content = toolInput.content || toolInput.new_string || '';

// Only check React component files
if (!/frontend\/src\/.+\.(tsx|jsx)$/.test(filePath)) {
  console.log(JSON.stringify({}));
  process.exit(0);
}

// Skip test files and storybook
if (/\.(test|spec|stories)\./i.test(filePath)) {
  console.log(JSON.stringify({}));
  process.exit(0);
}

// Patterns that suggest hardcoded user-facing strings
const hardcodedPatterns = [
  // JSX text content: >Some text<
  />\s*[A-Z][a-z]+(?:\s+[a-z]+){2,}\s*</g,
  // Common UI string attributes with literal values
  /(?:placeholder|title|aria-label|alt)\s*=\s*"[A-Z][a-zA-Z\s]{5,}"/g,
  // Button/label text
  /(?:label|buttonText|message|description|heading)\s*[:=]\s*["'][A-Z][a-zA-Z\s]{5,}["']/g,
];

let hasHardcodedStrings = false;
const examples = [];

for (const pattern of hardcodedPatterns) {
  const matches = content.match(pattern);
  if (matches && matches.length > 0) {
    hasHardcodedStrings = true;
    examples.push(matches[0].substring(0, 60));
    if (examples.length >= 3) break;
  }
}

if (hasHardcodedStrings) {
  console.log(JSON.stringify({
    message: `🌐 i18n REMINDER: Possible hardcoded user-facing strings detected in ${filePath.split('/').pop()}:\n${examples.map(e => `  • ${e}...`).join('\n')}\n\nUse translation keys instead: t('namespace.key'). See the i18n-localization skill.`
  }));
} else {
  console.log(JSON.stringify({}));
}
