import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareDialog } from "../share-dialog";
import { TooltipProvider } from "@/components/ui/tooltip";

// Mock window.location
const mockLocation = {
  origin: "https://archive.example.com",
  pathname: "/",
};
Object.defineProperty(window, "location", {
  value: mockLocation,
  writable: true,
});

// Create clipboard mock that will be set up fresh for each test
const mockWriteText = vi.fn();

// Helper to render with TooltipProvider (required for Tooltip components)
function renderWithTooltip(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

// Helper to get the share button (icon-only button with dialog trigger)
function getShareButton() {
  return screen.getByRole("button", { name: "" });
}

// Create date using year/month/day to avoid timezone issues
// Note: month is 0-indexed
const defaultProps = {
  selectedDate: new Date(2024, 0, 15), // January 15, 2024
  selectedHour: 14,
  currentTime: 1845, // 30 minutes 45 seconds
};

describe("ShareDialog", () => {
  beforeEach(() => {
    // Reset and set up clipboard mock
    mockWriteText.mockClear();
    mockWriteText.mockResolvedValue(undefined);

    // Use vi.stubGlobal for proper clipboard mocking
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: {
        writeText: mockWriteText,
      },
    });

    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("rendering", () => {
    it("renders share button with dialog trigger", () => {
      renderWithTooltip(<ShareDialog {...defaultProps} />);

      const button = getShareButton();
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute("aria-haspopup", "dialog");
    });

    it("disables share button when disabled prop is true", () => {
      renderWithTooltip(<ShareDialog {...defaultProps} disabled={true} />);

      expect(getShareButton()).toBeDisabled();
    });

    it("enables share button when disabled prop is false", () => {
      renderWithTooltip(<ShareDialog {...defaultProps} disabled={false} />);

      expect(getShareButton()).not.toBeDisabled();
    });
  });

  describe("dialog interaction", () => {
    it("opens dialog when share button is clicked", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      renderWithTooltip(<ShareDialog {...defaultProps} />);

      await user.click(getShareButton());

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Share Archive")).toBeInTheDocument();
    });

    it("shows include time checkbox in dialog", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      renderWithTooltip(<ShareDialog {...defaultProps} />);

      await user.click(getShareButton());

      expect(screen.getByLabelText(/include current playback position/i)).toBeInTheDocument();
    });

    it("shows share URL input in dialog", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      renderWithTooltip(<ShareDialog {...defaultProps} />);

      await user.click(getShareButton());

      const urlInput = screen.getByRole("textbox");
      expect(urlInput).toBeInTheDocument();
      expect(urlInput).toHaveAttribute("readonly");
    });

    it("shows copy button in dialog", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      renderWithTooltip(<ShareDialog {...defaultProps} />);

      await user.click(getShareButton());

      // There should be a button (copy) inside the dialog besides the close button
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThanOrEqual(2); // Close button + Copy button
    });
  });

  describe("URL generation", () => {
    it("generates URL without time when checkbox unchecked", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      renderWithTooltip(
        <ShareDialog
          selectedDate={new Date(2024, 0, 15)} // January 15, 2024
          selectedHour={14}
          currentTime={1845}
        />
      );

      await user.click(getShareButton());

      const urlInput = screen.getByRole("textbox") as HTMLInputElement;
      // Without time, timestamp should be YYYYMMDDHH0000
      expect(urlInput.value).toBe("https://archive.example.com/?t=20240115140000");
    });

    it("generates URL with time when checkbox checked", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      renderWithTooltip(
        <ShareDialog
          selectedDate={new Date(2024, 0, 15)} // January 15, 2024
          selectedHour={14}
          currentTime={1845} // 30:45
        />
      );

      await user.click(getShareButton());

      const checkbox = screen.getByLabelText(/include current playback position/i);
      await user.click(checkbox);

      const urlInput = screen.getByRole("textbox") as HTMLInputElement;
      // With time, timestamp should include minutes and seconds
      expect(urlInput.value).toBe("https://archive.example.com/?t=20240115143045");
    });

    it("updates URL when checkbox is toggled", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      renderWithTooltip(
        <ShareDialog
          selectedDate={new Date(2024, 0, 15)} // January 15, 2024
          selectedHour={14}
          currentTime={1845}
        />
      );

      await user.click(getShareButton());

      const checkbox = screen.getByLabelText(/include current playback position/i);
      const urlInput = screen.getByRole("textbox") as HTMLInputElement;

      // Initially unchecked
      expect(urlInput.value).toContain("140000");

      // Check the checkbox
      await user.click(checkbox);
      expect(urlInput.value).toContain("143045");

      // Uncheck the checkbox
      await user.click(checkbox);
      expect(urlInput.value).toContain("140000");
    });
  });

  describe("copy functionality", () => {
    it("shows check mark after copying (confirms clipboard interaction)", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      renderWithTooltip(<ShareDialog {...defaultProps} />);

      await user.click(getShareButton());

      // Find copy button by its icon
      const dialog = screen.getByRole("dialog");
      const copyIcon = dialog.querySelector(".lucide-copy");
      const copyButton = copyIcon?.closest("button");

      expect(copyButton).toBeInTheDocument();
      await user.click(copyButton!);

      // Should show check icon (green color class)
      await waitFor(() => {
        const checkIcon = copyButton!.querySelector(".text-green-500");
        expect(checkIcon).toBeInTheDocument();
      });
    });

    it("reverts check mark after 2 seconds", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      renderWithTooltip(<ShareDialog {...defaultProps} />);

      await user.click(getShareButton());

      // Find copy button by its icon
      const dialog = screen.getByRole("dialog");
      const copyIcon = dialog.querySelector(".lucide-copy");
      const copyButton = copyIcon?.closest("button");

      expect(copyButton).toBeInTheDocument();
      await user.click(copyButton!);

      // Check mark should appear
      await waitFor(() => {
        expect(copyButton!.querySelector(".text-green-500")).toBeInTheDocument();
      });

      // Advance timer by 2 seconds
      vi.advanceTimersByTime(2000);

      // Check mark should be gone
      await waitFor(() => {
        expect(copyButton!.querySelector(".text-green-500")).not.toBeInTheDocument();
      });
    });
  });

  describe("dialog close behavior", () => {
    it("closes dialog when pressing Escape", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      renderWithTooltip(<ShareDialog {...defaultProps} />);

      await user.click(getShareButton());

      expect(screen.getByRole("dialog")).toBeInTheDocument();

      await user.keyboard("{Escape}");

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });
  });
});
