import * as jose from "jose";

const JWKS_URL =
  process.env.BETTER_AUTH_JWKS_URL || "https://api.wxyc.org/auth/jwks";

let jwks: jose.JWTVerifyGetKey | null = null;

function getJWKS(): jose.JWTVerifyGetKey {
  if (!jwks) {
    jwks = jose.createRemoteJWKSet(new URL(JWKS_URL));
  }
  return jwks;
}

export type JWTPayload = {
  sub: string;
  role?: string;
  email?: string;
  name?: string;
  iat?: number;
  exp?: number;
};

export type VerifyResult =
  | { authenticated: true; payload: JWTPayload; role: string | null }
  | { authenticated: false; error: string };

/**
 * Verify a JWT token using the JWKS from the auth server.
 */
export async function verifyToken(token: string): Promise<VerifyResult> {
  try {
    const { payload } = await jose.jwtVerify(token, getJWKS());

    return {
      authenticated: true,
      payload: payload as JWTPayload,
      role: (payload.role as string) ?? null,
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
