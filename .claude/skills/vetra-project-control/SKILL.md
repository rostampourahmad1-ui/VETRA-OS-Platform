---
name: vetra-project-control
description: Construction project-controls domain authority for VETRA OS. Use when designing or changing projects, WBS, activities, tasks, milestones, dependencies, calendars, Gantt views, baselines, schedules, resources, progress, critical path, float, variance, cost, or related reports and calculations.
---

# VETRA Project Control

Act as the domain specialist for professional construction project management inside VETRA OS. Preserve real project-control concepts rather than simplifying the model merely to make a screen easier to build. Scheduling and progress rules belong in testable domain or service code, not only in UI calculations.

## Core model

Use repository evidence to map these concepts and their relationships:

**Project, WBS, activity, task, milestone, dependency, predecessor, successor, calendar, working day, baseline, schedule, resource, planned progress, actual progress, physical progress, cost, duration, critical path, float, variance, report, and Gantt visualization.**

Do not invent a parallel model if the repository already has compatible entities. Identify the owning domain, identifiers, lifecycle, tenant/project scope, and source of truth for every concept.

## Project-control workflow

Before changing project-control behavior:

1. Read applicable `AGENTS.md` files and project-control documentation.
2. Inspect the actual project, WBS, task/activity, resource, cost, progress, calendar, and report models, migrations, services, API routes, UI components, and tests.
3. Trace how dates, durations, dependencies, baselines, progress, costs, and permissions flow through the system.
4. Identify whether calculations are implemented in domain/service code or incorrectly duplicated in UI code.
5. Define the business rule and invariants before changing code. Do not silently reinterpret baseline or user-entered data.
6. Add or update domain and regression tests before or with the implementation.
7. Implement the smallest compatible change and preserve existing construction workflows.
8. Run focused calculation tests, related suites, typecheck, build, and UI/smoke checks when relevant.
9. Inspect the diff and document data, date, migration, API, and reporting implications.

## Scheduling rules

Support a professional, MSP-like scheduling model over time:

- Hierarchical WBS and stable activity numbering.
- Start and finish dates with explicit duration semantics.
- Predecessors, successors, dependency types, and lag/lead when supported.
- Milestones with zero-duration semantics where appropriate.
- Calendars, working days, holidays, exceptions, and timezone handling.
- Baselines that remain immutable unless an explicit revision workflow is used.
- Planned, actual, and physical progress with clear definitions.
- Resource assignment, cost, duration, critical-path, float, variance, and report calculations.
- Gantt visualization backed by domain data rather than screen-local estimates.

Keep internal date/time representation technically correct, timezone-aware, and consistent with the repository. The Persian/Shamsi calendar is mandatory for the user interface, but it must not corrupt internal Gregorian/ISO or timezone semantics. Never mix display-calendar conversion with storage or scheduling calculations.

Do not silently modify user-entered baseline data. Make recalculation behavior explicit, deterministic, and auditable. Preserve the distinction between planned schedule, actual execution, forecast, and approved baseline.

## Required tests for changes

When changing project-control logic, add or update tests for:

| Area | Minimum coverage |
| --- | --- |
| Date calculations | Duration, working days, holidays, timezones, boundaries, and invalid ranges. |
| Dependencies | Predecessor/successor propagation, dependency types, cycles, lag/lead, and missing references. |
| Progress | Planned, actual, physical progress, aggregation, rounding, and variance edge cases. |
| Baselines | Immutability, revision/approval behavior, comparison, and audit history. |
| Calendars | Working-time exceptions, timezone transitions, and Persian/Shamsi conversion where applicable. |
| Critical path | Forward/backward calculations, float, milestones, and disconnected or cyclic graphs. |
| Security | Tenant and project isolation, permission-aware reads/writes, and protected reports/exports. |

Use deterministic clocks, explicit timezones, stable fixtures, and realistic construction data. Do not replace domain calculations with random, mock, or UI-only values in production paths.

## Change report

For every substantial project-control change, report:

```markdown
# Project-Control Change: <short title>

## Current model
<Entities, calculations, dates, permissions, and repository evidence.>

## Business rule
<Precise rule and invariants.>

## Proposed implementation
<Domain/service, API, database, and UI changes.>

## Compatibility and data impact
<Baseline, existing projects, migrations, reports, and API clients.>

## Tests
<Exact focused and related commands with actual results.>

## Risks and next step
<Remaining risk, blocked work, and next bounded objective.>
```

Do not sacrifice professional scheduling concepts for visual convenience. If a requested simplification would change schedule semantics, explain the trade-off and request approval before proceeding.
