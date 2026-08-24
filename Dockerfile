FROM node:22-bookworm-slim

WORKDIR /app

# فعال‌سازی pnpm از طریق Corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

# ابتدا فایل‌های مربوط به نصب وابستگی‌ها
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/*/package.json ./artifacts/
COPY scripts/package.json ./scripts/

# نصب وابستگی‌ها
RUN pnpm install --frozen-lockfile

# سپس کل سورس پروژه
COPY . .

# اجرای تست‌ها به‌صورت پیش‌فرض
CMD ["pnpm", "test"]
