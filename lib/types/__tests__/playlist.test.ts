import { describe, it, expect } from "vitest";
import {
  mapTubafrenzyEntry,
  mapTubafrenzyDailyEntry,
  groupEntriesIntoShows,
  type TubafrenzyEntry,
  type TubafrenzyDailyEntry,
  type TubafrenzyShow,
} from "../playlist";

const RADIO_HOUR = 1700000000000;

describe("mapTubafrenzyEntry", () => {
  it("maps a playcut entry with correct offset and fields", () => {
    const entry: TubafrenzyEntry = {
      id: 100,
      chronOrderID: 5001,
      hour: RADIO_HOUR,
      timeCreated: RADIO_HOUR + 120000, // 2 minutes in
      entryType: "playcut",
      artistName: "Juana Molina",
      songTitle: "la paradoja",
      releaseTitle: "DOGA",
      labelName: "Sonamos",
      rotation: "true",
      request: "false",
    };

    const result = mapTubafrenzyEntry(entry, RADIO_HOUR);

    expect(result.id).toBe(100);
    expect(result.entryType).toBe("playcut");
    expect(result.offsetSeconds).toBe(120);
    expect(result.artistName).toBe("Juana Molina");
    expect(result.songTitle).toBe("la paradoja");
    expect(result.releaseTitle).toBe("DOGA");
    expect(result.labelName).toBe("Sonamos");
    expect(result.rotation).toBe(true);
    expect(result.request).toBe(false);
  });

  it("maps a breakpoint entry with label", () => {
    const entry: TubafrenzyEntry = {
      id: 101,
      chronOrderID: 5002,
      hour: RADIO_HOUR,
      timeCreated: RADIO_HOUR + 3600000,
      entryType: "breakpoint",
      label: "3:00 AM",
    };

    const result = mapTubafrenzyEntry(entry, RADIO_HOUR);

    expect(result.id).toBe(101);
    expect(result.entryType).toBe("breakpoint");
    expect(result.label).toBe("3:00 AM");
    expect(result.artistName).toBeUndefined();
  });

  it("maps a talkset entry", () => {
    const entry: TubafrenzyEntry = {
      id: 102,
      chronOrderID: 5003,
      hour: RADIO_HOUR,
      timeCreated: RADIO_HOUR + 300000,
      entryType: "talkset",
    };

    const result = mapTubafrenzyEntry(entry, RADIO_HOUR);

    expect(result.id).toBe(102);
    expect(result.entryType).toBe("talkset");
    expect(result.offsetSeconds).toBe(300);
    expect(result.artistName).toBeUndefined();
  });

  it("clamps negative offset to 0", () => {
    const entry: TubafrenzyEntry = {
      id: 103,
      chronOrderID: 5004,
      hour: RADIO_HOUR,
      timeCreated: RADIO_HOUR - 5000,
      entryType: "playcut",
      artistName: "Test",
      songTitle: "Song",
    };

    const result = mapTubafrenzyEntry(entry, RADIO_HOUR);
    expect(result.offsetSeconds).toBe(0);
  });

  it("defaults missing playcut fields to empty strings", () => {
    const entry: TubafrenzyEntry = {
      id: 104,
      chronOrderID: 5005,
      hour: RADIO_HOUR,
      timeCreated: RADIO_HOUR + 60000,
      entryType: "playcut",
    };

    const result = mapTubafrenzyEntry(entry, RADIO_HOUR);
    expect(result.artistName).toBe("");
    expect(result.songTitle).toBe("");
    expect(result.releaseTitle).toBe("");
    expect(result.labelName).toBe("");
    expect(result.rotation).toBe(false);
    expect(result.request).toBe(false);
  });
});

// Midnight ET epoch for test day
const DAY_START = 1711512000000;

describe("mapTubafrenzyDailyEntry", () => {
  it("computes dayOffsetSeconds, hour, and offsetSeconds for a playcut", () => {
    const entry: TubafrenzyDailyEntry = {
      id: 200,
      chronOrderID: 6001,
      hour: DAY_START + 7200000, // 2:00 AM radio hour
      timeCreated: DAY_START + 7320000, // 2 min into the 2 AM hour
      entryType: "playcut",
      radioShowId: 123,
      artistName: "Autechre",
      songTitle: "VI Scose Poise",
      releaseTitle: "Confield",
      labelName: "Warp",
      rotation: "false",
      request: "false",
    };

    const result = mapTubafrenzyDailyEntry(entry, DAY_START);

    expect(result.dayOffsetSeconds).toBe(7320); // 2h + 2min
    expect(result.hour).toBe(2);
    expect(result.offsetSeconds).toBe(120); // 2 min within hour
    expect(result.radioShowId).toBe(123);
    expect(result.artistName).toBe("Autechre");
    expect(result.rotation).toBe(false);
  });

  it("hour boundary: dayOffsetSeconds=3599 maps to hour=0, offsetSeconds=3599", () => {
    const entry: TubafrenzyDailyEntry = {
      id: 201,
      chronOrderID: 6002,
      hour: DAY_START,
      timeCreated: DAY_START + 3599000,
      entryType: "playcut",
      radioShowId: 1,
    };

    const result = mapTubafrenzyDailyEntry(entry, DAY_START);
    expect(result.dayOffsetSeconds).toBe(3599);
    expect(result.hour).toBe(0);
    expect(result.offsetSeconds).toBe(3599);
  });

  it("hour boundary: dayOffsetSeconds=3600 maps to hour=1, offsetSeconds=0", () => {
    const entry: TubafrenzyDailyEntry = {
      id: 202,
      chronOrderID: 6003,
      hour: DAY_START + 3600000,
      timeCreated: DAY_START + 3600000,
      entryType: "playcut",
      radioShowId: 1,
    };

    const result = mapTubafrenzyDailyEntry(entry, DAY_START);
    expect(result.dayOffsetSeconds).toBe(3600);
    expect(result.hour).toBe(1);
    expect(result.offsetSeconds).toBe(0);
  });

  it("clamps negative offset to 0", () => {
    const entry: TubafrenzyDailyEntry = {
      id: 203,
      chronOrderID: 6004,
      hour: DAY_START,
      timeCreated: DAY_START - 5000,
      entryType: "talkset",
      radioShowId: 1,
    };

    const result = mapTubafrenzyDailyEntry(entry, DAY_START);
    expect(result.dayOffsetSeconds).toBe(0);
    expect(result.hour).toBe(0);
    expect(result.offsetSeconds).toBe(0);
  });

  it("clamps to 86400 at day end", () => {
    const entry: TubafrenzyDailyEntry = {
      id: 204,
      chronOrderID: 6005,
      hour: DAY_START + 86400000,
      timeCreated: DAY_START + 90000000,
      entryType: "breakpoint",
      radioShowId: 1,
      label: "--- 1:00 AM BREAKPOINT ---",
    };

    const result = mapTubafrenzyDailyEntry(entry, DAY_START);
    expect(result.dayOffsetSeconds).toBe(86400);
    expect(result.label).toBe("--- 1:00 AM BREAKPOINT ---");
  });

  it("maps show delimiters with entryType preserved as breakpoint-compatible", () => {
    const entry: TubafrenzyDailyEntry = {
      id: 205,
      chronOrderID: 6006,
      hour: DAY_START,
      timeCreated: DAY_START + 100000,
      entryType: "showStart",
      radioShowId: 42,
    };

    const result = mapTubafrenzyDailyEntry(entry, DAY_START);
    expect(result.entryType).toBe("showStart");
    expect(result.radioShowId).toBe(42);
  });
});

describe("groupEntriesIntoShows", () => {
  const shows: TubafrenzyShow[] = [
    { id: 10, djHandle: "DJ Biscuit", showName: null, signonTime: DAY_START + 7200000, signoffTime: DAY_START + 14400000 },
    { id: 20, djHandle: "DJ Weird Fish", showName: "Friday Night Jazz", signonTime: DAY_START + 14400000, signoffTime: DAY_START + 21600000 },
  ];

  it("groups entries by radioShowId into correct show blocks", () => {
    const entries = [
      { id: 1, radioShowId: 10, dayOffsetSeconds: 7200, hour: 2, offsetSeconds: 0, entryType: "playcut" as const },
      { id: 2, radioShowId: 10, dayOffsetSeconds: 7500, hour: 2, offsetSeconds: 300, entryType: "playcut" as const },
      { id: 3, radioShowId: 20, dayOffsetSeconds: 14500, hour: 4, offsetSeconds: 100, entryType: "playcut" as const },
    ];

    const result = groupEntriesIntoShows(entries, shows);

    expect(result).toHaveLength(2);
    expect(result[0].showId).toBe(10);
    expect(result[0].djHandle).toBe("DJ Biscuit");
    expect(result[0].entries).toHaveLength(2);
    expect(result[1].showId).toBe(20);
    expect(result[1].showName).toBe("Friday Night Jazz");
    expect(result[1].entries).toHaveLength(1);
  });

  it("creates automation block for orphan entries", () => {
    const entries = [
      { id: 1, radioShowId: 10, dayOffsetSeconds: 7200, hour: 2, offsetSeconds: 0, entryType: "playcut" as const },
      { id: 2, radioShowId: 999, dayOffsetSeconds: 1000, hour: 0, offsetSeconds: 1000, entryType: "playcut" as const },
    ];

    const result = groupEntriesIntoShows(entries, shows);

    expect(result).toHaveLength(3); // 2 shows + 1 automation
    const automation = result.find((b) => b.showId === 0);
    expect(automation).toBeDefined();
    expect(automation!.djHandle).toBe("Automation");
    expect(automation!.entries).toHaveLength(1);
  });

  it("returns empty show blocks when no entries match", () => {
    const result = groupEntriesIntoShows([], shows);

    expect(result).toHaveLength(2);
    expect(result[0].entries).toHaveLength(0);
    expect(result[1].entries).toHaveLength(0);
  });
});
