# راهنمای API - VETRA OS Platform

**نسخه:** 0.1.0  
**تاریخ:** ۲۰۲۶-۰۹-۱۲  
**Base URL:** `/api`

---

## 📚 فهرست

1. [معرفی](#معرفی)
2. [احراز هویت](#احراز-هویت)
3. [معماری امنیتی](#معماری-امنیتی)
4. [Endpoints](#endpoints)
5. [Error Handling](#error-handling)
6. [Rate Limiting](#rate-limiting)
7. [نمونه کدها](#نمونه-کدها)

---

## معرفی

VETRA OS Platform API یک RESTful API است که تمام عملیات سیستم ERP ساختمانی را فراهم می‌کند.

### ویژگی‌های کلیدی

- ✅ **RESTful Design:** verb-based endpoints با HTTP methods استاندارد
- ✅ **Type-Safe:** OpenAPI 3.1 spec با Zod validation
- ✅ **Multi-Tenant:** جداسازی کامل داده‌های سازمان‌ها
- ✅ **RBAC:** کنترل دسترسی مبتنی بر نقش
- ✅ **Audit Trail:** ثبت تمام عملیات مهم
- ✅ **Real-time:** WebSocket notifications برای رویدادها

### OpenAPI Specification

مستندات کامل API در فرمت OpenAPI 3.1:
- **مسیر:** [`lib/api-spec/openapi.yaml`](../../lib/api-spec/openapi.yaml)
- **حجم:** ۳,۳۰۵ خط
- **تعداد Endpoints:** ۳۰+ route

### مشاهده مستندات تعاملی

برای مشاهده Swagger UI:

```bash
# نصب swagger-ui-express
pnpm add swagger-ui-express --filter @workspace/api-server

# راه‌اندازی API server
pnpm --filter @workspace/api-server run dev

# باز کردن در browser
open http://localhost:5000/api-docs
```

---

## احراز هویت

### Clerk Authentication

VETRA از [Clerk](https://clerk.com) برای authentication استفاده می‌کند.

#### 1. دریافت Token

**Frontend (React):**
```typescript
import { useAuth } from '@clerk/clerk-react';

function MyComponent() {
  const { getToken } = useAuth();
  
  const fetchData = async () => {
    const token = await getToken();
    const response = await fetch('/api/projects', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  };
}
```

**Backend/CLI:**
```bash
# دریافت token از Clerk Dashboard
TOKEN="your-clerk-jwt-token"

curl -H "Authorization: Bearer $TOKEN" \
     https://api.vetra.example.com/api/projects
```

#### 2. Organization Context

هر request باید شامل organization context باشد:

```typescript
// Clerk session باید شامل orgId باشد
const { userId, orgId } = getAuth(req);

// بدون orgId، request رد می‌شود
if (!orgId) {
  return res.status(403).json({ 
    error: "Forbidden: no organization assigned" 
  });
}
```

---

## معماری امنیتی

### زنجیره امنیتی (Security Chain)

هر protected endpoint از این زنجیره عبور می‌کند:

```
┌─────────────────┐
│ 1. requireAuth  │  ← Clerk JWT verification
└────────┬────────┘
         │
┌────────▼────────┐
│ 2. attachTenant │  ← Resolve organizationId + RLS context
└────────┬────────┘
         │
┌────────▼────────┐
│ 3. requirePerm  │  ← RBAC permission check
└────────┬────────┘
         │
┌────────▼────────┐
│ 4. ownership    │  ← Resource ownership verification
└────────┬────────┘
         │
┌────────▼────────┐
│ 5. validation   │  ← Zod schema validation
└────────┬────────┘
         │
┌────────▼────────┐
│ 6. business     │  ← Business logic execution
└────────┬────────┘
         │
┌────────▼────────┐
│ 7. audit        │  ← Audit trail logging
└─────────────────┘
```

### Multi-Tenant Isolation

**PostgreSQL Row-Level Security (RLS):**

```sql
-- تمام جداول protected دارای RLS policy هستند
CREATE POLICY tenant_isolation ON projects
  USING (organization_id = current_setting('app.current_organization_id')::int);

-- هر request با SET LOCAL به tenant خود محدود می‌شود
SET LOCAL app.current_organization_id = 123;
```

**Request-Scoped Context:**
- هر request یک database connection اختصاصی دارد
- RLS context در transaction تنظیم می‌شود
- Commit یا Rollback خودکار در پایان request

---

## Endpoints

### Health Check

#### `GET /api/healthz`

بررسی سلامت سرویس.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-09-12T10:30:00Z",
  "version": "0.1.0"
}
```

---

### Dashboard

#### `GET /api/dashboard/summary`

خلاصه dashboard اجرایی با KPIها.

**Authentication:** ✅ Required  
**Permission:** `dashboard:read`

**Response:**
```json
{
  "totalProjects": 15,
  "activeProjects": 8,
  "totalBudget": 50000000000,
  "spentBudget": 32000000000,
  "progressPercentage": 64,
  "overdueTasksCount": 5
}
```

#### `GET /api/dashboard/project-health`

وضعیت سلامت پروژه‌ها.

**Response:**
```json
[
  {
    "projectId": 1,
    "projectName": "برج آزادی",
    "status": "on_track",
    "scheduleHealth": "green",
    "budgetHealth": "yellow",
    "qualityHealth": "green",
    "riskLevel": "medium"
  }
]
```

---

### Projects

#### `GET /api/projects`

لیست تمام پروژه‌ها.

**Authentication:** ✅ Required  
**Permission:** `projects:read`

**Query Parameters:**
- `status` (optional): فیلتر بر اساس وضعیت (`active`, `completed`, `on_hold`)
- `search` (optional): جستجو در نام و توضیحات

**Response:**
```json
[
  {
    "id": 1,
    "name": "برج آزادی",
    "description": "پروژه برج ۲۰ طبقه مسکونی",
    "status": "active",
    "startDate": "2026-01-01",
    "endDate": "2026-12-31",
    "budget": 10000000000,
    "progress": 45,
    "organizationId": 1,
    "createdAt": "2026-01-01T08:00:00Z",
    "updatedAt": "2026-09-12T10:00:00Z"
  }
]
```

#### `POST /api/projects`

ایجاد پروژه جدید.

**Authentication:** ✅ Required  
**Permission:** `projects:create`

**Request Body:**
```json
{
  "name": "برج میلاد",
  "description": "پروژه برج ۳۰ طبقه تجاری",
  "startDate": "2026-10-01",
  "endDate": "2027-10-01",
  "budget": 15000000000,
  "location": "تهران، سعادت‌آباد",
  "type": "commercial"
}
```

**Response:** `201 Created`
```json
{
  "id": 2,
  "name": "برج میلاد",
  "status": "planning",
  ...
}
```

#### `GET /api/projects/:id`

جزئیات یک پروژه.

**Authentication:** ✅ Required  
**Permission:** `projects:read`  
**Resource Check:** Must be project member or have org-wide access

**Response:**
```json
{
  "id": 1,
  "name": "برج آزادی",
  "description": "...",
  "status": "active",
  "members": [
    {
      "userId": 10,
      "userName": "علی احمدی",
      "role": "project_manager"
    }
  ],
  "milestones": [...],
  "budget": {...},
  "schedule": {...}
}
```

#### `PATCH /api/projects/:id`

به‌روزرسانی پروژه.

**Authentication:** ✅ Required  
**Permission:** `projects:update`

**Request Body:**
```json
{
  "status": "on_hold",
  "progress": 50
}
```

#### `DELETE /api/projects/:id`

حذف پروژه (soft delete).

**Authentication:** ✅ Required  
**Permission:** `projects:delete`

**Response:** `204 No Content`

---

### Daily Reports

#### `GET /api/daily-reports`

لیست گزارش‌های روزانه.

**Query Parameters:**
- `projectId` (required): شناسه پروژه
- `startDate` (optional): تاریخ شروع
- `endDate` (optional): تاریخ پایان

#### `POST /api/daily-reports`

ثبت گزارش روزانه.

**Request Body:**
```json
{
  "projectId": 1,
  "reportDate": "2026-09-12",
  "weather": "آفتابی",
  "temperature": 28,
  "workDescription": "بتن‌ریزی طبقه ۵",
  "workforce": [
    {
      "jobTitle": "کارگر ساده",
      "count": 15,
      "hoursWorked": 8
    }
  ],
  "equipment": [
    {
      "equipmentId": 5,
      "hoursUsed": 6,
      "status": "operational"
    }
  ],
  "materials": [
    {
      "materialName": "بتن C30",
      "quantityUsed": 50,
      "unit": "m³"
    }
  ],
  "issues": "تأخیر در تحویل میلگرد",
  "photos": [...]
}
```

---

### Contracts

#### `GET /api/contracts`

لیست قراردادها.

#### `POST /api/contracts`

ثبت قرارداد جدید.

**Request Body:**
```json
{
  "projectId": 1,
  "contractorName": "شرکت پیمانکاری آرا",
  "contractNumber": "C-2026-001",
  "contractDate": "2026-01-15",
  "startDate": "2026-02-01",
  "endDate": "2026-12-31",
  "amount": 5000000000,
  "type": "main_contract",
  "description": "قرارداد اصلی اجرای پروژه"
}
```

---

### Procurement

#### `GET /api/procurement/orders`

لیست سفارش‌های خرید.

#### `POST /api/procurement/rfq`

ثبت درخواست قیمت (RFQ).

**Request Body:**
```json
{
  "projectId": 1,
  "rfqNumber": "RFQ-2026-045",
  "items": [
    {
      "description": "میلگرد ۱۶ آجدار",
      "quantity": 1000,
      "unit": "kg"
    }
  ],
  "vendors": [
    {
      "vendorId": 10,
      "vendorName": "تأمین کنندگان فولاد"
    }
  ],
  "deadline": "2026-09-20"
}
```

---

### Quality (NCR)

#### `GET /api/quality/ncrs`

لیست گزارش‌های عدم انطباق.

#### `POST /api/quality/ncrs`

ثبت NCR جدید.

**Request Body:**
```json
{
  "projectId": 1,
  "ncrNumber": "NCR-2026-012",
  "title": "عدم انطباق ابعاد ستون",
  "description": "ابعاد ستون محور A-3 با نقشه مطابقت ندارد",
  "severity": "major",
  "detectedBy": 15,
  "detectedDate": "2026-09-10",
  "location": "طبقه ۳، محور A-3",
  "photos": [...]
}
```

---

### Equipment

#### `GET /api/equipment`

لیست تجهیزات.

#### `POST /api/equipment`

ثبت تجهیزات جدید.

---

### Documents

#### `POST /api/documents/upload`

آپلود فایل.

**Content-Type:** `multipart/form-data`

**Form Fields:**
- `file`: فایل (max 10MB)
- `projectId`: شناسه پروژه
- `category`: دسته‌بندی (`drawing`, `specification`, `report`, `contract`)
- `description`: توضیحات

**Response:**
```json
{
  "id": 123,
  "fileName": "plan-floor-5.pdf",
  "fileSize": 2048576,
  "mimeType": "application/pdf",
  "url": "/uploads/documents/123/plan-floor-5.pdf",
  "uploadedAt": "2026-09-12T11:00:00Z"
}
```

---

## Error Handling

### Error Response Format

```json
{
  "error": "Resource not found",
  "code": "NOT_FOUND",
  "details": {
    "resource": "project",
    "id": 999
  }
}
```

### HTTP Status Codes

| کد | معنی | کاربرد |
|---|---|---|
| `200` | OK | موفقیت‌آمیز |
| `201` | Created | resource جدید ایجاد شد |
| `204` | No Content | عملیات موفق بدون محتوای پاسخ |
| `400` | Bad Request | validation error |
| `401` | Unauthorized | authentication نشده |
| `403` | Forbidden | permission ندارد |
| `404` | Not Found | resource پیدا نشد |
| `409` | Conflict | تضاد (مثلاً duplicate) |
| `422` | Unprocessable Entity | business logic error |
| `429` | Too Many Requests | rate limit |
| `500` | Internal Server Error | خطای سرور |

### Error Codes

| کد | توضیحات |
|---|---|
| `UNAUTHORIZED` | Authentication required |
| `FORBIDDEN` | Permission denied |
| `NOT_FOUND` | Resource not found |
| `VALIDATION_ERROR` | Input validation failed |
| `DUPLICATE` | Resource already exists |
| `TENANT_ISOLATION_VIOLATED` | Cross-tenant access attempt |
| `INTERNAL_ERROR` | Server error |

---

## Rate Limiting

### محدودیت‌های کلی

| Endpoint Category | Limit | Window |
|---|---|---|
| **General API** | 100 requests | 15 minutes |
| **Authentication** | 5 requests | 15 minutes |
| **File Upload** | 10 requests | 1 hour |
| **Reporting** | 20 requests | 5 minutes |

### Response Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1694512800
```

### 429 Response

```json
{
  "error": "Too many requests, please try again later.",
  "retryAfter": 900
}
```

---

## نمونه کدها

### TypeScript/React (با Generated Client)

```typescript
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@workspace/api-client-react';

// Fetch projects
function ProjectsList() {
  const { data, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.listProjects({ status: 'active' })
  });

  if (isLoading) return <div>در حال بارگذاری...</div>;
  
  return (
    <ul>
      {data?.map(project => (
        <li key={project.id}>{project.name}</li>
      ))}
    </ul>
  );
}

// Create project
function CreateProject() {
  const mutation = useMutation({
    mutationFn: api.createProject,
    onSuccess: () => {
      console.log('پروژه ایجاد شد');
    }
  });

  const handleSubmit = (formData) => {
    mutation.mutate({
      name: formData.name,
      description: formData.description,
      startDate: formData.startDate,
      endDate: formData.endDate,
      budget: formData.budget
    });
  };

  return <form onSubmit={handleSubmit}>...</form>;
}
```

### cURL Examples

```bash
# List projects
curl -H "Authorization: Bearer $TOKEN" \
     https://api.vetra.example.com/api/projects

# Create project
curl -X POST \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "برج میلاد",
       "description": "پروژه جدید",
       "startDate": "2026-10-01",
       "endDate": "2027-10-01",
       "budget": 15000000000
     }' \
     https://api.vetra.example.com/api/projects

# Upload document
curl -X POST \
     -H "Authorization: Bearer $TOKEN" \
     -F "file=@plan.pdf" \
     -F "projectId=1" \
     -F "category=drawing" \
     https://api.vetra.example.com/api/documents/upload
```

---

## Webhooks (آینده)

در نسخه‌های بعدی، webhook support اضافه خواهد شد:

```json
{
  "event": "project.updated",
  "timestamp": "2026-09-12T12:00:00Z",
  "data": {
    "projectId": 1,
    "changes": {
      "status": "completed"
    }
  }
}
```

---

## مستندات بیشتر

- **OpenAPI Spec:** [`lib/api-spec/openapi.yaml`](../../lib/api-spec/openapi.yaml)
- **Database Schema:** [`lib/db/src/schema/`](../../lib/db/src/schema/)
- **Security ADR:** [`docs/adr-request-scoped-rls.md`](./adr-request-scoped-rls.md)
- **Development Guide:** [`DEVELOPMENT.md`](../../DEVELOPMENT.md)

---

**نسخه:** 0.1.0  
**آخرین به‌روزرسانی:** ۱۴۰۵/۰۶/۲۱ (۲۰۲۶-۰۹-۱۲)
