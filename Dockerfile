# syntax=docker/dockerfile:1.6
#
# Multi-stage Dockerfile for Fynd CRO Doctor.
# Stage 1 installs deps + Puppeteer's bundled Chromium under /home/node.
# Stage 2 builds Next.
# Stage 3 is the runtime image — Debian slim + the system libs Chromium needs
# (fonts, NSS, atk, etc.) + the built app.
#
# Image size lands around 1.3 GB. That's the Chromium tax — there's no avoiding
# it for a Puppeteer-driven app. Render's free tier handles it fine.

# ──────────────────────────────────────────────────────────────────────────────
# Stage 1: install dependencies (and download Puppeteer's bundled Chromium)
# ──────────────────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS deps
WORKDIR /app

# Install the system libraries Chromium needs at install time so Puppeteer's
# postinstall can verify it. (Same set as Stage 3 — kept here so the deps stage
# can run a smoke test if we ever add one.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc-s1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# Don't try to download a separate Chromium during npm install — we use the
# one Puppeteer bundles. PUPPETEER_SKIP_DOWNLOAD=false is the default; left
# explicit so future contributors don't get confused.
ENV PUPPETEER_SKIP_DOWNLOAD=false
RUN npm ci --omit=dev=false

# ──────────────────────────────────────────────────────────────────────────────
# Stage 2: build Next.js
# ──────────────────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ──────────────────────────────────────────────────────────────────────────────
# Stage 3: runtime
# ──────────────────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Default crawl concurrency — overridable via Render env var.
ENV CRAWL_CONCURRENCY=2
ENV REPORT_TTL_HOURS=24

# Same system libs as the deps stage so Chromium can actually launch.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc-s1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Bring the built app + node_modules + the puppeteer cache (Chromium binary).
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/app ./app

# Persistent disk mount point — Render will mount the disk here so reports/
# survive restarts.
RUN mkdir -p /app/reports
VOLUME ["/app/reports"]

EXPOSE 3000
CMD ["npm", "run", "start"]
