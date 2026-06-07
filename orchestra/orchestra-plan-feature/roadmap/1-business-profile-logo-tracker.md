# 1 - Business profile logo: prominent top placement + crop/adjust-on-upload at /settings/business matching SaaS standards (tracker)

**Status:** 100% complete (3/3 shipped)

> GENERATED from `1-business-profile-logo-tracker.json` - the machine source of truth. Do NOT hand-edit this table;

> run `cpf-track set --ref <id> --status <s>` then `cpf-track view` (or re-materialize).

| # | Sub-feature | Priority | Size | Depends on | Status | Issue | PR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1a | Backend: workspace logo upload + server-side crop render endpoints | P1 | M | - | merged | #240 | #242 |
| 1b | Frontend: crop/zoom/pan adjust-on-upload for the business logo | P1 | M | #1a | merged | #243 | #244 |
| 1c | Frontend: prominent studio-logo brand header at the top of /settings/business | P2 | S | #1b | merged | #245 | #246 |

