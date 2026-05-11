// Covers the simple-auth code path in lib/auth.tsx. The `useSimpleAuth`
// constant is evaluated at module load, so each test stubs the env vars,
// resets the module registry, then dynamically imports the auth module.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// happy-dom v20 doesn't ship a localStorage by default; install an in-memory
// shim so AuthProvider's simple-auth persistence path can run in tests.
const memoryStore = new Map<string, string>();
const memoryLocalStorage = {
  getItem: (key: string) => memoryStore.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memoryStore.set(key, value);
  },
  removeItem: (key: string) => {
    memoryStore.delete(key);
  },
  clear: () => memoryStore.clear(),
  key: (i: number) => Array.from(memoryStore.keys())[i] ?? null,
  get length() {
    return memoryStore.size;
  },
};
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: memoryLocalStorage,
});
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: memoryLocalStorage,
});

const mockGetSession = vi.fn();
const mockGetJWTToken = vi.fn();

vi.mock("@wxyc/shared/auth-client", () => ({
  authClient: {
    getSession: () => mockGetSession(),
    signIn: { username: vi.fn(), email: vi.fn() },
    signOut: vi.fn(),
  },
  getJWTToken: () => mockGetJWTToken(),
  isDJRole: (role: string | null | undefined) =>
    ["dj", "musicDirector", "stationManager"].includes(role as string),
  DJ_ROLES: ["dj", "musicDirector", "stationManager"],
}));

const SIMPLE_USERNAME = "wxycarch";
const SIMPLE_PASSWORD = "shared-archive-password";

async function renderWithSimpleAuth() {
  vi.stubEnv("NEXT_PUBLIC_AUTH_USERNAME", SIMPLE_USERNAME);
  vi.stubEnv("NEXT_PUBLIC_AUTH_PASSWORD", SIMPLE_PASSWORD);
  vi.resetModules();
  const { AuthProvider, useAuth } = await import("../auth");

  function TestComponent() {
    const { isAuthenticated, getToken, login } = useAuth();
    return (
      <div>
        <div data-testid="authenticated">
          {isAuthenticated ? "yes" : "no"}
        </div>
        <button
          onClick={async () => {
            const result = await login(SIMPLE_USERNAME, SIMPLE_PASSWORD);
            document.body.setAttribute(
              "data-login",
              result.success ? "ok" : result.error
            );
          }}
        >
          Login
        </button>
        <button
          onClick={async () => {
            const token = await getToken();
            document.body.setAttribute("data-token", token ?? "null");
          }}
        >
          Get Token
        </button>
      </div>
    );
  }

  render(
    <AuthProvider>
      <TestComponent />
    </AuthProvider>
  );
}

describe("AuthProvider in simple-auth mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memoryStore.clear();
    document.body.removeAttribute("data-login");
    document.body.removeAttribute("data-token");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("starts unauthenticated when no simpleAuthed flag is set", async () => {
    await renderWithSimpleAuth();
    await waitFor(() => {
      expect(screen.getByTestId("authenticated").textContent).toBe("no");
    });
  });

  it("returns the shared password as the token after successful login", async () => {
    const user = userEvent.setup();
    await renderWithSimpleAuth();

    await user.click(screen.getByText("Login"));
    await waitFor(() => {
      expect(document.body.getAttribute("data-login")).toBe("ok");
    });

    await user.click(screen.getByText("Get Token"));
    await waitFor(() => {
      expect(document.body.getAttribute("data-token")).toBe(SIMPLE_PASSWORD);
    });
  });

  it("returns null when not simpleAuthed", async () => {
    const user = userEvent.setup();
    await renderWithSimpleAuth();

    await user.click(screen.getByText("Get Token"));
    await waitFor(() => {
      expect(document.body.getAttribute("data-token")).toBe("null");
    });
  });
});
