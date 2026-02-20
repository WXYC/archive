import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth, Authorization } from "../auth";

// Mock the auth client module
const mockGetSession = vi.fn();
const mockSignInUsername = vi.fn();
const mockSignInEmail = vi.fn();
const mockSignOut = vi.fn();
const mockGetJWTToken = vi.fn();

vi.mock("@wxyc/shared/auth-client", () => ({
  authClient: {
    getSession: () => mockGetSession(),
    signIn: {
      username: (params: { username: string; password: string }) =>
        mockSignInUsername(params),
      email: (params: { email: string; password: string }) =>
        mockSignInEmail(params),
    },
    signOut: () => mockSignOut(),
  },
  getJWTToken: () => mockGetJWTToken(),
  Authorization: { NO: 0, DJ: 1, MD: 2, SM: 3, ADMIN: 4 },
  roleToAuthorization: (role: string | null | undefined) => {
    if (!role) return 0;
    switch (role) {
      case "admin":
        return 4;
      case "stationManager":
        return 3;
      case "musicDirector":
        return 2;
      case "dj":
        return 1;
      default:
        return 0;
    }
  },
}));

const mockResolveEmail = vi.fn();
const mockSendVerificationOtp = vi.fn();
const mockSignInWithOtp = vi.fn();

vi.mock("../otp", () => ({
  resolveEmail: (identifier: string) => mockResolveEmail(identifier),
  sendVerificationOtp: (email: string) => mockSendVerificationOtp(email),
  signInWithOtp: (email: string, otp: string) => mockSignInWithOtp(email, otp),
}));

// Build a realistic (unsigned) JWT string whose payload decodes via jose's
// decodeJwt. The signature segment is not verified client-side, so any
// placeholder works here.
function b64url(obj: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function fakeJwt(payload: Record<string, unknown>): string {
  const header = { alg: "RS256", typ: "JWT" };
  return `${b64url(header)}.${b64url(payload)}.sig`;
}

// Test component that uses the auth hook. `identifier` defaults to a normal
// username so existing tests render it bare.
function TestComponent({ identifier = "testuser" }: { identifier?: string }) {
  const {
    isLoading,
    isAuthenticated,
    user,
    userRole,
    authorization,
    login,
    logout,
    getToken,
    sendLoginCode,
    verifyLoginCode,
  } = useAuth();

  return (
    <div>
      <div data-testid="loading">{isLoading ? "loading" : "ready"}</div>
      <div data-testid="authenticated">
        {isAuthenticated ? "authenticated" : "not-authenticated"}
      </div>
      <div data-testid="user-name">{user?.name ?? "no-user"}</div>
      <div data-testid="user-role">{userRole ?? "no-role"}</div>
      <div data-testid="authorization">{authorization}</div>
      <button
        onClick={async () => {
          const result = await login(identifier, "password");
          document.body.setAttribute(
            "data-login-result",
            result.success ? "success" : result.error
          );
          document.body.setAttribute(
            "data-login-kind",
            result.success ? "success" : (result.kind ?? "unspecified")
          );
        }}
      >
        Login
      </button>
      <button
        onClick={async () => {
          const result = await sendLoginCode(identifier);
          document.body.setAttribute(
            "data-send-code",
            result.success ? `sent:${result.email}` : result.error
          );
          document.body.setAttribute(
            "data-send-code-kind",
            result.success ? "success" : (result.kind ?? "unspecified")
          );
        }}
      >
        Send Code
      </button>
      <button
        onClick={async () => {
          const result = await verifyLoginCode("dj@wxyc.org", "123456");
          document.body.setAttribute(
            "data-verify-code",
            result.success ? "success" : result.error
          );
        }}
      >
        Verify Code
      </button>
      <button onClick={() => logout()}>Logout</button>
      <button
        onClick={async () => {
          const token = await getToken();
          document.body.setAttribute("data-token", token ?? "no-token");
        }}
      >
        Get Token
      </button>
    </div>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.removeAttribute("data-login-result");
    document.body.removeAttribute("data-login-kind");
    document.body.removeAttribute("data-send-code");
    document.body.removeAttribute("data-send-code-kind");
    document.body.removeAttribute("data-verify-code");
    document.body.removeAttribute("data-token");
  });

  describe("initial state", () => {
    it("should start with isLoading=true", async () => {
      mockGetSession.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      expect(screen.getByTestId("loading").textContent).toBe("loading");
    });

    it("should set isLoading=false after session check", async () => {
      mockGetSession.mockResolvedValue({ data: null });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("ready");
      });
    });

    it("should authenticate a plain DJ whose session.user.role is null but whose JWT station role is dj", async () => {
      // This mirrors production: the admin-plugin `user.role` is null for a
      // plain dj, and the real station role only lives in the JWT claim.
      mockGetSession.mockResolvedValue({
        data: {
          session: { id: "session-1" },
          user: { id: "user-1", name: "Test DJ", role: null },
        },
      });
      mockGetJWTToken.mockResolvedValue(fakeJwt({ sub: "user-1", role: "dj" }));

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("user-name").textContent).toBe("Test DJ");
        expect(screen.getByTestId("user-role").textContent).toBe("dj");
        expect(screen.getByTestId("authenticated").textContent).toBe(
          "authenticated"
        );
      });
    });

    it("should authenticate a stationManager whose session.user.role is the admin-plugin role but whose JWT station role is stationManager", async () => {
      mockGetSession.mockResolvedValue({
        data: {
          session: { id: "session-1" },
          user: { id: "user-1", name: "Station Manager", role: "admin" },
        },
      });
      mockGetJWTToken.mockResolvedValue(
        fakeJwt({ sub: "user-1", role: "stationManager" })
      );

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("user-role").textContent).toBe(
          "stationManager"
        );
        expect(screen.getByTestId("authenticated").textContent).toBe(
          "authenticated"
        );
      });
    });

    it("should not be authenticated for a non-DJ member with a member JWT role", async () => {
      mockGetSession.mockResolvedValue({
        data: {
          session: { id: "session-1" },
          user: { id: "user-1", name: "Member", role: null },
        },
      });
      mockGetJWTToken.mockResolvedValue(fakeJwt({ sub: "user-1", role: "member" }));

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("authenticated").textContent).toBe(
          "not-authenticated"
        );
      });
    });

    it("should not be authenticated when there is no JWT token", async () => {
      mockGetSession.mockResolvedValue({
        data: {
          session: { id: "session-1" },
          user: { id: "user-1", name: "Member", role: null },
        },
      });
      mockGetJWTToken.mockResolvedValue(null);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("authenticated").textContent).toBe(
          "not-authenticated"
        );
      });
    });

    it("should not be authenticated when the JWT is malformed and cannot be decoded", async () => {
      // Fail closed: a token that decodeJwt cannot parse yields no station
      // role, so the user is never treated as a DJ.
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockGetSession.mockResolvedValue({
        data: {
          session: { id: "session-1" },
          user: { id: "user-1", name: "Test DJ", role: null },
        },
      });
      mockGetJWTToken.mockResolvedValue("not-a-jwt");

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("authenticated").textContent).toBe(
          "not-authenticated"
        );
      });
      // Confirm the fail-closed path ran via the decode catch (an error was
      // logged), not merely the default null state. We assert only that the
      // decode failure was surfaced, not the exact wording, so rewording the
      // log message doesn't break a still-correct implementation.
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it("should not be authenticated when the JWT is already expired", async () => {
      // A decodable but expired token must not grant access off the stale
      // role claim; the server would reject it anyway.
      mockGetSession.mockResolvedValue({
        data: {
          session: { id: "session-1" },
          user: { id: "user-1", name: "Test DJ", role: null },
        },
      });
      // exp is seconds since the epoch; 1 is 1970, far in the past.
      mockGetJWTToken.mockResolvedValue(
        fakeJwt({ sub: "user-1", role: "dj", exp: 1 })
      );

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("authenticated").textContent).toBe(
          "not-authenticated"
        );
      });
    });

    it("should expose authorization level for dj role", async () => {
      mockGetSession.mockResolvedValue({
        data: {
          session: { id: "session-1" },
          user: { id: "user-1", name: "Test DJ", role: "dj" },
        },
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("authorization").textContent).toBe("1");
      });
    });

    it("should expose authorization 0 for unauthenticated user", async () => {
      mockGetSession.mockResolvedValue({ data: null });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("ready");
        expect(screen.getByTestId("authorization").textContent).toBe("0");
      });
    });

    it("should authenticate admin role users", async () => {
      mockGetSession.mockResolvedValue({
        data: {
          session: { id: "session-1" },
          user: { id: "admin-1", name: "Admin", role: "admin" },
        },
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("authenticated").textContent).toBe(
          "authenticated"
        );
        expect(screen.getByTestId("authorization").textContent).toBe("4");
      });
    });
  });

  describe("login", () => {
    it("should call signIn.username with correct params", async () => {
      const user = userEvent.setup();
      mockGetSession.mockResolvedValue({ data: null });
      mockSignInUsername.mockResolvedValue({ error: null });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("ready");
      });

      // Mock the session for after login
      mockGetSession.mockResolvedValue({
        data: {
          session: { id: "session-1" },
          user: { id: "user-1", name: "Test DJ", role: null },
        },
      });
      mockGetJWTToken.mockResolvedValue(fakeJwt({ sub: "user-1", role: "dj" }));

      await user.click(screen.getByText("Login"));

      await waitFor(() => {
        expect(mockSignInUsername).toHaveBeenCalledWith({
          username: "testuser",
          password: "password",
        });
      });
    });

    it("should return success for a DJ with session.user.role null but JWT role dj", async () => {
      const user = userEvent.setup();
      mockGetSession
        .mockResolvedValueOnce({ data: null })
        .mockResolvedValueOnce({
          data: {
            session: { id: "session-1" },
            user: { id: "user-1", name: "Test DJ", role: null },
          },
        });
      mockSignInUsername.mockResolvedValue({ error: null });
      mockGetJWTToken.mockResolvedValue(fakeJwt({ sub: "user-1", role: "dj" }));

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("ready");
      });

      await user.click(screen.getByText("Login"));

      await waitFor(() => {
        expect(document.body.getAttribute("data-login-result")).toBe("success");
      });
    });

    it("should return success for a stationManager with session.user.role admin but JWT role stationManager", async () => {
      const user = userEvent.setup();
      mockGetSession
        .mockResolvedValueOnce({ data: null })
        .mockResolvedValueOnce({
          data: {
            session: { id: "session-1" },
            user: { id: "user-1", name: "Station Manager", role: "admin" },
          },
        });
      mockSignInUsername.mockResolvedValue({ error: null });
      mockGetJWTToken.mockResolvedValue(
        fakeJwt({ sub: "user-1", role: "stationManager" })
      );

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("ready");
      });

      await user.click(screen.getByText("Login"));

      await waitFor(() => {
        expect(document.body.getAttribute("data-login-result")).toBe("success");
      });
    });

    it("should return error on failed login", async () => {
      const user = userEvent.setup();
      mockGetSession.mockResolvedValue({ data: null });
      mockSignInUsername.mockResolvedValue({
        error: { message: "Invalid credentials" },
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("ready");
      });

      await user.click(screen.getByText("Login"));

      await waitFor(() => {
        expect(document.body.getAttribute("data-login-result")).toBe(
          "Invalid credentials"
        );
      });
    });

    it("should return error when the JWT station role is not a DJ role", async () => {
      const user = userEvent.setup();
      mockGetSession
        .mockResolvedValueOnce({ data: null })
        .mockResolvedValueOnce({
          data: {
            session: { id: "session-1" },
            user: { id: "user-1", name: "Member", role: null },
          },
        });
      mockSignInUsername.mockResolvedValue({ error: null });
      mockGetJWTToken.mockResolvedValue(fakeJwt({ sub: "user-1", role: "member" }));

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("ready");
      });

      await user.click(screen.getByText("Login"));

      await waitFor(() => {
        expect(document.body.getAttribute("data-login-result")).toBe(
          "Your account does not have archive access"
        );
      });
    });

    it("should report a transient failure (not 'no access') when no JWT token is available after login", async () => {
      // A DJ whose token endpoint is momentarily unavailable must not be told
      // they lack access — that's the exact wrong message this fix removes.
      const user = userEvent.setup();
      mockGetSession
        .mockResolvedValueOnce({ data: null })
        .mockResolvedValueOnce({
          data: {
            session: { id: "session-1" },
            user: { id: "user-1", name: "Test DJ", role: null },
          },
        });
      mockSignInUsername.mockResolvedValue({ error: null });
      mockGetJWTToken.mockResolvedValue(null);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("ready");
      });

      await user.click(screen.getByText("Login"));

      await waitFor(() => {
        expect(document.body.getAttribute("data-login-result")).toBe(
          "Could not verify your archive access. Please try again."
        );
      });
    });

    // The session fetch that follows a successful credential check rejects
    // outright when the connection drops — better-auth's client issues a bare
    // fetch and never enables better-fetch's catchAllError. The DJ has to see
    // an error, not an unhandled rejection that leaves the dialog mid-submit.
    it("reports a failure when the post-sign-in session fetch rejects", async () => {
      const user = userEvent.setup();
      mockGetSession
        .mockResolvedValueOnce({ data: null })
        .mockRejectedValue(new TypeError("Failed to fetch"));
      mockSignInUsername.mockResolvedValue({ error: null });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("ready");
      });

      await user.click(screen.getByText("Login"));

      await waitFor(() => {
        expect(document.body.getAttribute("data-login-result")).toBe(
          "Could not verify your archive access. Please try again."
        );
      });
    });
  });

  // The shared archive account was retired 2026-09-12. Anyone still typing it
  // would otherwise get better-auth's generic "invalid username or password",
  // which does not explain what changed or what to do instead.
  describe("retired shared credential", () => {
    it.each([
      ["the exact username", "wxycarch"],
      ["an uppercased username", "WXYCARCH"],
      ["a mixed-case username", "WxycArch"],
      ["surrounding whitespace", "  wxycarch  "],
    ])(
      "reports %s as the retired shared account without contacting the auth server",
      async (_label, identifier) => {
        const user = userEvent.setup();
        mockGetSession.mockResolvedValue({ data: null });

        render(
          <AuthProvider>
            <TestComponent identifier={identifier} />
          </AuthProvider>
        );

        await waitFor(() => {
          expect(screen.getByTestId("loading").textContent).toBe("ready");
        });

        await user.click(screen.getByText("Login"));

        await waitFor(() => {
          expect(document.body.getAttribute("data-login-kind")).toBe(
            "retired-shared-credential"
          );
        });

        // Short-circuited locally: the retired account cannot authenticate, so
        // there is nothing to ask the server and no attempt to rate-limit.
        expect(mockSignInUsername).not.toHaveBeenCalled();
        expect(mockSignInEmail).not.toHaveBeenCalled();
      }
    );

    it("names the DJ sign-in destination so the user knows where to go", async () => {
      const user = userEvent.setup();
      mockGetSession.mockResolvedValue({ data: null });

      render(
        <AuthProvider>
          <TestComponent identifier="wxycarch" />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("ready");
      });

      await user.click(screen.getByText("Login"));

      await waitFor(() => {
        expect(document.body.getAttribute("data-login-result")).toContain(
          "dj.wxyc.org"
        );
      });
    });

    it("leaves an ordinary username untouched", async () => {
      const user = userEvent.setup();
      mockGetSession.mockResolvedValue({ data: null });
      mockSignInUsername.mockResolvedValue({
        error: { message: "Invalid username or password" },
      });

      render(
        <AuthProvider>
          <TestComponent identifier="wxycarchivist" />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("ready");
      });

      await user.click(screen.getByText("Login"));

      await waitFor(() => {
        expect(mockSignInUsername).toHaveBeenCalledWith({
          username: "wxycarchivist",
          password: "password",
        });
      });
      expect(document.body.getAttribute("data-login-kind")).not.toBe(
        "retired-shared-credential"
      );
    });
  });

  describe("sendLoginCode", () => {
    it("resolves the identifier and requests a code for the resolved address", async () => {
      const user = userEvent.setup();
      mockGetSession.mockResolvedValue({ data: null });
      mockResolveEmail.mockResolvedValue("dj@wxyc.org");
      mockSendVerificationOtp.mockResolvedValue({ ok: true });

      render(
        <AuthProvider>
          <TestComponent identifier="djhandle" />
        </AuthProvider>
      );
      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("ready");
      });

      await user.click(screen.getByText("Send Code"));

      await waitFor(() => {
        expect(document.body.getAttribute("data-send-code")).toBe(
          "sent:dj@wxyc.org"
        );
      });
      expect(mockResolveEmail).toHaveBeenCalledWith("djhandle");
      expect(mockSendVerificationOtp).toHaveBeenCalledWith("dj@wxyc.org");
    });

    it("does not send anything when no account matches", async () => {
      const user = userEvent.setup();
      mockGetSession.mockResolvedValue({ data: null });
      mockResolveEmail.mockResolvedValue(null);

      render(
        <AuthProvider>
          <TestComponent identifier="nobody" />
        </AuthProvider>
      );
      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("ready");
      });

      await user.click(screen.getByText("Send Code"));

      await waitFor(() => {
        expect(document.body.getAttribute("data-send-code")).toMatch(
          /no account/i
        );
      });
      expect(mockSendVerificationOtp).not.toHaveBeenCalled();
    });

    it("flags the retired shared credential here too, without a lookup", async () => {
      const user = userEvent.setup();
      mockGetSession.mockResolvedValue({ data: null });

      render(
        <AuthProvider>
          <TestComponent identifier="wxycarch" />
        </AuthProvider>
      );
      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("ready");
      });

      await user.click(screen.getByText("Send Code"));

      await waitFor(() => {
        expect(document.body.getAttribute("data-send-code-kind")).toBe(
          "retired-shared-credential"
        );
      });
      // Emailing a code to whatever that account resolves to would be worse
      // than useless, so the lookup never happens.
      expect(mockResolveEmail).not.toHaveBeenCalled();
      expect(mockSendVerificationOtp).not.toHaveBeenCalled();
    });
  });

  describe("verifyLoginCode", () => {
    it("applies the same station-role gate as a password sign-in", async () => {
      const user = userEvent.setup();
      mockSignInWithOtp.mockResolvedValue({ ok: true });
      mockGetSession
        .mockResolvedValueOnce({ data: null })
        .mockResolvedValue({
          data: {
            session: { id: "s1" },
            user: { id: "u1", name: "Test DJ", email: "dj@wxyc.org" },
          },
        });
      mockGetJWTToken.mockResolvedValue(
        fakeJwt({ role: "dj", exp: Math.floor(Date.now() / 1000) + 3600 })
      );

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("ready");
      });

      await user.click(screen.getByText("Verify Code"));

      await waitFor(() => {
        expect(document.body.getAttribute("data-verify-code")).toBe("success");
      });
    });

    it("refuses a non-DJ even with a valid code", async () => {
      const user = userEvent.setup();
      mockSignInWithOtp.mockResolvedValue({ ok: true });
      mockGetSession
        .mockResolvedValueOnce({ data: null })
        .mockResolvedValue({
          data: {
            session: { id: "s1" },
            user: { id: "u2", name: "Member", email: "m@wxyc.org" },
          },
        });
      mockGetJWTToken.mockResolvedValue(
        fakeJwt({ role: "member", exp: Math.floor(Date.now() / 1000) + 3600 })
      );

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("ready");
      });

      await user.click(screen.getByText("Verify Code"));

      await waitFor(() => {
        expect(document.body.getAttribute("data-verify-code")).toMatch(
          /does not have archive access/i
        );
      });
    });

    it("surfaces a rejected code without touching the session", async () => {
      const user = userEvent.setup();
      mockGetSession.mockResolvedValue({ data: null });
      mockSignInWithOtp.mockResolvedValue({
        ok: false,
        error: "That code has expired. Please request a new one.",
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("ready");
      });

      mockGetSession.mockClear();
      await user.click(screen.getByText("Verify Code"));

      await waitFor(() => {
        expect(document.body.getAttribute("data-verify-code")).toMatch(
          /expired/i
        );
      });
      expect(mockGetSession).not.toHaveBeenCalled();
    });

    it("reports a failure when the session fetch rejects after a valid code", async () => {
      const user = userEvent.setup();
      mockSignInWithOtp.mockResolvedValue({ ok: true });
      mockGetSession
        .mockResolvedValueOnce({ data: null })
        .mockRejectedValue(new TypeError("Failed to fetch"));

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("ready");
      });

      await user.click(screen.getByText("Verify Code"));

      await waitFor(() => {
        expect(document.body.getAttribute("data-verify-code")).toBe(
          "Could not verify your archive access. Please try again."
        );
      });
    });
  });

  describe("logout", () => {
    it("should call signOut and clear session", async () => {
      const user = userEvent.setup();
      mockGetSession.mockResolvedValue({
        data: {
          session: { id: "session-1" },
          user: { id: "user-1", name: "Test DJ", role: null },
        },
      });
      mockGetJWTToken.mockResolvedValue(fakeJwt({ sub: "user-1", role: "dj" }));
      mockSignOut.mockResolvedValue({});

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("user-name").textContent).toBe("Test DJ");
      });

      await user.click(screen.getByText("Logout"));

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalled();
        expect(screen.getByTestId("user-name").textContent).toBe("no-user");
      });
    });
  });

  describe("getToken", () => {
    it("should return null when not logged in", async () => {
      const user = userEvent.setup();
      mockGetSession.mockResolvedValue({ data: null });
      mockGetJWTToken.mockResolvedValue("test-token");

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("ready");
      });

      await user.click(screen.getByText("Get Token"));

      await waitFor(() => {
        expect(document.body.getAttribute("data-token")).toBe("no-token");
      });
    });

    it("should return JWT token when logged in", async () => {
      const user = userEvent.setup();
      mockGetSession.mockResolvedValue({
        data: {
          session: { id: "session-1" },
          user: { id: "user-1", name: "Test DJ", role: null },
        },
      });
      mockGetJWTToken.mockResolvedValue(fakeJwt({ sub: "user-1", role: "dj" }));

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("user-name").textContent).toBe("Test DJ");
      });

      await user.click(screen.getByText("Get Token"));

      await waitFor(() => {
        expect(document.body.getAttribute("data-token")).toBe(
          fakeJwt({ sub: "user-1", role: "dj" })
        );
      });
    });

    it("should reuse the JWT fetched during session resolution without re-fetching", async () => {
      const user = userEvent.setup();
      mockGetSession.mockResolvedValue({
        data: {
          session: { id: "session-1" },
          user: { id: "user-1", name: "Test DJ", role: null },
        },
      });
      mockGetJWTToken.mockResolvedValue(fakeJwt({ sub: "user-1", role: "dj" }));

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      // Once authenticated, the token fetched to resolve the station role is
      // cached, so getToken must not hit the token endpoint again.
      await waitFor(() => {
        expect(screen.getByTestId("authenticated").textContent).toBe(
          "authenticated"
        );
      });

      mockGetJWTToken.mockClear();
      await user.click(screen.getByText("Get Token"));

      await waitFor(() => {
        expect(document.body.getAttribute("data-token")).toBe(
          fakeJwt({ sub: "user-1", role: "dj" })
        );
      });
      expect(mockGetJWTToken).not.toHaveBeenCalled();
    });
  });
});
