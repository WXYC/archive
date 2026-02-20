import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyToken, verifyAuthHeader } from "../jwt-utils";
import * as jose from "jose";

// Mock jose module
vi.mock("jose", async () => {
  const actual = await vi.importActual<typeof jose>("jose");
  return {
    ...actual,
    createRemoteJWKSet: vi.fn(),
    jwtVerify: vi.fn(),
  };
});

describe("jwt-utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("BETTER_AUTH_ISSUER", "https://api.wxyc.org");
    vi.stubEnv("BETTER_AUTH_AUDIENCE", "https://api.wxyc.org");
  });

  describe("verifyToken", () => {
    it("should return authenticated true with payload for valid token", async () => {
      const mockPayload = {
        sub: "user-123",
        role: "dj",
        email: "test@wxyc.org",
        name: "Test DJ",
      };

      vi.mocked(jose.jwtVerify).mockResolvedValue({
        payload: mockPayload,
        protectedHeader: { alg: "RS256" },
      } as unknown as jose.JWTVerifyResult & jose.ResolvedKey);

      const result = await verifyToken("valid-token");

      expect(result).toEqual({
        authenticated: true,
        payload: mockPayload,
        role: "dj",
      });
    });

    it("should return authenticated false for expired token", async () => {
      vi.mocked(jose.jwtVerify).mockRejectedValue(
        new jose.errors.JWTExpired("Token expired", {} as jose.JWTPayload)
      );

      const result = await verifyToken("expired-token");

      expect(result).toEqual({
        authenticated: false,
        error: "Token expired",
      });
    });

    it("should return authenticated false for invalid signature", async () => {
      vi.mocked(jose.jwtVerify).mockRejectedValue(
        new jose.errors.JWSSignatureVerificationFailed("Invalid signature")
      );

      const result = await verifyToken("invalid-signature-token");

      expect(result).toEqual({
        authenticated: false,
        error: "Invalid signature",
      });
    });

    it("should return authenticated false for claim validation failure", async () => {
      vi.mocked(jose.jwtVerify).mockRejectedValue(
        new jose.errors.JWTClaimValidationFailed("Claim validation failed", {} as jose.JWTPayload)
      );

      const result = await verifyToken("invalid-claims-token");

      expect(result).toEqual({
        authenticated: false,
        error: "Token validation failed",
      });
    });

    it("should return null role if payload has no role", async () => {
      const mockPayload = {
        sub: "user-123",
        email: "test@wxyc.org",
      };

      vi.mocked(jose.jwtVerify).mockResolvedValue({
        payload: mockPayload,
        protectedHeader: { alg: "RS256" },
      } as unknown as jose.JWTVerifyResult & jose.ResolvedKey);

      const result = await verifyToken("valid-token-no-role");

      expect(result).toEqual({
        authenticated: true,
        payload: mockPayload,
        role: null,
      });
    });

    it("should pass issuer and audience options to jwtVerify", async () => {
      vi.mocked(jose.jwtVerify).mockResolvedValue({
        payload: { sub: "user-123", role: "dj" },
        protectedHeader: { alg: "RS256" },
      } as unknown as jose.JWTVerifyResult & jose.ResolvedKey);

      await verifyToken("valid-token");

      const callArgs = vi.mocked(jose.jwtVerify).mock.calls[0];
      expect(callArgs[0]).toBe("valid-token");
      expect(callArgs[2]).toEqual(
        expect.objectContaining({
          issuer: "https://api.wxyc.org",
          audience: "https://api.wxyc.org",
        })
      );
    });

    it("should allow admin role", async () => {
      const mockPayload = {
        sub: "admin-1",
        role: "admin",
        email: "admin@wxyc.org",
      };

      vi.mocked(jose.jwtVerify).mockResolvedValue({
        payload: mockPayload,
        protectedHeader: { alg: "RS256" },
      } as unknown as jose.JWTVerifyResult & jose.ResolvedKey);

      const result = await verifyToken("admin-token");

      expect(result).toEqual({
        authenticated: true,
        payload: mockPayload,
        role: "admin",
      });
    });

    it("should omit issuer and audience when env vars are not set", async () => {
      vi.stubEnv("BETTER_AUTH_ISSUER", "");
      vi.stubEnv("BETTER_AUTH_AUDIENCE", "");

      vi.mocked(jose.jwtVerify).mockResolvedValue({
        payload: { sub: "user-123", role: "dj" },
        protectedHeader: { alg: "RS256" },
      } as unknown as jose.JWTVerifyResult & jose.ResolvedKey);

      await verifyToken("valid-token");

      const callArgs = vi.mocked(jose.jwtVerify).mock.calls[0];
      const options = callArgs[2] as Record<string, unknown> | undefined;
      expect(options?.issuer).toBeUndefined();
      expect(options?.audience).toBeUndefined();
    });
  });

  describe("verifyAuthHeader", () => {
    it("should return error for null header", async () => {
      const result = await verifyAuthHeader(null);

      expect(result).toEqual({
        authenticated: false,
        error: "No authorization header",
      });
    });

    it("should return error for non-Bearer header", async () => {
      const result = await verifyAuthHeader("Basic abc123");

      expect(result).toEqual({
        authenticated: false,
        error: "Invalid authorization format",
      });
    });

    it("should return error for empty Bearer token", async () => {
      const result = await verifyAuthHeader("Bearer ");

      expect(result).toEqual({
        authenticated: false,
        error: "No token provided",
      });
    });

    it("should verify valid Bearer token", async () => {
      const mockPayload = {
        sub: "user-123",
        role: "musicDirector",
      };

      vi.mocked(jose.jwtVerify).mockResolvedValue({
        payload: mockPayload,
        protectedHeader: { alg: "RS256" },
      } as unknown as jose.JWTVerifyResult & jose.ResolvedKey);

      const result = await verifyAuthHeader("Bearer valid-token");

      expect(result).toEqual({
        authenticated: true,
        payload: mockPayload,
        role: "musicDirector",
      });
    });
  });
});
