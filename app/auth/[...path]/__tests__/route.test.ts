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
