import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlaylistPanel } from "../playlist-panel";
import type { ArchivePlaylistEntry } from "@/lib/types/playlist";

function createPlaycutEntry(
  overrides: Partial<ArchivePlaylistEntry> = {}
): ArchivePlaylistEntry {
  return {
    id: 100,
    entryType: "playcut",
    offsetSeconds: 120,
    artistName: "Juana Molina",
    songTitle: "la paradoja",
    releaseTitle: "DOGA",
    labelName: "Sonamos",
    rotation: false,
    request: false,
    ...overrides,
  };
}

describe("PlaylistPanel", () => {
  it("renders loading skeletons when isLoading is true", () => {
    const { container } = render(
      <PlaylistPanel
        entries={[]}
        isLoading={true}
        error={null}
        activeEntryId={null}
        onEntryClick={vi.fn()}
      />
    );

    // Skeletons render as divs with animation class
    const skeletons = container.querySelectorAll("[data-slot='skeleton']");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders error message when error is set", () => {
    render(
      <PlaylistPanel
        entries={[]}
        isLoading={false}
        error="Failed to load playlist"
        activeEntryId={null}
        onEntryClick={vi.fn()}
      />
    );

    expect(screen.getByText("Failed to load playlist")).toBeInTheDocument();
  });

  it("renders empty state when no playcut entries", () => {
    render(
      <PlaylistPanel
        entries={[]}
        isLoading={false}
        error={null}
        activeEntryId={null}
        onEntryClick={vi.fn()}
      />
    );

    expect(
      screen.getByText("No playlist data available for this hour")
    ).toBeInTheDocument();
  });

  it("renders empty state when only non-playcut entries exist", () => {
    const entries: ArchivePlaylistEntry[] = [
      {
        id: 1,
        entryType: "talkset",
        offsetSeconds: 0,
      },
      {
        id: 2,
        entryType: "breakpoint",
        offsetSeconds: 3600,
        label: "3:00 AM",
      },
    ];

    render(
      <PlaylistPanel
        entries={entries}
        isLoading={false}
        error={null}
        activeEntryId={null}
        onEntryClick={vi.fn()}
      />
    );

    expect(
      screen.getByText("No playlist data available for this hour")
    ).toBeInTheDocument();
  });

  it("renders playcut entries with artist and song", () => {
    const entries = [
      createPlaycutEntry({ id: 1, artistName: "Stereolab", songTitle: "Ping Pong" }),
      createPlaycutEntry({ id: 2, artistName: "Cat Power", songTitle: "Metal Heart" }),
    ];

    render(
      <PlaylistPanel
        entries={entries}
        isLoading={false}
        error={null}
        activeEntryId={null}
        onEntryClick={vi.fn()}
      />
    );

    expect(screen.getByText("Stereolab")).toBeInTheDocument();
    expect(screen.getByText("Ping Pong")).toBeInTheDocument();
    expect(screen.getByText("Cat Power")).toBeInTheDocument();
    expect(screen.getByText("Metal Heart")).toBeInTheDocument();
  });

  it("calls onEntryClick when an entry is clicked", async () => {
    const onEntryClick = vi.fn();
    const entry = createPlaycutEntry({ id: 1, songTitle: "Test Song" });

    const { user } = await import("@testing-library/user-event").then((m) => ({
      user: m.default.setup(),
    }));

    render(
      <PlaylistPanel
        entries={[entry]}
        isLoading={false}
        error={null}
        activeEntryId={null}
        onEntryClick={onEntryClick}
      />
    );

    await user.click(screen.getByText("Test Song"));
    expect(onEntryClick).toHaveBeenCalledWith(entry);
  });
});
