# GSD Integration Analysis for RawDrive

**Date:** 2026-02-08
**Status:** Exploratory Analysis
**Purpose:** Evaluate integration of GSD (Get Shit Done) with RawDrive's existing `.claude/` infrastructure

---

## Executive Summary

GSD is a lightweight, spec-driven development system for Claude Code that combats **context rot** through structured meta-prompting, XML task formatting, and multi-agent orchestration. RawDrive already has extensive tooling (Speckit, Antigravity Kit, skills, agents, commands). This analysis explores how GSD could complement or integrate with RawDrive's existing workflow.

**Key Finding:** GSD's core value proposition—context engineering and atomic git commits—complements RawDrive's existing documentation-heavy approach. Integration is possible but requires careful consideration of overlap with Speckit.

---

## 1. Comparative Analysis: GSD vs RawDrive's Existing Tools

### 1.1 Feature Comparison

| Aspect | GSD | RawDrive (Speckit) | RawDrive (Antigravity Kit) |
|--------|-----|-------------------|---------------------------|
| **Primary Focus** | Context engineering, context rot | Spec-driven development with ceremonies | Agent coordination, skills library |
| **Planning Approach** | Questions → Research → Requirements → Roadmap | Constitution → Spec → Plan → Tasks | Brainstorm → Orchestrate → Execute |
| **Output Artifacts** | `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `PLAN.md` (XML) | Feature specs, Constitution, Tasks | Various skill-based outputs |
| **Task Format** | XML-structured tasks with verification | Markdown tasks with dependencies | Agent/skill driven |
| **Git Strategy** | Atomic commits per task | Conductor tracks with git awareness | Manual or workflow-based |
| **Multi-Agent** | Orchestrator spawns specialized subagents | Team-based workflows | 19 agents, 36 skills |
| **Token Management** | Fresh context per plan (200k tokens) | Session-based context management | Not explicitly addressed |
| **Installation** | `npx get-shit-done-cc@latest` | Built into `.claude/` | Built into `.agent/` |
| **Philosophy** | "No enterprise theater" | Full enterprise ceremonies | Modular agent capabilities |

### 1.2 Overlap Assessment

| Overlap Area | GSD | RawDrive | Compatibility |
|--------------|-----|-----------|---------------|
| **Project Planning** | `/gsd:new-project` | `/speckit:specify` + `/speckit:plan` | HIGH - Similar outcomes, different approaches |
| **Task Breakdown** | `/gsd:plan-phase` | `/speckit:tasks` | MEDIUM - GSD uses XML, Speckit uses markdown |
| **Codebase Analysis** | `/gsd:map-codebase` | `/brainstorm` workflow | MEDIUM - Both use parallel agents |
| **Code Review** | Built-in verification | `/validation:code-review` | HIGH - Similar intent |
| **Git History** | Atomic commits per task | Conductor tracks | MEDIUM - Different granularity |
| **Documentation** | `.planning/` directory | `docs/` + `specs/` | LOW - Complementary locations |

---

## 2. Integration Approaches

### 2.1 Approach 1: Parallel Installation (Recommended for Exploration)

Install GSD alongside existing RawDrive tooling. Use GSD for greenfield features while maintaining Speckit for enterprise workflows.

**Pros:**
- No disruption to existing workflows
- Easy to A/B test GSD vs Speckit
- Can adopt GSD patterns incrementally
- Low risk

**Cons:**
- Potential tool confusion (when to use which?)
- Duplicate functionality
- Learning curve for team

**Implementation:**
```bash
# Local installation for testing
npx get-shit-done-cc --claude --local

# Verify
/gsd:help
```

**Usage Guidelines:**
- Use GSD for: New microservices, standalone features, experimental work
- Use Speckit for: Enterprise features, compliance requirements, team coordination
- Use Antigravity Kit for: Specialized agent tasks (UI design, security audit, etc.)

### 2.2 Approach 2: Hybrid Integration

Create a RawDrive-specific GSD configuration that integrates with existing documentation patterns.

**Implementation:**

1. **Custom GSD Configuration** (`.planning/config.json`)
```json
{
  "mode": "interactive",
  "depth": "standard",
  "workflow": {
    "research": true,
    "plan_check": true,
    "verifier": true
  },
  "rawdrive": {
    "tech_specs_dir": "docs/TechnicalSpecs",
    "business_features_dir": "docs/Business_Features",
    "use_shared_types": true,
    "follow_project_structure_skill": true,
    "security_checkpoints": true,
    "workspace_isolation": true
  }
}
```

2. **RawDrive-Specific Templates**

Create custom plan templates that reference RawDrive's patterns:
- `.planning/templates/rawdrive-backend-plan.xml`
- `.planning/templates/rawdrive-frontend-plan.xml`
- `.planning/templates/rawdrive-microservice-plan.xml`

3. **Bridge Commands**

Create wrapper commands that combine GSD with RawDrive skills:
```bash
# .claude/commands/gsd/rawdrive-new-feature.md
# Combines /gsd:new-project with RawDrive's security and structure checks
```

**Pros:**
- Leverages GSD's context engineering
- Maintains RawDrive's patterns
- Single unified workflow

**Cons:**
- Higher implementation effort
- Maintenance burden
- Risk of version conflicts

### 2.3 Approach 3: Extract and Adapt (Long-term)

Extract GSD's core innovations (XML task format, atomic commits, fresh context) and integrate into RawDrive's existing tooling.

**Key GSD Innovations to Adapt:**

1. **XML Task Format**
```xml
<task type="auto">
  <name>Implement face detection caching</name>
  <files>backend/src/app/services/face_cache_manager.py</files>
  <action>
    Use face_cache_manager.py pattern.
    Implement embedding cache with TTL.
    Follow security skill guidelines.
  </action>
  <verify>
    pytest tests/test_face_cache.py passes
    Cache hit rate > 80% in logs
  </verify>
  <done>
    Face embeddings cached for 24h
    Cache invalidation on face updates
  </done>
</task>
```

2. **Atomic Commit Pattern**
```bash
# Each task gets its own commit immediately
abc123f feat(08-02): add face embedding cache table
def456g feat(08-02): implement cache manager service
hij789k feat(08-02): add cache invalidation hook
```

3. **Fresh Context Execution**
- Each plan runs in isolated 200k token context
- Main orchestrator stays at 30-40% capacity
- Parallel execution with independent agents

**Pros:**
- Best of both worlds
- No external dependency
- Full control

**Cons:**
- Significant development effort
- Need to maintain forked logic

---

## 3. Context Engineering: How GSD Beats Context Rot

### 3.1 The Problem: Context Rot in LLMs

As conversations grow, LLMs suffer from "attention dilution":
- Earlier tokens get more attention than later tokens
- Long conversations cause information degradation
- Complex tasks lose coherence

### 3.2 GSD's Solution

| Technique | How It Works | RawDrive Equivalent |
|-----------|--------------|---------------------|
| **Thin Orchestrators** | Main context only coordinates, never does heavy lifting | Speckit commands |
| **Fresh Subagent Contexts** | Each plan gets 200k tokens | New agent per task |
| **XML Task Structure** | Precise, verifiable instructions | Not currently used |
| **Atomic Git Commits** | One commit per completed task | Conductor tracks |
| **Documentation Limits** | Size limits based on quality degradation | No explicit limits |

### 3.3 RawDrive's Current Context Management

**Strengths:**
- Extensive reference documentation (`.claude/reference/`)
- Auto-loaded skills (20 skills auto-loaded)
- PRD and technical specs for context
- Antigravity Kit agents for specialized tasks

**Gaps:**
- No explicit token budget management
- Tasks often exceed optimal context windows
- Verification is manual
- Git commits are not atomic per task

---

## 4. Recommended Integration Strategy

### Phase 1: Parallel Evaluation (1-2 weeks)

1. Install GSD locally for testing
2. Run `/gsd:map-codebase` on RawDrive
3. Compare GSD's analysis with existing documentation
4. Use GSD for one small feature (e.g., new API endpoint)
5. Compare experience with Speckit workflow

**Success Criteria:**
- GSD successfully maps RawDrive's architecture
- Feature completed with atomic git history
- Context remains responsive throughout

### Phase 2: Hybrid Pilot (2-4 weeks)

1. Create RawDrive-specific GSD configuration
2. Build integration with existing skills (security, project-structure)
3. Implement custom templates for RawDrive patterns
4. Pilot on a medium-complexity feature

**Success Criteria:**
- GSD respects RawDrive's file structure rules
- Security checkpoints integrated
- Shared types properly imported

### Phase 3: Decision Point

Based on Phases 1-2, choose:
- **A)** Full adoption of GSD for new features
- **B)** Hybrid: GSD for exploration, Speckit for implementation
- **C)** Extract GSD patterns into RawDrive tooling
- **D)** Decline: Current tooling sufficient

---

## 5. GSD Commands Mapping to RawDrive Workflows

| GSD Command | RawDrive Equivalent | Notes |
|-------------|---------------------|-------|
| `/gsd:new-project` | `/speckit:specify` + `/speckit:plan` | GSD more interactive, Speckit more structured |
| `/gsd:map-codebase` | `/brainstorm` + manual analysis | GSD parallelizes analysis |
| `/gsd:discuss-phase` | Manual planning | GSD's unique context capture step |
| `/gsd:plan-phase` | `/speckit:tasks` | GSD uses XML, Speckit uses markdown |
| `/gsd:execute-phase` | `/speckit:implement` | GSD atomic commits, Speckit batch commits |
| `/gsd:verify-work` | `/validation:system-review` | Similar intent, different format |
| `/gsd:quick` | Direct implementation | GSD provides guardrails |
| `/gsd:debug` | `/debug` workflow | Similar systematic debugging |

---

## 6. File Structure Comparison

### GSD Creates:
```
.planning/
├── config.json              # Project configuration
├── PROJECT.md                # Vision statement
├── REQUIREMENTS.md          # Scoped v1/v2 requirements
├── ROADMAP.md                # Phase-based milestones
├── STATE.md                  # Session memory
├── research/                 # Ecosystem research
│   ├── stack.md
│   ├── features.md
│   ├── architecture.md
│   └── pitfalls.md
├── todos/                    # Captured ideas
└── quick/                    # Ad-hoc tasks
```

### RawDrive Has:
```
.claude/
├── PRD.md                    # Product vision
├── reference/                # 24 best practice guides
├── skills/                   # 20 auto-loaded skills
├── commands/                 # 40+ commands
└── agents/                   # 10 specialized agents

docs/
├── TechnicalSpecs/           # 40+ JSON specs
├── Business_Features/        # 24 numbered specs
└── Features/                 # 150+ feature docs
```

**Complementarity:** GSD's `.planning/` directory is transient and project-specific, while RawDrive's documentation is persistent and enterprise-grade. They serve different purposes.

---

## 7. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Tool confusion** | Medium | Clear documentation on when to use which tool |
| **Context fragmentation** | Medium | Keep GSD artifacts in `.planning/`, separate from `docs/` |
| **Git history divergence** | Low | GSD atomic commits can be squashed into PRs |
| **Skill conflicts** | Low | GSD can reference RawDrive skills |
| **Maintenance burden** | Medium | Limit to experimental phase initially |

---

## 8. Next Steps

1. **Explore GSD locally**
   ```bash
   npx get-shit-done-cc --claude --local
   /gsd:help
   ```

2. **Test on small feature**
   - Use `/gsd:map-codebase` first
   - Try `/gsd:quick` for a simple bug fix
   - Evaluate atomic git history

3. **Compare with Speckit**
   - Run same feature with Speckit workflow
   - Compare time, quality, git history
   - Document learnings

4. **Document decision**
   - Create integration guide if adopted
   - Or document rationale for declining

---

## 9. Conclusion

GSD offers innovative approaches to context engineering that could benefit RawDrive, particularly:
- Atomic git commits for better traceability
- XML task format for precise instructions
- Fresh context execution for quality maintenance

However, RawDrive already has substantial investment in Speckit and Antigravity Kit. The recommended approach is **parallel evaluation** before considering deeper integration. GSD's lightweight philosophy ("no enterprise theater") contrasts with RawDrive's enterprise-grade documentation requirements—this philosophical difference should be considered.

**Recommendation:** Proceed with Phase 1 (Parallel Evaluation) before committing to any integration.
