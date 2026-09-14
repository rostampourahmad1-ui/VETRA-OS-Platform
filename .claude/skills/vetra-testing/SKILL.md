---
name: vetra-testing
description: Testing authority for VETRA OS. Use when adding or repairing tests, designing regression coverage, changing authentication, tenant isolation, RBAC, business logic, database behavior, APIs, UI, or smoke and end-to-end flows, and whenever an agent must report actual validation results.
---

# VETRA Testing

Build and maintain a reliable, deterministic automated testing strategy for VETRA OS. Infer the testing stack from the repository and reuse its conventions. Do not introduce a heavy framework, browser suite, service dependency, or test runtime unless repository evidence and the risk justify it.

## Testing priorities

Prioritize coverage in this order:

1. Security regressions, authentication, tenant isolation, and RBAC.
2. Core construction and ERP business logic.
3. Database behavior, transactions, constraints, and migrations.
4. API integration and contract behavior.
5. UI behavior and accessibility.
6. End-to-end and smoke coverage where it provides meaningful confidence.

Every important bug should receive a regression test. Test the behavior at the narrowest reliable boundary, then add broader coverage when cross-module integration is part of the risk.

## Repository-first workflow

Before writing tests:

1. Read applicable `AGENTS.md` files and test documentation.
2. Inspect `package.json` scripts, workspace configuration, lockfiles, test configuration, fixtures, factories, mocks, database setup, and CI commands.
3. Identify the actual runner, assertion library, browser tooling, module format, runtime, and supported test environments.
4. Run the focused existing test or baseline command to understand the current state.
5. Choose the smallest deterministic test category that proves the behavior.

Do not claim a test passed without running it. Report skipped, flaky, blocked, and environment-dependent tests honestly.

## Mandatory multi-tenant security tests

When the repository supports organizations or tenants, protect the following behaviors with server-side tests:

| Scenario | Expected result |
| --- | --- |
| Tenant A reads Tenant B data | Denied or not found according to the established security contract. |
| Tenant A modifies Tenant B data | Denied; no cross-tenant mutation occurs. |
| Tenant A deletes Tenant B data | Denied; the target remains intact. |
| User elevates their own role | Denied; role and permission state remain unchanged. |
| User changes their own organization | Denied unless an explicitly authorized administrative workflow exists. |
| Unauthorized role accesses a protected operation | Denied consistently at the server boundary. |

Create tests for direct IDs as well as filters, exports, counts, aggregates, search, notifications, background jobs, file paths, and cache keys when those paths exist. Derive tenant context from the authenticated test identity rather than accepting a client-supplied organization identifier as proof.

## Test categories

Use the category that matches the risk:

- **Unit:** Pure domain rules, parsers, validators, date calculations, and deterministic transformations.
- **Integration:** Multiple services, repositories, queues, or modules working together.
- **Security regression:** Authentication, tenant isolation, permission boundaries, ownership, and abuse cases.
- **API:** Route validation, status codes, payload shape, compatibility, error behavior, and authorization.
- **Database:** Constraints, indexes, transactions, migrations, seed behavior, and rollback or recovery paths.
- **UI:** User-visible behavior, RTL/Shamsi presentation, keyboard access, forms, loading, errors, and permission-aware rendering. Do not treat UI tests as authorization tests.
- **E2E/smoke:** A small number of critical user journeys that justify the runtime and maintenance cost.

Prefer deterministic fixtures, factories, isolated databases or transactions, stable clocks, explicit time zones, and controlled randomness. Avoid real production services, real secrets, network dependence, sleep-based synchronization, and assertions on incidental formatting unless formatting is the contract.

## Change-validation protocol

After code changes:

1. Run focused tests for the changed behavior.
2. Run the related module or security suite.
3. Run the full test suite when practical.
4. Run typecheck and build when available.
5. Review failures instead of weakening production code or authorization to satisfy tests.
6. Inspect the diff for test-only shortcuts, unbounded fixtures, secrets, and accidental production changes.

When a test cannot be run, record the exact command, failure reason, environmental requirement, and the next action. Never replace a missing test with an assertion that only verifies a mock was called if the user-visible or security behavior matters.

## Test report

Use a concise evidence-based report:

```markdown
## Test validation

| Scope | Command | Result | Notes |
| --- | --- | --- | --- |
| Focused | `<command>` | pass/fail/skipped | `<actual result>` |
| Related suite | `<command>` | pass/fail/skipped | `<actual result>` |
| Full suite | `<command>` | pass/fail/not run | `<actual result>` |
| Typecheck | `<command>` | pass/fail/not run | `<actual result>` |
| Build | `<command>` | pass/fail/not run | `<actual result>` |

## Coverage added
<Behavior and regression risks protected.>

## Remaining risk
<Uncovered paths, environmental limitations, or follow-up.>
```

Never weaken production authorization, validation, tenant scope, or business behavior merely to make a test pass.
