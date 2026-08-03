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
