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
  const url = new URL("http://localhost:3000/api/playlist");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString());
}

describe("GET /api/playlist", () => {
  it("returns 400 when date is missing", async () => {
    const response = await GET(makeRequest({ hour: "15" }));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Missing required parameters");
  });

  it("returns 400 when hour is missing", async () => {
    const response = await GET(makeRequest({ date: "2024-01-15" }));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Missing required parameters");
  });

  it("returns 400 for invalid date format", async () => {
    const response = await GET(
      makeRequest({ date: "01/15/2024", hour: "15" })
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Invalid date format");
  });

  it("returns 400 for invalid hour", async () => {
    const response = await GET(
      makeRequest({ date: "2024-01-15", hour: "25" })
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Invalid hour");
  });

  it("returns 400 for non-numeric hour", async () => {
    const response = await GET(
      makeRequest({ date: "2024-01-15", hour: "abc" })
    );
    expect(response.status).toBe(400);
  });

  it("fetches and maps entries from tubafrenzy", async () => {
    const tubafrenzyResponse = [
      {
        id: 100,
        chronOrderID: 456100,
        hour: 1705352400000,
        timeCreated: 1705352520000,
        entryType: "playcut",
        artistName: "Autechre",
        songTitle: "VI Scose Poise",
        releaseTitle: "Confield",
        labelName: "Warp",
        rotation: "false",
        request: "false",
      },
      {
        id: 101,
        chronOrderID: 456101,
        hour: 1705352400000,
        timeCreated: 1705356000000,
        entryType: "breakpoint",
        label: "3:00 AM",
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(tubafrenzyResponse),
    });

    const response = await GET(
      makeRequest({ date: "2024-01-15", hour: "15" })
    );
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.entries).toHaveLength(2);
    expect(data.radioHourEpoch).toBeTypeOf("number");

    // First entry is a playcut
    expect(data.entries[0].entryType).toBe("playcut");
    expect(data.entries[0].artistName).toBe("Autechre");
    expect(data.entries[0].songTitle).toBe("VI Scose Poise");
    expect(data.entries[0].offsetSeconds).toBeTypeOf("number");
    expect(data.entries[0].offsetSeconds).toBeGreaterThanOrEqual(0);

    // Second entry is a breakpoint
    expect(data.entries[1].entryType).toBe("breakpoint");
    expect(data.entries[1].label).toBe("3:00 AM");
  });

  it("returns empty entries when tubafrenzy returns empty array", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    const response = await GET(
      makeRequest({ date: "2024-01-15", hour: "15" })
    );
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.entries).toHaveLength(0);
  });

  it("returns 502 when tubafrenzy returns an error", async () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const response = await GET(
      makeRequest({ date: "2024-01-15", hour: "15" })
    );
    expect(response.status).toBe(502);

    consoleSpy.mockRestore();
  });

  it("returns 502 when fetch throws", async () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const response = await GET(
      makeRequest({ date: "2024-01-15", hour: "15" })
    );
    expect(response.status).toBe(502);

    consoleSpy.mockRestore();
  });
});
