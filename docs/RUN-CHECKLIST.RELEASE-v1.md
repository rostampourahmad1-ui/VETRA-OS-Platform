# Release Checklist - VETRA OS Platform v0.1.0

**Date:** 2026-09-17  
**Version:** 0.1.0  
**Author:** AI Agent  

---

## 📋 Pre-Release Validation

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **CI/CD Pipeline** - All GitHub Actions workflows pass on PR and push to main | | CI workflow at `.github/workflows/ci.yml` |
| 2 | **Lint** - `pnpm lint` exits with code 0 | | All packages |
| 3 | **Typecheck** - `pnpm typecheck` passes across all workspaces | | All packages |
| 4 | **Tests** - `pnpm test` passes (vitest) | | Includes security/RLS tests |
| 5 | **Build** - `pnpm build` passes for all packages | | API server, frontend, libs |
| 6 | **Final Validation** - `pnpm validate:final` completes successfully | | Includes OpenAPI codegen, migrations, tests, build |
| 7 | **Diff Hygiene** - `git diff --check` passes | | No whitespace errors |
| 8 | **No Secrets in Repo** - `git secrets` or `gitleaks` scan clean | | No real API keys, passwords, or credentials |
| 9 | **.env.example Review** - All values are placeholders, no real secrets | | See `.env.example` |
| 10 | **Docker Compose** - `docker-compose up -d` starts all services | | postgres, pgbouncer, api-server, tester |
| 11 | **Database Migration** - Migrations apply cleanly to fresh DB | | Using `pnpm db:migrate` |
| 12 | **Health Check** - API server `/health` endpoint returns 200 | | |
| 13 | **Cross-Tenant Isolation** - Verified that Organization A cannot access Organization B data | | Tests in `tests/cross-tenant.test.ts` |
| 14 | **RBAC Enforcement** - Permission checks work correctly | | Tests in `tests/security/` |
| 15 | **File Security** - Upload/download security validated | | MIME/ext validation, safe filenames |

---

## ✅ Go / No-Go Criteria

### GO (Proceed with Release)
- [ ] All CI checks pass (lint, typecheck, test, build, final-validation)
- [ ] No secrets or real credentials in tracked files
- [ ] `.env.example` contains only placeholder values
- [ ] Docker compose starts successfully localdev parity
- [ ] Cross-tenant isolation tests pass
- [ ] Health verification succeeds
- [ ] Reviewer sign-off on all changed PRs

### NO-GO (Block Release)
- [ ] Any CI check fails (lint, typecheck, test, build)
- [ ] Real secrets detected in repo (run `git secrets --scan` or equivalent)
- [ ] `.env.example` contains real values
- [ ] Cross-tenant isolation test fails
- [ ] Docker compose fails to start
- [ ] Health check fails
- [ ] Required reviewer approval is missing

---

## 📦 Release Artifacts

| Artifact | Location | Notes |
|---|---|---|
| Built API Server | `artifacts/api-server/dist/` | Production build |
| Frontend Build | `artifacts/vetra/dist/` | Vite React build |
| Database Schema | `lib/db/drizzle/` | Drizzle ORM schema |
| Migration SQL | `lib/db/drizzle/*.sql` | Applied in order |
| Docker Images | `docker-compose.yml` | Local dev parity |
| Runbook | `docs/runbooks/` | See `local-dev-runbook.md` |
| Release Checklist | `docs/RUN-CHECKLIST.RELEASE-v1.md` | This document |

---

## 🔄 Rollback Procedure

| Step | Command / Action | Expected Outcome |
|---|---|---|
| 1 | `docker-compose down` | Stop all services |
| 2 | `docker-compose up -d postgres pgbouncer` | Restore database services |
| 3 | `pg_restore` from latest backup | Restore database to pre-deployment state |
| 4 | `pm2 delete vetra-api` / `pm2 delete all` | Remove old API server processes |
| 5 | Deploy previous API build: `rsync -avz artifacts/api-server/dist/prev/ .` | Rollback to previous version |
| 6 | `pm2 start artifacts/api-server/dist/prev/index.js --name vetra-api` | Start rolled-back API |
| 7 | Verify health: `curl http://localhost:5000/health` | Confirm rollback successful |

---

## 📞 Emergency Contacts

| Role | Contact | Notes |
|---|---|---|
| Platform Lead | - | - |
| DevOps | - | - |
| Security Officer | - | - |

---

## 📝 Post-Release Checklist

| # | Task | Owner | Due |
|---|---|---|---|
| 1 | Publish Docker images (if applicable) | | |
| 2 | Tag release in Git | | |
| 3 | Update CHANGELOG.md | | |
| 4 | Notify stakeholders | | |
| 5 | Monitor for 24h post-release | | |
| 6 | Run smoke tests on production | | |

---

## 🔒 Security Checklist

- [ ] No real secrets in `.env.example` or any tracked file
- [ ] Clerk keys are placeholder `sk_test*` / `pk_test*`
- [ ] OpenAI key is placeholder `sk-...`
- [ ] Database passwords are `CHANGE_ME_*` placeholders
- [ ] CORS origins are limited to known domains
- [ ] Rate limiting is configured
- [ ] Helmet security headers are enabled
- [ ] No path traversal vulnerabilities in file upload
- [ ] Tenant isolation verified at DB level (RLS policies)
<tool_call>