import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "../route";

const mockFetch = vi.fn();

beforeEach(() => {
  global.fetch = mockFetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeRequest(body: Record<string, string>) {
  return new Request("http://localhost:3000/api/artwork", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/artwork", () => {
  it("returns 400 when both artist and album are empty", async () => {
    const response = await POST(makeRequest({ artist: "", album: "" }));
    expect(response.status).toBe(400);
  });

  it("returns artwork URL from library-metadata-lookup", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [
            {
              library_item: {
                genre: "Rock",
                format: "CD",
                call_number: "Rock CD J 1/2",
                library_url: "http://wxyc.info/wxycdb/libraryRelease?id=42",
              },
              artwork: {
                artwork_url: "https://img.discogs.com/test.jpg",
                release_url: "https://www.discogs.com/release/12345",
              },
            },
          ],
        }),
    });

    const response = await POST(
      makeRequest({ artist: "Jessica Pratt", album: "On Your Own Love Again" })
    );
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.artworkUrl).toBe("https://img.discogs.com/test.jpg");
    expect(data.genre).toBe("Rock");
    expect(data.format).toBe("CD");
    expect(data.callNumber).toBe("Rock CD J 1/2");
    expect(data.libraryUrl).toBe(
      "http://wxyc.info/wxycdb/libraryRelease?id=42"
    );
    expect(data.discogsUrl).toBe("https://www.discogs.com/release/12345");
  });

  it("returns null fields when no results found", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [],
        }),
    });

    const response = await POST(
      makeRequest({ artist: "Unknown Artist", album: "Unknown Album" })
    );
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.artworkUrl).toBeNull();
    expect(data.genre).toBeNull();
  });

  it("returns null fields when upstream returns error", async () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const response = await POST(
      makeRequest({ artist: "Test", album: "Test" })
    );
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.artworkUrl).toBeNull();

    consoleSpy.mockRestore();
  });

  it("returns null fields when fetch throws", async () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const response = await POST(
      makeRequest({ artist: "Test", album: "Test" })
    );
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.artworkUrl).toBeNull();

    consoleSpy.mockRestore();
  });

  it("accepts artist-only lookup", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    });

    const response = await POST(makeRequest({ artist: "Stereolab", album: "" }));
    expect(response.status).toBe(200);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/lookup"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Stereolab"),
      })
    );
  });
});
