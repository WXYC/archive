import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginDialog } from "../login-dialog";

// Mock auth - we control these values in tests
let mockIsAuthenticated = false;
let mockIsLoading = false;
let mockUser: { name: string; id: string; email: string } | null = null;

const mockLogin = vi.fn();
const mockLogout = vi.fn();
const mockSendLoginCode = vi.fn();
const mockVerifyLoginCode = vi.fn();

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    login: mockLogin,
    sendLoginCode: mockSendLoginCode,
    verifyLoginCode: mockVerifyLoginCode,
    logout: mockLogout,
    isAuthenticated: mockIsAuthenticated,
    isLoading: mockIsLoading,
    user: mockUser,
  }),
}));

// happy-dom v20 does not provide localStorage. The dialog treats its absence
// as "no preference stored", which is itself worth exercising, so the shim is
// installed per-test rather than globally.
function installLocalStorage(): Storage {
  const store = new Map<string, string>();
  const shim = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
  vi.stubGlobal("localStorage", shim);
  return shim;
}

type Ui = ReturnType<typeof userEvent.setup>;

/** Open the dialog. It lands on the emailed-code form by default. */
async function openDialog(user: Ui) {
  await user.click(screen.getByRole("button", { name: /dj sign in/i }));
}

/** Open the dialog and switch to the password form. */
async function openPasswordForm(user: Ui) {
  await openDialog(user);
  await user.click(screen.getByRole("button", { name: /use a password/i }));
}

/** Open the dialog, request a code, and land on the code-entry form. */
async function reachCodeEntry(user: Ui, identifier = "djhandle") {
  await openDialog(user);
  await user.type(screen.getByLabelText(/username or email/i), identifier);
  await user.click(screen.getByRole("button", { name: /email me a code/i }));
  return screen.findByLabelText(/login code/i);
}

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

    // The emailed code is the default, matching dj.wxyc.org, so no password
    // field is present until the user asks for one.
    it("opens on the emailed-code form, with no password field", async () => {
      const user = userEvent.setup();

      render(<LoginDialog />);
      await openDialog(user);

      expect(screen.getByLabelText(/username or email/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /email me a code/i })
      ).toBeInTheDocument();
    });

    it("shows the password form once the user switches to it", async () => {
      const user = userEvent.setup();

      render(<LoginDialog />);
      await openPasswordForm(user);

      expect(screen.getByLabelText(/username or email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();

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

      await openPasswordForm(user);

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

      await openPasswordForm(user);

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

      await openPasswordForm(user);

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

      await openPasswordForm(user);

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

      await openPasswordForm(user);

      const usernameInput = screen.getByLabelText(/username or email/i);
      const passwordInput = screen.getByLabelText(/password/i);

      await user.type(usernameInput, "baduser");
      await user.type(passwordInput, "wrongpassword");

      await user.click(screen.getByRole("button", { name: /^sign in$/i }));

      await waitFor(() => {
        expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
      });
    });

    it("presents the retired shared credential as an alert, not a field error", async () => {
      const user = userEvent.setup();
      mockLogin.mockResolvedValue({
        success: false,
        kind: "retired-shared-credential",
        error:
          "The shared archive login has been retired. Sign in with your own WXYC DJ account — if you don't have one yet, you can set it up at dj.wxyc.org.",
      });

      render(<LoginDialog />);

      await openPasswordForm(user);
      await user.type(screen.getByLabelText(/username or email/i), "wxycarch");
      await user.type(screen.getByLabelText(/password/i), "allthesignal");
      await user.click(screen.getByRole("button", { name: /^sign in$/i }));

      // role=alert is the load-bearing part: this is guidance about what
      // changed, not a "you typed it wrong" message, and screen readers
      // should announce it as such.
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(/retired/i);

      // And it offers a way to act on the guidance.
      const link = screen.getByRole("link", { name: /dj\.wxyc\.org/i });
      expect(link).toHaveAttribute("href", "https://dj.wxyc.org");
    });

    it("renders an ordinary failure as a plain message with no alert role", async () => {
      const user = userEvent.setup();
      mockLogin.mockResolvedValue({
        success: false,
        error: "Invalid username or password",
      });

      render(<LoginDialog />);

      await openPasswordForm(user);
      await user.type(screen.getByLabelText(/username or email/i), "someone");
      await user.type(screen.getByLabelText(/password/i), "nope");
      await user.click(screen.getByRole("button", { name: /^sign in$/i }));

      await waitFor(() => {
        expect(
          screen.getByText("Invalid username or password")
        ).toBeInTheDocument();
      });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("keeps dialog open on failed login", async () => {
      const user = userEvent.setup();
      mockLogin.mockResolvedValue({
        success: false,
        error: "Invalid credentials",
      });

      render(<LoginDialog />);

      await openPasswordForm(user);

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

      await openPasswordForm(user);

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

  describe("emailed code sign-in", () => {
    it("requests a code for the typed identifier and moves to code entry", async () => {
      const user = userEvent.setup();
      mockSendLoginCode.mockResolvedValue({
        success: true,
        email: "dj@wxyc.org",
      });

      render(<LoginDialog />);
      await reachCodeEntry(user, "djhandle");

      expect(mockSendLoginCode).toHaveBeenCalledWith("djhandle");
      // Naming the address matters: a DJ who signed in by username may not
      // recall which mailbox the account uses.
      expect(screen.getByText(/dj@wxyc\.org/)).toBeInTheDocument();
    });

    it("verifies the code against the resolved address and closes", async () => {
      const user = userEvent.setup();
      mockSendLoginCode.mockResolvedValue({
        success: true,
        email: "dj@wxyc.org",
      });
      mockVerifyLoginCode.mockResolvedValue({ success: true });

      render(<LoginDialog />);
      const codeField = await reachCodeEntry(user);

      await user.type(codeField, "123456");
      await user.click(screen.getByRole("button", { name: /^sign in$/i }));

      await waitFor(() => {
        expect(mockVerifyLoginCode).toHaveBeenCalledWith(
          "dj@wxyc.org",
          "123456"
        );
      });
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    it("keeps the user on the code form when the code is rejected", async () => {
      const user = userEvent.setup();
      mockSendLoginCode.mockResolvedValue({
        success: true,
        email: "dj@wxyc.org",
      });
      mockVerifyLoginCode.mockResolvedValue({
        success: false,
        error: "That code has expired. Please request a new one.",
      });

      render(<LoginDialog />);
      const codeField = await reachCodeEntry(user);

      await user.type(codeField, "000000");
      await user.click(screen.getByRole("button", { name: /^sign in$/i }));

      await waitFor(() => {
        expect(screen.getByText(/expired/i)).toBeInTheDocument();
      });
      expect(screen.getByLabelText(/login code/i)).toBeInTheDocument();
    });

    it("does not advance past the identifier form when the lookup fails", async () => {
      const user = userEvent.setup();
      mockSendLoginCode.mockResolvedValue({
        success: false,
        error: "No account matches that username or email.",
      });

      render(<LoginDialog />);
      await openDialog(user);
      await user.type(screen.getByLabelText(/username or email/i), "nobody");
      await user.click(screen.getByRole("button", { name: /email me a code/i }));

      await waitFor(() => {
        expect(screen.getByText(/no account matches/i)).toBeInTheDocument();
      });
      expect(screen.queryByLabelText(/login code/i)).not.toBeInTheDocument();
    });

    it("can resend a code and says so", async () => {
      const user = userEvent.setup();
      mockSendLoginCode.mockResolvedValue({
        success: true,
        email: "dj@wxyc.org",
      });

      render(<LoginDialog />);
      await reachCodeEntry(user);
      mockSendLoginCode.mockClear();

      await user.click(screen.getByRole("button", { name: /resend code/i }));

      await waitFor(() => {
        expect(screen.getByText(/on its way/i)).toBeInTheDocument();
      });
      expect(mockSendLoginCode).toHaveBeenCalledTimes(1);
    });

    it("shows the retired-credential alert from the code form too", async () => {
      const user = userEvent.setup();
      mockSendLoginCode.mockResolvedValue({
        success: false,
        kind: "retired-shared-credential",
        error: "The shared archive login has been retired. … dj.wxyc.org.",
      });

      render(<LoginDialog />);
      await openDialog(user);
      await user.type(screen.getByLabelText(/username or email/i), "wxycarch");
      await user.click(screen.getByRole("button", { name: /email me a code/i }));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(/retired/i);
    });
  });

  describe("method preference", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("reopens on the password form once the user has chosen it", async () => {
      installLocalStorage();
      const user = userEvent.setup();

      render(<LoginDialog />);
      await openPasswordForm(user);
      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });

      await openDialog(user);

      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    });

    it("falls back to the emailed code when no preference is stored", async () => {
      installLocalStorage();
      const user = userEvent.setup();

      render(<LoginDialog />);
      await openDialog(user);

      expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /email me a code/i })
      ).toBeInTheDocument();
    });

    it("still opens when localStorage is unavailable", async () => {
      const user = userEvent.setup();

      render(<LoginDialog />);
      await openDialog(user);

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /email me a code/i })
      ).toBeInTheDocument();
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
