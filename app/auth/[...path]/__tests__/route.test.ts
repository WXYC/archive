import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST, OPTIONS } from "../route";

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeRequest(
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {}
) {
  const { method = "GET", headers = {}, body } = options;
  return new NextRequest(`http://localhost:3000/auth${path}`, {
    method,
    headers: new Headers(headers),
    ...(body ? { body } : {}),
  });
}

/** Normalize headers (plain object or Headers instance) to a lowercase-keyed record. */
function normalizeHeaders(
  headers: Record<string, string> | Headers
): Record<string, string> {
  if (headers instanceof Headers) {
    const result: Record<string, string> = {};
    headers.forEach((v, k) => {
      result[k.toLowerCase()] = v;
    });
    return result;
  }
  return Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
}

function mockUpstream(options: {
  status?: number;
  headers?: Record<string, string>;
  body?: string;
} = {}) {
  const { status = 200, headers = {}, body = "null" } = options;
  mockFetch.mockResolvedValueOnce(
    new Response(body, { status, headers })
  );
}

describe("GET /auth/[...path]", () => {
  it("forwards GET to the correct upstream URL", async () => {
    mockUpstream();

    await GET(makeRequest("/get-session"));

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.wxyc.org/auth/get-session",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("forwards query strings", async () => {
    mockUpstream();

    await GET(makeRequest("/get-session?foo=bar"));

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.wxyc.org/auth/get-session?foo=bar",
      expect.anything()
    );
  });

  it("forwards non-excluded request headers", async () => {
    mockUpstream();

    await GET(
      makeRequest("/get-session", {
        headers: { "X-Custom-Header": "test-value" },
      })
    );

    const [, init] = mockFetch.mock.calls[0];
    const forwarded = normalizeHeaders(init.headers);
    expect(forwarded["x-custom-header"]).toBe("test-value");
  });

  it("strips hop-by-hop request headers", async () => {
    mockUpstream();

    await GET(
      makeRequest("/get-session", {
        headers: { "X-Custom": "keep-me" },
      })
    );

    const [, init] = mockFetch.mock.calls[0];
    const forwarded = normalizeHeaders(init.headers);
    // host is always set by NextRequest but should be stripped
    expect(forwarded["host"]).toBeUndefined();
    expect(forwarded["connection"]).toBeUndefined();
    expect(forwarded["x-custom"]).toBe("keep-me");
  });

  it("returns upstream status codes", async () => {
    mockUpstream({ status: 401, body: '{"error":"unauthorized"}' });

    const response = await GET(makeRequest("/get-session"));

    expect(response.status).toBe(401);
  });

  it("forwards response headers from upstream", async () => {
    mockUpstream({
      headers: { "X-Custom-Response": "from-upstream" },
    });

    const response = await GET(makeRequest("/get-session"));

    const responseHeaders = normalizeHeaders(response.headers);
    expect(responseHeaders["x-custom-response"]).toBe("from-upstream");
  });

  it("strips upstream CORS headers from proxied responses", async () => {
    mockUpstream({
      headers: {
        "Access-Control-Allow-Origin": "https://dj.wxyc.org",
        "Access-Control-Allow-Credentials": "true",
        "X-Powered-By": "Express",
      },
    });

    const response = await GET(makeRequest("/get-session"));

    const responseHeaders = normalizeHeaders(response.headers);
    expect(responseHeaders["access-control-allow-origin"]).toBeUndefined();
    expect(responseHeaders["access-control-allow-credentials"]).toBeUndefined();
    expect(responseHeaders["x-powered-by"]).toBe("Express");
  });
});

describe("POST /auth/[...path]", () => {
  it("forwards POST with body", async () => {
    mockUpstream({ body: '{"user":{"id":"1"}}' });

    const body = JSON.stringify({
      email: "dj@wxyc.org",
      password: "password",
    });
    await POST(
      makeRequest("/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      })
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.wxyc.org/auth/sign-in/email",
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("OPTIONS /auth/[...path]", () => {
  it("forwards OPTIONS requests", async () => {
    mockUpstream({ status: 204 });

    const response = await OPTIONS(makeRequest("/sign-in/email", { method: "OPTIONS" }));

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.wxyc.org/auth/sign-in/email",
      expect.objectContaining({ method: "OPTIONS" })
    );
    expect(response.status).toBe(204);
  });
});

describe("redirect handling", () => {
  it("follows scheme-change redirects (http→https) for the same host", async () => {
    // Simulate Cloudflare "Always Use HTTPS" redirecting http→https.
    // The upstream env var may use http:// but the redirect Location is https://.
    // The proxy must follow this because the host is the same.
    mockFetch.mockResolvedValueOnce(
      new Response(null, {
        status: 301,
        headers: { Location: "http://api.wxyc.org/auth/sign-in/email" },
      })
    );
    mockUpstream({ body: '{"user":{"id":"1"}}' });

    const response = await POST(
      makeRequest("/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "dj@wxyc.org", password: "pw" }),
      })
    );

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
  });

  it("follows same-origin redirects server-side", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(null, {
        status: 301,
        headers: { Location: "https://api.wxyc.org/auth/sign-in/email" },
      })
    );
    mockUpstream({ body: '{"user":{"id":"1"}}' });

    const response = await POST(
      makeRequest("/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "dj@wxyc.org", password: "pw" }),
      })
    );

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
  });

  it("passes through cross-origin redirects to the client", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { Location: "https://accounts.google.com/o/oauth2/auth" },
      })
    );

    const response = await GET(makeRequest("/callback/google"));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://accounts.google.com/o/oauth2/auth"
    );
  });

  it("stops after MAX_REDIRECTS to prevent loops", async () => {
    for (let i = 0; i < 5; i++) {
      mockFetch.mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { Location: "https://api.wxyc.org/auth/loop" },
        })
      );
    }

    const response = await GET(makeRequest("/loop"));

    // 1 initial + 3 follows = 4 fetches, then returns the redirect
    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(response.status).toBe(301);
  });

  it("sends x-forwarded-proto: https to upstream", async () => {
    mockUpstream();

    await GET(makeRequest("/get-session"));

    const [, init] = mockFetch.mock.calls[0];
    const forwarded = normalizeHeaders(init.headers);
    expect(forwarded["x-forwarded-proto"]).toBe("https");
  });
});

describe("error handling", () => {
  it("returns 502 when upstream fetch fails", async () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const response = await GET(makeRequest("/get-session"));

    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.error).toBe("Auth service unavailable");

    consoleSpy.mockRestore();
  });
});
