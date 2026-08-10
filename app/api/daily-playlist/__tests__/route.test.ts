import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "../route";

const mockFetch = vi.fn();

beforeEach(() => {
  // Reset call history, not just implementations: `requestedWindow` below reads
  // `mock.calls[0]`, which would otherwise be the first call of the whole file.
  mockFetch.mockReset();
  global.fetch = mockFetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeRequest(params: Record<string, string>) {
  const url = new URL("http://localhost:3000/api/daily-playlist");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString());
}

/** The `start` / `end` query values of the single upstream call. */
function requestedWindow(): { start: number; end: number } {
  expect(mockFetch).toHaveBeenCalledTimes(1);
  const url = new URL(mockFetch.mock.calls[0][0] as string);
  return {
    start: Number(url.searchParams.get("start")),
    end: Number(url.searchParams.get("end")),
  };
}

const RANGE_RESPONSE = {
  shows: [
    {
      id: 123,
      dj_name: "DJ Biscuit",
      show_name: null,
      specialty_id: null,
      start_time: "2024-03-27T06:00:00.000Z",
      end_time: "2024-03-27T08:00:00.000Z",
    },
  ],
  entries: [
    {
      id: 50,
      show_id: 123,
      play_order: 1,
      add_time: "2024-03-27T06:00:00.000Z",
      entry_type: "show_start",
      dj_name: "DJ Biscuit",
    },
    {
      id: 51,
      show_id: 123,
      play_order: 2,
      add_time: "2024-03-27T06:02:00.000Z",
      entry_type: "track",
      artist_name: "Jessica Pratt",
      track_title: "Back, Baby",
      album_title: "On Your Own Love Again",
      record_label: "Drag City",
      rotation_bin: null,
      request_flag: false,
    },
    {
      id: 52,
      show_id: 123,
      play_order: 3,
      add_time: "2024-03-27T06:05:00.000Z",
      entry_type: "talkset",
      message: "TALKSET",
    },
    {
      id: 53,
      show_id: 123,
      play_order: 4,
      add_time: "2024-03-27T08:00:00.000Z",
      entry_type: "show_end",
      dj_name: "DJ Biscuit",
    },
  ],
};

function mockUpstream(body: unknown) {
  mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(body) });
}

describe("GET /api/daily-playlist", () => {
  it("returns 400 when date is missing", async () => {
    const response = await GET(makeRequest({}));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Missing required parameter");
  });

  it("returns 400 for invalid date format", async () => {
    const response = await GET(makeRequest({ date: "03/27/2024" }));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Invalid date format");
  });

  it("fetches and groups entries into show blocks", async () => {
    mockUpstream(RANGE_RESPONSE);

    const response = await GET(makeRequest({ date: "2024-03-27" }));
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.dayStartEpoch).toBeTypeOf("number");
    expect(data.shows).toHaveLength(1);

    const show = data.shows[0];
    expect(show.showId).toBe(123);
    expect(show.djHandle).toBe("DJ Biscuit");
    expect(show.entries).toHaveLength(4);
    expect(show.entries[1].entryType).toBe("playcut");
    expect(show.entries[1].artistName).toBe("Jessica Pratt");
    expect(show.entries[1].dayOffsetSeconds).toBeTypeOf("number");
    expect(show.entries[1].hour).toBeTypeOf("number");
  });

  it("calls Backend's range endpoint, not tubafrenzy", async () => {
    mockUpstream(RANGE_RESPONSE);
    await GET(makeRequest({ date: "2024-03-27" }));

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/flowsheet/range");
    expect(url).not.toContain("tubafrenzy");
    expect(url).not.toContain("wxyc-proxy");
    expect(url).not.toContain("dailyEntries");
  });

  it("renders entries with a null show_id as unattributed rather than dropping them", async () => {
    mockUpstream({
      shows: RANGE_RESPONSE.shows,
      entries: [
        ...RANGE_RESPONSE.entries,
        {
          id: 99,
          show_id: null,
          play_order: 1,
          add_time: "2024-03-27T09:00:00.000Z",
          entry_type: "track",
          artist_name: "Nilüfer Yanya",
          track_title: "Stabilise",
          album_title: "Painless",
          record_label: "ATO",
          rotation_bin: null,
          request_flag: false,
        },
      ],
    });

    const response = await GET(makeRequest({ date: "2024-03-27" }));
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.shows).toHaveLength(2);
    const unattributed = data.shows[1];
    expect(unattributed.showId).toBe(0);
    expect(unattributed.djHandle).toBe("Unattributed");
    expect(unattributed.entries).toHaveLength(1);
    expect(unattributed.entries[0].artistName).toBe("Nilüfer Yanya");
  });

  describe("window bounds", () => {
    it("requests a half-open [midnight ET, next midnight ET) window in epoch ms", async () => {
      mockUpstream({ shows: [], entries: [] });
      await GET(makeRequest({ date: "2024-03-27" }));

      const { start, end } = requestedWindow();
      // 2024-03-27 is EDT (UTC-4), so midnight ET is 04:00Z.
      expect(start).toBe(Date.parse("2024-03-27T04:00:00.000Z"));
      expect(end).toBe(Date.parse("2024-03-28T04:00:00.000Z"));
      expect(end - start).toBe(24 * 60 * 60 * 1000);
    });

    it("asks for 23 hours on the spring-forward day", async () => {
      // 2024-03-10: 2 AM EST jumps to 3 AM EDT. Adding a fixed 86,400,000 to
      // start would overrun into the next day by an hour.
      mockUpstream({ shows: [], entries: [] });
      await GET(makeRequest({ date: "2024-03-10" }));

      const { start, end } = requestedWindow();
      expect(start).toBe(Date.parse("2024-03-10T05:00:00.000Z")); // EST
      expect(end).toBe(Date.parse("2024-03-11T04:00:00.000Z")); // EDT
      expect(end - start).toBe(23 * 60 * 60 * 1000);
    });

    it("asks for 25 hours on the fall-back day", async () => {
      // 2024-11-03: 2 AM EDT falls back to 1 AM EST. A fixed 86,400,000 would
      // clip the last hour of the day off the response entirely.
      mockUpstream({ shows: [], entries: [] });
      await GET(makeRequest({ date: "2024-11-03" }));

      const { start, end } = requestedWindow();
      expect(start).toBe(Date.parse("2024-11-03T04:00:00.000Z")); // EDT
      expect(end).toBe(Date.parse("2024-11-04T05:00:00.000Z")); // EST
      expect(end - start).toBe(25 * 60 * 60 * 1000);
    });

    it("rolls the month and the year over correctly", async () => {
      mockUpstream({ shows: [], entries: [] });
      await GET(makeRequest({ date: "2024-12-31" }));

      const { end } = requestedWindow();
      expect(end).toBe(Date.parse("2025-01-01T05:00:00.000Z"));
    });

    it("asks for exactly one calendar day, whatever its length", async () => {
      // Deliberately not `expect(span).toBeLessThanOrEqual(EIGHT_DAYS)`: one
      // calendar day can never exceed 25 hours, so that assertion holds for
      // every possible input — including one produced by a completely broken
      // end bound — and would look like a ceiling guard while guarding
      // nothing. Pin the exact length per day instead.
      for (const [date, expectedHours] of [
        ["2024-01-15", 24],
        ["2024-03-10", 23],
        ["2024-11-03", 25],
      ] as const) {
        mockFetch.mockReset();
        mockUpstream({ shows: [], entries: [] });
        await GET(makeRequest({ date }));

        const { start, end } = requestedWindow();
        expect(end - start).toBe(expectedHours * 60 * 60 * 1000);
      }
    });
  });

  it("returns empty shows for an empty day", async () => {
    mockUpstream({ shows: [], entries: [] });

    const response = await GET(makeRequest({ date: "2024-03-27" }));
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.shows).toHaveLength(0);
  });

  it("returns 502 when Backend returns an error", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const response = await GET(makeRequest({ date: "2024-03-27" }));
    expect(response.status).toBe(502);

    consoleSpy.mockRestore();
  });

  it("returns 502 when fetch throws", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const response = await GET(makeRequest({ date: "2024-03-27" }));
    expect(response.status).toBe(502);

    consoleSpy.mockRestore();
  });
});
