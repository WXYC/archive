# WXYC Archive

A web application for browsing archived WXYC 89.3 FM broadcast recordings. Built with Next.js and deployed to Cloudflare Workers via [OpenNext](https://opennext.js.org/cloudflare).

## Local Development

```bash
cp .env.example .env    # fill in values as needed
npm install
npm run dev              # http://localhost:3000
```

### Environment Variables

Copy `.env.example` to `.env` and fill in the values:

| Variable | Description |
|----------|-------------|
| `AWS_ACCESS_KEY_ID` | AWS credentials for S3 archive access |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials for S3 archive access |
| `BETTER_AUTH_URL` | Server-side auth proxy destination (used by `next.config.ts` rewrites) |
| `NEXT_PUBLIC_BETTER_AUTH_URL` | Client-side auth URL (same-origin `/auth` proxy used automatically when origins differ) |
| `BETTER_AUTH_JWKS_URL` | JWKS endpoint for JWT verification |
| `NEXT_PUBLIC_QR_LOGIN_ENABLED` | Gates QR (RFC 8628 device-authorization) sign-in. Defaults to off; `"true"` or `"1"` enables it. Must be enabled on dj.wxyc.org too — that is where approval happens. Also needs listing in `deploy.yml`'s build `env:` block, or it never reaches the bundle |
| `BACKEND_URL` | Backend-Service origin serving `GET /flowsheet/range`, the daily playlist's data source. Defaults to `https://api.wxyc.org`, so set it only to point at a staging Backend |
| `LIBRARY_METADATA_URL` | library-metadata-lookup origin used for artwork/metadata enrichment |
| `LML_API_KEY` | Bearer token for library-metadata-lookup (LML returns 401 without it and artwork lookups silently come back empty) |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog analytics key (optional) |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog host (optional) |

## Testing

```bash
npm test                 # unit tests (Vitest)
npm run test:watch       # unit tests in watch mode
npm run test:e2e         # end-to-end tests (Playwright)
```

## Deployment

Deployment is handled by the GitHub Actions workflow in `.github/workflows/deploy.yml`.

### How it works

- **Pull requests** run `test` (type check + unit tests) and `build-and-deploy` (OpenNext build) to verify everything works.
- **Pushes to `main`** additionally deploy the built output to Cloudflare Workers via Wrangler.

### Required GitHub configuration

**Repository secrets** (Settings > Secrets and variables > Actions > Secrets):

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |

**Repository variables** (Settings > Secrets and variables > Actions > Variables):

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_BETTER_AUTH_URL` | Public auth URL (baked into client bundle) |
| `BETTER_AUTH_URL` | Server-side auth URL |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog project API key |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog ingest host |

### Runtime secrets

These are set directly on the Cloudflare Worker (via `wrangler secret put` or the dashboard), not in GitHub:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `BETTER_AUTH_JWKS_URL`
- `BETTER_AUTH_ISSUER`
- `BETTER_AUTH_AUDIENCE`
