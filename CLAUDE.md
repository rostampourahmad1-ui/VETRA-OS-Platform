# VETRA OS Platform - Claude Code Guidelines

## معماری و پشته فنی
- **بک‌اند:** Node.js, Express, Drizzle ORM, PostgreSQL (RLS / Multi-tenancy)
- **احراز هویت:** Clerk Auth + RBAC سازمانی
- **فرانت‌اند:** React / Next.js, Radix UI, Tailwind CSS, کاملاً فارسی و RTL
- **ارتباط کلاینت-سرور:** OpenAPI + Orval (تولید تایپ‌ها و کلاینت‌ها)

## دستورات متداول
- اجرای محیط توسعه: `pnpm dev`
- اجرای مایگریشن‌ها: `pnpm drizzle-kit push` یا `pnpm drizzle-kit generate`
- تست‌ها: `pnpm test`
- بیلد کلاینت OpenAPI: `pnpm orval`

## اصول و خط قرمزهای کدنویسی
1. **Multi-tenancy & Security:** تمام کوئری‌ها و روت‌ها باید شناسه مستأجر (`companyId`/`tenantId`) را لحاظ کنند. امنیت بر پایه RLS الزامی است.
2. **UI & UX (RTL):** تمام متون رابط کاربری فارسی بوده و جهات و کامپوننت‌های Radix باید در مود RTL بدون شکستگی باشند.
3. **مرحله 07 (حذف Mock):** از ایجاد دیتای ساختگی (Mock) جدید خودداری کرده و کامپوننت‌های ماک را به کلاینت‌های تولیدی Orval متصل کنید.
