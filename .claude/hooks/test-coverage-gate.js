#!/usr/bin/env node
/**
 * test-coverage-gate hook
 * PostToolUse hook that reminds about test coverage when implementation files are modified
 * without corresponding test files.
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

// Skip non-source files
if (!/\.(py|ts|tsx|js|jsx)$/.test(filePath)) {
  console.log(JSON.stringify({}));
  process.exit(0);
}

// Skip if this IS a test file
if (/\/(tests?|__tests__|spec)\//i.test(filePath) || /\.(test|spec)\./i.test(filePath)) {
  console.log(JSON.stringify({}));
  process.exit(0);
}

// Skip config, migration, and type files
if (/\/(config|migrations|alembic|types|schemas)\//i.test(filePath) ||
    /\.(d\.ts|config\.|setup\.)/.test(filePath)) {
  console.log(JSON.stringify({}));
  process.exit(0);
}

// Determine expected test file path
let testPath = '';
if (filePath.endsWith('.py')) {
  // Python: backend/src/app/services/foo.py → tests/services/test_foo.py
  const match = filePath.match(/backend\/src\/app\/(.+)\/([^/]+)\.py$/);
  if (match) {
    testPath = `backend/tests/${match[1]}/test_${match[2]}.py`;
  }
} else {
  // TypeScript/JS: src/components/Foo.tsx → src/components/Foo.test.tsx
  testPath = filePath.replace(/\.(tsx?|jsx?)$/, '.test.$1');
}

if (testPath) {
  const absoluteTestPath = testPath.startsWith('/') || testPath.startsWith('C:')
    ? testPath
    : require('path').resolve(process.cwd(), testPath);

  if (!fs.existsSync(absoluteTestPath)) {
    console.log(JSON.stringify({
      message: `📝 TEST REMINDER: Modified ${filePath.split('/').pop()} but no corresponding test file found.\nExpected: ${testPath}\nRawDrive requires TDD — write tests BEFORE implementation. See the testing-patterns skill.`
    }));
  } else {
    console.log(JSON.stringify({}));
  }
} else {
  console.log(JSON.stringify({}));
}
