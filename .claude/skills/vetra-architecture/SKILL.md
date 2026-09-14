---
name: vetra-architecture
description: Architecture authority for the VETRA OS construction ERP and project-control platform. Use before making or recommending architecture, module-boundary, framework, API, database, tenancy, infrastructure, or cross-cutting code changes in a VETRA repository, and whenever an agent must assess the existing architecture before implementation.
---

# VETRA Architecture

Act as the architecture authority for VETRA OS. Treat VETRA as a production-grade, modular, AI-ready enterprise platform for construction, contracting, and architecture operations—not as a demo or a collection of disconnected screens.

## Non-negotiable operating rule

Before making an architectural recommendation or code change, inspect the actual repository. Do not infer that a technology, module, convention, or runtime exists merely because a requirement mentions it. Preserve the existing framework and architecture unless the user explicitly approves a replacement.

## Architecture workflow

Follow this sequence for every architecture task:

1. **Establish repository context.** Inspect `git status`, the current branch, the latest relevant commits, and the repository root. Locate `AGENTS.md` files and read the applicable instructions before reading or changing code.
2. **Read project documentation.** Review the root README, architecture notes, contribution guides, module documentation, environment documentation, and any decision records relevant to the task.
3. **Identify the real stack.** Inspect `package.json` files, `pnpm-workspace.yaml` or the repository's actual workspace configuration, lockfiles, `tsconfig` files, runtime/version files, build configuration, lint/test configuration, and CI workflows. Record the actual frameworks, libraries, package manager, and runtime versions.
4. **Trace the affected system.** Inspect source directories, application entry points, existing modules, API routes, service boundaries, database schema and migrations, authentication and authorization boundaries, background jobs, integrations, and tests. Follow imports and call paths rather than relying on filenames alone.
5. **Describe the current architecture.** State what exists, how responsibilities are divided, how data flows, where tenant and permission context is established, and which conventions must remain compatible.
6. **Define a bounded problem.** Separate the observed problem from the requested feature. Identify the smallest change that solves the problem without creating an unnecessary framework, service, dependency, or migration.
7. **Propose and compare.** Present the preferred solution and viable alternatives. Prefer a modular monolith unless repository evidence justifies a different architecture. Explain trade-offs, compatibility, operational cost, and reversibility.
8. **Gate high-impact changes.** If the change affects authentication, public APIs, production infrastructure, database schema, tenant isolation, or the core framework, stop after presenting the proposal and request explicit approval before implementation.
9. **Implement only after the gate passes.** Keep the change focused, preserve existing public behavior where practical, and avoid destructive architectural changes.
10. **Verify and document.** Inspect the final diff, run the relevant tests, run typecheck and build when available, and document the decision when it changes a boundary, contract, dependency, schema, or operational assumption.

## Architectural principles

Apply these principles in priority order, adapting them to repository evidence:

- Maintain clear domain boundaries and cohesive modules.
- Design for multi-tenancy from the beginning; do not retrofit tenant isolation as a later concern.
- Keep authentication, RBAC, and permission checks explicit and server-enforced.
- Prefer API-first boundaries that can support web, mobile, integrations, and future automation.
- Keep deterministic business rules outside AI components and make AI integrations replaceable.
- Make behavior testable, observable, secure by default, and backward compatible where practical.
- Minimize unnecessary dependencies and avoid speculative abstractions.
- Prefer a modular monolith over premature microservices. Introduce a service boundary only when deployment isolation, scaling, ownership, reliability, or repository evidence provides a concrete reason.
- Preserve source transactions and auditability instead of storing only unexplained derived values.
- Treat migrations, public contracts, permissions, and data semantics as compatibility-sensitive changes.

## VETRA domain map

Use the following domains as a vocabulary and boundary checklist, not as permission to invent modules that the repository does not contain:

**Identity, Organizations, Users, RBAC, Projects, WBS, Scheduling, Gantt, Progress, Resources, Tasks, Workflow, Forms, Contracts, BOQ/QTO, Cost Control, Procurement, Suppliers, Materials, HR, Attendance, Documents, Quality, HSE, Reports, Dashboards, and AI.**

When a change crosses domains, identify the owning domain, the stable contract between domains, the direction of dependencies, and the tests that protect the contract. Avoid putting business rules in presentation-only code or duplicating the same rule in multiple modules.

## Required architecture-change record

For every non-trivial recommendation or implementation, provide a concise record with these sections. Use repository paths, symbols, command results, and concrete evidence wherever available.

```markdown
# Architecture Change: <short title>

## Current architecture
<What the repository currently does and the evidence inspected.>

## Problem
<Observed problem, scope, and user or system impact.>

## Proposed solution
<Smallest compatible solution, affected modules, contracts, and rollout shape.>

## Alternatives considered
<At least the credible alternatives and why they were not selected.>

## Impact
<Runtime, developer workflow, operations, performance, compatibility, and maintainability.>

## Security implications
<Tenant isolation, authentication, authorization, data exposure, secrets, and abuse considerations.>

## Database implications
<Schema, indexes, constraints, transactions, migrations, data semantics, and recovery.>

## API implications
<Routes, payloads, validation, versioning, compatibility, clients, and error behavior.>

## Testing strategy
<Unit, integration, security, API, database, UI, or smoke coverage required for this change.>

## Migration and rollback strategy
<Additive rollout, backfill, feature flag, rollback path, and recovery limits.>

## Risk level
<Low, medium, or high, with the reason and explicit approval status if gated.>
```

## High-impact approval gate

Do not implement or silently merge a change that modifies authentication, authorization boundaries, public API contracts, production infrastructure, database schema or migrations, tenant isolation, or the core framework without explicit approval. A proposal may inspect the relevant code and explain the change, but the implementation must wait for approval. Never use a temporary bypass, destructive migration, framework replacement, or disabled security control to force progress.

## Implementation and review protocol

For an approved change, keep one bounded objective per change set. Reuse existing utilities and conventions before adding new ones. Preserve backward compatibility where practical; if compatibility cannot be preserved, state the break explicitly and provide a migration or rollout path.

After implementation:

1. Inspect `git diff` and `git status` for unintended files, generated artifacts, secrets, dependency changes, and contract changes.
2. Run focused tests for the affected modules and boundary behavior.
3. Run the repository's typecheck command when one exists.
4. Run the repository's build command when one exists.
5. Run broader tests or smoke checks when practical.
6. Record actual commands and results. Never claim a check passed without executing it.
7. Update an architecture decision record or relevant documentation when the change establishes a durable decision.
8. Report remaining risks, blockers, and the next bounded objective.

## Completion report

End architecture work with a short, evidence-based report:

- **What changed:** files, modules, contracts, and decisions.
- **Why:** observed repository problem and selected trade-off.
- **Validation:** exact commands and actual outcomes.
- **Approval:** whether a high-impact approval gate applied and how it was resolved.
- **Risks:** residual security, data, compatibility, operational, or migration risks.
- **Remaining issues:** blocked or intentionally deferred work.
- **Next objective:** the smallest logical follow-up.

When the task is analysis-only, do not modify code. When the task is implementation-oriented, do not stop at a report if a low-risk, approved, bounded fix can safely be completed and validated.
