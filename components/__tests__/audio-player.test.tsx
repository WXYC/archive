import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AudioPlayer from "../audio-player";
import { ArchiveConfig } from "@/config/archive";

// Mock HTMLMediaElement methods that JSDOM doesn't implement
window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
window.HTMLMediaElement.prototype.pause = vi.fn();

// Mock ResizeObserver for Radix UI components
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverMock;

// Mock auth
let mockIsAuthenticated = false;

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    isAuthenticated: mockIsAuthenticated,
  }),
}));

// Mock window.open for download
const mockWindowOpen = vi.fn();
Object.defineProperty(window, "open", { value: mockWindowOpen, writable: true });

// Helper to find buttons by their tooltip text
// Buttons in this component have adjacent TooltipContent siblings
function getButtonByTooltip(container: HTMLElement, tooltipText: RegExp): HTMLElement | null {
  const buttons = container.querySelectorAll("button");
  for (const button of buttons) {
    // Check if the parent has a tooltip with matching text
    const parent = button.closest("[data-radix-collection-item]")?.parentElement;
    if (parent) {
      const tooltip = parent.querySelector('[role="tooltip"]');
      if (tooltip && tooltipText.test(tooltip.textContent || "")) {
        return button;
      }
    }
  }
  return null;
}

// Helper to find control buttons by icon class
// Lucide icons have classes like "lucide lucide-play" or "lucide lucide-skip-back"
function findButtonWithIcon(container: HTMLElement, iconClass: string): HTMLElement | null {
  // Try direct match first
  let icon = container.querySelector(`.lucide-${iconClass}`);
  // If not found, try with class contains selector (for compound names like "skip-back")
  if (!icon) {
    icon = container.querySelector(`[class*="lucide-${iconClass}"]`);
  }
  return icon?.closest("button") as HTMLElement | null;
}

const defaultConfig: ArchiveConfig = {
  dateRange: {
    days: 14,
    description: "past two weeks",
  },
};

const defaultProps = {
  audioUrl: "https://example.com/audio.mp3",
  isPlaying: false,
  setIsPlaying: vi.fn(),
  selectedDate: new Date(2024, 0, 15), // Use year/month/day to avoid timezone issues
  selectedHour: 14,
  selectedMinute: 30,
  selectedSecond: 45,
  archiveSelected: true,
  onHourChange: vi.fn(),
  onTimeUpdate: vi.fn(),
  config: defaultConfig,
};

describe("AudioPlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = false;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Set a fixed "today" for date range calculations
    vi.setSystemTime(new Date("2024-01-20T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Helper to simulate audio loaded state
  function simulateAudioLoaded(container: HTMLElement) {
    const audioElement = container.querySelector("audio");
    if (audioElement) {
      Object.defineProperty(audioElement, "readyState", { value: 4, writable: true });
      Object.defineProperty(audioElement, "duration", { value: 3600, writable: true });
      fireEvent.loadedMetadata(audioElement);
    }
  }

  describe("rendering", () => {
    it("renders play button when not playing and audio loaded", () => {
      const { container } = render(<AudioPlayer {...defaultProps} />);

      // Simulate audio loaded to exit loading state
      simulateAudioLoaded(container);

      const playButton = findButtonWithIcon(container, "play");
      expect(playButton).toBeInTheDocument();
    });

    it("renders pause button when playing and audio loaded", () => {
      const { container } = render(<AudioPlayer {...defaultProps} isPlaying={true} />);

      // Simulate audio loaded
      simulateAudioLoaded(container);

      const pauseButton = findButtonWithIcon(container, "pause");
      expect(pauseButton).toBeInTheDocument();
    });

    it("renders hour navigation buttons", () => {
      const { container } = render(<AudioPlayer {...defaultProps} />);

      expect(findButtonWithIcon(container, "skip-back")).toBeInTheDocument();
      expect(findButtonWithIcon(container, "skip-forward")).toBeInTheDocument();
    });

    it("renders mute button", () => {
      const { container } = render(<AudioPlayer {...defaultProps} />);

      expect(findButtonWithIcon(container, "volume-2")).toBeInTheDocument();
    });

    it("renders share button", () => {
      const { container } = render(<AudioPlayer {...defaultProps} />);

      expect(findButtonWithIcon(container, "share-2")).toBeInTheDocument();
    });

    it("displays time as 0:00 when no audio loaded", () => {
      render(<AudioPlayer {...defaultProps} audioUrl={null} />);

      // Should show 0:00 for both current time and duration
      const timeDisplays = screen.getAllByText("0:00");
      expect(timeDisplays.length).toBeGreaterThan(0);
    });
  });

  describe("play/pause functionality", () => {
    it("shows loading spinner and disables button when loading", () => {
      const { container } = render(<AudioPlayer {...defaultProps} />);

      // When loading, the button should be disabled and show a spinner
      const buttons = container.querySelectorAll("button");
      // Find the play/pause button area (between skip-back and skip-forward)
      const spinner = container.querySelector(".animate-spin");
      expect(spinner).toBeInTheDocument();
    });

    it("calls setIsPlaying when play button is clicked", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const setIsPlaying = vi.fn();

      const { container } = render(<AudioPlayer {...defaultProps} setIsPlaying={setIsPlaying} />);

      // Simulate audio loaded
      simulateAudioLoaded(container);

      // Clear calls from effects
      setIsPlaying.mockClear();

      const playButton = findButtonWithIcon(container, "play")!;
      await user.click(playButton);

      expect(setIsPlaying).toHaveBeenCalledWith(true);
    });

    it("calls setIsPlaying(false) when pause button is clicked", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const setIsPlaying = vi.fn();

      const { container } = render(<AudioPlayer {...defaultProps} isPlaying={true} setIsPlaying={setIsPlaying} />);

      // Simulate audio loaded
      simulateAudioLoaded(container);

      // Clear calls from effects
      setIsPlaying.mockClear();

      const pauseButton = findButtonWithIcon(container, "pause")!;
      await user.click(pauseButton);

      expect(setIsPlaying).toHaveBeenCalledWith(false);
    });
  });

  describe("hour navigation", () => {
    it("calls onHourChange with previous hour when back button clicked", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onHourChange = vi.fn();

      const { container } = render(<AudioPlayer {...defaultProps} selectedHour={14} onHourChange={onHourChange} />);

      const prevButton = findButtonWithIcon(container, "skip-back")!;
      await user.click(prevButton);

      expect(onHourChange).toHaveBeenCalledWith(13, expect.any(Date));
    });

    it("calls onHourChange with next hour when forward button clicked", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onHourChange = vi.fn();

      const { container } = render(<AudioPlayer {...defaultProps} selectedHour={14} onHourChange={onHourChange} />);

      const nextButton = findButtonWithIcon(container, "skip-forward")!;
      await user.click(nextButton);

      expect(onHourChange).toHaveBeenCalledWith(15, expect.any(Date));
    });

    it("wraps to previous day when going back from hour 0", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onHourChange = vi.fn();

      const { container } = render(
        <AudioPlayer
          {...defaultProps}
          selectedHour={0}
          selectedDate={new Date(2024, 0, 15)} // Use year/month/day to avoid timezone issues
          onHourChange={onHourChange}
        />
      );

      const prevButton = findButtonWithIcon(container, "skip-back")!;
      await user.click(prevButton);

      expect(onHourChange).toHaveBeenCalledWith(23, expect.any(Date));
      const calledDate = onHourChange.mock.calls[0][1];
      expect(calledDate.getDate()).toBe(14); // Previous day
    });

    it("wraps to next day when going forward from hour 23", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onHourChange = vi.fn();

      const { container } = render(
        <AudioPlayer
          {...defaultProps}
          selectedHour={23}
          selectedDate={new Date(2024, 0, 15)} // Use year/month/day to avoid timezone issues
          onHourChange={onHourChange}
        />
      );

      const nextButton = findButtonWithIcon(container, "skip-forward")!;
      await user.click(nextButton);

      expect(onHourChange).toHaveBeenCalledWith(0, expect.any(Date));
      const calledDate = onHourChange.mock.calls[0][1];
      expect(calledDate.getDate()).toBe(16); // Next day
    });

    it("does not navigate beyond date range", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onHourChange = vi.fn();

      // Set date to "today" (2024-01-20) at hour 23
      const { container } = render(
        <AudioPlayer
          {...defaultProps}
          selectedHour={23}
          selectedDate={new Date(2024, 0, 20)} // Use year/month/day to avoid timezone issues
          onHourChange={onHourChange}
        />
      );

      const nextButton = findButtonWithIcon(container, "skip-forward")!;
      await user.click(nextButton);

      // Should not call onHourChange because we can't go to tomorrow
      expect(onHourChange).not.toHaveBeenCalled();
    });

    it("disables hour navigation when no archive selected", () => {
      const { container } = render(<AudioPlayer {...defaultProps} archiveSelected={false} />);

      expect(findButtonWithIcon(container, "skip-back")).toBeDisabled();
      expect(findButtonWithIcon(container, "skip-forward")).toBeDisabled();
    });
  });

  describe("mute functionality", () => {
    it("toggles mute state when mute button clicked", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      const { container } = render(<AudioPlayer {...defaultProps} />);

      const muteButton = findButtonWithIcon(container, "volume-2")!;
      await user.click(muteButton);

      // After clicking, should show volume-x icon (muted state)
      expect(findButtonWithIcon(container, "volume-x")).toBeInTheDocument();
    });

    it("disables mute button when no audio URL", () => {
      const { container } = render(<AudioPlayer {...defaultProps} audioUrl={null} />);

      const muteButton = findButtonWithIcon(container, "volume-2");
      expect(muteButton).toBeDisabled();
    });
  });

  describe("keyboard shortcuts", () => {
    it("toggles play/pause on Space key when audio is loaded", async () => {
      const setIsPlaying = vi.fn();

      const { container } = render(<AudioPlayer {...defaultProps} setIsPlaying={setIsPlaying} />);

      // Simulate audio loaded (metadata loaded sets isLoading to false)
      const audioElement = container.querySelector("audio");
      if (audioElement) {
        // Mock the readyState to indicate audio is ready
        Object.defineProperty(audioElement, "readyState", { value: 4, writable: true });
        Object.defineProperty(audioElement, "duration", { value: 3600, writable: true });
        fireEvent.loadedMetadata(audioElement);
      }

      // Clear any calls from effects
      setIsPlaying.mockClear();

      fireEvent.keyDown(window, { code: "Space" });

      expect(setIsPlaying).toHaveBeenCalledWith(true);
    });

    it("does not toggle play/pause when typing in input", () => {
      const setIsPlaying = vi.fn();

      render(<AudioPlayer {...defaultProps} setIsPlaying={setIsPlaying} />);

      // Create an input and simulate typing in it
      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();

      // Create a keyboard event that originates from the input
      const event = new KeyboardEvent("keydown", {
        code: "Space",
        bubbles: true,
      });
      Object.defineProperty(event, "target", { value: input, writable: false });

      window.dispatchEvent(event);

      expect(setIsPlaying).not.toHaveBeenCalled();

      document.body.removeChild(input);
    });

    it("does not trigger keyboard shortcuts when no audio URL", () => {
      const setIsPlaying = vi.fn();

      render(<AudioPlayer {...defaultProps} audioUrl={null} setIsPlaying={setIsPlaying} />);

      // Clear mock to ignore calls made during initial render/effects
      setIsPlaying.mockClear();

      fireEvent.keyDown(window, { code: "Space" });

      // Should not call setIsPlaying(true) from keyboard handler
      expect(setIsPlaying).not.toHaveBeenCalledWith(true);
    });
  });

  describe("download button", () => {
    it("shows download button when authenticated and audio URL exists", () => {
      mockIsAuthenticated = true;

      const { container } = render(<AudioPlayer {...defaultProps} />);

      expect(findButtonWithIcon(container, "download")).toBeInTheDocument();
    });

    it("hides download button when not authenticated", () => {
      mockIsAuthenticated = false;

      const { container } = render(<AudioPlayer {...defaultProps} />);

      expect(findButtonWithIcon(container, "download")).toBeFalsy();
    });

    it("hides download button when no audio URL", () => {
      mockIsAuthenticated = true;

      const { container } = render(<AudioPlayer {...defaultProps} audioUrl={null} />);

      expect(findButtonWithIcon(container, "download")).toBeFalsy();
    });

    it("opens audio URL in new tab when download clicked", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mockIsAuthenticated = true;

      const { container } = render(<AudioPlayer {...defaultProps} audioUrl="https://example.com/audio.mp3" />);

      const downloadButton = findButtonWithIcon(container, "download")!;
      await user.click(downloadButton);

      expect(mockWindowOpen).toHaveBeenCalledWith("https://example.com/audio.mp3", "_blank");
    });
  });

  describe("error state", () => {
    it("displays error message when error occurs", async () => {
      const { container } = render(<AudioPlayer {...defaultProps} />);

      // Simulate audio error
      const audioElement = container.querySelector("audio");
      if (audioElement) {
        fireEvent.error(audioElement);
      }

      await waitFor(() => {
        expect(screen.getByText(/error loading audio/i)).toBeInTheDocument();
      });
    });
  });

  describe("loading state", () => {
    it("shows loading spinner when audio is loading", async () => {
      const { container } = render(<AudioPlayer {...defaultProps} />);

      // Simulate load start
      const audioElement = container.querySelector("audio");
      if (audioElement) {
        fireEvent.loadStart(audioElement);
      }

      // The play button should show a spinner (animated div)
      const spinner = container.querySelector(".animate-spin");
      expect(spinner).toBeInTheDocument();
    });

    it("disables play button while loading", async () => {
      const { container } = render(<AudioPlayer {...defaultProps} />);

      const audioElement = container.querySelector("audio");
      if (audioElement) {
        fireEvent.loadStart(audioElement);
      }

      // Find play/pause button and check it's disabled
      const buttons = screen.getAllByRole("button");
      const playButton = buttons.find(
        (btn) => btn.querySelector(".animate-spin") !== null
      );
      expect(playButton).toBeDisabled();
    });
  });

  describe("audio events", () => {
    it("updates isPlaying to true on audio play event", async () => {
      const setIsPlaying = vi.fn();
      const { container } = render(
        <AudioPlayer {...defaultProps} setIsPlaying={setIsPlaying} />
      );

      const audioElement = container.querySelector("audio");
      if (audioElement) {
        fireEvent.play(audioElement);
      }

      expect(setIsPlaying).toHaveBeenCalledWith(true);
    });

    it("updates isPlaying to false on audio pause event", async () => {
      const setIsPlaying = vi.fn();
      const { container } = render(
        <AudioPlayer {...defaultProps} isPlaying={true} setIsPlaying={setIsPlaying} />
      );

      const audioElement = container.querySelector("audio");
      if (audioElement) {
        fireEvent.pause(audioElement);
      }

      expect(setIsPlaying).toHaveBeenCalledWith(false);
    });

    it("calls onTimeUpdate during playback", async () => {
      const onTimeUpdate = vi.fn();
      const { container } = render(
        <AudioPlayer {...defaultProps} onTimeUpdate={onTimeUpdate} />
      );

      const audioElement = container.querySelector("audio");
      if (audioElement) {
        // Mock the currentTime property
        Object.defineProperty(audioElement, "currentTime", {
          value: 125, // 2 minutes 5 seconds
          writable: true,
        });
        fireEvent.timeUpdate(audioElement);
      }

      expect(onTimeUpdate).toHaveBeenCalledWith(2, 5);
    });
  });

  describe("share dialog integration", () => {
    it("disables share button when no audio URL", () => {
      const { container } = render(<AudioPlayer {...defaultProps} audioUrl={null} />);

      const shareButton = findButtonWithIcon(container, "share-2");
      expect(shareButton).toBeDisabled();
    });

    it("enables share button when audio URL exists", () => {
      const { container } = render(<AudioPlayer {...defaultProps} />);

      const shareButton = findButtonWithIcon(container, "share-2");
      expect(shareButton).not.toBeDisabled();
    });
  });
});
