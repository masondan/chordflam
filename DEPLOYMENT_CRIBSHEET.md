# ChordFlam Cloudflare Pages Deployment Cribsheet

## Prerequisites
- Cloudflare account with flamtools.com domain already configured
- Git repo pushed to GitHub (or GitLab/Gitea)
- Wrangler CLI installed (`npm install -g wrangler`)

---

## Step 1: Build & Test Locally
```bash
npm run build
npm run preview
```
Visit `http://localhost:4173` — verify the app works offline and IndexedDB persists data.

---

## Step 2: Connect GitHub to Cloudflare Pages
1. Go to **Cloudflare Dashboard** → **Pages**
2. Click **Create a project** → **Connect to Git**
3. Authorize GitHub, select your `chordflam` repo
4. Click **Begin setup**

---

## Step 3: Configure Build Settings
- **Project name:** `chordflam` (or leave as repo name)
- **Production branch:** `main` (or your default)
- **Build command:** `npm run build`
- **Build output directory:** `.svelte-kit/cloudflare`
- **Root directory:** `/` (leave blank unless monorepo)
- **Environment variables:** (none needed for v1)
- Click **Save and Deploy**

Cloudflare will auto-deploy to `chordflam.pages.dev` — wait for the build to complete.

---

## Step 4: Add Custom Domain (chordflam.flamtools.com)
1. In **Pages** project settings, go to **Custom domains**
2. Click **Set up a custom domain** button
3. Enter `chordflam.flamtools.com` (subdomain auto-configured if flamtools.com is on Cloudflare)
4. Cloudflare validates DNS — should auto-activate if already on Cloudflare
5. Verify DNS shows CNAME pointing to `chordflam.pages.dev`

---

## Step 5: Verify Deployment
- Visit `https://chordflam.flamtools.com`
- Test offline mode (DevTools → Network → Offline)
- Check IndexedDB in DevTools → Application → IndexedDB
- Confirm service worker is registered (DevTools → Application → Service Workers)

---

## Step 6: Future Deployments
Push to `main` branch — Cloudflare auto-rebuilds and deploys. No manual steps needed.

---

## Troubleshooting
| Issue | Fix |
|-------|-----|
| Build fails | Check `npm run build` locally first; review Cloudflare build logs |
| Domain not resolving | Verify DNS CNAME in Cloudflare DNS settings; wait 5–10 min for propagation |
| Service worker not caching | Check `src/service-worker.ts` is present; rebuild and hard-refresh (Cmd+Shift+R) |
| IndexedDB empty on deploy | Normal — IndexedDB is per-origin; users' data persists after first use |
