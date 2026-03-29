import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlaylistPanel } from "../playlist-panel";
import type { DailyPlaylistEntry, ShowBlock } from "@/lib/types/playlist";

function createPlaycutEntry(
  overrides: Partial<DailyPlaylistEntry> = {}
): DailyPlaylistEntry {
  return {
    id: 100,
    entryType: "playcut",
    offsetSeconds: 120,
    dayOffsetSeconds: 7320,
    hour: 2,
    radioShowId: 1,
    artistName: "Juana Molina",
    songTitle: "la paradoja",
    releaseTitle: "DOGA",
    labelName: "Sonamos",
    rotation: false,
    request: false,
    ...overrides,
  };
}

function createShowBlock(
  overrides: Partial<ShowBlock> = {},
  entries: DailyPlaylistEntry[] = []
): ShowBlock {
  return {
    showId: 1,
    djHandle: "DJ Biscuit",
    showName: null,
    signonTime: 1711519200000,
    signoffTime: 1711526400000,
    entries,
    ...overrides,
  };
}

describe("PlaylistPanel", () => {
  it("renders loading skeletons when isLoading is true", () => {
    const { container } = render(
      <PlaylistPanel
        shows={[]}
        isLoading={true}
        error={null}
        activeEntryId={null}
        onEntryClick={vi.fn()}
      />
    );

    const skeletons = container.querySelectorAll("[data-slot='skeleton']");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders error message when error is set", () => {
    render(
      <PlaylistPanel
        shows={[]}
        isLoading={false}
        error="Failed to load playlist"
        activeEntryId={null}
        onEntryClick={vi.fn()}
      />
    );

    expect(screen.getByText("Failed to load playlist")).toBeInTheDocument();
  });

  it("renders empty state when no shows have playcut entries", () => {
    render(
      <PlaylistPanel
        shows={[]}
        isLoading={false}
        error={null}
        activeEntryId={null}
        onEntryClick={vi.fn()}
      />
    );

    expect(
      screen.getByText("No playlist data available for this day")
    ).toBeInTheDocument();
  });

  it("renders show header and playcut entries", () => {
    const entries = [
      createPlaycutEntry({ id: 1, artistName: "Stereolab", songTitle: "Ping Pong" }),
      createPlaycutEntry({ id: 2, artistName: "Cat Power", songTitle: "Metal Heart" }),
    ];
    const shows = [createShowBlock({}, entries)];

    render(
      <PlaylistPanel
        shows={shows}
        isLoading={false}
        error={null}
        activeEntryId={null}
        onEntryClick={vi.fn()}
      />
    );

    // Each entry renders twice (desktop + mobile variant), so use getAllByText
    expect(screen.getAllByText("DJ Biscuit").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Stereolab").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ping Pong").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Cat Power").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Metal Heart").length).toBeGreaterThan(0);
  });

  it("calls onEntryClick when an entry is clicked", async () => {
    const onEntryClick = vi.fn();
    const entry = createPlaycutEntry({ id: 1, songTitle: "Test Song" });
    const shows = [createShowBlock({}, [entry])];

    const { user } = await import("@testing-library/user-event").then((m) => ({
      user: m.default.setup(),
    }));

    render(
      <PlaylistPanel
        shows={shows}
        isLoading={false}
        error={null}
        activeEntryId={null}
        onEntryClick={onEntryClick}
      />
    );

    // Both desktop + mobile renders exist; click the first one
    await user.click(screen.getAllByText("Test Song")[0]);
    expect(onEntryClick).toHaveBeenCalledWith(entry);
  });

  it("renders show name when present", () => {
    const shows = [
      createShowBlock(
        { showName: "Friday Night Jazz" },
        [createPlaycutEntry({ id: 1 })]
      ),
    ];

    render(
      <PlaylistPanel
        shows={shows}
        isLoading={false}
        error={null}
        activeEntryId={null}
        onEntryClick={vi.fn()}
      />
    );

    expect(screen.getByText(/Friday Night Jazz/)).toBeInTheDocument();
  });
});
