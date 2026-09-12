import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  });

  // Claim validation is opt-in through env vars. Unset, verification is by
  // signature alone — which is the behavior that shipped before these vars
  // existed, so an unconfigured deployment keeps working rather than locking
  // everyone out the moment this lands.
  describe("issuer and audience claim validation", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    /** Fresh module instance, so the once-only warning flag starts unset. */
    async function freshModule() {
      vi.resetModules();
      return import("../jwt-utils");
    }

    function mockVerifyOk() {
      vi.mocked(jose.jwtVerify).mockResolvedValue({
        payload: { sub: "user-123", role: "dj" },
        protectedHeader: { alg: "EdDSA" },
        key: new Uint8Array(),
      } as unknown as jose.JWTVerifyResult & jose.ResolvedKey);
    }

    it("passes both claims to jose when configured", async () => {
      vi.stubEnv("BETTER_AUTH_ISSUER", "https://api.wxyc.org");
      vi.stubEnv("BETTER_AUTH_AUDIENCE", "https://api.wxyc.org");
      mockVerifyOk();
      const { verifyToken: verify } = await freshModule();

      await verify("token");

      const [token, , options] = vi.mocked(jose.jwtVerify).mock.calls[0];
      expect(token).toBe("token");
      expect(options).toEqual({
        issuer: "https://api.wxyc.org",
        audience: "https://api.wxyc.org",
      });
    });

    it("verifies by signature alone when neither is set", async () => {
      vi.stubEnv("BETTER_AUTH_ISSUER", "");
      vi.stubEnv("BETTER_AUTH_AUDIENCE", "");
      mockVerifyOk();
      const { verifyToken: verify } = await freshModule();

      await verify("token");

      const options = vi.mocked(jose.jwtVerify).mock.calls[0][2];
      expect(options).toEqual({});
    });

    it("passes whichever claim is configured when only one is", async () => {
      vi.stubEnv("BETTER_AUTH_ISSUER", "https://api.wxyc.org");
      vi.stubEnv("BETTER_AUTH_AUDIENCE", "");
      mockVerifyOk();
      const { verifyToken: verify } = await freshModule();

      await verify("token");

      const options = vi.mocked(jose.jwtVerify).mock.calls[0][2];
      expect(options).toEqual({ issuer: "https://api.wxyc.org" });
    });

    it("warns once about a partial configuration, not on every call", async () => {
      vi.stubEnv("BETTER_AUTH_ISSUER", "https://api.wxyc.org");
      vi.stubEnv("BETTER_AUTH_AUDIENCE", "");
      mockVerifyOk();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { verifyToken: verify } = await freshModule();

      await verify("token");
      await verify("token");
      await verify("token");

      // Once per process: this runs on every signed-url request, and a warning
      // per request would bury the logs it is meant to stand out in.
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatch(/BETTER_AUTH_AUDIENCE/);
      warn.mockRestore();
    });

    it("stays quiet when fully configured", async () => {
      vi.stubEnv("BETTER_AUTH_ISSUER", "https://api.wxyc.org");
      vi.stubEnv("BETTER_AUTH_AUDIENCE", "https://api.wxyc.org");
      mockVerifyOk();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { verifyToken: verify } = await freshModule();

      await verify("token");

      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it("rejects a token whose issuer does not match", async () => {
      vi.stubEnv("BETTER_AUTH_ISSUER", "https://api.wxyc.org");
      vi.stubEnv("BETTER_AUTH_AUDIENCE", "https://api.wxyc.org");
      vi.mocked(jose.jwtVerify).mockRejectedValue(
        new jose.errors.JWTClaimValidationFailed(
          'unexpected "iss" claim value',
          {} as jose.JWTPayload,
          "iss"
        )
      );
      const { verifyToken: verify } = await freshModule();

      const result = await verify("token-from-elsewhere");

      expect(result.authenticated).toBe(false);
    });
  });

  // The claim is arbitrary until checked. Consumers rank it with
  // roleToAuthorization, which calls .toLowerCase(), so anything that is not a
  // recognized role string has to become null here rather than flowing onward
  // and throwing at the call site.
  describe("role claim narrowing", () => {
    function verifyWithRole(role: unknown) {
      vi.mocked(jose.jwtVerify).mockResolvedValue({
        payload: { sub: "user-123", role },
        protectedHeader: { alg: "EdDSA" },
        key: new Uint8Array(),
      } as unknown as jose.JWTVerifyResult & jose.ResolvedKey);
      return verifyToken("token");
    }

    it.each([
      ["a number", 42],
      ["an array", ["dj"]],
      ["an object", { role: "dj" }],
      ["a boolean", true],
      ["an unrecognized string", "wizard"],
      ["a prototype key", "constructor"],
    ])("resolves %s to null", async (_label, role) => {
      const result = await verifyWithRole(role);
      expect(result).toMatchObject({ authenticated: true, role: null });
    });

    it("canonicalizes an accepted alias to its station role", async () => {
      const result = await verifyWithRole("admin");
      expect(result).toMatchObject({
        authenticated: true,
        role: "stationManager",
      });
    });

    it("passes a canonical role through unchanged", async () => {
      const result = await verifyWithRole("musicDirector");
      expect(result).toMatchObject({
        authenticated: true,
        role: "musicDirector",
      });
    });
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
        key: new Uint8Array(),
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
        new jose.errors.JWTExpired("Token expired", {})
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
        new jose.errors.JWTClaimValidationFailed("Claim validation failed", {})
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
        key: new Uint8Array(),
      } as unknown as jose.JWTVerifyResult & jose.ResolvedKey);

      const result = await verifyToken("valid-token-no-role");

      expect(result).toEqual({
        authenticated: true,
        payload: mockPayload,
        role: null,
      });
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
        key: new Uint8Array(),
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
