import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  cn,
  formatDate,
  formatTime,
  getHourLabel,
  createTimestamp,
  getArchiveUrl,
} from "../utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("foo", false && "bar", "baz")).toBe("foo baz");
  });

  it("merges tailwind classes correctly", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });
});

describe("formatDate", () => {
  it("formats a date as long month, day, year", () => {
    const date = new Date(2024, 0, 15); // January 15, 2024
    expect(formatDate(date)).toBe("January 15, 2024");
  });

  it("handles single digit days", () => {
    const date = new Date(2024, 5, 5); // June 5, 2024
    expect(formatDate(date)).toBe("June 5, 2024");
  });

  it("handles end of year dates", () => {
    const date = new Date(2024, 11, 31); // December 31, 2024
    expect(formatDate(date)).toBe("December 31, 2024");
  });
});

describe("formatTime", () => {
  it("formats seconds as MM:SS when under an hour", () => {
    expect(formatTime(125)).toBe("2:05");
  });

  it("formats seconds as H:MM:SS when over an hour", () => {
    expect(formatTime(3665)).toBe("1:01:05");
  });

  it("handles zero seconds", () => {
    expect(formatTime(0)).toBe("0:00");
  });

  it("handles exactly one hour", () => {
    expect(formatTime(3600)).toBe("1:00:00");
  });

  it("handles large values", () => {
    expect(formatTime(36000)).toBe("10:00:00");
  });

  it("pads minutes when hours are present", () => {
    expect(formatTime(3660)).toBe("1:01:00");
  });

  it("does not pad minutes when no hours", () => {
    expect(formatTime(60)).toBe("1:00");
  });
});

describe("getHourLabel", () => {
  it("converts midnight to 12:00 AM", () => {
    expect(getHourLabel(0)).toBe("12:00 AM");
  });

  it("converts noon to 12:00 PM", () => {
    expect(getHourLabel(12)).toBe("12:00 PM");
  });

  it("converts morning hour correctly", () => {
    expect(getHourLabel(9)).toBe("9:00 AM");
  });

  it("converts afternoon hour correctly", () => {
    expect(getHourLabel(15)).toBe("3:00 PM");
  });

  it("converts 11 PM correctly", () => {
    expect(getHourLabel(23)).toBe("11:00 PM");
  });

  it("includes minutes when provided", () => {
    expect(getHourLabel(14, 30)).toBe("2:30 PM");
  });

  it("pads single digit minutes", () => {
    expect(getHourLabel(9, 5)).toBe("9:05 AM");
  });
});

describe("createTimestamp", () => {
  it("creates timestamp with default minute and second", () => {
    const date = new Date(2024, 0, 15); // January 15, 2024
    expect(createTimestamp(date, 14)).toBe("20240115140000");
  });

  it("creates timestamp with custom minute", () => {
    const date = new Date(2024, 5, 5); // June 5, 2024
    expect(createTimestamp(date, 9, 30)).toBe("20240605093000");
  });

  it("creates timestamp with custom minute and second", () => {
    const date = new Date(2024, 11, 31); // December 31, 2024
    expect(createTimestamp(date, 23, 59, 59)).toBe("20241231235959");
  });

  it("pads single digit values", () => {
    const date = new Date(2024, 0, 1); // January 1, 2024
    expect(createTimestamp(date, 1, 2, 3)).toBe("20240101010203");
  });
});

describe("getArchiveUrl", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("constructs correct key and calls API without token", async () => {
    const mockUrl = "https://example.com/signed-url";
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ url: mockUrl }),
    });

    const date = new Date(2024, 0, 15); // January 15, 2024
    const result = await getArchiveUrl(date, 14, null);

    expect(global.fetch).toHaveBeenCalledWith("/api/signed-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "2024/01/15/202401151400.mp3" }),
    });
    expect(result).toBe(mockUrl);
  });

  it("includes Authorization header when token is provided", async () => {
    const mockUrl = "https://example.com/signed-url";
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ url: mockUrl }),
    });

    const date = new Date(2024, 5, 5); // June 5, 2024
    const token = "test-jwt-token";
    await getArchiveUrl(date, 9, token);

    expect(global.fetch).toHaveBeenCalledWith("/api/signed-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-jwt-token",
      },
      body: JSON.stringify({ key: "2024/06/05/202406050900.mp3" }),
    });
  });

  it("throws error when response is not ok", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "Access denied" }),
    });

    const date = new Date(2024, 0, 15);
    await expect(getArchiveUrl(date, 14, null)).rejects.toThrow("Access denied");
  });

  it("throws error with default message when no error in response", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    });

    const date = new Date(2024, 0, 15);
    await expect(getArchiveUrl(date, 14, null)).rejects.toThrow(
      "Failed to get signed URL"
    );
  });

  it("handles fetch errors", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Network error")
    );

    const date = new Date(2024, 0, 15);
    await expect(getArchiveUrl(date, 14, null)).rejects.toThrow("Network error");
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
