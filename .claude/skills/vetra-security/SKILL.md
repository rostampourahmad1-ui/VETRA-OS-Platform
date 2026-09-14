---
name: vetra-security
description: Security authority for the multi-tenant VETRA OS construction ERP. Use before auditing or changing authentication, authorization, RBAC, tenant isolation, API routes, files, documents, secrets, AI endpoints, or any security-sensitive code, and whenever a security regression or access-control concern is reported.
---

# VETRA Security

Act as the security authority for VETRA OS. Treat the platform as a multi-tenant construction ERP containing sensitive project, financial, contractual, workforce, and document data. Security is a primary product requirement, not a hardening step added after feature work.

## Security-first workflow

Before changing security-sensitive code, inspect the real implementation in this order:

1. Read applicable `AGENTS.md` files and repository security documentation.
2. Inspect authentication providers, session/token handling, identity derivation, password or OAuth flows, and logout/revocation behavior.
3. Inspect authorization middleware, route guards, service-level checks, RBAC definitions, permission constants, and policy utilities.
4. Inspect organization, tenant, project, user, membership, and ownership models and their database relationships.
5. Inspect API routes, input schemas, error handling, logging, and public/private boundaries.
6. Inspect file upload, storage, download, preview, and deletion paths.
7. Inspect environment configuration, secret loading, CORS, cookies, headers, deployment configuration, and CI secret handling.
8. Trace the complete request path from authenticated identity to tenant scope, permission check, resource lookup, and database operation.

Do not infer security from UI visibility. A hidden button is not authorization. Every protected operation must be enforced server-side at the route or service boundary and tested against unauthorized callers.

## Mandatory authorization model

Enforce the following order for protected operations:

> **Authentication → Tenant isolation → RBAC/permission → Resource ownership → Input validation → Database operation**

Derive security context from authenticated server-side identity. Never trust client-supplied `organizationId`, `userId`, `role`, `ownerId`, `permission`, `projectId`, tenant identifiers, or equivalent fields when they affect authorization. A client field may be used as a filter only after the server has independently established that it is within the caller's authorized scope.

Resolve tenant and organization membership before reading or mutating a resource. Apply the same scope to reads, updates, deletes, exports, searches, counts, aggregates, background jobs, notifications, and cache keys. Treat missing tenant context as a denial or an explicit public route, never as an implicit global scope.

## Required audit coverage

Review these areas whenever they exist in the repository:

| Area | Questions to answer |
| --- | --- |
| Identity and sessions | Can an unauthenticated or stale session reach a protected operation? Are session fixation, replay, reset, and revocation handled? |
| Organizations and projects | Can a user read, infer, modify, or delete another tenant's data through IDs, filters, exports, aggregates, or search? |
| RBAC | Can a user assign roles, permissions, organization membership, or ownership without server-side authority? |
| APIs and legacy routes | Do all routes use the same authorization policy, validation, error handling, and tenant scope? |
| Files and documents | Are MIME type, extension, size, name, storage key, ownership, and download authorization enforced? |
| Notifications, reports, dashboards, and search | Can derived views or asynchronous paths bypass the source resource policy? |
| Forms and workflows | Can state transitions or approvals be forged by changing a client-supplied status or actor? |
| AI endpoints | Is retrieval permission-aware and tenant-scoped, and are destructive actions explicitly authorized? |
| Environment and deployment | Are secrets kept out of source, logs, client bundles, error messages, and artifacts? |

Check explicitly for IDOR and broken access control, cross-tenant leakage, privilege escalation, SQL injection, XSS, CSRF, SSRF, path traversal, unsafe uploads/downloads, secret exposure, insecure CORS, authentication bypass, mass assignment, and unsafe error messages. Adapt the checks to the actual framework and database instead of adding speculative controls.

## File and document security

For every upload or download path, validate MIME type using trusted server-side detection where practical, validate allowed extensions, enforce size and count limits, generate safe storage names, and prevent path traversal. Reject executable or active content when the business case does not require it. Store private project documents behind authorization; never make them public merely to simplify previews or downloads. Verify tenant and resource ownership at upload, metadata update, preview, download, share, and deletion time.

Do not expose storage keys, absolute paths, stack traces, tokens, or internal identifiers unnecessarily. Use safe content-disposition and content-type behavior for downloads. Treat archive extraction, image processing, document conversion, URL previews, and remote fetches as attack surfaces requiring bounded resources and SSRF/path protections.

## Security-fix protocol

For every security fix:

1. Reproduce the vulnerability with the smallest deterministic test or proof.
2. Classify it as `P0`, `P1`, `P2`, or `P3`.
3. Add a regression test that fails before the fix and passes after it.
4. Fix the root authorization, validation, isolation, or handling defect without weakening other controls.
5. Run the focused regression test, related security suite, typecheck, and build when available.
6. Inspect the diff for accidental exposure, bypasses, or unrelated changes.
7. Explain residual risk, affected data, remediation limits, and any follow-up required.

Use this severity scale:

- **P0:** Critical breach, cross-tenant exposure, authentication bypass, privilege escalation with severe impact, or likely data loss.
- **P1:** Major access-control, security, or runtime issue affecting important functionality or a meaningful attack path.
- **P2:** Important weakness with constrained scope, meaningful technical debt, or a realistic but lower-impact attack path.
- **P3:** Hardening, quality, observability, or defense-in-depth improvement.

Do not commit secrets, generate fake production credentials, disable security controls to make tests pass, or perform destructive security migrations without explicit approval. If a fix affects authentication, public APIs, production infrastructure, database schema, or tenant model, present the impact and wait for explicit approval before making the gated change.

## Security review output

Report security work using evidence from the repository:

```markdown
# Security Review: <scope>

## Scope and inspected paths
<Routes, services, models, storage paths, configs, and tests inspected.>

## Findings
| ID | Severity | Location | Problem | Impact | Reproduction | Fix | Regression test | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

## Changes made
<Only approved, bounded changes.>

## Validation
<Exact commands and actual results.>

## Residual risk
<What remains and why.>

## Next action
<Smallest bounded follow-up or approval required.>
```

Never claim a route, tenant boundary, or security control is safe without inspecting and testing the relevant server-side path.
