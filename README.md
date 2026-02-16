# WXYC Archive

A Next.js app for browsing and streaming archived WXYC recordings. Deployed to Cloudflare Workers via [OpenNext](https://opennext.js.org/cloudflare).

## Local Development

```bash
cp .env.example .env    # fill in values as needed
npm install
npm run dev              # http://localhost:3000
```

## Testing

```bash
npm test                 # unit tests (Vitest)
npm run test:watch       # unit tests in watch mode
npm run test:e2e         # end-to-end tests (Playwright)
```

## Deployment

Deployment is handled by the GitHub Actions workflow in `.github/workflows/deploy.yml`.

### How it works

- **Pull requests** run the `build` job to verify the OpenNext/Cloudflare Workers build succeeds.
- **Pushes to `main`** run `build`, then `deploy` which uses Wrangler to deploy the built output to Cloudflare Workers.

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
