/**
 * Email one-time-code sign-in, spoken directly to better-auth's HTTP API.
 *
 * Why not `authClient.emailOtp.*`: the shared auth client in `@wxyc/shared`
 * does not register better-auth's `emailOTPClient` plugin, so those property
 * paths do not typecheck. That plugin is types-only — better-auth's client is
 * a proxy that derives the URL, method and body from the property path, so a
 * plugin-less client already issues byte-identical requests. Buying types for
 * two call sites would cost a cross-repo release and a three-major dependency
 * bump, so archive states the two contracts it actually uses instead.
 *
 * Requests go to relative `/auth/*` paths, which the catch-all proxy route
 * forwards upstream. Same-origin by construction, so the session cookie
 * better-auth sets on a successful sign-in is stored without CORS involvement.
 */

/** Where the auth proxy is mounted in this app. */
const AUTH_BASE = "/auth";

/** Outcome of a call that either worked or has something to tell the user. */
export type OtpResult = { ok: true } | { ok: false; error: string };

/**
 * better-auth error codes worth rewording. Its own copy for these is terse
 * ("Invalid OTP"), and each of them has a different next action for the user.
 * Anything not listed falls through to the server's message, so a new upstream
 * code surfaces as itself rather than as a generic failure.
 */
const OTP_ERROR_COPY: Record<string, string> = {
  OTP_EXPIRED: "That code has expired. Please request a new one.",
  INVALID_OTP: "Invalid code. Please check and try again.",
  TOO_MANY_ATTEMPTS: "Too many attempts. Please request a new code.",
};

type AuthErrorBody = { code?: unknown; message?: unknown };

/** Read a JSON body without throwing on an empty or non-JSON response. */
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function messageFrom(body: unknown, fallback: string): string {
  const message = (body as AuthErrorBody | null)?.message;
  return typeof message === "string" && message.length > 0 ? message : fallback;
}

async function postJson(path: string, payload: unknown): Promise<Response> {
  return fetch(`${AUTH_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Same-origin, but better-auth's sign-in response sets the session cookie
    // and the subsequent /auth/token call must send it back.
    credentials: "include",
    body: JSON.stringify(payload),
  });
}

/**
 * Turn whatever the user typed into the address better-auth needs.
 *
 * An input containing "@" is taken as an address and returned as-is; anything
 * else is resolved through the public lookup endpoint. Never throws: every
 * failure — no match, a 5xx, a dead network — collapses to `null`, because the
 * caller's message to the user is the same in all of those cases and a thrown
 * error here would be indistinguishable from a real one later in the flow.
 */
export async function resolveEmail(identifier: string): Promise<string | null> {
  const trimmed = identifier.trim();
  if (trimmed.includes("@")) return trimmed;

  try {
    const response = await postJson("/wxyc/lookup-email", {
      identifier: trimmed,
    });
    if (!response.ok) return null;

    const body = (await readJson(response)) as { email?: unknown } | null;
    return typeof body?.email === "string" ? body.email : null;
  } catch {
    return null;
  }
}

/**
 * Ask better-auth to email a six-digit sign-in code.
 *
 * `type: "sign-in"` selects the sign-in flow specifically — better-auth uses
 * the same endpoint for email verification and password reset.
 */
export async function sendVerificationOtp(email: string): Promise<OtpResult> {
  try {
    const response = await postJson("/email-otp/send-verification-otp", {
      email,
      type: "sign-in",
    });

    if (!response.ok) {
      return {
        ok: false,
        error: messageFrom(
          await readJson(response),
          "Could not send a login code. Please try again."
        ),
      };
    }

    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Could not send a login code. Please try again.",
    };
  }
}

/**
 * Exchange an emailed code for a session.
 *
 * On success better-auth sets the session cookie; this returns only whether
 * that happened. Establishing app state from the new session — and gating on
 * the WXYC station role — is the auth context's job, exactly as it is after a
 * password sign-in.
 */
export async function signInWithOtp(
  email: string,
  otp: string
): Promise<OtpResult> {
  try {
    const response = await postJson("/sign-in/email-otp", { email, otp });
    if (response.ok) return { ok: true };

    const body = (await readJson(response)) as AuthErrorBody | null;
    const code = typeof body?.code === "string" ? body.code : undefined;

    return {
      ok: false,
      error:
        (code && OTP_ERROR_COPY[code]) ??
        messageFrom(body, "Could not verify that code. Please try again."),
    };
  } catch {
    return {
      ok: false,
      error: "Could not verify that code. Please try again.",
    };
  }
}
