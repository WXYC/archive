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

async function proxyRequest(request: NextRequest): Promise<NextResponse> {
  const upstreamPath = request.nextUrl.pathname.replace(/^\/auth/, "");
  const upstream = `${UPSTREAM_AUTH_URL}${upstreamPath}${request.nextUrl.search}`;

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    if (!EXCLUDED_REQUEST_HEADERS.has(key.toLowerCase())) {
      headers[key] = value;
    }
  });

  try {
    const upstreamResponse = await fetch(upstream, {
      method: request.method,
      headers,
      body:
        request.method !== "GET" && request.method !== "HEAD"
          ? await request.arrayBuffer()
          : undefined,
      redirect: "manual",
    });

    const responseHeaders = new Headers();
    upstreamResponse.headers.forEach((value, key) => {
      if (!EXCLUDED_RESPONSE_HEADERS.has(key.toLowerCase())) {
        responseHeaders.append(key, value);
      }
    });

    return new NextResponse(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
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
