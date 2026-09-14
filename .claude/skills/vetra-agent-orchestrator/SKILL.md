---
name: vetra-agent-orchestrator
description: Orchestration and skill-routing authority for VETRA OS. Use before every engineering task to inspect repository state, classify the work, select the minimum required VETRA skills, establish a baseline, coordinate their order, and report validated bounded outcomes.
---

# VETRA Agent Orchestrator

Coordinate engineering work across the VETRA skill set. Before every task, establish repository truth, identify the task category and risk, select the minimum required skills, and keep the work bounded. Do not load every skill by default when a smaller set is sufficient.

## Before every task

Follow this sequence:

1. Read applicable `AGENTS.md` files and project documentation.
2. Inspect repository status, branch, latest commit, workspace, runtime, package manager, and affected modules.
3. Identify whether the task is analysis-only, implementation, migration, security remediation, UI work, infrastructure work, domain work, or AI integration.
4. Select the minimum required VETRA skills using the routing table below. Add `vetra-architecture` whenever the task changes a boundary, contract, dependency, or cross-cutting concern.
5. Establish a baseline when code changes are involved: focused checks first when a narrow defect is known, then repository lint, typecheck, tests, build, database, and smoke checks as applicable.
6. Identify approval gates before implementation. Stop and request explicit approval for destructive changes or changes affecting authentication, public APIs, production infrastructure, database schema, tenant isolation, or the core framework.

Do not overwrite user changes, assume a tool or framework exists, or claim success without actual command results.

## Skill routing

| Task category | Required skills |
| --- | --- |
| Security or access control | `vetra-security` → `vetra-code-audit` → `vetra-testing` |
| Architecture or module boundaries | `vetra-architecture` |
| Database, schema, migration, or persistence | `vetra-database` → `vetra-security` → `vetra-testing` |
| WBS, Gantt, scheduling, baseline, or progress | `vetra-project-control` → `vetra-database` when persistence changes → `vetra-testing` |
| ERP or business logic | `vetra-erp-domain` → `vetra-database` when persistence changes → `vetra-testing` |
| Frontend, Persian, RTL, or Shamsi UX | `vetra-ui-rtl` → `vetra-testing` |
| CI/CD, dependencies, runtime, or environment | `vetra-devops` → `vetra-code-audit` |
| AI feature, retrieval, model, or tool use | `vetra-ai-integration` → `vetra-security` → `vetra-architecture` → `vetra-testing` |
| Broad audit or unfamiliar repository | `vetra-code-audit` → add skills based on findings |

Use `vetra-security` for any route, file, export, search, notification, report, dashboard, workflow, or AI operation that could expose or mutate protected data, even if the task was initially described as UI or reporting work.

## Task lifecycle

Coordinate every implementation task through:

> **Analyze → Plan → Implement → Test → Review diff → Re-test → Document → Commit when authorized → Select next bounded objective**

Keep analysis and implementation distinct. Record the current architecture and problem before proposing a solution. Implement only an approved, bounded objective, and do not combine unrelated risky changes. If a low-risk fix is available, do not stop at a report; complete and validate it when authorized.

## Approval and safety rules

Never perform destructive changes without explicit approval. Treat deletion of production data, irreversible migrations, permission relaxation, framework replacement, authentication changes, public API breaks, and production infrastructure changes as gated. Do not disable security, tests, lint, typecheck, migrations, or CI checks to create an appearance of progress. Do not generate fake credentials or commit secrets.

When a task is blocked, report the exact evidence, what approval or information is needed, safe alternatives, and the smallest next action. Do not silently choose a risky assumption.

## Completion report

End each task with:

- **What changed:** files, modules, contracts, and decisions.
- **Why:** repository evidence and user outcome.
- **Tests:** exact commands and actual results, including skipped or blocked checks.
- **Risks:** residual security, data, compatibility, operational, or domain risk.
- **Remaining issues:** deferred work and blockers.
- **Next recommended objective:** one small, bounded follow-up.

For analysis-only work, say explicitly that no code changed. For implementation work, include the final diff review and validation evidence. Never claim a test, build, migration, security boundary, or deployment succeeded without executing the relevant check.
