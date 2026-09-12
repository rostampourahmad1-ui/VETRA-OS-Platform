# راهنمای استقرار (Deployment Guide) - VETRA OS Platform

**تاریخ:** ۲۰۲۶-۰۹-۱۲  
**نسخه:** 0.1.0  
**محیط هدف:** Production, Staging, Development

---

## 📚 فهرست

1. [پیش‌نیازها](#پیش‌نیازها)
2. [معماری Deployment](#معماری-deployment)
3. [متغیرهای محیطی](#متغیرهای-محیطی)
4. [راه‌اندازی Database](#راه‌اندازی-database)
5. [Build و Deploy](#build-و-deploy)
6. [Docker Deployment](#docker-deployment)
7. [Cloud Deployment](#cloud-deployment)
8. [Monitoring و Logging](#monitoring-و-logging)
9. [Backup و Recovery](#backup-و-recovery)
10. [Troubleshooting](#troubleshooting)

---

## پیش‌نیازها

### سرورها

| محیط | Specs | تعداد |
|---|---|---|
| **Production** | 4 vCPU, 16GB RAM, 200GB SSD | 2+ (API) + 1 (DB) |
| **Staging** | 2 vCPU, 8GB RAM, 100GB SSD | 1 (API+DB) |
| **Development** | Local machine | 1 |

### نرم‌افزارها

| نرم‌افزار | نسخه | الزامی |
|---|---|---|
| **Node.js** | 24.x LTS | ✅ |
| **pnpm** | 11+ | ✅ |
| **PostgreSQL** | 16+ | ✅ |
| **Redis** | 7+ (آینده) | 🟡 |
| **Nginx** | 1.24+ | ✅ |
| **Docker** | 24+ | 🟡 |
| **Docker Compose** | 2.20+ | 🟡 |

### سرویس‌های خارجی

- ✅ **Clerk:** Authentication (https://clerk.com)
- 🟡 **Object Storage:** AWS S3 یا Minio (برای file uploads)
- 🟡 **Email Service:** SMTP یا SendGrid/Mailgun
- 🟡 **Monitoring:** Sentry, DataDog, یا New Relic

---

## معماری Deployment

### Production Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Load Balancer                         │
│                     (Nginx / AWS ALB)                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         │                           │
┌────────▼────────┐         ┌────────▼────────┐
│   API Server 1  │         │   API Server 2  │
│   (Node.js)     │         │   (Node.js)     │
│   Port: 5000    │         │   Port: 5000    │
└────────┬────────┘         └────────┬────────┘
         │                           │
         └─────────────┬─────────────┘
                       │
              ┌────────▼────────┐
              │   PostgreSQL    │
              │   Primary DB    │
              │   Port: 5432    │
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │  Replica (RO)   │ (optional)
              └─────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      Static Assets                           │
│                   (Vite Build / CDN)                         │
└─────────────────────────────────────────────────────────────┘
```

### Staging Architecture

```
┌──────────────────────┐
│    Nginx Reverse     │
│       Proxy          │
└──────────┬───────────┘
           │
┌──────────▼───────────┐
│    API Server        │
│    (Node.js)         │
│    Port: 5000        │
└──────────┬───────────┘
           │
┌──────────▼───────────┐
│    PostgreSQL        │
│    Port: 5432        │
└──────────────────────┘
```

---

## متغیرهای محیطی

### Production `.env`

```bash
# ============================================================================
# VETRA OS Platform - Production Environment
# ============================================================================
# SECURITY WARNING: این فایل را NEVER COMMIT نکنید!
# ============================================================================

# ─── Node Environment ───────────────────────────────────────────────────────
NODE_ENV=production
PORT=5000

# ─── Database ───────────────────────────────────────────────────────────────
# Application connection (non-owner role)
DATABASE_APP_URL=postgresql://vetra_app:SECURE_PASSWORD@db.prod.internal:5432/vetra_prod

# Migration connection (owner role with DDL privileges)
DATABASE_MIGRATION_URL=postgresql://vetra_owner:SECURE_PASSWORD@db.prod.internal:5432/vetra_prod

# Pool settings
DATABASE_POOL_MIN=10
DATABASE_POOL_MAX=50
DATABASE_CONNECTION_TIMEOUT=30000

# ─── Authentication (Clerk) ─────────────────────────────────────────────────
CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsuZXhhbXBsZS5jb20k
CLERK_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
CLERK_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ─── File Storage ───────────────────────────────────────────────────────────
# AWS S3
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AWS_REGION=eu-central-1
AWS_S3_BUCKET=vetra-prod-uploads

# یا MinIO (self-hosted)
MINIO_ENDPOINT=https://minio.prod.internal
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=vetra-uploads

# ─── CORS ───────────────────────────────────────────────────────────────────
CORS_ORIGIN=https://vetra.example.com,https://app.vetra.example.com
CORS_CREDENTIALS=true

# ─── Security ───────────────────────────────────────────────────────────────
# Session secret (برای cookie signing)
SESSION_SECRET=RANDOM_64_CHAR_STRING_HERE_CHANGE_THIS_IN_PRODUCTION

# Rate limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# ─── Logging ────────────────────────────────────────────────────────────────
LOG_LEVEL=info
LOG_FORMAT=json
SENTRY_DSN=https://xxxxxx@sentry.io/xxxxxx

# ─── Monitoring ─────────────────────────────────────────────────────────────
ENABLE_METRICS=true
METRICS_PORT=9090

# ─── Email (optional) ───────────────────────────────────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=noreply@vetra.example.com
SMTP_PASS=xxxxxxxxxxxxxxxx

# یا SendGrid
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ─── AI (optional) ──────────────────────────────────────────────────────────
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OLLAMA_BASE_URL=http://ollama.internal:11434

# ─── Frontend Build ─────────────────────────────────────────────────────────
VITE_API_BASE_URL=https://api.vetra.example.com
VITE_CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsuZXhhbXBsZS5jb20k
```

### Staging `.env`

```bash
NODE_ENV=staging
PORT=5000

DATABASE_APP_URL=postgresql://vetra_app:password@localhost:5432/vetra_staging
DATABASE_MIGRATION_URL=postgresql://vetra_owner:password@localhost:5432/vetra_staging

CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
CLERK_SECRET_KEY=sk_test_xxxxx

CORS_ORIGIN=https://staging.vetra.example.com

LOG_LEVEL=debug
SENTRY_DSN=https://xxxxxx@sentry.io/staging
```

### Development `.env`

```bash
NODE_ENV=development
PORT=5000

DATABASE_APP_URL=postgresql://vetra_app:dev@localhost:5432/vetra_dev
DATABASE_MIGRATION_URL=postgresql://vetra_owner:dev@localhost:5432/vetra_dev

CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
CLERK_SECRET_KEY=sk_test_xxxxx

CORS_ORIGIN=http://localhost:5173

LOG_LEVEL=debug
```

---

## راه‌اندازی Database

### 1. نصب PostgreSQL

#### Ubuntu/Debian:
```bash
# Add PostgreSQL repository
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget -qO- https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo tee /etc/apt/trusted.gpg.d/pgdg.asc

# Install PostgreSQL 16
sudo apt update
sudo apt install postgresql-16 postgresql-contrib-16

# Start service
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### Docker:
```bash
docker run -d \
  --name vetra-postgres \
  -e POSTGRES_DB=vetra_prod \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=secure_password \
  -p 5432:5432 \
  -v pgdata:/var/lib/postgresql/data \
  postgres:16-alpine
```

### 2. ایجاد Database و Roles

```bash
# اتصال به PostgreSQL
sudo -u postgres psql

# در psql:
```

```sql
-- Create database
CREATE DATABASE vetra_prod;

-- Create roles (از infra/db/init/01-roles.sql)
CREATE ROLE vetra_owner WITH LOGIN PASSWORD 'SECURE_PASSWORD';
CREATE ROLE vetra_app WITH LOGIN PASSWORD 'SECURE_PASSWORD';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE vetra_prod TO vetra_owner;
ALTER DATABASE vetra_prod OWNER TO vetra_owner;

-- vetra_app needs connect + usage
GRANT CONNECT ON DATABASE vetra_prod TO vetra_app;

-- Switch to database
\c vetra_prod

-- Grant schema permissions
GRANT USAGE ON SCHEMA public TO vetra_app;
```

### 3. اجرای Migrations

```bash
# Clone repository
git clone https://github.com/your-org/vetra-os-platform.git
cd vetra-os-platform

# Install dependencies
pnpm install --frozen-lockfile

# Set migration URL
export DATABASE_MIGRATION_URL="postgresql://vetra_owner:PASSWORD@localhost:5432/vetra_prod"

# Run migrations (به ترتیب)
psql -v ON_ERROR_STOP=1 \
     "$DATABASE_MIGRATION_URL" \
     -f lib/db/drizzle/0001_initial_schema.sql

psql -v ON_ERROR_STOP=1 \
     "$DATABASE_MIGRATION_URL" \
     -f lib/db/drizzle/0002_rls_policies.sql

# ... تا migration 0023

# یا استفاده از migration script:
pnpm run db:migrate
```

### 4. تأیید Setup

```sql
-- بررسی tables
\dt

-- بررسی RLS policies
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public';

-- تست tenant isolation
SET LOCAL app.current_organization_id = 1;
SELECT * FROM projects LIMIT 5;
```

---

## Build و Deploy

### 1. Build Project

```bash
# Clone repository
git clone https://github.com/your-org/vetra-os-platform.git
cd vetra-os-platform

# Install dependencies
pnpm install --frozen-lockfile

# Build all packages
pnpm run build

# Output:
# - artifacts/api-server/dist/
# - artifacts/vetra/dist/
# - lib/*/dist/
```

### 2. Deploy API Server

```bash
# Copy built files to server
rsync -avz --exclude node_modules \
      ./ user@api.vetra.example.com:/opt/vetra/

# On server:
cd /opt/vetra

# Install production dependencies only
pnpm install --prod --frozen-lockfile

# Start with PM2
pm2 start artifacts/api-server/dist/index.js \
    --name vetra-api \
    --instances max \
    --exec-mode cluster \
    --env production

# Save PM2 configuration
pm2 save
pm2 startup
```

### 3. Deploy Frontend

```bash
# Build frontend
pnpm --filter vetra run build

# Output: artifacts/vetra/dist/

# Deploy to CDN/Static hosting
aws s3 sync artifacts/vetra/dist/ s3://vetra-frontend-prod/

# یا به Nginx static directory:
rsync -avz artifacts/vetra/dist/ \
      user@web.vetra.example.com:/var/www/vetra/
```

---

## Docker Deployment

### Dockerfile - API Server

```dockerfile
# artifacts/api-server/Dockerfile
FROM node:24-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib ./lib
COPY artifacts/api-server ./artifacts/api-server

# Install dependencies
RUN pnpm install --frozen-lockfile --prod

# Build
RUN pnpm --filter @workspace/api-server run build

# Production image
FROM node:24-alpine

WORKDIR /app

COPY --from=base /app/artifacts/api-server/dist ./dist
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./

EXPOSE 5000

CMD ["node", "dist/index.js"]
```

### Dockerfile - Frontend

```dockerfile
# artifacts/vetra/Dockerfile
FROM node:24-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib ./lib
COPY artifacts/vetra ./artifacts/vetra

RUN pnpm install --frozen-lockfile
RUN pnpm --filter vetra run build

# Nginx serve
FROM nginx:alpine

COPY --from=builder /app/artifacts/vetra/dist /usr/share/nginx/html
COPY artifacts/vetra/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### docker-compose.yml

```yaml
version: '3.9'

services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: vetra_prod
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./infra/db/init:/docker-entrypoint-initdb.d
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  api:
    build:
      context: .
      dockerfile: artifacts/api-server/Dockerfile
    environment:
      NODE_ENV: production
      DATABASE_APP_URL: postgresql://vetra_app:${DB_PASSWORD}@db:5432/vetra_prod
      CLERK_SECRET_KEY: ${CLERK_SECRET_KEY}
    ports:
      - "5000:5000"
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  frontend:
    build:
      context: .
      dockerfile: artifacts/vetra/Dockerfile
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./ssl:/etc/nginx/ssl:ro
    restart: unless-stopped

volumes:
  pgdata:
```

### اجرا با Docker Compose

```bash
# Set environment variables
cp .env.example .env
nano .env

# Build and start
docker-compose up -d

# View logs
docker-compose logs -f api

# Stop
docker-compose down
```

---

## Cloud Deployment

### AWS (EC2 + RDS)

#### 1. راه‌اندازی RDS PostgreSQL

```bash
# از AWS Console:
# - RDS → Create Database
# - Engine: PostgreSQL 16
# - Instance: db.t3.medium (production) یا db.t3.small (staging)
# - Storage: 100GB SSD
# - Multi-AZ: Yes (production)
# - Security Group: allow port 5432 از API servers
```

#### 2. راه‌اندازی EC2 Instances

```bash
# Launch 2x EC2 instances:
# - AMI: Ubuntu 24.04 LTS
# - Instance type: t3.medium
# - Security Group: allow 22 (SSH), 5000 (API)

# On each instance:
sudo apt update
sudo apt install -y nodejs npm postgresql-client

# Install pnpm
sudo corepack enable
sudo corepack prepare pnpm@latest --activate

# Deploy code (از بالا)
```

#### 3. Application Load Balancer

```bash
# از AWS Console:
# - EC2 → Load Balancers → Create ALB
# - Listeners: HTTP:80, HTTPS:443
# - Target Group: API instances on port 5000
# - Health Check: /api/healthz
# - SSL Certificate: از ACM
```

#### 4. S3 برای Static Assets

```bash
# Create S3 bucket
aws s3 mb s3://vetra-frontend-prod

# Enable static website hosting
aws s3 website s3://vetra-frontend-prod \
    --index-document index.html \
    --error-document index.html

# Deploy frontend
aws s3 sync artifacts/vetra/dist/ s3://vetra-frontend-prod/ \
    --delete --cache-control max-age=31536000
```

### DigitalOcean

```bash
# Droplets:
# - 2x API servers (4GB RAM, 2 vCPU)
# - 1x Database Managed PostgreSQL

# Load Balancer:
# - Create from Networking section
# - Forward HTTP/HTTPS to API droplets

# Spaces (S3-compatible):
# - Create Space for uploads
# - Use AWS SDK با DigitalOcean endpoints
```

---

## Monitoring و Logging

### PM2 Monitoring

```bash
# Start with monitoring
pm2 start ecosystem.config.js

# Monitor
pm2 monit

# Logs
pm2 logs vetra-api

# Metrics
pm2 web
```

### ecosystem.config.js

```javascript
module.exports = {
  apps: [{
    name: 'vetra-api',
    script: './artifacts/api-server/dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: '/var/log/vetra/error.log',
    out_file: '/var/log/vetra/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_memory_restart: '1G'
  }]
};
```

### Sentry Integration

```typescript
// artifacts/api-server/src/index.ts
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});

// Error handler
app.use(Sentry.Handlers.errorHandler());
```

### Prometheus Metrics

```typescript
// artifacts/api-server/src/lib/metrics.ts
import client from 'prom-client';

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
});

// Endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});
```

---

## Backup و Recovery

### Database Backup

```bash
#!/bin/bash
# scripts/backup-database.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/backups/postgres"
DB_NAME="vetra_prod"

# Create backup
pg_dump -Fc \
  -h db.prod.internal \
  -U vetra_owner \
  -d $DB_NAME \
  -f "$BACKUP_DIR/vetra_${DATE}.dump"

# Compress
gzip "$BACKUP_DIR/vetra_${DATE}.dump"

# Upload to S3
aws s3 cp "$BACKUP_DIR/vetra_${DATE}.dump.gz" \
  s3://vetra-backups/database/

# Cleanup old backups (keep last 30 days)
find $BACKUP_DIR -name "*.gz" -mtime +30 -delete
```

### Automated Backups (Cron)

```bash
# crontab -e
# Daily backup at 2 AM
0 2 * * * /opt/scripts/backup-database.sh >> /var/log/vetra/backup.log 2>&1
```

### Restore از Backup

```bash
# Download از S3
aws s3 cp s3://vetra-backups/database/vetra_20260912_020000.dump.gz ./

# Decompress
gunzip vetra_20260912_020000.dump.gz

# Restore
pg_restore -Fc \
  -h db.prod.internal \
  -U vetra_owner \
  -d vetra_prod \
  -c \
  vetra_20260912_020000.dump
```

---

## Troubleshooting

### API Server نمی‌آید بالا

```bash
# Check logs
pm2 logs vetra-api

# Check port
sudo netstat -tulpn | grep 5000

# Check environment
pm2 env vetra-api

# Restart
pm2 restart vetra-api
```

### Database Connection Issues

```bash
# Test connection
psql "$DATABASE_APP_URL" -c "SELECT 1;"

# Check PostgreSQL status
sudo systemctl status postgresql

# Check connections
SELECT count(*) FROM pg_stat_activity;

# Check RLS policies
SELECT * FROM pg_policies WHERE schemaname = 'public';
```

### High Memory Usage

```bash
# Check process
pm2 monit

# Increase max memory restart
pm2 delete vetra-api
pm2 start ecosystem.config.js --max-memory-restart 2G
```

### Slow Queries

```sql
-- Enable query logging
ALTER SYSTEM SET log_min_duration_statement = 1000; -- 1 second
SELECT pg_reload_conf();

-- View slow queries
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

---

## Checklist قبل از Production

### امنیت
- [ ] تمام secrets در environment variables هستند (نه hardcoded)
- [ ] HTTPS با SSL certificate معتبر
- [ ] CORS به درستی تنظیم شده
- [ ] Rate limiting فعال است
- [ ] Security headers تنظیم شده (helmet)
- [ ] Database backups automated است

### Performance
- [ ] Database indexes بهینه هستند
- [ ] Connection pooling تنظیم شده
- [ ] CDN برای static assets
- [ ] Gzip compression فعال
- [ ] Load testing انجام شده

### Monitoring
- [ ] Error tracking (Sentry)
- [ ] Application metrics (Prometheus)
- [ ] Log aggregation (ELK/CloudWatch)
- [ ] Uptime monitoring (UptimeRobot)
- [ ] Alert notifications تنظیم شده

### Documentation
- [ ] API documentation به‌روز است
- [ ] Runbooks برای حوادث
- [ ] Deployment procedures مستند شده
- [ ] Recovery procedures تست شده

---

**نسخه:** 0.1.0  
**آخرین به‌روزرسانی:** ۱۴۰۵/۰۶/۲۱ (۲۰۲۶-۰۹-۱۲)
