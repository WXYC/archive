import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "../route";

const mockFetch = vi.fn();

beforeEach(() => {
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

const TUBAFRENZY_DAILY_RESPONSE = {
  shows: [
    {
      id: 123,
      djHandle: "DJ Biscuit",
      showName: null,
      signonTime: 1711519200000,
      signoffTime: 1711526400000,
    },
  ],
  entries: [
    {
      id: 50,
      chronOrderID: 123001,
      hour: 1711519200000,
      timeCreated: 1711519200000,
      entryType: "showStart",
      radioShowId: 123,
      artistName: "START OF SHOW: DJ Biscuit SIGNED ON at 2:00 AM (3/27/24)",
    },
    {
      id: 51,
      chronOrderID: 123002,
      hour: 1711519200000,
      timeCreated: 1711519320000,
      entryType: "playcut",
      radioShowId: 123,
      artistName: "Autechre",
      songTitle: "VI Scose Poise",
      releaseTitle: "Confield",
      labelName: "Warp",
      rotation: "false",
      request: "false",
    },
    {
      id: 52,
      chronOrderID: 123003,
      hour: 1711519200000,
      timeCreated: 1711519500000,
      entryType: "talkset",
      radioShowId: 123,
    },
    {
      id: 53,
      chronOrderID: 123004,
      hour: 1711526400000,
      timeCreated: 1711526400000,
      entryType: "showEnd",
      radioShowId: 123,
      artistName: "END OF SHOW: DJ Biscuit SIGNED OFF at 4:00 AM (3/27/24)",
    },
  ],
};

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
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(TUBAFRENZY_DAILY_RESPONSE),
    });

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
    expect(show.entries[1].artistName).toBe("Autechre");
    expect(show.entries[1].dayOffsetSeconds).toBeTypeOf("number");
    expect(show.entries[1].hour).toBeTypeOf("number");
  });

  it("returns empty shows for an empty day", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ shows: [], entries: [] }),
    });

    const response = await GET(makeRequest({ date: "2024-03-27" }));
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.shows).toHaveLength(0);
  });

  it("returns 502 when tubafrenzy returns an error", async () => {
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
