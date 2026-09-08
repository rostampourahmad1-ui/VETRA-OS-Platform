# VETRA OS — مستند تثبیت فاز طراحی (Design Phase Consolidation)

**وضعیت:** مصوب — مبنای توسعه
**نسخه:** 1.0
**تاریخ تثبیت:** 2026-09-08
**مخاطب:** تمام عوامل AI، توسعه‌دهندگان و مشارکت‌کنندگان

---

## 1. هدف

این مستند، وضعیت فعلی طراحی VETRA OS را تثبیت می‌کند و به‌عنوان نقطهٔ مرجع واحد برای تمام تصمیم‌های معماری، ساختار ماژول‌ها، و boundaryهای فعلی عمل می‌کند. هر تغییری پس از این سند باید نسبت به این baseline سنجیده شود.

---

## 2. معماری کلی سیستم

### 2.1 لایه‌های اصلی

```
┌─────────────────────────────────────────────────┐
│                  VETRA UI (React)                │
│              artifacts/vetra/src                 │
├─────────────────────────────────────────────────┤
│              API Client (React)                  │
│         lib/api-client-react/src                 │
├─────────────────────────────────────────────────┤
│              API Server (Express)                │
│         artifacts/api-server/src                 │
├─────────────────────────────────────────────────┤
│         Zod Contracts / OpenAPI Spec             │
│      lib/api-zod/src  +  lib/api-spec/           │
├─────────────────────────────────────────────────┤
│           Domain Logic / Services                │
│    artifacts/api-server/src/lib/                 │
├─────────────────────────────────────────────────┤
│         Database (Drizzle ORM + PG)              │
│            lib/db/src/schema/                    │
├─────────────────────────────────────────────────┤
│         PostgreSQL + RLS + PgBouncer             │
│              infra/db/ + infra/pgbouncer/        │
└─────────────────────────────────────────────────┘
```

### 2.2 ساختار Monorepo

```
VETRA-OS-Platform/
├── artifacts/
│   ├── vetra/              # Frontend React + Vite + Tailwind
│   ├── api-server/         # Backend Express + Clerk + Drizzle
│   └── mockup-sandbox/     # Sandbox for UI prototyping
├── lib/
│   ├── db/                 # Drizzle schemas + migrations
│   ├── api-spec/           # OpenAPI 3.x spec + codegen
│   ├── api-zod/            # Generated Zod validators
│   └── api-client-react/   # Generated React hooks
├── infra/
│   ├── db/                 # DB init scripts (roles, RLS)
│   └── pgbouncer/          # Connection pool config
├── tests/                  # Vitest integration + security tests
├── scripts/                # Migration runner, validation, codegen
├── docs/                   # Architecture decisions, plans
└── .agents/                # Agent skills for VETRA domains
```

---

## 3. ماژول‌های دامنه (Domain Modules)

### 3.1 وضعیت پیاده‌سازی

| دامنه | Schema | API Route | UI Page | تست‌ها | وضعیت |
|-------|--------|-----------|---------|--------|-------|
| **Organizations** | ✅ | ✅ | ✅ | ✅ | پایدار |
| **Users / RBAC** | ✅ | ✅ | ✅ | ✅ | پایدار |
| **Projects** | ✅ | ✅ | ✅ | ✅ | پایدار |
| **Tasks** | ✅ | ✅ | ✅ | ✅ | پایدار |
| **WBS / Planning** | ✅ | ✅ | ✅ | ✅ | پایدار |
| **Scheduling / Gantt** | ✅ | ✅ | ✅ | ✅ | پایدار |
| **Daily Reports** | ✅ | ✅ | ✅ | ✅ | پایدار |
| **Documents** | ✅ | ✅ | ✅ | ✅ | پایدار |
| **Contracts / BOQ** | ✅ | ✅ | ✅ | ✅ | پایدار |
| **Forms Engine** | ✅ | ✅ | ✅ | ✅ | پایدار |
| **Workflows** | ✅ | ✅ | ✅ | ✅ | پایدار |
| **Quality / NCR** | ✅ | ✅ | ✅ | ✅ | پایدار |
| **Procurement** | ✅ | ✅ | ✅ | ✅ | پایدار |
| **Inventory** | ✅ | ✅ | ✅ | ✅ | پایدار |
| **Equipment** | ✅ | ✅ | ✅ | ✅ | پایدار |
| **HR / Attendance** | ✅ | ✅ | ✅ | ✅ | پایدار |
| **Cost Control** | ✅ | ✅ | ✅ | ✅ | پایدار |
| **CRM** | ✅ | ✅ | ✅ | ✅ | پایدار |
| **Meetings** | ✅ | ✅ | ✅ | ✅ | پایدار |
| **Notifications** | ✅ | ✅ | ✅ | ✅ | پایدار |
| **Dashboard** | ✅ | ✅ | ✅ | ✅ | پایدار |
| **Reports** | ✅ | ✅ | ✅ | ✅ | پایدار |
| **AI Assistant** | ✅ | ✅ | ✅ | ✅ | پایدار |
| **Payroll** | ✅ | ✅ | ❌ | ✅ | در دست اجرا |
| **Safety / HSE** | ❌ | ❌ | ❌ | ❌ | برنامه‌ریزی‌شده |

### 3.2 Schemaهای پایگاه داده (22 فایل)

| فایل Schema | جداول اصلی |
|-------------|-----------|
| `organizations.ts` | organizations |
| `users.ts` | users, user_roles |
| `projects.ts` | projects, project_members |
| `tasks.ts` | tasks, task_assignees |
| `documents.ts` | documents, document_versions |
| `contracts.ts` | contracts |
| `daily-reports.ts` | daily_reports, daily_report_workforce, daily_report_materials, daily_report_equipment |
| `meetings.ts` | meetings |
| `equipment.ts` | equipment |
| `inventory.ts` | inventory_items, inventory_transactions |
| `procurement.ts` | purchase_orders, suppliers |
| `procurement-ext.ts` | purchase_order_items, goods_receipts |
| `notifications.ts` | notifications, notification_preferences |
| `activity.ts` | activity_log |
| `phase2.ts` | — |
| `rbac.ts` | roles, permissions, role_permissions |
| `planning.ts` | wbs, activities, baselines |
| `workflows.ts` | workflows, workflow_steps, approvals |
| `forms.ts` | form_templates, form_submissions, form_fields |
| `quality.ts` | quality_inspections, ncr, corrective_actions |
| `audit.ts` | audit_log |
| `boq.ts` | bill_of_quantities, boq_items |
| `hr.ts` | employees, attendance, payroll |
| `scheduling.ts` | schedules, calendars, progress_records |

### 3.3 Migrationهای موجود (23 عدد)

از `0000_nervous_mathemanic.sql` تا `0022_daily_report_equipment.sql` شامل:
- Schema اولیه
- Quality lifecycle
- Tenant isolation + RLS
- Audit trail
- DB roles
- Forms engine
- Workflow hardening
- Request-scoped RLS
- Planning/WBS
- Notifications + preferences
- Tenant RLS coverage
- Quality inspection templates
- Document download security
- RBAC project membership
- Daily report lifecycle + attachments + workforce + materials + equipment

---

## 4. معماری امنیتی

### 4.1 زنجیرهٔ امنیتی (Mandatory)

```
Authentication → Tenant Isolation → Permission Check → Resource Ownership → Input Validation → Database → Audit
```

### 4.2 Middlewareهای امنیتی

| Middleware | فایل | مسئولیت |
|-----------|------|---------|
| `requireAuth` | `middlewares/requireAuth.ts` | احراز هویت Clerk |
| `attachTenant` | `middlewares/tenant.ts` | Tenant isolation + RLS context |
| `requirePermission` | `middlewares/permissions.ts` | RBAC enforcement |
| `auditMiddleware` | `middlewares/audit.ts` | Audit logging |
| `errorHandler` | `middlewares/errorHandler.ts` | Unified error responses |

### 4.3 RLS (Row-Level Security)

- PostgreSQL RLS بر اساس `organizationId` فعال است
- درخواست‌ها tenant-aware هستند و از `SET LOCAL` برای تنظیم context استفاده می‌کنند
- Roleهای غیرمالک: `vetra_app`, `vetra_migration`, `vetra_readonly`
- تست‌های RLS با role واقعی `vetra_app` اجرا می‌شوند

### 4.4 Authentication

- **Provider:** Clerk
- **Middleware:** `@clerk/express` + `requireAuth`
- **Webhook:** Clerk webhook برای user provisioning
- کلیدها در `.env` (هرگز commit نمی‌شوند)

---

## 5. معماری Frontend

### 5.1 تکنولوژی‌ها

| لایه | تکنولوژی |
|------|----------|
| Framework | React 19.1.0 |
| Build | Vite 7 |
| Styling | Tailwind CSS 4 |
| Routing | Wouter |
| State | React Query (TanStack) |
| Forms | React Hook Form + Zod |
| UI Components | Radix UI + Custom (shadcn-style) |
| Charts | Recharts |
| Animation | Framer Motion |
| Icons | Lucide React (local, no CDN) |
| i18n | Custom LocaleContext (fa/en) |
| Dates | date-fns + date-fns-jalali |

### 5.2 ساختار صفحات (27 صفحه)

```
pages/
├── ai/              # AI Assistant
├── contracts/       # Contracts & BOQ
├── cost-control/    # Cost Control
├── crm/             # CRM
├── dashboard/       # Main Dashboard
├── documents/       # Document Management
├── equipment/       # Equipment
├── forms/           # Forms Builder & Submissions
├── hr/              # HR & Attendance
├── inventory/       # Inventory
├── landing/         # Landing Page
├── meetings/        # Meetings
├── onboarding/      # Onboarding Wizard
├── placeholders/    # Placeholder pages
├── planning/        # WBS & Planning
├── procurement/     # Procurement
├── progress/        # Progress Tracking
├── projects/        # Project Management
├── quality/         # Quality & NCR
├── reports/         # Reports
├── resources/       # Resources
├── scheduling/      # Gantt & Scheduling
├── settings/        # Settings
├── tasks/           # Tasks
└── workspace/       # Workspace Shell
```

### 5.3 RTL & Persian Support

- `dir="rtl"` و `lang="fa"` در layout اصلی
- تاریخ‌ها در DB به صورت Gregorian ذخیره و در UI به شمسی نمایش داده می‌شوند
- `LocaleContext` برای تعویض زبان و تقویم
- تمام آیکون‌ها و فونت‌ها local هستند (بدون CDN)

---

## 6. API Routes (30+ endpoint group)

| Route File | Endpoint Group |
|-----------|---------------|
| `ai.ts` | `/api/ai/*` |
| `contracts-boq.ts` | `/api/contracts/boq/*` |
| `contracts.ts` | `/api/contracts/*` |
| `cost-control.ts` | `/api/cost-control/*` |
| `crm.ts` | `/api/crm/*` |
| `daily-reports.ts` | `/api/daily-reports/*` |
| `dashboard.ts` | `/api/dashboard/*` |
| `documents.ts` | `/api/documents/*` |
| `equipment.ts` | `/api/equipment/*` |
| `forms.ts` | `/api/forms/*` |
| `health.ts` | `/api/health` |
| `health-internal.ts` | `/api/health/internal` |
| `hr.ts` | `/api/hr/*` |
| `inventory.ts` | `/api/inventory/*` |
| `meetings.ts` | `/api/meetings/*` |
| `notifications.ts` | `/api/notifications/*` |
| `organizations.ts` | `/api/organizations/*` |
| `phase2.ts` | `/api/phase2/*` |
| `planning.ts` | `/api/planning/*` |
| `procurement.ts` | `/api/procurement/*` |
| `procurement-ext.ts` | `/api/procurement-ext/*` |
| `projects.ts` | `/api/projects/*` |
| `quality.ts` | `/api/quality/*` |
| `scheduling.ts` | `/api/scheduling/*` |
| `search.ts` | `/api/search/*` |
| `tasks.ts` | `/api/tasks/*` |
| `users.ts` | `/api/users/*` |
| `webhook.ts` | `/api/webhook/*` |
| `workflows.ts` | `/api/workflows/*` |

---

## 7. Domain Services (Business Logic)

| Service | فایل | مسئولیت |
|---------|------|---------|
| Scheduling CPM | `lib/scheduling/cpm.ts` | Critical Path Method |
| Scheduling EVM | `lib/scheduling/evm.ts` | Earned Value Management |
| Scheduling Calendar | `lib/scheduling/calendar.ts` | Calendar-aware scheduling |
| Scheduling Progress | `lib/scheduling/progress.ts` | Physical progress tracking |
| Notifications | `lib/notifications.ts` | Notification triggers & dispatch |
| SSE Broadcaster | `lib/sseBroadcaster.ts` | Server-Sent Events |
| Audit | `lib/audit.ts` | Audit trail service |
| File Storage | `lib/fileStorage.ts` | Secure file upload/download |
| AI Registry | `lib/ai/registry.ts` | AI provider registry |
| AI RAG | `lib/ai/rag.ts` | Retrieval-Augmented Generation |
| Daily Report Workforce | `lib/dailyReportWorkforce.ts` | Workforce tracking |
| Daily Report Materials | `lib/dailyReportMaterials.ts` | Material consumption |
| Daily Report Equipment | `lib/dailyReportEquipment.ts` | Equipment utilization |

---

## 8. تست‌ها (39 فایل تست)

### 8.1 دسته‌بندی تست‌ها

| دسته | تعداد | نمونه |
|------|-------|-------|
| Security | 12 | `rbac-bypass.test.ts`, `cross-tenant.test.ts`, `rls-integration.test.ts` |
| Integration | 15 | `scheduling-gantt.test.ts`, `procurement.test.ts`, `daily-reports.test.ts` |
| Validation | 8 | `forms-validation.test.ts`, `cost-control-validation.test.ts` |
| Unit | 4 | `jalali.test.ts`, `cors.test.ts`, `api-routes.test.ts` |

### 8.2 تست‌های امنیتی کلیدی

- `cross-tenant.test.ts` — تست نشت داده بین tenantها
- `rbac-bypass.test.ts` — تست دور زدن RBAC
- `rbac-project-membership.test.ts` — تست عضویت پروژه
- `rls-integration.test.ts` — تست RLS با role واقعی
- `request-scoped-rls.test.ts` — تست RLS محدود به درخواست
- `identity-forgery.test.ts` — تست جعل هویت
- `forms-security.test.ts` — تست امنیت Forms
- `forms-workflow-security.test.ts` — تست امنیت Workflow
- `quality-security.test.ts` — تست امنیت Quality
- `payroll-security.test.ts` — تست امنیت Payroll
- `crm-security.test.ts` — تست امنیت CRM
- `expenses-security.test.ts` — تست امنیت هزینه‌ها
- `workflows-security.test.ts` — تست امنیت Workflows
- `file-upload.test.ts` — تست امنیت آپلود فایل

---

## 9. Docker & DevOps

### 9.1 Docker Compose Services

| Service | Image | Port |
|---------|-------|------|
| `postgres` | `postgres:16.8-alpine` | 5432 |
| `pgbouncer` | `edoburu/pgbouncer:1.24.0` | 6432 |
| `tester` | Custom Dockerfile | — |

### 9.2 Dockerfile

- Base: `node:22-bookworm-slim`
- Package Manager: `pnpm` (via Corepack)
- Default CMD: `pnpm test`

---

## 10. تصمیم‌های معماری کلیدی (ADR)

1. **Monorepo با pnpm workspace** — مدیریت وابستگی متمرکز، build ایزوله
2. **PostgreSQL + Drizzle ORM** — Type-safe migrations، RLS native
3. **Clerk برای Authentication** — کاهش burden امنیتی، webhook برای sync
4. **Express (نه Next.js)** — API-first، جدایی frontend/backend
5. **Wouter (نه React Router)** — سادگی، حجم کم، مناسب SPA
6. **RTL-first Design** — Persian-first، بدون CDN خارجی
7. **Request-scoped RLS** — امنیت در سطح درخواست با `SET LOCAL`
8. **OpenAPI به عنوان منبع حقیقت** — codegen خودکار client و validator
9. **Roleهای غیرمالک DB** — `vetra_app`, `vetra_migration`, `vetra_readonly`

---

## 11. وابستگی‌های خارجی

| سرویس | نوع | یادداشت |
|-------|-----|---------|
| Clerk | Authentication | تولید/توسعه: کلید test |
| OpenAI | AI Assistant | تولید: کلید API |
| PostgreSQL | Database | Local/Docker |
| PgBouncer | Connection Pool | Docker |

---

## 12. آنچه تثبیت شده است

✅ **معماری کلی:** لایه‌بندی UI → API Client → API Server → Domain → DB
✅ **ساختار Monorepo:** pnpm workspace با `artifacts/`, `lib/`, `infra/`, `tests/`
✅ **مدل امنیتی:** Clerk + RBAC + Tenant Isolation + RLS + Audit
✅ **تمام Schemaهای پایگاه داده:** 22 فایل schema، 23 migration
✅ **تمام API Routeها:** 30+ گروه endpoint با middleware امنیتی
✅ **تمام Domain Services:** CPM, EVM, Calendar, Progress, Notifications, AI
✅ **Frontend Pages:** 27 صفحه با RTL و Persian support
✅ **تست‌ها:** 39 فایل تست شامل security, integration, validation

---

## 13. گام‌های بعدی (Post-Consolidation)

1. تکمیل Payroll UI
2. پیاده‌سازی Safety/HSE module
3. بهبود i18n و پوشش کامل فارسی
4. تست end-to-end با مسیر واقعی کسب‌وکار
5. بهینه‌سازی performance و bundle size
6. آماده‌سازی برای production deployment

---

**امضای طراحی:** این مستند، وضعیت طراحی VETRA OS را در تاریخ 2026-09-08 تثبیت می‌کند. هر تغییر پس از این تاریخ باید با ارجاع به این سند و از طریق ADR انجام شود.
