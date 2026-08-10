import { describe, it, expect } from "vitest";
import {
  mapRangeEntry,
  groupEntriesIntoShows,
  UNATTRIBUTED_DJ_LABEL,
  UNATTRIBUTED_SHOW_ID,
  UNKNOWN_DJ_LABEL,
  type DailyPlaylistEntry,
  type FlowsheetRangeEntry,
  type FlowsheetRangeShow,
} from "../playlist";

// Midnight ET on 2024-03-27 (a plain 24-hour day), and the following midnight.
const DAY_START = 1711512000000;
const DAY_END = DAY_START + 86_400_000;

/** ISO string for `dayStart + offsetMs`, the form Backend puts on the wire. */
const at = (offsetMs: number) => new Date(DAY_START + offsetMs).toISOString();

function rangeEntry(
  overrides: Partial<FlowsheetRangeEntry> = {}
): FlowsheetRangeEntry {
  return {
    id: 200,
    show_id: 123,
    play_order: 1,
    add_time: at(0),
    entry_type: "track",
    ...overrides,
  };
}

describe("mapRangeEntry", () => {
  it("computes dayOffsetSeconds, hour, and offsetSeconds for a track", () => {
    const result = mapRangeEntry(
      rangeEntry({
        add_time: at(7_320_000), // 2 min into the 2 AM hour
        artist_name: "Chuquimamani-Condori",
        track_title: "Call Your Name",
        album_title: "Edits",
        record_label: "self-released",
        rotation_bin: null,
        request_flag: false,
      }),
      DAY_START,
      DAY_END
    );

    expect(result.dayOffsetSeconds).toBe(7320); // 2h + 2min
    expect(result.hour).toBe(2);
    expect(result.offsetSeconds).toBe(120); // 2 min within hour
    expect(result.entryType).toBe("playcut");
    expect(result.showId).toBe(123);
    expect(result.artistName).toBe("Chuquimamani-Condori");
    expect(result.songTitle).toBe("Call Your Name");
    expect(result.releaseTitle).toBe("Edits");
    expect(result.labelName).toBe("self-released");
    expect(result.rotation).toBe(false);
    expect(result.request).toBe(false);
  });

  it.each([
    ["track", "playcut"],
    ["talkset", "talkset"],
    ["breakpoint", "breakpoint"],
    ["show_start", "showStart"],
    ["show_end", "showEnd"],
    // dj_join / dj_leave only occur when a guest DJ joins mid-set, so a single
    // sampled day can hold none while five sampled production weeks hold 25.
    // Omitting them produced entryType: undefined, which JSON.stringify then
    // dropped from the route's response entirely.
    ["dj_join", "djJoin"],
    ["dj_leave", "djLeave"],
    ["message", "message"],
  ] as const)(
    "translates Backend entry_type %s to %s",
    (wireType, appType) => {
      const result = mapRangeEntry(
        rangeEntry({ entry_type: wireType }),
        DAY_START,
        DAY_END
      );
      expect(result.entryType).toBe(appType);
    }
  );

  it("covers every entry_type api.yaml declares", () => {
    // Guard against the next enum member Backend adds: the failure mode is
    // silent (undefined), so the count is pinned rather than left implicit.
    const declared = [
      "track",
      "show_start",
      "show_end",
      "dj_join",
      "dj_leave",
      "talkset",
      "breakpoint",
      "message",
    ] as const;
    for (const wireType of declared) {
      const result = mapRangeEntry(
        rangeEntry({ entry_type: wireType }),
        DAY_START,
        DAY_END
      );
      expect(result.entryType).toBeTypeOf("string");
      expect(result.entryType).not.toBe("unknown");
    }
  });

  it("maps an entry_type this build has never heard of to 'unknown', not undefined", () => {
    const result = mapRangeEntry(
      // Backend can add an enum member before this app redeploys.
      rangeEntry({
        entry_type: "some_future_type" as FlowsheetRangeEntry["entry_type"],
      }),
      DAY_START,
      DAY_END
    );
    expect(result.entryType).toBe("unknown");
  });

  it("treats a rotation_bin letter as the rotation flag, and null as not-in-rotation", () => {
    // Backend reports the bin (H/M/L/S) where tubafrenzy reported "true"/"false".
    const inRotation = mapRangeEntry(
      rangeEntry({ rotation_bin: "H" }),
      DAY_START,
      DAY_END
    );
    const notInRotation = mapRangeEntry(
      rangeEntry({ rotation_bin: null }),
      DAY_START,
      DAY_END
    );
    const absent = mapRangeEntry(rangeEntry(), DAY_START, DAY_END);

    expect(inRotation.rotation).toBe(true);
    expect(notInRotation.rotation).toBe(false);
    expect(absent.rotation).toBe(false);
  });

  it("defaults missing track text to empty strings", () => {
    const result = mapRangeEntry(
      rangeEntry({
        artist_name: null,
        track_title: null,
        album_title: null,
        record_label: null,
      }),
      DAY_START,
      DAY_END
    );

    expect(result.artistName).toBe("");
    expect(result.songTitle).toBe("");
    expect(result.releaseTitle).toBe("");
    expect(result.labelName).toBe("");
  });

  it("maps a breakpoint's message onto label", () => {
    const result = mapRangeEntry(
      rangeEntry({
        entry_type: "breakpoint",
        message: "--- 1:00 AM BREAKPOINT ---",
      }),
      DAY_START,
      DAY_END
    );

    expect(result.entryType).toBe("breakpoint");
    expect(result.label).toBe("--- 1:00 AM BREAKPOINT ---");
  });

  it("hour boundary: dayOffsetSeconds=3599 maps to hour=0, offsetSeconds=3599", () => {
    const result = mapRangeEntry(
      rangeEntry({ add_time: at(3_599_000) }),
      DAY_START,
      DAY_END
    );
    expect(result.dayOffsetSeconds).toBe(3599);
    expect(result.hour).toBe(0);
    expect(result.offsetSeconds).toBe(3599);
  });

  it("hour boundary: dayOffsetSeconds=3600 maps to hour=1, offsetSeconds=0", () => {
    const result = mapRangeEntry(
      rangeEntry({ add_time: at(3_600_000) }),
      DAY_START,
      DAY_END
    );
    expect(result.dayOffsetSeconds).toBe(3600);
    expect(result.hour).toBe(1);
    expect(result.offsetSeconds).toBe(0);
  });

  it("clamps negative offset to 0", () => {
    const result = mapRangeEntry(
      rangeEntry({ entry_type: "talkset", add_time: at(-5000) }),
      DAY_START,
      DAY_END
    );
    expect(result.dayOffsetSeconds).toBe(0);
    expect(result.hour).toBe(0);
    expect(result.offsetSeconds).toBe(0);
  });

  it("clamps to the end of the day", () => {
    const result = mapRangeEntry(
      rangeEntry({ add_time: at(90_000_000) }),
      DAY_START,
      DAY_END
    );
    expect(result.dayOffsetSeconds).toBe(86_400);
  });

  it("clamps to 25 hours on a fall-back day, not to a hardcoded 24", () => {
    // The bug the dayEndEpoch parameter exists to prevent: a fixed 86,400-second
    // clamp folds the last hour of a 25-hour day onto midnight, stacking real
    // entries on top of each other at dayOffsetSeconds=86400.
    const fallBackEnd = DAY_START + 90_000_000; // 25 hours
    const result = mapRangeEntry(
      rangeEntry({ add_time: at(88_200_000) }), // 24.5 h in
      DAY_START,
      fallBackEnd
    );
    expect(result.dayOffsetSeconds).toBe(88_200);
  });

  it("never reports hour 24 on a fall-back day — there is no 2400 MP3", () => {
    // `hour` selects an S3 object (YYYYMMDDHH00.mp3). Letting the widened
    // dayEndEpoch clamp push it to 24 would build a key that does not exist,
    // so clicking any track in the 25th hour would 404 and kill playback.
    const fallBackEnd = DAY_START + 90_000_000; // 25 hours
    for (const offsetMs of [86_400_000, 88_200_000, 89_999_000]) {
      const result = mapRangeEntry(
        rangeEntry({ add_time: at(offsetMs) }),
        DAY_START,
        fallBackEnd
      );
      expect(result.hour).toBe(23);
      expect(result.offsetSeconds).toBeGreaterThanOrEqual(0);
      expect(result.offsetSeconds).toBeLessThanOrEqual(3600);
    }
  });

  it("keeps hour within the archive's 0-23 range for every instant in a day", () => {
    for (const dayLengthMs of [82_800_000, 86_400_000, 90_000_000]) {
      for (const offsetMs of [0, dayLengthMs / 2, dayLengthMs - 1, dayLengthMs]) {
        const result = mapRangeEntry(
          rangeEntry({ add_time: at(offsetMs) }),
          DAY_START,
          DAY_START + dayLengthMs
        );
        expect(result.hour).toBeGreaterThanOrEqual(0);
        expect(result.hour).toBeLessThanOrEqual(23);
      }
    }
  });

  it("carries a talkset's message through, not only a breakpoint's", () => {
    const result = mapRangeEntry(
      rangeEntry({ entry_type: "talkset", message: "TALKSET" }),
      DAY_START,
      DAY_END
    );
    expect(result.label).toBe("TALKSET");
  });

  it("preserves a null show_id rather than coercing it", () => {
    const result = mapRangeEntry(
      rangeEntry({ show_id: null }),
      DAY_START,
      DAY_END
    );
    expect(result.showId).toBeNull();
  });

  it("pins an unparseable add_time to the start of the day instead of NaN", () => {
    const result = mapRangeEntry(
      rangeEntry({ add_time: "not a timestamp" }),
      DAY_START,
      DAY_END
    );
    expect(result.dayOffsetSeconds).toBe(0);
    expect(result.hour).toBe(0);
    expect(result.offsetSeconds).toBe(0);
  });
});

describe("groupEntriesIntoShows", () => {
  const shows: FlowsheetRangeShow[] = [
    {
      id: 10,
      dj_name: "DJ Biscuit",
      show_name: null,
      specialty_id: null,
      start_time: at(7_200_000),
      end_time: at(14_400_000),
    },
    {
      id: 20,
      dj_name: "DJ Weird Fish",
      show_name: "Friday Night Jazz",
      specialty_id: 3,
      start_time: at(14_400_000),
      end_time: at(21_600_000),
    },
  ];

  function entry(overrides: Partial<DailyPlaylistEntry>): DailyPlaylistEntry {
    return {
      id: 1,
      showId: 10,
      dayOffsetSeconds: 7200,
      hour: 2,
      offsetSeconds: 0,
      entryType: "playcut",
      ...overrides,
    };
  }

  it("groups entries by showId into correct show blocks", () => {
    const result = groupEntriesIntoShows(
      [
        entry({ id: 1, showId: 10 }),
        entry({ id: 2, showId: 10, dayOffsetSeconds: 7500, offsetSeconds: 300 }),
        entry({ id: 3, showId: 20, dayOffsetSeconds: 14500, hour: 4 }),
      ],
      shows
    );

    expect(result).toHaveLength(2);
    expect(result[0].showId).toBe(10);
    expect(result[0].djHandle).toBe("DJ Biscuit");
    expect(result[0].signonTime).toBe(DAY_START + 7_200_000);
    expect(result[0].signoffTime).toBe(DAY_START + 14_400_000);
    expect(result[0].entries).toHaveLength(2);
    expect(result[1].showId).toBe(20);
    expect(result[1].showName).toBe("Friday Night Jazz");
    expect(result[1].entries).toHaveLength(1);
  });

  it("routes a null showId to the unattributed block instead of dropping it", () => {
    // 20 of 2,619,011 production rows carry show_id: null and will never be
    // backfilled. Dropping them would silently lose playable entries.
    const result = groupEntriesIntoShows(
      [entry({ id: 1, showId: 10 }), entry({ id: 2, showId: null })],
      shows
    );

    expect(result).toHaveLength(3); // 2 shows + unattributed
    const unattributed = result.find((b) => b.showId === UNATTRIBUTED_SHOW_ID);
    expect(unattributed).toBeDefined();
    expect(unattributed!.djHandle).toBe(UNATTRIBUTED_DJ_LABEL);
    expect(unattributed!.entries.map((e) => e.id)).toEqual([2]);
  });

  it("routes an entry whose show is absent from the window to the same block", () => {
    // `GET /flowsheet/range` selects shows by overlap and does not treat a null
    // end_time as open-ended, so a show that started before the window and never
    // signed off is excluded while its entries are not.
    const result = groupEntriesIntoShows(
      [entry({ id: 1, showId: 10 }), entry({ id: 2, showId: 999 })],
      shows
    );

    const unattributed = result.find((b) => b.showId === UNATTRIBUTED_SHOW_ID);
    expect(unattributed!.entries.map((e) => e.id)).toEqual([2]);
  });

  it("renders a show with no sign-off as signoffTime 0, the panel's 'unknown' sentinel", () => {
    const result = groupEntriesIntoShows(
      [],
      [{ ...shows[0], end_time: null }]
    );

    expect(result[0].signonTime).toBe(DAY_START + 7_200_000);
    expect(result[0].signoffTime).toBe(0);
  });

  it("labels a show with no dj_name distinctly from the unattributed block", () => {
    // dj_name is nullable by contract. "This show's DJ did not resolve" and
    // "these rows belong to no show" are different facts, and the panel now
    // renders djHandle uniformly, so one word for both would erase the
    // distinction on screen.
    const result = groupEntriesIntoShows(
      [entry({ id: 1, showId: 10 }), entry({ id: 2, showId: null })],
      [{ ...shows[0], dj_name: null }]
    );

    expect(result[0].djHandle).toBe(UNKNOWN_DJ_LABEL);
    expect(result[1].djHandle).toBe(UNATTRIBUTED_DJ_LABEL);
    expect(UNKNOWN_DJ_LABEL).not.toBe(UNATTRIBUTED_DJ_LABEL);
  });

  it("reports signonTime 0, never NaN, for a malformed start_time", () => {
    // ShowBlock documents both bounds as "epoch ms, or 0 when unknown". NaN
    // satisfies neither, leaving a consumer no sentinel to test against.
    const result = groupEntriesIntoShows(
      [],
      [{ ...shows[0], start_time: "not a timestamp", end_time: null }]
    );

    expect(result[0].signonTime).toBe(0);
    expect(result[0].signoffTime).toBe(0);
  });

  it("returns empty show blocks when no entries match", () => {
    const result = groupEntriesIntoShows([], shows);

    expect(result).toHaveLength(2);
    expect(result[0].entries).toHaveLength(0);
    expect(result[1].entries).toHaveLength(0);
  });
});
