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
    daily-playlist/   # GET route: fetches full day's entries from tubafrenzy, groups by show
    signed-url/       # POST route: validates date range, returns presigned S3 URL
components/
  audio-player.tsx    # Playback controls, seek, volume, skip, download, share, preloading
  login-dialog.tsx    # DJ sign-in dialog (username/email + password)
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
  types/
    playlist.ts       # Types + mapping functions for hourly and daily playlist data
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
1. **test** job: `npm ci`, `tsc --noEmit`, `npm test`
2. **build-and-deploy** job: OpenNext build, then `wrangler deploy` on push to `main`

Runtime secrets (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `BETTER_AUTH_JWKS_URL`, etc.) are set on the Cloudflare Worker directly, not in GitHub.

## Code Conventions

- All components are `"use client"` (single-page app pattern within App Router).
- UI primitives come from shadcn/ui (New York variant, `components.json`). Add new ones with `npx shadcn@latest add <component>`.
- Styling: Tailwind utility classes, `cn()` helper for conditional merging, CSS custom properties for theming.
- Auth is proxied via a catch-all API route (`app/auth/[...path]/route.ts`) to the upstream auth server, not via Next.js rewrites (which don't work on Cloudflare Workers).
- Auth context: `useAuth()` hook provides `isAuthenticated`, `login`, `logout`, `getToken`. DJ-level access is checked via `isDJRole()` from `@wxyc/shared/auth-client`.
- S3 key format: `YYYY/MM/DD/YYYYMMDDHH00.mp3`
- URL timestamp format: `?t=YYYYMMDDHHMMSS` (14 digits)
- Node 22 in CI.

## Show-Based Daily Playback

The playlist panel displays an entire day's entries grouped by DJ shows (show start/stop boundaries from tubafrenzy). Key architectural patterns:

- **Daily playlist hook** (`useDailyPlaylist`): Fetches all entries for a day via `/api/daily-playlist?date=YYYY-MM-DD`. Keyed on `selectedDate` only — changing the hour picker does not refetch.
- **Show grouping**: Entries are grouped into `ShowBlock` objects using `radioShowId`. Entries not belonging to any known show are collected into an "Automation" block.
- **Cross-hour seeking**: When a user clicks an entry or navigates via J/K to a track in a different hour, the hour picker is updated (triggering a new MP3 load) and a pending seek offset is stored. Once the new MP3 loads, the pending seek is applied.
- **Double-buffered audio preloading**: When playback reaches 15 seconds before the end of the current hour's MP3, the next hour's presigned URL is fetched and loaded into a hidden `<audio>` element (`preload="auto"`). The browser buffers only the beginning of the file via HTTP range requests. When the active audio ends, the preloaded element begins playing immediately for gapless transitions.
- **Active entry tracking**: Uses `dayOffsetSeconds` (`selectedHour * 3600 + currentPlaybackTime`) to find the active entry across the full day, not just within the current hour.
- **`DailyPlaylistEntry.offsetSeconds`**: Always `dayOffsetSeconds % 3600` — the within-hour offset for seeking within the current MP3. This preserves compatibility with the audio player's seek logic.

## Relationship to Other Repos

- **`@wxyc/shared`** -- provides `authClient`, `getJWTToken`, `isDJRole`, `DJ_ROLES`, and `Session` type. Installed from GitHub directly (`"@wxyc/shared": "github:WXYC/wxyc-shared"`).
- **Backend-Service** -- auth server at `api.wxyc.org/auth`. The archive app proxies `/auth/*` requests to it via Next.js rewrites.
- **wxyc-archive-search** -- separate API for searching archived playlists. Not consumed by this app (this app streams audio, not playlist data).

## Example Music Data for Tests

WXYC is a freeform station. When creating test fixtures or mock data, use representative artists instead of mainstream acts like Queen, Radiohead, or The Beatles. The canonical data source is `wxyc-shared/src/test-utils/wxyc-example-data.json`. See the reference table in the org-level CLAUDE.md.
