# Runbook — Controlled Human Onboarding Test

**Goal:** a real Clerk user signs in, is attached to a valid VETRA organization
and sample project, completes `/onboarding` without a 403, and can exercise the
main VETRA OS routes manually.

> Local / pre-production testing only. Never set `SEED_CLERK_USER_ID` or run the
> seed in production. Never commit real Clerk ids, secrets, or `.env` values.

---

## 1. Why a 403 happens (context)

The VETRA API is the authority for tenant access. `attachTenant`
(`artifacts/api-server/src/middlewares/tenant.ts`) rejects a request when:

1. there is no Clerk `userId` → `401`; or
2. the Clerk session has **no active Organization** (`orgId`) → `403 no organization assigned in session`; or
3. no active VETRA user row is mapped to that `clerk_user_id` → `403 not mapped to a VETRA organization`.

`/api/projects` additionally requires the RBAC permission `projects.read`, so a
mapped user with no role/permission also receives `403`.

The onboarding page now activates the caller's own first Clerk Organization
before loading (clients cannot invent memberships), and translates each failure
into an actionable Persian message.

---

## 2. Prerequisites

| Requirement | Notes |
|---|---|
| PostgreSQL reachable | Uses the URLs in `.env` (not printed anywhere). |
| Migrations applied | `pnpm db:migrate` |
| API server on `:5000` | `pnpm --filter @workspace/api-server dev` |
| Vite dev server on `:5173` | `pnpm --filter @workspace/vetra dev` |
| Clerk local keys in `.env` | `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY` |
| Clerk Organizations **enabled** | Clerk Dashboard → Organizations. |
| Test user is a member of a Clerk Organization | Required for `orgId`; the page auto-activates the first membership. |
| `SEED_CLERK_USER_ID` | Set only for the test user, only in the local shell / local `.env`. |
| `GET /api/healthz` returns 200 | Unauthenticated liveness probe. |

---

## 3. Prepare sample data + mapping (idempotent)

Run once; safe to re-run. The seed refuses `NODE_ENV=production`, requires
`SEED_CLERK_USER_ID`, and never duplicates users, memberships, or the project.

```powershell
# Set these in the CURRENT shell (do not commit, do not paste into reports):
#   $env:SEED_CLERK_USER_ID = "user_xxxxxxxx"
#   $env:DATABASE_MIGRATION_URL = "<owner connection string from .env>"

pnpm --filter @workspace/db seed
```

Expected effect:

- one sample organization and one sample project (created only if missing);
- the Clerk user upserted by `clerk_user_id` with the `CEO` role (full permission
  set required to open every main page) and added to the sample project;
- `project_members` gets a single membership row (`ON CONFLICT DO NOTHING`).

If `SEED_CLERK_USER_ID` is missing, the script stops with a clear message instead
of guessing a user.

---

## 4. Main scenario

1. Start PostgreSQL, the API (`:5000`), and Vite (`:5173`).
2. `GET http://localhost:5000/api/healthz` → `200 {"status":"ok"}`.
3. Open `http://localhost:5173/`.
4. Sign in with Clerk (Sign in / Sign up).
5. The app redirects to `/onboarding`.
6. Confirm the onboarding page activates the Clerk Organization (no 403), then
   shows the sample organization.
7. Select the sample project (or accept the only one).
8. Click **ورود به داشبورد**.
9. Verify the dashboard renders tenant data.
10. Open each main page and confirm it loads without a crash:
    Dashboard, Forms Builder, Inventory, Cost Control, Progress, Resources,
    Scheduling, Settings.
11. Check: Persian text, RTL layout, dark mode toggle, responsive width.

---

## 5. Error scenarios

| Scenario | Expected |
|---|---|
| Open a protected route while signed out | No protected data; API returns `401`. |
| Signed-in Clerk user with no active Organization | Onboarding shows "حساب Clerk شما عضو هیچ سازمانی نیست…". |
| Signed-in, org active, but no VETRA mapping | Onboarding shows "حساب شما به هیچ سازمان وترا متصل نیست…". |
| Mapped user without `projects.read` | Onboarding shows the permission message; no project data. |
| Request a project belonging to another tenant | `404`, no data leak. |
| Refresh on `/onboarding` | Same state recovers, no redirect loop. |
| Refresh on `/` (dashboard) | Workspace context restored from local storage. |
| Temporarily stop the API | Onboarding shows the retryable error state. |
| Empty data for the tenant | Empty state, no crash. |
| Form validation / mutation error | Inline, understandable error. |
| Logout then login again | User returns to onboarding/dashboard correctly. |

---

## 6. Acceptance criteria

- Protected data is never shown without a session.
- A validly mapped user passes onboarding.
- Correct organization and project are shown.
- No other tenant's data is visible.
- Errors are user-understandable.
- No repeated critical console errors.
- Main pages do not crash.
- Persian and RTL are intact on the main path.
- No secret or token appears in UI, logs, or the repository.

---

## 7. Out of scope / status

- This batch does **not** finish localization. Localization is incomplete and
  must not block the human test above unless a specific untranslated string
  blocks the main path.
- The live Clerk-session states (no-mapping → 403, valid mapping → 200) were not
  executed by the agent (no real Clerk session available) and remain **manual**.
