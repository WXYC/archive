import { type NextRequest, NextResponse } from "next/server";

const UPSTREAM_AUTH_URL =
  process.env.BETTER_AUTH_URL || "https://api.wxyc.org/auth";

/** Hop-by-hop headers that must not be forwarded to the upstream server. */
const EXCLUDED_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
  "proxy-authorization",
  "proxy-connection",
]);

/** Hop-by-hop headers that must not be returned to the client. */
const EXCLUDED_RESPONSE_HEADERS = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
]);

/**
 * Maximum number of same-origin redirects the proxy will follow server-side.
 * Redirects to a different origin are passed through to the client (e.g. OAuth
 * provider redirects). Following same-origin redirects prevents Cloudflare
 * "Always Use HTTPS" 301s from leaking to the browser as cross-origin
 * redirects, which would fail CORS.
 */
const MAX_REDIRECTS = 3;

async function proxyRequest(request: NextRequest): Promise<NextResponse> {
  const upstreamPath = request.nextUrl.pathname.replace(/^\/auth/, "");
  let url = `${UPSTREAM_AUTH_URL}${upstreamPath}${request.nextUrl.search}`;
  const upstreamOrigin = new URL(UPSTREAM_AUTH_URL).origin;

  const headers: Record<string, string> = {
    "x-forwarded-proto": "https",
  };
  request.headers.forEach((value, key) => {
    if (!EXCLUDED_REQUEST_HEADERS.has(key.toLowerCase())) {
      headers[key] = value;
    }
  });

  const body =
    request.method !== "GET" && request.method !== "HEAD"
      ? await request.arrayBuffer()
      : undefined;

  try {
    let upstreamResponse: Response | undefined;

    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      upstreamResponse = await fetch(url, {
        method: request.method,
        headers,
        body,
        redirect: "manual",
      });

      if (
        upstreamResponse.status >= 300 &&
        upstreamResponse.status < 400
      ) {
        const location = upstreamResponse.headers.get("location");
        if (location) {
          const resolved = new URL(location, url);
          if (resolved.origin === upstreamOrigin) {
            url = resolved.href;
            continue;
          }
        }
      }
      break;
    }

    const responseHeaders = new Headers();
    upstreamResponse!.headers.forEach((value, key) => {
      if (!EXCLUDED_RESPONSE_HEADERS.has(key.toLowerCase())) {
        responseHeaders.append(key, value);
      }
    });

    return new NextResponse(upstreamResponse!.body, {
      status: upstreamResponse!.status,
      statusText: upstreamResponse!.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Auth proxy error:", error);
    return NextResponse.json(
      { error: "Auth service unavailable" },
      { status: 502 }
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const OPTIONS = proxyRequest;
