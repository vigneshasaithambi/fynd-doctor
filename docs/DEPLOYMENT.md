# Deployment — Fly.io via GitHub

The app deploys to **Fly.io** with a persistent volume for `reports/`. Free tier, no card required, no spin-down, real Linux VMs that run Puppeteer + Chromium without any code changes.

> **Why not Render?** Render dropped persistent disks from its free tier. We tried; the Blueprint apply errors with `services[0] disks are not supported for free tier services`. Fly's free tier still includes 3 GB of persistent volumes, so it's the only "truly free + persistent storage + Puppeteer-friendly" option without rewriting the storage layer to S3. See [docs/BUG_FIXES.md](BUG_FIXES.md) for the full story.

## What you get

- A public URL (`https://fynd-doctor.fly.dev`) hosting the landing page, analyzer, report viewer, and PDF export.
- 1 GB persistent volume mounted at `/app/reports` so generated reports survive deploys, restarts, and idle periods.
- Auto-deploy on every `git push` to `main` via GitHub Actions.
- 512 MB RAM machine that stays warm 24/7 — no cold-start tax.
- Free tier: 3 shared-cpu-1x machines / 3 GB volume / 160 GB outbound — fits this app comfortably.

## One-time setup

### 1. Install Fly CLI + log in

```bash
brew install flyctl
flyctl auth login          # Opens browser for OAuth
```

### 2. Launch the app (first manual deploy)

From the project root:

```bash
cd "/Users/vigneshasaithambi/Fynd Doctor/fynd-cro-doctor"

# Tells flyctl to read the existing fly.toml + Dockerfile.
# --no-deploy lets us create the volume before the first build runs.
flyctl launch --copy-config --no-deploy --name fynd-doctor

# Create the persistent volume in the same region as the app.
# (The region is set in fly.toml — defaults to iad / Virginia US-East.
#  Change with: flyctl regions add <region>)
flyctl volumes create cro_reports --size 1 --region iad

# Deploy
flyctl deploy
```

First build takes ~6–8 minutes (Chromium download is the bottleneck). Subsequent deploys are faster because the layers are cached.

### 3. (Optional) Set the Anthropic API key

The app runs end-to-end without Claude using deterministic mocks, so the demo URL works immediately. To enable real Claude analysis:

```bash
flyctl secrets set ANTHROPIC_API_KEY=sk-ant-...
```

Setting a secret triggers an auto-redeploy.

### 4. Wire up GitHub auto-deploy

```bash
# Generate a long-lived deploy token
flyctl tokens create deploy --expiry 8760h    # 1 year

# Paste the printed token into a GitHub secret. The repo already has the
# workflow file at .github/workflows/fly-deploy.yml — it'll fire on the
# next push.
gh secret set FLY_API_TOKEN --body "<paste token here>"
```

That's it. Now every `git push origin main` triggers a deploy via GitHub Actions.

## Verifying the deploy worked

```bash
flyctl status                          # Machine state
flyctl logs                            # Live logs (Ctrl+C to exit)
curl -I https://fynd-doctor.fly.dev/   # 200 OK = landing page is up

# Submit a real crawl
curl -X POST https://fynd-doctor.fly.dev/api/analyze \
  -H 'content-type: application/json' \
  -d '{"url":"https://www.example.com"}'

# Verify the volume contents persist across re-deploys
flyctl ssh console
ls /app/reports                        # See your generated reports
```

## What the Blueprint provisions

| Resource | Details |
|---|---|
| Web service | Docker, 512 MB RAM, 1 shared CPU, region `iad` (changeable in `fly.toml`) |
| Persistent volume | 1 GB mounted at `/app/reports` (free tier supports up to 3 GB) |
| Auto env vars | `NODE_ENV=production`, `CRAWL_CONCURRENCY=2`, `REPORT_TTL_HOURS=24`, `BASE_URL=<auto via FLY_APP_NAME>` |
| Auto-deploy | GitHub Actions on push to `main` |
| Health check | `GET /` (landing page returns 200) |
| Public URL | `https://fynd-doctor.fly.dev` |

The Dockerfile is unchanged from the previous Render setup — multi-stage build with Chromium system libs in stages 1 and 3, `next build` in stage 2.

## Future deploys

```bash
git add .
git commit -m "your change"
git push origin main
# GitHub Actions runs `flyctl deploy --remote-only` automatically
```

You can watch the deploy at `https://github.com/vigneshasaithambi/fynd-doctor/actions`.

## Scaling up later

Edit `fly.toml`:

```toml
[[vm]]
  size = "shared-cpu-2x"   # 2 CPUs, free tier
  memory = "1024mb"        # 1 GB, free tier ends at 3 × 256mb
```

Or for paid tiers:
- `performance-1x` ($35/mo, dedicated CPU) — required if crawls become slow under load
- More machines: `flyctl scale count 2` — gives you 2× the queue concurrency, no code changes
- Bigger volume: `flyctl volumes extend <id> --size 10`

## Troubleshooting

- **Build runs out of memory** → the build runs on Fly's hosted builders, not on the runtime machine, so this almost never happens. If it does, set `[build] strategy = "buildpacks"` in fly.toml or pre-build locally with `flyctl deploy --local-only`.
- **Machine OOMs at runtime** → bump `[[vm]] memory = "1024mb"` (still free).
- **PDF route renders blank pages** → the PDF service navigates back to `/report/<id>?print=1` over HTTP. It needs `BASE_URL` to resolve. The fallback chain in [lib/services/pdf.ts](../lib/services/pdf.ts) tries `BASE_URL` → `RENDER_EXTERNAL_URL` → `https://${FLY_APP_NAME}.fly.dev` → `localhost`. Fly auto-sets `FLY_APP_NAME` so this should just work.
- **Volume mount missing after deploy** → `flyctl volumes list` to confirm it exists and `mounts.destination` in `fly.toml` matches `/app/reports`.
- **GitHub Action fails with "FLY_API_TOKEN not set"** → re-run `flyctl tokens create deploy` and `gh secret set FLY_API_TOKEN`.

## Switching hosts later

The Dockerfile is portable. If you ever want to move:

- **Render (paid `starter`, $7/mo)** — has persistent disks; create a `render.yaml` with the same env vars and `disk` block. Render reads the same Dockerfile.
- **Railway** — connect the GitHub repo, Railway auto-detects the Dockerfile, attach a volume in the dashboard.
- **Self-hosted** — `docker build -t fynd-doctor . && docker run -d -p 3000:3000 -v /var/cro-reports:/app/reports fynd-doctor`.

Same image, same env vars, same persistent volume — none of the platform-specific code lives in `lib/`.
