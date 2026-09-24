# Production landing page source recovery

Recovered on 25 September 2026 from the local `tomupro-mulerun-deploy`
checkout. That directory retained source even though its Git worktree pointer
was broken. This restores the redesigned "AI Logistics Platform & Last-Mile
Delivery" page to a branch based on `origin/main` at
`1907a94a7efb8d794c1a0f1ad26342416443af08`.

## Recovered files

- `src/pages/LandingPage.tsx`
- All five components in `src/components/landing/`
- Landing page styles in `src/index.css`
- Images and videos in `public/landing/`

All 40 files in those paths were SHA-256 compared with the surviving checkout;
there were no differences. Existing identical assets are already tracked in Git.
The September 24 prebuilt deployment (`dpl_3hVXZpoENveVYMAMXtSPC7eJSfBZ`)
changed the order-template example while preserving the existing landing build.
This is source recovery, not a deployment or a Railway migration.

## Building

Install dependencies with `npm ci`, configure the existing frontend Supabase
environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and
`VITE_SUPABASE_PROJECT_ID`), then run `npm run build`.
The recovered source passed the production build. No credentials or generated
build output are included in this recovery commit.

The page retains its original authentication dependencies. The Railway migration
must adapt those to the migrated backend. The mobile hero video also retains
its original external CloudFront URL, defined by `MOBILE_HERO_MOTION_URL` in
`LandingPage.tsx`; that external video is not backed up by this commit.

Browser visual verification was unavailable because the browser connection
timed out during recovery.
