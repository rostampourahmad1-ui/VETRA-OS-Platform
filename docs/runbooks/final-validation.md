# Runbook اجرای نهایی و آماده‌سازی Release

این runbook مرجع عملیاتی برای اعتبارسنجی تغییرات VETRA پیش از merge به `main` است. هیچ مرحله‌ای مجوز bypass کردن ruleset، review مستقل، RLS، migration یا status check را نمی‌دهد.

## 1. پیش‌نیازها

| مورد | مقدار مورد انتظار | کنترل |
|---|---|---|
| Runtime CI | Node.js 24 | `node --version` |
| Package manager | pnpm مطابق `packageManager` | `pnpm --version` |
| Branch | workspace پاک و remote همگام | `git status --short --branch` |
| Database integration | PostgreSQL و `DATABASE_TEST_APP_URL` با role `vetra_app` | فقط برای RLS integration محلی |
| Secret hygiene | `.env` و token خارج از Git | `git status` و review diff |

> اجرای محلی با Node غیر 24 برای بازخورد توسعه مفید است، اما جایگزین CI Node 24 نیست. تصمیم release باید به checkهای موفق GitHub Actions متکی باشد.

## 2. توالی استاندارد نهایی

از root repository اجرا کنید:

```bash
pnpm install --frozen-lockfile
node scripts/final-validation.mjs
```

اسکریپت به ترتیب زیر اجرا می‌شود: OpenAPI code generation، lint، typecheck، کل test suite، RLS integration در صورت وجود `DATABASE_TEST_APP_URL`، build و `git diff --check`.

| گیت | فرمان مستقل | معیار عبور |
|---|---|---|
| API contract | `pnpm --filter @workspace/api-spec run codegen` | codegen بدون خطا و هیچ generated diff ناخواسته ندارد |
| Lint | `pnpm lint` | exit code صفر |
| TypeScript | `pnpm typecheck` | تمام workspaceها موفق |
| Tests | `pnpm test` | هیچ failure ندارد؛ skipهای DB باید صریح ثبت شوند |
| RLS integration | `pnpm exec vitest run tests/security/rls-integration.test.ts` | با role غیرمالک `vetra_app` و PostgreSQL واقعی موفق |
| Build | `pnpm build` | تمام buildها موفق؛ warning bundle باید ثبت شود |
| Diff hygiene | `git diff --check` | بدون whitespace error |

## 3. اجرای PostgreSQL/RLS در staging یا محیط محلی

از `DATABASE_MIGRATION_URL` فقط برای role migration و از `DATABASE_TEST_APP_URL` فقط برای role غیرمالک application استفاده کنید. password یا URL را در shell history، log یا issue وارد نکنید.

```bash
# در محیط امن با secret store، نه در Git
export DATABASE_MIGRATION_URL='postgresql://...'
export DATABASE_TEST_APP_URL='postgresql://...'

# roleها و تمام فایل‌های SQL migration از پوشهٔ migration، به‌ترتیب شماره، اعمال می‌شوند.
psql "$DATABASE_MIGRATION_URL" -v ON_ERROR_STOP=1 -f infra/db/init/01-roles.sql
pnpm db:migrate

pnpm exec vitest run tests/security/rls-integration.test.ts
```

اگر migration یا test شکست خورد، اجرای release متوقف است. migration مخرب، drop data یا permission relaxation برای عبور از test مجاز نیست.

## 4. Pull Request و CI

در وضعیت فعلی، PRها پشته‌ای هستند:

| PR | base | اقدام لازم |
|---|---|---|
| [#3](https://github.com/rostampourahmad1-ui/VETRA-OS-Platform/pull/3) | `main` | approval مستقل، حل threadها، checkهای `verify` و `docker-build` سبز، سپس merge بدون bypass |
| [#4](https://github.com/rostampourahmad1-ui/VETRA-OS-Platform/pull/4) | `feat/forms-workflow-p1` | پس از merge #3، rebase/retarget به `main`، CI Node 24 و PostgreSQL را اجرا و review مستقل بگیرید |

قبل از merge هر PR این کنترل‌ها باید برقرار باشند:

1. `gh pr checks <number>` موفق است.
2. `gh pr view <number> --json mergeStateStatus,reviewDecision` وضعیت merge قابل قبول را نشان می‌دهد.
3. reviewer مستقل آخرین commit را approve کرده است.
4. `git diff main...HEAD` فقط scope تأییدشده را دارد؛ generated API files با source OpenAPI سازگارند.
5. هیچ `.env`، token، password، artifact build یا migration destructive در diff نیست.

## 5. Smoke و عملیات پس از merge

پس از merge، CI روی `main` باید کاملاً سبز شود. سپس API را با یک tenant test محدود smoke کنید: read یک project مجاز، read یک project سازمان دیگر (باید 404/denied باشد)، create/update یک record مجاز، و مشاهدهٔ audit/event. هیچ تستی نباید روی tenant یا دادهٔ production اجرا شود.

## 6. Go / No-Go

| وضعیت | تصمیم |
|---|---|
| همه گیت‌ها و approval مستقل سبز | Go برای merge مطابق ruleset |
| RLS integration skip یا ناموفق | No-Go برای release؛ فقط CI/staging DB gate پس از رفع |
| lint/typecheck/test/build ناموفق | No-Go؛ root cause را رفع کنید |
| هشدار bundle بدون failure | Go مشروط، با issue P3 ثبت‌شده |
| approval مستقل غایب | No-Go برای merge؛ ruleset پابرجاست |

## 7. خروجی لازم در گزارش release

گزارش نهایی باید commit SHA، PR URL، نسخهٔ Node/pnpm، فرمان‌های اجراشده و نتیجهٔ واقعی هر گیت، migrationهای اعمال‌شده، skipهای محیطی، وضعیت review/checkها و ریسک‌های باقی‌مانده را شامل شود.
