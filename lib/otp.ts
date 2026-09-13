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
 * Outcome of turning a typed identifier into an address.
 *
 * Three cases rather than two because `not-found` is an answer about the
 * account and `unavailable` is the absence of an answer, and the caller owes
 * the user different words for each. `error` carries whatever the server said,
 * when it said anything; the caller supplies the wording when it did not.
 */
export type EmailLookupResult =
  | { status: "ok"; email: string }
  | { status: "not-found" }
  | { status: "unavailable"; error?: string };

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

type AuthErrorBody = { code?: unknown; message?: unknown; error?: unknown };

/** Read a JSON body without throwing on an empty or non-JSON response. */
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * The most specific thing the server said, or undefined if it said nothing.
 *
 * better-auth reports in `message`, but two other things answer on these same
 * paths and report in `error`: the shared brute-force limiter in front of the
 * auth service, and this app's own /auth proxy when upstream is unreachable.
 * Reading only `message` would turn "Too many requests, please try again
 * later." into a generic retry prompt — the one that invites the retry that
 * deepens the block.
 */
function serverMessage(body: unknown): string | undefined {
  const parsed = body as AuthErrorBody | null;
  return [parsed?.message, parsed?.error].find(
    (value): value is string => typeof value === "string" && value.length > 0
  );
}

/** The same, falling back to copy of our own when the server said nothing. */
function messageFrom(body: unknown, fallback: string): string {
  return serverMessage(body) ?? fallback;
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
 * else is resolved through the public lookup endpoint, which answers 200 with
 * a null email for an identifier it does not know.
 *
 * Never throws — a thrown error here would be indistinguishable from a real one
 * later in the flow — but it does not flatten either. Only a 200 carrying no
 * address means no such account; a 429, a 5xx or a dead network means we could
 * not ask, and saying "no account matches" to a DJ the limiter has throttled is
 * both false and the advice most likely to make it worse.
 */
export async function resolveEmail(
  identifier: string
): Promise<EmailLookupResult> {
  const trimmed = identifier.trim();
  if (trimmed.includes("@")) return { status: "ok", email: trimmed };

  try {
    const response = await postJson("/wxyc/lookup-email", {
      identifier: trimmed,
    });
    const body = await readJson(response);

    if (!response.ok) {
      return { status: "unavailable", error: serverMessage(body) };
    }

    const email = (body as { email?: unknown } | null)?.email;
    return typeof email === "string"
      ? { status: "ok", email }
      : { status: "not-found" };
  } catch {
    return { status: "unavailable" };
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

    // Own properties only. `??` on its own is not enough here: the `&&` form
    // yields "" for an empty `code`, and "" is not nullish, so the user would
    // be shown a blank error; and a plain object answers to inherited keys
    // like "constructor" with a function. Both fall through to the server's
    // own wording instead.
    const copy =
      code !== undefined && Object.hasOwn(OTP_ERROR_COPY, code)
        ? OTP_ERROR_COPY[code]
        : undefined;

    return {
      ok: false,
      error:
        copy ??
        messageFrom(body, "Could not verify that code. Please try again."),
    };
  } catch {
    return {
      ok: false,
      error: "Could not verify that code. Please try again.",
    };
  }
}
