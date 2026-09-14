---
name: vetra-database
description: PostgreSQL and Drizzle database authority for VETRA OS. Use before inspecting or changing schema, migrations, tables, relationships, indexes, constraints, tenant isolation, audit fields, seed data, transactions, or database-backed business behavior; always verify the repository actually uses PostgreSQL or Drizzle before relying on them.
---

# VETRA Database

Maintain a safe, auditable database architecture for VETRA OS. Use PostgreSQL and Drizzle patterns when the repository evidence confirms them; otherwise follow the actual database engine, ORM, query layer, and migration system. Never assume a technology exists merely because this skill names a preferred pattern.

## Before a database change

Inspect the repository and database in this order:

1. Read applicable `AGENTS.md` files and database documentation.
2. Identify the actual database engine, driver, ORM/query layer, migration tool, package versions, and environment configuration.
3. Inspect the complete relevant schema, existing migrations, foreign keys, indexes, unique constraints, check constraints, enum definitions, triggers, views, and policies.
4. Trace tenant, organization, project, user, ownership, and audit relationships through the schema and the application queries.
5. Inspect seed and test data, fixtures, transaction boundaries, repositories/services, and migration commands.
6. Identify affected tables, row counts or data volume when available, locking risk, backfill requirements, compatibility constraints, and rollback or recovery options.

Never trust client-supplied `organizationId` or equivalent tenant fields for authorization. Application and database boundaries must preserve tenant isolation, and tests must verify it.

## Core database principles

Prefer:

- Explicit foreign keys and meaningful constraints.
- Tenant-aware relationships and indexes.
- Correct indexes for authorization predicates, joins, uniqueness, and high-value queries.
- Appropriate precision and units for quantities, rates, costs, and payments.
- Transaction boundaries that preserve business invariants.
- Auditability through source transactions and actor/timestamp fields.
- Additive, observable, reversible migrations where practical.
- Standardized fields when they fit existing conventions: `organizationId`, `projectId`, `createdBy`, `updatedBy`, `createdAt`, `updatedAt`, and `deletedAt`.

Do not store only derived totals when the source transactions should exist. Do not silently change business semantics, units, currency, timezone meaning, deletion behavior, or nullability.

## Migration workflow

For every migration proposal, document:

| Topic | Required analysis |
| --- | --- |
| Schema impact | Affected tables, columns, relations, indexes, constraints, views, and policies. |
| Data impact | Existing rows, default values, backfill logic, null handling, precision, units, and semantic changes. |
| Operational impact | Lock duration, table size, index build strategy, deployment ordering, read/write compatibility, and observability. |
| Security impact | Tenant isolation, authorization predicates, sensitive data exposure, and audit behavior. |
| Rollback/recovery | Safe reversal, feature flag or dual-read/write period, backup requirement, and point-in-time recovery limits. |
| Validation | Migration command, schema inspection, data checks, focused tests, typecheck, and build. |

Prefer an expand-and-contract sequence for changes that must remain compatible with a running application: add new structure, deploy compatible reads/writes, backfill or dual-write with verification, switch behavior, then remove obsolete structure only through a separately approved and reversible step.

Never perform destructive migrations, drop production data, remove a column with unknown consumers, rewrite data semantics, or make an irreversible constraint change without explicit approval. If rollback is not actually possible, say so before implementation.

## Data-model review

For each new or changed entity, confirm its owning organization or tenant, project relationship where applicable, actor and audit fields, lifecycle and soft-delete semantics, uniqueness scope, foreign-key behavior, indexes for common authorized queries, and transaction invariants. Distinguish estimate, commitment, actual, invoice, and payment concepts. For construction quantities preserve unit, quantity, rate, amount, source, project, and WBS/activity context when applicable.

Use exact numeric types for money and measurements where the repository supports them; do not use floating-point arithmetic for financial values. Preserve currency, unit, scale, timezone, and source information in the model or an auditable related record.

## After a database change

1. Apply or validate the migration in the repository-supported environment.
2. Inspect the resulting schema, constraints, indexes, and representative data.
3. Run database, tenant-isolation, and affected domain tests.
4. Run typecheck and build when available.
5. Inspect the migration and application diff for destructive SQL, unsafe defaults, secrets, generated artifacts, and unbounded backfills.
6. Record exact commands and results, unresolved operational risks, and recovery requirements.

## Database change report

```markdown
# Database Change: <short title>

## Current schema
<Relevant tables, relations, indexes, constraints, and evidence inspected.>

## Proposed change
<Additive or otherwise approved change and deployment order.>

## Affected data
<Rows, defaults, backfill, units, precision, and semantic impact.>

## Tenant and security impact
<Isolation, authorization predicates, auditability, and sensitive data.>

## Migration and rollback
<Commands, compatibility window, rollback/recovery strategy, and irreversible steps.>

## Validation
<Exact commands and actual results.>

## Risk and approval
<Risk level, blockers, and explicit approval status if required.>
```

Never silently alter production data or claim a migration is safe without examining its actual SQL or migration representation and validating the affected behavior.
