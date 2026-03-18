# Reference: Improve Codebase Architecture

## Four Dependency Categories

When analyzing coupling between modules, classify each dependency into one of these categories:

### 1. Internal Implementation Detail
Dependencies that exist entirely within the module being deepened. These get hidden behind the new interface and are invisible to callers.

**Example**: A service that internally uses a repository, a cache, and a validator — callers only see the service interface.

### 2. Shared Infrastructure
Dependencies on platform-level infrastructure that multiple modules use (database sessions, Redis connections, message queues, configuration). These are injected via constructor or FastAPI `Depends()`.

**Example**: `AsyncSession`, `Redis`, `WorkspaceContext` — the deepened module accepts these but doesn't own them.

### 3. Peer Module Dependency
Dependencies on another domain module at the same architectural level. These create the tightest coupling and are the primary candidates for interface extraction.

**Example**: `GalleryService` depending on `AssetService` — both are domain services, and changes in one ripple to the other.

### 4. Cross-Boundary Dependency
Dependencies that cross an architectural boundary (frontend/backend, service/service, service/external-API). These require explicit contracts (API schemas, event schemas, shared types).

**Example**: Frontend hook calling a backend endpoint, or a microservice emitting events consumed by another service.

## GitHub Issue RFC Template

Use this template when creating refactor RFC issues:

```markdown
## Refactor RFC: [Module Name] Deepening

### Problem

[2-3 sentences describing the architectural friction — why these modules are hard to test, hard to understand, or create integration risk]

### Current State

**Modules involved:**
- `path/to/module_a.py` — [what it does]
- `path/to/module_b.py` — [what it does]
- `path/to/module_c.py` — [what it does]

**Coupling pattern:** [How they're coupled — shared types, direct calls, co-ownership]

**Dependency category:** [Internal / Shared Infrastructure / Peer Module / Cross-Boundary]

### Proposed Interface

```python
# or typescript — match the language of the module
class NewDeepModule:
    """[One sentence: what this module hides]"""

    def method(self, params) -> ReturnType:
        """[What callers get without knowing how]"""
        ...
```

### What Gets Hidden

- [Implementation detail 1]
- [Implementation detail 2]
- [Integration logic that callers shouldn't know about]

### Migration Path

1. [ ] Create new module with proposed interface
2. [ ] Write boundary tests against the interface
3. [ ] Migrate callers one at a time
4. [ ] Delete old modules / mark as internal
5. [ ] Remove old unit tests replaced by boundary tests

### Test Impact

**Tests replaced:** [List tests that become redundant]
**New tests:** [Describe boundary tests that replace them]
**Net effect:** [Fewer tests, better coverage of real behavior]

### Trade-offs

- **Pro:** [Benefit 1]
- **Pro:** [Benefit 2]
- **Con:** [Cost 1]
- **Con:** [Cost 2]

### Design Alternatives Considered

| Design | Approach | Why not chosen |
|--------|----------|----------------|
| [Name] | [1 sentence] | [1 sentence] |
| [Name] | [1 sentence] | [1 sentence] |
```

## Decision Criteria for Module Deepening

A module is a good candidate for deepening when:

1. **High bounce rate**: Understanding the concept requires reading 4+ files
2. **Shallow interface**: The module's public API is nearly as complex as its implementation
3. **Test fragility**: Tests break when implementation changes, even when behavior doesn't
4. **Seam bugs**: Real bugs live in the integration between modules, not inside them
5. **AI navigation friction**: An AI agent struggles to find the right entry point

A module is NOT a good candidate when:

1. It's already deep (small interface, large hidden implementation)
2. The coupling is intentional and load-bearing (e.g., a plugin system)
3. The modules are about to be rewritten anyway
4. The test suite is already testing at the right boundaries
