import { describe, it, expect } from "vitest";
import {
  mapTubafrenzyEntry,
  type TubafrenzyEntry,
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
