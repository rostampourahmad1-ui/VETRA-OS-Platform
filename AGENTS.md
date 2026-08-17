# AGENTS.md

# VETRA OS — Repository Instructions for AI Agents

## 1. Project Identity

Project name: VETRA OS
Organization: شرکت آکوپارک آرا
Brand: VETRA
Business areas:
- Construction
- Contracting
- Building
- Architecture
- Interior architecture
- Project management
- Project controls
- Construction ERP

Repository: https://github.com/rostampourahmad1-ui/VETRA-OS-Platform

Product domains:
- apairan.com
- Akopark-co.ir
- Vetragroup.ir

VETRA OS is intended to become a professional, modular, Persian-first, RTL-first and AI-ready construction ERP and project-control platform.
The long-term target is:
Construction ERP + Project Controls Platform + Construction Intelligence Platform + AI-assisted Construction Operating System.

---

## 2. Ultimate Product Goal

VETRA OS should eventually connect the following domains in one coherent platform:
- Identity and authentication (Clerk)
- Organizations and tenants (Multi-tenancy)
- Users and workforce (with specific personnel codes: prefix + gender + year + serial, max 10 digits)
- Roles and permissions (RBAC)
- Projects
- WBS (Work Breakdown Structure)
- Activities
- Scheduling & Gantt
- Baselines & Progress
- Resources & Tasks
- Contracts & BOQ (Bill of Quantities) & QTO (Quantity Takeoff)
- Cost control & Payments
- Procurement & Suppliers & Materials
- HR & Attendance
- Documents & Forms
- Workflow
- Quality & HSE
- Reports & Dashboards
- Notifications
- AI Assistant
- Future construction computer vision

Do not develop isolated features without considering their relationship to the organization, project, permission and audit models.

---

## 3. Source of Truth

The actual repository is the source of truth for the current technical implementation.
Before making technical decisions or changing code, inspect the real repository.

Always inspect, when relevant:
- `AGENTS.md`
- `README.md`
- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.json`
- Frontend source code (`apps/`)
- Shared packages & database schema (`packages/`)
- Drizzle configuration & migrations
- API routes & Clerk integration

If documentation conflicts with the implementation, repository code defines the current implementation.

---

## 4. Current Product Status

VETRA OS is currently a serious Prototype / MVP under development.
It is not yet a Production-Ready ERP.
Technologies used:
- Monorepo managed with `pnpm`
- Frontend: React + Vite + TypeScript (Tailwind CSS, RTL-first, custom UI components without external CDN icons)
- Database: PostgreSQL + Drizzle ORM
- Auth: Clerk

Mock or demo data must never silently enter a real production business path.

---

## 5. Core Engineering Principles

VETRA must be developed according to these principles:
- Security by default
- Multi-tenant by design
- Explicit authorization
- Modular architecture
- API-first design
- Persian-first & RTL-first UX (correct Shamsi date presentation)
- Local or self-hosted assets (No external CDN dependencies for icons or libraries)
- No premature microservices

---

## 6. Mandatory Security Model

Every protected operation must follow this order:
Authentication → Tenant isolation → Role and permission check → Resource ownership check → Input validation → Database operation → Audit/logging.

Never trust client-supplied values for authorization, including `organizationId`, `tenantId`, `userId`, `role`, or `projectId`. The authenticated server-side identity must determine the security context.

---

## 7. Multi-Tenant Isolation

Tenant isolation is a primary security boundary.
A user belonging to Organization A must not be able to access Organization B data. This applies to all entities (Projects, WBS, Tasks, Documents, Files, etc.).

Security regression tests must verify that Tenant A cannot read, modify, or delete Tenant B data.

---

## 8. RBAC and Permissions

RBAC must be explicit and enforced on the backend.
Example permission naming:
- `project.read`, `project.create`, `project.update`, `project.delete`
- `task.read`, `task.create`, `task.update`, `task.delete`
- `document.read`, `document.upload`, `document.download`
- `contract.read`, `contract.create`

Roles at minimum: ADMIN, MANAGER, SUPERVISOR, ENGINEER, EMPLOYEE, PROJECT_MANAGER, SITE_ENGINEER, VIEWER.

---

## 9. File Upload and Download Security

Uploaded files are untrusted input. File upload and download must enforce:
- Extension & MIME validation
- File size limits
- Safe generated filenames (no path traversal)
- Tenant/Project ownership check before download
- No public exposure of private documents

---

## 10. Database Rules

Before changing the database:
1. Inspect the current schema & migrations.
2. Maintain `organizationId` in all business tables.
3. Keep standard audit fields: `createdBy`, `updatedBy`, `createdAt`, `updatedAt`, `deletedAt`.
4. Avoid unsafe floating-point calculations for financial data.

---

## 11. Project Controls and Construction Logic

VETRA is a construction project-control platform. Scheduling logic (WBS, Gantt, Activities, Calendars, Progress) must live in testable business/service code, not only inside UI components.

---

## 12. Persian, RTL and UI Rules

VETRA is Persian-first and RTL-first.
- Use `dir="rtl"` and `lang="fa"` where appropriate.
- Date storage must remain standard Gregorian in DB, but user-facing dates must be shamsi.
- Do not use external CDN dependencies for icons or fonts. Use local assets.

---

## 13. AI Integration Rules

AI features (Daily reports, document analysis, risk detection) are assistance layers.
- AI must never bypass Authentication, RBAC or Tenant Isolation.
- Keep AI providers replaceable (avoid tight coupling).

---

## 14. Development Workflow

Before every coding task:
1. Read this `AGENTS.md`.
2. Inspect the current Git status.
3. Identify the package manager (`pnpm`).
4. Implement the smallest safe change.
5. Run tests, lint, and build checks.
6. Commit focused changes.

---

## 15. Skill Routing

- **Architecture:** `vetra-architecture`
- **Security:** `vetra-security` | `vetra-code-audit`
- **Database:** `vetra-database`
- **Testing:** `vetra-testing`
- **Project Control:** `vetra-project-control`
- **ERP Domain:** `vetra-erp-domain`
- **UI & RTL:** `vetra-ui-rtl`
- **DevOps:** `vetra-devops`
- **AI Features:** `vetra-ai-integration`

---

## 16. Baseline Validation

Always run existing repository scripts. Typical sequence:
```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build

---

## 17. CI/CD Requirements

Never commit `.env` or real API keys. Maintain `.env.example` without real secrets. Use GitHub Secrets for production deployments.

---

## 18. Severity Classification

- **P0 (Critical):** Cross-tenant data leak, credentials exposure, complete build failure.
- **P1 (Major):** RBAC bypass, file security vulnerability, broken core business logic.
- **P2 (Important):** Functional bugs in Gantt/WBS, UI alignment issues in RTL, missing tests.
- **P3 (Quality):** Inconsistencies, documentation gaps, code refactoring.

---

## 19. Required Final Report

At the end of every task, the agent must report:
1. **What changed:** List of files and code changes.
2. **Why:** Core reason for the change.
3. **Tests & validation:** Commands run and their outcomes.
4. **Security & DB impact:** Assessment of Auth, RBAC, and Database Schemas.
5. **Next steps:** The next bounded task.

---

## 20. Definition of Done

A task is complete only when:
- The actual repository code was inspected.
- Server-side tenant validation is enforced.
- Inputs are validated.
- Build, Lint, and Typescript tests pass.
- No secrets are committed.
