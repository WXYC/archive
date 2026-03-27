import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KeyboardShortcutsDialog } from "../keyboard-shortcuts-dialog";

// Mock ResizeObserver for Radix UI components
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverMock;

describe("KeyboardShortcutsDialog", () => {
  it("renders the trigger button", () => {
    render(<KeyboardShortcutsDialog />);

    expect(
      screen.getByRole("button", { name: /keyboard shortcuts/i })
    ).toBeInTheDocument();
  });

  it("opens dialog when trigger button is clicked", async () => {
    render(<KeyboardShortcutsDialog />);

    fireEvent.click(
      screen.getByRole("button", { name: /keyboard shortcuts/i })
    );

    expect(
      await screen.findByRole("heading", { name: /keyboard shortcuts/i })
    ).toBeInTheDocument();
  });

  it("displays all shortcuts when open", async () => {
    render(<KeyboardShortcutsDialog />);

    fireEvent.click(
      screen.getByRole("button", { name: /keyboard shortcuts/i })
    );

    expect(await screen.findByText("Play / Pause")).toBeInTheDocument();
    expect(screen.getByText("Skip back 5 seconds")).toBeInTheDocument();
    expect(screen.getByText("Skip forward 5 seconds")).toBeInTheDocument();
    expect(screen.getByText("Previous track")).toBeInTheDocument();
    expect(screen.getByText("Next track")).toBeInTheDocument();
    expect(screen.getByText("Previous hour")).toBeInTheDocument();
    expect(screen.getByText("Next hour")).toBeInTheDocument();
    expect(screen.getByText("Show keyboard shortcuts")).toBeInTheDocument();
  });

  it("opens dialog on Shift+? keyboard shortcut", async () => {
    render(<KeyboardShortcutsDialog />);

    fireEvent.keyDown(window, { key: "?", shiftKey: true });

    expect(
      await screen.findByRole("heading", { name: /keyboard shortcuts/i })
    ).toBeInTheDocument();
  });

  it("does not open on Shift+? when typing in an input", () => {
    render(<KeyboardShortcutsDialog />);

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent("keydown", {
      key: "?",
      shiftKey: true,
      bubbles: true,
    });
    Object.defineProperty(event, "target", { value: input, writable: false });
    window.dispatchEvent(event);

    expect(
      screen.queryByRole("heading", { name: /keyboard shortcuts/i })
    ).not.toBeInTheDocument();

    document.body.removeChild(input);
  });
});
