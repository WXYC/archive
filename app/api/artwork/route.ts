import { NextResponse } from "next/server";

const LIBRARY_METADATA_URL =
  process.env.LIBRARY_METADATA_URL ||
  "https://library-metadata-lookup-production.up.railway.app/api/v1";

/**
 * Metadata returned from the artwork lookup, combining library catalog data
 * and Discogs match data from library-metadata-lookup.
 */
export interface ArtworkResponse {
  artworkUrl: string | null;
  genre: string | null;
  format: string | null;
  callNumber: string | null;
  libraryUrl: string | null;
  discogsUrl: string | null;
}

/**
 * POST /api/artwork
 *
 * Looks up album artwork and metadata from library-metadata-lookup.
 * Request body: { artist: string, album: string }
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { artist, album } = body;

  if (!artist && !album) {
    return NextResponse.json(
      { error: "At least one of artist or album is required" },
      { status: 400 }
    );
  }

  try {
    const lookupResponse = await fetch(`${LIBRARY_METADATA_URL}/lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artist: artist || undefined,
        album: album || undefined,
        raw_message: `${artist || ""} - ${album || ""}`.trim(),
      }),
      next: { revalidate: 3600 },
    });

    if (!lookupResponse.ok) {
      console.error(
        `library-metadata-lookup returned ${lookupResponse.status}`
      );
      return NextResponse.json(
        { artworkUrl: null, genre: null, format: null, callNumber: null, libraryUrl: null, discogsUrl: null } satisfies ArtworkResponse,
      );
    }

    const data = await lookupResponse.json();
    const result = data.results?.[0];

    const response: ArtworkResponse = {
      artworkUrl: result?.artwork?.artwork_url ?? null,
      genre: result?.library_item?.genre ?? null,
      format: result?.library_item?.format ?? null,
      callNumber: result?.library_item?.call_number ?? null,
      libraryUrl: result?.library_item?.library_url ?? null,
      discogsUrl: result?.artwork?.release_url ?? null,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching artwork:", error);
    return NextResponse.json(
      { artworkUrl: null, genre: null, format: null, callNumber: null, libraryUrl: null, discogsUrl: null } satisfies ArtworkResponse,
    );
  }
}
