# WXYC Archive

A Next.js app for browsing and streaming archived WXYC recordings. Users pick a date and hour, and the app generates a presigned S3 URL for the corresponding MP3 file. Authenticated DJs get access to 90 days of archives; unauthenticated users get 14 days.

Deployed to Cloudflare Workers via [OpenNext](https://opennext.js.org/cloudflare).

## Tech Stack

- **Framework**: Next.js 16 (App Router, React 19)
- **Runtime**: Cloudflare Workers via `@opennextjs/cloudflare`
- **UI**: Tailwind CSS 4, Radix UI primitives, shadcn/ui (New York style), Lucide icons
- **Auth**: `@wxyc/shared/auth-client` (better-auth), `jose` for server-side JWT verification
- **Storage**: AWS S3 (presigned URLs via `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`)
- **Analytics**: PostHog (client + server SDKs, proxied through Next.js rewrites)
- **Testing**: Vitest + React Testing Library + happy-dom (unit), Playwright (e2e)
- **Linting**: ESLint (next/core-web-vitals + next/typescript), Husky pre-commit (lint-staged) + pre-push (full lint)

## Project Structure

```
app/
  layout.tsx          # Root layout: providers (Theme, Auth, PostHog)
  page.tsx            # Main archive player page ("use client")
  globals.css         # Tailwind + CSS custom properties
  auth/
    [...path]/
      route.ts        # Auth proxy: forwards /auth/* requests to upstream auth server
  api/
    daily-playlist/   # GET route: fetches full day's entries from Backend /flowsheet/range, groups by show
    signed-url/       # POST route: validates date range, returns presigned S3 URL
components/
  audio-player.tsx    # Playback controls, seek, volume, skip, download, share, preloading
  login-dialog.tsx    # DJ sign-in dialog (emailed code by default, password or QR on request)
  qr-sign-in.tsx      # QR device-authorization stage: renders the code, polls for approval
  share-dialog.tsx    # Shareable timestamped URL generator
  PostHogProvider.tsx # Client-side PostHog init + pageview tracking
  PostHogAuthSync.tsx # Syncs auth state to PostHog
  theme-provider.tsx  # next-themes wrapper
  theme-toggle.tsx    # Light/dark/system toggle
  ui/                 # shadcn/ui primitives (button, calendar, card, dialog, etc.)
  __tests__/          # Component tests
config/
  archive.ts          # ArchiveConfig type, date range configs (default: 14d, dj: 90d)
lib/
  auth.tsx            # AuthProvider + useAuth hook (wraps @wxyc/shared/auth-client)
  hooks/
    use-daily-playlist.ts  # Fetches daily playlist, lazy artwork enrichment
  jwt-utils.ts        # Server-side JWT verification via jose JWKS
  otp.ts              # Email one-time-code contracts spoken directly to better-auth
  device-auth.ts      # RFC 8628 QR sign-in: device code request + token polling
  flags.ts            # Build-time feature flags (isQrLoginEnabled)
  types/
    playlist.ts       # Backend /flowsheet/range wire types + mapping into the app's display shapes
  utils.ts            # cn(), formatDate(), formatTime(), getHourLabel(), getArchiveUrl(), createTimestamp()
  posthog.ts          # Server-side PostHog client
  __tests__/          # Lib tests
e2e/
  playwright.config.ts
  tests/
    archive.spec.ts   # E2E: player UI, auth flow, theme toggle, mobile responsiveness
```

## Development

```bash
cp .env.example .env   # fill in values
npm install
npm run dev            # http://localhost:3000
```

### Environment Variables

See `.env.example`. Key variables:
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` -- S3 credentials for presigned URLs
- `BETTER_AUTH_URL` -- server-side auth proxy destination (used by next.config.ts rewrites)
- `NEXT_PUBLIC_BETTER_AUTH_URL` -- client-side auth URL (baked into bundle)
- `BETTER_AUTH_JWKS_URL` -- JWKS endpoint for JWT verification
- `BETTER_AUTH_ISSUER` / `BETTER_AUTH_AUDIENCE` -- expected `iss` and `aud` claims. Optional: unset, `verifyToken` checks the signature only and warns once. Both are the **origin** of the auth service's base URL (`https://api.wxyc.org`) -- better-auth's jwt plugin defaults both claims to that origin with the path stripped, so `https://api.wxyc.org/auth` is wrong and would reject every token
- `BACKEND_URL` -- Backend-Service origin serving `GET /flowsheet/range` (the daily playlist source). Defaults to `https://api.wxyc.org`; set it only to point a local build at a staging Backend
- `LML_API_KEY` -- bearer token for library-metadata-lookup artwork enrichment (org-wide shared key; LML returns 401 without it and artwork lookups silently come back empty)

## Testing

```bash
npm test               # Vitest unit tests
npm run test:watch     # Vitest watch mode
npm run test:e2e       # Playwright (starts dev server automatically)
npm run test:e2e:ui    # Playwright with UI mode
```

- **Unit tests** use Vitest with happy-dom, `@testing-library/react`, and `@testing-library/jest-dom` matchers (imported in `vitest.setup.ts`).
- **Test colocation**: tests live in `__tests__/` directories next to the code they test.
- **Mocking pattern**: `vi.mock()` at top of file for modules like `@/lib/auth`, `@wxyc/shared/auth-client`, `jose`, `@aws-sdk/*`. Auth tests use mutable `let` variables for state that individual tests override.
- **E2E tests** use Playwright (Chromium only). Config auto-starts `npm run dev` on port 3000.
- **Path aliases**: `@/*` maps to project root (configured in both `tsconfig.json` and `vitest.config.ts`).

## Build and Deploy

```bash
npm run build          # Next.js build
npm run preview        # OpenNext build + local Cloudflare preview
npm run deploy         # OpenNext build + deploy to Cloudflare Workers
```

### CI/CD

GitHub Actions workflow (`.github/workflows/deploy.yml`):
1. **test** job: `npm ci`, `tsc --noEmit`, `npm run lint`, `npm test`
2. **build-and-deploy** job: OpenNext build, then `wrangler deploy` on push to `main`

Runtime **secrets** (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `BETTER_AUTH_JWKS_URL`, `LML_API_KEY`) are set on the Cloudflare Worker directly (`wrangler secret put`), not in GitHub. They are write-only: `wrangler secret list` returns names, never values.

Runtime config that is **not** secret lives in `wrangler.jsonc` under `vars` and deploys with the code — currently `BETTER_AUTH_ISSUER` and `BETTER_AUTH_AUDIENCE`. Prefer `vars` whenever a value is not actually a secret: it is version-controlled, reviewable in a diff, and readable when something breaks, where a secret can only be overwritten blind. Run `npm run cf-typegen` after changing them.

Note the two stores are separate from the org's `secrets` repo, whose `update-secrets.sh` fans out to GitHub Actions/Dependabot/org secrets only — it never writes to a Cloudflare Worker. A rotation there does not reach this app's runtime.

## Code Conventions

- All components are `"use client"` (single-page app pattern within App Router).
- UI primitives come from shadcn/ui (New York variant, `components.json`). Add new ones with `npx shadcn@latest add <component>`.
- Styling: Tailwind utility classes, `cn()` helper for conditional merging, CSS custom properties for theming.
- Auth is proxied via a catch-all API route (`app/auth/[...path]/route.ts`) to the upstream auth server, not via Next.js rewrites (which don't work on Cloudflare Workers).
- Auth context: `useAuth()` hook provides `isAuthenticated`, `authorization`, `login`, `sendLoginCode`, `verifyLoginCode`, `completeSignIn`, `logout`, `getToken`.
- **DJ-level access is a rank comparison, not set membership**: `roleToAuthorization(role) >= Authorization.DJ`, applied identically on the client and in the signed-url route. It is a rank because `"admin"` and `"owner"` are accepted aliases that canonicalize to `stationManager` — `isDJRole` matched the three canonical names exactly and refused them. The role is always the station role from the verified JWT claim, never `session.user.role`, which is the better-auth admin-plugin field and is null for a plain dj (#100). Guard with `typeof role === "string"` before ranking: `canonicalizeRole` calls `.toLowerCase()`, so a non-string claim throws rather than denying.
- Three sign-in methods, all ending at the same gate: password (`login`), emailed one-time code (`sendLoginCode` then `verifyLoginCode`), and QR device authorization (`lib/device-auth.ts`, finishing via `completeSignIn` because better-auth sets the cookie at the token endpoint with no credential call to hang the gate off). The dialog defaults to the emailed code, matching dj.wxyc.org, and remembers the last method used. Whichever path proved the credentials, `completeSignIn` resolves the station role from the JWT claim and refuses non-DJs — proving identity is not the same as having archive access.
- **Feature flags must be listed in `deploy.yml`'s build `env:` block.** `NEXT_PUBLIC_*` values are inlined at build time and only from that block, so a flag added in code but not there is silently always-off in production. `NEXT_PUBLIC_QR_LOGIN_ENABLED` gates QR sign-in and deliberately shares dj-site's variable name: approval happens on dj.wxyc.org, so enabling one half alone sends DJs to a page that cannot help them.
- `lib/otp.ts` talks to better-auth's OTP endpoints directly rather than through `authClient.emailOtp.*`, because the shared client does not register the `emailOTPClient` plugin. That plugin is types-only — the client is a proxy that derives URL, method and body from the property path — so a plugin-less client already issues identical requests. Adding it would have cost a cross-repo release plus a three-major dependency bump to buy types at two call sites.
- **`resolveEmail` distinguishes three outcomes, not two.** The username lookup shares the auth service's brute-force limiter (ten requests per fifteen minutes, matched by path prefix), and one username-based code sign-in spends three of those tokens — lookup, send, verify. Collapsing a 429, a 5xx or a dead network into the same answer as an unknown username told throttled DJs their account did not exist. Only a 200 carrying no address is `not-found`; everything else is `unavailable`, and the server's own wording is surfaced when it has any.
- S3 key format: `YYYY/MM/DD/YYYYMMDDHH00.mp3`
- URL timestamp format: `?t=YYYYMMDDHHMMSS` (14 digits)
- Node 24 in CI (Active LTS); pinned via `.nvmrc` and `engines.node`.

## Show-Based Daily Playback

The playlist panel displays an entire day's entries grouped by DJ shows. Key architectural patterns:

- **Data source**: Backend-Service `GET /flowsheet/range?start=&end=` (epoch ms, half-open `[start, end)` on each entry's `add_time`, 8-day ceiling). It replaced tubafrenzy's `/playlists/dailyEntries` via wxyc-proxy, of which this route was the last live consumer. The wire shapes are declared in `lib/types/playlist.ts` as `FlowsheetRange*`; `wxyc-shared/api.yaml` is their source of truth.
- **Day bounds are Eastern, and days are not all 24 hours.** `/api/daily-playlist` derives both `start` and `end` through `computeRadioHourEpoch`, pairing it with `nextCalendarDay` rather than adding 86,400,000 — the spring-forward day is 23 hours and the fall-back day is 25.
- **Daily playlist hook** (`useDailyPlaylist`): Fetches all entries for a day via `/api/daily-playlist?date=YYYY-MM-DD`. Keyed on `selectedDate` only — changing the hour picker does not refetch.
- **Show grouping**: Entries are grouped into `ShowBlock` objects using `showId`. Entries Backend reports with `show_id: null` (20 production rows, deliberately never backfilled) fall through to a trailing "Unattributed" block, as does any entry whose `show_id` is absent from `shows` — though that second case should not fire, since `getShowsInTimeWindow`'s third arm selects every show an in-window entry references. It is a catch-all against contract regression, not an expected path. A show whose own `dj_name` did not resolve gets a distinct "Unknown DJ" label; the two are different facts.
- **`entryType` must cover the whole enum.** `api.yaml`'s `FlowsheetEntryType` has eight members, and `dj_join` / `dj_leave` only appear when a guest DJ joins mid-set — rare enough that a sampled day shows none while five sampled weeks hold 25. A missing key in `RANGE_ENTRY_TYPE` yields `undefined`, which `JSON.stringify` then drops from the response entirely. Unknown wire types map to `"unknown"` rather than falling through.
- **`hour` selects an MP3, so it is clamped to 0-23.** `getArchiveUrl` pads it into `YYYY/MM/DD/YYYYMMDDHH00.mp3`. On the 25-hour fall-back day the elapsed-seconds derivation would otherwise reach 24 and build a key that does not exist.
- **Cross-hour seeking**: When a user clicks an entry or navigates via J/K to a track in a different hour, the hour picker is updated (triggering a new MP3 load) and a pending seek offset is stored. Once the new MP3 loads, the pending seek is applied.
- **Double-buffered audio preloading**: When playback reaches 15 seconds before the end of the current hour's MP3, the next hour's presigned URL is fetched and loaded into a hidden `<audio>` element (`preload="auto"`). The browser buffers only the beginning of the file via HTTP range requests. When the active audio ends, the preloaded element begins playing immediately for gapless transitions.
- **Active entry tracking**: Uses `dayOffsetSeconds` (`selectedHour * 3600 + currentPlaybackTime`) to find the active entry across the full day, not just within the current hour.
- **`DailyPlaylistEntry.offsetSeconds`**: Always `dayOffsetSeconds % 3600` — the within-hour offset for seeking within the current MP3. This preserves compatibility with the audio player's seek logic.

## Relationship to Other Repos

- **`@wxyc/shared`** -- provides `authClient`, `getJWTToken`, `Authorization`, `roleToAuthorization`, `canonicalizeRole`, `WXYCRole`, and `Session` type. Installed from GitHub directly (`"@wxyc/shared": "github:WXYC/wxyc-shared"`).
- **Backend-Service** -- auth server at `api.wxyc.org/auth` (the archive app proxies `/auth/*` requests to it), and the playlist data source at `api.wxyc.org/flowsheet/range`.
- **wxyc-archive-search** -- separate API for searching archived playlists. Not consumed by this app (this app streams audio, not playlist data).

## Example Music Data for Tests

WXYC is a freeform station. When creating test fixtures or mock data, use representative artists instead of mainstream acts like Queen, Radiohead, or The Beatles. The canonical data source is `wxyc-shared/src/test-utils/wxyc-example-data.json`. See the reference table in the org-level CLAUDE.md.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
