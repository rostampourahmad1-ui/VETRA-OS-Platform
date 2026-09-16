# Local Development Runbook - VETRA OS Platform

**Purpose:** Guide for running VETRA OS locally for development and testing.

---

## � prerequisites

| Tool | Version | Installation |
|---|---|---|
| **Node.js** | 20.x LTS | `nvm use 20` or `fnm install 20` |
| **pnpm** | 9+ | `corepack enable && corepack prepare pnpm@9 --activate` |
| **Docker** | 24+ | [docker.com](https://www.docker.com) |
| **Docker Compose** | 2.20+ | Included with Docker Desktop |
| **PostgreSQL client** | psql | `pnpm exec drizzle-kit generate` or `apt install postgresql-client` |
| **OpenAI API key** (optional) | sk-... | For AI features |

---

## 🐳 Local Development with Docker Compose

Start the full stack (PostgreSQL, pgBouncer, API Server, and Test Runner):

```bash
# 1. Copy environment variables
cp .env.example .env

# 2. Replace placeholder values in .env
#    - POSTGRES_ADMIN_PASSWORD
#    - POSTGRES_APP_PASSWORD
#    - CLERK_SECRET_KEY
#    - CLERK_PUBLISHABLE_KEY
#    - CLERK_WEBHOOK_SECRET
#    - OPENAI_API_KEY

# 3. Start the infrastructure
docker-compose up -d

# 3. Wait for PostgreSQL to be healthy
#    Check: docker-compose logs -f postgres | grep -i "ready"

# 4. Run database migrations
pnpm db:migrate

# 5. Run RLS integration tests (requires DATABASE_TEST_APP_URL)
DATABASE_TEST_APP_URL="postgresql://vetra_app:CHANGE_ME_APP_PASSWORD@localhost:5432/vetra_dev" pnpm exec vitest run tests/security/rls-integration.test.ts

# 6. Start the development server
#    Option A: Directly with pnpm
pnpm --filter @workspace/api-server dev

#    Option B: Via Docker (api-server service)
docker-compose up -d api-server
#    API will be available at http://localhost:5000
```

---

## 🔧 Development Without Docker (Native)

Run the stack natively on your machine (requires PostgreSQL installed):

```bash
# 1. Ensure PostgreSQL is running
sudo systemctl start postgresql  # Linux
# or
pg_ctlcluster 16 main start      # Debian/Ubuntu
# or open pgAdmin and start the server

# 2. Create the database and roles
createdb vetra_dev

# 3. Create application role (non-owner, RLS-enforced)
psql -c "CREATE ROLE vetra_app WITH LOGIN PASSWORD 'dev_password';"
psql -c "GRANT CONNECT ON DATABASE vetra_dev TO vetra_app;"
psql -c "GRANT USAGE ON SCHEMA public TO vetra_app;"

# 4. Create migration role (DDL-capable)
psql -c "CREATE ROLE vetra_migration WITH LOGIN PASSWORD 'dev_password';"
psql -c "GRANT ALL PRIVILEGES ON DATABASE vetra_dev TO vetra_migration;"

# 5. Run migrations
DATABASE_MIGRATION_URL="postgresql://vetra_migration:dev_password@localhost:5432/vetra_dev" pnpm db:migrate

# 6. Set up RLS policies
#    Apply SQL from lib/db/drizzle/*.sql in order

# 7. Start the API server
DATABASE_URL="postgresql://vetra_app:dev_password@localhost:5432/vetra_dev"
DATABASE_APP_URL="postgresql://vetra_app:dev_password@localhost:5432/vetra_dev"
CLERK_SECRET_KEY="sk_test_dev_key"
CLERK_PUBLISHABLE_KEY="pk_test_dev_key"
VITE_CLERK_PUBLISHABLE_KEY="pk_test_dev_key"
pnpm --filter @workspace/api-server dev
```

---

## 🛠️ Common Development Commands

| Action | Command |
|---|---|
| Install dependencies | `pnpm install --frozen-lockfile` |
| Run lint | `pnpm lint` |
| Run typecheck | `pnpm typecheck` |
| Run tests | `pnpm test` |
| Run specific test file | `pnpm exec vitest run tests/security/rls-integration.test.ts` |
| Run final validation | `pnpm validate:final` |
| Build all packages | `pnpm build` |
| Generate DB schema | `pnpm exec drizzle-kit generate` |
| OpenAPI codegen | `pnpm --filter @workspace/api-spec run codegen` |
| Start API server (dev) | `pnpm --filter @workspace/api-server dev` |
| Start web app | `pnpm dev` (from root or `pnpm --filter vetra dev`) |

---

## 🔍 Health Verification

After starting the API server, verify it's running correctly:

```bash
# Check health endpoint
curl http://localhost:5000/health

# Expected response: {"status":"ok"} or similar 200 JSON

# Check API is responding
curl -s http://localhost:5000/api/healthz

# Check PostgreSQL connection
pg_isready -U vetra_admin -d vetra_dev

# Check Pgbouncer connection (port 6432)
pg_isready -h localhost -p 6432 -U vetra_app -d vetra_dev
```

---

## 🛑 Stopping Local Development

```bash
# Stop Docker Compose services
docker-compose down

# Or stop native PostgreSQL
sudo systemctl stop postgresql  # Linux
# or
pg_ctlcluster 16 main stop       # Debian/Ubuntu
```

---

## 📦 Development Workflow

1. **Create a branch**: `git checkout -b feature/your-feature`
2. **Make changes**: Implement the feature following the mandatory engineering chain
3. **Run validation**: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
4. **Commit**: `git commit -m "feat(domain): describe the change"`
5. **Push**: `git push origin feature/your-feature`
6. **Create PR**: Against `main` branch
7. **Wait for CI**: All GitHub Actions must pass
8. **Review**: Code review and security review
9. **Merge**: Once all checks pass

---

## 🐛 Troubleshooting

| Issue | Solution |
|---|---|
| `docker-compose up` fails on postgres | Check `POSTGRES_ADMIN_PASSWORD` is set in `.env` |
| API server won't start | Verify `DATABASE_URL` and Clerk credentials in `.env` |
| Typecheck errors | Run `pnpm typecheck` to see specific errors |
| Tests fail | Check `DATABASE_TEST_APP_URL` is set for RLS integration tests |
| Port 5000 already in use | Kill process on port 5000 or change `PORT` in `.env` |
| `git diff --check` fails | Fix whitespace issues or use `git diff --check --ignore-space-change` |
| OpenAI API errors | Set `OPENAI_API_KEY` in `.env` or disable AI features |

---

## 🔄 Database Migration Workflow

```bash
# 1. Create a new migration
pnpm exec drizzle-kit generate --schema="./lib/db/src/schema/*.ts"

# 2. Review the generated migration SQL
#    - Check lib/db/drizzle/ for new .sql file
#    - Verify no data loss or unintended schema changes

# 3. Apply migration to local DB
DATABASE_MIGRATION_URL="postgresql://vetra_migration:PASSWORD@localhost:5432/vetra_dev" pnpm db:migrate

# 4. Run tests to verify
DATABASE_TEST_APP_URL="postgresql://vetra_app:PASSWORD@localhost:5432/vetra_dev" pnpm exec vitest run tests/security/rls-integration.test.ts

# 5. Commit the migration
git add lib/db/drizzle/xxxx_xx_xx_xxxxxx.sql
git commit -m "migration: add new feature XYZ"
```

---

## 📊 Environment Parity Notes

- **Docker Compose** provides the most accurate local dev parity (postgres, pgbouncer, api-server all in containers)
- **Native development** requires manual setup of PostgreSQL, roles, and permissions
- **DATABASE_URL** vs **DATABASE_APP_URL**: Use `DATABASE_URL` for migration operations, `DATABASE_APP_URL` for application runtime
- **Pgbouncer** (port 6432) is recommended for connection pooling in production-like setups
- All environment variables from `.env.example` should be set (even if placeholder) for consistency

---

## 🔐 Security Notes for Local Dev

- Never commit `.env` with real values
- Clerk test keys (`sk_test*`, `pk_test*`) are acceptable for local dev
- OpenAI key is optional; set `OPENAI_API_KEY=sk-dummy-local` or leave unset
- Database passwords in `.env` should always be `CHANGE_ME_*` placeholders
- Use `DATABASE_TEST_APP_URL` only for test environments, never for production
- Run RLS integration tests with a non-owner role to verify tenant isolation
- File uploads should use MIME validation and safe generated filenames
- All uploaded files are untrusted input - enforce extension/MIME validation
<tool_call>