---
name: vetra-devops
description: Development, dependency, environment, and CI/CD authority for VETRA OS. Use before changing GitHub Actions, package management, Node or pnpm versions, workspaces, lockfiles, build pipelines, database services, environment variables, deployment configuration, or reproducibility and security checks.
---

# VETRA DevOps

Maintain reliable, reproducible development and CI/CD workflows for VETRA OS across Windows 11, PowerShell, GitHub Codespaces, and low-cost or free development environments. Inspect the actual repository and preserve local development where practical; do not assume Linux-only behavior, paid services, or a particular provider.

## Before changing CI or environments

Inspect, in order:

1. Applicable `AGENTS.md` files and development/deployment documentation.
2. Package manager, lockfile, Node/runtime version, pnpm version, workspace configuration, and package scripts.
3. Build, lint, typecheck, test, database, migration, smoke, and release commands.
4. Environment variable declarations, `.env.example`, secret loading, local service configuration, containers, and platform settings.
5. GitHub Actions or other CI workflows, permissions, caches, artifacts, concurrency, and deployment gates.
6. Current failure logs or baseline command results before changing configuration.

Never replace the existing framework, package manager, runtime, or deployment model without explicit approval. Do not make CI green by disabling checks, ignoring errors, pinning an unverified workaround, or hiding a failing job.

## Target validation pipeline

CI should eventually validate the repository's applicable stages in this order:

> **Install → Lint → Typecheck → Tests → Database/migration checks → Build → Security/dependency checks → Smoke test where practical**

Use the repository's real commands and record which stages are unavailable. Keep checks deterministic and fail with actionable errors. Use caching only when it cannot conceal dependency or generated-file problems, and key caches from the correct lockfile and runtime versions.

## Environment and secret hygiene

Keep local development possible without paid services whenever practical. Document required variables, safe local defaults, service prerequisites, and test-only values in `.env.example` or repository documentation. Never commit `.env`, secrets, tokens, passwords, production credentials, private keys, build artifacts, caches, or generated files that contain sensitive data. Use GitHub Secrets or the actual platform's secret store for real credentials.

Do not print secrets in CI logs, expose them to client bundles, interpolate them into artifacts, or use fake production credentials. Review workflow permissions, pull-request trust boundaries, fork behavior, and deployment approvals before changing secret-bearing jobs.

## Dependency and installation failures

When dependency installation fails:

1. Capture the exact command, runtime, package-manager version, lockfile state, and failure.
2. Check package-manager and runtime compatibility, workspace configuration, registry settings, optional dependencies, and operating-system differences.
3. Inspect the lockfile and package scripts before changing dependencies.
4. Fix the root configuration or version mismatch rather than bypassing security or reproducibility.
5. Re-run installation and the affected validation stages.

Avoid unnecessary dependencies, floating versions, and platform-specific scripts when a portable repository convention exists. If a dependency change is necessary, explain its license, security, bundle, runtime, and maintenance impact.

## Cross-platform development

Verify shell syntax, path handling, environment-variable conventions, line endings, file permissions, and local service assumptions for PowerShell, Windows, Codespaces, and the primary CI runner. Prefer package scripts or portable tooling over shell-specific commands when the project supports multiple environments. Document exceptions rather than silently adding platform-specific behavior.

## DevOps change report

```markdown
# DevOps Change: <short title>

## Current workflow
<Actual versions, scripts, CI jobs, environments, and baseline results.>

## Proposed change
<Configuration, workflow, dependency, or deployment change.>

## Security and secret impact
<Credentials, permissions, logs, artifacts, and trust boundaries.>

## Reproducibility and compatibility
<Local, Windows/PowerShell, Codespaces, CI, and deployment impact.>

## Validation
| Stage | Command | Result | Notes |
| --- | --- | --- | --- |

## Remaining risks
<Blocked services, platform differences, or follow-up.>
```

Prefer reproducible builds and transparent failures. Never commit credentials or disable validation to make a pipeline appear healthy.
