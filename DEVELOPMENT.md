# VETRA OS Platform — راهنمای توسعه

VETRA OS یک monorepo مبتنی بر TypeScript برای ERP و کنترل پروژهٔ ساخت‌وساز با تفکیک سازمانی، RBAC سمت‌سرور و PostgreSQL RLS است.

## پیش‌نیازها

| ابزار | نسخه / الزام | دلیل |
|---|---|---|
| Node.js | **24** | runtime هدف توسعه و GitHub Actions |
| pnpm | مطابق `packageManager` در `package.json` | مدیریت workspace و lockfile |
| PostgreSQL | 16 یا سازگار | اجرای API، migration و RLS integration |
| Docker | اختیاری | ساخت imageهای API و frontend |

هرگز `.env`، PAT، password یا URL تولیدی پایگاه‌داده را commit نکنید. برای application runtime از `DATABASE_APP_URL` با role غیرمالک `vetra_app` استفاده کنید؛ migrationها با `DATABASE_MIGRATION_URL` و role دارای DDL اجرا می‌شوند.

## راه‌اندازی و اعتبارسنجی

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

| فرمان | کاربرد |
|---|---|
| `pnpm --filter @workspace/api-server run dev` | اجرای API روی port 5000 |
| `pnpm --filter vetra dev` | اجرای frontend Vite |
| `pnpm --filter @workspace/api-spec run codegen` | بازتولید Orval client و Zod از `lib/api-spec/openapi.yaml` |
| `pnpm --filter @workspace/db run push` | فقط برای محیط توسعه؛ در CI/production از migration صریح استفاده کنید |
| `pnpm exec vitest run tests/security/rls-integration.test.ts` | اجرای آزمون RLS با PostgreSQL واقعی |

## PostgreSQL، roleها و RLS

ابتدا roleهای پایگاه‌داده را از `infra/db/init/01-roles.sql` ایجاد کنید. سپس migrationها را **به ترتیب نام فایل** و با `psql -v ON_ERROR_STOP=1 -f` اعمال کنید. CI همین ترتیب را تا migrationهای `0010` اجرا می‌کند.

> درخواست tenant-aware یک client اختصاصی pool می‌گیرد و RLS context را با `SET LOCAL` در transaction قرار می‌دهد. هر route باید از middleware `attachTenant` عبور کند. Queryهای خارج از چرخهٔ HTTP، مانند worker یا webhook، باید صریحاً از `withOrganizationDatabase` یا context امن معادل استفاده کنند.

در محیط CI، متغیر `DATABASE_TEST_APP_URL` باید به role `vetra_app` اشاره کند تا RLS واقعاً با role غیرمالک آزمون شود. اگر PostgreSQL محلی در دسترس نباشد، testهای integration با پیام skip اجرا می‌شوند؛ این skip موفقیت integration محسوب نمی‌شود.

## قرارداد API و codegen

`lib/api-spec/openapi.yaml` منبع حقیقت قراردادهای API است. پس از هر تغییر path یا schema باید این ترتیب رعایت شود:

```bash
pnpm --filter @workspace/api-spec run codegen
pnpm typecheck
pnpm test
```

فایل‌های زیر تولیدی‌اند و نباید دستی ویرایش شوند: `lib/api-client-react/src/generated/**` و `lib/api-zod/src/generated/**`.

## نقشهٔ مخزن و تصمیم‌های اصلی

| مسیر | مسئولیت |
|---|---|
| `artifacts/api-server/src/routes` | APIهای Express و enforcement مرز server |
| `artifacts/api-server/src/middlewares/tenant.ts` | identity، tenant scope و session RLS در محدودهٔ request |
| `lib/db/src/schema` | schemaهای Drizzle |
| `lib/db/drizzle` | migrationهای افزایشی PostgreSQL |
| `lib/api-spec/openapi.yaml` | قرارداد API و ورودی codegen |
| `tests/security` | RLS، role غیرمالک و regressionهای tenant isolation |
| `docs/adr-request-scoped-rls.md` | تصمیم معماری context RLS request-bound |
| `docs/quality-ncr-lifecycle.md` | lifecycle و approval NCR |

## نکات مهم

**امنیت:** ترتیب هر operation محافظت‌شده باید `Authentication → Tenant isolation → Permission → Ownership → Validation → Database → Audit` باشد. هیچ‌گاه به `organizationId` یا actor ارسالی client اعتماد نکنید.

**داده و migration:** migrationها فقط افزایشی‌اند. حذف داده، migration مخرب یا تغییر semantic وضعیت‌ها نیازمند approval صریح، rehearsal در staging و برنامهٔ recovery است.

**UI:** VETRA فارسی و RTL-first است. تاریخ در ذخیره‌سازی Gregorian/ISO باقی می‌ماند و فقط در لایهٔ نمایش به شمسی تبدیل می‌شود. دارایی خارجی CDN اضافه نکنید.
