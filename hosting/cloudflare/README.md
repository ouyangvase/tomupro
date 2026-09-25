# Temporary Cloudflare restoration

On 25 September 2026, the user authorized restoring the existing production
frontend with Supabase temporarily while the Railway migration is completed.
Cloudflare Pages project: `tomupro` (`tomupro.pages.dev`).

The emergency release used the preserved September 24 Vercel production static
output, not a new application build. All 574 original files were copied without
changes. The source recovery commit is `f77f5fb`; its build is not claimed to be
byte-identical to the production artifact.

The deployment adds the three platform files in this directory:

- `_headers` preserves no-store caching for application entry routes.
- `_worker.js` preserves the existing SNIPERS delivered-orders proxy to Supabase,
  including method, query, body, and request headers.
- `_routes.json` invokes the worker only for that API endpoint. Static files and
  SPA routes use Pages directly. The production static sitemap is retained,
  matching Vercel's existing filesystem-first behavior.

For a future source deployment, build the intended frontend, copy these three
files into `dist`, then run:

```sh
npx wrangler pages deploy dist --project-name tomupro --branch main
```

Do not deploy a Supabase-configured build after the Railway data cutover without
explicitly deciding which backend is authoritative.

DNS before restoration (rollback reference):

| Name | Type | Content | TTL |
| --- | --- | --- | --- |
| `tomu.my` | A | `216.198.79.1` | 600 |
| `www.tomu.my` | CNAME | `81a861f1fa8d1211.vercel-dns-017.com` | 600 |

Both hostnames were connected to Pages using its custom-domain workflow, with
the replacement CNAME target `tomupro.pages.dev`. Vercel remains suspended for
an unpaid invoice; reverting DNS alone would restore the suspended response.

Verified on the preview: landing page renders, navigation menu responds, SPA
routes return HTML, static assets and sitemap respond, and the SNIPERS proxy
returns the expected 401 for an unauthenticated request. No order or payment was
created as part of verification.
