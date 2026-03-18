---
name: design-audit
description: "Use when asked to audit the design, visual QA, check if the UI looks good, polish the frontend, find AI slop, or do a design review on a live page. Runs an 80-item visual audit across 10 categories, then fixes findings with atomic commits and before/after screenshots."
---

# Design Audit Skill

Run a structured 80-item visual audit on any live RawDrive page, grade it across 10 weighted categories, detect AI slop patterns, then fix findings with atomic commits and before/after evidence.

## Prerequisites

- Frontend running at `http://localhost:5173`
- Playwright MCP or Chrome DevTools MCP available for screenshots
- Git working tree clean (stash or commit before starting)
