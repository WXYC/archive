import * as jose from "jose";
import type { WXYCRole } from "@wxyc/shared/auth-client/auth";

const JWKS_URL =
  process.env.BETTER_AUTH_JWKS_URL || "https://api.wxyc.org/auth/jwks";

let jwks: jose.JWTVerifyGetKey | null = null;

function getJWKS(): jose.JWTVerifyGetKey {
  if (!jwks) {
    jwks = jose.createRemoteJWKSet(new URL(JWKS_URL));
  }
  return jwks;
}

// Warn once if issuer/audience env vars are missing. Soft degradation is
// intentional: the archive is a consumer-facing Next.js site, not the
// authoritative API server that Backend-Service is. In development these
// vars are commonly omitted, so we warn rather than throw.
let warnedMissingClaimVars = false;

function getVerifyOptions(): jose.JWTVerifyOptions {
  const issuer = process.env.BETTER_AUTH_ISSUER || undefined;
  const audience = process.env.BETTER_AUTH_AUDIENCE || undefined;

  if (!warnedMissingClaimVars && (!issuer || !audience)) {
    console.warn(
      "JWT claim validation env vars missing (BETTER_AUTH_ISSUER and/or BETTER_AUTH_AUDIENCE). " +
        "Tokens will be verified by signature only. Set these in production."
    );
    warnedMissingClaimVars = true;
  }

  const options: jose.JWTVerifyOptions = {};
  if (issuer) options.issuer = issuer;
  if (audience) options.audience = audience;
  return options;
}

export type JWTPayload = {
  sub: string;
  role?: WXYCRole;
  email?: string;
  name?: string;
  iat?: number;
  exp?: number;
};

export type VerifyResult =
  | { authenticated: true; payload: JWTPayload; role: WXYCRole | null }
  | { authenticated: false; error: string };

/**
 * Verify a JWT token using the JWKS from the auth server.
 *
 * Validates issuer and audience claims when the corresponding env vars
 * (BETTER_AUTH_ISSUER, BETTER_AUTH_AUDIENCE) are set. Logs a warning on
 * the first call if either is missing.
 */
export async function verifyToken(token: string): Promise<VerifyResult> {
  try {
    const options = getVerifyOptions();
    const { payload } = await jose.jwtVerify(token, getJWKS(), options);

    return {
      authenticated: true,
      payload: payload as JWTPayload,
      role: (payload.role as WXYCRole) ?? null,
    };
  } catch (error) {
    if (error instanceof jose.errors.JWTExpired) {
      return { authenticated: false, error: "Token expired" };
    }
    if (error instanceof jose.errors.JWTClaimValidationFailed) {
      return { authenticated: false, error: "Token validation failed" };
    }
    if (error instanceof jose.errors.JWSSignatureVerificationFailed) {
      return { authenticated: false, error: "Invalid signature" };
    }

    console.error("JWT verification error:", error);
    return { authenticated: false, error: "Token verification failed" };
  }
}

/**
 * Extract and verify JWT from Authorization header.
 */
export async function verifyAuthHeader(
  authHeader: string | null
): Promise<VerifyResult> {
  if (!authHeader) {
    return { authenticated: false, error: "No authorization header" };
  }

  if (!authHeader.startsWith("Bearer ")) {
    return { authenticated: false, error: "Invalid authorization format" };
  }

  const token = authHeader.slice(7);
  if (!token) {
    return { authenticated: false, error: "No token provided" };
  }

  return verifyToken(token);
}
