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

    it("should populate session when user is logged in", async () => {
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
        expect(screen.getByTestId("user-name").textContent).toBe("Test DJ");
        expect(screen.getByTestId("user-role").textContent).toBe("dj");
        expect(screen.getByTestId("authenticated").textContent).toBe(
          "authenticated"
        );
      });
    });

    it("should not be authenticated without DJ role", async () => {
      mockGetSession.mockResolvedValue({
        data: {
          session: { id: "session-1" },
          user: { id: "user-1", name: "Member", role: "member" },
        },
      });

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
          user: { id: "user-1", name: "Test DJ", role: "dj" },
        },
      });

      await user.click(screen.getByText("Login"));

      await waitFor(() => {
        expect(mockSignInUsername).toHaveBeenCalledWith({
          username: "testuser",
          password: "password",
        });
      });
    });

    it("should return success on successful login", async () => {
      const user = userEvent.setup();
      mockGetSession
        .mockResolvedValueOnce({ data: null })
        .mockResolvedValueOnce({
          data: {
            session: { id: "session-1" },
            user: { id: "user-1", name: "Test DJ", role: "dj" },
          },
        });
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

    it("should return error when user lacks DJ role", async () => {
      const user = userEvent.setup();
      mockGetSession
        .mockResolvedValueOnce({ data: null })
        .mockResolvedValueOnce({
          data: {
            session: { id: "session-1" },
            user: { id: "user-1", name: "Member", role: "member" },
          },
        });
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
          "Your account does not have archive access"
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
          user: { id: "user-1", name: "Test DJ", role: "dj" },
        },
      });
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
          user: { id: "user-1", name: "Test DJ", role: "dj" },
        },
      });
      mockGetJWTToken.mockResolvedValue("jwt-token-123");

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
        expect(document.body.getAttribute("data-token")).toBe("jwt-token-123");
      });
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
