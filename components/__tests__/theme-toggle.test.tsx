import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "../theme-toggle";

// Mock next-themes
const mockSetTheme = vi.fn();

vi.mock("next-themes", () => ({
  useTheme: () => ({
    setTheme: mockSetTheme,
    theme: "system",
  }),
}));

describe("ThemeToggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("renders theme toggle button", () => {
      render(<ThemeToggle />);

      expect(screen.getByRole("button", { name: /toggle theme/i })).toBeInTheDocument();
    });

    it("has screen reader accessible text", () => {
      render(<ThemeToggle />);

      expect(screen.getByText("Toggle theme")).toBeInTheDocument();
    });
  });

  describe("dropdown menu", () => {
    it("opens dropdown when button is clicked", async () => {
      const user = userEvent.setup();

      render(<ThemeToggle />);

      await user.click(screen.getByRole("button", { name: /toggle theme/i }));

      // Menu items should be visible
      expect(screen.getByRole("menuitem", { name: /light/i })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: /dark/i })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: /system/i })).toBeInTheDocument();
    });

    it("shows Light option with sun icon", async () => {
      const user = userEvent.setup();

      render(<ThemeToggle />);

      await user.click(screen.getByRole("button", { name: /toggle theme/i }));

      const lightOption = screen.getByRole("menuitem", { name: /light/i });
      expect(lightOption).toBeInTheDocument();
      expect(lightOption.textContent).toContain("Light");
    });

    it("shows Dark option with moon icon", async () => {
      const user = userEvent.setup();

      render(<ThemeToggle />);

      await user.click(screen.getByRole("button", { name: /toggle theme/i }));

      const darkOption = screen.getByRole("menuitem", { name: /dark/i });
      expect(darkOption).toBeInTheDocument();
      expect(darkOption.textContent).toContain("Dark");
    });

    it("shows System option with monitor icon", async () => {
      const user = userEvent.setup();

      render(<ThemeToggle />);

      await user.click(screen.getByRole("button", { name: /toggle theme/i }));

      const systemOption = screen.getByRole("menuitem", { name: /system/i });
      expect(systemOption).toBeInTheDocument();
      expect(systemOption.textContent).toContain("System");
    });
  });

  describe("theme selection", () => {
    it("calls setTheme with 'light' when Light is selected", async () => {
      const user = userEvent.setup();

      render(<ThemeToggle />);

      await user.click(screen.getByRole("button", { name: /toggle theme/i }));
      await user.click(screen.getByRole("menuitem", { name: /light/i }));

      expect(mockSetTheme).toHaveBeenCalledWith("light");
    });

    it("calls setTheme with 'dark' when Dark is selected", async () => {
      const user = userEvent.setup();

      render(<ThemeToggle />);

      await user.click(screen.getByRole("button", { name: /toggle theme/i }));
      await user.click(screen.getByRole("menuitem", { name: /dark/i }));

      expect(mockSetTheme).toHaveBeenCalledWith("dark");
    });

    it("calls setTheme with 'system' when System is selected", async () => {
      const user = userEvent.setup();

      render(<ThemeToggle />);

      await user.click(screen.getByRole("button", { name: /toggle theme/i }));
      await user.click(screen.getByRole("menuitem", { name: /system/i }));

      expect(mockSetTheme).toHaveBeenCalledWith("system");
    });
  });

  describe("menu close behavior", () => {
    it("closes menu after selecting an option", async () => {
      const user = userEvent.setup();

      render(<ThemeToggle />);

      await user.click(screen.getByRole("button", { name: /toggle theme/i }));

      expect(screen.getByRole("menuitem", { name: /light/i })).toBeInTheDocument();

      await user.click(screen.getByRole("menuitem", { name: /light/i }));

      await waitFor(() => {
        expect(screen.queryByRole("menuitem", { name: /light/i })).not.toBeInTheDocument();
      });
    });

    it("closes menu when pressing Escape", async () => {
      const user = userEvent.setup();

      render(<ThemeToggle />);

      await user.click(screen.getByRole("button", { name: /toggle theme/i }));

      expect(screen.getByRole("menuitem", { name: /light/i })).toBeInTheDocument();

      await user.keyboard("{Escape}");

      await waitFor(() => {
        expect(screen.queryByRole("menuitem", { name: /light/i })).not.toBeInTheDocument();
      });
    });
  });
});
