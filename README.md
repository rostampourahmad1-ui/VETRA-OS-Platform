# VETRA OS — سیستم عامل مدیریت پروژه‌های ساختمانی

> **Construction ERP + Project Controls Platform + Construction Intelligence Platform**

VETRA OS یک پلتفرم حرفه‌ای، ماژولار و فارسی‌محور برای مدیریت جامع پروژه‌های ساختمانی و پیمانکاری است. این سیستم با رویکرد **AI-Ready** و **Multi-Tenant** طراحی شده و تمامی فرآیندهای پروژه را از برنامه‌ریزی تا اجرا و کنترل هزینه پوشش می‌دهد.

---

## فهرست

- [معرفی](#معرفی)
- [ویژگی‌های اصلی](#ویژگی‌های-اصلی)
- [معماری](#معماری)
- [تکنولوژی‌ها](#تکنولوژی‌ها)
- [شروع سریع](#شروع-سریع)
- [ساختار پروژه](#ساختار-پروژه)
- [ماژول‌ها](#ماژول‌ها)
- [وضعیت توسعه](#وضعیت-توسعه)
- [مشارکت](#مشارکت)

---

## معرفی

VETRA OS توسط **شرکت آکوپارک آرا** برای مدیریت یکپارچه پروژه‌های ساختمانی توسعه می‌یابد. دامنه‌های فعالیت:

- پیمانکاری و ساختمان‌سازی
- معماری و معماری داخلی
- مدیریت و کنترل پروژه
- ERP ساختمانی

**وبسایت‌ها:** [apairan.com](https://apairan.com) · [Akopark-co.ir](https://Akopark-co.ir) · [Vetragroup.ir](https://Vetragroup.ir)

---

## ویژگی‌های اصلی

- **چندمستأجری (Multi-Tenancy):** جداسازی کامل داده‌های سازمان‌ها با RLS
- **کنترل دسترسی (RBAC):** سطوح دسترسی ADMIN, MANAGER, ENGINEER, VIEWER و...
- **فارسی‌محور:** تقویم شمسی (Jalali)، RTL، UI کاملاً فارسی
- **امنیت چندلایه:** Authentication → Tenant Isolation → RBAC → Resource Ownership → Input Validation → Audit
- **AI-Ready:** قابلیت تعویض provider (OpenAI, Ollama) با معماری RAG
- **Audit Trail:** ثبت تمام رویدادهای مهم سیستمی
- **ماژولار:** معماری مبتنی بر workspace با قابلیت توسعه مستقل ماژول‌ها

---

## معماری

```
┌─────────────────────────────────────────────────────────────┐
│                    VETRA OS Platform                         │
│                                                             │
│  ┌─────────────────────┐    ┌───────────────────────────┐   │
│  │   Frontend (Vite)   │    │   API Server (Express 5)  │   │
│  │   React + Tailwind  │◄──►│   Clerk Auth + Drizzle    │   │
│  │   RTL / Persian     │    │   Multer Files            │   │
│  └─────────────────────┘    └──────────┬────────────────┘   │
│                                        │                    │
│                               ┌────────▼────────┐           │
│                               │   PostgreSQL     │           │
│                               │   + RLS Policies │           │
│                               └─────────────────┘           │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Shared Packages: api-zod, db, api-client-react      │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## تکنولوژی‌ها

| لایه | تکنولوژی |
|---|---|
| **زبان** | TypeScript (نسخه ۵.۹) |
| **مدیریت پکیج** | pnpm (Monorepo) |
| **فرانت‌اند** | React ۱۹ + Vite ۷ + Tailwind CSS ۴ |
| **کامپوننت‌ها** | Radix UI + shadcn/ui |
| **فرم‌ها** | React Hook Form + Zod |
| **کوئری (فرانت)** | TanStack React Query |
| **بک‌اند** | Express ۵ |
| **احراز هویت** | Clerk |
| **دیتابیس** | PostgreSQL ۱۶ |
| **ORM** | Drizzle ORM |
| **تست** | Vitest + Supertest |
| **CI/CD** | GitHub Actions |
| **کدگذاری کاراکتر** | UTF-8 |

---

## شروع سریع

### پیش‌نیازها

- [Node.js](https://nodejs.org) ≥ ۲۴
- [pnpm](https://pnpm.io) ≥ ۱۱
- [PostgreSQL](https://postgresql.org) ≥ ۱۶
- یک پروژه [Clerk](https://clerk.com) با کلیدهای API

### نصب و راه‌اندازی

```bash
# ۱. کلون کردن مخزن
git clone https://github.com/rostampourahmad1-ui/VETRA-OS-Platform.git
cd VETRA-OS-Platform

# ۲. نصب وابستگی‌ها
pnpm install

# ۳. تنظیم متغیرهای محیطی
cp .env.example .env
# .env را ویرایش کنید: Clerk keys، Database URL، و ...

# ۴. اجرای migration‌های دیتابیس
psql "$DATABASE_URL" -f infra/db/init/01-roles.sql
for migration in lib/db/drizzle/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"
done

# ۵. اجرای سرور توسعه
pnpm -F @workspace/api-server dev    # API Server
pnpm -F @workspace/vetra dev         # Frontend
```

### اسکریپت‌های اصلی

| فرمان | توضیح |
|---|---|
| `pnpm install` | نصب وابستگی‌ها |
| `pnpm typecheck` | بررسی نوع TypeScript در همه workspaceها |
| `pnpm lint` | اجرای linter |
| `pnpm build` | build پروژه |
| `pnpm test` | اجرای همه تست‌ها |
| `pnpm validate:final` | اعتبارسنجی نهایی |

---

## ساختار پروژه

```
VETRA-OS-Platform/
├── artifacts/
│   ├── api-server/        # سرور API (Express 5)
│   └── vetra/             # فرانت‌اند (React + Vite)
├── lib/
│   ├── api-client-react/  # کلاینت React برای API
│   ├── api-spec/          # مشخصات OpenAPI
│   ├── api-zod/           # Validation schemas با Zod
│   └── db/                # Schema و Migration دیتابیس
├── tests/
│   ├── security/          # تست‌های امنیتی
│   └── integration/       # تست‌های یکپارچه
├── infra/
│   └── db/                # اسکریپت‌های زیرساخت دیتابیس
├── docs/                  # مستندات
├── scripts/               # اسکریپت‌های کاربردی
└── .github/workflows/     # CI/CD
```

---

## ماژول‌ها

### ماژول‌های پیاده‌سازی‌شده

| ماژول | وضعیت | توضیح |
|---|---|---|
| **مدیریت پروژه** | ✅ کامل | پروژه‌ها، WBS، فعالیت‌ها |
| **برنامه‌ریزی و گانت** | ✅ کامل | Scheduling، Gantt، Baseline، پیشرفت |
| **منابع و وظایف** | ✅ کامل | تخصیص منابع، تسک‌ها |
| **قراردادها و BOQ** | ✅ کامل | مدیریت قراردادها، صورت‌وضعیت کمّی |
| **تدارکات** | ✅ کامل | خرید، تأمین‌کنندگان، مواد |
| **HR و حضوروغیاب** | ✅ کامل | پرسنل، حضوروغیاب |
| **کیفیت (NCR)** | ✅ کامل | چرخه حیات عدم انطباق‌ها |
| **فرم‌ها و گردش کار** | ✅ کامل | فرم‌ساز، گردش کار تأیید |
| **اسناد** | ✅ کامل | آپلود، دانلود امن، مدیریت فایل |
| **AI Assistant** | ⚡ MVP | معماری تعویض‌پذیر (OpenAI/Ollama) |
| **داشبورد** | ✅ کامل | گزارش‌ها، KPIها |
| **دیده‌بانی (Audit)** | ✅ کامل | Audit trail، RLS |
| **انبار** | 🔄 در حال توسعه | موجودی، ورود/خروج |
| **CRM** | ✅ کامل | مدیریت ارتباط با مشتری |
| **تجهیزات** | ✅ کامل | مدیریت تجهیزات و ماشین‌آلات |

### ماژول‌های آینده

- **صورت‌وضعیت مالی (Payment/Settlement)**
- **انبار پیشرفته (Warehouse)**
- **داشبورد تحلیلی (Analytics)**
- **نسخه موبایل (Expo/React Native)**
- **گزارش‌گیری PDF/Excel**

---

## وضعیت توسعه

`VETRA OS` در مرحله **MVP / Prototype** قرار دارد و فعالانه در حال توسعه است. وضعیت فعلی:

- ✅ **Backend Routes:** ۳۰ مسیر API فعال
- ✅ **Database Migrations:** ۱۳ migration
- ✅ **Database Tables:** ۲۵ جدول با tenant isolation
- ✅ **Tests:** ۲۵ فایل تست (unit + integration + security)
- ✅ **CI/CD:** GitHub Actions با ۳ job
- ✅ **TypeScript:** typecheck کاملاً پاس می‌شود
- ✅ **Build:** هر دو artifact (API + Frontend) ساخته می‌شوند

---

## امنیت

VETRA OS بر اساس **Security by Design** ساخته شده است:

1. **احراز هویت (Authentication):** Clerk با webhook provisioning
2. **جداسازی مستأجر (Tenant Isolation):** RLS در PostgreSQL + middleware سطح API
3. **کنترل دسترسی (RBAC):** مجوزهای صریح در هر endpoint
4. **مالکیت منابع:** بررسی ownership قبل از هر عملیات
5. **اعتبارسنجی ورودی:** Zod schema
6. **ثبت رویدادها (Audit):** تمام mutationها ثبت می‌شوند
7. **امنیت فایل:** اعتبارسنجی نوع، حجم، مسیر امن

---

## مشارکت

۱. مخزن را Fork کنید
۲. یک branch جدید ایجاد کنید: `git checkout -b feat/my-feature`
۳. تغییرات خود را commit کنید
۴. به branch خود push کنید
۵. یک Pull Request باز کنید

لطفاً قبل از提交 تغییرات، مطمئن شوید:
- `pnpm typecheck` پاس می‌شود
- `pnpm build` پاس می‌شود
- تست‌های امنیتی جدید برای ویژگی‌های حساس نوشته شده است
- مستندات OpenAPI برای endpointهای جدید به‌روز شده است

---

## مجوز

این پروژه تحت لیسانس **MIT** منتشر می‌شود.

---

توسعه داده شده توسط **شرکت آکوپارک آرا** 🏗️
