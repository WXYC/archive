import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveEmail, sendVerificationOtp, signInWithOtp } from "../otp";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function lastCall(): { url: string; body: unknown; method: string } {
  const [url, init] = mockFetch.mock.calls.at(-1) as [string, RequestInit];
  return {
    url: String(url),
    method: init.method ?? "GET",
    body: init.body ? JSON.parse(String(init.body)) : null,
  };
}

describe("resolveEmail", () => {
  it("passes an address straight through without a network call", async () => {
    await expect(resolveEmail("dj@wxyc.org")).resolves.toEqual({
      status: "ok",
      email: "dj@wxyc.org",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("trims before deciding, so a padded address is still recognised", async () => {
    await expect(resolveEmail("  dj@wxyc.org  ")).resolves.toEqual({
      status: "ok",
      email: "dj@wxyc.org",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("resolves a username through the lookup endpoint", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ email: "dj@wxyc.org" }));

    await expect(resolveEmail("djhandle")).resolves.toEqual({
      status: "ok",
      email: "dj@wxyc.org",
    });

    const call = lastCall();
    expect(call.url).toBe("/auth/wxyc/lookup-email");
    expect(call.method).toBe("POST");
    expect(call.body).toEqual({ identifier: "djhandle" });
  });

  // The endpoint answers 200 with a null email for an identifier it does not
  // know. That is an answer about the account, and it is the only outcome that
  // entitles the caller to say no account matches.
  it("reports not-found when the lookup answers with no address", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ email: null }));
    await expect(resolveEmail("nobody")).resolves.toEqual({
      status: "not-found",
    });
  });

  // A username sign-in spends three of the limiter's ten tokens per attempt —
  // lookup, send, verify — because express matches the configured paths by
  // prefix, so /auth/sign-in/email-otp counts against /auth/sign-in. Four
  // attempts in fifteen minutes is enough, which a DJ mistyping a username
  // reaches easily. The limiter answers in `error`, not better-auth's
  // `message`, and that wording is the part that says to wait.
  it("reports a throttle as unavailable, carrying the limiter's wording", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ error: "Too many requests, please try again later." }, 429)
    );

    await expect(resolveEmail("djhandle")).resolves.toEqual({
      status: "unavailable",
      error: "Too many requests, please try again later.",
    });
  });

  it("reports a server failure as unavailable rather than a missing account", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ error: "Internal server error" }, 500)
    );
    await expect(resolveEmail("djhandle")).resolves.toEqual({
      status: "unavailable",
      error: "Internal server error",
    });
  });

  it("reports a dead network as unavailable rather than throwing", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(resolveEmail("djhandle")).resolves.toEqual({
      status: "unavailable",
    });
  });

  // Nothing to quote, so nothing is quoted: the caller supplies the wording.
  it("reports unavailable without wording when the failure body says nothing", async () => {
    mockFetch.mockResolvedValue(
      new Response("<html>502</html>", { status: 502 })
    );
    await expect(resolveEmail("djhandle")).resolves.toEqual({
      status: "unavailable",
    });
  });
});

describe("sendVerificationOtp", () => {
  it("asks better-auth for a sign-in code", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ success: true }));

    await expect(sendVerificationOtp("dj@wxyc.org")).resolves.toEqual({
      ok: true,
    });

    const call = lastCall();
    expect(call.url).toBe("/auth/email-otp/send-verification-otp");
    expect(call.method).toBe("POST");
    // `type` selects which of better-auth's OTP flows this is; "sign-in" is
    // distinct from email verification and password reset.
    expect(call.body).toEqual({ email: "dj@wxyc.org", type: "sign-in" });
  });

  it("reports a failure rather than pretending the code was sent", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ message: "Service unavailable" }, 503)
    );

    const result = await sendVerificationOtp("dj@wxyc.org");

    expect(result.ok).toBe(false);
    expect(result).toHaveProperty("error", "Service unavailable");
  });

  it("survives a non-JSON error body", async () => {
    mockFetch.mockResolvedValue(new Response("<html>502</html>", { status: 502 }));

    const result = await sendVerificationOtp("dj@wxyc.org");

    expect(result.ok).toBe(false);
  });

  it("surfaces the auth proxy's own failure wording", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ error: "Auth service unavailable" }, 502)
    );

    await expect(sendVerificationOtp("dj@wxyc.org")).resolves.toEqual({
      ok: false,
      error: "Auth service unavailable",
    });
  });
});

describe("signInWithOtp", () => {
  it("submits the code and reports success", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ user: { id: "u1" } }));

    await expect(signInWithOtp("dj@wxyc.org", "123456")).resolves.toEqual({
      ok: true,
    });

    const call = lastCall();
    expect(call.url).toBe("/auth/sign-in/email-otp");
    expect(call.method).toBe("POST");
    expect(call.body).toEqual({ email: "dj@wxyc.org", otp: "123456" });
  });

  // Wrong-code and expired-code are the two states a DJ will actually hit, and
  // better-auth's own wording for them is terse. These are mapped to copy that
  // says what to do next.
  it.each([
    [
      "OTP_EXPIRED",
      "That code has expired. Please request a new one.",
    ],
    [
      "INVALID_OTP",
      "Invalid code. Please check and try again.",
    ],
    [
      "TOO_MANY_ATTEMPTS",
      "Too many attempts. Please request a new code.",
    ],
  ])("maps %s to actionable copy", async (code, expected) => {
    mockFetch.mockResolvedValue(
      jsonResponse({ code, message: "terse upstream wording" }, 400)
    );

    const result = await signInWithOtp("dj@wxyc.org", "000000");

    expect(result).toEqual({ ok: false, error: expected });
  });

  it("falls back to the server's message for an unrecognised code", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ code: "SOMETHING_NEW", message: "Upstream said this" }, 400)
    );

    await expect(signInWithOtp("dj@wxyc.org", "000000")).resolves.toEqual({
      ok: false,
      error: "Upstream said this",
    });
  });

  it("reports a generic failure when the server says nothing useful", async () => {
    mockFetch.mockResolvedValue(new Response("", { status: 500 }));

    const result = await signInWithOtp("dj@wxyc.org", "000000");

    expect(result.ok).toBe(false);
    expect(result).toHaveProperty("error", expect.any(String));
  });

  // A code that is present but useless must not win over the server's message.
  // An empty string is not nullish, and a plain object answers to every key on
  // Object.prototype, so both need an own-property check to fall through.
  it.each([
    ["an empty code", ""],
    ["a code that names an inherited property", "constructor"],
  ])("falls through to the server's message for %s", async (_label, code) => {
    mockFetch.mockResolvedValue(
      jsonResponse({ code, message: "Upstream said this" }, 400)
    );

    await expect(signInWithOtp("dj@wxyc.org", "000000")).resolves.toEqual({
      ok: false,
      error: "Upstream said this",
    });
  });

  // The brute-force limiter in front of the auth service and this app's own
  // /auth proxy both answer in `error` rather than better-auth's `message`.
  it("surfaces a rate-limit refusal instead of a generic retry prompt", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ error: "Too many requests, please try again later." }, 429)
    );

    await expect(signInWithOtp("dj@wxyc.org", "000000")).resolves.toEqual({
      ok: false,
      error: "Too many requests, please try again later.",
    });
  });
});
