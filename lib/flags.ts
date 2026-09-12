/**
 * Feature flags read from public Next.js env vars.
 *
 * Values are inlined at build time, so callers must invoke these helpers at
 * render time rather than capturing them at module init — and the variable
 * must be listed in the build step's `env:` block in `.github/workflows/
 * deploy.yml`, or it never reaches the bundle at all and the flag is silently
 * always-off in production.
 */

/**
 * Gates RFC 8628 QR ("device authorization") sign-in: the entry links on the
 * other sign-in forms, and the QR stage itself. While off, nothing can
 * navigate to that stage, so the client never requests a device code.
 *
 * Defaults to OFF; set NEXT_PUBLIC_QR_LOGIN_ENABLED to "true" (or "1") to
 * enable. Deliberately the same variable name and semantics as dj-site's
 * `isQrLoginEnabled`, so one rollout decision covers both surfaces — the
 * approval half of this flow lives on dj.wxyc.org, and enabling archive's
 * half while dj-site's is dark would send DJs to a page that cannot help
 * them.
 */
export function isQrLoginEnabled(): boolean {
  const value = process.env.NEXT_PUBLIC_QR_LOGIN_ENABLED;
  return value === "true" || value === "1";
}
