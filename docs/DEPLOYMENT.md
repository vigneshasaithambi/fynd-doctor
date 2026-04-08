# Deployment — Render free + Cloudflare R2

The app deploys to **Render's free tier** for the web service and uses **Cloudflare R2** for persistent object storage. Both are free, neither requires a credit card. Total monthly cost: **$0**.

## Why this combination

| Need | Render free | Cloudflare R2 |
|---|---|---|
| Linux container that can run Puppeteer + Chromium | ✅ | — |
| Auto-deploy from GitHub | ✅ | — |
| Persistent storage that survives spin-down + redeploys | ❌ (no disks on free tier) | ✅ (10 GB free, no card) |
| Free-tier permanence | ✅ | ✅ |

Render runs the app, R2 stores the reports. The storage backend is selected at runtime via `STORAGE_BACKEND=r2`. Locally for dev/tests, the backend defaults to `local` (filesystem) so nothing changes about your dev loop.

## Trade-off vs paid hosting

The Render free web service spins down after **15 minutes of inactivity**. The first request after spin-down has a ~30 second cold start while the container restarts. Generated reports stored in R2 are unaffected — they're still there. Only the response time for the very first visitor after idle is impacted.

If that's not acceptable, bump `plan: free` → `plan: starter` ($7/mo) in [`render.yaml`](../render.yaml). No other changes needed.

---

## One-time setup

### Step 1 — Create a Cloudflare R2 bucket (free, no card)

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) and **sign up** (or log in). Sign-up does not require a credit card.
2. In the left sidebar, click **R2 Object Storage**.
3. If this is your first time, click **Purchase R2 Plan** — despite the wording, the **Free plan** option is in the list and stays at $0 indefinitely. Select it.
4. Click **Create bucket**. Pick a name (e.g. `fynd-doctor-reports`), location: **Automatic**. Click **Create bucket**.
5. Open the bucket → **Settings** → copy the **Account ID** (top right of the R2 dashboard, or under R2 → Overview).

### Step 2 — Create R2 API credentials

1. R2 sidebar → **Manage R2 API Tokens** → **Create API Token**.
2. Token name: `fynd-doctor-render`
3. Permissions: **Object Read & Write**
4. Bucket: pick the bucket from Step 1
5. TTL: **Forever** (or set an expiry if you want)
6. Click **Create API Token**

Cloudflare shows the credentials **once**. Copy these four values into a note:

- **Access Key ID** (looks like `abc123...`)
- **Secret Access Key** (looks like `def456...`)
- **Account ID** (from Step 1 — the dashboard URL has it too: `dash.cloudflare.com/<ACCOUNT_ID>/r2`)
- **Bucket name** (the name you picked in Step 1)

### Step 3 — Connect Render to the GitHub repo

1. Go to [render.com](https://render.com) → **Sign in with GitHub** (the same account that owns the `fynd-doctor` repo).
2. Click **New** → **Blueprint**.
3. Pick `vigneshasaithambi/fynd-doctor` from the list.
4. Render reads [`render.yaml`](../render.yaml) and shows: 1 web service. Click **Apply**.

The first build takes ~6–8 minutes (Chromium download is the bottleneck).

### Step 4 — Paste R2 credentials into Render

1. While the build runs, open the new service in the Render dashboard → **Environment** tab.
2. You'll see entries marked "sync: false" — these need values:

| Variable | Value |
|---|---|
| `R2_ACCOUNT_ID` | The Account ID from Cloudflare |
| `R2_BUCKET` | The bucket name |
| `R2_ACCESS_KEY_ID` | The Access Key ID |
| `R2_SECRET_ACCESS_KEY` | The Secret Access Key |
| `BASE_URL` | Leave blank — `lib/services/pdf.ts` falls through to `RENDER_EXTERNAL_URL` automatically |

3. Click **Save Changes**. Render auto-redeploys.

### Step 5 — (Optional) Enable real Claude analysis

In the same Environment tab, add `ANTHROPIC_API_KEY=sk-ant-...`. Without this the app uses deterministic mock findings — fine for demos.

---

## Verifying the deploy

Once Render shows **Live**, open the public URL:

```
https://fynd-doctor.onrender.com
```

(Render assigns a `<service>.onrender.com` URL based on the service name. The exact URL is shown at the top of the service page.)

```bash
# Smoke test
curl -I https://fynd-doctor.onrender.com/

# Submit a real crawl
curl -X POST https://fynd-doctor.onrender.com/api/analyze \
  -H 'content-type: application/json' \
  -d '{"url":"https://www.example.com"}'

# Check the R2 bucket — you should see reports/<id>/status.json appear
```

In the Cloudflare dashboard → R2 → your bucket, you'll see `reports/<id>/` folders being created in real time as crawls run.

---

## Future deploys

```bash
git add .
git commit -m "your change"
git push origin main
# Render auto-deploys within ~30 s of receiving the push
```

The Blueprint Render set up watches the `main` branch and rebuilds on every push.

---

## What the Blueprint provisions

| Resource | Details |
|---|---|
| Web service | Docker, plan `free`, region `oregon` |
| Storage | Cloudflare R2 bucket (NOT a Render disk — R2 lives outside Render) |
| Auto env vars set | `NODE_ENV=production`, `STORAGE_BACKEND=r2`, `CRAWL_CONCURRENCY=2`, `REPORT_TTL_HOURS=24` |
| Manual env vars (Render dashboard) | `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, optional `ANTHROPIC_API_KEY` |
| Auto-deploy | On every `git push origin main` |
| Health check | `GET /` (landing page returns 200) |

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Build fails with "out of memory" | Bump `plan: free` → `plan: starter` ($7/mo, 512 MB RAM more) |
| First request is slow (~30 s) | That's the free-tier spin-down. Bump to `starter` to keep warm. |
| Crawl finishes but report 404s | Check `STORAGE_BACKEND=r2` is set + R2 credentials are pasted. The app's startup logs print `[storage] backend=r2` if R2 is wired correctly. |
| `[storage:r2] missing env var R2_BUCKET` in logs | You forgot one of the 4 R2 vars in the Render dashboard. Re-check Environment tab. |
| PDFs render blank | Verify `BASE_URL` env var is unset (so `RENDER_EXTERNAL_URL` takes over). Render auto-injects that. |
| R2 bucket fills up | The TTL cleanup loop sweeps reports older than `REPORT_TTL_HOURS` (default 24). Lower if you're constrained, raise if you want longer history. |
| Permission denied on R2 PutObject | Your API token has read-only perms. Re-create with **Object Read & Write**. |

---

## Switching hosts later

The R2 backend is portable — `STORAGE_BACKEND=r2` works on any host that runs Docker. If you ever want to move:

- **Fly.io free + R2**: copy the same env vars into a `fly.toml`, deploy. Fly's free tier requires a card on file but has no spin-down and offers persistent volumes if you'd rather use those instead of R2.
- **Self-hosted**: set the env vars and run `docker run` against the Dockerfile. Flip `STORAGE_BACKEND=local` if you'd rather use a host-mounted volume.
- **Paid Render**: bump `plan: starter` and (optionally) flip back to `STORAGE_BACKEND=local` with a real disk attached. R2 still works either way.

The storage layer is the only piece that knows about backends — everything else in the codebase is backend-agnostic.
