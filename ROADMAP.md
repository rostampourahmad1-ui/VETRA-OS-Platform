# VETRA Platform Roadmap

## Product direction

VETRA is a modular construction-management platform for engineering companies, contractors, developers, and investment groups. The implementation should preserve the existing monorepo boundaries, keep the dashboard-first workspace experience, and evolve each placeholder into a typed, permission-aware feature without coupling modules together.

## Current baseline

The repository currently contains the `artifacts/vetra` web application, the `artifacts/mockup-sandbox` visual sandbox, the `artifacts/api-server` service, shared libraries under `lib/`, and the root Vitest suite. The baseline verification completed on 2026-08-16 shows that dependency installation, TypeScript validation, and all five existing tests pass. The production build was initially blocked because both Vite configurations required `PORT` and `BASE_PATH` even for non-Replit builds; those configurations now use safe defaults (`PORT=5000`, `BASE_PATH=/`).

The Blueprint defines Forms, Payroll, Quality, and Safety as important product areas, while the current UI already includes core navigation, projects, tasks, documents, contracts, reports, meetings, HR, equipment, inventory, procurement, cost control, CRM, reports, AI Assistant, and settings. Forms, Payroll, Quality, and Safety are not yet implemented as first-class routes or domain features. The next increment therefore starts with Forms Builder because it is cross-cutting, directly supports project and daily-report workflows, and provides a reusable foundation for approvals, quality inspections, safety checklists, and HR processes.

## Prioritized delivery plan

| Priority | Workstream | Scope | Exit criteria |
| --- | --- | --- | --- |
| P0 | Build and release hygiene | Keep `pnpm install`, `pnpm typecheck`, `pnpm build`, and `pnpm test` deterministic; remove environment-specific assumptions from build configuration. | All four commands pass from a clean checkout without Replit-only environment variables. |
| P1 | Forms Builder | Add a first-class Forms route with template management, field palette, editable form canvas, field settings, preview mode, and local draft persistence. | A user can create a draft form, add/reorder/remove fields, edit labels and required state, preview it, and see the draft after reload. |
| P2 | Forms backend and workflow | Add typed form/template/submission entities, organization/project scope, RBAC checks, versioning, submissions, comments, attachments, and approval workflow. | Forms are persisted server-side, access-controlled, versioned, and auditable. |
| P3 | Quality Management | Build inspection templates from Forms, non-conformance records, corrective actions, approval states, and project-level quality dashboards. | Quality inspections can be issued, assigned, reviewed, and tracked to closure. |
| P4 | Safety / HSE | Build safety checklists, toolbox talks, incident reporting, risk registers, corrective actions, and HSE metrics. | Site teams can record and escalate safety events with a clear audit trail. |
| P5 | Payroll | Define employee compensation, attendance inputs, allowances/deductions, pay periods, approvals, and exportable payroll summaries. | HR and accounting roles can prepare, review, approve, and export a payroll period. |
| P6 | i18n and Persian RTL | Introduce message catalogs, language switching, RTL layout tokens, Jalali date/number formatting, and translated core navigation. | English and Persian are switchable without layout regressions; Jalali dates are used where user-facing. |
| P7 | Data and enterprise hardening | Complete database migrations, server procedures, tenant isolation, audit logs, notifications, search indexing, attachments, digital-signature placeholder, and observability. | Core entities have durable persistence, organization boundaries, and operational diagnostics. |

## Immediate implementation

The current increment implements the P1 Forms Builder as a polished client-side prototype that follows the existing `Shell`, shadcn-style UI components, Wouter routing, and local draft patterns. It intentionally avoids inventing a backend contract before the database and API entities are agreed in P2. The prototype is designed so its field model can be moved into shared schemas with minimal rework.

## Definition of done for future increments

Every feature should include a route and navigation entry, loading/empty/error states, responsive behavior, keyboard-accessible controls, typed API contracts, permission checks, tests for domain behavior, and a clean run of `pnpm install`, `pnpm typecheck`, `pnpm build`, and `pnpm test`. Placeholder actions must be explicit rather than silently failing.

## Verification commands

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm test
```
