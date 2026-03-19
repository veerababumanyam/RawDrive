#!/usr/bin/env node
/**
 * migration-safety hook
 * PreToolUse hook that validates Alembic migration files for common issues.
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

// Only check Alembic migration files
if (!/alembic\/versions\/.*\.py$/.test(filePath) && !/migrations\/versions\/.*\.py$/.test(filePath)) {
  console.log(JSON.stringify({ decision: 'approve' }));
  process.exit(0);
}

const warnings = [];

// Check for destructive operations without safety
if (/op\.drop_table\s*\(/i.test(content)) {
  warnings.push('DROP TABLE detected — ensure data has been migrated or backed up before dropping');
}

if (/op\.drop_column\s*\(/i.test(content)) {
  warnings.push('DROP COLUMN detected — verify no code references this column and data is preserved if needed');
}

if (/op\.execute\s*\(\s*["'](?:DROP|TRUNCATE|DELETE\s+FROM)/i.test(content)) {
  warnings.push('Raw destructive SQL detected — consider using Alembic operations instead for reversibility');
}

// Check for missing downgrade
if (/def\s+downgrade\s*\(\s*\)[\s\S]*?pass\s*$/m.test(content)) {
  warnings.push('Downgrade function is empty (pass) — migrations should be reversible for safe rollbacks');
}

// Check for NOT NULL without default on existing table
if (/op\.add_column\s*\([^)]*nullable\s*=\s*False/i.test(content) &&
    !/server_default/i.test(content)) {
  warnings.push('Adding NOT NULL column without server_default — this will fail if table has existing rows');
}

// Check for large table operations without batch
if (/op\.alter_column\s*\(/i.test(content) && !/batch_alter_table/i.test(content)) {
  warnings.push('Consider using batch_alter_table for ALTER COLUMN on large tables to avoid long locks');
}

if (warnings.length > 0) {
  console.log(JSON.stringify({
    decision: 'approve',
    message: `⚠️ MIGRATION SAFETY CHECK:\n${warnings.map(w => `• ${w}`).join('\n')}\n\nReview these carefully before running: docker exec rawdrive-backend alembic upgrade head`
  }));
} else {
  console.log(JSON.stringify({ decision: 'approve' }));
}
