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
    await expect(resolveEmail("dj@wxyc.org")).resolves.toBe("dj@wxyc.org");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("trims before deciding, so a padded address is still recognised", async () => {
    await expect(resolveEmail("  dj@wxyc.org  ")).resolves.toBe("dj@wxyc.org");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("resolves a username through the lookup endpoint", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ email: "dj@wxyc.org" }));

    await expect(resolveEmail("djhandle")).resolves.toBe("dj@wxyc.org");

    const call = lastCall();
    expect(call.url).toBe("/auth/wxyc/lookup-email");
    expect(call.method).toBe("POST");
    expect(call.body).toEqual({ identifier: "djhandle" });
  });

  it("returns null when no account matches", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ email: null }));
    await expect(resolveEmail("nobody")).resolves.toBeNull();
  });

  it("returns null rather than throwing when the lookup fails", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: "boom" }, 500));
    await expect(resolveEmail("djhandle")).resolves.toBeNull();
  });

  it("returns null rather than throwing when the network is down", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(resolveEmail("djhandle")).resolves.toBeNull();
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
});
