import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginDialog } from "../login-dialog";

// Mock auth - we control these values in tests
let mockIsAuthenticated = false;
let mockIsLoading = false;
let mockUser: { name: string; id: string; email: string } | null = null;

const mockLogin = vi.fn();
const mockLogout = vi.fn();

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    login: mockLogin,
    logout: mockLogout,
    isAuthenticated: mockIsAuthenticated,
    isLoading: mockIsLoading,
    user: mockUser,
  }),
}));

describe("LoginDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = false;
    mockIsLoading = false;
    mockUser = null;
  });

  describe("loading state", () => {
    it("shows disabled Loading button when isLoading is true", () => {
      mockIsLoading = true;

      render(<LoginDialog />);

      const button = screen.getByRole("button", { name: /loading/i });
      expect(button).toBeInTheDocument();
      expect(button).toBeDisabled();
    });
  });

  describe("authenticated state", () => {
    it("shows user name and Sign Out button when authenticated", () => {
      mockIsAuthenticated = true;
      mockUser = { name: "Test DJ", id: "1", email: "test@wxyc.org" };

      render(<LoginDialog />);

      expect(screen.getByText("Test DJ")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /sign out/i })
      ).toBeInTheDocument();
    });

    it("calls logout when Sign Out is clicked", async () => {
      const user = userEvent.setup();
      mockLogout.mockResolvedValue(undefined);
      mockIsAuthenticated = true;
      mockUser = { name: "Test DJ", id: "1", email: "test@wxyc.org" };

      render(<LoginDialog />);

      await user.click(screen.getByRole("button", { name: /sign out/i }));

      expect(mockLogout).toHaveBeenCalled();
    });
  });

  describe("unauthenticated state", () => {
    it("shows DJ Sign In button when not authenticated", () => {
      render(<LoginDialog />);

      expect(
        screen.getByRole("button", { name: /dj sign in/i })
      ).toBeInTheDocument();
    });

    it("opens dialog when DJ Sign In is clicked", async () => {
      const user = userEvent.setup();

      render(<LoginDialog />);

      await user.click(screen.getByRole("button", { name: /dj sign in/i }));

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: /dj sign in/i })
      ).toBeInTheDocument();
    });

    it("shows username and password fields in dialog", async () => {
      const user = userEvent.setup();

      render(<LoginDialog />);

      await user.click(screen.getByRole("button", { name: /dj sign in/i }));

      expect(screen.getByLabelText(/username or email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    });

    it("shows Sign In submit button in dialog", async () => {
      const user = userEvent.setup();

      render(<LoginDialog />);

      await user.click(screen.getByRole("button", { name: /dj sign in/i }));

      const submitButton = screen.getByRole("button", { name: /^sign in$/i });
      expect(submitButton).toBeInTheDocument();
      expect(submitButton).toHaveAttribute("type", "submit");
    });
  });

  describe("form submission", () => {
    it("calls login with credentials on form submit", async () => {
      const user = userEvent.setup();
      mockLogin.mockResolvedValue({ success: true });

      render(<LoginDialog />);

      await user.click(screen.getByRole("button", { name: /dj sign in/i }));

      const usernameInput = screen.getByLabelText(/username or email/i);
      const passwordInput = screen.getByLabelText(/password/i);

      await user.type(usernameInput, "testuser");
      await user.type(passwordInput, "password123");

      await user.click(screen.getByRole("button", { name: /^sign in$/i }));

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith("testuser", "password123");
      });
    });

    it("shows Signing in... while submitting", async () => {
      const user = userEvent.setup();
      let resolveLogin: (value: { success: boolean }) => void;
      mockLogin.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveLogin = resolve;
          })
      );

      render(<LoginDialog />);

      await user.click(screen.getByRole("button", { name: /dj sign in/i }));

      const usernameInput = screen.getByLabelText(/username or email/i);
      const passwordInput = screen.getByLabelText(/password/i);

      await user.type(usernameInput, "testuser");
      await user.type(passwordInput, "password123");

      await user.click(screen.getByRole("button", { name: /^sign in$/i }));

      expect(
        screen.getByRole("button", { name: /signing in/i })
      ).toBeInTheDocument();

      // Resolve the promise to clean up
      resolveLogin!({ success: true });
    });

    it("disables inputs while submitting", async () => {
      const user = userEvent.setup();
      let resolveLogin: (value: { success: boolean }) => void;
      mockLogin.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveLogin = resolve;
          })
      );

      render(<LoginDialog />);

      await user.click(screen.getByRole("button", { name: /dj sign in/i }));

      const usernameInput = screen.getByLabelText(/username or email/i);
      const passwordInput = screen.getByLabelText(/password/i);

      await user.type(usernameInput, "testuser");
      await user.type(passwordInput, "password123");

      await user.click(screen.getByRole("button", { name: /^sign in$/i }));

      expect(usernameInput).toBeDisabled();
      expect(passwordInput).toBeDisabled();

      // Resolve the promise to clean up
      resolveLogin!({ success: true });
    });

    it("closes dialog on successful login", async () => {
      const user = userEvent.setup();
      mockLogin.mockResolvedValue({ success: true });

      render(<LoginDialog />);

      await user.click(screen.getByRole("button", { name: /dj sign in/i }));

      const usernameInput = screen.getByLabelText(/username or email/i);
      const passwordInput = screen.getByLabelText(/password/i);

      await user.type(usernameInput, "testuser");
      await user.type(passwordInput, "password123");

      await user.click(screen.getByRole("button", { name: /^sign in$/i }));

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });
  });

  describe("error handling", () => {
    it("displays error message on failed login", async () => {
      const user = userEvent.setup();
      mockLogin.mockResolvedValue({
        success: false,
        error: "Invalid credentials",
      });

      render(<LoginDialog />);

      await user.click(screen.getByRole("button", { name: /dj sign in/i }));

      const usernameInput = screen.getByLabelText(/username or email/i);
      const passwordInput = screen.getByLabelText(/password/i);

      await user.type(usernameInput, "baduser");
      await user.type(passwordInput, "wrongpassword");

      await user.click(screen.getByRole("button", { name: /^sign in$/i }));

      await waitFor(() => {
        expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
      });
    });

    it("keeps dialog open on failed login", async () => {
      const user = userEvent.setup();
      mockLogin.mockResolvedValue({
        success: false,
        error: "Invalid credentials",
      });

      render(<LoginDialog />);

      await user.click(screen.getByRole("button", { name: /dj sign in/i }));

      const usernameInput = screen.getByLabelText(/username or email/i);
      const passwordInput = screen.getByLabelText(/password/i);

      await user.type(usernameInput, "baduser");
      await user.type(passwordInput, "wrongpassword");

      await user.click(screen.getByRole("button", { name: /^sign in$/i }));

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });
    });

    it("clears error on new submit attempt", async () => {
      const user = userEvent.setup();
      mockLogin.mockResolvedValue({
        success: false,
        error: "Invalid credentials",
      });

      render(<LoginDialog />);

      await user.click(screen.getByRole("button", { name: /dj sign in/i }));

      const usernameInput = screen.getByLabelText(/username or email/i);
      const passwordInput = screen.getByLabelText(/password/i);

      await user.type(usernameInput, "baduser");
      await user.type(passwordInput, "wrongpassword");

      await user.click(screen.getByRole("button", { name: /^sign in$/i }));

      await waitFor(() => {
        expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
      });

      // Now submit again successfully
      mockLogin.mockResolvedValue({ success: true });

      await user.click(screen.getByRole("button", { name: /^sign in$/i }));

      await waitFor(() => {
        expect(
          screen.queryByText("Invalid credentials")
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("dialog close behavior", () => {
    it("closes dialog when pressing Escape", async () => {
      const user = userEvent.setup();

      render(<LoginDialog />);

      await user.click(screen.getByRole("button", { name: /dj sign in/i }));

      expect(screen.getByRole("dialog")).toBeInTheDocument();

      await user.keyboard("{Escape}");

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });
  });
});
