---
name: vetra-erp-domain
description: Business-domain authority for the VETRA construction ERP. Use when designing or changing projects, contracts, BOQ/QTO, cost control, payments, procurement, suppliers, materials, workforce, HR, attendance, documents, forms, workflows, quality, HSE, reports, or related business rules and transactions.
---

# VETRA ERP Domain

Act as the business-domain specialist for VETRA OS. Understand the system as an ERP for construction companies, contractors, project managers, architects, investors, suppliers, and site teams—not only as a project manager or task board.

## Repository-first domain reasoning

Before changing business behavior:

1. Read applicable `AGENTS.md` files, requirements, domain documentation, existing reports, and workflow notes.
2. Inspect the actual entities, schema, migrations, services, repositories, API contracts, forms, permissions, and tests relevant to the request.
3. Trace existing business behavior and source transactions before proposing a new rule. Treat current behavior as evidence, not automatically as the desired contract.
4. Identify the owning domain, actors, lifecycle, approvals, tenant/project scope, source of truth, and audit requirements.
5. Separate the requested business outcome from a UI convenience or a derived display value.
6. State assumptions and ask for clarification or approval when the repository and requirements conflict.

Never invent business rules without checking existing repository behavior or documented requirements. Never replace real production logic with random, mock, or hard-coded values merely to complete a screen or demo path.

## Domain relationship map

Maintain clear, explicit relationships where they exist:

> **Organization → Project → Contract → BOQ/QTO → Cost → Procurement → Materials → Progress → Payment**

The relationship is a guide for ownership and traceability, not permission to collapse separate concepts. Keep accounting, cost control, project control, procurement, contracts, and operational execution distinct but integratable through explicit contracts and auditable transactions.

## Core domains

Use the repository's actual module boundaries for:

**Projects, Contracts, BOQ, QTO, Cost Control, Payments, Procurement, Suppliers, Materials, Workforce, HR, Attendance, Documents, Forms, Workflow, Quality, HSE, and Reports.**

For every new entity or workflow, determine its organization and project scope, responsible actor, authorization rule, lifecycle states, source records, derived views, approvals, notifications, and audit history. Avoid duplicating the same rule in UI, API, and service layers; centralize deterministic business invariants in testable domain code.

## Financial and quantity discipline

For financial and operational records:

- Use appropriate precision and never use floating-point arithmetic for money when exact numeric types are available.
- Preserve currency, unit, scale, timezone, and source information.
- Distinguish estimate, budget, commitment, actual, invoice, payment, retention, and adjustment concepts.
- Preserve audit history and actor attribution for material changes.
- Store source transactions when totals are derived from real events; do not store unexplained totals as the only record.
- Make transaction boundaries explicit when multiple updates must remain consistent.

Construction quantities must support, where applicable, **unit, quantity, rate, amount, source, project, and activity/WBS context**. Define whether values are measured, approved, forecast, contracted, delivered, or paid. Do not silently change units, currency, tax, rounding, or approval semantics.

## Workflow and auditability

Model business transitions explicitly. Validate who may create, submit, approve, reject, revise, pay, close, reopen, or delete a record. Do not trust client-supplied organization, project, actor, role, owner, status, or approval fields for authorization. Derive security context from the authenticated server identity and enforce tenant/project scope on every read and mutation.

Prefer append-only or auditable transaction records for cost, quantity, progress, payment, contract, quality, HSE, and approval events. If edits are allowed, preserve prior values and the reason, actor, and timestamp according to repository conventions.

## Business-change validation

For every meaningful domain change:

1. Add or update domain tests for business rules and edge cases.
2. Add integration, API, database, or security tests when the boundary is affected.
3. Verify tenant isolation and permission behavior.
4. Verify source transactions, totals, units, precision, and audit fields.
5. Run focused tests, related suites, typecheck, and build when available.
6. Inspect the diff for fake values, hidden semantics, unsafe mass assignment, and unrelated changes.
7. Document residual assumptions and the next bounded objective.

## Domain-change report

```markdown
# ERP Domain Change: <short title>

## Existing behavior
<Repository and requirement evidence.>

## Business rule
<Actors, states, invariants, source records, units, currency, and approvals.>

## Proposed change
<Domain, API, database, UI, and reporting impact.>

## Security and audit
<Tenant scope, permissions, actor attribution, and history.>

## Validation
<Exact commands and actual results.>

## Risks and unresolved decisions
<Semantic, financial, operational, migration, and compatibility risks.>
```

Do not make the system appear complete with fake production values. Preserve domain distinctions and traceability even when the UI presents a simplified workflow.
