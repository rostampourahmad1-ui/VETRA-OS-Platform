# راهنمای اطلاعات دسترسی VETRA OS

این فایل فهرست متغیرهای محیطی مورد نیاز پروژه، کاربرد هر متغیر، قالب مقدار و مسیر دریافت آن را توضیح می‌دهد. **مقادیر واقعی کلیدها و رمزها را در Git commit نکنید**؛ فایل `.env.example` فقط شامل placeholder است و باید برای محیط محلی به `.env` کپی و تکمیل شود.

## فهرست متغیرهای محیطی

| متغیر | چیست؟ | از کجا دریافت شود؟ | قالب مقدار |
|---|---|---|---|
| `DATABASE_URL` | رشتهٔ اتصال PostgreSQL برای Drizzle و API server است. | از PostgreSQL محلی، Neon، Supabase یا Railway دریافت می‌شود. | `postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require`؛ برای PostgreSQL محلی معمولاً `sslmode` لازم نیست. |
| `CLERK_SECRET_KEY` | کلید محرمانهٔ سمت سرور برای اعتبارسنجی و مدیریت Clerk است. این مقدار نباید در کد frontend یا مرورگر قرار گیرد. | در [Clerk Dashboard](https://dashboard.clerk.com)، پس از انتخاب Application، بخش API Keys. | معمولاً با `sk_test_` یا `sk_live_` شروع می‌شود. |
| `CLERK_PUBLISHABLE_KEY` | کلید عمومی Clerk برای استفادهٔ سمت سرور یا تنظیمات مشترک برنامه است. | در [Clerk Dashboard](https://dashboard.clerk.com)، بخش API Keys. | معمولاً با `pk_test_` یا `pk_live_` شروع می‌شود. |
| `VITE_CLERK_PUBLISHABLE_KEY` | نسخهٔ public کلید Clerk که توسط Vite به frontend تزریق می‌شود. | همان Publishable Key از [Clerk Dashboard](https://dashboard.clerk.com). | با `pk_test_` یا `pk_live_` شروع می‌شود؛ هرگز Secret Key را اینجا قرار ندهید. |
| `PORT` | پورتی است که API server روی آن گوش می‌دهد. | تولید نمی‌شود؛ توسط توسعه‌دهنده یا محیط استقرار تعیین می‌شود. | عدد صحیح مثبت، مانند `3000` یا `5000`. |
| `OPENAI_API_KEY` | کلید احراز هویت برای API سازگار با OpenAI و قابلیت‌های هوش مصنوعی پروژه است. | در [OpenAI API Keys](https://platform.openai.com/api-keys)، پس از ورود و ساخت API key. | معمولاً با `sk-` شروع می‌شود. کلید را فقط سمت سرور نگه دارید. |
| `OPENAI_API_BASE` | آدرس پایهٔ API سازگار با OpenAI است. | برای OpenAI رسمی معمولاً `https://api.openai.com/v1`؛ برای gateway یا proxy سازمانی، آدرس ارائه‌شده توسط همان سرویس. | یک URL کامل شامل scheme، مانند `https://api.openai.com/v1`. |
| `OPENAI_MODEL` | نام مدل زبانی مورد استفادهٔ API server است. | از فهرست مدل‌های فعال در حساب یا gateway انتخاب شود. | شناسهٔ متنی مدل، مانند `gpt-4o-mini`؛ از فاصله و quoteهای اضافی پرهیز کنید. |

## ساخت PostgreSQL به‌صورت محلی

برای اجرای محلی، PostgreSQL را با پکیج رسمی سیستم‌عامل یا Docker نصب کنید، یک database و user بسازید و سپس رشتهٔ اتصال را در `DATABASE_URL` قرار دهید. نمونهٔ Docker:

```bash
docker run --name vetra-postgres \
  -e POSTGRES_USER=vetra \
  -e POSTGRES_PASSWORD=change-me \
  -e POSTGRES_DB=vetra \
  -p 5432:5432 \
  -d postgres:16
```

در این نمونه، مقدار `DATABASE_URL` به شکل زیر خواهد بود:

```text
postgresql://vetra:change-me@localhost:5432/vetra
```

برای نصب مستقیم، PostgreSQL را از [postgresql.org/download](https://www.postgresql.org/download/) دریافت کنید، سرویس را اجرا کنید و با `createdb vetra` یک database بسازید. رمز عبور را در shell history یا فایل عمومی ذخیره نکنید.

## ساخت PostgreSQL آنلاین

**Neon:** در [console.neon.tech](https://console.neon.tech) یک project و database بسازید، سپس از بخش **Connect**، connection string را کپی کنید. در محیط production مقدار ارائه‌شده معمولاً شامل `sslmode=require` است.

**Supabase:** در [supabase.com/dashboard](https://supabase.com/dashboard) یک project جدید بسازید. سپس از **Project Settings → Database**، بخش **Connection string**، حالت مناسب برای runtime خود را انتخاب و URI را کپی کنید. اگر pooler ارائه‌شده توسط Supabase برای محیط deployment توصیه شده است، همان URI را استفاده کنید.

**Railway:** در [railway.app](https://railway.app) یک PostgreSQL service اضافه کنید و پس از provision شدن، مقدار اتصال را از بخش **Variables** یا اطلاعات اتصال سرویس کپی کنید. مقدار باید به یک URI معتبر PostgreSQL تبدیل شود؛ username، password، host، port و database را تغییر ندهید مگر اینکه سرویس صراحتاً چنین کاری را لازم بداند.

> پس از تنظیم `DATABASE_URL`، migrationهای موجود در `lib/db/drizzle/`، از جمله migration مربوط به Quality Management، باید در محیط database اجرا شوند. پیش از migration production از database backup بگیرید.

## Clerk و دامنه‌های محیطی

در [Clerk Dashboard](https://dashboard.clerk.com) یک Application بسازید، کلیدهای **Secret key** و **Publishable key** را از بخش API Keys بردارید و مقدار public را هم در `VITE_CLERK_PUBLISHABLE_KEY` قرار دهید. Secret key فقط در server-side environment قرار می‌گیرد. برای محیط‌های development و production از کلیدهای همان محیط استفاده کنید و در production از کلیدهای `*_live_*` بهره ببرید.

## OpenAI و API سازگار

در [OpenAI API Keys](https://platform.openai.com/api-keys) یک API key بسازید و آن را فقط در secret manager یا متغیر محیطی سمت سرور ذخیره کنید. برای OpenAI رسمی، `OPENAI_API_BASE` را روی `https://api.openai.com/v1` بگذارید و `OPENAI_MODEL` را با مدل فعال حساب خود هماهنگ کنید. اگر پروژه از proxy یا provider دیگری استفاده می‌کند، base URL و نام مدل را از مستندات همان provider بگیرید.

## چک‌لیست امنیتی

فایل `.env`، کلیدهای Clerk و OpenAI، رمز PostgreSQL و connection string کامل را در commit، issue، screenshot یا log عمومی قرار ندهید. اگر کلیدی accidentally منتشر شد، آن را از داشبورد provider revoke و یک کلید جدید ایجاد کنید. در محیط deployment از secret manager پلتفرم استفاده کنید و مقدار `VITE_CLERK_PUBLISHABLE_KEY` را با `CLERK_SECRET_KEY` اشتباه نگیرید.
