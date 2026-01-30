import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PostHogAuthSync } from "../PostHogAuthSync";

// Mock PostHog
const mockRegister = vi.fn();
const mockPostHog = { register: mockRegister };

vi.mock("posthog-js/react", () => ({
  usePostHog: () => mockPostHog,
}));

// Mock auth - we'll control these values in tests
let mockIsAuthenticated = false;
let mockIsLoading = true;
let mockLogin: () => void = () => {};
let mockLogout: () => void = () => {};

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    isAuthenticated: mockIsAuthenticated,
    isLoading: mockIsLoading,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Test wrapper that allows controlling auth state
function createTestComponent() {
  let setAuth: (auth: { isAuthenticated: boolean; isLoading: boolean }) => void;

  function TestWrapper() {
    return <PostHogAuthSync />;
  }

  return { TestWrapper };
}

describe("PostHogAuthSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = false;
    mockIsLoading = true;
  });

  it("should not register while auth is loading", () => {
    mockIsLoading = true;
    mockIsAuthenticated = false;

    render(<PostHogAuthSync />);

    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("should register is_logged_in: false when not authenticated", async () => {
    mockIsLoading = false;
    mockIsAuthenticated = false;

    render(<PostHogAuthSync />);

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith({ is_logged_in: false });
    });
  });

  it("should register is_logged_in: true when authenticated", async () => {
    mockIsLoading = false;
    mockIsAuthenticated = true;

    render(<PostHogAuthSync />);

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith({ is_logged_in: true });
    });
  });

  it("should update registration when auth state changes", async () => {
    mockIsLoading = false;
    mockIsAuthenticated = false;

    const { rerender } = render(<PostHogAuthSync />);

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith({ is_logged_in: false });
    });

    // Simulate login
    mockIsAuthenticated = true;
    rerender(<PostHogAuthSync />);

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith({ is_logged_in: true });
    });

    // Simulate logout
    mockIsAuthenticated = false;
    rerender(<PostHogAuthSync />);

    await waitFor(() => {
      expect(mockRegister).toHaveBeenLastCalledWith({ is_logged_in: false });
    });
  });

  it("should render nothing", () => {
    mockIsLoading = false;
    mockIsAuthenticated = false;

    const { container } = render(<PostHogAuthSync />);

    expect(container.firstChild).toBeNull();
  });
});
