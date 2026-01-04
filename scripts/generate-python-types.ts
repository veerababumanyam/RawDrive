#!/usr/bin/env node
/**
 * TypeScript → JSON Schema → Python (Pydantic) generation pipeline
 * Safe to run before type definitions exist; exits early when inputs are missing.
 */
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(__dirname, '..');
const SHARED_TYPES_SRC = path.join(ROOT, 'packages', 'shared-types', 'src', 'index.ts');
const SCHEMA_DIR = path.join(ROOT, 'packages', 'shared-types', 'schemas');
const PY_TYPES_OUT = path.join(ROOT, 'packages', 'shared-types', 'generated', 'python', 'types.py');
const PY_CONSTANTS_OUT = path.join(ROOT, 'packages', 'shared-constants', 'generated', 'python', 'constants.py');
const PY_VALIDATION_OUT = path.join(ROOT, 'packages', 'shared-validation', 'generated', 'python', 'validation.py');
const PY_OUT_DIRS = [
  path.dirname(PY_TYPES_OUT),
  path.dirname(PY_CONSTANTS_OUT),
  path.dirname(PY_VALIDATION_OUT),
];

const normalizePython = (content: string) => {
  const lines = content.replace(/^[\n\r]+/, '').split(/\r?\n/);
  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => line.match(/^(\s*)/)?.[1].length ?? 0);
  const minIndent = indents.length ? Math.min(...indents) : 0;
  const normalized = lines.map((line) => line.slice(minIndent)).join('\n');
  return normalized.trimEnd() + '\n';
};

const BACKEND_SHARED_DIR = path.join(ROOT, 'backend', 'src', 'app', 'shared');
const INVITES_SHARED_DIR = path.join(ROOT, 'services', 'invitations-service', 'src', 'shared');
const PYTHON_CMD = process.env.PYTHON || path.join(ROOT, '.venv', 'bin', 'python');

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

function run(command: string, args: string[], cwd = ROOT): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function generateSchemas() {
  if (!existsSync(SHARED_TYPES_SRC)) {
    console.warn('[generate-python-types] Shared types entry not found; skipping generation.');
    return false;
  }

  await ensureDir(SCHEMA_DIR);
  console.log('[generate-python-types] Generating JSON Schema from TypeScript...');
  await run('pnpm', [
    'ts-json-schema-generator',
    '--path', SHARED_TYPES_SRC,
    '--tsconfig', path.join(ROOT, 'packages', 'shared-types', 'tsconfig.schema.json'),
    '--type', '*',
    '--no-type-check',
    '--out', path.join(SCHEMA_DIR, 'schema.json'),
  ]);
  return true;
}

async function generatePythonModels() {
  if (!existsSync(path.join(SCHEMA_DIR, 'schema.json'))) {
    console.warn('[generate-python-types] No schema.json found; skipping Python generation.');
    return false;
  }

  for (const dir of PY_OUT_DIRS) {
    await ensureDir(dir);
  }
  console.log('[generate-python-types] Generating Pydantic models from JSON Schema...');
  await run(PYTHON_CMD, [
    '-m', 'datamodel_code_generator',
    '--input', path.join(SCHEMA_DIR, 'schema.json'),
    '--input-file-type', 'jsonschema',
    '--output-model-type', 'pydantic_v2.BaseModel',
    '--use-standard-collections',
    '--use-union-operator',
    '--enum-field-as-literal', 'one',
    '--use-double-quotes',
    '--output', PY_TYPES_OUT,
  ]);
  return true;
}

async function writeConstantsModule() {
    const content = normalizePython(`
    """Generated constants from shared-constants"""
    API_VERSION = "v1"
    API_BASE = f"/api/{API_VERSION}"


    def _workspace_path(resource: str, workspace_id: str) -> str:
      return f"{API_BASE}/workspaces/{workspace_id}/{resource}"


    WORKSPACE_PATHS = {
      "GALLERIES": lambda workspace_id: _workspace_path("galleries", workspace_id),
      "ASSETS": lambda workspace_id: _workspace_path("assets", workspace_id),
      "UPLOADS": lambda workspace_id: _workspace_path("uploads", workspace_id),
      "INVITATIONS": lambda workspace_id: _workspace_path("digital-invitations", workspace_id),
      "FACE_GROUPS": lambda workspace_id: _workspace_path("face-groups", workspace_id),
      "MEMBERS": lambda workspace_id: _workspace_path("members", workspace_id),
      "ROLES": lambda workspace_id: _workspace_path("roles", workspace_id),
    }


    PUBLIC_PATHS = {
      "GALLERY": lambda slug: f"{API_BASE}/public/galleries/{slug}",
      "INVITATION": lambda token: f"{API_BASE}/public/invitations/{token}",
    }


    STORAGE = {
      "KB": 1024,
      "MB": 1024 * 1024,
      "GB": 1024 * 1024 * 1024,
      "TB": 1024 * 1024 * 1024 * 1024,
    }


    FILE_LIMITS = {
      "MAX_PHOTO_SIZE": 100 * STORAGE["MB"],
      "MAX_VIDEO_SIZE": 500 * STORAGE["MB"],
      "MAX_DOCUMENT_SIZE": 50 * STORAGE["MB"],
      "MAX_AVATAR_SIZE": 5 * STORAGE["MB"],
    }


    STORAGE_KEYS = {
      "WORKSPACE_PREFIX": "workspaces",
      "ASSETS": "assets",
      "AVATARS": "avatars",
      "INVITATIONS": "invitations",
      "THUMBNAILS": "derived/thumbnails",
      "ORIGINALS": "original",
    }


    AI_THRESHOLDS = {
      "FACE_DETECTION_CONFIDENCE": 0.7,
      "FACE_CLUSTERING_SIMILARITY": 0.6,
      "AUTO_TAG_CONFIDENCE": 0.8,
    }


    PAGINATION = {
      "DEFAULT_PAGE": 1,
      "DEFAULT_LIMIT": 20,
      "MAX_LIMIT": 100,
    }


    RATE_LIMITS = {
      "API_REQUESTS_PER_MINUTE": 100,
      "AUTH_ATTEMPTS_PER_15_MIN": 5,
      "UPLOADS_PER_HOUR": 1000,
      "AI_OPS_PER_MINUTE": 30,
    }
    `);
  await ensureDir(path.dirname(PY_CONSTANTS_OUT));
  await writeFile(PY_CONSTANTS_OUT, content, 'utf-8');
}

async function writeValidationModule() {
    const content = normalizePython(`
    """Generated validation helpers matching shared-validation"""
    import re


    PATTERNS = {
      "HEX_COLOR": re.compile(r"^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$"),
      "UUID_V4": re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.IGNORECASE),
      "EMAIL": re.compile(r"^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"),
      "PHONE": re.compile(r"^\\+?[1-9]\\d{1,14}$"),
      "URL": re.compile(r"^https?:\\/\\/[^\\s/$.?#].[^\\s]*$", re.IGNORECASE),
      "SLUG": re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$"),
    }


    def is_valid_hex_color(value: str) -> bool:
      return bool(PATTERNS["HEX_COLOR"].match(value))


    def is_valid_uuid(value: str) -> bool:
      return bool(PATTERNS["UUID_V4"].match(value))


    def is_valid_email(value: str) -> bool:
      return bool(PATTERNS["EMAIL"].match(value))
    `);
  await ensureDir(path.dirname(PY_VALIDATION_OUT));
  await writeFile(PY_VALIDATION_OUT, content, 'utf-8');
}

async function syncPythonOutputs() {
  const targets = [BACKEND_SHARED_DIR, INVITES_SHARED_DIR];
  await Promise.all(targets.map((dir) => ensureDir(dir)));

  const files = [
    { source: PY_TYPES_OUT, name: 'types.py' },
    { source: PY_CONSTANTS_OUT, name: 'constants.py' },
    { source: PY_VALIDATION_OUT, name: 'validation.py' },
  ];

  // Clean existing copies to avoid stale artifacts
  await Promise.all(
    targets.flatMap((dir) => files.map((file) => rm(path.join(dir, file.name)).catch(() => undefined))),
  );

  for (const { source, name } of files) {
    for (const dir of targets) {
      await run('cp', [source, path.join(dir, name)]);
    }
  }

  console.log('[generate-python-types] Synced generated Python modules to consumers.');
}

async function main() {
  try {
    const schemasGenerated = await generateSchemas();
    if (!schemasGenerated) return;

    const pythonGenerated = await generatePythonModels();
    if (!pythonGenerated) return;

    await writeConstantsModule();
    await writeValidationModule();

    await syncPythonOutputs();
  } catch (err) {
    console.error('[generate-python-types] Failed:', err);
    process.exitCode = 1;
  }
}

main();
