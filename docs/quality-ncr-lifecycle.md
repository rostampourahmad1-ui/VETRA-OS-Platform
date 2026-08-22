# قرارداد دامنهٔ Quality/NCR Lifecycle

**دامنه:** Inspection و Non-Conformance Report (NCR)  
**مالک داده:** سازمان و پروژه  
**مبنای زمان:** تاریخ‌های کسب‌وکاری در PostgreSQL به‌صورت Gregorian/ISO نگهداری می‌شوند؛ نمایش شمسی صرفاً در UI انجام می‌شود.

## هدف

این قرارداد، ایجاد، به‌روزرسانی، transition، approval و حذف منطقی رکوردهای کیفیت را از mutation آزاد وضعیت جدا می‌کند. هر تغییر قابل‌اهمیت با actor، زمان، وضعیت پیشین/بعدی و snapshot در `quality_events` ثبت می‌شود. eventها در سطح دیتابیس append-only هستند.

| نوع رکورد | وضعیت‌های مجاز | وضعیت اولیه | حذف |
|---|---|---|---|
| Inspection | `planned`، `in_progress`، `completed`، `cancelled` | `planned` | soft delete |
| NCR | `open`، `in_progress`، `resolved`، `awaiting_approval`، `closed` | `open` | soft delete |

## Transitionهای Inspection

| از | به | شرط |
|---|---|---|
| `planned` | `in_progress` | مجوز `quality.update` |
| `planned` | `cancelled` | مجوز `quality.update` و دلیل اجباری |
| `in_progress` | `completed` | مجوز `quality.update` |
| `in_progress` | `cancelled` | مجوز `quality.update` و دلیل اجباری |
| `completed` یا `cancelled` | هر وضعیت | ممنوع؛ رکورد terminal است |

## Transitionهای NCR و approval

| از | به | مسئول | شرط |
|---|---|---|---|
| `open` | `in_progress` | تیم کیفیت | `quality.update` |
| `in_progress` | `resolved` | تیم کیفیت | `quality.update` |
| `resolved` | `in_progress` | تیم کیفیت | دلیل اجباری برای بازگشایی |
| `resolved` | `awaiting_approval` | adapter اختصاصی NCR | workflow فعال از نوع `non_conformance_report` و `workflows.execute` |
| `awaiting_approval` | `closed` | تصمیم نهایی workflow | permission تعریف‌شده در step نهایی workflow |
| `awaiting_approval` | `in_progress` | reject یا request_revision workflow | comment revision برای `request_revision` اجباری است |
| `closed` | هر وضعیت | — | ممنوع؛ رکورد terminal است |

## مرزهای authorization و audit

تمام routeها context سازمان و actor را از middleware سمت‌سرور می‌گیرند. `organizationId`، `actorId`، وضعیت approval و `workflowRunId` از payload client پذیرفته نمی‌شوند. خواندن و mutation با RLS، tenant scope، permission و project ownership حفاظت می‌شوند.

`quality_events` شامل eventهای `created`، `updated`، `transitioned`، `workflow_submitted`، `workflow_approved`، `workflow_rejected`، `workflow_revision_requested` و `deleted` است. جدول از update/delete در سطح trigger PostgreSQL محافظت شده و برای مسیرهای خواندن tenant-scoped، RLS دارد.

## سازگاری API

`PATCH` فقط attributes غیر lifecycle را می‌پذیرد. هر payload حاوی `status` با پاسخ conflict رد می‌شود و client باید endpoint `/transition` را مصرف کند. شروع approval NCR فقط از endpoint اختصاصی `/quality/non-conformance-reports/{id}/workflow-runs` ممکن است؛ adapter عمومی Workflow همچنان برای Forms محدود باقی می‌ماند.

## Migration و recovery

migration `0009_quality_lifecycle.sql` افزایشی است: فقط column، index، foreign key، check constraint، table event و policy اضافه می‌کند. دادهٔ قدیمی حذف یا بازنویسی نمی‌شود. رکوردهای قبلی ممکن است `created_by` یا `updated_by` نداشته باشند؛ این محدودیت برای historical data پذیرفته شده و همهٔ mutationهای جدید metadata کامل ثبت می‌کنند. پیش از production باید migration روی staging با PostgreSQL واقعی، role `vetra_app` و rollback rehearsal اجرا شود.
