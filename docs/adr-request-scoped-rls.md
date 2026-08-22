# Architecture Decision: RLS context در محدودهٔ request و transaction

**وضعیت:** پذیرفته‌شده برای این تغییر
**دامنه:** `lib/db`، middleware tenant، audit و migration `0008`
**ریسک:** بالا؛ تغییر مرز tenant isolation و رفتار پایگاه‌داده

## معماری پیشین و مسئله

اتصال Drizzle روی یک `pg.Pool` سراسری ساخته می‌شد. middleware `attachTenant` با فراخوانی `set_organization_context`، متغیر PostgreSQL را در یک اتصال انتخاب‌نشده از pool تنظیم می‌کرد، اما queryهای بعدی ممکن بود روی اتصال دیگری اجرا شوند. همچنین setting قدیمی از نوع session-scoped بود؛ بنابراین اگر همان اتصال به tenant دیگری بازمی‌گشت، احتمال باقی‌ماندن context وجود داشت. این الگو با قرارداد migration `0004_audit_rls.sql` که context را وابسته به transaction/connection می‌داند، همسو نبود.

## تصمیم

هر request احراز هویت‌شده اکنون یک client اختصاصی از pool می‌گیرد، transaction را آغاز می‌کند و `set_request_organization_context` را با `set_config(..., true)` اجرا می‌نماید. Drizzle همان client با `AsyncLocalStorage` به facade سازگار `db` متصل می‌شود؛ بنابراین routeها و middlewareهای موجود بدون تغییر import، queryهای خود را روی client request-bound انجام می‌دهند. در پایان responseهای موفق، transaction commit می‌شود؛ پاسخ‌های `4xx`/`5xx` یا قطع اتصال rollback می‌شوند و client آزاد می‌گردد.

برای یافتن tenant کاربر پیش از معلوم‌شدن organization، یک policy bootstrap بسیار محدود روی جدول `users` افزوده شده است. این policy فقط user active با `clerk_user_id` برابر با setting transaction-local را نشان می‌دهد. پس از resolve شدن mapping، تمام queryهای بعدی تحت policy استاندارد organization اجرا می‌شوند.

Auditهای fire-and-forget نمی‌توانند به عمر request client متکی باشند؛ از این رو هر audit در یک transaction tenant-bound مستقل اجرا می‌شود. این رفتار non-blocking سابق را حفظ می‌کند و از استفاده از client آزادشده جلوگیری می‌نماید.

## گزینه‌های بررسی‌شده

| گزینه | تصمیم | دلیل |
|---|---|---|
| باقی‌ماندن با pool سراسری و `set_config(..., false)` | رد شد | query بعدی تضمین اتصال یکسان ندارد و context می‌تواند بعد از پایان request باقی بماند. |
| افزودن `organizationId` در همهٔ queryها و حذف اتکا به RLS | رد شد | refactor بسیار گسترده، خطاپذیر و فاقد خط دفاع دوم database است. |
| request client + `AsyncLocalStorage` + `SET LOCAL` | پذیرفته شد | کمترین تغییر سازگار با routeهای موجود، pin شدن connection و پاک‌سازی خودکار context را فراهم می‌کند. |
| ساخت service/repository جدید برای همهٔ ماژول‌ها | defer شد | مسیر معماری مطلوب در آینده است اما برای رفع ریسک pooling در این PR بیش‌ازحد گسترده است. |

## اثرات امنیتی و عملیاتی

این تصمیم تضمین می‌کند context tenant برای عمر همان transaction معتبر است و قبل از بازگشت client به pool پاک می‌شود. migration `0008` تابع‌ها را از `PUBLIC` revoke کرده و فقط به `vetra_app` و `vetra_migration` permission اجرا می‌دهد. Bootstrap Clerk فقط همان mapping فعال را نمایش می‌دهد و نمی‌تواند فهرست کاربرها را enumerate کند.

هر request tenant اکنون یک client تا زمان تکمیل response نگه می‌دارد. بنابراین باید اندازهٔ `pg.Pool`، مدت transaction و هر handler طولانی‌مدت در محیط production مانیتور شود. عملیات خارجی یا streaming نباید داخل route tenant transaction اجرا شوند. Webhookها و jobهای پس‌زمینه خارج از scope این تغییر باقی مانده‌اند و باید برای استفادهٔ صریح از `withOrganizationDatabase` بازبینی شوند.

## Migration و rollback

migration `0008` افزایشی است؛ داده‌ای حذف یا backfill نمی‌شود. rollback عملیاتی، بازگرداندن deployment به نسخهٔ قبلی و حذف policy/functionهای جدید از طریق migration معکوس جداگانه است. با وجود برگشت‌پذیری schema، به دلیل حساسیت tenant isolation باید ابتدا در CI و سپس staging با PostgreSQL واقعی اجرا شود.

## راهبرد آزمون

تست integration PostgreSQL دو رفتار را بررسی می‌کند: bootstrap Clerk فقط mapping فعال همان identity را می‌بیند و context organization پس از commit transaction پاک می‌شود. تست استاتیک نیز وجود `AsyncLocalStorage`، client اختصاصی، `BEGIN/COMMIT/ROLLBACK`، `SET LOCAL` و audit transaction-bound را محافظت می‌کند. پیش از انتشار، تمام lint، typecheck، test، build و CI شامل migration `0008` باید موفق شوند.
