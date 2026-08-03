import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth, isDJRole, DJ_ROLES } from "../auth";

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
  isDJRole: (role: string | null | undefined) =>
    ["dj", "musicDirector", "stationManager"].includes(role as string),
  DJ_ROLES: ["dj", "musicDirector", "stationManager"],
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

// Test component that uses the auth hook
function TestComponent() {
  const {
    isLoading,
    isAuthenticated,
    user,
    userRole,
    login,
    logout,
    getToken,
  } = useAuth();

  return (
    <div>
      <div data-testid="loading">{isLoading ? "loading" : "ready"}</div>
      <div data-testid="authenticated">
        {isAuthenticated ? "authenticated" : "not-authenticated"}
      </div>
      <div data-testid="user-name">{user?.name ?? "no-user"}</div>
      <div data-testid="user-role">{userRole ?? "no-role"}</div>
      <button
        onClick={async () => {
          const result = await login("testuser", "password");
          document.body.setAttribute(
            "data-login-result",
            result.success ? "success" : result.error
          );
        }}
      >
        Login
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

describe("isDJRole", () => {
  it("should return true for dj role", () => {
    expect(isDJRole("dj")).toBe(true);
  });

  it("should return true for musicDirector role", () => {
    expect(isDJRole("musicDirector")).toBe(true);
  });

  it("should return true for stationManager role", () => {
    expect(isDJRole("stationManager")).toBe(true);
  });

  it("should return false for member role", () => {
    expect(isDJRole("member")).toBe(false);
  });

  it("should return false for null", () => {
    expect(isDJRole(null)).toBe(false);
  });

  it("should return false for undefined", () => {
    expect(isDJRole(undefined)).toBe(false);
  });
});

describe("DJ_ROLES", () => {
  it("should contain expected roles", () => {
    expect(DJ_ROLES).toEqual(["dj", "musicDirector", "stationManager"]);
  });
});
