# AGENTS.md

## Project Overview
- Name: rawdrive
- Type: greenfield
- Project ID: cobolt-rawdrive-f651e4
- Root: C:/Users/admin/Desktop/RawDriveCobolt
- Runtime: Codex IDE and compatible agent runtimes

## Tech Stack
- Detected stack: TBD during planning
- Confirm framework and runtime choices during `/cobolt-plan project`.

## Compliance Requirements
- None captured during init. Record compliance needs during planning if applicable.

## Key Conventions
- `cobolt-state.json` is the pipeline state source of truth.
- `_cobolt-output/` stores reports, audit logs, evidence, and init readiness artifacts.
- `_cobolt-docker/` contains project-scoped Docker Compose assets.
- `.env.cobolt` is for user-provided infrastructure and must stay gitignored.
- `e2e/playwright.config.js` is seeded during init so browser smoke can run at build time.

## Next Steps
- Update `.env.cobolt` if you already have infrastructure.
- Start local services from `_cobolt-docker/` with `docker compose up -d` when needed.
- Run `/cobolt-plan project .` to begin planning.

## Documentation MCP
Use Context7 MCP to fetch current documentation whenever the user asks about a library, framework, SDK, API, CLI tool, or cloud service, including setup, version migrations, configuration, or library-specific debugging.

Do not use it for refactoring, writing scripts from scratch, debugging business logic, code review, or general programming concepts.

When using Context7 MCP:
1. Start with `resolve-library-id` unless the user already provided an exact `/org/project` library ID.
2. Pick the best match using exact name, description relevance, snippet coverage, source reputation, and benchmark score.
3. Query docs with the selected library ID and the user's full question.
4. Answer from the fetched docs.
