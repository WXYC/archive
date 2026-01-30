import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile the local shared package
  transpilePackages: ["@wxyc/shared"],

  async rewrites() {
    const authUrl = process.env.BETTER_AUTH_URL || "https://api.wxyc.org/auth";
    return [
      // Better Auth proxy - ensures session cookies work correctly
      {
        source: "/auth/:path*",
        destination: `${authUrl}/:path*`,
      },
      // PostHog proxies
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
      {
        source: "/ingest/decide",
        destination: "https://us.i.posthog.com/decide",
      },
    ];
  },

  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
};

export default nextConfig;