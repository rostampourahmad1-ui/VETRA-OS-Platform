# P1-0 — ممیزی و قرارداد Forms / Workflow

**وضعیت:** مبنای طراحی برای P1-1 و P1-2
**دامنهٔ ممیزی:** `FormsBuilder`، `workflows`، tenant/RBAC، persistence، OpenAPI، audit و آزمون‌ها
**baseline:** `pnpm test` در ۲۲ اوت ۲۰۲۶ با ۱۰ فایل و ۱۲۰ آزمون موفق اجرا شد. آزمون‌های PostgreSQL/RLS در این محیط به دلیل نبود PostgreSQL محلی skip شدند؛ CI آن‌ها را با سرویس PostgreSQL اجرا می‌کند.

## معماری فعلی

رابط Forms در `artifacts/vetra/src/pages/forms/FormsBuilder.tsx` یک prototype client-side است: draft در `localStorage` نگه‌داری می‌شود و endpoint سروری برای Forms وجود ندارد. API router پس از `attachTenant` mount می‌شود، بنابراین identity و `organizationId` باید از Clerk و نگاشت کاربر در سمت سرور اخذ شود؛ هیچ route جدیدی نباید `organizationId` یا actor را از body اعتماد کند.

Workflow موجود سه جدول `workflows`، `workflow_steps` و `workflow_runs` دارد و tenant-scoped است؛ با این حال فقط یک وضعیت جاری و `payload` دارد، رویداد تصمیم append-only ندارد و endpoint تصمیم مرحله، permission اختصاصی همان step را server-side بررسی نمی‌کند. OpenAPI منبع قرارداد است و `scripts/update_openapi.mjs` نیز بخش‌های Workflow را inject می‌کند؛ هر تغییر قرارداد باید هر دو مسیر را سازگار نگه دارد.

## یافته‌ها

| شناسه | شدت | شواهد | اثر | وضعیت P1 |
|---|---|---|---|---|
| FW-001 | P1 | `routes/workflows.ts` برای تصمیم فقط `workflows.approve` را بررسی می‌کند و `workflow_steps.required_permission` را اعمال نمی‌کند. | فردی با مجوز عمومی approval ممکن است گامی را تأیید کند که permission اختصاصی آن را ندارد. | رفع در P1-2 |
| FW-002 | P1 | `workflow_runs` تاریخچهٔ تصمیم، actor تصمیم و comment ندارد. | زنجیرهٔ approval قابل ممیزی و بازتولید نیست. | رفع در P1-2 |
| FORM-001 | P1 | Forms فقط `localStorage` دارد؛ schema، RLS، API و audit ندارد. | فرم‌ها بین کاربران/دستگاه‌ها پایدار یا کنترل‌شده نیستند و امکان submission واقعی ندارند. | رفع در P1-1 |
| CONTRACT-001 | P2 | OpenAPI و اسکریپت updater به هم وابسته‌اند و Forms path ندارد. | اضافه‌کردن route بدون هماهنگی با codegen می‌تواند قرارداد typed را ناپایدار کند. | رفع در P1-1 |
| TEST-001 | P2 | تست security برای Forms/decision abuse وجود ندارد. | tenant boundary و approval lifecycle تازه بدون regression coverage می‌ماند. | رفع در P1-1/P1-2 |

## قرارداد دامنهٔ مصوب برای این increment

### Form template

یک template متعلق به **سازمان** است و می‌تواند scope اختیاری **پروژه** داشته باشد. `organizationId`، `createdBy` و `updatedBy` فقط از context سرور تعیین می‌شوند. lifecycle template شامل `draft`، `published` و `archived` است. فقط draft قابل ویرایش است؛ publish یک snapshot نسخهٔ immutable می‌سازد. archive template یا نسخه‌های قدیمی را حذف نمی‌کند.

هر template شامل `name`، `description`، `projectId?`، `workflowId?` و `definition` است. `definition` یک JSONB معتبر با fieldهای text، number، date، select و checkbox است؛ fieldها id پایدار، label، type، required و options مجاز دارند. تعریف فرم در زمان publish به یک version ذخیره می‌شود و submission فقط به همان version ارجاع می‌دهد.

### Form submission

هر submission به سازمان، template و template version تعلق دارد و scope project آن از template اخذ می‌شود. lifecycle submission شامل `draft`، `submitted`، `approved`، `rejected` و `revision_requested` است. payload پاسخ‌ها JSONB است و فقط کلیدهای fieldهای نسخهٔ immutable template و نوع معتبر آن‌ها پذیرفته می‌شوند. در submit، required fieldها enforce می‌شوند.

### Workflow و approval

workflow همچنان domain-agnostic باقی می‌ماند و از `entityType = form_submission` پشتیبانی می‌کند. هر step نام و `requiredPermission` دارد. ایجاد/ویرایش workflow به `workflows.manage` نیاز دارد؛ اجرای workflow به `workflows.execute` و تصمیم هر step به **هر دو** `workflows.approve` و `requiredPermission` همان step نیاز دارد. تصمیم‌ها append-only در `workflow_run_events` ثبت می‌شوند. state transition فقط در سرور انجام می‌شود و actor/status/client-supplied tenant قابل اعتماد نیست.

تصمیم نهایی Workflow متصل به `form_submission` وضعیت submission را atomically به `approved` یا `rejected` تغییر می‌دهد. action `request_revision` submission را به `revision_requested` برمی‌گرداند؛ این action باید دلیل غیرخالی داشته باشد.

## permissionهای افزایشی

| کلید | مصرف |
|---|---|
| `forms.read` | فهرست و جزئیات template/version/submission در سازمان |
| `forms.manage` | ایجاد، ویرایش draft، publish و archive template |
| `forms.submit` | ایجاد draft و submit submission |
| `forms.review` | مشاهدهٔ submissionهای قابل review و request revision در صورت مجازبودن workflow |

`CEO` و `ProjectDirector` این permissionها را می‌گیرند؛ نقش‌های عملیاتی منتخب (`ProjectManager`، `PlanningEngineer`، `SiteEngineer` و `Supervisor`) read/submit می‌گیرند. اعطای review به‌صورت مستقیم انجام نمی‌شود؛ step permission Workflow مرجع approval است.

## تغییرات داده‌ای پیشنهادی

تغییرات باید فقط **افزایشی** باشند:

- جدول‌های `form_templates`، `form_template_versions` و `form_submissions` با foreign key، `organization_id` و indexهای tenant/project.
- جدول append-only `workflow_run_events` برای تصمیم و actor.
- ستون‌های nullable audit در workflowهای موجود، فقط در صورت نیاز برای سازگاری API؛ backfill یا drop در این increment انجام نمی‌شود.
- RLS و چهار policy استاندارد برای هر جدول tenant-bound؛ migration باید با schema-qualified policyها سازگار باشد.
- permission seedهای idempotent و role mappingهای افزایشی.

## استراتژی آزمون

آزمون‌های جدید باید حداقل این موارد را پوشش دهند:

1. Tenant A نمی‌تواند template، version، submission یا workflow run سازمان B را list/read/mutate کند.
2. `organizationId` و `createdBy` ارسالی client نادیده گرفته می‌شوند و context سرور استفاده می‌شود.
3. draft قابل تغییر است ولی template منتشرشده immutable می‌ماند.
4. submit با required field ناقص یا payload با type نامعتبر رد می‌شود.
5. approver بدون permission step فعلی، حتی با `workflows.approve`، رد می‌شود.
6. هر تصمیم event immutable با actor و timestamp ایجاد می‌کند و تصمیم نهایی submission را sync می‌کند.
7. migration و RLS tables تازه در PostgreSQL CI اعمال و با role غیرمالک آزمایش می‌شوند.

## rollout و rollback

این migration additive است و به دادهٔ موجود Forms وابسته نیست. rollback عملیاتی با غیرفعال‌کردن route/UI و نگه‌داشتن tableها انجام می‌شود؛ حذف tableها یا data purge بخشی از این کار نیست و نیازمند تأیید جداگانه است. انتشار باید به‌ترتیب migration، API، UI باشد؛ نسخه‌های publish‌شده هیچ‌گاه rewrite نمی‌شوند.
