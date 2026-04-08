# Deployment — Render via GitHub

Single-click deploy to a free Render instance backed by your GitHub repo.

## What you get

- A public URL (`https://fynd-cro-doctor.onrender.com` or similar) hosting the landing page, analyzer, report viewer, and PDF export.
- Auto-deploy on every `git push` to `main`.
- 1 GB persistent disk mounted at `/app/reports/` so generated reports survive restarts and deploys.
- Free tier: 512 MB RAM / 0.1 CPU. Spins down after 15 min of inactivity (cold start ~30 s on next request).

## Why Render and not Vercel

This codebase uses Puppeteer + a 300 MB Chromium binary + filesystem storage. Vercel's serverless functions cap at 250 MB and have ephemeral filesystems — both knockouts. Render runs the same Next.js build inside a real long-running Linux container with a persistent disk, **zero code changes required**.

## Prerequisites (already verified)

- GitHub account ✓
- `gh` CLI installed and authenticated ✓
- Public repo (set during the create step below)

## One-time setup

### 1. Push the repo to GitHub

```bash
cd "/Users/vigneshasaithambi/Fynd Doctor/fynd-cro-doctor"

# Create a public repo and push in one go (uses the existing gh auth)
gh repo create fynd-cro-doctor --public --source=. --remote=origin --push
```

### 2. Connect Render to the repo

1. Open https://render.com/login → sign in with **GitHub**.
2. Click **New** → **Blueprint**.
3. Pick the `fynd-cro-doctor` repo from the list.
4. Render reads [`render.yaml`](../render.yaml) automatically and shows you the service + disk it will create.
5. Click **Apply**.

That's it. First build takes ~6–8 minutes (the Docker image is ~1.3 GB because of Chromium). Subsequent deploys are faster.

### 3. (Optional) Set the Anthropic key

The app runs end-to-end without `ANTHROPIC_API_KEY` using deterministic mocks, so you can demo the URL immediately. To enable real Claude analysis:

1. In the Render dashboard → your service → **Environment**.
2. Add `ANTHROPIC_API_KEY` = `sk-ant-...`.
3. Render auto-redeploys.

## What the Blueprint provisions

| Resource | Details |
|---|---|
| Web service | `runtime: docker`, plan: `free`, region: `oregon` |
| Persistent disk | 1 GB at `/app/reports`, named `cro-reports` |
| Auto env vars set | `NODE_ENV=production`, `CRAWL_CONCURRENCY=2`, `REPORT_TTL_HOURS=24`, `BASE_URL=<auto>` |
| Auto-deploy | On every `git push origin main` |
| Health check | `GET /` (the landing page returns 200) |

The Dockerfile uses a multi-stage build:

1. **deps** — `node:20-bookworm-slim` + Chromium system libs + `npm ci`
2. **builder** — `next build` against the deps cache
3. **runner** — Chromium libs + the built app + a `/app/reports` mount point

## Future deploys

```bash
git add .
git commit -m "your change"
git push origin main
# Render auto-deploys within ~30 s of receiving the push
```

## If you want to upgrade off the free tier

Edit `render.yaml`:

```yaml
plan: starter   # $7/mo, 512 MB RAM, no spin-down
# or
plan: standard  # $25/mo, 2 GB RAM, faster CPU
```

The free tier's 15-minute idle spin-down is the only meaningful constraint for an MVP. Crawls take 60–90 s so a cold start adds maybe 30 s on top — fine for demos, annoying for repeat visitors.

## Troubleshooting

- **Build fails with "out of memory"** → bump `plan` to `starter`. The free tier's 512 MB is tight for a Next + Chromium build.
- **First request after a long idle is slow** → that's the free-tier spin-down. Bump to `starter` to keep it warm 24/7.
- **Crawl runs but PDFs are blank** → verify `BASE_URL` env var resolves to the public service URL. Render normally injects `RENDER_EXTERNAL_URL` automatically; the PDF service falls through to it ([lib/services/pdf.ts](../lib/services/pdf.ts)).
- **Reports disappear after a deploy** → check that the disk is mounted at `/app/reports` in the Render dashboard → Disks tab. The `render.yaml` mounts it automatically; if you ever change the mount path, update [lib/utils/storage.ts](../lib/utils/storage.ts) `REPORTS_DIR`.

## Switching hosts later

The Dockerfile is portable. To move to Fly.io / Railway / a self-hosted box:

- **Fly.io**: `fly launch --copy-config --dockerfile Dockerfile`, add a 1 GB volume, deploy.
- **Railway**: connect the GitHub repo, Railway auto-detects the Dockerfile.
- **Self-hosted**: `docker build -t fynd-cro-doctor .` then `docker run -p 3000:3000 -v $(pwd)/reports:/app/reports fynd-cro-doctor`.

Same image, same env vars, same persistent volume — none of the platform-specific code lives in `lib/`.
