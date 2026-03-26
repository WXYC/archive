import { NextResponse } from "next/server";
import { computeRadioHourEpoch } from "@/lib/utils";
import {
  type TubafrenzyEntry,
  type PlaylistResponse,
  mapTubafrenzyEntry,
} from "@/lib/types/playlist";

const TUBAFRENZY_PROXY_URL =
  process.env.TUBAFRENZY_PROXY_URL ||
  "https://wxyc-proxy-production.up.railway.app/playlists";

/**
 * GET /api/playlist?date=YYYY-MM-DD&hour=HH
 *
 * Fetches flowsheet entries for a specific date and hour from tubafrenzy,
 * computes playhead offsets, and returns structured playlist data.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const hourStr = searchParams.get("hour");

  if (!date || !hourStr) {
    return NextResponse.json(
      { error: "Missing required parameters: date and hour" },
      { status: 400 }
    );
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "Invalid date format. Expected YYYY-MM-DD" },
      { status: 400 }
    );
  }

  const hour = parseInt(hourStr, 10);
  if (isNaN(hour) || hour < 0 || hour > 23) {
    return NextResponse.json(
      { error: "Invalid hour. Expected 0-23" },
      { status: 400 }
    );
  }

  // Compute the radioHour epoch ms in Eastern timezone
  const radioHourEpoch = computeRadioHourEpoch(date, hour);

  try {
    const response = await fetch(
      `${TUBAFRENZY_PROXY_URL}/hourlyEntries?radioHour=${radioHourEpoch}`,
      { next: { revalidate: 60 } }
    );

    if (!response.ok) {
      console.error(
        `Tubafrenzy returned ${response.status} for radioHour=${radioHourEpoch}`
      );
      return NextResponse.json(
        { error: "Failed to fetch playlist data" },
        { status: 502 }
      );
    }

    const rawEntries: TubafrenzyEntry[] = await response.json();

    const entries = rawEntries.map((entry) =>
      mapTubafrenzyEntry(entry, radioHourEpoch)
    );

    const result: PlaylistResponse = {
      entries,
      radioHourEpoch,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching playlist:", error);
    return NextResponse.json(
      { error: "Failed to fetch playlist data" },
      { status: 502 }
    );
  }
}
