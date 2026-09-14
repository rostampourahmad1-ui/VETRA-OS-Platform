---
name: vetra-code-audit
description: Systematic codebase audit authority for VETRA OS. Use before substantial development, when inheriting an unfamiliar repository, when diagnosing build or runtime risk, or when converting code-quality, security, data, and delivery findings into prioritized, bounded engineering work.
---

# VETRA Code Audit

Perform audits against the actual VETRA repository, not assumptions or an idealized architecture. The purpose of an audit is to establish a truthful baseline, identify prioritized risks, and convert safe findings into validated engineering work.

## Audit workflow

Follow these steps in order:

1. Inspect `git status`, the current branch, the latest commit, and any uncommitted work. Do not overwrite or hide user changes.
2. Identify the package manager, runtime and language versions, workspace structure, lockfile, source directories, tests, database, CI/CD configuration, documentation, and environment configuration.
3. Read applicable `AGENTS.md` files, README files, contribution guides, and project-specific runbooks.
4. Trace the relevant entry points, module boundaries, API routes, persistence paths, authentication and tenant context, and existing test conventions.
5. Establish a baseline by running installation or dependency verification, lint when available, typecheck, tests, build, and a smoke test when practical.
6. Record exact commands, exit codes, meaningful output, and environmental limitations. A failed baseline is a finding, not a reason to suppress checks.
7. Classify each finding by severity and bounded scope. Separate observed defects from hypotheses and technical debt.
8. Fix only low-risk, clearly bounded issues that do not require approval for authentication, public APIs, production infrastructure, schema, or core framework changes.
9. Add or update regression tests, rerun focused validation, then related checks and the broader baseline when practical.
10. Inspect the final diff. Create a focused commit only when the repository workflow and user authorization permit it; never combine unrelated changes or rewrite history.

## Baseline discipline

Use repository-defined scripts and package-manager commands. Do not invent a replacement stack merely because the baseline is inconvenient. If installation or a check fails, identify the exact cause, distinguish configuration failure from code failure, and report the blocker. Never make the baseline green by disabling lint rules, weakening authorization, skipping tests, ignoring type errors, or removing validation.

A useful baseline table is:

| Check | Command used | Result | Evidence or blocker |
| --- | --- | --- | --- |
| Dependency installation | `<actual command>` | pass/fail/not run | `<output or reason>` |
| Lint | `<actual command>` | pass/fail/not available | `<output or reason>` |
| Typecheck | `<actual command>` | pass/fail/not available | `<output or reason>` |
| Tests | `<actual command>` | pass/fail/not available | `<output or reason>` |
| Build | `<actual command>` | pass/fail/not available | `<output or reason>` |
| Smoke test | `<actual command>` | pass/fail/not practical | `<output or reason>` |

## Severity model

Use these categories consistently:

- **P0:** Security breach, cross-tenant data exposure, data loss, or a project that cannot run at all.
- **P1:** Broken build or runtime, core functionality failure, major authorization issue, or a blocker for normal development or deployment.
- **P2:** Important functional defect, material reliability issue, or risky technical debt with a bounded remediation path.
- **P3:** Quality, UI, performance, accessibility, observability, documentation, or low-impact maintainability improvement.

Severity describes impact and urgency, not implementation difficulty. A small access-control defect can be P0 or P1; a large refactor can be P3.

## Finding format

Record every actionable finding with enough evidence for another agent to reproduce it:

```markdown
## <ID>: <short title>

- **Severity:** P0/P1/P2/P3
- **File and location:** <path, symbol, or line range>
- **Problem:** <observed behavior and evidence>
- **Impact:** <users, tenants, data, runtime, or delivery affected>
- **Reproduction:** <exact command, request, fixture, or steps>
- **Recommended fix:** <smallest safe change>
- **Regression test:** <test that must fail before and pass after>
- **Risk:** <implementation and residual risk>
- **Status:** open / fixed / blocked / deferred
```

Do not report speculative findings as confirmed vulnerabilities. Mark assumptions, missing evidence, and environmental limitations explicitly.

## Bounded-fix protocol

If a low-risk fix is available, implement it rather than stopping at a report:

1. Confirm that the fix is within the audit scope and does not cross an approval gate.
2. Reproduce the issue and capture the failing behavior.
3. Make the smallest focused change using existing conventions.
4. Add or update the regression test.
5. Run the focused test, related suite, typecheck, and build as appropriate.
6. Review `git diff` and ensure no secrets, generated artifacts, or unrelated edits are included.
7. Record the fix and actual validation results, then continue with the next bounded issue.

Do not bundle several risky architectural, security, or schema changes merely because the audit discovered them together. Escalate approval-gated findings with a proposal instead.

## Audit completion report

End with:

- **Baseline:** actual environment and command results.
- **Findings:** prioritized findings with evidence and status.
- **Fixes:** changes made, tests added, and validation results.
- **Remaining blockers:** issues not safely or feasibly resolved in scope.
- **Risks:** residual security, data, compatibility, performance, or operational risks.
- **Next bounded objective:** the smallest logical follow-up.

Never claim that the repository is healthy, secure, or fully tested unless the relevant commands were executed and their results support that claim.
