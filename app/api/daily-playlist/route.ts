import { NextResponse } from "next/server";
import { computeRadioHourEpoch, nextCalendarDay } from "@/lib/utils";
import {
  type FlowsheetRangeResponse,
  type DailyPlaylistResponse,
  mapRangeEntry,
  groupEntriesIntoShows,
} from "@/lib/types/playlist";

/**
 * Backend-Service, which serves the public `GET /flowsheet/range`.
 *
 * Replaces `TUBAFRENZY_PROXY_URL` (`wxyc-proxy` -> tubafrenzy `/dailyEntries`),
 * which dies at the 2026-08-31 tubafrenzy cutover. This route was the last live
 * consumer of `wxyc-proxy`.
 */
const BACKEND_URL = process.env.BACKEND_URL || "https://api.wxyc.org";

/**
 * GET /api/daily-playlist?date=YYYY-MM-DD
 *
 * Fetches all flowsheet entries and show metadata for a full day from
 * Backend-Service, groups entries into show blocks, and returns structured
 * daily playlist data.
 *
 * The upstream window is half-open `[start, end)` in epoch **milliseconds**
 * against each entry's `add_time`, so adjacent days never double-count a row.
 * Both bounds are computed through `computeRadioHourEpoch`, which resolves
 * midnight in Eastern time: on the two DST-transition days a year the day is 23
 * or 25 hours long, and adding a fixed 86,400,000 to `start` would clip or
 * overrun it. Backend's ceiling is 8 days, so a single day is never at risk of
 * a 400 for window size.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");

  if (!date) {
    return NextResponse.json(
      { error: "Missing required parameter: date" },
      { status: 400 }
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "Invalid date format. Expected YYYY-MM-DD" },
      { status: 400 }
    );
  }

  const dayStartEpoch = computeRadioHourEpoch(date, 0);
  const dayEndEpoch = computeRadioHourEpoch(nextCalendarDay(date), 0);

  try {
    const response = await fetch(
      `${BACKEND_URL}/flowsheet/range?start=${dayStartEpoch}&end=${dayEndEpoch}`,
      { next: { revalidate: 60 } }
    );

    if (!response.ok) {
      console.error(
        `Backend returned ${response.status} for range ${dayStartEpoch}-${dayEndEpoch}`
      );
      return NextResponse.json(
        { error: "Failed to fetch daily playlist data" },
        { status: 502 }
      );
    }

    const raw: FlowsheetRangeResponse = await response.json();

    const entries = raw.entries.map((entry) =>
      mapRangeEntry(entry, dayStartEpoch, dayEndEpoch)
    );

    const shows = groupEntriesIntoShows(entries, raw.shows);

    const result: DailyPlaylistResponse = {
      shows,
      dayStartEpoch,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching daily playlist:", error);
    return NextResponse.json(
      { error: "Failed to fetch daily playlist data" },
      { status: 502 }
    );
  }
}
