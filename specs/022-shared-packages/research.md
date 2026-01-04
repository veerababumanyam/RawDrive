# Research: Shared Packages Infrastructure

**Feature**: 022-shared-packages
**Date**: 2026-01-04
**Status**: Complete

## Executive Summary

This research document evaluates tooling and architectural options for implementing shared packages across RawDrive's TypeScript frontend, Python backend, and Python microservices. The recommended approach uses **pnpm workspaces** with the **workspace protocol** for TypeScript packages, and **datamodel-code-generator** for TypeScript-to-Python type generation via JSON Schema as an intermediate format.

## Research Questions

### RQ-1: What is the best package manager for TypeScript monorepo workspaces?

**Options Evaluated**:

| Tool | Disk Efficiency | Speed | Workspace Support | Recommendation |
|------|-----------------|-------|-------------------|----------------|
| npm workspaces | Fair | Moderate | Native | Not recommended |
| pnpm workspaces | Excellent | Fast | Native + `workspace:` protocol | **Recommended** |
| Yarn workspaces | Good | Fast | Native + resolutions | Alternative |
| Nx | Good | Fast | Built-in | Overkill for 4 packages |
| Turborepo | Good | Fastest | Requires npm/pnpm/yarn | Consider for build caching |

**Decision**: **pnpm workspaces**

**Rationale**:
- Content-addressable storage with symlinks reduces disk space by 40-60%
- `workspace:` protocol ensures local package resolution
- Strict node_modules prevents phantom dependencies
- Native TypeScript project references support
- No additional tooling required beyond pnpm itself

**Sources**:
- [pnpm Workspace Documentation](https://pnpm.io/workspaces)
- [Complete Monorepo Guide: pnpm + Workspace + Changesets](https://jsdev.space/complete-monorepo-guide/)
- [Managing TypeScript Packages in Monorepos | Nx Blog](https://nx.dev/blog/managing-ts-packages-in-monorepos)

---

### RQ-2: How should TypeScript types be converted to Python/Pydantic?

**Options Evaluated**:

| Approach | Direction | Intermediate Format | Pydantic V2 | Recommendation |
|----------|-----------|---------------------|-------------|----------------|
| pydantic-to-typescript | Python → TS | JSON Schema | v1 only | Not suitable (wrong direction) |
| pydantic2-to-typescript | Python → TS | JSON Schema | v2 | Not suitable (wrong direction) |
| datamodel-code-generator | Schema → Python | JSON Schema/OpenAPI | v2 | **Recommended** |
| Manual maintenance | N/A | N/A | N/A | Error-prone |
| ts-json-schema-generator + datamodel-codegen | TS → Schema → Python | JSON Schema | v2 | **Selected approach** |

**Decision**: **TypeScript → JSON Schema → Pydantic pipeline**

**Pipeline**:
```
TypeScript Types
      ↓
ts-json-schema-generator (TS → JSON Schema)
      ↓
JSON Schema (.json files)
      ↓
datamodel-code-generator (JSON Schema → Pydantic v2)
      ↓
Python Pydantic Models
```

**Rationale**:
- TypeScript is the single source of truth (matches frontend-first development)
- JSON Schema is a stable, language-agnostic intermediate format
- datamodel-code-generator supports Pydantic v2 BaseModel output
- Automated pipeline prevents manual drift
- CI can verify generated files are up-to-date

**Sources**:
- [datamodel-code-generator GitHub](https://github.com/koxudaxi/datamodel-code-generator)
- [Pydantic JSON Schema Documentation](https://docs.pydantic.dev/latest/api/json_schema/)

---

### RQ-3: How should shared packages be consumed by Python services?

**Options Evaluated**:

| Approach | Installation | Sync Method | Recommendation |
|----------|--------------|-------------|----------------|
| PyPI package | pip install | Manual publish | Overkill for internal use |
| Git submodule | git submodule update | Manual | Complex, error-prone |
| Symlink | ln -s | Automatic | **Simple, recommended** |
| Copy on build | cp -r | CI script | **Selected for production** |
| pip -e (editable) | pip install -e | Manual | Requires setup.py |

**Decision**: **Copy on build** with symlink for development

**Development Flow**:
```bash
# packages/shared-types/generated/python/ is generated
# backend/src/app/shared/ is a symlink during development
ln -s ../../../packages/shared-types/generated/python backend/src/app/shared

# Or copy for production
cp -r packages/shared-types/generated/python backend/src/app/shared
```

**Rationale**:
- Symlinks work well for local development (changes reflect immediately)
- Copy ensures reproducible builds in CI/Docker
- No need for private PyPI registry
- Python imports work naturally (`from app.shared.types import InvitationStatus`)

---

### RQ-4: How should enums be represented for cross-language compatibility?

**Options Evaluated**:

| TypeScript Pattern | Python Equivalent | Runtime Value | Recommendation |
|-------------------|-------------------|---------------|----------------|
| `const enum` | N/A | Inlined (no runtime) | Not suitable |
| `enum` (numeric) | `IntEnum` | Numbers | Not suitable (string expected) |
| `enum` (string) | `StrEnum` | Strings | Compatible but verbose |
| String literal union | `Literal[]` | Strings | Type-only, no runtime |
| Object with `as const` | `StrEnum` | Strings | **Recommended** |

**Decision**: **Object with `as const` for TypeScript, `StrEnum` for Python**

**Example**:
```typescript
// TypeScript (shared-types)
export const InvitationStatus = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
} as const;

export type InvitationStatus = typeof InvitationStatus[keyof typeof InvitationStatus];
```

```python
# Python (generated)
from enum import StrEnum

class InvitationStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    EXPIRED = "expired"
    CANCELLED = "cancelled"
```

**Rationale**:
- `as const` objects provide runtime values for TypeScript (can iterate, use in switch)
- String values ensure JSON serialization works identically
- `StrEnum` (Python 3.11+) provides string inheritance for Pydantic compatibility
- Both produce identical JSON: `"draft"`, `"published"`, etc.

---

### RQ-5: What build orchestration is needed?

**Decision**: **pnpm scripts with topological ordering**

**Build Order**:
1. `packages/shared-types` (types first, no deps)
2. `packages/shared-constants` (may reference types)
3. `packages/shared-validation` (depends on types)
4. `packages/shared-utils` (may depend on types)
5. Generate Python types
6. `frontend/` (consumes all packages)
7. `backend/` (consumes generated Python)

**pnpm Script Configuration**:
```json
{
  "scripts": {
    "build:packages": "pnpm -r --filter './packages/*' build",
    "generate:python": "node scripts/generate-python-types.ts",
    "build:all": "pnpm build:packages && pnpm generate:python && pnpm -r build"
  }
}
```

**Rationale**:
- pnpm handles dependency ordering via `--filter`
- No need for Turborepo/Nx for 4 simple packages
- Python generation runs after TypeScript build

---

### RQ-6: How should backward compatibility be maintained during migration?

**Decision**: **Re-export pattern with deprecation warnings**

**Migration Strategy**:
```typescript
// frontend/src/types/invitations.ts (BEFORE)
export enum InvitationStatus {
  DRAFT = 'draft',
  // ...
}

// frontend/src/types/invitations.ts (AFTER - Phase 1)
// Re-export from shared package for backward compatibility
export { InvitationStatus } from '@rawdrive/shared-types';

// @deprecated Use import from '@rawdrive/shared-types' directly
/** @deprecated Import from '@rawdrive/shared-types' instead */
export const InvitationStatusLegacy = InvitationStatus;
```

**Migration Phases**:
1. **Phase 1**: Add shared packages, re-export from existing files
2. **Phase 2**: Update imports in new code to use shared packages
3. **Phase 3**: Codemod to update all imports (automated)
4. **Phase 4**: Remove deprecated re-exports (after 2 release cycles)

**Rationale**:
- Zero breaking changes in Phase 1
- Gradual adoption allows testing at each step
- Codemod automation reduces manual effort
- 2 release cycles gives time to update any external dependencies

---

## Implementation Recommendations

### Package Structure

```
packages/
├── shared-types/
│   ├── package.json          # name: @rawdrive/shared-types
│   ├── tsconfig.json         # extends root config
│   ├── src/
│   │   ├── index.ts          # barrel export
│   │   ├── invitations.ts
│   │   ├── gallery.ts
│   │   ├── gradient.ts
│   │   └── common.ts
│   ├── schemas/              # Generated JSON Schemas
│   │   └── *.json
│   ├── generated/
│   │   └── python/
│   │       └── types.py      # Generated Pydantic models
│   └── tests/
│       └── types.test.ts
```

### Root Configuration Files

**pnpm-workspace.yaml**:
```yaml
packages:
  - 'packages/*'
  - 'frontend'
  - 'backend'
  - 'services/*'
```

**tsconfig.json** (root):
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "composite": true
  }
}
```

### CI/CD Considerations

1. **Build Verification**: CI must verify generated Python matches TypeScript
2. **Type Parity Tests**: Cross-language tests validate identical JSON output
3. **Bundle Size Checks**: Fail if any package exceeds 5KB gzipped

---

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Python generation tool breaks | High | Low | Pin datamodel-codegen version, test in CI |
| Breaking change in shared type | High | Medium | Semantic versioning, deprecation period |
| Import cycles between packages | Medium | Low | Strict package boundaries, no cross-deps |
| Bundle size bloat | Low | Medium | Tree-shaking, per-package size limits |
| Developer confusion during migration | Medium | Medium | Clear documentation, codemod scripts |

---

## References

- [pnpm Workspace Documentation](https://pnpm.io/workspaces)
- [Complete Monorepo Guide: pnpm + Workspace + Changesets](https://jsdev.space/complete-monorepo-guide/)
- [Setting up a monorepo with pnpm and TypeScript](https://brockherion.dev/blog/posts/setting-up-a-monorepo-with-pnpm-and-typescript/)
- [datamodel-code-generator GitHub](https://github.com/koxudaxi/datamodel-code-generator)
- [Pydantic JSON Schema Documentation](https://docs.pydantic.dev/latest/api/json_schema/)
- [Managing TypeScript Packages in Monorepos | Nx Blog](https://nx.dev/blog/managing-ts-packages-in-monorepos)
