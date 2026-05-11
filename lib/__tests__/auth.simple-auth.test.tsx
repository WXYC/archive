// Covers the simple-auth code path in lib/auth.tsx. The `useSimpleAuth`
// constant is evaluated at module load, so each test stubs the env vars,
// resets the module registry, then dynamically imports the auth module.

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// happy-dom v20 doesn't ship a localStorage by default. Install an in-memory
// shim only for the duration of this file so other test files (e.g. ones
// asserting SSR-like absence of window.localStorage) aren't affected.
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
  const originalGlobalLocalStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage"
  );
  const originalWindowLocalStorage = Object.getOwnPropertyDescriptor(
    window,
    "localStorage"
  );

  beforeAll(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: memoryLocalStorage,
    });
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: memoryLocalStorage,
    });
  });

  afterAll(() => {
    if (originalGlobalLocalStorage) {
      Object.defineProperty(globalThis, "localStorage", originalGlobalLocalStorage);
    } else {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
    if (originalWindowLocalStorage) {
      Object.defineProperty(window, "localStorage", originalWindowLocalStorage);
    } else {
      delete (window as unknown as { localStorage?: unknown }).localStorage;
    }
  });

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

  it("transitions to authenticated after successful login", async () => {
    const user = userEvent.setup();
    await renderWithSimpleAuth();

    expect(screen.getByTestId("authenticated").textContent).toBe("no");

    await user.click(screen.getByText("Login"));

    await waitFor(() => {
      expect(screen.getByTestId("authenticated").textContent).toBe("yes");
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
