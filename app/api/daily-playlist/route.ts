import { NextResponse } from "next/server";
import { computeRadioHourEpoch } from "@/lib/utils";
import {
  type TubafrenzyDailyResponse,
  type DailyPlaylistResponse,
  mapTubafrenzyDailyEntry,
  groupEntriesIntoShows,
} from "@/lib/types/playlist";

const TUBAFRENZY_PROXY_URL =
  process.env.TUBAFRENZY_PROXY_URL ||
  "https://wxyc-proxy-production.up.railway.app/playlists";

/**
 * GET /api/daily-playlist?date=YYYY-MM-DD
 *
 * Fetches all flowsheet entries and show metadata for a full day from tubafrenzy,
 * groups entries into show blocks, and returns structured daily playlist data.
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

  try {
    const response = await fetch(
      `${TUBAFRENZY_PROXY_URL}/dailyEntries?dayStart=${dayStartEpoch}`,
      { next: { revalidate: 60 } }
    );

    if (!response.ok) {
      console.error(
        `Tubafrenzy returned ${response.status} for dayStart=${dayStartEpoch}`
      );
      return NextResponse.json(
        { error: "Failed to fetch daily playlist data" },
        { status: 502 }
      );
    }

    const raw: TubafrenzyDailyResponse = await response.json();

    const entries = raw.entries.map((entry) =>
      mapTubafrenzyDailyEntry(entry, dayStartEpoch)
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
